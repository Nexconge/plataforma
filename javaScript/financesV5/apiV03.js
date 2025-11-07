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
    // Monta a URL da API dependendo do ambiente (teste ou produção)
    let baseURL = "https://plataforma-geourb.bubbleapps.io/";
    if (window.location.href.includes("version-test")) {
        baseURL += "version-test";
    } else {
        baseURL += "version-live";
    }
    const API_URL = `${baseURL}/api/1.1/wf/buscarmovimentos`;

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
            throw new Error(`Falha ao buscar titulos: ${response.status} ${response.statusText} - ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Erro crítico ao buscar titulos:", error);
        // Notificação para o usuário na UI
        alert("Ocorreu um erro ao buscar os dados. Verifique o console para mais detalhes.");
        // Retorna um array vazio em caso de erro para não quebrar a aplicação
        return []; 
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
        console.log("Resposta da API de estoques recebida com sucesso.");
        console.log(response.clone().json());
        console.log(response.clone().text);
        return await response.json();
    } catch (error) {
        console.error("Erro crítico ao buscar estoques:", error);
        // Notificação para o usuário na UI
        alert("Ocorreu um erro ao buscar os dados. Verifique o console para mais detalhes.");
        // Retorna um array vazio em caso de erro para não quebrar a aplicação
        return []; 
    }
}
// Exporta a função para ser utilizada em outros módulos.
export { buscarTitulos, buscarValoresEstoque};