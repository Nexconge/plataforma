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
/*function corrigirEParsearJSON(dados) {
    if (!dados) return [];

    // Se já for array real
    if (Array.isArray(dados)) return dados;

    // Se for objeto único
    if (typeof dados === 'object') return [dados];

    try {
        return JSON.parse(dados);
    } catch {
        try {
            return JSON.parse(`[${dados}]`);
        } catch (e) {
            console.error("Erro ao parsear JSON:", e, dados);
            return [];
        }
    }
}

function limparID(valor) {
    if (!valor) return "ND";
    return String(valor).replace(/[^a-zA-Z0-9]/g, "");
}

const LEAD_TIME_DIAS = 15;
const MARGEM_SEGURANCA = 0.50; 
const JANELA_ANALISE_DIAS = 90; 

const rawNotas  = corrigirEParsearJSON(properties.thing1);
const rawSaldos = corrigirEParsearJSON(properties.thing3);
const rawNomes  = corrigirEParsearJSON(properties.thing2);

// --- 1. MAPEAMENTO DE NOMES (Com limpeza) ---
const mapaNomes = {};
rawNomes.forEach(item => { 
    // Usa limparID aqui
    mapaNomes[limparID(item.idProduto)] = item.produto; 
});
const getNome = (id) => mapaNomes[id] || `ID: ${id}`;

// --- 2. CALCULAR VENDAS (Com limpeza) ---
const vendasTotais = {};
rawNotas.forEach(nota => {
    if (nota.produtos && Array.isArray(nota.produtos)) {
        nota.produtos.forEach(prod => {
            // Usa limparID aqui
            const id = limparID(prod.idProduto);
            let qtd = parseInt(prod.quantidade) || 0;

            if (nota.tipo && String(nota.tipo).toLowerCase() !== 'saida') qtd = -qtd; 
            vendasTotais[id] = (vendasTotais[id] || 0) + qtd;
        });
    }
});

// --- 3. CALCULAR ESTOQUE (Com limpeza) ---
const estoqueAtualMap = {};
rawSaldos.forEach(item => {
    // Usa limparID aqui - Isso vai garantir que o ID do estoque bata com o da venda
    const id = limparID(item.idProduto);
    const saldo = parseInt(item.SaldoAtual) || 0;
    estoqueAtualMap[id] = (estoqueAtualMap[id] || 0) + saldo;
});

// --- LISTAS PARA VISUALIZAÇÃO ---
const maisVendidos = Object.keys(vendasTotais)
    .map(id => ({ nome: getNome(id), quantidade: vendasTotais[id] }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 10);

const maioresSaldos = Object.keys(estoqueAtualMap)
    .map(id => ({ nome: getNome(id), quantidade: estoqueAtualMap[id] }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 10);

// --- CÁLCULO FINAL MRP ---
// Agora o Set vai unificar corretamente porque as chaves são idênticas
const todosIds = new Set([...Object.keys(vendasTotais), ...Object.keys(estoqueAtualMap)]);
const recomendacaoCompra = [];

todosIds.forEach(id => {
    if(id === "ND") return;

    const totalVendas = vendasTotais[id] || 0;
    const estoqueReal = estoqueAtualMap[id] || 0; 
    
    // Como agora os IDs são iguais, estoqueReal deve vir corretamente como 207 para o ID 1649

    const estoqueCalculo = estoqueReal < 0 ? 0 : estoqueReal;
    const vendaMediaDiaria = totalVendas / JANELA_ANALISE_DIAS;
    const estoqueMinimo = vendaMediaDiaria * LEAD_TIME_DIAS * (1 + MARGEM_SEGURANCA);

    if (estoqueCalculo < estoqueMinimo) {
        const sugestaoCompra = Math.ceil(estoqueMinimo - estoqueCalculo);
        
        // Evita divisão por zero se estoqueMinimo for muito baixo
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

// Ordenar pela sugestão (maior necessidade primeiro)
recomendacaoCompra.sort((a, b) => b.sugestao - a.sugestao).slice(0, 15);

const separador = "|SPLIT|";
const relatorioFinal = JSON.stringify(maisVendidos) + separador + JSON.stringify(maioresSaldos) + separador + JSON.stringify(recomendacaoCompra);

return relatorioFinal;*/