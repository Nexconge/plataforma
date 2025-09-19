// main.js - MODIFICADO

// --- Importa as funções de cada módulo especializado ---
import { buscarTitulos } from './apiV20.js';
import { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE, extrairLancamentosDosTitulos } from './processingV15.js';
import { configurarFiltros, atualizarVisualizacoes, obterContasSelecionadas } from './uiV23.js';
//import { gerarMatrizConsolidada } from './utilsMatriz.js';

// --- O cache em memória e as funções de serialização ---
let appCache = {
    userId: null, userType: null,
    contasBuscadas: [],
    matrizesPorConta: new Map(), // <--- NOVO
    categoriasMap: new Map(), classesMap: new Map(),
    projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
    anosDisponiveis: []
};

/**
 * Função central que é chamada sempre que um filtro é alterado.
 */
async function handleFiltroChange() {
    document.body.classList.add('loading');

    // Obter as contas selecionadas para buscar os lançamentos
    const contasSelecionadas = obterContasSelecionadas();

    // Se existirem contas selecionadas
    if (contasSelecionadas && contasSelecionadas.length > 0) {
        // Filtra as contas que já estão no cache das que precisam ser buscadas
        const contasParaBuscar = contasSelecionadas.filter(c => !appCache.contasBuscadas.includes((c)));

        // 1. Busca somente as contas faltantes
        if (contasParaBuscar.length > 0) {
            console.log(`Contas não incluidas chamando a API:`, contasParaBuscar)
            // Cria o slot da conta no cache antes de chamar a API para evitar chamadas duplicadas
            contasParaBuscar.forEach(c => {
                if (!appCache.contasBuscadas.includes(c)) {
                    appCache.contasBuscadas.push(c);
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

            // Processa todas as respostas da API para extrair os lançamentos e popular o cache
            allResponses.forEach(apiResponse => {
                if (apiResponse && apiResponse.response && typeof apiResponse.response.movimentos === 'string' && apiResponse.response.movimentos.length > 2) { // Evita strings vazias como "[]"
                    try {
                        // a) Parseia a string JSON para obter o array de TÍTULOS
                        const titulosNovos = JSON.parse(`[${apiResponse.response.movimentos}]`);
                        // b) Extrai os LANÇAMENTOS dos títulos usando a função auxiliar
                        const lancamentosNovos = extrairLancamentosDosTitulos(titulosNovos);
                        // c) Processa os lanãmentos extraidos para matrizrs de dados
                        if (lancamentosNovos.length > 0) {
                            const codConta = lancamentosNovos[0].CODContaC;
                            const lancamentosProcessados = processarLancamentos(appCache, new Set(contasParaBuscar), lancamentosNovos)

                            appCache.matrizesPorConta.set(codConta, lancamentosProcessados)
                            console.log(`Matriz incluída para conta ${codConta}:`, lancamentosProcessados);
                        }
                    } catch (error) {
                        console.error("Erro ao processar resposta da API:", error);
                    }
                }
            });
        }
    } else {
        console.log("Nenhuma conta selecionada para buscar dados.");
    }
    // 4. Chama a atualização da UI
    atualizarVisualizacoes(appCache, filtrarContasESaldo, calcularTotaisDRE);
    document.body.classList.remove('loading');
}

window.IniciarDoZero = async function(deptosJson,id,type,contasJson,classesJson,projetosJson) {
    appCache = {
        ...appCache,
        userId: null, userType: null, contasBuscadas: [], matrizesPorConta: new Map(),
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
    contas.forEach(c => appCache.contasMap.set((c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));
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