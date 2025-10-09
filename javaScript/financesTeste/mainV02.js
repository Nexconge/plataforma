// main.js - Módulo Principal de Finanças
// Orquestra a busca, processamento e exibição dos dados financeiros.

// Importa funções dos outros módulos
import { buscarTitulos } from './apiV01.js';
import { processarDadosDaConta, extrairDadosDosTitulos, mergeMatrizes } from './processingV01.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect } from './uiV02.js';

// Inicia o cache da aplicação
let appCache = {
    userId: null, userType: null,
    matrizesPorConta: new Map(),
    categoriasMap: new Map(), classesMap: new Map(),
    projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
    projecao: "realizado", // Valores possíveis: 'realizado', 'arealizar'
    flagAnos: false // Flag para controle de recursão em atualizações de filtro
};

/**
 * Função central que reage a qualquer mudança nos filtros da UI.
 * Orquestra a busca de novos dados (se necessário), o processamento
 * e a subsequente atualização das tabelas.
 */
async function handleFiltroChange() {
    // Evita chamadas recursivas infinitas quando a função de callback
    // do filtro de ano é acionada pela própria lógica de atualização.
    if (appCache.flagAnos) return; 
    
    document.body.classList.add('loading');
    
    // 1. Obter o estado atual dos filtros
    let filtrosAtuais = obterFiltrosAtuais();
    const contasSelecionadas = filtrosAtuais ? filtrosAtuais.contas.map(Number) : [];
    
    // Limpa as tabelas e encerra se nenhuma conta for selecionada
    if (contasSelecionadas.length === 0) {
        atualizarVisualizacoes(null, [], appCache); 
        document.body.classList.remove('loading');
        return;
    }

    // 2. Identificar contas cujos dados ainda não estão no cache
    const contasParaProcessar = contasSelecionadas.filter(c => !appCache.matrizesPorConta.has(c));

    // 3. Se houver contas a processar, busca via API e processa apenas elas
    if (contasParaProcessar.length > 0) {
        // Coloca um placeholder 'null' no cache para evitar múltiplas buscas simultâneas
        // caso o usuário clique no filtro várias vezes antes da primeira busca terminar.
        contasParaProcessar.forEach(c => appCache.matrizesPorConta.set(c, null));

        // Faz a requisição para a API para cada conta individualmente
        const promises = contasParaProcessar.map(conta => buscarTitulos({ contas: [conta] }));
        const responses = await Promise.all(promises);
        
        // Processa a resposta de cada conta
        for (let i = 0; i < contasParaProcessar.length; i++) {
            const contaId = contasParaProcessar[i];
            const apiResponse = responses[i];
            
            // Extrai os lançamentos dessa conta de cada título
            let dadosExtraidos = { lancamentos: [], titulos: [], capitalDeGiro: [] }; // Objeto padrão
            if (apiResponse && apiResponse.response && typeof apiResponse.response.movimentos === 'string' && apiResponse.response.movimentos.length > 2) {
                try {
                    const titulos = JSON.parse(`[${apiResponse.response.movimentos}]`);
                    const { lancamentosProcessados, titulosEmAberto, capitalDeGiro } = extrairDadosDosTitulos(titulos, contaId);
                    
                    dadosExtraidos.lancamentos = lancamentosProcessados.filter(l => Number(l.CODContaC) === contaId);
                    dadosExtraidos.titulos = titulosEmAberto;
                    dadosExtraidos.capitalDeGiro = capitalDeGiro;
                } catch (e) {
                    console.error(`Erro ao processar JSON para a conta ${contaId}:`, e);
                }
            }

            // Gera as matrizes para esta conta
            const dadosProcessadosConta = processarDadosDaConta(appCache, dadosExtraidos, contaId);
            
            // Adiciona o saldo inicial a ambos os modos (realizado e a realizar)
            const contaInfo = appCache.contasMap.get(String(contaId));
            const saldoIni = contaInfo ? Number(contaInfo.saldoIni) : 0;
            
            // O saldo inicial do "realizado" é o saldo inicial da própria conta.
            if (dadosProcessadosConta.realizado) {
                dadosProcessadosConta.realizado.saldoIni = saldoIni;
            }
            // O saldo inicial do "a realizar" é o saldo da conta somado com tudo que já foi realizado.
            // Isso garante que a projeção futura parta do saldo atual.
            if (dadosProcessadosConta.arealizar) {
                const totalRealizado = dadosProcessadosConta.realizado ? dadosProcessadosConta.realizado.valorTotal : 0;
                dadosProcessadosConta.arealizar.saldoIni = saldoIni + totalRealizado;
            }
            
            // Armazena as matrizes processadas da conta no cache
            appCache.matrizesPorConta.set(contaId, dadosProcessadosConta);
        }
    }

    // 4. Junta os dados das contas selecionadas nos filtros para visualização
    const matrizesParaJuntar = contasSelecionadas
        .map(id => appCache.matrizesPorConta.get(id))
        .filter(Boolean); // Filtra 'null' ou 'undefined'

    // Extrai os anos disponíveis a partir dos dados carregados
    const anoSelect = document.getElementById('anoSelect');
    const modoSelect = document.getElementById('modoSelect');
    let anosDisponiveis = new Set();
    matrizesParaJuntar.forEach(dadosConta => {
        const dadosProjecao = dadosConta[appCache.projecao.toLowerCase()];
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

    // Ativa a flag para prevenir chamadas recursivas durante a atualização do select de ano
    appCache.flagAnos = true;
    atualizarOpcoesAnoSelect(anoSelect, anosArray, modoSelect.value, appCache.projecao);
    appCache.flagAnos = false; // Reseta a flag

    // Reobtém os filtros, pois a atualização do ano pode ter mudado o valor selecionado
    filtrosAtuais = obterFiltrosAtuais();
    
    // Combina os dados filtrados para exibição
    const dadosParaExibir = mergeMatrizes(matrizesParaJuntar, filtrosAtuais.modo, filtrosAtuais.colunas, appCache.projecao);
    
    // 5. Renderiza a visualização com os dados combinados
    atualizarVisualizacoes(dadosParaExibir, filtrosAtuais.colunas, appCache);
    document.body.classList.remove('loading');
}

/**
 * Função de inicialização chamada pelo Bubble.
 * Zera o cache, processa dados iniciais e configura os filtros.
 */
window.IniciarDoZero = async function(deptosJson, id, type, contasJson, classesJson, projetosJson) {
    // Zera o cache para garantir uma inicialização limpa
    appCache = {
        userId: id, userType: type,
        matrizesPorConta: new Map(),
        categoriasMap: new Map(), classesMap: new Map(),
        projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
        projecao: "realizado",
        flagAnos: false
    };
    
    // Converte os dados JSON recebidos do Bubble
    const classes = JSON.parse(classesJson);
    const projetos = JSON.parse(projetosJson);
    const contas = JSON.parse(contasJson);
    const departamentos = JSON.parse(deptosJson);

    // Cria Maps para acesso rápido aos dados
    classes.forEach(c => {
        appCache.classesMap.set(c.codigo, { classe: c.Classe, categoria: c.Categoria });
        appCache.categoriasMap.set(c.codigo, c.Categoria);
    });
    projetos.forEach(p => appCache.projetosMap.set(p.codProj, { nome: p.nomeProj, contas: (p.contas || []).map(String) }));
    contas.forEach(c => appCache.contasMap.set(String(c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));
    departamentos.forEach(d => appCache.departamentosMap.set(d.codigo, d.descricao));

    // Define o ano atual como valor inicial para o filtro de anos.
    const anoAtual = [String(new Date().getFullYear())];

    // Configura os filtros iniciais e define a função de callback para qualquer mudança
    configurarFiltros(appCache, anoAtual, handleFiltroChange);
};