import { buscarTitulos } from './apiV01.js';
import { extrairDadosDosTitulos, extrairLancamentosSimples } from './processingV01.js';


/**
 * Realiza a busca por ano e dispara a geração do Excel.
 */
window.GerarRelatorioMovimento = async function(contaId, dataInicialStr, dataFinalStr) {
    try {
        const dtInicio = converterParaData(dataInicialStr);
        const dtFim = converterParaData(dataFinalStr);

        if (!dtInicio || !dtFim) {
            console.error("Datas inválidas fornecidas para o relatório.");
            return;
        }

        const anoInicial = dtInicio.getFullYear();
        const anoFinal = dtFim.getFullYear();

        // Variáveis para agregação dos dados de múltiplos anos
        let bufferCapitalG = [];
        let bufferLancamentos = [];
        let saldoInicial = 0;
        let isPrimeiroAno = true;

        // 1. Loop de Requisições (Ano a Ano)
        for (let ano = anoInicial; ano <= anoFinal; ano++) {
            const apiRaw = await buscarTitulos({ conta: contaId, ano: ano });
            const response = apiRaw.response || apiRaw; // Normaliza resposta do Bubble

            // Captura saldo inicial apenas do primeiro ano do range
            if (isPrimeiroAno) {
                saldoInicial = Number(response.saldoInicial) || 0;
                isPrimeiroAno = false;
            }

            // Acumula strings JSON se existirem
            if (response.dadosCapitalG?.length > 2) {
                bufferCapitalG.push(response.dadosCapitalG);
            }
            if (response.dadosLancamentos?.length > 2) {
                bufferLancamentos.push(response.dadosLancamentos);
            }
        }

        // 2. Montagem do Objeto Unificado
        // Junta as strings com vírgula para formar um JSON array válido posteriormente
        const dadosUnificados = {
            rawCapitalG: bufferCapitalG.join(','),
            rawLancamentos: bufferLancamentos.join(','),
            saldoInicial: saldoInicial
        };

        // 3. Processamento e Exportação
        processarEExportarExcel(dadosUnificados, contaId, dtInicio, dtFim);

    } catch (error) {
        console.error("Erro fatal ao gerar relatório:", error);
    }
};

/**
 * Processa os dados brutos unificados, aplica filtros de data e gera o arquivo Excel.
 */
function processarEExportarExcel(dados, contaId, dtInicio, dtFim) {
    let listaFinal = [];

    // Referência de ano para as funções de extração (usa o ano inicial do filtro)
    const anoRef = dtInicio.getFullYear(); 

    // 1. Processar Títulos (CapitalG)
    if (dados.rawCapitalG) {
        const jsonTitulos = safeJsonParse(dados.rawCapitalG, `CapitalG`);
        if (jsonTitulos) {
            try {
                const extracao = extrairDadosDosTitulos(jsonTitulos, contaId, anoRef);
                listaFinal.push(...extracao.lancamentosProcessados);
            } catch (e) { console.error("Erro no processamento interno de Títulos:", e); }
        }
    }

    // 2. Processar Lançamentos Manuais
    if (dados.rawLancamentos) {
        const jsonManuais = safeJsonParse(dados.rawLancamentos, `LancamentosManuais`);
        if (jsonManuais) {
            try {
                const manuais = extrairLancamentosSimples(jsonManuais, contaId, anoRef);
                listaFinal.push(...manuais);
            } catch (e) { console.error("Erro no processamento interno de Manuais:", e); }
        }
    }

    // 3. Filtragem (Intervalo de Datas Exato)
    const lancamentosFiltrados = listaFinal.filter(item => {
        const dtItem = converterParaData(item.DataLancamento);
        return dtItem && dtItem >= dtInicio && dtItem <= dtFim;
    });

    // 4. Ordenação Cronológica
    lancamentosFiltrados.sort((a, b) => 
        converterParaData(a.DataLancamento) - converterParaData(b.DataLancamento)
    );

    // 5. Mapeamento para Excel
    const linhasExcel = lancamentosFiltrados.map(l => ({
        Data: l.DataLancamento,
        Descrição: l.Cliente || '',
        Débito: l.Natureza === 'R' ? formatarMoeda(l.ValorLancamento) : '-',
        Crédito: l.Natureza === 'P' ? formatarMoeda(-l.ValorLancamento) : '-'
    }));

    exportarParaXLSX(linhasExcel, contaId, dtFim);
}

//----------------------------------------------------------------------------------------------------//
//                                         FUNÇÕES AUXILIARES
//----------------------------------------------------------------------------------------------------//

/** Tenta fazer o parse de uma string JSON concatenada. Retorna null em caso de erro. */
function safeJsonParse(jsonString, contexto) {
    try {
        // Envolve em colchetes pois a string original vem sem eles ou concatenada
        return JSON.parse(`[${jsonString}]`);
    } catch (e) {
        console.error(`Erro ao fazer parse do JSON (${contexto}):`, e);
        return null;
    }
}

/** Converte string "DD/MM/YYYY" para objeto Date */
function converterParaData(dataStr) {
    if (!dataStr) return null;
    const [dia, mes, ano] = dataStr.split('/').map(Number);
    return new Date(ano, mes - 1, dia);
}

/** Formatação contábil (ex: 1.000,00 ou (1.000,00) para negativos) */
function formatarMoeda(valor) {
    if (!valor) return '-';
    
    const formatado = Math.abs(valor).toLocaleString('pt-BR', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });
    return valor < 0 ? `(${formatado})` : formatado;
}

/** Configura e dispara o download do arquivo XLSX */
function exportarParaXLSX(dados, conta, dataFim) {
    const worksheet = XLSX.utils.json_to_sheet(dados);
    
    // Configura largura das colunas
    worksheet['!cols'] = [{ wch: 15 }, { wch: 50 }, { wch: 15 }, { wch: 15 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Lançamentos');

    const dataArquivo = dataFim.toLocaleDateString('pt-BR').replace(/\//g, "-");
    const nomeArquivo = `relatorio_movimento_${conta}_ate_${dataArquivo}.xlsx`;

    XLSX.writeFile(workbook, nomeArquivo);
    console.log(`Download iniciado: ${nomeArquivo} (${dados.length} linhas)`);
}