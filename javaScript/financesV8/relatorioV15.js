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

    // 4. Filtros adicionais (Data Inicial e Final)
    const dataInicial = new Date(document.getElementById('inputDataInicial').value);
    const dataFinal   = new Date(document.getElementById('inputDataFinal').value);
    console.log('dataInicial:', dataInicial);
    console.log('dataFinal:', dataFinal);

    let lancamentosFiltrados = [];
    
    lancamentosFiltrados = lancamentos.filter(l => {
        const dataLancamento = parseDataBR(l.DataLancamento);
        if (!dataLancamento) return false;

        if (dataInicial && dataLancamento < dataInicial) return false;
        if (dataFinal && dataLancamento > dataFinal) return false;

        return true;
    });

    console.log('lancamentos final', lancamentosFiltrados);

    // 5. Gerar Excel
    const linhasExcel = lancamentosFiltrados.map(l => ({
        Data: l.DataLancamento,
        Descrição: l.Cliente || '',
        Débito: l.Natureza === 'R' ? l.ValorLancamento : '',
        Crédito: l.Natureza === 'P' ? -l.ValorLancamento : ''
    }));

    // Cria a planilha
    const worksheet = XLSX.utils.json_to_sheet(linhasExcel);

    // Cria o workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Lançamentos');

    // Ajuste simples de largura das colunas
    worksheet['!cols'] = [
        { wch: 12 }, // Data
        { wch: 35 }, // Descrição
        { wch: 15 }, // Débito
        { wch: 15 }  // Crédito
    ];

    // Exporta o arquivo Excel
    XLSX.writeFile(workbook, `Relatorio_${contaId}_${anoOuTag}.xlsx`);

    return lancamentosFiltrados;
}

function parseDataBR(dataStr) {
    if (!dataStr) return null;

    const [dia, mes, ano] = dataStr.split('/').map(Number);
    return new Date(ano, mes - 1, dia); // mês começa em 0
}