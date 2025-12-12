import { buscarTitulos } from './apiV01.js';
import { extrairDadosDosTitulos, extrairLancamentosSimples } from './processingV01.js';

window.TesteRelatorio = async function(contas, anos) {
    try {
        // 1. Aguarda a resposta da API
        const responseGeral = await buscarTitulos({ contas: contas, anos: anos });

        // 2. Passa para o processamento
        processarRespostaTitulos(responseGeral.apiResponse || responseGeral, contas, anos);

    } catch (error) {
        console.error("Erro ao executar TesteRelatorio:", error);
    }
}

function processarRespostaTitulos(apiResponse, contas, anos) {
    const contaId = contas[0];
    const anoOuTag = anos[0];
    const reqContext = { contaId, anoOuTag }; // Contexto criado aqui!
    
    //Mescla o contexto com a resposta
    const response = { ...apiResponse, reqContext };
    
    const saldoInicialApi = response && response.saldoInicial ? Number(response.saldoInicial) : 0;

    processarModoRealizado(contaId, anoOuTag, response, saldoInicialApi);
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
        } catch (e) { console.error(`Erro JSON CapitalG conta ${contaId}`, e); }
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
}