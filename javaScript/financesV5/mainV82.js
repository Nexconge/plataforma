// main.js - Finances
// Importa funções dos outros modulos
import { buscarTitulos } from './apiV01.js';
import { processarDadosDaConta, extrairDadosDosTitulos, mergeMatrizes } from './processingV27.js';
import { configurarFiltros, atualizarVisualizacoes, 
    obterFiltrosAtuais, atualizarOpcoesAnoSelect } from './uiV68.js';

/**
 * Cache central da aplicação. Armazena dados para evitar requisições repetidas e
 * mantém o estado atual da UI.
 */
let appCache = {
    // Dados do usuário logado.
    userId: null, 
    userType: null,
    // Armazena os dados já processados para cada conta bancária. A chave é o ID da conta.
    matrizesPorConta: new Map(),
    // Mapas de apoio para traduzir códigos em descrições.
    categoriasMap: new Map(), 
    classesMap: new Map(),
    projetosMap: new Map(), 
    contasMap: new Map(), 
    departamentosMap: new Map(),
    // Estado atual da visualização ('realizado' ou 'arealizar').
    projecao: "realizado",
    // Flag para evitar chamadas recursivas ao atualizar o filtro de anos.
    flagAnos: false
};

/**
 * Função principal que reage a qualquer mudança nos filtros.
 * Orquestra todo o fluxo de dados: busca, processa, consolida e renderiza.
 */
async function handleFiltroChange() {
    // Evita recursão infinita ao atualizar o select de anos programaticamente.
    if (appCache.flagAnos) return; 
    
    document.body.classList.add('loading');
    
    // 1. Obtém o estado atual de todos os filtros da UI.
    let filtrosAtuais = obterFiltrosAtuais();
    const contasSelecionadas = filtrosAtuais ? filtrosAtuais.contas.map(Number) : [];

    // Se nenhuma conta estiver selecionada, limpa as tabelas.
    if (contasSelecionadas.length === 0) {
        exibirTabelasVazias();
    }

    // 2. Identifica quais das contas selecionadas ainda não tiveram seus dados buscados e processados.
    const contasParaProcessar = contasSelecionadas.filter(c => !appCache.matrizesPorConta.has(c));

    // 3. Se houver contas novas, busca os dados via API apenas para elas.
    if (contasParaProcessar.length > 0) {
        // Coloca um placeholder no cache para evitar múltiplas buscas simultâneas da mesma conta.
        contasParaProcessar.forEach(c => appCache.matrizesPorConta.set(c, null));

        // Dispara as requisições para a API em paralelo para cada nova conta.
        const promises = contasParaProcessar.map(conta => buscarTitulos({ contas: [conta] }));
        const responses = await Promise.all(promises);

        // Processa a resposta de cada conta individualmente.
        for (let i = 0; i < contasParaProcessar.length; i++) {
            const contaId = contasParaProcessar[i];
            const apiResponse = responses[i];

            // Extrai os dados da resposta da API.
            let dadosExtraidos = { lancamentos: [], titulos: [], capitalDeGiro: [] };
            if (apiResponse && apiResponse.response && typeof apiResponse.response.movimentos === 'string' && apiResponse.response.movimentos.length > 2) {
                try {
                    const titulos = JSON.parse(`[${apiResponse.response.movimentos}]`);
                    const { lancamentosProcessados, titulosEmAberto, capitalDeGiro } = extrairDadosDosTitulos(titulos, contaId);
                    
                    dadosExtraidos.lancamentos = lancamentosProcessados;
                    dadosExtraidos.titulos = titulosEmAberto;
                    dadosExtraidos.capitalDeGiro = capitalDeGiro;
                } catch (e) {
                    console.error(`Erro ao processar JSON para a conta ${contaId}:`, e);
                }
            }

            // Gera as matrizes (realizado, a realizar, capital de giro) para esta conta.
            // A função retorna um objeto com a estrutura: { realizado: {...}, arealizar: {...}, capitalDeGiro: {...} }
            const dadosProcessadosConta = processarDadosDaConta(appCache, dadosExtraidos, contaId);
            
            // Armazena os dados processados da conta no cache.
            appCache.matrizesPorConta.set(contaId, dadosProcessadosConta);
        }
    }

    // 4. Junta os dados de todas as contas selecionadas que estão no cache.
    const dadosParaJuntar = contasSelecionadas
        .map(id => appCache.matrizesPorConta.get(id))
        .filter(Boolean); // Filtra nulos/placeholders

    // Atualiza as opções do filtro de ano com base nos dados disponíveis das contas selecionadas.
    const anoSelect = document.getElementById('anoSelect');
    const modoSelect = document.getElementById('modoSelect');
    let anosDisponiveis = new Set();
    dadosParaJuntar.forEach(d => {
        const dadosProjecao = d[appCache.projecao.toLowerCase()];
        if (dadosProjecao && dadosProjecao.chavesComDados) {
            dadosProjecao.chavesComDados.forEach(chave => anosDisponiveis.add(chave.split('-')[1]));
        }
    });
    const anosArray = Array.from(anosDisponiveis).sort();
    if (anosArray.length === 0) anosArray.push(String(new Date().getFullYear()));
    
    // Atualiza o select de anos, usando a flag para evitar nova chamada a handleFiltroChange.
    appCache.flagAnos = true;
    atualizarOpcoesAnoSelect(anoSelect, anosArray, modoSelect.value, appCache.projecao);
    appCache.flagAnos = false;

    // Re-lê os filtros, pois a atualização dos anos pode ter mudado a seleção.
    filtrosAtuais = obterFiltrosAtuais();
    
    // Consolida os dados de todas as contas selecionadas em uma única matriz para exibição.
    // Retorna um objeto final com a estrutura: { matrizDRE, matrizDetalhamento, ... }
    const dadosParaExibir = mergeMatrizes(dadosParaJuntar, filtrosAtuais.modo, filtrosAtuais.colunas, appCache.projecao);
    
    // 5. Renderiza as tabelas na UI com os dados finais.
    atualizarVisualizacoes(dadosParaExibir, filtrosAtuais.colunas, appCache);
    document.body.classList.remove('loading');
}

function exibirTabelasVazias(){
    const anoAtual = String(new Date().getFullYear());
        const modoAtual = document.getElementById('modoSelect')?.value || 'mensal';
        
        // Gera as colunas para o ano atual com base no modo ('mensal' ou 'anual')
        const colunasVazias = (modoAtual.toLowerCase() === 'anual')
            ? [anoAtual]
            : Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}-${anoAtual}`);
        
        // Cria uma estrutura de dados vazia que as funções de renderização esperam.
        const dadosVaziosParaExibir = {
            matrizDRE: {},
            matrizDetalhamento: {},
            entradasESaidas: {},
            matrizCapitalGiro: {}
        };

        // Chama a função de renderização com a estrutura vazia.
        atualizarVisualizacoes(dadosVaziosParaExibir, colunasVazias, appCache);
        
        document.body.classList.remove('loading');
        return; // Interrompe a execução para não buscar dados da API.
}

/**
 * Função de inicialização chamada pelo Bubble.
 * Recebe os dados básicos (contas, projetos, etc.), reinicia o cache e configura os filtros iniciais.
 * @param {string} deptosJson - String JSON com os dados dos departamentos.
 * @param {string} id - ID do usuário.
 * @param {string} type - Tipo de usuário (ex: 'developer').
 * @param {string} contasJson - String JSON com os dados das contas.
 * @param {string} classesJson - String JSON com os dados de classes e categorias.
 * @param {string} projetosJson - String JSON com os dados dos projetos.
 */
window.IniciarDoZero = async function(deptosJson, id, type, contasJson, classesJson, projetosJson) {
    // Zera o cache para garantir uma inicialização limpa.
    appCache = {
        userId: null, userType: null,
        matrizesPorConta: new Map(),
        categoriasMap: new Map(), classesMap: new Map(),
        projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
        projecao: "realizado",
        flagAnos: false
    };
    
    // Parseia os dados JSON recebidos do Bubble.
    const classes = JSON.parse(classesJson);
    const projetos = JSON.parse(projetosJson);
    const contas = JSON.parse(contasJson);
    const departamentos = JSON.parse(deptosJson);

    // Popula os mapas de apoio no cache para acesso rápido.
    classes.forEach(c => {
        appCache.classesMap.set(c.codigo, { classe: c.Classe, categoria: c.Categoria });
        appCache.categoriasMap.set(c.codigo, c.Categoria);
    });
    projetos.forEach(p => appCache.projetosMap.set(p.codProj, { nome: p.nomeProj, contas: (p.contas || []).map(String) }));
    contas.forEach(c => appCache.contasMap.set(String(c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));
    departamentos.forEach(d => appCache.departamentosMap.set(d.codigo, d.descricao));

    const anoAtual = [String(new Date().getFullYear())];
    appCache.userId = id;
    appCache.userType = type;

    // Configura os filtros (popula dropdowns, adiciona event listeners) e define `handleFiltroChange` como o callback
    // a ser chamado quando qualquer filtro for alterado. Isso também dispara a primeira carga de dados.
    configurarFiltros(appCache, anoAtual, handleFiltroChange);
};