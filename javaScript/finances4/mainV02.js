// main.js - MODIFICADO

// --- Importa as funções de cada módulo especializado ---
import { buscarTitulos } from './apiV01.js';
import { filtrarContasESaldo, processarLancamentos, extrairLancamentosDosTitulos } from './processingV01.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais } from './uiV01.js';

// --- O cache em memória foi reestruturado ---
let appCache = {
    userId: null, userType: null,
    lancamentosPorConta: new Map(),
    matrizesCalculadas: new Map(),
    categoriasMap: new Map(), classesMap: new Map(),
    projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
    anosDisponiveis: []
};

/**
 * Gera uma chave única para o cache de matrizes com base nos filtros atuais.
 * @param {object} filtros - O objeto de filtros contendo modo, anos, contas, etc.
 * @returns {string} Uma string que serve como chave de cache.
 */
function gerarChaveCache(filtros) {
    // Ordenar os arrays garante que a chave seja a mesma independentemente da ordem de seleção
    const contasOrdenadas = [...filtros.contas].sort();
    const anosOrdenados = [...filtros.anos].sort();
    return `${filtros.modo}-${anosOrdenados.join(',')}-${contasOrdenadas.join(',')}`;
}

/**
 * Função central que é chamada sempre que um filtro é alterado.
 */
async function handleFiltroChange() {
    document.body.classList.add('loading');

    // 1. Obter o estado atual de todos os filtros da UI
    const filtrosAtuais = obterFiltrosAtuais();
    if (!filtrosAtuais || filtrosAtuais.contas.length === 0) {
        console.log("Nenhuma conta selecionada. Limpando visualizações.");
        atualizarVisualizacoes(null, [], appCache); // Limpa as tabelas
        document.body.classList.remove('loading');
        return;
    }

    // 2. Gerar chave de cache e verificar se os dados já estão processados
    const chaveCache = gerarChaveCache(filtrosAtuais);
    if (appCache.matrizesCalculadas.has(chaveCache)) {
        console.log("CACHE HIT! Usando matrizes pré-calculadas.");
        const dadosEmCache = appCache.matrizesCalculadas.get(chaveCache);
        atualizarVisualizacoes(dadosEmCache, filtrosAtuais.colunas, appCache);
        document.body.classList.remove('loading');
        return; // Fim, pois os dados vieram do cache
    }

    console.log("CACHE MISS! Buscando e/ou processando novos dados.");

    // 3. (Cache Miss) Verificar quais contas precisam ser buscadas via API
    const contasParaBuscar = filtrosAtuais.contas.filter(c => !appCache.lancamentosPorConta.has(c));

    if (contasParaBuscar.length > 0) {
        contasParaBuscar.forEach(c => appCache.lancamentosPorConta.set(c, [])); // Inicia com array vazio para evitar chamadas duplicadas

        const promises = contasParaBuscar.map(conta => buscarTitulos({ contas: [conta] }));
        const allResponses = await Promise.all(promises);

        // Processa as respostas e popula o cache de lançamentos brutos (Nível 1)
        // Esta seção agora distribui cada lançamento para sua conta correta.
        allResponses.forEach(apiResponse => {
            if (apiResponse && apiResponse.response && typeof apiResponse.response.movimentos === 'string' && apiResponse.response.movimentos.length > 2) {
                try {
                    const titulosNovos = JSON.parse(`[${apiResponse.response.movimentos}]`);
                    const lancamentosNovos = extrairLancamentosDosTitulos(titulosNovos);

                    // Distribui cada lançamento para a sua respectiva conta no cache
                    lancamentosNovos.forEach(lancamento => {
                        const codConta = Number(lancamento.CODContaC);
                        
                        // Garante que o slot da conta existe no cache, mesmo que não tenha sido buscada diretamente
                        if (!appCache.lancamentosPorConta.has(codConta)) {
                            appCache.lancamentosPorConta.set(codConta, []);
                        }
                        
                        // Adiciona o lançamento à lista da sua conta correspondente
                        const lista = appCache.lancamentosPorConta.get(codConta);
                        lista.push(lancamento);
                    });
                } catch (error) {
                    console.error("Erro ao processar resposta da API:", error);
                }
            }
        });
    }

    // 4. (Cache Miss) Combinar os lançamentos brutos das contas selecionadas
    let lancamentosCombinados = [];
    filtrosAtuais.contas.forEach(c => {
        const lista = appCache.lancamentosPorConta.get(c) || [];
        lancamentosCombinados.push(...lista);
    });

    // 5. (Cache Miss) Processar os dados combinados para gerar as matrizes
    const { contasFiltradas, saldoBase } = filtrarContasESaldo(appCache.projetosMap, appCache.contasMap, filtrosAtuais.projetos, filtrosAtuais.contas);
    const cacheTemporario = { ...appCache, lancamentos: lancamentosCombinados }; // Truque para não modificar a função processarLancamentos
    const dadosProcessados = processarLancamentos(cacheTemporario, filtrosAtuais.modo, filtrosAtuais.anos, contasFiltradas, saldoBase);

    // 6. (Cache Miss) Armazenar as matrizes recém-calculadas no cache (Nível 2)
    appCache.matrizesCalculadas.set(chaveCache, dadosProcessados);
    console.log(`Novas matrizes armazenadas no cache com a chave: ${chaveCache}`);

    // 7. Chamar a atualização da UI com os novos dados
    atualizarVisualizacoes(dadosProcessados, filtrosAtuais.colunas, appCache);
    document.body.classList.remove('loading');
}

window.IniciarDoZero = async function(deptosJson,id,type,contasJson,classesJson,projetosJson) {
    // Reseta completamente ambos os caches
    appCache = {
        userId: null, userType: null,
        lancamentosPorConta: new Map(),
        matrizesCalculadas: new Map(),
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
