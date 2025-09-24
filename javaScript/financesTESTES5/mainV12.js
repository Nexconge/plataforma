// main.js - Finances
// Importa funções dos outros modulos
import { buscarTitulos } from './apiV02.js';
import { processarDadosDaConta, extrairDadosDosTitulos, mergeMatrizes } from './processingV10.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais } from './uiV03.js';

// Inicia o chache
let appCache = {
    userId: null, userType: null,
    matrizesPorConta: new Map(),
    categoriasMap: new Map(), classesMap: new Map(),
    projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
    anosDisponiveis: [],
    projecao: "realizado" // Valores possíveis: 'realizado', 'arealizar'
};

// Função para lidar com mudanças de filtro
async function handleFiltroChange() {
    document.body.classList.add('loading');

    // 1. Obter estado atual dos filtros
    const filtrosAtuais = obterFiltrosAtuais();
    const contasSelecionadas = filtrosAtuais ? filtrosAtuais.contas.map(Number) : [];
    appCache.projecao = "arealizar"

    // Limpa as tabelas se nenhuma conta for selecionada
    if (contasSelecionadas.length === 0) {
        atualizarVisualizacoes(null, [], appCache); 
        document.body.classList.remove('loading');
        return;
    }

    // 2. Identificar contas cujos dados processados AINDA NÃO estão no cache
    const contasParaProcessar = contasSelecionadas.filter(c => !appCache.matrizesPorConta.has(c));

    // 3. Se houver contas faltantes, buscar via API e processar APENAS elas
    if (contasParaProcessar.length > 0) {
        
        // Coloca um placeholder no cache para evitar múltiplas buscas simultâneas
        //Se o usuario clicar varias vezes no mesmo filtro antes da primeira busca terminar isso pode
        //levar a dados duplicados
        contasParaProcessar.forEach(c => appCache.matrizesPorConta.set(c, null));

        //Faz a requisição para a api
        const promises = contasParaProcessar.map(conta => buscarTitulos({ contas: [conta] }));
        const responses = await Promise.all(promises);

        // Processa a resposta de cada conta individualmente
        for (let i = 0; i < contasParaProcessar.length; i++) {
            const contaId = contasParaProcessar[i];
            const apiResponse = responses[i];
            //Extrai os lançamentos dessa conta de cada titulo
            let dadosExtraidos = { lancamentos: [], titulos: [] }; // Objeto padrão
            if (apiResponse && apiResponse.response && typeof apiResponse.response.movimentos === 'string' && apiResponse.response.movimentos.length > 2) {
                try {
                    const titulos = JSON.parse(`[${apiResponse.response.movimentos}]`);
                    const { lancamentosProcessados, titulosProcessados } = extrairDadosDosTitulos(titulos);
                    // Filtra para garantir que estamos processando apenas lançamentos da conta correta
                    dadosExtraidos.lancamentos = lancamentosProcessados.filter(l => Number(l.CODContaC) === contaId);
                    dadosExtraidos.titulos = titulosProcessados;
                } catch (e) {
                    console.error(`Erro ao processar JSON para a conta ${contaId}:`, e);
                }
            }
            // Gera as matrizes para esta conta
            const dadosProcessadosConta = processarDadosDaConta(appCache, dadosExtraidos, contaId);

            // Adiciona o saldo inicial a ambos os modos
            const contaInfo = appCache.contasMap.get(String(contaId));
            const saldoIni = contaInfo ? Number(contaInfo.saldoIni) : 0;
            if (dadosProcessadosConta.realizado) dadosProcessadosConta.realizado.saldoIni = saldoIni;
            if (dadosProcessadosConta.aRealizar) dadosProcessadosConta.aRealizar.saldoIni = saldoIni;
            
            // Armazena as matrizes processadas da conta no cache principal
            appCache.matrizesPorConta.set(contaId, dadosProcessadosConta);
            console.log(`Matrizes para a conta ${contaId} foram salvas no cache.`);
        }
    }
    // 4-Junta os dados das contas selecionadas nos filtro e prepara para visualização
    const matrizesParaJuntar = contasSelecionadas
        .map(id => appCache.matrizesPorConta.get(id))
        .filter(Boolean);
    const dadosParaExibir = mergeMatrizes(matrizesParaJuntar, filtrosAtuais.modo, filtrosAtuais.colunas, appCache.projecao);

    // 5. Renderizar a visualização com os dados combinados
    atualizarVisualizacoes(dadosParaExibir, filtrosAtuais.colunas, appCache);
    document.body.classList.remove('loading');
}

//Função chamada pelo bubble que inicia a tabela
window.IniciarDoZero = async function(deptosJson,id,type,contasJson,classesJson,projetosJson) {
    //Zera o cache
    appCache = {
        userId: null, userType: null,
        matrizesPorConta: new Map(), // Reseta o novo cache
        categoriasMap: new Map(), classesMap: new Map(),
        projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
        anosDisponiveis: [],
        projecao: "REALIZADO"
    };
    
    //Parseia os dados recebidos do bubble 
    const classes = JSON.parse(classesJson);
    const projetos = JSON.parse(projetosJson);
    const contas = JSON.parse(contasJson);
    const departamentos = JSON.parse(deptosJson);

    //Cria MAPS para cada tipo de dado
    classes.forEach(c => {
        appCache.classesMap.set(c.codigo, { classe: c.Classe, categoria: c.Categoria });
        appCache.categoriasMap.set(c.codigo, c.Categoria);
    });
    projetos.forEach(p => appCache.projetosMap.set(p.codProj, { nome: p.nomeProj, contas: (p.contas || []).map(String) }));
    contas.forEach(c => appCache.contasMap.set(String(c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));
    departamentos.forEach(d => appCache.departamentosMap.set(d.codigo, d.descricao));

    //Cria na mão os anos disponíveis para o filtro de anos com base no ano atual até 2020
    const anoAtual = new Date().getFullYear();
    appCache.anosDisponiveis = [];
    for (let ano = 2020; ano <= anoAtual; ano++) {
        appCache.anosDisponiveis.push(String(ano));
    }
    //Salva os anos disponíveis, id e tipo do usuário no cache global
    appCache.anosDisponiveis.sort();
    appCache.userId = id;
    appCache.userType = type;

    //Configura os filtros iniciais e faz a primeira chamada de mudança como callback
    configurarFiltros(appCache, handleFiltroChange);
};
