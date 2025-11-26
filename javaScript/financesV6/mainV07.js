// mainV01.js
import { buscarTitulos, buscarValoresEstoque, buscarPeriodosComDados } from './apiV01.js';
import { processarDadosDaConta, extrairDadosDosTitulos, mergeMatrizes } from './processingV01.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect } from './uiV02.js';

let appCache = {
    userId: null, userType: null,
    dadosPorContaAno: new Map(), 
    matrizesPorProjeto: new Map(),
    
    // Cache de Períodos: Agora a chave será "ContaID|Projecao" (ex: "12345|realizado")
    periodosPorConta: new Map(),

    categoriasMap: new Map(), classesMap: new Map(),
    projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
    
    projecao: "realizado",
    flagAnos: false
};

async function handleFiltroChange() {
    if (appCache.flagAnos) return; 
    
    let filtrosAtuais = obterFiltrosAtuais();
    const contasSelecionadas = filtrosAtuais ? filtrosAtuais.contas : [];
    
    if (contasSelecionadas.length === 0) {
        exibirTabelasVazias();
        return;
    }

    // --- ETAPA 1: Gerenciamento Inteligente dos Períodos ---
    
    const projecaoAtual = appCache.projecao; // "realizado" ou "arealizar"

    // MUDANÇA: Verifica o cache usando chave composta (Conta + Projeção)
    const contasSemPeriodo = contasSelecionadas.filter(id => {
        const chaveCache = `${id}|${projecaoAtual}`;
        return !appCache.periodosPorConta.has(chaveCache);
    });

    // Se houver contas sem período cacheado para a projeção atual, busca na API
    if (contasSemPeriodo.length > 0) {
        document.body.classList.add('loading');
        
        // MUDANÇA: Passa 'projecaoAtual' para a API
        const promises = contasSemPeriodo.map(id => 
            buscarPeriodosComDados(id, projecaoAtual).then(res => ({ id, res }))
        );
        
        const resultados = await Promise.all(promises);
        const anoAtual = new Date().getFullYear();

        resultados.forEach(({ id, res }) => {
            let inicio = anoAtual;
            let fim = anoAtual;

            if (res && res.response) {
                if (res.response.periodo_ini) inicio = new Date(res.response.periodo_ini).getFullYear();
                if (res.response.periodo_fim) fim = new Date(res.response.periodo_fim).getFullYear();
            }
            
            // MUDANÇA: Salva usando a chave composta
            const chaveCache = `${id}|${projecaoAtual}`;
            appCache.periodosPorConta.set(chaveCache, { inicio, fim });
        });
    }

    // Calcula o Range Global (Min/Max) lendo do cache com a projeção correta
    let minAno = null;
    let maxAno = null;
    const anoAtual = new Date().getFullYear();

    contasSelecionadas.forEach(id => {
        const chaveCache = `${id}|${projecaoAtual}`;
        const p = appCache.periodosPorConta.get(chaveCache);
        
        if (p) {
            if (minAno === null || p.inicio < minAno) minAno = p.inicio;
            if (maxAno === null || p.fim > maxAno) maxAno = p.fim;
        }
    });

    if (minAno === null) minAno = anoAtual;
    if (maxAno === null) maxAno = anoAtual;

    // Atualiza Select UI
    appCache.flagAnos = true;
    atualizarOpcoesAnoSelect(
        document.getElementById('anoSelect'), 
        minAno, 
        maxAno, 
        document.getElementById('modoSelect').value, 
        appCache.projecao
    );
    appCache.flagAnos = false;
    
    filtrosAtuais = obterFiltrosAtuais();


    // --- ETAPA 2: Busca e Processamento dos Dados Financeiros (Mantido da versão anterior) ---
    
    document.body.classList.add('loading');
    const projetosSelecionados = filtrosAtuais.projetos;
    const requisicoesNecessarias = [];

    if (appCache.projecao === "realizado") {
        const anosSelecionados = filtrosAtuais.anos; 
        contasSelecionadas.forEach(contaId => {
            anosSelecionados.forEach(ano => {
                const chaveCache = `${contaId}|${ano}`;
                if (!appCache.dadosPorContaAno.has(chaveCache)) {
                    requisicoesNecessarias.push({ contaId, anoOuTag: ano, filtrosApi: [ano] });
                    appCache.dadosPorContaAno.set(chaveCache, null); 
                }
            });
        });
    } else {
        const tagCache = "AREALIZAR";
        contasSelecionadas.forEach(contaId => {
            const chaveCache = `${contaId}|${tagCache}`;
            if (!appCache.dadosPorContaAno.has(chaveCache)) {
                requisicoesNecessarias.push({ contaId, anoOuTag: tagCache, filtrosApi: ["AREALIZAR"] });
                appCache.dadosPorContaAno.set(chaveCache, null); 
            }
        });
    }

    if (requisicoesNecessarias.length > 0) {
        const promises = requisicoesNecessarias.map(req => 
            buscarTitulos({ contas: [req.contaId], anos: req.filtrosApi })
                .then(resultado => ({ ...resultado, reqContext: req })) 
        );

        const projetosParaProcessar = projetosSelecionados.filter(p => !appCache.matrizesPorProjeto.has(p));
        if(projetosParaProcessar.length > 0) {
            promises.push(...projetosParaProcessar.map(proj => 
                buscarValoresEstoque({ periodos: filtrosAtuais.colunas, projeto: [proj] })
                .then(res => ({ ...res, isEstoque: true, projId: proj }))
            ));
        }

        const responses = await Promise.all(promises);

        for (const apiResponse of responses) {
            if (apiResponse.isEstoque) {
                const matrizEstoque = { '(+) Estoque': {} };
                if (apiResponse.response && Array.isArray(apiResponse.response.Saldos)) {
                    apiResponse.response.Saldos.forEach(saldo => {
                         if(saldo.Periodo) matrizEstoque['(+) Estoque'][saldo.Periodo] = (matrizEstoque['(+) Estoque'][saldo.Periodo] || 0) + saldo.Valor;
                    });
                }
                appCache.matrizesPorProjeto.set(apiResponse.projId, matrizEstoque);
                continue;
            }

            const { reqContext, response } = apiResponse;
            const { contaId, anoOuTag } = reqContext;
            
            // CORREÇÃO: Tratamento seguro dos dados da API
            const saldoInicialApi = response && response.saldoInicial ? Number(response.saldoInicial) : 0;
            const movimentosRaw = response && response.movimentos ? response.movimentos : "";

            let dadosExtraidos = { lancamentos: [], titulos: [], capitalDeGiro: [] };
            
            if (movimentosRaw && movimentosRaw.length > 2) {
                try {
                    const titulosJson = JSON.parse(`[${movimentosRaw}]`);
                    dadosExtraidos = extrairDadosDosTitulos(titulosJson, contaId);
                } catch (e) {
                    console.error(`Erro JSON conta ${contaId}`, e);
                }
            }

            const dadosProcessados = processarDadosDaConta(appCache, dadosExtraidos, contaId, saldoInicialApi);
            appCache.dadosPorContaAno.set(`${contaId}|${anoOuTag}`, dadosProcessados);
        }
    }

    const dadosParaJuntar = [];
    let saldoInicialConsolidado = 0;

    if (appCache.projecao === "realizado") {
        const anosVisiveis = filtrosAtuais.anos.sort();
        const primeiroAno = anosVisiveis[0];
        contasSelecionadas.forEach(contaId => {
            anosVisiveis.forEach(ano => {
                const dados = appCache.dadosPorContaAno.get(`${contaId}|${ano}`);
                if (dados) {
                    dadosParaJuntar.push(dados);
                    if (ano === primeiroAno) saldoInicialConsolidado += (dados.saldoInicialBase || 0);
                }
            });
        });
    } else {
        contasSelecionadas.forEach(contaId => {
            const dados = appCache.dadosPorContaAno.get(`${contaId}|AREALIZAR`);
            if (dados) {
                dadosParaJuntar.push(dados);
                saldoInicialConsolidado += (dados.saldoInicialBase || 0);
            }
        });
    }

    const dadosEstoque = projetosSelecionados.map(id => appCache.matrizesPorProjeto.get(id)).filter(Boolean);

    const dadosParaExibir = mergeMatrizes(
        dadosParaJuntar, 
        filtrosAtuais.modo, 
        filtrosAtuais.colunas, 
        appCache.projecao, 
        dadosEstoque,
        saldoInicialConsolidado
    );

    atualizarVisualizacoes(dadosParaExibir, filtrosAtuais.colunas, appCache);
    document.body.classList.remove('loading');
}

function exibirTabelasVazias(){
    const anoAtual = String(new Date().getFullYear());
    const modoAtual = document.getElementById('modoSelect')?.value || 'mensal';
    const colunasVazias = (modoAtual.toLowerCase() === 'anual')
        ? [anoAtual]
        : Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}-${anoAtual}`);
    
    atualizarVisualizacoes(
        { matrizDRE: {}, matrizDetalhamento: {}, entradasESaidas: {}, matrizCapitalGiro: {} }, 
        colunasVazias, 
        appCache
    );
    document.body.classList.remove('loading');
}

window.IniciarDoZero = async function(deptosJson, id, type, contasJson, classesJson, projetosJson) {
    appCache = {
        userId: id, userType: type,
        dadosPorContaAno: new Map(),
        periodosPorConta: new Map(), // Resetar cache de períodos
        matrizesPorProjeto: new Map(),
        categoriasMap: new Map(), classesMap: new Map(),
        projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
        projecao: "realizado",
        flagAnos: false
    };
    
    JSON.parse(classesJson).forEach(c => {
        appCache.classesMap.set(c.codigo, { classe: c.Classe, categoria: c.Categoria });
        appCache.categoriasMap.set(c.codigo, c.Categoria);
    });
    JSON.parse(projetosJson).forEach(p => appCache.projetosMap.set(String(p.codProj), { nome: p.nomeProj, contas: (p.contas || []).map(String) }));
    JSON.parse(contasJson).forEach(c => appCache.contasMap.set((c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));
    JSON.parse(deptosJson).forEach(d => appCache.departamentosMap.set(String(d.codigo), d.descricao));

    configurarFiltros(appCache, [String(new Date().getFullYear())], handleFiltroChange);
};