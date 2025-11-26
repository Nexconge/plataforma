// mainV01.js
import { buscarTitulos, buscarValoresEstoque } from './apiV03.js';
import { processarDadosDaConta, extrairDadosDosTitulos, mergeMatrizes } from './processingV02.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect } from './uiV01.js';

let appCache = {
    userId: null, 
    userType: null,
    // MUDANÇA: Cache agora armazena "ContaID|Ano" ou "ContaID|AREALIZAR"
    dadosPorContaAno: new Map(), 
    matrizesPorProjeto: new Map(),
    categoriasMap: new Map(), 
    classesMap: new Map(),
    projetosMap: new Map(), 
    contasMap: new Map(), 
    departamentosMap: new Map(),
    projecao: "realizado",
    flagAnos: false
};

async function handleFiltroChange() {
    if (appCache.flagAnos) return; 
    document.body.classList.add('loading');
    
    let filtrosAtuais = obterFiltrosAtuais();
    const contasSelecionadas = filtrosAtuais ? filtrosAtuais.contas : [];
    const projetosSelecionados = filtrosAtuais ? filtrosAtuais.projetos : [];
    
    if (contasSelecionadas.length === 0) {
        exibirTabelasVazias();
        return;
    }

    // 1. Identificar Requisições Necessárias (Cache Miss)
    const requisicoesNecessarias = [];

    if (appCache.projecao === "realizado") {
        // MODO REALIZADO: Busca granular por ANO
        const anosSelecionados = filtrosAtuais.anos; 
        contasSelecionadas.forEach(contaId => {
            anosSelecionados.forEach(ano => {
                const chaveCache = `${contaId}|${ano}`;
                if (!appCache.dadosPorContaAno.has(chaveCache)) {
                    requisicoesNecessarias.push({ 
                        contaId, 
                        anoOuTag: ano, 
                        filtrosApi: [ano] // API recebe array de anos
                    });
                    // Define placeholder para evitar requests duplicados
                    appCache.dadosPorContaAno.set(chaveCache, null); 
                }
            });
        });
    } else {
        // MODO A REALIZAR: Busca pacote único "Tudo em Aberto"
        const tagCache = "AREALIZAR";
        contasSelecionadas.forEach(contaId => {
            const chaveCache = `${contaId}|${tagCache}`;
            if (!appCache.dadosPorContaAno.has(chaveCache)) {
                requisicoesNecessarias.push({ 
                    contaId, 
                    anoOuTag: tagCache, 
                    filtrosApi: ["AREALIZAR"] // Flag para API
                });
                appCache.dadosPorContaAno.set(chaveCache, null); 
            }
        });
    }

    // 2. Disparar Requisições
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

        // 3. Processar Respostas e Atualizar Cache
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
            const chaveCache = `${contaId}|${anoOuTag}`;
            
            // Captura saldo e movimentos da API
            const saldoInicialApi = response && response.saldoInicial ? Number(response.saldoInicial) : 0;
            const movimentosRaw = response && response.movimentos ? response.movimentos : "";

            let dadosExtraidos = { lancamentos: [], titulos: [], capitalDeGiro: [] };
            
            if (movimentosRaw && movimentosRaw.length > 2) {
                try {
                    const titulosJson = JSON.parse(`[${movimentosRaw}]`);
                    dadosExtraidos = extrairDadosDosTitulos(titulosJson, contaId);
                } catch (e) {
                    console.error(`Erro processamento JSON conta ${contaId}`, e);
                }
            }

            // Processa usando o saldo fornecido pela API
            const dadosProcessados = processarDadosDaConta(appCache, dadosExtraidos, contaId, saldoInicialApi);
            appCache.dadosPorContaAno.set(chaveCache, dadosProcessados);
        }
    }

    // 4. Coletar Dados para Consolidação (Merge)
    const dadosParaJuntar = [];
    let saldoInicialConsolidado = 0;

    if (appCache.projecao === "realizado") {
        // Coleta apenas os anos selecionados no filtro
        const anosVisiveis = filtrosAtuais.anos.sort();
        const primeiroAno = anosVisiveis[0];

        contasSelecionadas.forEach(contaId => {
            anosVisiveis.forEach(ano => {
                const dados = appCache.dadosPorContaAno.get(`${contaId}|${ano}`);
                if (dados) {
                    dadosParaJuntar.push(dados);
                    // MUDANÇA: Soma saldo inicial apenas do primeiro ano do período visualizado
                    if (ano === primeiroAno) {
                        saldoInicialConsolidado += (dados.saldoInicialBase || 0);
                    }
                }
            });
        });
    } else {
        // Modo "A REALIZAR"
        contasSelecionadas.forEach(contaId => {
            const dados = appCache.dadosPorContaAno.get(`${contaId}|AREALIZAR`);
            if (dados) {
                dadosParaJuntar.push(dados);
                // Soma o acumulado de todas as contas, pois a API já mandou o saldo "hoje"
                saldoInicialConsolidado += (dados.saldoInicialBase || 0);
            }
        });
    }

    const dadosEstoque = projetosSelecionados.map(id => appCache.matrizesPorProjeto.get(id)).filter(Boolean);

    // 5. Atualizar Opções de Filtro de Ano (UI)
    let anosDisponiveisSet = new Set();
    
    // Descobre anos disponíveis no cache para o modo atual
    for (const [key, dados] of appCache.dadosPorContaAno.entries()) {
        const [, tag] = key.split('|');
        if (appCache.projecao === "realizado" && tag !== "AREALIZAR") {
             anosDisponiveisSet.add(tag);
        } else if (appCache.projecao === "arealizar" && tag === "AREALIZAR") {
             if (dados.arealizar && dados.arealizar.chavesComDados) {
                 dados.arealizar.chavesComDados.forEach(k => anosDisponiveisSet.add(k.split('-')[1]));
             }
        }
    }

    let anosArray = Array.from(anosDisponiveisSet).sort();
    if (anosArray.length === 0) anosArray.push(String(new Date().getFullYear()));
    
    appCache.flagAnos = true;
    atualizarOpcoesAnoSelect(document.getElementById('anoSelect'), anosArray, document.getElementById('modoSelect').value, appCache.projecao);
    appCache.flagAnos = false;

    // Recarrega filtros para garantir consistência com a UI
    filtrosAtuais = obterFiltrosAtuais(); 

    // 6. Merge e Renderização
    const dadosParaExibir = mergeMatrizes(
        dadosParaJuntar, 
        filtrosAtuais.modo, 
        filtrosAtuais.colunas, 
        appCache.projecao, 
        dadosEstoque,
        saldoInicialConsolidado // MUDANÇA: Passa o saldo calculado corretamente
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
    
    const dadosVaziosParaExibir = {
        matrizDRE: {}, matrizDetalhamento: {}, entradasESaidas: {}, matrizCapitalGiro: {}
    };
    atualizarVisualizacoes(dadosVaziosParaExibir, colunasVazias, appCache);
    document.body.classList.remove('loading');
}

/**
 * Função de inicialização
 */
window.IniciarDoZero = async function(deptosJson, id, type, contasJson, classesJson, projetosJson) {
    appCache = {
        userId: id, userType: type,
        dadosPorContaAno: new Map(), // Novo mapa granular
        matrizesPorProjeto: new Map(),
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
    projetos.forEach(p => appCache.projetosMap.set(String(p.codProj), { nome: p.nomeProj, contas: (p.contas || []).map(String) }));
    contas.forEach(c => appCache.contasMap.set((c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni })); // saldoIni aqui fica como fallback, mas o principal vem da API
    departamentos.forEach(d => appCache.departamentosMap.set(String(d.codigo), d.descricao));

    const anoAtual = [String(new Date().getFullYear())];
    configurarFiltros(appCache, anoAtual, handleFiltroChange);
};