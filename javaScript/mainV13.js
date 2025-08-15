// main.js - MODIFICADO

// --- Importa as funções de cada módulo especializado ---
import { buscarDadosOMIE, obterDataAtualizacaoArquivo, buscarLancamentos } from './apiV8.js';
import { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE } from './processingV5.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosSelecionados } from './uiV7.js';

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
    document.body.classList.add('loading');
    const filtros = obterFiltrosSelecionados();

    // 1. Inicia com um array vazio como padrão seguro
    let lancamentosArray = []; 

    // 2. Verifica se há filtros para fazer a chamada da API
    if (filtros && filtros.anos.length > 0) {
        const apiResponse = await buscarLancamentos(filtros);

        // 3. Processa a resposta da API
        if (apiResponse && apiResponse.response && typeof apiResponse.response.lancamentos === 'string' && apiResponse.response.lancamentos.length > 0) {
            const lancamentosString = apiResponse.response.lancamentos;
            const jsonArrayString = `[${lancamentosString}]`;
            try {
                // Preenche o array se o processamento for bem-sucedido
                lancamentosArray = JSON.parse(jsonArrayString);
            } catch (error) {
                console.error("Erro ao fazer o parse do JSON de lançamentos:", error);
                // Em caso de erro, lancamentosArray continua sendo um array vazio
            }
        }
    } else {
        // 4. Caso NÃO HAJA filtros, apenas loga a mensagem
        console.log("Nenhum período selecionado para buscar dados.");
    }
    
    // 5. ATUALIZA O CACHE com o resultado (dados processados ou array vazio)
    // Esta linha agora fica fora e depois do bloco if/else.
    appCache.lancamentos = lancamentosArray;
    
    // 6. ATUALIZA A TELA UMA ÚNICA VEZ com o estado final do cache
    atualizarVisualizacoes(appCache, filtrarContasESaldo, processarLancamentos, calcularTotaisDRE);
    
    // 7. Remove o feedback visual
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