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

// Exporta as funções para que outros módulos possam usá-las
export { buscarDadosOMIE, obterDataAtualizacaoArquivo };