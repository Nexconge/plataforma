const API_BASE = "https://plataforma-geourb.bubbleapps.io/";

/**
 * Determina URL base (Dev vs Prod)
 */
function obterBaseURL() {
    const ambiente = window.location.href.includes("version-test") ? "version-test" : "version-live";
    return `${API_BASE}${ambiente}/api/1.1/wf`;
}

/**
 * Wrapper centralizado para Fetch
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
            const txt = await response.text();
            throw new Error(`[${contexto}] HTTP ${response.status}: ${txt}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Erro em ${contexto}:`, error);
        throw error;
    }
}

// --- Funções Exportadas ---

export async function buscarTitulos({ conta, ano }) {
    try {
        return await postRequest('buscarmovimentos', { conta: String(conta), ano: String(ano) }, 'buscarTitulos');
    } catch {
        // Retorno seguro para não quebrar a UI
        return { response: { movimentos: [], saldoInicial: 0 } };
    }
}

export async function buscarValoresEstoque({ periodos, projeto }) {
    try {
        return await postRequest('buscarsaldosestoque', { periodos, projeto }, 'buscarValoresEstoque');
    } catch {
        console.warn("Erro ao buscar estoque.");
        return [];
    }
}

export async function buscarPeriodosComDados(contaId, projecao) {
    try {
        return await postRequest('buscarperiodoscomdados', { conta: contaId, projecao }, 'buscarPeriodosComDados');
    } catch {
        return { response: { periodo_ini: null, periodo_fim: null } };
    }
}