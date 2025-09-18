// main.js - MODIFICADO

// --- Importa as funções de cada módulo especializado ---
import { buscarDadosOMIE, obterDataAtualizacaoArquivo, buscarTitulos } from './apiV19.js';
import { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE, extrairLancamentosDosTitulos } from './processingV13.js';
import { configurarFiltros, atualizarVisualizacoes, obterContasSelecionadas } from './uiV21.js';

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

    // Obter as contas selecionadas para buscar os lançamentos
    const contasSelecionadas = obterContasSelecionadas();
    let lancamentosArray = [];

    // Se existirem contas selecionadas
    if (contasSelecionadas && contasSelecionadas.length > 0) {
        // Filtra as contas que já estão no cache das que precisam ser buscadas
        const contasParaBuscar = contasSelecionadas.filter(c => !appCache.lancamentosPorConta.has(String(c)));

        // 1. Busca somente as contas faltantes
        if (contasParaBuscar.length > 0) {
            // Cria o slot da conta no cache antes de chamar a API para evitar chamadas duplicadas
            contasParaBuscar.forEach(c => {
                const cod = String(c);
                if (!appCache.lancamentosPorConta.has(cod)) {
                    appCache.lancamentosPorConta.set(cod, []);
                }
            });

            // Chama a API para buscar os títulos faltantes
            const promises = contasParaBuscar.map(conta => {
                const filtrosAPI = {
                    contas: [conta] // Envia somente uma conta por vez
                };
                return buscarTitulos(filtrosAPI);
            });
            const allResponses = await Promise.all(promises);

            // --- INÍCIO DA CORREÇÃO ---
            // Processa todas as respostas da API para extrair os lançamentos e popular o cache
            allResponses.forEach(apiResponse => {
                if (apiResponse && apiResponse.response && typeof apiResponse.response.movimentos === 'string' && apiResponse.response.movimentos.length > 2) { // Evita strings vazias como "[]"
                    try {
                        // a) Parseia a string JSON para obter o array de TÍTULOS
                        const titulosNovos = JSON.parse(`[${apiResponse.response.movimentos}]`);
                        console.log(`Títulos recebidos da API:`, titulosNovos);
                        // b) Extrai os LANÇAMENTOS dos títulos usando a função auxiliar
                        const lancamentosNovos = extrairLancamentosDosTitulos(titulosNovos);
                        console.log(`Lançamentos extraídos:`, lancamentosNovos);
                        // c) Distribui os lançamentos extraídos diretamente no cache
                        lancamentosNovos.forEach(lancamento => {
                            const cod = String(lancamento.CODContaC);
                            // Verifica se a conta do lançamento está entre as que buscamos, alguns titulos
                            // podem ter lançamentos em mais deu uma conta diferentes
                            if (contasParaBuscar.includes(cod)) {
                                if (appCache.lancamentosPorConta.has(cod)) {
                                    const lista = appCache.lancamentosPorConta.get(cod);
                                    lista.push(lancamento);
                                }
                            }
                        });
                    } catch (error) {
                        console.error("Erro ao processar resposta da API:", error);
                    }
                }
            });
        }

        // 2. Monta o array final combinando os lançamentos do cache (que agora incluem os novos)
        // Limpa o array antes de preenchê-lo para evitar duplicação
        lancamentosArray = []; 
        contasSelecionadas.forEach(c => {
            const lista = appCache.lancamentosPorConta.get(String(c)) || [];
            lancamentosArray.push(...lista);
        });
        console.log(`Total de lançamentos combinados para visualização: ${lancamentosArray.length}`);
    } else {
        console.log("Nenhuma conta selecionada para buscar dados.");
    }

    // 3. Atualiza o cache global com a lista de lançamentos filtrada para a visualização atual
    appCache.lancamentos = lancamentosArray; // Corrigido de .titulos para .lancamentos

    // 4. Chama a atualização da UI
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