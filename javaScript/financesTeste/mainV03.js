// main.js - Módulo Principal de Finanças
// Orquestra a busca, processamento e exibição dos dados financeiros.

// Importa funções dos outros módulos
import { buscarTitulos } from './apiV01.js';
import { processarDadosDaConta, extrairDadosDosTitulos, mergeMatrizes } from './processingV01.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect } from './uiV03.js';

// Inicia o cache da aplicação
let appCache = {
    userId: null, userType: null,
    matrizesPorConta: new Map(),
    categoriasMap: new Map(), classesMap: new Map(),
    projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
    projecao: "realizado", // Valores possíveis: 'realizado', 'arealizar'
    flagAnos: false // Flag para controle de recursão em atualizações de filtro
};

/**
 * Função central que reage a qualquer mudança nos filtros da UI.
 * Orquestra a busca de novos dados (se necessário), o processamento
 * e a subsequente atualização das tabelas.
 */
async function handleFiltroChange() {
    if (appCache.flagAnos) return; 
    
    document.body.classList.add('loading');
    
    let filtrosAtuais = obterFiltrosAtuais();
    const contasSelecionadas = filtrosAtuais ? filtrosAtuais.contas.map(Number) : [];
    
    if (contasSelecionadas.length === 0) {
        atualizarVisualizacoes(null, [], appCache); 
        document.body.classList.remove('loading');
        return;
    }

    const contasParaProcessar = contasSelecionadas.filter(c => !appCache.matrizesPorConta.has(c));

    if (contasParaProcessar.length > 0) {
        contasParaProcessar.forEach(c => appCache.matrizesPorConta.set(c, null));

        const promises = contasParaProcessar.map(conta => buscarTitulos({ contas: [conta] }));
        const responses = await Promise.all(promises);
        
        for (let i = 0; i < contasParaProcessar.length; i++) {
            const contaId = contasParaProcessar[i];
            const apiResponse = responses[i];
            
            let dadosExtraidos = { lancamentos: [], titulos: [], capitalDeGiro: [] }; 
            if (apiResponse && apiResponse.response && typeof apiResponse.response.movimentos === 'string' && apiResponse.response.movimentos.length > 2) {
                try {
                    const titulos = JSON.parse(`[${apiResponse.response.movimentos}]`);
                    const { lancamentosProcessados, titulosEmAberto, capitalDeGiro } = extrairDadosDosTitulos(titulos, contaId);
                    
                    dadosExtraidos.lancamentos = lancamentosProcessados.filter(l => Number(l.CODContaC) === contaId);
                    dadosExtraidos.titulos = titulosEmAberto;
                    dadosExtraidos.capitalDeGiro = capitalDeGiro;
                } catch (e) {
                    console.error(`Erro ao processar JSON para a conta ${contaId}:`, e);
                }
            }

            const dadosProcessadosConta = processarDadosDaConta(appCache, dadosExtraidos, contaId);
            
            const contaInfo = appCache.contasMap.get(String(contaId));
            const saldoIni = contaInfo ? Number(contaInfo.saldoIni) : 0;
            
            if (dadosProcessadosConta.realizado) {
                dadosProcessadosConta.realizado.saldoIni = saldoIni;
            }
            if (dadosProcessadosConta.arealizar) {
                const totalRealizado = dadosProcessadosConta.realizado ? dadosProcessadosConta.realizado.valorTotal : 0;
                dadosProcessadosConta.arealizar.saldoIni = saldoIni + totalRealizado;
            }
            
            appCache.matrizesPorConta.set(contaId, dadosProcessadosConta);
        }
    }

    const matrizesParaJuntar = contasSelecionadas
        .map(id => appCache.matrizesPorConta.get(id))
        .filter(Boolean);

    const anoSelect = document.getElementById('anoSelect');
    const modoSelect = document.getElementById('modoSelect');
    let anosDisponiveis = new Set();
    matrizesParaJuntar.forEach(dadosConta => {
        const dadosProjecao = dadosConta[appCache.projecao.toLowerCase()];
        if (dadosProjecao && dadosProjecao.chavesComDados) {
            dadosProjecao.chavesComDados.forEach(chave => {
                const ano = chave.split('-')[1];
                anosDisponiveis.add(ano);
            });
        }
    });

    const anosArray = Array.from(anosDisponiveis).sort();
    if (anosArray.length === 0) {
        anosArray.push(String(new Date().getFullYear()));
    }

    appCache.flagAnos = true;
    atualizarOpcoesAnoSelect(anoSelect, anosArray, modoSelect.value, appCache.projecao);
    appCache.flagAnos = false;

    filtrosAtuais = obterFiltrosAtuais();
    
    const dadosParaExibir = mergeMatrizes(matrizesParaJuntar, filtrosAtuais.modo, filtrosAtuais.colunas, appCache.projecao);
    
    atualizarVisualizacoes(dadosParaExibir, filtrosAtuais.colunas, appCache);
    document.body.classList.remove('loading');
}

/**
 * Função de inicialização chamada pelo Bubble.
 */
window.IniciarDoZero = async function(deptosJson,id,type,contasJson,classesJson,projetosJson) {
    appCache = {
        userId: id, userType: type,
        matrizesPorConta: new Map(),
        categoriasMap: new Map(), classesMap: new Map(),
        projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
        projecao: "realizado",
        flagAnos: false
    };
    
    const classes = JSON.parse(classesJson);
    const projetos = JSON.parse(projetosJson);
    const contas = JSON.parse(contasJson);
    const departamentos = JSON.parse(deptosJson);

    classes.forEach(c => {
        appCache.classesMap.set(c.codigo, { classe: c.Classe, categoria: c.Categoria });
        appCache.categoriasMap.set(c.codigo, c.Categoria);
    });
    
    // CORREÇÃO APLICADA AQUI: Garante que a chave do 'projetosMap' seja sempre string.
    projetos.forEach(p => {
        appCache.projetosMap.set(String(p.codProj), { nome: p.nomeProj, contas: (p.contas || []).map(String) });
    });

    contas.forEach(c => appCache.contasMap.set(String(c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));
    departamentos.forEach(d => appCache.departamentosMap.set(d.codigo, d.descricao));

    const anoAtual = [String(new Date().getFullYear())];

    configurarFiltros(appCache, anoAtual, handleFiltroChange);
};