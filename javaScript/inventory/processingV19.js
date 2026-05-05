// processingV19.js

// --- CONSTANTES DE NEGOCIO ---
const LEAD_TIME_DIAS = 15;
const MARGEM_SEGURANCA = 0.50; // 50%
const JANELA_ANALISE_DIAS = 90;

function corrigirEParsearJSON(stringDados) {
    if (!stringDados) return [];
    try {
        if (typeof stringDados === 'object') return stringDados;
        // Tenta parsear JSON padrão
        try { return JSON.parse(stringDados); } 
        // Fallback para arrays mal formados se necessário
        catch (e) { return JSON.parse(`[${stringDados}]`); }
    } catch (erro) {
        console.error("Erro JSON:", erro);
        return [];
    }
}

export function extrairDadosRelatorio(dadosApi) {
    // Normalização do objeto de resposta
    let rawRelatorio = {};
    
    if (dadosApi.response && dadosApi.response.relatorio) {
        rawRelatorio = typeof dadosApi.response.relatorio === 'string' 
            ? corrigirEParsearJSON(dadosApi.response.relatorio)
            : dadosApi.response.relatorio;
    } else if (dadosApi.response) {
        rawRelatorio = dadosApi.response;
    }

    console.log("Objeto Relatório Normalizado:", rawRelatorio);

    if (rawRelatorio.maisVendidos || rawRelatorio.recomendacaoCompra) {
        console.log("Usando dados pré-processados da API");
        return {
            maisVendidos: corrigirEParsearJSON(rawRelatorio.maisVendidos),
            maioresSaldos: corrigirEParsearJSON(rawRelatorio.maioresSaldos),
            recomendacaoCompra: corrigirEParsearJSON(rawRelatorio.recomendacaoCompra)
        };
    }
}