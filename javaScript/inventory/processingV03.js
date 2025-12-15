// processing.js

// Função auxiliar para limpar o JSON da API (mantida para segurança)
function corrigirEParsearJSON(stringDados) {
    if (!stringDados) return [];
    try {
        // Se já for objeto/array, retorna direto
        if (typeof stringDados === 'object') return stringDados;
        
        try {
            return JSON.parse(stringDados);
        } catch (e) {
            // Tenta envelopar em array se falhar (caso venha separado por virgula sem colchetes)
            return JSON.parse(`[${stringDados}]`);
        }
    } catch (erro) {
        console.error("Erro ao converter JSON:", erro);
        return [];
    }
}

export function processarDados(dadosApi) {
    // 1. Parse dos dados crus
    // AVISO: Assume-se que 'entradasESaidas' agora contém a lista de Notas Fiscais
    const rawNotasFiscais = corrigirEParsearJSON(dadosApi.response.entradasESaidas);
    const rawSaldos = corrigirEParsearJSON(dadosApi.response.saldoProdutos);
    const rawNomes = corrigirEParsearJSON(dadosApi.response.produtosEstoque);

    // 2. Mapa de Nomes (ID -> Nome)
    const mapaNomes = {};
    rawNomes.forEach(item => {
        // Garante conversão para string para chavear corretamente
        mapaNomes[String(item.idProduto)] = item.produto;
    });
    const getNome = (id) => mapaNomes[String(id)] || `ID: ${id}`;

    // ---------------------------------------------------------
    // NOVA LÓGICA: EXTRAÇÃO DE PRODUTOS DAS NOTAS
    // ---------------------------------------------------------
    const demandaPorProduto = {};

    // Itera sobre cada NOTA FISCAL
    rawNotasFiscais.forEach(nota => {
        // Opcional: Filtrar apenas saídas se a regra for baseada em vendas
        // Se quiser considerar tudo (ajuste conforme regra), remova o if.
        if (nota.tipo && nota.tipo.toLowerCase() !== 'saida') {
            return; 
        }

        // Verifica se existe array de produtos na nota
        if (nota.produtos && Array.isArray(nota.produtos)) {
            // Itera sobre os PRODUTOS dentro da nota
            nota.produtos.forEach(prod => {
                const id = String(prod.idProduto); // Normaliza ID para string
                const qtd = parseInt(prod.quantidade) || 0;
                
                demandaPorProduto[id] = (demandaPorProduto[id] || 0) + qtd;
            });
        }
    });

    // ---------------------------------------------------------
    // LÓGICA DE SALDOS (Mantida igual, mas consolidando por ID)
    // ---------------------------------------------------------
    const estoqueConsolidado = {};
    rawSaldos.forEach(item => {
        const id = String(item.idProduto);
        const saldo = parseInt(item.SaldoAtual) || 0;
        estoqueConsolidado[id] = (estoqueConsolidado[id] || 0) + saldo;
    });

    // ---------------------------------------------------------
    // GERAÇÃO DAS LISTAS FINAIS
    // ---------------------------------------------------------

    // --- LISTA 1: Mais Vendidos (Baseado na extração das notas) ---
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

    // --- LISTA 3: Recomendação Inteligente (Ruptura) ---
    // Regra: Compra se (Demanda das Notas de Saída > Estoque Atual Consolidado)
    const todosIds = new Set([...Object.keys(demandaPorProduto), ...Object.keys(estoqueConsolidado)]);
    const recomendacaoCompra = [];

    todosIds.forEach(id => {
        const estoqueAtual = estoqueConsolidado[id] || 0;
        const demandaRecente = demandaPorProduto[id] || 0;

        if (demandaRecente > 0 && estoqueAtual < demandaRecente) {
            const deficit = demandaRecente - estoqueAtual;
            
            recomendacaoCompra.push({
                nome: getNome(id),
                estoque: estoqueAtual,
                demanda: demandaRecente,
                sugestao: deficit,
                // Urgência: quanto menor o número, menos estoque tenho proporcionalmente à venda
                // Se demanda for 0, urgência é infinita (não divide por zero)
                urgencia: (demandaRecente === 0) ? 999 : (estoqueAtual / demandaRecente)
            });
        }
    });

    // Ordenar por urgência (menor índice primeiro = mais critico)
    recomendacaoCompra.sort((a, b) => a.urgencia - b.urgencia);

    return {
        maisVendidos,
        maioresSaldos,
        recomendacaoCompra: recomendacaoCompra
        //recomendacaoCompra: recomendacaoCompra.slice(0, 15)
    };
}