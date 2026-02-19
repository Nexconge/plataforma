// mainV25.js

import { buscarTitulos, buscarValoresEstoque, buscarPeriodosComDados } from './apiV04.js';
import { processarDadosDaConta, extrairDadosDosTitulos, extrairLancamentosSimples, mergeMatrizes, incrementarMes} from './processingV11.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect, alternarEstadoCarregamento } from './uiV041.js';

// --- Cache da Aplicação ---
let appCache = {
    userId: null,  
    userType: null,

    dadosPorContaAno: new Map(),        // Cache de dados processados por conta e ano/tag (chave: "contaId|anoOuTag")
    matrizesPorProjeto: new Map(),      // Cache de estoque por projeto (chave: codProj)
    periodosPorConta: new Map(),        // Cache de metadados de datas por conta e projeção (chave: "contaId|projecao" -> { inicio, fim })
    
    categoriasMap: new Map(), //CODCategoria -> NomeCategoria
    classesMap: new Map(), //CODCategoria -> { classe: NomeClasse, categoria: NomeCategoria }
    projetosMap: new Map(), //CODProj -> { nome: NomeProjeto, contas: [codContas] }
    contasMap: new Map(), //CODConta -> { descricao: NomeConta, saldoIni: Valor }
    departamentosMap: new Map(), //CODDepto -> NomeDepto
    
    // Estado atual
    projecao: "realizado",
    flagAnos: false
};

// --- Função Principal de Controle ---
async function handleFiltroChange() {
    if (appCache.flagAnos) return; 
    
    alternarEstadoCarregamento(true); //Exibe o visual de loading
    try {

        //Obtem os filtros atuais da UI (contas, anos, modo, colunas, projetos)
        let filtrosAtuais = obterFiltrosAtuais();
        
        //Se não houver filtros válidos, exibe tabelas vazias e encerra o processo (evitando chamadas desnecessárias à API)
        if (!filtrosAtuais) {
            alternarEstadoCarregamento(false);
            return; 
        }
        if (!validarFiltros(filtrosAtuais)) {
            alternarEstadoCarregamento(false);
            return;
        }

        if (appCache.projecao === 'arealizar') {
            // Antes de carregar, forçamos uma validação de datas.
            // Se o usuário estava em um ano passado em realizado e mudar para arealizar atualiza o filtro de anos
            const anoAtual = new Date().getFullYear();
            appCache.flagAnos = true;

            // Define um range seguro inicial (Ano Atual + 5) para garantir que saia do passado
            atualizarOpcoesAnoSelect(null, anoAtual, anoAtual + 5, filtrosAtuais.modo, 'arealizar');
            appCache.flagAnos = false;

            // Atualiza filtrosAtuais para obter o periodo atualizado acima
            filtrosAtuais = obterFiltrosAtuais();

            // 1. Carrega os dados com o filtro já corrigido
            await stepCarregarProcessarDados(filtrosAtuais);

            // 2. Analisa os dados em cache da conta selecionada para identificar quais anos realmente existem e atualizar o filtro de anos novamente
            stepAtualizarAnosPeloCache(filtrosAtuais.contas);

            // 3. Atualiza filtrosAtuais novamente
            filtrosAtuais = obterFiltrosAtuais();

        } else {
            // MODO REALIZADO:
            // 1. Pergunta à API quais anos existem (metadados) e ajusta o filtro se necessário
            await stepGerenciarPeriodos(filtrosAtuais.contas);
            
            // 2. Atualiza filtros, pois stepGerenciarPeriodos pode ter mudado o ano (ex: de 2030 p/ 2024)
            filtrosAtuais = obterFiltrosAtuais();
            
            // 3. Carrega os dados do ano específico correto
            await stepCarregarProcessarDados(filtrosAtuais);
        }

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
    //Se não houver contas selecionadas, não faz sentido continuar. Exibe tabelas vazias e encerra o processo.
    if (!filtros || filtros.contas.length === 0) {
        exibirTabelasVazias();
        return false;
    }
    return true;
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
            // Este processamento serve apenas para calcular o saldo final do realizado e usar como saldo inicial do a realizar
            // PORTANDO É NECESSÁRIO PASSAR O ANO ATUAL COMO FILTRO PARA IMPEDIR QUE BAIXAS DE OUTROS ANOS INFLUENCIEM NO CÁLCULO
            const extractedCY = extrairDadosDosTitulos(JSON.parse(`[${response.dadosRealizado}]`), contaId, anoAtual);
            const processedCY = processarDadosDaConta(appCache, extractedCY, contaId, saldoInicialApi);
            
            // --- CORREÇÃO AQUI ---
            // Como os dados agora são segmentados por projeto, precisamos somar o valor total de todos os segmentos
            if (processedCY.isSegmented && processedCY.segments) {
                Object.values(processedCY.segments).forEach(segmento => {
                    if (segmento.realizado && segmento.realizado.valorTotal) {
                        valorAcumuladoRealizado += segmento.realizado.valorTotal;
                    }
                });
            } else if (processedCY.realizado) { // Fallback para manter compatibilidade
                valorAcumuladoRealizado = processedCY.realizado.valorTotal || 0;
            }
            
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
            dadosInput.titulos = extracted.titulosEmAberto;
        } catch (e) { console.error(`Erro JSON Arealizar conta ${contaId}`, e); }
    }

    const processedArealizar = processarDadosDaConta(appCache, dadosInput, contaId, saldoInicioArealizar);
    appCache.dadosPorContaAno.set(`${contaId}|AREALIZAR`, processedArealizar);
}

/**
 * Passo 1: Verifica se temos dados de início/fim para as contas.
 * Se não, busca na API e atualiza o Select de Anos na UI.
 */
async function stepGerenciarPeriodos(contasSelecionadas) {
    const projecaoAtual = appCache.projecao; // "realizado" ou "arealizar"
    //Contas cujo os periodos ainda não foram buscados via API
    const contasSemPeriodo = contasSelecionadas.filter(id => !appCache.periodosPorConta.has(`${id}|${projecaoAtual}`)); 

    // Para cada conta sem período, buscamos na API e atualizamos o cache
    if (contasSemPeriodo.length > 0) {
        document.body.classList.add('loading');
        
        const promises = contasSemPeriodo.map(id => 
            buscarPeriodosComDados(id, projecaoAtual).then(res => ({ id, res }))
        );
        const resultados = await Promise.all(promises);
        const anoAtual = new Date().getFullYear();

        // API retornar inicio e fim do pe´riodo, com base neles geramos os anos disponíveis para filtro.
        resultados.forEach(({ id, res }) => {
            //Se a API falhar ou retornar dados inválidos, assumimos o ano atual como único disponível para evitar quebrar a UI.
            let inicio = anoAtual, fim = anoAtual;
            if (res && res.response) {
                const { periodo_ini, periodo_fim } = res.response;
                if (periodo_ini) inicio = Number(String(periodo_ini).substring(0,4));
                if (periodo_fim) fim = Number(String(periodo_fim).substring(0,4));
            }
            appCache.periodosPorConta.set(`${id}|${projecaoAtual}`, { inicio, fim });
        });
    }

    // Calcula Range Global para o Calendário
    let minAno = new Date().getFullYear(); 
    let maxAno = minAno;
    
    // Se houve contasSelecionadas ajusta o range dos filtros para os períodos da conta.
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

    // Atualiza o Picker Global via UI
    appCache.flagAnos = true;
    const elmModo = document.getElementById('modoSelect');
    
    // Autaliza o select de anos para refletir as mudançcas, mas sem resetar o ano selecionado (passamos null para manter a seleção atual)
    atualizarOpcoesAnoSelect(null, minAno, maxAno, elmModo ? elmModo.value : 'mensal', appCache.projecao);
    appCache.flagAnos = false;
}
/**
 * Passo 2: Identifica o que falta no cache, busca na API e processa os dados crus.
 */
async function stepCarregarProcessarDados(filtros) {
    const { contas, anos, projetos } = filtros; // 'anos' agora é uma lista derivada do range
    const requisicoesNecessarias = [];

    // Identifica buracos no cache (por ANO)
    if (appCache.projecao === "realizado") {
        contas.forEach(contaId => {
            anos.forEach(ano => {
                const chaveCache = `${contaId}|${ano}`;
                if (!appCache.dadosPorContaAno.has(chaveCache)) {
                    // Se não temos dados processados para esta conta+ano, precisamos buscar da API
                    requisicoesNecessarias.push({ contaId, anoOuTag: ano, filtrosApi: String(ano) });
                    appCache.dadosPorContaAno.set(chaveCache, null);
                }
            });
        });
    } else {
        // A lógica do A REALIZAR permanece igual (traz tudo de uma vez com tag)
        const tagCache = "AREALIZAR";
        contas.forEach(contaId => {
            const chaveCache = `${contaId}|${tagCache}`;
            if (!appCache.dadosPorContaAno.has(chaveCache)) {
                requisicoesNecessarias.push({ contaId, anoOuTag: tagCache, filtrosApi: ["AREALIZAR"] });
                appCache.dadosPorContaAno.set(chaveCache, null); 
            }
        });
    }

    //Se não houver requisições necessárias para os títulos e os projetos já estiverem no cache, podemos pular direto para a etapa de renderização.
    if (requisicoesNecessarias.length === 0 && verificarCacheProjetos(projetos)) return;

    //Realiza as requisições pendentes de titulos 
    const promises = requisicoesNecessarias.map(req => 
        buscarTitulos({ conta: req.contaId, ano: req.filtrosApi })
            .then(resultado => ({ ...resultado, reqContext: req, tipo: 'TITULOS' })) 
    );

    //Realiza as requisições pendentes de estoque
    const projetosParaProcessar = projetos.filter(p => !appCache.matrizesPorProjeto.has(p));
    if(projetosParaProcessar.length > 0) {
        promises.push(...projetosParaProcessar.map(proj => 
            buscarValoresEstoque({ periodos: filtros.colunas, projeto: [proj] })
            .then(res => ({ ...res, tipo: 'ESTOQUE', projId: proj }))
        ));
    }

    // Aguarda todas as requisições (títulos e estoque) serem concluídas
    const responses = await Promise.all(promises);

    // Salva os dados no cache e processa os dados de títulos imediatamente para evitar acumular objetos grandes na memória
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
/**
 * Passo Especial (A Realizar): Varre o cache de dados já carregados
 * para determinar dinamicamente quais anos devem aparecer no filtro.
 */
function stepAtualizarAnosPeloCache(contasSelecionadas) {
    const anoAtual = new Date().getFullYear();
    let minAno = anoAtual;
    let maxAno = anoAtual;

    contasSelecionadas.forEach(contaId => {
        const dados = appCache.dadosPorContaAno.get(`${contaId}|AREALIZAR`);
        
        // --- CORREÇÃO AQUI ---
        // Itera sobre os segmentos de projeto para achar os anos
        if (dados && dados.isSegmented && dados.segments) {
            Object.values(dados.segments).forEach(segmento => {
                if (segmento.arealizar && segmento.arealizar.chavesComDados) {
                    segmento.arealizar.chavesComDados.forEach(chave => {
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
            });
        }
    });

    appCache.flagAnos = true;
    const elmModo = document.getElementById('modoSelect');
    atualizarOpcoesAnoSelect(null, minAno, maxAno, elmModo.value, appCache.projecao);
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
        saldoInicialConsolidado,
        projetos
    );

    let colunasPlaceholder = [];
    const colunasSize = colunas.length;
    
    // Define o alvo (12 meses ou 6 anos)
    const targetSize = modo.toLowerCase() === 'anual' ? 6 : 12;
    // Calcula quantos faltam
    const missingCount = Math.max(0, targetSize - colunasSize);
    if (missingCount > 0) {
        // Ex: Se tem ['01-2026', '02-2026'], a referência vira '02-2026'
        let ultimaReferencia = colunas.length > 0 
            ? colunas[colunas.length - 1] 
            : (modo.toLowerCase() === 'anual' ? new Date().getFullYear().toString() : `12-${new Date().getFullYear() - 1}`);

        for (let i = 0; i < missingCount; i++) {
            let proxima;
            if (modo.toLowerCase() === 'anual') {
                // Incrementa ano
                proxima = String(Number(ultimaReferencia) + 1);
            } else {
                // Incrementa mês usando sua função auxiliar
                proxima = incrementarMes(ultimaReferencia);
            }
            if (proxima) {
                colunasPlaceholder.push(proxima);
                ultimaReferencia = proxima;
            }
        }
    }

    atualizarVisualizacoes(dadosParaExibir, colunas, colunasPlaceholder, appCache);
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