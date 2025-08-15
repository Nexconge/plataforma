// main.js - MODIFICADO

// --- Importa as funções de cada módulo especializado ---
import { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE } from './processingV4.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosSelecionados } from './uiV5.js';

// --- O cache em memória e as funções de serialização ---
let appCache = {
    userId: null, userType: null, lancamentos: null,
    categoriasMap: new Map(), classesMap: new Map(),
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

/**
 * Função central que é chamada sempre que um filtro é alterado.
 */
async function handleFiltroChange() {
    // Adicionar feedback visual para o usuário (ex: mostrar um spinner de loading)
    document.body.classList.add('loading'); 

    // 1. Obter os filtros atuais da UI
    const filtros = obterFiltrosSelecionados();

    if (filtros && filtros.anos.length > 0) {
        // 2. Chamar a API para buscar os novos lançamentos
        const novosLancamentos = await buscarLancamentos(filtros);

        // 3. Atualizar o cache com os dados retornados
        appCache.lancamentos = novosLancamentos;

        // 4. Chamar a função que renderiza as tabelas com os novos dados
        atualizarVisualizacoes(appCache, filtrarContasESaldo, processarLancamentos, calcularTotaisDRE);
    } else {
        // Se não houver anos para buscar, limpa as tabelas (ou mostra uma mensagem)
        appCache.lancamentos = [];
        atualizarVisualizacoes(appCache, filtrarContasESaldo, processarLancamentos, calcularTotaisDRE);
        console.log("Nenhum período selecionado para buscar dados.");
    }
    
    // Remover o feedback visual
    document.body.classList.remove('loading');
}

window.IniciarDoZero = async function(deptosJson,id,type,contasJson,classesJson,projetosJson) {
    appCache = {
        ...appCache,
        userId: null, userType: null, lancamentos: [], // Garante que começa vazio
        categoriasMap: new Map(), classesMap: new Map(),
        projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
        anosDisponiveis: []
    };

    // ... (código de parsing dos JSONs e população dos mapas) ...
    const classes = JSON.parse(classesJson);
    const projetos = JSON.parse(projetosJson);
    const contas = JSON.parse(contasJson);
    const departamentos = JSON.parse(deptosJson);

    classes.forEach(c => {
        appCache.classesMap.set(c.codigo, { classe: c.Classe, categoria: c.Categoria });
        appCache.categoriasMap.set(c.codigo, c.Categoria);
    });
    projetos.forEach(p => appCache.projetosMap.set(p.codProj, { nome: p.nomeProj, contas: (p.contas || []).map(String) }));
    contas.forEach(c => appCache.contasMap.set(String(c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));
    departamentos.forEach(d => appCache.departamentosMap.set(d.codigo, d.descricao));

    const anoAtual = new Date().getFullYear();
    appCache.anosDisponiveis = [];
    for (let ano = 2020; ano <= anoAtual; ano++) {
        appCache.anosDisponiveis.push(String(ano));
    }
    appCache.anosDisponiveis.sort();

    appCache.userId = id;
    appCache.userType = type;

    // --- ALTERAÇÃO PRINCIPAL ---
    configurarFiltros(appCache, handleFiltroChange);
};