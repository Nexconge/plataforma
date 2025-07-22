// main.js

// --- CORREÇÃO ---
// Importa TODAS as funções necessárias dos outros módulos.
import { buscarDadosOMIE, obterDataAtualizacaoArquivo } from './api.js';
import { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE } from './processing.js';
import { configurarFiltros, atualizarVisualizacoes } from './ui.js';

// O cache e as funções de serialização vivem aqui, no módulo principal.
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
        const cachedData = JSON.parse(cacheString, reviver);
        if (cachedData.userId === id && cachedData.dataAtualizacao === dataAtualizacao) {
            console.log("Cache válido. Acionando fluxo rápido.");
            appCache = cachedData; // Carrega o cache na memória
            window.bubble_fn_cache("valido");
            return;
        }
    }
    console.log("Cache inválido ou inexistente. Acionando fluxo lento.");
    window.bubble_fn_cache("invalido");
};

window.IniciarComCache = function() {
    console.log("Iniciando com dados do cache...");
    configurarFiltros(appCache, () => atualizarVisualizacoes(appCache, filtrarContasESaldo, processarLancamentos, calcularTotaisDRE));
};

window.IniciarDoZero = async function(id, type, urlDados, contasJson, classesJson, projetosJson) {
    console.log("Iniciando do zero...");
    const dataAtualizacao = await obterDataAtualizacaoArquivo(urlDados);
    
    // --- CORREÇÃO ---
    // Limpa e recria completamente o objeto appCache para evitar dados antigos.
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
    
    // --- CORREÇÃO ---
    // Processa os dados do Bubble que estavam faltando.
    const classes = JSON.parse(classesJson);
    classes.forEach(c => appCache.classesMap.set(c.codigo, c.descricao));

    const projetos = JSON.parse(projetosJson);
    projetos.forEach(p => appCache.projetosMap.set(p.codProj, { nome: p.nomeProj, contas: p.contas.map(String) }));

    const contas = JSON.parse(contasJson);
    contas.forEach(c => appCache.contasMap.set(String(c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));

    // 3. Calcula dados derivados
    const anos = new Set(appCache.lancamentos.map(l => l.DataLancamento.split('/')[2]));
    appCache.anosDisponiveis = Array.from(anos).sort();

    // 4. Salva no cache
    appCache.userId = id;
    appCache.userType = type;
    appCache.dataAtualizacao = dataAtualizacao;
    localStorage.setItem(`appCache_${id}`, JSON.stringify(appCache, replacer));
    console.log("Novos dados salvos no cache.");

    // 5. Configura a UI
    configurarFiltros(appCache, () => atualizarVisualizacoes(appCache, filtrarContasESaldo, processarLancamentos, calcularTotaisDRE));
};