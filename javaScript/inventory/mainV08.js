// main.js
import { buscarDadosEstoque } from './apiV01.js';
import { processarDados } from './processingV06.js';
import { gerarTabelaPadrao, gerarTabelaRecomendacao } from './uiV03.js';

const IDCadastro = "1765300374970x436967584924167400";

async function iniciarAplicacao() {
    console.log("Iniciando busca de dados...");

    try {
        // 1. Busca
        const dadosBrutos = await buscarDadosEstoque(IDCadastro);
        
        // 2. Processamento
        const dadosProcessados = processarDados(dadosBrutos);

        // 3. Renderização (UI)
        gerarTabelaPadrao(
            "tabelaMaisVendidos", 
            "Produtos Mais Movimentados", 
            ["Produto", "Total Saída"], 
            dadosProcessados.maisVendidos
        );

        gerarTabelaPadrao(
            "tabelaMaioresSaldos", 
            "Maiores Saldos", 
            ["Produto", "Saldo Total"], 
            dadosProcessados.maioresSaldos
        );

        gerarTabelaRecomendacao(
            "tabelaRecomendacaoCompra", 
            dadosProcessados.recomendacaoCompra
        );

        console.log("Relatórios gerados com sucesso.");

    } catch (erro) {
        console.error("Erro fatal na aplicação:", erro);
    }
}

// Inicia o fluxo
iniciarAplicacao();