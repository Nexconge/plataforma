// mainV25.js

import { buscarTitulos, buscarValoresEstoque, buscarPeriodosComDados } from './apiV01.js';
import { processarDadosDaConta, extrairDadosDosTitulos, extrairLancamentosSimples, mergeMatrizes } from './processingV01.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect, alternarEstadoCarregamento } from './uiV04.js';

// --- Cache da Aplicação ---
let appCache = {
    userId: null, 
    userType: null,
    dadosPorContaAno: new Map(),        // Cache de dados processados
    matrizesPorProjeto: new Map(),      // Cache de estoque
    periodosPorConta: new Map(),        // Cache de metadados de datas
    // Mapas de referência cruzada
    categoriasMap: new Map(), 
    classesMap: new Map(),
    projetosMap: new Map(), 
    contasMap: new Map(), 
    departamentosMap: new Map(),
    // Estado atual
    projecao: "realizado",
    flagAnos: false
};

// --- Função Principal de Controle ---
async function handleFiltroChange() {
    if (appCache.flagAnos) return; 
    
    alternarEstadoCarregamento(true);
    
    try {
        let filtrosAtuais = obterFiltrosAtuais();
        
        if (!validarFiltros(filtrosAtuais)) {
            alternarEstadoCarregamento(false);
            return;
        }

        // --- ALTERAÇÃO AQUI: Lógica bifurcada para Realizado vs A Realizar ---

        if (appCache.projecao === 'arealizar') {
            // MODO A REALIZAR:
            // 1. Carrega os dados PRIMEIRO (pois a API já traz tudo futuro)
            await stepCarregarProcessarDados(filtrosAtuais);

            // 2. Analisa os dados carregados para descobrir o range de anos (Min/Max)
            stepAtualizarAnosPeloCache(filtrosAtuais.contas);

            // 3. Atualiza objeto de filtros (pois o 'anoSelect' pode ter mudado visualmente)
            filtrosAtuais = obterFiltrosAtuais();

        } else {
            // MODO REALIZADO (Comportamento original):
            // 1. Pergunta à API quais anos existem (metadados)
            await stepGerenciarPeriodos(filtrosAtuais.contas);
            
            // 2. Atualiza filtros e Carrega os dados do ano específico
            filtrosAtuais = obterFiltrosAtuais();
            await stepCarregarProcessarDados(filtrosAtuais);
        }

        // --- FIM DA ALTERAÇÃO ---

        // ETAPA FINAL: Renderização
        stepConsolidarExibir(filtrosAtuais);

    } catch (erroFatal) {
        console.error("Erro fatal em handleFiltroChange:", erroFatal);
        alert("Ocorreu um erro ao processar os dados.");
    } finally {
        alternarEstadoCarregamento(false);
    }
}


// --- Funções Auxiliares do Workflow (Steps) ---
function validarFiltros(filtros) {
    if (!filtros || filtros.contas.length === 0) {
        exibirTabelasVazias();
        return false;
    }
    return true;
}

/**
 * Passo 1: Verifica se temos metadados de início/fim para as contas.
 * Se não, busca na API e atualiza o Select de Anos na UI.
 */
async function stepGerenciarPeriodos(contasSelecionadas) {
    const projecaoAtual = appCache.projecao;
    const contasSemPeriodo = contasSelecionadas.filter(id => !appCache.periodosPorConta.has(`${id}|${projecaoAtual}`));

    if (contasSemPeriodo.length > 0) {
        document.body.classList.add('loading');
        
        // Busca paralela
        const promises = contasSemPeriodo.map(id => 
            buscarPeriodosComDados(id, projecaoAtual).then(res => ({ id, res }))
        );
        const resultados = await Promise.all(promises);
        const anoAtual = new Date().getFullYear();

        // Atualiza cache de períodos
        resultados.forEach(({ id, res }) => {
            let inicio = anoAtual, fim = anoAtual;
            if (res && res.response) {
                const { periodo_ini, periodo_fim } = res.response;
                if (periodo_ini && Number(periodo_ini) > 1900) inicio = Number(periodo_ini);
                else if (periodo_ini) inicio = new Date(periodo_ini).getFullYear();

                if (periodo_fim && Number(periodo_fim) > 1900) fim = Number(periodo_fim);
                else if (periodo_fim) fim = new Date(periodo_fim).getFullYear();
            }
            appCache.periodosPorConta.set(`${id}|${projecaoAtual}`, { inicio, fim });
        });
    }

    // Calcula Range Global (Min/Max entre todas as contas selecionadas)
    let minAno = null, maxAno = null;
    const anoRef = new Date().getFullYear();
    
    contasSelecionadas.forEach(id => {
        const p = appCache.periodosPorConta.get(`${id}|${projecaoAtual}`);
        if (p) {
            if (minAno === null || p.inicio < minAno) minAno = p.inicio;
            if (maxAno === null || p.fim > maxAno) maxAno = p.fim;
        }
    });

    // Atualiza UI
    appCache.flagAnos = true;
    const elmAno = document.getElementById('anoSelect');
    const elmModo = document.getElementById('modoSelect');
    if(elmAno && elmModo) {
        atualizarOpcoesAnoSelect(elmAno, minAno || anoRef, maxAno || anoRef, elmModo.value, appCache.projecao);
    }
    appCache.flagAnos = false;
}

/**
 * Passo 2: Identifica o que falta no cache, busca na API e processa os dados crus.
 */
async function stepCarregarProcessarDados(filtros) {
    const { contas, anos, projetos } = filtros;
    const requisicoesNecessarias = [];

    // Identifica "buracos" no cache
    if (appCache.projecao === "realizado") {
        contas.forEach(contaId => {
            anos.forEach(ano => {
                const chaveCache = `${contaId}|${ano}`;
                if (!appCache.dadosPorContaAno.has(chaveCache)) {
                    requisicoesNecessarias.push({ contaId, anoOuTag: ano, filtrosApi: [ano] });
                    appCache.dadosPorContaAno.set(chaveCache, null); // Placeholder
                }
            });
        });
    } else {
        const tagCache = "AREALIZAR";
        contas.forEach(contaId => {
            const chaveCache = `${contaId}|${tagCache}`;
            if (!appCache.dadosPorContaAno.has(chaveCache)) {
                requisicoesNecessarias.push({ contaId, anoOuTag: tagCache, filtrosApi: ["AREALIZAR"] });
                appCache.dadosPorContaAno.set(chaveCache, null); 
            }
        });
    }

    // Se tudo já está em cache, retorna cedo
    if (requisicoesNecessarias.length === 0 && verificarCacheProjetos(projetos)) return;

    // Prepara Promises de Títulos
    const promises = requisicoesNecessarias.map(req => 
        buscarTitulos({ contas: [req.contaId], anos: req.filtrosApi })
            .then(resultado => ({ ...resultado, reqContext: req, tipo: 'TITULOS' })) 
    );

    // Prepara Promises de Estoque
    const projetosParaProcessar = projetos.filter(p => !appCache.matrizesPorProjeto.has(p));
    if(projetosParaProcessar.length > 0) {
        promises.push(...projetosParaProcessar.map(proj => 
            buscarValoresEstoque({ periodos: filtros.colunas, projeto: [proj] })
            .then(res => ({ ...res, tipo: 'ESTOQUE', projId: proj }))
        ));
    }

    const responses = await Promise.all(promises);

    // Processa Respostas
    for (const apiResponse of responses) {
        if (apiResponse.tipo === 'ESTOQUE') {
            processarRespostaEstoque(apiResponse);
        } else {
            processarRespostaTitulos(apiResponse);
        }
    }
}

function verificarCacheProjetos(projetos) {
    return projetos.every(p => appCache.matrizesPorProjeto.has(p));
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
    appCache.matrizesPorProjeto.set(apiResponse.projId, matrizEstoque);
}

function processarRespostaTitulos(apiResponse) {
    const { reqContext, response } = apiResponse;
    const { contaId, anoOuTag } = reqContext;
    const saldoInicialApi = response && response.saldoInicial ? Number(response.saldoInicial) : 0;
    const anoAtual = new Date().getFullYear();

    if (appCache.projecao === "arealizar") {
        // Lógica Específica A REALIZAR (depende do realizado do ano corrente)
        processarModoARealizar(contaId, anoAtual, response, saldoInicialApi);
    } else {
        // Lógica Padrão REALIZADO
        //console.log('processar realizado', contaId, anoOuTag, response);
        processarModoRealizado(contaId, anoOuTag, response, saldoInicialApi);
    }
}

function processarModoRealizado(contaId, anoOuTag, response, saldoInicialApi) {
    let dadosInput = { lancamentos: [], titulos: [], capitalDeGiro: [] };
    
    // Listas temporárias para merge
    let lancamentosDeTitulos = [];
    let lancamentosManuais = [];

    // 1. Processar Títulos (Fonte: dadosCapitalG)
    // Passamos 'anoOuTag' para filtrar as baixas apenas deste ano
    if (response.dadosCapitalG?.length > 2) {
        try {
            const extractedCG = extrairDadosDosTitulos(JSON.parse(`[${response.dadosCapitalG}]`), contaId, anoOuTag);
            lancamentosDeTitulos = extractedCG.lancamentosProcessados;
            dadosInput.capitalDeGiro = extractedCG.capitalDeGiro;
        } catch (e) { console.error(`Erro JSON CapitalG conta ${contaId}`, e); }
    }

    // 2. Processar Lançamentos Manuais (Fonte: dadosLancamentos)
    // Também filtramos pelo ano para garantir consistência
    if (response.dadosLancamentos?.length > 2) {
        try {
            lancamentosManuais = extrairLancamentosSimples(JSON.parse(`[${response.dadosLancamentos}]`), contaId, anoOuTag);
        } catch (e) { console.error(`Erro JSON LancamentosManuais conta ${contaId}`, e); }
    }

    // 3. Merge: DRE Realizado = Baixas de Títulos (deste ano) + Lançamentos Manuais (deste ano)
    dadosInput.lancamentos = [...lancamentosDeTitulos, ...lancamentosManuais];

    // Processamento final
    const processed = processarDadosDaConta(appCache, dadosInput, contaId, saldoInicialApi);
    appCache.dadosPorContaAno.set(`${contaId}|${anoOuTag}`, processed);
}

function processarModoARealizar(contaId, anoAtual, response, saldoInicialApi) {
    // 1. Processa "Realizado CY" apenas para calcular saldo acumulado até hoje
    let valorAcumuladoRealizado = 0;
    if (response.dadosRealizado?.length > 2) {
        try {
            //Este processamento serve apenas para calcular o saldo final do realizado e usar como saldo inicial do a realizar
            //PORTANDO È NECESSÁRIO PASSAR O ANO ATUAL COMO FILTRO PARA INPEDIR QUE BAIXAS DE OUTROS ANOS INFLUENCIEM NO CÁLCULO
            const extractedCY = extrairDadosDosTitulos(JSON.parse(`[${response.dadosRealizado}]`), contaId, anoAtual);
            console.log('extracted realizado', extractedCY);
            const processedCY = processarDadosDaConta(appCache, extractedCY, contaId, saldoInicialApi);
            valorAcumuladoRealizado = processedCY.realizado.valorTotal || 0;
            
            // Salva cache do ano atual se não existir (side-effect útil)
            if (!appCache.dadosPorContaAno.has(`${contaId}|${anoAtual}`)) {
                appCache.dadosPorContaAno.set(`${contaId}|${anoAtual}`, processedCY);
            }
        } catch (e) { console.error(`Erro JSON RealizadoCY conta ${contaId}`, e); }
    }

    // 2. Calcula novo saldo inicial para projeção
    const saldoInicioArealizar = saldoInicialApi + valorAcumuladoRealizado;

    // 3. Processa dados A Realizar
    let dadosInput = { titulos: [] };
    if (response.dadosArealizar?.length > 2) {
        try {
            const extracted = extrairDadosDosTitulos(JSON.parse(`[${response.dadosArealizar}]`), contaId);
            console.log('extracted arealizar', extracted);
            dadosInput.titulos = extracted.titulosEmAberto;
        } catch (e) { console.error(`Erro JSON Arealizar conta ${contaId}`, e); }
    }

    const processedArealizar = processarDadosDaConta(appCache, dadosInput, contaId, saldoInicioArealizar);
    appCache.dadosPorContaAno.set(`${contaId}|AREALIZAR`, processedArealizar);
}
/**
 * Passo Especial (A Realizar): Varre o cache de dados já carregados
 * para determinar dinamicamente quais anos devem aparecer no filtro.
 */
function stepAtualizarAnosPeloCache(contasSelecionadas) {
    const anoAtual = new Date().getFullYear();
    let minAno = anoAtual;
    let maxAno = anoAtual;

    contasSelecionadas.forEach(contaId => {
        // Busca o pacote de dados "AREALIZAR" desta conta
        const dados = appCache.dadosPorContaAno.get(`${contaId}|AREALIZAR`);
        
        if (dados && dados.arealizar) {
            // Varre as chaves com dados (ex: "01-2025", "12-2028")
            if (dados.arealizar.chavesComDados) {
                dados.arealizar.chavesComDados.forEach(chave => {
                    const partes = chave.split('-');
                    if (partes.length === 2) {
                        const ano = parseInt(partes[1], 10);
                        if (!isNaN(ano)) {
                            if (ano < minAno) minAno = ano;
                            if (ano > maxAno) maxAno = ano;
                        }
                    }
                });
            }
        }
    });

    // Atualiza a UI (Select de Anos)
    appCache.flagAnos = true;
    const elmAno = document.getElementById('anoSelect');
    const elmModo = document.getElementById('modoSelect');
    
    if(elmAno && elmModo) {
        // Chama a função de UI existente passando o range descoberto nos dados
        // Nota: A função atualizarOpcoesAnoSelect já adiciona +5 anos de margem no modo arealizar,
        // mas agora ela respeitará se seus dados forem ALÉM desses 5 anos (ex: financiamento longo).
        atualizarOpcoesAnoSelect(elmAno, minAno, maxAno, elmModo.value, appCache.projecao);
    }
    appCache.flagAnos = false;
}

/**
 * Passo 3: Junta os dados processados de várias contas e atualiza a UI.
 */
function stepConsolidarExibir(filtros) {
    const dadosParaJuntar = [];
    let saldoInicialConsolidado = 0;

    const { contas, anos, modo, colunas, projetos } = filtros;

    if (appCache.projecao === "realizado") {
        const anosVisiveis = anos.sort();
        const primeiroAno = anosVisiveis[0];
        contas.forEach(contaId => {
            anosVisiveis.forEach(ano => {
                const dados = appCache.dadosPorContaAno.get(`${contaId}|${ano}`);
                if (dados) {
                    dadosParaJuntar.push(dados);
                    if (ano === primeiroAno) saldoInicialConsolidado += (dados.saldoInicialBase || 0);
                }
            });
        });
    } else {
        contas.forEach(contaId => {
            const dados = appCache.dadosPorContaAno.get(`${contaId}|AREALIZAR`);
            if (dados) {
                dadosParaJuntar.push(dados);
                saldoInicialConsolidado += (dados.saldoInicialBase || 0);
            }
        });
    }

    const dadosEstoque = projetos.map(id => appCache.matrizesPorProjeto.get(id)).filter(Boolean);

    const dadosParaExibir = mergeMatrizes(
        dadosParaJuntar, 
        modo, 
        colunas, 
        appCache.projecao, 
        dadosEstoque,
        saldoInicialConsolidado
    );

    atualizarVisualizacoes(dadosParaExibir, colunas, appCache);
}

// --- Funções de UI Auxiliares ---

function exibirTabelasVazias(){
    const anoAtual = String(new Date().getFullYear());
    const modoAtual = document.getElementById('modoSelect')?.value || 'mensal';
    const colunasVazias = (modoAtual.toLowerCase() === 'anual')
        ? [anoAtual]
        : Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}-${anoAtual}`);
    
    atualizarVisualizacoes(
        { matrizDRE: {}, matrizDetalhamento: {}, entradasESaidas: {}, matrizCapitalGiro: {}, fluxoDeCaixa: [], dadosEstoque: {} }, 
        colunasVazias, 
        appCache
    );
    document.body.classList.remove('loading');
}

// --- Inicialização (Entry Point) ---

window.IniciarDoZero = async function(deptosJson, id, type, contasJson, classesJson, projetosJson) {
    // Reinicia Cache
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
        // Parse de metadados
        JSON.parse(classesJson).forEach(c => {
            appCache.classesMap.set(c.codigo, { classe: c.Classe, categoria: c.Categoria });
            appCache.categoriasMap.set(c.codigo, c.Categoria);
        });
        JSON.parse(projetosJson).forEach(p => 
            appCache.projetosMap.set(String(p.codProj), { nome: p.nomeProj, contas: (p.contas || []).map(String) })
        );
        JSON.parse(contasJson).forEach(c => 
            appCache.contasMap.set((c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni })
        );
        JSON.parse(deptosJson).forEach(d => 
            appCache.departamentosMap.set(String(d.codigo), d.descricao)
        );

        // Dispara UI Inicial
        configurarFiltros(appCache, [String(new Date().getFullYear())], handleFiltroChange);
    } catch (e) {
        console.error("Erro na inicialização da aplicação:", e);
    }
};