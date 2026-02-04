import { buscarTitulos } from './apiV03.js';
import { extrairDadosDosTitulos, extrairLancamentosSimples } from './processingV05.js';

/**
 * Realiza a busca por ano, processa imediatamente e dispara a geração do Excel.
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

        // Lista acumuladora de objetos já processados (não mais strings JSON)
        let todosLancamentos = [];
        let saldoInicial = 0;
        let isPrimeiroAno = true;

        // 1. Loop de Requisições e Processamento (Ano a Ano)
        for (let ano = anoInicial; ano <= anoFinal; ano++) {
            const apiRaw = await buscarTitulos({ conta: contaId, ano: String(ano) });
            const response = apiRaw.response || apiRaw; // Normaliza resposta do Bubble

            // Captura saldo inicial apenas do primeiro ano do range
            if (isPrimeiroAno) {
                saldoInicial = Number(response.saldoInicial) || 0;
                isPrimeiroAno = false;
            }

            // --- PROCESSAMENTO IMEDIATO (Corrigido) ---
            // Passamos o 'ano' do loop atual como referência para a extração
            
            // A. Processar Títulos (CapitalG) deste ano
            if (response.dadosCapitalG?.length > 2) {
                const jsonTitulos = safeJsonParse(response.dadosCapitalG, `CapitalG ${ano}`);
                if (jsonTitulos) {
                    try {
                        const extracao = extrairDadosDosTitulos(jsonTitulos, contaId, ano);
                        todosLancamentos.push(...extracao.lancamentosProcessados);
                    } catch (e) { console.error(`Erro processando Títulos de ${ano}:`, e); }
                }
            }

            // B. Processar Lançamentos Manuais deste ano
            if (response.dadosLancamentos?.length > 2) {
                const jsonManuais = safeJsonParse(response.dadosLancamentos, `LancamentosManuais ${ano}`);
                if (jsonManuais) {
                    try {
                        const manuais = extrairLancamentosSimples(jsonManuais, contaId, ano);
                        todosLancamentos.push(...manuais);
                    } catch (e) { console.error(`Erro processando Manuais de ${ano}:`, e); }
                }
            }
        }

        // 2. Exportação
        // Agora passamos a lista já pronta e o saldo
        exportarRelatorioFinal(todosLancamentos, contaId, dtInicio, dtFim);

    } catch (error) {
        console.error("Erro fatal ao gerar relatório:", error);
    }
};

/**
 * Aplica filtros de data na lista já processada e gera o arquivo Excel.
 */
function exportarRelatorioFinal(listaBruta, contaId, dtInicio, dtFim) {
    
    // 1. Filtragem (Intervalo de Datas Exato)
    const lancamentosFiltrados = listaBruta.filter(item => {
        const dtItem = converterParaData(item.DataLancamento);
        // Garante que a data é válida e está dentro do range
        return dtItem && dtItem >= dtInicio && dtItem <= dtFim;
    });

    // 2. Ordenação Cronológica
    lancamentosFiltrados.sort((a, b) => 
        converterParaData(a.DataLancamento) - converterParaData(b.DataLancamento)
    );

    // 3. Mapeamento para Excel
    const linhasExcel = lancamentosFiltrados.map(l => ({
        Data: l.DataLancamento,
        Descrição: l.Cliente
        ? `${l.Cliente}${l.obs ? ' - ' + l.obs : ''}`
        : (l.obs || ''),
        Débito: l.Natureza === 'R' ? formatarMoeda(l.ValorLancamento) : '-',
        Crédito: l.Natureza === 'P' ? formatarMoeda(-l.ValorLancamento) : '-'
    }));

    exportarParaXLSX(linhasExcel, contaId, dtFim);
}

//----------------------------------------------------------------------------------------------------//
//                                         FUNÇÕES AUXILIARES
//----------------------------------------------------------------------------------------------------//

/** Tenta fazer o parse de uma string JSON. Retorna null em caso de erro. */
function safeJsonParse(jsonString, contexto) {
    try {
        // Verifica se já não é um objeto (algumas APIs retornam JSON parsed)
        if (typeof jsonString === 'object') return jsonString;
        
        // Se a string não começar com [ ou {, tentamos envolver em array
        // (Assumindo comportamento anterior de concatenação, mas agora é por ano,
        // então verificamos se precisa dos colchetes)
        const strAnalise = jsonString.trim();
        if (strAnalise.startsWith('{')) return JSON.parse(`[${jsonString}]`);
        if (strAnalise.startsWith('[')) return JSON.parse(jsonString);
        
        // Fallback para strings soltas separadas por vírgula
        return JSON.parse(`[${jsonString}]`);
    } catch (e) {
        console.error(`Erro ao fazer parse do JSON (${contexto}):`, e);
        return null;
    }
}

/** Converte string "DD/MM/YYYY" para objeto Date */
function converterParaData(dataStr) {
    if (!dataStr) return null;
    // Suporte a DD/MM/YYYY
    if (dataStr.includes('/')) {
        const [dia, mes, ano] = dataStr.split('/').map(Number);
        return new Date(ano, mes - 1, dia);
    }
    return null;
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