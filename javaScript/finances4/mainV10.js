// main.js - MODIFICADO

// --- Importa as funções de cada módulo especializado ---
import { buscarTitulos } from './apiV02.js';
import { processarLancamentos, extrairLancamentosDosTitulos, mergeMatrizes } from './processingV09.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais } from './uiV07.js';

// --- O cache em memória foi reestruturado ---
let appCache = {
    userId: null, userType: null,
    matrizesPorConta: new Map(),
    categoriasMap: new Map(), classesMap: new Map(),
    projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
    anosDisponiveis: []
};

/**
 * Função central que é chamada sempre que um filtro é alterado.
 */
async function handleFiltroChange() {
    document.body.classList.add('loading');

    // 1. Obter estado atual dos filtros
    const filtrosAtuais = obterFiltrosAtuais();
    const contasSelecionadas = filtrosAtuais ? filtrosAtuais.contas.map(Number) : [];

    if (contasSelecionadas.length === 0) {
        atualizarVisualizacoes(null, [], appCache); // Limpa a tela se nada for selecionado
        document.body.classList.remove('loading');
        return;
    }

    // 2. Identificar contas cujos dados processados AINDA NÃO estão no cache
    const contasParaProcessar = contasSelecionadas.filter(c => !appCache.matrizesPorConta.has(c));

    // 3. Se houver contas faltantes, buscar e processar APENAS elas, uma por uma
    if (contasParaProcessar.length > 0) {
        console.log(`Buscando e processando dados para ${contasParaProcessar.length} nova(s) conta(s)...`);
        
        // Coloca um placeholder no cache para evitar múltiplas buscas simultâneas
        contasParaProcessar.forEach(c => appCache.matrizesPorConta.set(c, null));

        const promises = contasParaProcessar.map(conta => buscarTitulos({ contas: [conta] }));
        const responses = await Promise.all(promises);

        // Processa a resposta de cada conta individualmente
        for (let i = 0; i < contasParaProcessar.length; i++) {
            const contaId = contasParaProcessar[i];
            const apiResponse = responses[i];
            
            let lancamentosDaConta = [];
            if (apiResponse && apiResponse.response && typeof apiResponse.response.movimentos === 'string' && apiResponse.response.movimentos.length > 2) {
                try {
                    const titulos = JSON.parse(`[${apiResponse.response.movimentos}]`);
                    const todosLancamentosExtraidos = extrairLancamentosDosTitulos(titulos);
                    // Filtra para garantir que estamos processando apenas lançamentos da conta correta
                    lancamentosDaConta = todosLancamentosExtraidos.filter(l => Number(l.CODContaC) === contaId);
                } catch (e) {
                    console.error(`Erro ao processar JSON para a conta ${contaId}:`, e);
                }
            }

            // Prepara os parâmetros para processar os dados desta ÚNICA conta
            const cacheTemporario = { ...appCache, lancamentos: lancamentosDaConta};

            // Gera as matrizes para esta conta
            const dadosProcessadosConta = processarLancamentos(cacheTemporario, contaId);
            const contaInfo = appCache.contasMap.get(String(contaId));
            dadosProcessadosConta.saldoIni = contaInfo ? Number(contaInfo.saldoIni) : 0;

            // Armazena as matrizes processadas da conta no cache principal
            appCache.matrizesPorConta.set(contaId, dadosProcessadosConta);
            console.log(`Matrizes para a conta ${contaId} foram salvas no cache.`);
        }
    }

    // 4. Juntar (Merge) as matrizes de TODAS as contas atualmente selecionadas
    console.log("Combinando matrizes em cache para a visualização...");
    const matrizesParaJuntar = contasSelecionadas
        .map(id => appCache.matrizesPorConta.get(id))
        .filter(Boolean);

    const dadosFinaisParaExibir = mergeMatrizes(matrizesParaJuntar, filtrosAtuais.modo, filtrosAtuais.colunas);

    // 5. Renderizar a visualização com os dados combinados
    atualizarVisualizacoes(dadosFinaisParaExibir, filtrosAtuais.colunas, appCache);
    document.body.classList.remove('loading');
}

window.IniciarDoZero = async function(deptosJson,id,type,contasJson,classesJson,projetosJson) {
    appCache = {
        userId: null, userType: null,
        matrizesPorConta: new Map(), // Reseta o novo cache
        categoriasMap: new Map(), classesMap: new Map(),
        projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
        anosDisponiveis: []
    };
    // ... (o restante do código de parsing e população dos mapas permanece o mesmo) ...
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
    
    configurarFiltros(appCache, handleFiltroChange);
};
