// apiV05.js

// --- Configurações e Utilitários ---

/**
 * Determina a URL base da API dependendo do ambiente (teste ou produção).
 * @returns {string} URL base formatada.
 */
function obterBaseURL() {
    const dominio = "https://plataforma-geourb.bubbleapps.io/";
    const ambiente = window.location.href.includes("version-test") ? "version-test" : "version-live";
    return `${dominio}${ambiente}/api/1.1/wf`;
}

/**
 * Wrapper genérico para chamadas fetch com tratamento de erro padrão.
 * @param {string} endpoint - O endpoint da API.
 * @param {object} payload - O corpo da requisição JSON.
 * @param {string} nomeFuncao - Nome da função chamadora para log de erro.
 * @returns {Promise<any>} Resposta JSON ou lança erro.
 */
async function realizarPost(endpoint, payload, nomeFuncao) {
    const url = `${obterBaseURL()}/${endpoint}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`[${nomeFuncao}] Falha API: ${response.status} - ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Erro em ${nomeFuncao}:`, error);
        throw error; // Repassa o erro para ser tratado ou ignorado pelo chamador
    }
}

// --- Funções Exportadas ---

/**
 * Busca os títulos financeiros com base nos filtros.
 * @param {object} filtros - { contas: [], anos: [] }
 */
async function buscarTitulos(filtros) {
    const payload = {
        contas: filtros.contas,
        anos: filtros.anos // ["2024"] ou ["AREALIZAR"]
    };

    try {
        return await realizarPost('buscarmovimentos', payload, 'buscarTitulos');
    } catch (error) {
        // Retorna estrutura vazia segura em caso de falha para não quebrar a UI
        return { response: { movimentos: [], saldoInicial: 0 } };
    }
}

/**
 * Busca valores de estoque por período e projeto.
 * @param {object} filtros - { periodos: [], projeto: [] }
 */
async function buscarValoresEstoque(filtros) {
    try {
        return await realizarPost('buscarsaldosestoque', filtros, 'buscarValoresEstoque');
    } catch (error) {
        alert("Ocorreu um erro ao buscar os dados de estoque. Verifique o console.");
        return [];
    }
}

/**
 * Busca o range de datas (início e fim) com dados para uma conta.
 * @param {string} contaId - ID da conta.
 * @param {string} projecao - "realizado" ou "arealizar".
 */
async function buscarPeriodosComDados(contaId, projecao) {
    const payload = {
        conta: contaId,
        projecao: projecao
    };

    try {
        return await realizarPost('buscarperiodoscomdados', payload, 'buscarPeriodosComDados');
    } catch (error) {
        console.warn(`Falha não crítica ao buscar períodos para conta ${contaId}`);
        return { response: { periodo_ini: null, periodo_fim: null } };
    }
}

export { buscarTitulos, buscarValoresEstoque, buscarPeriodosComDados };