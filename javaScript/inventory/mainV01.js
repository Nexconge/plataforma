// --- 1. CONFIGURAÇÃO DA API (Seu código original) ---

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

async function buscarDadosEstoque(filtros) {
    const payload = { CODprojeto: filtros };
    try {
        return await realizarPost('buscarRelatorioEstoque', payload, 'buscarRelatorioEstoque');
    } catch (error) {
        console.log(error);
        return { response: { entradasESaidas: "", saldoProdutos: "", produtosEstoque: "" } };
    }
}

// --- 2. LÓGICA DE PROCESSAMENTO E EXIBIÇÃO ---

/**
 * A API retorna strings como "{\"id\":1},{\"id\":2}".
 * Esta função adiciona colchetes para transformar em array JSON válido: "[{\"id\":1},{\"id\":2}]"
 */
function corrigirEParsearJSON(stringDados) {
    if (!stringDados) return [];
    try {
        // Tenta parsear direto, se falhar, tenta envelopar em colchetes
        try {
            return JSON.parse(stringDados);
        } catch (e) {
            return JSON.parse(`[${stringDados}]`);
        }
    } catch (erro) {
        console.error("Erro ao converter string da API para JSON:", erro);
        return [];
    }
}

function processarEExibirDados(dadosApi) {
    // 1. Converter as strings retornadas em Arrays de Objetos reais
    const listaMovimentos = corrigirEParsearJSON(dadosApi.response.entradasESaidas);
    const listaSaldos = corrigirEParsearJSON(dadosApi.response.saldoProdutos);
    const listaNomes = corrigirEParsearJSON(dadosApi.response.produtosEstoque);

    // 2. Criar um Mapa de IDs para Nomes para acesso rápido
    // Ex: { "2": "CA MARACUJA SHAMPOO", "4": "GN CX..." }
    const mapaNomes = {};
    listaNomes.forEach(item => {
        mapaNomes[item.idProduto] = item.produto;
    });

    const getNome = (id) => mapaNomes[id] || `Produto ID: ${id}`;

    // --- TABELA 1: MAIS VENDIDOS ---
    // Lógica: Somar quantidades por ID em 'entradasESaidas'
    const vendasPorProduto = {};
    listaMovimentos.forEach(mov => {
        const id = mov.idProduto;
        const qtd = parseInt(mov.quantidade) || 0;
        if (vendasPorProduto[id]) {
            vendasPorProduto[id] += qtd;
        } else {
            vendasPorProduto[id] = qtd;
        }
    });

    // Converter para array e ordenar (Maior para menor)
    const arrayMaisVendidos = Object.keys(vendasPorProduto)
        .map(id => ({
            nome: getNome(id),
            quantidade: vendasPorProduto[id]
        }))
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10); // Pegar top 10

    gerarTabela("tabelaMaisVendidos", "Mais Vendidos", ["Produto", "Qtd. Movimentada"], arrayMaisVendidos);

    // --- TABELA 2: MAIORES SALDOS ---
    // Lógica: Ordenar listaSaldos decrescente
    const arrayMaioresSaldos = listaSaldos
        .map(item => ({
            nome: getNome(item.idProduto),
            quantidade: parseInt(item.SaldoAtual) || 0
        }))
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10); // Pegar top 10

    gerarTabela("tabelaMaioresSaldos", "Maiores Saldos em Estoque", ["Produto", "Saldo Atual"], arrayMaioresSaldos);

    // --- TABELA 3: RECOMENDAÇÃO DE COMPRA ---
    // Lógica: Itens com saldo negativo ou zerado (ordenado do menor saldo para o maior)
    const arrayRecomendacao = listaSaldos
        .map(item => ({
            nome: getNome(item.idProduto),
            quantidade: parseInt(item.SaldoAtual) || 0
        }))
        .filter(item => item.quantidade <= 5) // Exemplo: Estoque abaixo de 5 (ajuste conforme regra de negócio)
        .sort((a, b) => a.quantidade - b.quantidade) // Do menor (negativo) para o maior
        .slice(0, 10);

    gerarTabela("tabelaRecomendacaoCompra", "Recomendação de Compra (Estoque Baixo)", ["Produto", "Saldo Crítico"], arrayRecomendacao);
}

// Função auxiliar para criar o HTML da tabela
function gerarTabela(idTabela, titulo, colunas, dados) {
    const tabela = document.getElementById(idTabela);
    if (!tabela) return;

    let html = `
        <thead>
            <tr><th colspan="2" style="background-color: #f0f0f0; text-align: left; padding: 10px;">${titulo}</th></tr>
            <tr>
                <th style="text-align: left; border-bottom: 1px solid #ddd; padding: 8px;">${colunas[0]}</th>
                <th style="text-align: right; border-bottom: 1px solid #ddd; padding: 8px;">${colunas[1]}</th>
            </tr>
        </thead>
        <tbody>
    `;

    dados.forEach(dado => {
        // Formatação condicional (vermelho se negativo na recomendação)
        const cor = dado.quantidade < 0 ? 'red' : 'black';
        html += `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${dado.nome}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; color: ${cor}; font-weight: bold;">${dado.quantidade}</td>
            </tr>
        `;
    });

    html += `</tbody>`;
    tabela.innerHTML = html;
}

// --- 3. EXECUÇÃO ---

buscarDadosEstoque("1894620120")
    .then(resultado => {
        console.log("Dados recebidos da API.");
        processarEExibirDados(resultado);
    })
    .catch(err => {
        console.error("Erro fatal:", err);
    });