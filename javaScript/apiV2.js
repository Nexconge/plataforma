// api.js

// Busca os dados principais (lançamentos, etc.) da sua fonte.
async function buscarDadosOMIE(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Falha ao carregar dados de ${url}: ${response.statusText}`);
        return await response.json();
    } catch (error) {
        console.error("Erro crítico ao carregar dados principais:", error);
        throw error;
    }
}

// Busca a data de atualização do arquivo de forma eficiente.
async function obterDataAtualizacaoArquivo(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        if (!response.ok) throw new Error(`Não foi possível obter os cabeçalhos de ${url}: ${response.statusText}`);
        return response.headers.get('Last-Modified') || response.headers.get('date');
    } catch (error) {
        console.error("Erro de rede ao tentar obter data de atualização:", error);
        throw error;
    }
}

/**
 * Envia os filtros para a API e busca os lançamentos correspondentes.
 * @param {object} filtros - O objeto de filtros gerado por obterFiltrosSelecionados.
 * @returns {Promise<Array>} Uma promessa que resolve para o array de lançamentos.
 */
async function buscarLancamentos(filtros) {
    // Substitua '/api/buscar-lancamentos' pela URL real da sua API
    const API_URL = '/api/buscar-lancamentos'; 

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
            throw new Error(`Falha ao buscar lançamentos: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Erro crítico ao buscar lançamentos:", error);
        // Opcional: Adicionar uma notificação para o usuário na UI
        alert("Ocorreu um erro ao buscar os dados. Verifique o console para mais detalhes.");
        // Retorna um array vazio em caso de erro para não quebrar a aplicação
        return []; 
    }
}

// Exporta a nova função junto com as existentes
export { buscarDadosOMIE, obterDataAtualizacaoArquivo, buscarLancamentos };