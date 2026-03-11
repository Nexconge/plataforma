import { buscarTitulos, buscarValoresEstoque, buscarPeriodosComDados } from './apiV01.js';
import { processarDadosConta, processarCapitalDeGiro, mergeMatrizes, incrementarMes } from './processingV01.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect, alternarEstadoCarregamento } from './uiV02.js';

// --- Cache Global da Aplicação ---
let appCache = {
    userId: null,  
    userType: null,

    dadosPorContaAno: new Map(),        // Cache: chave "contaId|anoOuTag" -> bucketsPorProjeto
    matrizesEstoquePorProjeto: new Map(), // Cache: chave codProj -> matriz de estoque
    periodosPorConta: new Map(),        // Cache: chave "contaId|projecao" -> { inicio, fim }
    
    dicionarios: {
        categoriasMap: new Map(), // CODCategoria -> NomeCategoria
        classesMap: new Map(),    // CODCategoria -> { classe: NomeClasse, categoria: NomeCategoria }
        departamentosMap: new Map() // CODDepto -> NomeDepto
    },
    
    projetosMap: new Map(), // CODProj -> { nome: NomeProjeto, contas: [codContas] }
    contasMap: new Map(),   // CODConta -> { descricao: NomeConta, saldoIni: Valor }
    
    projecao: "realizado",
    flagAnos: false
};

// --- Fluxo Principal ---

async function handleFiltroChange() {
    if (appCache.flagAnos) return; 
    
    alternarEstadoCarregamento(true);
    try {
        let filtrosAtuais = obterFiltrosAtuais();
        
        if (!filtrosAtuais || filtrosAtuais.contas.length === 0) {
            exibirTabelasVazias();
            return; 
        }

        if (appCache.projecao === 'arealizar') {
            const anoAtual = new Date().getFullYear();
            appCache.flagAnos = true;
            atualizarOpcoesAnoSelect(null, anoAtual, anoAtual + 5, filtrosAtuais.modo, 'arealizar');
            appCache.flagAnos = false;

            filtrosAtuais = obterFiltrosAtuais();
            await stepCarregarProcessarDados(filtrosAtuais);
            stepAtualizarAnosPeloCache(filtrosAtuais.contas);
            filtrosAtuais = obterFiltrosAtuais();

        } else {
            await stepGerenciarPeriodos(filtrosAtuais.contas);
            filtrosAtuais = obterFiltrosAtuais();
            await stepCarregarProcessarDados(filtrosAtuais);
        }

        stepConsolidarExibir(filtrosAtuais);

    } catch (erro) {
        console.error("Erro fatal em handleFiltroChange:", erro);
        alert("Ocorreu um erro ao processar os dados.");
    } finally {
        alternarEstadoCarregamento(false);
    }
}

// --- Etapas do Workflow ---

async function stepGerenciarPeriodos(contasSelecionadas) {
    const projecaoAtual = appCache.projecao;
    const contasSemPeriodo = contasSelecionadas.filter(id => !appCache.periodosPorConta.has(`${id}|${projecaoAtual}`)); 

    if (contasSemPeriodo.length > 0) {
        const promises = contasSemPeriodo.map(id => buscarPeriodosComDados(id, projecaoAtual).then(res => ({ id, res })));
        const resultados = await Promise.all(promises);
        const anoAtual = new Date().getFullYear();

        resultados.forEach(({ id, res }) => {
            let inicio = anoAtual, fim = anoAtual;
            if (res?.response) {
                if (res.response.periodo_ini) inicio = Number(String(res.response.periodo_ini).substring(0, 4));
                if (res.response.periodo_fim) fim = Number(String(res.response.periodo_fim).substring(0, 4));
            }
            appCache.periodosPorConta.set(`${id}|${projecaoAtual}`, { inicio, fim });
        });
    }

    let minAno = new Date().getFullYear(); 
    let maxAno = minAno;
    
    if (contasSelecionadas.length > 0) {
        let first = true;
        contasSelecionadas.forEach(id => {
            const p = appCache.periodosPorConta.get(`${id}|${projecaoAtual}`);
            if (p) {
                if (first || p.inicio < minAno) minAno = p.inicio;
                if (first || p.fim > maxAno) maxAno = p.fim;
                first = false;
            }
        });
    }

    appCache.flagAnos = true;
    const elmModo = document.getElementById('modoSelect');
    atualizarOpcoesAnoSelect(null, minAno, maxAno, elmModo ? elmModo.value : 'mensal', appCache.projecao);
    appCache.flagAnos = false;
}

async function stepCarregarProcessarDados(filtros) {
    const { contas, anos, projetos } = filtros;
    const requisicoesTitulos = [];

    // Identifica dados faltantes no cache
    if (appCache.projecao === "realizado") {
        contas.forEach(contaId => {
            anos.forEach(ano => {
                const chaveCache = `${contaId}|${ano}`;
                if (!appCache.dadosPorContaAno.has(chaveCache)) {
                    requisicoesTitulos.push({ contaId, anoOuTag: String(ano), projecao: "realizado" });
                    appCache.dadosPorContaAno.set(chaveCache, null); // Marca como 'em busca'
                }
            });
        });
    } else {
        contas.forEach(contaId => {
            const chaveCache = `${contaId}|AREALIZAR`;
            if (!appCache.dadosPorContaAno.has(chaveCache)) {
                requisicoesTitulos.push({ contaId, anoOuTag: "AREALIZAR", projecao: "arealizar" });
                appCache.dadosPorContaAno.set(chaveCache, null); 
            }
        });
    }

    const projetosSemEstoque = projetos.filter(p => !appCache.matrizesEstoquePorProjeto.has(p));
    if (requisicoesTitulos.length === 0 && projetosSemEstoque.length === 0) return; // Tudo em cache

    // Dispara requisições
    const promises = requisicoesTitulos.map(req => 
        buscarTitulos({ conta: req.contaId, ano: req.anoOuTag === "AREALIZAR" ? "AREALIZAR" : req.anoOuTag })
            .then(res => ({ ...res, reqContext: req, tipo: 'TITULOS' })) 
    );

    projetosSemEstoque.forEach(proj => {
        promises.push(
            buscarValoresEstoque({ periodos: filtros.colunas, projeto: [proj] })
                .then(res => ({ ...res, tipo: 'ESTOQUE', projId: proj }))
        );
    });

    const responses = await Promise.all(promises);

    // Processamento Pós-API
    responses.forEach(apiResponse => {
        if (apiResponse.tipo === 'ESTOQUE') {
            processarRespostaEstoque(apiResponse);
        } else {
            processarRespostaTitulos(apiResponse);
        }
    });
}

function processarRespostaEstoque(apiResponse) {
    const matrizEstoque = { '(+) Estoque': {} };
    if (apiResponse.response && Array.isArray(apiResponse.response.Saldos)) {
        apiResponse.response.Saldos.forEach(saldo => {
            if(saldo.Periodo) {
                matrizEstoque['(+) Estoque'][saldo.Periodo] = (matrizEstoque['(+) Estoque'][saldo.Periodo] || 0) + saldo.Valor;
            }
        });
    }
    appCache.matrizesEstoquePorProjeto.set(apiResponse.projId, matrizEstoque);
}

function processarRespostaTitulos(apiResponse) {
    const { reqContext, response } = apiResponse;
    const { contaId, anoOuTag, projecao } = reqContext;
    const saldoInicialApi = Number(response?.saldoInicial || 0);
    const contaMeta = appCache.contasMap.get(contaId);
    const saldoInicialBase = contaMeta ? Number(contaMeta.saldoIni) : saldoInicialApi;

    if (projecao === "arealizar") {
        let saldoAcumulado = saldoInicialBase;
        const anoAtual = new Date().getFullYear();

        // Para 'A Realizar', precisamos do saldo consolidado do Realizado do ano corrente até a data atual
        if (response.dadosRealizado?.length > 2) {
            try {
                const dadosCY = { lancamentosProcessados: JSON.parse(`[${response.dadosRealizado}]`) };
                const bucketsCY = processarDadosConta(dadosCY, appCache.dicionarios, contaId, saldoInicialBase);
                
                // Soma os caixas finais de todos os projetos no ano corrente
                Object.values(bucketsCY).forEach(bucket => {
                    if (bucket && bucket.dre && bucket.dre['Caixa Final']) {
                        const colunas = Object.keys(bucket.dre['Caixa Final']);
                        if (colunas.length > 0) {
                            // Pegamos o último mês processado para acumular o saldo
                            const ultimaColuna = colunas.sort()[colunas.length - 1]; 
                            saldoAcumulado += (bucket.dre['Caixa Final'][ultimaColuna] || 0);
                        }
                    }
                });
            } catch (e) { console.error("Erro parse Realizado CY", e); }
        }

        let dadosInput = { titulosEmAberto: [], capitalDeGiro: [] };
        if (response.dadosArealizar?.length > 2) {
            try { dadosInput.titulosEmAberto = JSON.parse(`[${response.dadosArealizar}]`); } catch (e) {}
        }
        
        const buckets = processarDadosConta(dadosInput, appCache.dicionarios, contaId, saldoInicialBase);
        if (dadosInput.capitalDeGiro.length > 0) {
            processarCapitalDeGiro(dadosInput.capitalDeGiro, buckets, contaId, "realizado");
        }

        appCache.dadosPorContaAno.set(`${contaId}|AREALIZAR`, buckets);

    } else {
        // Modo Realizado Convencional
        let dadosInput = { lancamentosProcessados: [], capitalDeGiro: [] };
        
        if (response.dadosLancamentos?.length > 2) {
            try { dadosInput.lancamentosProcessados = JSON.parse(`[${response.dadosLancamentos}]`); } catch (e) {}
        }
        if (response.dadosCapitalG?.length > 2) {
            try { dadosInput.capitalDeGiro = JSON.parse(`[${response.dadosCapitalG}]`); } catch (e) {}
        }

        const buckets = processarDadosConta(dadosInput, appCache.dicionarios, contaId, saldoInicialBase);
        
        if (dadosInput.capitalDeGiro.length > 0) {
            processarCapitalDeGiro(dadosInput.capitalDeGiro, buckets, contaId);
        }

        appCache.dadosPorContaAno.set(`${contaId}|${anoOuTag}`, buckets);
    }
}

function stepAtualizarAnosPeloCache(contasSelecionadas) {
    const anoAtual = new Date().getFullYear();
    let minAno = anoAtual, maxAno = anoAtual;

    contasSelecionadas.forEach(contaId => {
        const buckets = appCache.dadosPorContaAno.get(`${contaId}|AREALIZAR`);
        if (buckets) {
            Object.values(buckets).forEach(bucket => {
                bucket.chavesEncontradas.forEach(chave => {
                    const ano = parseInt(chave.split('-')[1], 10);
                    if (!isNaN(ano)) {
                        if (ano < minAno) minAno = ano;
                        if (ano > maxAno) maxAno = ano;
                    }
                });
            });
        }
    });

    appCache.flagAnos = true;
    const elmModo = document.getElementById('modoSelect');
    atualizarOpcoesAnoSelect(null, minAno, maxAno, elmModo.value, appCache.projecao);
    appCache.flagAnos = false;
}

function stepConsolidarExibir(filtros) {
    const { contas, anos, modo, colunas, projetos } = filtros;
    const estruturasParaMerge = [];
    const projetosSet = new Set(projetos.map(String));

    // 1. Coleta e Filtra os Buckets Cacheados
    if (appCache.projecao === "realizado") {
        const anosVisiveis = [...anos].sort();
        contas.forEach(contaId => {
            anosVisiveis.forEach(ano => {
                const buckets = appCache.dadosPorContaAno.get(`${contaId}|${ano}`);
                if (buckets) {
                    Object.entries(buckets).forEach(([projKey, estrutura]) => {
                        if (projKey === 'SEM_PROJETO' || projetosSet.has(projKey)) {
                            estruturasParaMerge.push(estrutura);
                        }
                    });
                }
            });
        });
    } else {
        contas.forEach(contaId => {
            const buckets = appCache.dadosPorContaAno.get(`${contaId}|AREALIZAR`);
            if (buckets) {
                Object.entries(buckets).forEach(([projKey, estrutura]) => {
                    if (projKey === 'SEM_PROJETO' || projetosSet.has(projKey)) {
                        estruturasParaMerge.push(estrutura);
                    }
                });
            }
        });
    }

    // 2. Realiza o Merge (Processamento Core)
    const dadosConsolidados = mergeMatrizes(estruturasParaMerge, modo, colunas);

    // 3. Adiciona os dados de Estoque ao consolidado
    dadosConsolidados.dadosEstoque = { '(+) Estoque': {} };
    projetos.forEach(id => {
        const est = appCache.matrizesEstoquePorProjeto.get(id);
        if (est && est['(+) Estoque']) {
            Object.keys(est['(+) Estoque']).forEach(periodo => {
                dadosConsolidados.dadosEstoque['(+) Estoque'][periodo] = 
                    (dadosConsolidados.dadosEstoque['(+) Estoque'][periodo] || 0) + est['(+) Estoque'][periodo];
            });
        }
    });

    // 4. Calcula Colunas Placeholder (se houver buracos temporais)
    let colunasPlaceholder = [];
    const targetSize = modo.toLowerCase() === 'anual' ? 6 : 12;
    const missingCount = Math.max(0, targetSize - colunas.length);
    
    if (missingCount > 0) {
        let ultimaReferencia = colunas.length > 0 
            ? colunas[colunas.length - 1] 
            : (modo.toLowerCase() === 'anual' ? new Date().getFullYear().toString() : `12-${new Date().getFullYear() - 1}`);

        for (let i = 0; i < missingCount; i++) {
            let proxima = modo.toLowerCase() === 'anual' ? String(Number(ultimaReferencia) + 1) : incrementarMes(ultimaReferencia);
            if (proxima) {
                colunasPlaceholder.push(proxima);
                ultimaReferencia = proxima;
            }
        }
    }

    // 5. Aciona a UI
    atualizarVisualizacoes(dadosConsolidados, colunas, colunasPlaceholder, appCache);
}

function exibirTabelasVazias() {
    const anoAtual = String(new Date().getFullYear());
    const modoAtual = document.getElementById('modoSelect')?.value || 'mensal';
    const colunasVazias = (modoAtual.toLowerCase() === 'anual')
        ? [anoAtual]
        : Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}-${anoAtual}`);
    
    atualizarVisualizacoes(
        { dre: {}, detalhamento: {}, entradasSaidas: {}, capitalGiro: {}, fluxoDiario: [], dadosEstoque: {} }, 
        colunasVazias, [], appCache
    );
    alternarEstadoCarregamento(false);
}

// --- Inicialização (Entry Point do Bubble) ---
window.IniciarDoZero = async function(deptosJson, id, type, contasJson, classesJson, projetosJson) {
    // Reseta Cache Global
    appCache.userId = id;
    appCache.userType = type;
    appCache.dadosPorContaAno.clear();
    appCache.periodosPorConta.clear();
    appCache.matrizesEstoquePorProjeto.clear();
    appCache.dicionarios.categoriasMap.clear();
    appCache.dicionarios.classesMap.clear();
    appCache.dicionarios.departamentosMap.clear();
    appCache.projetosMap.clear();
    appCache.contasMap.clear();
    appCache.projecao = "realizado";
    appCache.flagAnos = false;
    
    try {
        // Parse de Dicionários
        JSON.parse(classesJson).forEach(c => {
            appCache.dicionarios.classesMap.set(c.codigo, { classe: c.Classe, categoria: c.Categoria });
            appCache.dicionarios.categoriasMap.set(c.codigo, c.Categoria);
        });
        JSON.parse(deptosJson).forEach(d => {
            appCache.dicionarios.departamentosMap.set(String(d.codigo), d.descricao);
        });
        
        // Parse de Entidades
        JSON.parse(projetosJson).forEach(p => {
            appCache.projetosMap.set(String(p.codProj), { nome: p.nomeProj, contas: (p.contas || []).map(String) });
        });
        JSON.parse(contasJson).forEach(c => {
            appCache.contasMap.set(String(c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni });
        });

        // Configura e Dispara Filtro Inicial
        configurarFiltros(appCache, [String(new Date().getFullYear())], handleFiltroChange);
    } catch (e) {
        console.error("Erro na inicialização da aplicação:", e);
    }
};