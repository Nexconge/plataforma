// main.js - MODIFICADO

// --- Importa as funções de cada módulo especializado ---
import { buscarDadosOMIE, obterDataAtualizacaoArquivo, buscarLancamentos } from './apiV12.js';
import { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE } from './processingV7.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosSelecionados } from './uiV8.js';

// --- Caches em memória ---
let appCache = {
    userId: null, userType: null, lancamentos: [],
    categoriasMap: new Map(), classesMap: new Map(),
    projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
    anosDisponiveis: []
};
// Novo cache para armazenar os lançamentos por filtro
let lancamentosCache = {};

/**
 * Gera uma chave de cache consistente para um objeto de filtros,
 * garantindo que a ordem das propriedades e dos itens em arrays não afete o resultado.
 * @param {object} filtros - O objeto de filtros vindo da UI.
 * @returns {string} Uma string única representando a combinação de filtros.
 */
function gerarChaveDeCache(filtros) {
    const filtrosOrdenados = {};
    // Ordena as chaves do objeto de filtros para garantir consistência
    Object.keys(filtros).sort().forEach(key => {
        const valor = filtros[key];
        // Se o valor for um array, ordena seus itens também
        if (Array.isArray(valor)) {
            filtrosOrdenados[key] = [...valor].sort();
        } else {
            filtrosOrdenados[key] = valor;
        }
    });
    return JSON.stringify(filtrosOrdenados);
}

/**
 * Função central, chamada sempre que um filtro na UI é alterado.
 */
async function handleFiltroChange() {
    document.body.classList.add('loading');
    try {
        const filtros = obterFiltrosSelecionados();
        if (!filtros) return; // Se os filtros não puderem ser obtidos, para a execução

        const cacheKey = gerarChaveDeCache(filtros);
        let lancamentosAtuais;

        // 1. VERIFICA O CACHE ANTES DE CHAMAR A API
        if (lancamentosCache[cacheKey]) {
            console.log("CACHE HIT: Usando lançamentos salvos para os filtros:", cacheKey);
            lancamentosAtuais = lancamentosCache[cacheKey];
        } else {
            console.log("CACHE MISS: Buscando novos lançamentos na API para os filtros:", cacheKey);
            lancamentosAtuais = await buscarLancamentos(filtros);
            lancamentosCache[cacheKey] = lancamentosAtuais; // Salva o resultado no cache
        }

        appCache.lancamentos = lancamentosAtuais;

        // 2. Filtra contas e calcula o saldo base (lógica de negócio)
        const { contasFiltradas, saldoBase } = filtrarContasESaldo(
            appCache.projetosMap,
            appCache.contasMap,
            filtros.projetos,
            filtros.contas
        );

        // 3. Processa os lançamentos para gerar as matrizes
        const { matrizDRE, matrizDepartamentos, saldoInicialPeriodo, chavesComDados } = processarLancamentos(
            appCache,
            filtros.modo,
            filtros.anos,
            contasFiltradas,
            saldoBase
        );

        // 4. Calcula os totais finais da DRE
        const dreFinal = calcularTotaisDRE(matrizDRE, saldoInicialPeriodo, filtros.modo);

        // 5. Atualiza a interface do usuário com os dados processados
        atualizarVisualizacoes(dreFinal, matrizDepartamentos, chavesComDados, filtros.modo);

    } catch (error) {
        console.error("Erro ao processar a mudança de filtro:", error);
        alert("Ocorreu um erro ao atualizar os dados. Verifique o console para mais detalhes.");
    } finally {
        document.body.classList.remove('loading');
    }
}

/**
 * PONTO DE ENTRADA: Função chamada pelo workflow do Bubble.
 * Recebe os dados estáticos, inicializa o cache e configura a UI.
 * @param {string} classesJson - String JSON com os dados de classes/categorias.
 * @param {string} projetosJson - String JSON com os dados de projetos.
 * @param {string} contasJson - String JSON com os dados de contas.
 * @param {string} deptosJson - String JSON com os dados de departamentos.
 */
export async function iniciarDoZero(classesJson, projetosJson, contasJson, deptosJson) {
    console.log("Iniciando a aplicação com dados do Bubble...");
    try {
        // 1. Limpa e reinicia os caches
        appCache.classesMap.clear();
        appCache.categoriasMap.clear();
        appCache.projetosMap.clear();
        appCache.contasMap.clear();
        appCache.departamentosMap.clear();
        lancamentosCache.clear();

        // 2. Faz o parse dos JSONs recebidos do Bubble
        const classes = JSON.parse(classesJson);
        const projetos = JSON.parse(projetosJson);
        const contas = JSON.parse(contasJson);
        const departamentos = JSON.parse(deptosJson);

        // 3. Popula os mapas do cache com os dados estáticos
        classes.forEach(c => {
            appCache.classesMap.set(c.codigo, { classe: c.Classe, categoria: c.Categoria });
            appCache.categoriasMap.set(c.codigo, c.Categoria);
        });
        projetos.forEach(p => appCache.projetosMap.set(p.codProj, { nome: p.nomeProj, contas: (p.contas || []).map(String) }));
        contas.forEach(c => appCache.contasMap.set(String(c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));
        departamentos.forEach(d => appCache.departamentosMap.set(d.codigo, d.descricao));
        
        // 4. Configura os filtros na tela (dropdowns, etc.) com os dados carregados
        configurarFiltros(appCache);

        // 5. Adiciona os "escutadores" de eventos que chamarão a função handleFiltroChange
        // Garante que os listeners sejam adicionados apenas uma vez
        const setupListeners = () => {
            document.getElementById('modoSelect').addEventListener('change', handleFiltroChange);
            document.getElementById('anoSelect').addEventListener('change', handleFiltroChange);
            document.getElementById('projSelect').addEventListener('change', handleFiltroChange);
            document.getElementById('contaSelect').addEventListener('change', handleFiltroChange);
        };
        
        // Remove listeners antigos se existirem, para evitar duplicação
        const modoSelect = document.getElementById('modoSelect');
        if (!modoSelect.dataset.listenerAttached) {
             setupListeners();
             modoSelect.dataset.listenerAttached = 'true';
        }

        // 6. Realiza a primeira busca de dados com os filtros padrão da tela
        await handleFiltroChange();

    } catch (error) {
        console.error("Erro fatal na inicialização da aplicação via Bubble:", error);
        alert("Não foi possível carregar os dados essenciais da aplicação.");
    }
}