// main.js - MODIFICADO

// --- Importa as funções de cada módulo especializado ---
import { buscarDadosOMIE, obterDataAtualizacaoArquivo, buscarLancamentos } from './apiV13.js';
import { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE } from './processingV7.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosSelecionados } from './uiV8.js';

// --- O cache em memória e as funções de serialização ---
let appCache = {
    userId: null, userType: null,
    lancamentos: [], // todos combinados
    lancamentosPorConta: new Map(), // <--- NOVO
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
    document.body.classList.add('loading');
    const filtros = obterFiltrosSelecionados();

    let lancamentosArray = [];

    if (filtros && filtros.anos.length > 0 && filtros.contas.length > 0) {
        // --- Separa as contas já no cache das que precisam ser buscadas
        const contasParaBuscar = filtros.contas.filter(c => !appCache.lancamentosPorConta.has(String(c)));
        const contasEmCache = filtros.contas.filter(c => appCache.lancamentosPorConta.has(String(c)));

        // 1. Busca somente as contas faltantes
        if (contasParaBuscar.length > 0) {
            const filtrosAPI = { ...filtros, contas: contasParaBuscar };
            const apiResponse = await buscarLancamentos(filtrosAPI);
            if (apiResponse && apiResponse.response && typeof apiResponse.response.lancamentos === 'string') {
                try {
                    const lancamentosNovos = JSON.parse(`[${apiResponse.response.lancamentos}]`);
                    // Distribui os lançamentos no cache por conta
                    lancamentosNovos.forEach(l => {
                        const cod = String(l.CODContaC);
                        if (!appCache.lancamentosPorConta.has(cod)) {
                            appCache.lancamentosPorConta.set(cod, []);
                        }
                        appCache.lancamentosPorConta.get(cod).push(l);
                    });
                } catch (error) {
                    console.error("Erro ao parsear lançamentos:", error);
                }
            }
        }

        // 2. Monta o array final combinando cache + novas
        filtros.contas.forEach(c => {
            const lista = appCache.lancamentosPorConta.get(String(c)) || [];
            lancamentosArray.push(...lista);
        });
    } else {
        console.log("Nenhum período ou conta selecionada para buscar dados.");
    }

    // Atualiza cache global
    appCache.lancamentos = lancamentosArray;

    atualizarVisualizacoes(appCache, filtrarContasESaldo, processarLancamentos, calcularTotaisDRE);
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