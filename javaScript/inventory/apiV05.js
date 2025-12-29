// apiV01.js

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

// Busca as datas disponíveis para um ID de Cadastro
export async function buscarRelatoriosDisponiveis(idCadastro) {
    const payload = { IDCadastro: idCadastro };
    try {
        return await realizarPost('buscarRelatoriosDisponiveis', payload, 'buscarRelatoriosDisponiveis');
    } catch (error) {
        console.warn("Falha ao buscar datas, retornando vazio.");
        return { response: { relatoriosDisponivies: "" } };
    }
}

// Busca o relatório final (agora enviando ID e DATA)
export async function buscarDadosEstoque(idCadastro, dataSelecionada) {
    // O payload inclui a data selecionada se fornecida
    const payload = { 
        IDCadastro: idCadastro,
        DataRelatorio: dataSelecionada // Assumindo que o Bubble espera este parâmetro para filtrar
    };
    
    try {
        return await realizarPost('buscarRelatorioEstoque', payload, 'buscarRelatorioEstoque');
    } catch (error) {
        // Retorna estrutura vazia segura em caso de falha
        return { response: { relatorio: "" } };
    }
}