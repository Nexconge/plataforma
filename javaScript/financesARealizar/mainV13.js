// main.js - Finances
// Importa funções dos outros modulos
import { buscarTitulos } from './apiV01.js';
import { processarDadosDaConta, extrairDadosDosTitulos, mergeMatrizes } from './processingV05.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect } from './uiV05.js';

// Inicia o chache
let appCache = {
    userId: null, userType: null,
    matrizesPorConta: new Map(),
    categoriasMap: new Map(), classesMap: new Map(),
    projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
    projecao: "realizado", // Valores possíveis: 'realizado', 'arealizar'
    flagAnos: false
};

// Função para lidar com mudanças de filtro
async function handleFiltroChange() {
    if (appCache.flagAnos) return; // Evita recursão infinita ao atualizar anos
    
    document.body.classList.add('loading');
    // 1. Obter estado atual dos filtros
    let filtrosAtuais = obterFiltrosAtuais();
    const contasSelecionadas = filtrosAtuais ? filtrosAtuais.contas.map(Number) : [];
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

        //Faz a requisição para a api para cada conta individualmente
        const promises = contasParaProcessar.map(conta => buscarTitulos({ contas: [conta] }));
        const responses = await Promise.all(promises);
        // Processa a resposta de cada coonta
        for (let i = 0; i < contasParaProcessar.length; i++) {
            const contaId = contasParaProcessar[i];
            const apiResponse = responses[i];
            //Extrai os lançamentos dessa conta de cada titulo
            let dadosExtraidos = { lancamentos: [], titulos: [] }; // Objeto padrão
            if (apiResponse && apiResponse.response && typeof apiResponse.response.movimentos === 'string' && apiResponse.response.movimentos.length > 2) {
                try {
                    const titulos = JSON.parse(`[${apiResponse.response.movimentos}]`);
                    const { lancamentosProcessados, titulosEmAberto } = extrairDadosDosTitulos(titulos);
                    // Filtra para garantir que estamos processando apenas lançamentos da conta correta
                    dadosExtraidos.lancamentos = lancamentosProcessados.filter(l => Number(l.CODContaC) === contaId);
                    dadosExtraidos.titulos = titulosEmAberto;
                } catch (e) {
                    console.error(`Erro ao processar JSON para a conta ${contaId}:`, e);
                }
            }
            // Gera as matrizes para esta conta
            // Retorna os dados no formato 
            // { realizado: { matrizDRE, matrizDepartamentos, chavesComDados, valorTotal },
            //   arealizar: { matrizDRE, matrizDepartamentos, chavesComDados, valorTotal }
            const dadosProcessadosConta = processarDadosDaConta(appCache, dadosExtraidos, contaId);
            // Adiciona o saldo inicial a ambos os modos
            const contaInfo = appCache.contasMap.get(String(contaId));
            const saldoIni = contaInfo ? Number(contaInfo.saldoIni) : 0;
            //Saldo inicial do realizado é o saldo inicial da conta
            if (dadosProcessadosConta.realizado) dadosProcessadosConta.realizado.saldoIni = saldoIni;
            //Saldo inicial do A realizar é o saldo inicial da conta + o valor total realizado
            if (dadosProcessadosConta.arealizar) dadosProcessadosConta.arealizar.saldoIni = saldoIni + (dadosProcessadosConta.realizado ? dadosProcessadosConta.realizado.valorTotal : 0);
            // Armazena as matrizes processadas da conta no cache principal
            appCache.matrizesPorConta.set(contaId, dadosProcessadosConta);
        }
    }
    // 4-Junta os dados das contas selecionadas nos filtro e prepara para visualização
    const matrizesParaJuntar = contasSelecionadas
        .map(id => appCache.matrizesPorConta.get(id))
        .filter(Boolean);

    // Extrai os anos disponíveis das chaves com dados
    const anoSelect = document.getElementById('anoSelect');
    const modoSelect = document.getElementById('modoSelect');
    let anosDisponiveis = new Set();
    matrizesParaJuntar.forEach(d => {
        const dadosProjecao = d[appCache.projecao.toLowerCase()];
        if (dadosProjecao && dadosProjecao.chavesComDados) {
            dadosProjecao.chavesComDados.forEach(chave => {
                const ano = chave.split('-')[1];
                anosDisponiveis.add(ano);
            });
        }
    });
    const anosArray = Array.from(anosDisponiveis).sort();
    // Se não houver anos disponíveis, adiciona o ano atual como padrão
    if (anosArray.length === 0) {
        anosArray.push(String(new Date().getFullYear()));
    }
    // Atuliza o select evitando recursão
    appCache.flagAnos = true; // Seta a flag para evitar recursão
    atualizarOpcoesAnoSelect(anoSelect, anosArray, modoSelect.value);
    appCache.flagAnos = false; // Reseta a flag

    // Atualiza os filtros atuais para casos de de mudança de ano quando um a projeção é alterada e um ano não está mais disponível
    filtrosAtuais = obterFiltrosAtuais();
    // Combina os dados filtrados para exibição
    const dadosParaExibir = mergeMatrizes(matrizesParaJuntar, filtrosAtuais.modo, filtrosAtuais.colunas, appCache.projecao);
    const PeUchave = getChavesDeControle(dadosParaExibir.todasChaves, filtrosAtuais.modo);
    
    // 5. Renderizar a visualização com os dados combinados
    atualizarVisualizacoes(dadosParaExibir, filtrosAtuais.colunas, appCache, PeUchave);
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
        projecao: "realizado",
        flagAnos: false
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
    const anoAtual = [String(new Date().getFullYear())];
    appCache.userId = id;
    appCache.userType = type;

    //Configura os filtros iniciais e faz a primeira chamada de mudança como callback
    configurarFiltros(appCache, anoAtual, handleFiltroChange);
};
function getChavesDeControle(chavesSet, modo) {
    let primeiraChave = null;
    for (const chave of chavesSet) {
        if (!primeiraChave || compararChaves(chave, primeiraChave) < 0) {
            primeiraChave = chave;
        }
    }
    let ultimaChave = null;
    for (const chave of chavesSet) {
        if (!ultimaChave || compararChaves(chave, ultimaChave) > 0) {
            ultimaChave = chave;
        }
    }
    if (modo === "anual") {
        primeiraChave = primeiraChave ? primeiraChave.split('-')[1] : null;
        ultimaChave = ultimaChave ? ultimaChave.split('-')[1] : null;
    }

    return { ultimaChave, primeiraChave };
}
function compararChaves(a, b) {
    const [mesA, anoA] = a.split('-').map(Number);
    const [mesB, anoB] = b.split('-').map(Number);

    if (anoA !== anoB) return anoA - anoB;
    return mesA - mesB;
}