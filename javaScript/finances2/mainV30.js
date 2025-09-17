// main.js - MODIFICADO

// --- Importa as funções de cada módulo especializado ---
import { buscarDadosOMIE, obterDataAtualizacaoArquivo, buscarLancamentos } from './apiV20.js';
import { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE } from './processingV13.js';
import { configurarFiltros, atualizarVisualizacoes, obterContasSelecionadas } from './uiV22.js';

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

    //Obter as contas seleiconadas para buscar os lançamentos
    const contasSelecionadas = obterContasSelecionadas();
    //Inicia um array de lançamentos vazio
    let lancamentosArray = [];

    //Se existirem contas selecionadas
    if (contasSelecionadas && contasSelecionadas.length > 0 ){
        // Filtra as contas que já estão no cache das que precisam ser buscadas
        const contasParaBuscar = contasSelecionadas.filter(c => !appCache.lancamentosPorConta.has(String(c)));


        // 1. Busca somente as contas faltantes
        if (contasParaBuscar.length > 0) {
        
            //cria o slot da conta no cache antes de chamar a API
            //para evitar chamadas duplicadas
            contasParaBuscar.forEach(c => {
                const cod = String(c);
                if (!appCache.lancamentosPorConta.has(cod)) {
                    appCache.lancamentosPorConta.set(cod, []); 
                }
            });

            // Chama a API para buscar os lançamentos faltantes
            const promises = contasParaBuscar.map(conta => {
                const filtrosAPI = { 
                    contas: [conta] // Envia somente a conta, sem os anos
                };
                return buscarLancamentos(filtrosAPI);
            });
            const allResponses = await Promise.all(promises);

            allResponses.forEach(apiResponse => {
                if (apiResponse && apiResponse.response && typeof apiResponse.response.movimentos === 'string') {
                    try {
                        const lancamentosNovos = JSON.parse(`[${apiResponse.response.movimentos}]`);
                        console.log("Lançamentos novos recebidos:", lancamentosNovos);
                        lancamentosNovos.forEach(l => {
                            const cod = String(l.CODContaC);
                            if (appCache.lancamentosPorConta.has(cod)) {
                                const lista = appCache.lancamentosPorConta.get(cod);
                                lista.push(l);
                            }
                        });
                    } catch (error) {
                        console.error("Erro ao parsear lançamentos:", error);
                    }
                }
            });
        }

        // 2. Monta o array final combinando cache + novas
        contasSelecionadas.forEach(c => {
            const lista = appCache.lancamentosPorConta.get(String(c)) || [];
            lancamentosArray.push(...lista);
        });
    } else {
        console.log("Nenhuma conta selecionada para buscar dados.");
    }

    //Atualiza cache global
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