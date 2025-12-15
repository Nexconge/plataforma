function obterBaseURL() {
    const dominio = "https://plataforma-geourb.bubbleapps.io/";
    const ambiente = window.location.href.includes("version-test") ? "version-test" : "version-live";
    return `${dominio}${ambiente}/api/1.1/wf`;
}

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
        throw error;
    }
}

export async function buscarDadosEstoque(filtros) {
    const payload = { IDCadastro: filtros };
    try {
        return await realizarPost('buscarRelatorioEstoque', payload, 'buscarRelatorioEstoque');
    } catch (error) {
        // Retorna estrutura vazia segura em caso de falha
        return { response: { entradasESaidas: "", saldoProdutos: "", produtosEstoque: "" } };
    }
}