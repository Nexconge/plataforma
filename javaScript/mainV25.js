// mainV22.js - VERSÃO CORRIGIDA COM userId/userType E CACHE

// --- Importa as funções de cada módulo especializado ---
import { buscarLancamentos } from './apiV12.js';
import { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE } from './processingV7.js';
import { configurarFiltros, atualizarVisualizacoes, obterFiltrosSelecionados } from './uiV8.js';

// --- Caches em memória ---
let appCache = {
    userId: null,
    userType: null,
    categoriasMap: new Map(),
    classesMap: new Map(),
    projetosMap: new Map(),
    contasMap: new Map(),
    departamentosMap: new Map(),
    lancamentos: []
};

// Cache para armazenar os resultados dos lançamentos por combinação de filtros
let lancamentosCache = new Map();

/**
 * Gera uma chave de cache consistente para um objeto de filtros.
 * @param {object} filtros - O objeto de filtros vindo da UI.
 * @returns {string} Uma string única representando a combinação de filtros.
 */
function gerarChaveDeCache(filtros) {
    const filtrosOrdenados = {};
    Object.keys(filtros).sort().forEach(key => {
        const valor = filtros[key];
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
        if (!filtros) return;

        // Adiciona userId e userType aos filtros enviados para a API, se necessário
        filtros.userId = appCache.userId;
        filtros.userType = appCache.userType;

        const cacheKey = gerarChaveDeCache(filtros);
        let lancamentosAtuais;

        if (lancamentosCache.has(cacheKey)) {
            console.log("CACHE HIT: Usando lançamentos salvos para os filtros:", cacheKey);
            lancamentosAtuais = lancamentosCache.get(cacheKey);
        } else {
            console.log("CACHE MISS: Buscando novos lançamentos na API para os filtros:", cacheKey);
            // Passa os filtros completos para a API
            lancamentosAtuais = await buscarLancamentos(filtros);
            lancamentosCache.set(cacheKey, lancamentosAtuais);
        }

        appCache.lancamentos = lancamentosAtuais;

        const { contasFiltradas, saldoBase } = filtrarContasESaldo(
            appCache.projetosMap,
            appCache.contasMap,
            filtros.projetos,
            filtros.contas
        );

        const { matrizDRE, matrizDepartamentos, saldoInicialPeriodo, chavesComDados } = processarLancamentos(
            appCache,
            filtros.modo,
            filtros.anos,
            contasFiltradas,
            saldoBase
        );

        const dreFinal = calcularTotaisDRE(matrizDRE, saldoInicialPeriodo, filtros.modo);
        atualizarVisualizacoes(dreFinal, matrizDepartamentos, chavesComDados, filtros.modo);

    } catch (error) {
        console.error("Erro ao processar a mudança de filtro:", error);
        alert("Ocorreu um erro ao atualizar os dados.");
    } finally {
        document.body.classList.remove('loading');
    }
}

/**
 * PONTO DE ENTRADA: Função chamada pelo workflow do Bubble.
 * @param {string} userId - ID do usuário logado.
 * @param {string} userType - Tipo/perfil do usuário.
 * @param {string} classesJson - String JSON com os dados de classes/categorias.
 * @param {string} projetosJson - String JSON com os dados de projetos.
 * @param {string} contasJson - String JSON com os dados de contas.
 * @param {string} deptosJson - String JSON com os dados de departamentos.
 */
window.iniciarDoZero = async function(userId, userType, classesJson, projetosJson, contasJson, deptosJson) {
    console.log(`Iniciando app para o usuário ${userId} (${userType})...`);
    try {
        // 1. Limpa caches e define os dados do usuário
        appCache = {
            ...appCache,
            userId: userId,
            userType: userType,
        };
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
        
        // 4. Configura os filtros na tela (dropdowns, etc.)
        configurarFiltros(appCache);

        // 5. Adiciona os "escutadores" de eventos, garantindo que não sejam duplicados
        const modoSelect = document.getElementById('modoSelect');
        if (!modoSelect.dataset.listenerAttached) {
             document.getElementById('modoSelect').addEventListener('change', handleFiltroChange);
             document.getElementById('anoSelect').addEventListener('change', handleFiltroChange);
             document.getElementById('projSelect').addEventListener('change', handleFiltroChange);
             document.getElementById('contaSelect').addEventListener('change', handleFiltroChange);
             modoSelect.dataset.listenerAttached = 'true';
        }

        // 6. Realiza a primeira busca de dados com os filtros padrão
        await handleFiltroChange();

    } catch (error) {
        console.error("Erro fatal na inicialização da aplicação via Bubble:", error);
        alert("Não foi possível carregar os dados essenciais da aplicação.");
    }
}