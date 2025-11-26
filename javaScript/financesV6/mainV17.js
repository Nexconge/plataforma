// mainV08.js
import { buscarTitulos, buscarValoresEstoque, buscarPeriodosComDados } from './apiV05.js';
import { processarDadosDaConta, extrairDadosDosTitulos, mergeMatrizes } from './processingV07.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect } from './uiV04.js';

let appCache = {
    userId: null, userType: null,
    dadosPorContaAno: new Map(), 
    matrizesPorProjeto: new Map(),
    periodosPorConta: new Map(),
    categoriasMap: new Map(), classesMap: new Map(),
    projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
    projecao: "realizado",
    flagAnos: false
};

async function handleFiltroChange() {
    if (appCache.flagAnos) return; 
    
    try {
        let filtrosAtuais = obterFiltrosAtuais();
        if (!filtrosAtuais) {
            exibirTabelasVazias();
            return;
        }
        const contasSelecionadas = filtrosAtuais.contas;
        
        if (contasSelecionadas.length === 0) {
            exibirTabelasVazias();
            return;
        }

        // --- ETAPA 1: Gerenciamento Inteligente dos Períodos ---
        const projecaoAtual = appCache.projecao;
        const contasSemPeriodo = contasSelecionadas.filter(id => !appCache.periodosPorConta.has(`${id}|${projecaoAtual}`));

        if (contasSemPeriodo.length > 0) {
            document.body.classList.add('loading');
            const promises = contasSemPeriodo.map(id => buscarPeriodosComDados(id, projecaoAtual).then(res => ({ id, res })));
            const resultados = await Promise.all(promises);
            const anoAtual = new Date().getFullYear();

            resultados.forEach(({ id, res }) => {
                let inicio = anoAtual;
                let fim = anoAtual;
                if (res && res.response) {
                    const valIni = res.response.periodo_ini;
                    const valFim = res.response.periodo_fim;
                    if (valIni && !isNaN(valIni) && Number(valIni) > 1900) inicio = Number(valIni);
                    else if (valIni) inicio = new Date(valIni).getFullYear();

                    if (valFim && !isNaN(valFim) && Number(valFim) > 1900) fim = Number(valFim);
                    else if (valFim) fim = new Date(valFim).getFullYear();
                }
                appCache.periodosPorConta.set(`${id}|${projecaoAtual}`, { inicio, fim });
            });
        }

        // Calcula Range Global
        let minAno = null, maxAno = null;
        const anoAtual = new Date().getFullYear();
        contasSelecionadas.forEach(id => {
            const p = appCache.periodosPorConta.get(`${id}|${projecaoAtual}`);
            if (p) {
                if (minAno === null || p.inicio < minAno) minAno = p.inicio;
                if (maxAno === null || p.fim > maxAno) maxAno = p.fim;
            }
        });
        if (minAno === null) minAno = anoAtual;
        if (maxAno === null) maxAno = anoAtual;

        appCache.flagAnos = true;
        const elmAno = document.getElementById('anoSelect');
        const elmModo = document.getElementById('modoSelect');
        if(elmAno && elmModo) atualizarOpcoesAnoSelect(elmAno, minAno, maxAno, elmModo.value, appCache.projecao);
        appCache.flagAnos = false;
        
        filtrosAtuais = obterFiltrosAtuais();
        if (!filtrosAtuais) {
            exibirTabelasVazias();
            return; 
        }

        // --- ETAPA 2: Busca e Processamento dos Dados ---
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
                // Processamento de Estoque (Mantido)
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
                const saldoInicialApi = response && response.saldoInicial ? Number(response.saldoInicial) : 0;

                // === LÓGICA DE PROCESSAMENTO BASEADA NA PROJEÇÃO ===
                
                if (appCache.projecao === "arealizar") {
                    // 1. Processar Realizado do Ano Atual ("Side-effect" para calcular saldo)
                    const rawRealizadoCY = response.dadosRealizado;
                    let processedRealizadoCY = null;
                    let valorAcumuladoRealizado = 0;

                    if (rawRealizadoCY && rawRealizadoCY.length > 2) {
                        try {
                            const extractedCY = extrairDadosDosTitulos(JSON.parse(`[${rawRealizadoCY}]`), contaId);
                            // Processa como realizado normal
                            processedRealizadoCY = processarDadosDaConta(appCache, extractedCY, contaId, saldoInicialApi);
                            valorAcumuladoRealizado = processedRealizadoCY.realizado.valorTotal || 0;
                            
                            // Salva no cache do ANO ATUAL se não existir
                            const chaveCY = `${contaId}|${anoAtual}`;
                            if (!appCache.dadosPorContaAno.has(chaveCY)) {
                                appCache.dadosPorContaAno.set(chaveCY, processedRealizadoCY);
                            }
                        } catch (e) {
                            console.error(`Erro JSON RealizadoCY conta ${contaId}`, e);
                        }
                    }

                    // 2. Calcular saldo inicial para o "A Realizar"
                    // Saldo Inicial do Ano + Resultado do Realizado até agora
                    const saldoInicioArealizar = saldoInicialApi + valorAcumuladoRealizado;

                    // 3. Processar "A Realizar"
                    const rawArealizar = response.dadosArealizar;
                    let dadosInput = { lancamentos: [], titulos: [], capitalDeGiro: [] };
                    
                    if (rawArealizar && rawArealizar.length > 2) {
                        try {
                            const extracted = extrairDadosDosTitulos(JSON.parse(`[${rawArealizar}]`), contaId);
                            // "dadosArealizar" retorna titulos, então usamos titulosEmAberto
                            dadosInput.titulos = extracted.titulosEmAberto;
                        } catch (e) { console.error(`Erro JSON Arealizar conta ${contaId}`, e); }
                    }

                    // Processa passando o saldo acumulado e SEM capital de giro
                    const processedArealizar = processarDadosDaConta(appCache, dadosInput, contaId, saldoInicioArealizar);
                    appCache.dadosPorContaAno.set(`${contaId}|AREALIZAR`, processedArealizar);

                } else {
                    // === MODO REALIZADO ===
                    let dadosInput = { lancamentos: [], titulos: [], capitalDeGiro: [] };

                    // 1. Dados Realizado (DRE)
                    const rawRealizado = response.dadosRealizado;
                    if (rawRealizado && rawRealizado.length > 2) {
                        try {
                            const extracted = extrairDadosDosTitulos(JSON.parse(`[${rawRealizado}]`), contaId);
                            dadosInput.lancamentos = extracted.lancamentosProcessados;
                            // Nota: dadosRealizado também pode conter info parcial de capital de giro (pagamentos),
                            // mas vamos priorizar o campo dadosCapitalG se ele for a fonte da verdade.
                        } catch (e) { console.error(`Erro JSON Realizado conta ${contaId}`, e); }
                    }

                    // 2. Dados Capital de Giro (Específico)
                    const rawCapitalG = response.dadosCapitalG;
                    if (rawCapitalG && rawCapitalG.length > 2) {
                        try {
                            const extractedCG = extrairDadosDosTitulos(JSON.parse(`[${rawCapitalG}]`), contaId);
                            // Usamos o array capitalDeGiro extraído deste campo
                            dadosInput.capitalDeGiro = extractedCG.capitalDeGiro;
                        } catch (e) { console.error(`Erro JSON CapitalG conta ${contaId}`, e); }
                    }

                    const processed = processarDadosDaConta(appCache, dadosInput, contaId, saldoInicialApi);
                    appCache.dadosPorContaAno.set(`${contaId}|${anoOuTag}`, processed);
                }
            }
        }

        // ETAPA 3: Merge e Exibição
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

    } catch (erroFatal) {
        console.error("Erro fatal em handleFiltroChange:", erroFatal);
        alert("Ocorreu um erro ao processar os dados. Verifique o console.");
    } finally {
        document.body.classList.remove('loading');
    }
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
        periodosPorConta: new Map(),
        matrizesPorProjeto: new Map(),
        categoriasMap: new Map(), classesMap: new Map(),
        projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
        projecao: "realizado",
        flagAnos: false
    };
    
    try {
        JSON.parse(classesJson).forEach(c => {
            appCache.classesMap.set(c.codigo, { classe: c.Classe, categoria: c.Categoria });
            appCache.categoriasMap.set(c.codigo, c.Categoria);
        });
        JSON.parse(projetosJson).forEach(p => appCache.projetosMap.set(String(p.codProj), { nome: p.nomeProj, contas: (p.contas || []).map(String) }));
        JSON.parse(contasJson).forEach(c => appCache.contasMap.set((c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));
        JSON.parse(deptosJson).forEach(d => appCache.departamentosMap.set(String(d.codigo), d.descricao));

        configurarFiltros(appCache, [String(new Date().getFullYear())], handleFiltroChange);
    } catch (e) {
        console.error("Erro na inicialização:", e);
    }
};