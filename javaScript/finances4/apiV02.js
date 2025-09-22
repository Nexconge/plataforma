// api.js

/**
 * Envia os filtros para a API e busca os lançamentos correspondentes.
 * @param {object} filtros - O objeto de filtros gerado por obterFiltrosSelecionados.
 * @returns {Promise<Array>} Uma promessa que resolve para o array de lançamentos.
 */
async function buscarTitulos(filtros) {
    //Monta a URL da API dependendo do ambiente (teste ou produção)
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
        console.log("Resposta da API (raw):", response);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Falha ao buscar titulos: ${response.status} ${response.statusText} - ${errorText}`);
        }
        console.log("Resposta da API (JSON):", await response.clone().json());
        return await response.json();
    } catch (error) {
        console.error("Erro crítico ao buscar titulos:", error);
        // Opcional: Adicionar uma notificação para o usuário na UI
        alert("Ocorreu um erro ao buscar os dados. Verifique o console para mais detalhes.");
        // Retorna um array vazio em caso de erro para não quebrar a aplicação
        return []; 
    }
}

// Exporta a nova função junto com as existentes
export { buscarTitulos };