// processing.js

// Função interna auxiliar para limpar o JSON da API
function corrigirEParsearJSON(stringDados) {
    if (!stringDados) return [];
    try {
        try {
            return JSON.parse(stringDados);
        } catch (e) {
            // Se falhar, tenta envelopar em array
            return JSON.parse(`[${stringDados}]`);
        }
    } catch (erro) {
        console.error("Erro ao converter JSON:", erro);
        return [];
    }
}

export function processarDados(dadosApi) {
    // 1. Parse dos dados crus
    const rawMovimentos = corrigirEParsearJSON(dadosApi.response.entradasESaidas);
    const rawSaldos = corrigirEParsearJSON(dadosApi.response.saldoProdutos);
    const rawNomes = corrigirEParsearJSON(dadosApi.response.produtosEstoque);

    // 2. Mapa de Nomes (ID -> Nome)
    const mapaNomes = {};
    rawNomes.forEach(item => {
        mapaNomes[item.idProduto] = item.produto;
    });
    const getNome = (id) => mapaNomes[id] || `ID: ${id}`;

    // 3. Agrupar Vendas (Demanda Total por Produto)
    const demandaPorProduto = {};
    rawMovimentos.forEach(mov => {
        const id = mov.idProduto;
        const qtd = parseInt(mov.quantidade) || 0;
        demandaPorProduto[id] = (demandaPorProduto[id] || 0) + qtd;
    });

    // 4. Agrupar Saldos (Soma de estoques de filiais)
    const estoqueConsolidado = {};
    rawSaldos.forEach(item => {
        const id = item.idProduto;
        const saldo = parseInt(item.SaldoAtual) || 0;
        estoqueConsolidado[id] = (estoqueConsolidado[id] || 0) + saldo;
    });

    // --- LISTA 1: Mais Vendidos ---
    const maisVendidos = Object.keys(demandaPorProduto)
        .map(id => ({
            nome: getNome(id),
            quantidade: demandaPorProduto[id]
        }))
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10);

    // --- LISTA 2: Maiores Saldos ---
    const maioresSaldos = Object.keys(estoqueConsolidado)
        .map(id => ({
            nome: getNome(id),
            quantidade: estoqueConsolidado[id]
        }))
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10);

    // --- LISTA 3: Recomendação Inteligente ---
    const todosIds = new Set([...Object.keys(demandaPorProduto), ...Object.keys(estoqueConsolidado)]);
    const recomendacaoCompra = [];

    todosIds.forEach(id => {
        const estoqueAtual = estoqueConsolidado[id] || 0;
        const demandaRecente = demandaPorProduto[id] || 0;

        // Regra: Demanda > Estoque Atual
        if (demandaRecente > 0 && estoqueAtual < demandaRecente) {
            const deficit = demandaRecente - estoqueAtual;
            
            recomendacaoCompra.push({
                nome: getNome(id),
                estoque: estoqueAtual,
                demanda: demandaRecente,
                sugestao: deficit,
                urgencia: (demandaRecente === 0) ? 0 : (estoqueAtual / demandaRecente)
            });
        }
    });

    // Ordenar por urgência (menor % de cobertura primeiro)
    recomendacaoCompra.sort((a, b) => a.urgencia - b.urgencia);

    return {
        maisVendidos,
        maioresSaldos,
        recomendacaoCompra: recomendacaoCompra.slice(0, 15)
    };
}