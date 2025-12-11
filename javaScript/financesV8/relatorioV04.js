import { buscarTitulos } from './apiV01.js';
import { extrairDadosDosTitulos, extrairLancamentosSimples } from './processingV01.js';

window.TesteRelatorio = async function() {
    const contas = ["2084066950"] //LIsta de texto, CODContaC 1912668759 - AYL sicredi ;
    const anos = ["2023"]; //Lista de texto;
    
    // Prepara Promises de Títulos
    const promises = buscarTitulos({ contas: contas, anos: anos }).then(resultado => ({ ...resultado, reqContext: req, tipo: 'TITULOS' })) 
    const response = await Promise.all(promises);
    processarRespostaTitulos(response.apiResponse);
}

function processarRespostaTitulos(apiResponse) {
    const { reqContext, response } = apiResponse;
    const { contaId, anoOuTag } = reqContext;
    const saldoInicialApi = response && response.saldoInicial ? Number(response.saldoInicial) : 0;
    const anoAtual = new Date().getFullYear();

    processarModoRealizado(contaId, anoOuTag, response, saldoInicialApi);
}

function processarModoRealizado(contaId, anoOuTag, response, saldoInicialApi) {

    let lancamentos = [];
    // Listas temporárias para merge
    let lancamentosDeTitulos = [];
    let lancamentosManuais = [];

    // 1. Processar Títulos (Fonte: dadosCapitalG)
    if (response.dadosCapitalG?.length > 2) {
        try {
            const extractedCG = extrairDadosDosTitulos(JSON.parse(`[${response.dadosCapitalG}]`), contaId, anoOuTag);
            lancamentosDeTitulos = extractedCG.lancamentosProcessados;           
        } catch (e) { console.error(`Erro JSON CapitalG conta ${contaId}`, e); }
    }

    // 2. Processar Lançamentos Manuais (Fonte: dadosLancamentos)
    // Também filtramos pelo ano para garantir consistência
    if (response.dadosLancamentos?.length > 2) {
        try {
            lancamentosManuais = extrairLancamentosSimples(JSON.parse(`[${response.dadosLancamentos}]`), contaId, anoOuTag);
            console.log('extracted lancamentos manuais', lancamentosManuais);
        } catch (e) { console.error(`Erro JSON LancamentosManuais conta ${contaId}`, e); }
    }

    // 3. Merge: DRE Realizado = Baixas de Títulos (deste ano) + Lançamentos Manuais (deste ano)
    lancamentos = [...lancamentosDeTitulos, ...lancamentosManuais];
    console.log('lancamentos final', lancamentos);
}