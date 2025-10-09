// api.js - Módulo de Comunicação com a API

/**
 * Envia uma requisição POST para a API do Bubble para buscar os movimentos (títulos)
 * com base nos filtros fornecidos.
 * * @param {object} filtros - O objeto de filtros (ex: { contas: [123, 456] }).
 * @returns {Promise<object>} Uma promessa que resolve para a resposta completa da API.
 */
async function buscarTitulos(filtros) {
    // Monta a URL da API dinamicamente para ambiente de teste ou produção
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
            throw new Error(`Falha na requisição à API: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        return await response.json();

    } catch (error) {
        console.error("Erro crítico ao buscar títulos via API:", error);
        // Notifica o usuário na UI sobre a falha
        alert("Ocorreu um erro ao buscar os dados financeiros. Por favor, tente recarregar a página. Se o problema persistir, contate o suporte.");
        // Retorna um objeto com uma resposta vazia para não quebrar o fluxo da aplicação
        return { response: { movimentos: "" } }; 
    }
}

export { buscarTitulos };