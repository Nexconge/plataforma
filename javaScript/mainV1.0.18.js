// main.js - MODIFICADO

// --- Importa as funções de cada módulo especializado ---
import { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE } from './processingV1.js';
import { configurarFiltros, atualizarVisualizacoes } from './ui.js';

// --- O cache em memória e as funções de serialização ---
let appCache = {
    userId: null, userType: null, lancamentos: null,
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
 * [PRIMEIRA CHAMADA] MODIFICADO: Com os dados vindo do Bubble, a verificação de arquivo foi desativada.
 * A aplicação sempre fará o carregamento completo dos dados via IniciarDoZero.
 */
window.TentarCache = async function(id) {
    console.log("Verificação de cache desativada para o modo de banco de dados. Forçando carregamento completo.");
    window.bubble_fn_cache("invalido"); // Sempre invalida o cache para forçar a chamada de IniciarDoZero
};

/**
 * [NÃO MAIS UTILIZADO] Esta função dependia da verificação de cache por arquivo, que foi desativada.
 * O fluxo agora sempre seguirá por IniciarDoZero.
 */
window.IniciarComCache = async function() {
    console.warn("A função IniciarComCache não é mais suportada neste modo de operação.");
    // Recomenda-se remover a chamada a esta função no workflow do Bubble.
};


/**
 * [CHAMADO PELO WORKFLOW LENTO] - MODIFICADO
 * Agora recebe os lançamentos diretamente do Bubble.
 * Assinatura: async function(lancamentos, id, type, contasJson, classesJson, projetosJson)
 */
/**
 * [CHAMADO PELO WORKFLOW LENTO] - CORRIGIDO
 * Adicionada verificação para projetos sem contas associadas.
 */
window.IniciarDoZero = async function(lancamentos, id, type, contasJson, classesJson, projetosJson) {
    console.log("Iniciando do zero com dados do banco de dados Bubble...");
    console.log(lancamentos);
    
    // Recria o objeto appCache limpo
    appCache = {
        userId: null, userType: null, lancamentos: null,
        categoriasMap: new Map(), fornecedoresMap: new Map(), classesMap: new Map(),
        projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
        anosDisponiveis: []
    };

    // 1. Recebe os lançamentos e converte o texto JSON em um objeto JavaScript
    appCache.lancamentos = JSON.parse(lancamentos);
    
    // 2. Popula os maps de categorias, fornecedores e departamentos a partir dos lançamentos
    console.log("Populando maps de suporte a partir dos lançamentos...");
    appCache.lancamentos.forEach(l => {
        if (l.CODCategoria) {
            appCache.categoriasMap.set(l.CODCategoria, l.CODCategoria);
        }
        if (l.CODCliente) {
            appCache.fornecedoresMap.set(l.CODCliente, `Fornecedor ${l.CODCliente}`);
        }
        if (l.Departamentos && typeof l.Departamentos === 'string') {
            l.Departamentos.split(',').forEach(pair => {
                const [codigo, valor] = pair.split(':');
                const codigoNum = Number(codigo);
                const deptoDesc = codigoNum === 0 ? 'Não especificado' : valor;
                appCache.departamentosMap.set(codigoNum, deptoDesc);
            });
        }

    });

    // 3. Processa dados do Bubble (JSONs)
    const classes = JSON.parse(classesJson);
    const projetos = JSON.parse(projetosJson);
    const contas = JSON.parse(contasJson);
    
    classes.forEach(c => appCache.classesMap.set(c.codigo, c.descricao));

    // --- CORREÇÃO APLICADA AQUI ---
    // Garante que p.contas seja um array antes de usar .map(), evitando erro em projetos sem contas.
    projetos.forEach(p => appCache.projetosMap.set(p.codProj, { nome: p.nomeProj, contas: (p.contas || []).map(String) }));
    
    contas.forEach(c => appCache.contasMap.set(String(c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));
    
    // 4. Calcula dados derivados
    const anos = new Set(appCache.lancamentos.map(l => l.DataLancamento.split('/')[2]));
    appCache.anosDisponiveis = Array.from(anos).sort();

    // 5. Prepara e salva o cache PARCIAL
    appCache.userId = id;
    appCache.userType = type;
    
    const cacheParaSalvar = { ...appCache };
    delete cacheParaSalvar.lancamentos;
    delete cacheParaSalvar.anosDisponiveis;
    
    localStorage.setItem(`appCache_${id}`, JSON.stringify(cacheParaSalvar, replacer));
    console.log("Cache parcial (sem lançamentos e dados derivados) salvo com sucesso.");

    // 6. Configura a UI
    configurarFiltros(appCache, () => atualizarVisualizacoes(appCache, filtrarContasESaldo, processarLancamentos, calcularTotaisDRE));
};