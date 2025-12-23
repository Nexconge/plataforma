// processingV11.js

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

//Função utilizada dentro do workflo do bubble para gerar os relatórios e salvar no banco de dados
/*function processarDados(dadosApi) {
    // Adaptação: O novo endpoint retorna 'relatorio' que contém tudo
    let rawRelatorio = {};
    
    // Verifica se veio do formato antigo ou novo
    if (dadosApi.response && dadosApi.response.relatorio) {
        // Se 'relatorio' for uma string JSON, parseamos
        rawRelatorio = typeof dadosApi.response.relatorio === 'string' 
            ? corrigirEParsearJSON(dadosApi.response.relatorio)
            : dadosApi.response.relatorio;
    } else if (dadosApi.response) {
        // Fallback para formato antigo (caso a API retorne os campos separados)
        rawRelatorio = dadosApi.response;
    }

    // Extração segura das listas (assume que o objeto relatorio tem essas chaves)
    // Se o 'relatorio' for uma lista única misturada, a lógica teria que mudar drasticamente.
    // Assumimos aqui que o objeto 'relatorio' agrupa as 3 listas anteriores.
    const rawNotas = rawRelatorio.entradasESaidas ? corrigirEParsearJSON(rawRelatorio.entradasESaidas) : [];
    const rawSaldos = rawRelatorio.saldoProdutos ? corrigirEParsearJSON(rawRelatorio.saldoProdutos) : [];
    const rawNomes = rawRelatorio.produtosEstoque ? corrigirEParsearJSON(rawRelatorio.produtosEstoque) : [];

    // Mapeamento de Nomes
    const mapaNomes = {};
    rawNomes.forEach(item => { mapaNomes[String(item.idProduto)] = item.produto; });
    const getNome = (id) => mapaNomes[String(id)] || `ID: ${id}`;

    // 1. Calcular Vendas Totais (Demanda)
    const vendasTotais = {};
    rawNotas.forEach(nota => {
        if (nota.produtos && Array.isArray(nota.produtos)) {
            nota.produtos.forEach(prod => {
                const id = String(prod.idProduto);
                let qtd = parseInt(prod.quantidade) || 0;
                if (nota.tipo && nota.tipo.toLowerCase() !== 'saida') qtd = -qtd;
                vendasTotais[id] = (vendasTotais[id] || 0) + qtd;
            });
        }
    });

    // 2. Calcular Estoque Atual Consolidado
    const estoqueAtualMap = {};
    rawSaldos.forEach(item => {
        const id = String(item.idProduto);
        const saldo = parseInt(item.SaldoAtual) || 0;
        estoqueAtualMap[id] = (estoqueAtualMap[id] || 0) + saldo;
    });

    // --- LISTAS SIMPLES ---
    const maisVendidos = Object.keys(vendasTotais)
        .map(id => ({ nome: getNome(id), quantidade: vendasTotais[id] }))
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10);

    const maioresSaldos = Object.keys(estoqueAtualMap)
        .map(id => ({ nome: getNome(id), quantidade: estoqueAtualMap[id] }))
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10);

    // --- MRP / RECOMENDAÇÃO ---
    const todosIds = new Set([...Object.keys(vendasTotais), ...Object.keys(estoqueAtualMap)]);
    const recomendacaoCompra = [];

    todosIds.forEach(id => {
        const totalVendas = vendasTotais[id] || 0;
        const estoqueReal = estoqueAtualMap[id] || 0;
        const estoqueCalculo = estoqueReal < 0 ? 0 : estoqueReal;

        const vendaMediaDiaria = totalVendas / JANELA_ANALISE_DIAS;
        const estoqueMinimo = vendaMediaDiaria * LEAD_TIME_DIAS * (1 + MARGEM_SEGURANCA);

        if (estoqueCalculo < estoqueMinimo) {
            const sugestaoCompra = Math.ceil(estoqueMinimo - estoqueCalculo);
            const urgencia = estoqueMinimo === 0 ? 1 : (estoqueCalculo / estoqueMinimo);

            if (sugestaoCompra > 0) {
                recomendacaoCompra.push({
                    nome: getNome(id),
                    estoqueAtual: estoqueCalculo,
                    vendaMedia: vendaMediaDiaria.toFixed(2),
                    estoqueMinimo: Math.ceil(estoqueMinimo),
                    sugestao: sugestaoCompra,
                    urgencia: urgencia
                });
            }
        }
    });

    recomendacaoCompra.sort((a, b) => b.sugestao - a.sugestao);

    return { maisVendidos, maioresSaldos, recomendacaoCompra };
}*/