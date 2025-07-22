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
window.IniciarDoZero = async function(id, type, urlDados, contasJson, classesJson, projetosJson) {
    console.log("Iniciando do zero...");
    const dataAtualizacao = await obterDataAtualizacaoArquivo(urlDados);
    
    // Recria o objeto appCache limpo
    appCache = {
        userId: null, userType: null, dataAtualizacao: null, lancamentos: null,
        categoriasMap: new Map(), fornecedoresMap: new Map(), classesMap: new Map(),
        projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
        anosDisponiveis: []
    };

    // 1. Carrega dados externos
    const dadosOMIE = await buscarDadosOMIE(urlDados);
    appCache.lancamentos = dadosOMIE.lancamentos;
    dadosOMIE.fornecedores.forEach(f => appCache.fornecedoresMap.set(f.codigo, f.nome));
    dadosOMIE.departamentos.forEach(d => appCache.departamentosMap.set(d.codigo, d.descricao));
    dadosOMIE.categorias.forEach(c => appCache.categoriasMap.set(c.codigo, c.descricao));
    
    // 2. Processa dados do Bubble
    const classes = JSON.parse(classesJson);
    classes.forEach(c => appCache.classesMap.set(c.codigo, c.descricao));
    const projetos = JSON.parse(projetosJson);
    projetos.forEach(p => appCache.projetosMap.set(p.codProj, { nome: p.nomeProj, contas: p.contas.map(String) }));
    const contas = JSON.parse(contasJson);
    contas.forEach(c => appCache.contasMap.set(String(c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));
    
    // 3. Calcula dados derivados
    const anos = new Set(appCache.lancamentos.map(l => l.DataLancamento.split('/')[2]));
    appCache.anosDisponiveis = Array.from(anos).sort();

    // 4. Prepara e salva o cache PARCIAL
    appCache.userId = id;
    appCache.userType = type;
    appCache.dataAtualizacao = dataAtualizacao;
    
    // --- ALTERAÇÃO ---
    // Cria uma cópia do appCache para remover os lançamentos antes de salvar
    const cacheParaSalvar = { ...appCache };
    delete cacheParaSalvar.lancamentos;
    delete cacheParaSalvar.anosDisponiveis;
    
    localStorage.setItem(`appCache_${id}`, JSON.stringify(cacheParaSalvar, replacer));
    console.log("Cache parcial (sem lançamentos) salvo com sucesso.");

    // 5. Configura a UI
    configurarFiltros(appCache, () => atualizarVisualizacoes(appCache, filtrarContasESaldo, processarLancamentos, calcularTotaisDRE));
};