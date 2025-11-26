// apiV01.js

/**
 * Envia um objeto de filtros para a API e busca os títulos financeiros correspondentes.
 * A função constrói a URL da API dinamicamente com base no ambiente (teste ou produção).
 * * Exemplo de um item no array de títulos retornado pela API:
 * {
 * "DataEmissao": "25/03/2025", 
 * "DataVencimento": "10/10/2025",
 * "ValorTitulo": 177.19,
 * "Natureza": "P",
 * "Categoria": "2.01.03", 
 * "Cliente": "S S/A", 
 * "CODContaC": 1961574032, 
 * "Lancamentos": [{
 * "DataLancamento": "22/08/2025", 
 * "CODContaC": 1961574032, 
 * "ValorLancamento": 177.19, 
 * "ValorBaixado": 177.19
 * }], 
 * "Departamentos": [{
 * "CODDepto": 1922599606, 
 * "PercDepto": 100
 * }]
 * }
 * * @param {object} filtros - O objeto de filtros a ser enviado no corpo da requisição. Ex: { contas: [123, 456] }.
 * @returns {Promise<Array>} Uma promessa que resolve para o array de títulos financeiros. Em caso de falha na requisição, retorna um array vazio.
 */
async function buscarTitulos(filtros) {
    let baseURL = "https://plataforma-geourb.bubbleapps.io/";
    if (window.location.href.includes("version-test")) {
        baseURL += "version-test";
    } else {
        baseURL += "version-live";
    }
    const API_URL = `${baseURL}/api/1.1/wf/buscarmovimentos`;

    // O payload aceita:
    // anos: ["2024"] (Para realizado)
    // anos: ["AREALIZAR"] (Para a realizar - convenção para a API retornar tudo em aberto + saldo acumulado)
    const payload = {
        contas: filtros.contas,
        anos: filtros.anos 
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Falha API: ${response.status} - ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Erro buscarTitulos:", error);
        return { response: { movimentos: [], saldoInicial: 0 } };
    }
}

async function buscarValoresEstoque(filtros) {
    let baseURL = "https://plataforma-geourb.bubbleapps.io/";
    if (window.location.href.includes("version-test")) {
        baseURL += "version-test";
    } else {
        baseURL += "version-live";
    }
    const API_URL = `${baseURL}/api/1.1/wf/buscarsaldosestoque`;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(filtros),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Falha ao buscar estoques: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Erro crítico ao buscar estoques:", error);
        // Notificação para o usuário na UI
        alert("Ocorreu um erro ao buscar os dados. Verifique o console para mais detalhes.");
        // Retorna um array vazio em caso de erro para não quebrar a aplicação
        return []; 
    }
}

/**
 * Busca o período com dados (data inicial e final) para uma conta e projeção específica.
 * @param {string} contaId - O ID da conta.
 * @param {string} projecao - "realizado" ou "arealizar".
 * @returns {Promise<object>} Objeto com { periodo_ini, periodo_fim }.
 */
async function buscarPeriodosComDados(contaId, projecao) {
    let baseURL = "https://plataforma-geourb.bubbleapps.io/";
    if (window.location.href.includes("version-test")) {
        baseURL += "version-test";
    } else {
        baseURL += "version-live";
    }
    const API_URL = `${baseURL}/api/1.1/wf/buscarperiodoscomdados`;

    // Agora enviamos conta E projecao no corpo
    const payload = {
        conta: contaId,
        projecao: projecao // "realizado" ou "arealizar"
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.warn(`Falha ao buscar períodos para conta ${contaId} (${projecao})`);
            return { response: { periodo_ini: null, periodo_fim: null } };
        }
        return await response.json();
    } catch (error) {
        console.error("Erro ao buscar períodos com dados:", error);
        return { response: { periodo_ini: null, periodo_fim: null } };
    }
}

// Exporta a função para ser utilizada em outros módulos.
export { buscarTitulos, buscarValoresEstoque, buscarPeriodosComDados };