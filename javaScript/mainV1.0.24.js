// main.js - MODIFICADO

// --- Importa as funções de cada módulo especializado ---
import { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE } from './processingV4.js';
import { configurarFiltros, atualizarVisualizacoes } from './uiV1.js';

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

window.IniciarDoZero = async function(lancamentos,departamentos,id,type,contasJson,classesJson,projetosJson) {
    // Recria o objeto appCache limpo
    appCache = {
        userId: null, userType: null, lancamentos: null,
        categoriasMap: new Map(), classesMap: new Map(),
        projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
        anosDisponiveis: []
    };

    // 1. Recebe os dados do bubble e converte em um objeto JavaScript
    appCache.lancamentos = JSON.parse(lancamentos);
    const classes = JSON.parse(classesJson);
    const projetos = JSON.parse(projetosJson);
    const contas = JSON.parse(contasJson);
    const departamentos = JSON.parse(departamentosJson);

    //Popula os mapas de dados
    classes.forEach(c => {
        appCache.classesMap.set(c.codigo, { classe: c.Classe, categoria: c.Categoria });
        appCache.categoriasMap.set(c.codigo, c.Categoria); // <-- ADICIONADO AQUI
    });
    projetos.forEach(p => appCache.projetosMap.set(p.codProj, { nome: p.nomeProj, contas: (p.contas || []).map(String) }));
    contas.forEach(c => appCache.contasMap.set(String(c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));
    departamentos.forEach(d => appCache.departamentosMap.set(d.codigo, d.descricao));

    //verifica anos disponiveis
    const anos = new Set(appCache.lancamentos.map(l => l.DataLancamento.split('/')[2]));
    appCache.anosDisponiveis = Array.from(anos).sort();

    //Configura a interfaçe e filtros e inicia as tabelas
    appCache.userId = id;
    appCache.userType = type;
    configurarFiltros(appCache, () => atualizarVisualizacoes(appCache, filtrarContasESaldo, processarLancamentos, calcularTotaisDRE));
};