import { buscarTitulos } from './apiV01.js';
import { extrairDadosDosTitulos, extrairLancamentosSimples } from './processingV01.js';

window.TesteRelatorio = async function(contas, anos) {
    try {
        
        // 1. Aguarda a resposta da API
        const apiResponse = await buscarTitulos({ contas: contas, anos: anos });

        // 2. Passa para o processamento
        processarRespostaTitulos(apiResponse, contas, anos);

    } catch (error) {
        console.error("Erro ao executar TesteRelatorio:", error);
    }
}

function processarRespostaTitulos(apiResponse, contas, anos) {
    const contaId = contas[0];
    const anoOuTag = anos[0];
    
    // A API do Bubble retorna os dados dentro de uma chave "response".
    // Precisamos extrair isso para que a função 'processarModoRealizado' encontre as chaves 'dadosCapitalG', etc.
    const dadosReais = apiResponse.response ? apiResponse.response : apiResponse;

    const saldoInicialApi = dadosReais && dadosReais.saldoInicial ? Number(dadosReais.saldoInicial) : 0;

    processarModoRealizado(contaId, anoOuTag, dadosReais, saldoInicialApi);
}

function processarModoRealizado(contaId, anoOuTag, response, saldoInicialApi) {
    let lancamentos = [];
    let lancamentosDeTitulos = [];
    let lancamentosManuais = [];
    
    // 1. Processar Títulos
    if (response.dadosCapitalG?.length > 2) {
        try {
            const extractedCG = extrairDadosDosTitulos(JSON.parse(`[${response.dadosCapitalG}]`), contaId, anoOuTag);
            lancamentosDeTitulos = extractedCG.lancamentosProcessados;           
            console.log(`Sucesso extraindo Títulos: ${lancamentosDeTitulos.length} itens encontrados.`);
        } catch (e) { console.error(`Erro JSON CapitalG conta ${contaId}`, e); }
    } else {
        console.log("dadosCapitalG vazio ou muito curto.");
    }

    // 2. Processar Lançamentos Manuais
    if (response.dadosLancamentos?.length > 2) {
        try {
            lancamentosManuais = extrairLancamentosSimples(JSON.parse(`[${response.dadosLancamentos}]`), contaId, anoOuTag);
            console.log('extracted lancamentos manuais', lancamentosManuais);
        } catch (e) { console.error(`Erro JSON LancamentosManuais conta ${contaId}`, e); }
    }

    // 3. Merge
    lancamentos = [...lancamentosDeTitulos, ...lancamentosManuais];
    console.log('lancamentos final', lancamentos);
    
    return lancamentos;
}