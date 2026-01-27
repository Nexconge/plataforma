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

//Função utilizada dentro do workflow do bubble para gerar os relatórios e salvar no banco de dados
/*function corrigirEParsearJSON(dados) {
    if (!dados) return [];
    if (Array.isArray(dados)) return dados;
    if (typeof dados === 'object') return [dados];
    try {
        return JSON.parse(dados);
    } catch {
        try {
            return JSON.parse(`[${dados}]`);
        } catch (e) {
            return [];
        }
    }
}

function limparID(valor) {
    if (!valor) return "ND";
    return String(valor).replace(/[^a-zA-Z0-9]/g, "");
}

// --- CONSTANTES ---
const LEAD_TIME_DIAS = 15;
const MARGEM_SEGURANCA = 0.50; 
const JANELA_ANALISE_DIAS = 90; 

// --- INPUTS ---
const rawNotas  = corrigirEParsearJSON(properties.thing1);
const rawSaldos = corrigirEParsearJSON(properties.thing3);
const rawNomes  = corrigirEParsearJSON(properties.thing2);

// --- 1. MAPEAMENTO DE NOMES (Whitelist) ---
const mapaNomes = {};
rawNomes.forEach(item => { 
    mapaNomes[limparID(item.idProduto)] = item.produto; 
});
const getNome = (id) => mapaNomes[id] || `ID: ${id}`;

// --- 2. PROCESSAMENTO DE VENDAS E PREÇOS ---
const vendasTotais = {};
const dadosFinanceiros = {}; // Armazena { qtd: 0, valorTotal: 0 } para média

rawNotas.forEach(nota => {
    if (nota.produtos && Array.isArray(nota.produtos)) {
        nota.produtos.forEach(prod => {
            const id = limparID(prod.idProduto);
            if (!mapaNomes.hasOwnProperty(id)) return; 

            const qtd = parseInt(prod.quantidade) || 0;
            const valorTotalItem = parseFloat(prod.valorTotal) || 0;
            const tipo = String(nota.tipo || "").toLowerCase();

            // Lógica de Vendas (Quantidade Líquida)
            let qtdParaSoma = qtd;
            if (tipo !== 'saida') qtdParaSoma = -qtd; 
            vendasTotais[id] = (vendasTotais[id] || 0) + qtdParaSoma;

            // Lógica de Preço Médio (Apenas Saídas contam para o preço de mercado)
            if (tipo === 'saida') {
                if (!dadosFinanceiros[id]) dadosFinanceiros[id] = { qtd: 0, valor: 0 };
                dadosFinanceiros[id].qtd += qtd;
                dadosFinanceiros[id].valor += valorTotalItem;
            }
        });
    }
});

// Helper para calcular preço médio
const getPrecoMedio = (id) => {
    const dados = dadosFinanceiros[id];
    if (!dados || dados.qtd === 0) return 0;
    return dados.valor / dados.qtd;
};

// --- 3. PROCESSAMENTO DE ESTOQUE ---
const estoqueAtualMap = {};
rawSaldos.forEach(item => {
    const id = limparID(item.idProduto);
    if (!mapaNomes.hasOwnProperty(id)) return;

    const saldo = parseInt(item.SaldoAtual) || 0;
    estoqueAtualMap[id] = (estoqueAtualMap[id] || 0) + saldo;
});

// --- 4. GERAÇÃO DAS LISTAS ---

// A) Mais Vendidos (Enriquecido)
const maisVendidos = Object.keys(vendasTotais)
    .map(id => {
        const qtd = vendasTotais[id];
        const precoMedio = getPrecoMedio(id);
        return { 
            nome: getNome(id), 
            quantidade: qtd,
            valorUnitario: precoMedio,
            valorTotal: qtd * precoMedio,
            vendasDia: qtd / JANELA_ANALISE_DIAS
        };
    })
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 15);

// B) Maiores Saldos (Enriquecido)
const maioresSaldos = Object.keys(estoqueAtualMap)
    .map(id => {
        const saldo = estoqueAtualMap[id];
        const precoMedio = getPrecoMedio(id);
        const qtdVendas = vendasTotais[id] || 0;
        return { 
            nome: getNome(id), 
            quantidade: saldo,
            valorUnitario: precoMedio,
            valorTotal: saldo * precoMedio,
            vendasDia: qtdVendas / JANELA_ANALISE_DIAS
        };
    })
    .sort((a, b) => b.quantidade - a.quantidade) // Ordena por quantidade em estoque
    .slice(0, 15);

// C) Recomendação de Compra (MRP)
const todosIds = new Set([...Object.keys(vendasTotais), ...Object.keys(estoqueAtualMap)]);
const recomendacaoCompra = [];

todosIds.forEach(id => {
    if(id === "ND") return;

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
                vendaMedia: Number(vendaMediaDiaria.toFixed(2)),
                estoqueMinimo: Math.ceil(estoqueMinimo),
                sugestao: sugestaoCompra,
                urgencia: urgencia
            });
        }
    }
});

recomendacaoCompra.sort((a, b) => b.vendaMedia - a.vendaMedia);
const recomendacaoFinal = recomendacaoCompra.slice(0, 15);

// --- SAÍDA ---
const separador = "|SPLIT|";
const relatorioFinal = JSON.stringify(maisVendidos) + separador + JSON.stringify(maioresSaldos) + separador + JSON.stringify(recomendacaoFinal);

return relatorioFinal;*/