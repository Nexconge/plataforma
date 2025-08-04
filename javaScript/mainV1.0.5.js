// main.js

// --- Importa as funções de cada módulo especializado ---
import { buscarDadosOMIE, obterDataAtualizacaoArquivo } from './api.js';
import { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE } from './processing.js';
import { configurarFiltros, atualizarVisualizacoes } from './ui.js';

// --- O cache em memória e as funções de serialização ---
let appCache = {
    userId: null, userType: null, dataAtualizacao: null, lancamentos: null,
    categoriasMap: new Map(), fornecedoresMap: new Map(), classesMap: new Map(),
    projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
    anosDisponiveis: []
};

function replacer(key, value) {
    if (value instanceof Map) return { dataType: 'Map', value: Array.from(value.entries()) };
    return value;
}

function reviver(key, value) {
    if (typeof value === 'object' && value !== null && value.dataType === 'Map') {
        return new Map(value.value);
    }
    return value;
}

// =======================================================
// PONTOS DE ENTRADA PARA O BUBBLE
// =======================================================

/**
 * [PRIMEIRA CHAMADA] Apenas verifica os metadados do cache.
 */
window.TentarCache = async function(id, urlDados) {
    console.log("Verificando cache...");
    const dataAtualizacao = await obterDataAtualizacaoArquivo(urlDados);
    if (!dataAtualizacao) {
        console.log("Não foi possível obter a data de atualização. Forçando carregamento.");
        window.bubble_fn_cache("invalido");
        return;
    }

    const cacheString = localStorage.getItem(`appCache_${id}`);
    if (cacheString) {
        // --- ALTERAÇÃO ---
        // Apenas verifica os metadados, não carrega o cache inteiro na memória ainda.
        const cachedMetaData = JSON.parse(cacheString, reviver);
        if (cachedMetaData.userId === id && cachedMetaData.dataAtualizacao === dataAtualizacao) {
            console.log("Cache válido. Acionando fluxo rápido.");
            window.bubble_fn_cache("valido");
            return;
        }
    }
    console.log("Cache inválido ou inexistente. Acionando fluxo lento.");
    window.bubble_fn_cache("invalido");
};

/**
 * [CHAMADO PELO WORKFLOW RÁPIDO]
 */
window.IniciarComCache = async function(id, urlDados) {
    console.log("Iniciando com dados do cache...");
    try {
        // 1. Carrega o cache PARCIAL (sem os lançamentos) do localStorage
        const cacheString = localStorage.getItem(`appCache_${id}`);
        appCache = JSON.parse(cacheString, reviver);

        // --- ALTERAÇÃO ---
        // 2. Busca os dados de lançamentos que não estavam no cache
        console.log("Buscando apenas os lançamentos...");
        const dadosOMIE = await buscarDadosOMIE(urlDados);
        appCache.lancamentos = dadosOMIE.lancamentos;
        // É uma boa prática recarregar estes também, caso o arquivo OMIE tenha sido atualizado
        dadosOMIE.fornecedores.forEach(f => appCache.fornecedoresMap.set(f.codigo, f.nome));
        dadosOMIE.departamentos.forEach(d => appCache.departamentosMap.set(d.codigo, d.descricao));
        dadosOMIE.categorias.forEach(c => appCache.categoriasMap.set(c.codigo, c.descricao));

        // 3. Recalcula os anos disponíveis com base nos lançamentos recém-buscados
        const anos = new Set(appCache.lancamentos.map(l => l.DataLancamento.split('/')[2]));
        appCache.anosDisponiveis = Array.from(anos).sort();

        // 4. Configura a UI com o appCache agora completo
        configurarFiltros(appCache, () => atualizarVisualizacoes(appCache, filtrarContasESaldo, processarLancamentos, calcularTotaisDRE));
    } catch (error) {
        console.error("Erro ao iniciar com cache:", error);
    }
};

/**
 * [CHAMADO PELO WORKFLOW LENTO]
 */
window.IniciarDoZero = async function(lancamentos, id, type, contasJson, classesJson, projetosJson) {
    console.log("Iniciando do zero com dados do Bubble...");

    // 1. Inicializa o cache
    let appCache = {
        userId: id,
        userType: type,
        dataAtualizacao: new Date().toISOString(),
        lancamentos: lancamentos || [],
        categoriasMap: new Map(),
        fornecedoresMap: new Map(),
        classesMap: new Map(),
        projetosMap: new Map(),
        contasMap: new Map(),
        departamentosMap: new Map(),
        anosDisponiveis: []
    };

    try {
        // 2. Processa dados auxiliares (passados como JSON pelo Bubble)
        // A adição de '|| "[]"' torna o código seguro caso o Bubble envie um valor vazio.
        const classes = JSON.parse(classesJson || '[]');
        classes.forEach(c => appCache.classesMap.set(c.codigo, c.descricao));

        const contas = JSON.parse(contasJson || '[]');
        contas.forEach(c => appCache.contasMap.set(String(c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));

        const projetos = JSON.parse(projetosJson || '[]');
        projetos.forEach(p => {
            // CORREÇÃO DE SEGURANÇA (MANTIDA): Evita erro se um projeto não tiver contas.
            const contasDoProjeto = Array.isArray(p.contas) ? p.contas.map(String) : [];
            appCache.projetosMap.set(p.codProj, { nome: p.nomeProj, contas: contasDoProjeto });
        });

        // 3. Processa o array principal de Lançamentos
        const anos = new Set();
        appCache.lancamentos.forEach(l => {
            // Calcula anos disponíveis
            const ano = l.DataLancamento.split('/')[2];
            if (ano) anos.add(ano);

            // --- LÓGICA DE CONSISTÊNCIA (REINTRODUZIDA) ---
            // Popula os Maps a partir dos dados encontrados nos próprios lançamentos.
            // Isso garante que os maps não fiquem vazios, mantendo a consistência com a lógica antiga.
            if (l.CODCategoria && !appCache.categoriasMap.has(l.CODCategoria)) {
                appCache.categoriasMap.set(l.CODCategoria, `Categoria ${l.CODCategoria}`); // Usamos o próprio código como fallback
            }
            if (l.CODCliente && !appCache.fornecedoresMap.has(l.CODCliente)) {
                appCache.fornecedoresMap.set(l.CODCliente, `Fornecedor ${l.CODCliente}`); // Usamos o próprio código como fallback
            }
            if (l.Departamentos && Array.isArray(l.Departamentos)) {
                l.Departamentos.forEach(d => {
                    if (d.CODDepto && !appCache.departamentosMap.has(d.CODDepto)) {
                        appCache.departamentosMap.set(d.CODDepto, `Depto ${d.CODDepto}`); // Usamos o próprio código como fallback
                    }
                });
            }
        });
        appCache.anosDisponiveis = Array.from(anos).sort();

        // 4. Salva o cache parcial no localStorage (lógica mantida)
        const cacheParaSalvar = { ...appCache };
        delete cacheParaSalvar.lancamentos;
        delete cacheParaSalvar.anosDisponiveis;

        localStorage.setItem(`appCache_${id}`, JSON.stringify(cacheParaSalvar, (key, value) => {
            if (value instanceof Map) {
                return { __dataType: 'Map', value: Array.from(value.entries()) };
            }
            return value;
        }));
        console.log("Cache parcial (sem lançamentos) salvo com sucesso.");

        // 5. Configura a UI (lógica mantida)
        configurarFiltros(appCache, () => atualizarVisualizacoes(appCache, filtrarContasESaldo, processarLancamentos, calcularTotaisDRE));

    } catch (e) {
        console.error("Erro crítico durante a inicialização:", e);
    }
};
