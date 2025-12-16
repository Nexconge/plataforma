// processing.js

// --- CONSTANTES DE NEGOCIO ---
const LEAD_TIME_DIAS = 15;
const MARGEM_SEGURANCA = 0.50; // 50%
const JANELA_ANALISE_DIAS = 90; // Para cálculo da venda média

function corrigirEParsearJSON(stringDados) {
    if (!stringDados) return [];
    try {
        if (typeof stringDados === 'object') return stringDados;
        try { return JSON.parse(stringDados); } 
        catch (e) { return JSON.parse(`[${stringDados}]`); }
    } catch (erro) {
        console.error("Erro JSON:", erro);
        return [];
    }
}

export function processarDados(dadosApi) {
    const rawNotas = corrigirEParsearJSON(dadosApi.response.entradasESaidas);
    const rawSaldos = corrigirEParsearJSON(dadosApi.response.saldoProdutos);
    const rawNomes = corrigirEParsearJSON(dadosApi.response.produtosEstoque);

    // Mapeamento de Nomes
    const mapaNomes = {};
    rawNomes.forEach(item => { mapaNomes[String(item.idProduto)] = item.produto; });
    const getNome = (id) => mapaNomes[String(id)] || `ID: ${id}`;

    // 1. Calcular Vendas Totais (Demanda)
    const vendasTotais = {};
    rawNotas.forEach(nota => {
        // Filtra apenas saídas
        if (nota.tipo && nota.tipo.toLowerCase() !== 'saida') return;

        if (nota.produtos && Array.isArray(nota.produtos)) {
            nota.produtos.forEach(prod => {
                const id = String(prod.idProduto);
                const qtd = parseInt(prod.quantidade) || 0;
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
        if (estoqueAtualMap[id] < 0) { estoqueAtualMap[id] = 0;}
    });

    // --- LISTAS SIMPLES (Mantidas para visualização geral) ---
    const maisVendidos = Object.keys(vendasTotais)
        .map(id => ({ nome: getNome(id), quantidade: vendasTotais[id] }))
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10);

    const maioresSaldos = Object.keys(estoqueAtualMap)
        .map(id => ({ nome: getNome(id), quantidade: estoqueAtualMap[id] }))
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10);

    // --- LISTA 3: MRP / RECOMENDAÇÃO DE COMPRA ---
    const todosIds = new Set([...Object.keys(vendasTotais), ...Object.keys(estoqueAtualMap)]);
    const recomendacaoCompra = [];

    todosIds.forEach(id => {
        const totalVendas90Dias = vendasTotais[id] || 0;
        const estoqueReal = estoqueAtualMap[id] || 0;
        
        // REGRA DE NEGÓCIO: Se estoque < 0, considerar 0 para o cálculo de necessidade
        const estoqueCalculo = estoqueReal < 0 ? 0 : estoqueReal;

        // 1. Venda Média Diária (VMD)
        const vendaMediaDiaria = totalVendas90Dias / JANELA_ANALISE_DIAS;

        // 2. Estoque Mínimo (Ponto de Pedido)
        // Fórmula: VMD * LeadTime * (1 + Segurança)
        const estoqueMinimo = vendaMediaDiaria * LEAD_TIME_DIAS * (1 + MARGEM_SEGURANCA);

        // 3. Verificação de Compra
        // Se Estoque Atual < Estoque Mínimo
        if (estoqueCalculo < estoqueMinimo) {
            // Sugestão: O quanto falta para atingir o estoque mínimo (ou um alvo maior)
            // Aqui sugerimos comprar o suficiente para voltar ao nível do estoque mínimo + arredondamento
            const sugestaoCompra = Math.ceil(estoqueMinimo - estoqueCalculo);
            
            // Calculamos urgência (quanto % do estoque mínimo eu tenho?)
            // Se estoqueMinimo for 0 (sem vendas), urgencia é baixa
            const urgencia = estoqueMinimo === 0 ? 1 : (estoqueCalculo / estoqueMinimo);

            if (sugestaoCompra > 0) {
                recomendacaoCompra.push({
                    nome: getNome(id),
                    estoqueAtual: estoqueReal, // Mostra o real (pode ser negativo)
                    vendaMedia: vendaMediaDiaria.toFixed(2),
                    estoqueMinimo: Math.ceil(estoqueMinimo), // Arredonda visualmente
                    sugestao: sugestaoCompra,
                    urgencia: urgencia
                });
            }
        }
    });

    // Ordenar: Menor cobertura (mais urgente) primeiro
    recomendacaoCompra.sort((a, b) => a.urgencia - b.urgencia);

    return {
        maisVendidos,
        maioresSaldos,
        recomendacaoCompra // Retorna lista completa, UI decide quantos mostra
    };
}