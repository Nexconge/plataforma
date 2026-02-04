
const CONFIG = {
    BASE_URL_LIVE: "https://plataforma-geourb.bubbleapps.io/version-live/api/1.1/wf",
    BASE_URL_TEST: "https://plataforma-geourb.bubbleapps.io/version-test/api/1.1/wf"
};

/**
 * Retorna a URL correta baseada no ambiente atual.
 * @returns {string} URL do endpoint.
 */
function obterBaseURL() {
    return window.location.href.includes("version-test") ? CONFIG.BASE_URL_TEST : CONFIG.BASE_URL_LIVE;
}

/**
 * Wrapper genérico para requisições POST.
 * @param {string} endpoint - Nome do workflow no Bubble.
 * @param {object} payload - Dados JSON a enviar.
 * @param {string} contexto - Nome da função chamadora para logs.
 */
async function postRequest(endpoint, payload, contexto) {
    const url = `${obterBaseURL()}/${endpoint}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Erro API [${contexto}]: ${response.status} - ${await response.text()}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Falha em ${contexto}:`, error);
        throw error; // Repassa o erro para o controlador (main.js)
    }
}

// --- Funções Públicas ---

export async function buscarTitulos({ conta, ano }) {
    // Retorna estrutura mínima segura em caso de erro para não quebrar a UI
    try {
        return await postRequest('buscarmovimentos', { conta: String(conta), ano: String(ano) }, 'buscarTitulos');
    } catch {
        return { response: { movimentos: [], saldoInicial: 0 } };
    }
}

export async function buscarValoresEstoque({ periodos, projeto }) {
    try {
        return await postRequest('buscarsaldosestoque', { periodos, projeto }, 'buscarValoresEstoque');
    } catch {
        return []; 
    }
}

export async function buscarPeriodosComDados(conta, projecao) {
    try {
        return await postRequest('buscarperiodoscomdados', { conta, projecao }, 'buscarPeriodosComDados');
    } catch {
        return { response: { periodo_ini: null, periodo_fim: null } };
    }
}