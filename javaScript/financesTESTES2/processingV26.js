// processing.js

/**
 * Extrai e formata os lançamentos de uma lista de títulos recebidos da API.
 * @param {Array} titulos - A lista de títulos da API.
 * @returns {Array} Uma lista de objetos de lançamento processados.
 */
function extrairLancamentosDosTitulos(titulos) {
    const lancamentosProcessados = [];

    // Garante que a entrada seja um array para evitar erros.
    if (!Array.isArray(titulos)) {
        console.error("A entrada para a função não é um array.", titulos);
        return lancamentosProcessados;
    }

    // Para cada titulo recebido da API
    titulos.forEach(titulo => {
        // Valida se o título possui Lançamentos e Categoria
        if (!titulo || !Array.isArray(titulo.Lancamentos) || !titulo.Categoria) {
            console.warn("O título está inválido ou com dados essenciais faltando e foi ignorado:", titulo);
            return; // Pula para o próximo título do loop.
        }

        // Itera sobre cada lançamento individual dentro do título.
        titulo.Lancamentos.forEach(lancamento => {
            if (!lancamento.DataLancamento || !lancamento.CODContaC || typeof lancamento.ValorLancamento === 'undefined') {
                console.warn("Lançamento individual inválido ou com dados faltando:", lancamento);
                return; // Pula para o próximo lançamento.
            }

            let departamentosObj = [];
            // Verifica se o array de departamentos do titulo não é vazio
            if (Array.isArray(titulo.Departamentos) && titulo.Departamentos.length > 0) {
                // Se não for vazio, cria um objeto departamento com valor = percentual do departamento * valor do lançamento
                departamentosObj = titulo.Departamentos.map(depto => {
                    const valorRateio = lancamento.ValorLancamento * ((depto.PercDepto ?? 100) / 100);
                    return { CodDpto: depto.CODDepto || 0, ValorDepto: valorRateio };
                });
            } else {
                // Se estiver vazio ou não existir, cria o departamento "Outros Departamentos" com o valor total do lançamento
                departamentosObj = [{ CodDpto: 0, ValorDepto: lancamento.ValorLancamento }];
            }

            // Monta o objeto de lançamento e adiciona ao array de lançamentos processados
            lancamentosProcessados.push({
                Natureza: titulo.Natureza,
                DataLancamento: lancamento.DataLancamento,
                CODContaC: lancamento.CODContaC,
                ValorLancamento: lancamento.ValorLancamento,
                CODCategoria: titulo.Categoria,
                Cliente: titulo.Cliente,
                Departamentos: departamentosObj
            });
        });
    });

    return lancamentosProcessados;
}

/**
 * Processa os lançamentos de uma conta para gerar as matrizes DRE e de Departamentos.
 * @param {object} dadosConta - O cache da aplicação com os lançamentos da conta.
 * @param {number} conta - O ID da conta a ser processada.
 * @returns {object} - Um objeto contendo { matrizDRE, matrizDepartamentos, chavesComDados }.
 */
function processarLancamentos(dadosConta, conta) {
    const matrizDRE = {}, matrizDepartamentos = {}, chavesComDados = new Set();
    const classesParaDetalhar = new Set(['(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL', '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios']);

    dadosConta.lancamentos.forEach(lancamento => {
        if (conta != Number(lancamento.CODContaC)) return;
        if (!lancamento || !lancamento.DataLancamento || !lancamento.CODContaC) return;

        const partesData = lancamento.DataLancamento.split('/');
        if (partesData.length !== 3) return;
        const [, mesRaw, ano] = partesData;
        const chaveAgregacao = `${mesRaw.padStart(2, '0')}-${ano}`;
        chavesComDados.add(chaveAgregacao);

        let valor = lancamento.Natureza === "P" ? -lancamento.ValorLancamento : lancamento.ValorLancamento;
        const codCategoria = lancamento.CODCategoria || 'SemCategoria';
        const classeInfo = dadosConta.classesMap.get(codCategoria);
        const classe = classeInfo ? classeInfo.classe : 'Outros';

        // Preenche a Matriz DRE
        if (!matrizDRE[classe]) matrizDRE[classe] = {};
        matrizDRE[classe][chaveAgregacao] = (matrizDRE[classe][chaveAgregacao] || 0) + valor;

        // Preenche a Matriz de Departamentos
        if (classesParaDetalhar.has(classe) && Array.isArray(lancamento.Departamentos) && lancamento.Departamentos.length > 0) {
            const fornecedor = lancamento.Cliente;
            lancamento.Departamentos.forEach(depto => {
                let valorRateio = lancamento.Natureza === "P" ? -depto.ValorDepto : depto.ValorDepto;
                const nomeDepto = dadosConta.departamentosMap.get(depto.CodDpto) || 'Outros Departamentos';
                const chaveDepto = `${nomeDepto}|${classe}`;

                if (!matrizDepartamentos[chaveDepto]) matrizDepartamentos[chaveDepto] = { nome: nomeDepto, classe, categorias: {} };
                const categoriaRef = matrizDepartamentos[chaveDepto].categorias;
                if (!categoriaRef[codCategoria]) categoriaRef[codCategoria] = { valores: {}, fornecedores: {} };
                const catData = categoriaRef[codCategoria];

                catData.valores[chaveAgregacao] = (catData.valores[chaveAgregacao] || 0) + valorRateio;

                if (!catData.fornecedores[fornecedor]) catData.fornecedores[fornecedor] = { fornecedor, valores: {}, total: 0 };
                catData.fornecedores[fornecedor].valores[chaveAgregacao] = (catData.fornecedores[fornecedor].valores[chaveAgregacao] || 0) + valorRateio;
                catData.fornecedores[fornecedor].total += valorRateio;
            });
        }
    });

    Object.values(matrizDepartamentos).forEach(dep => {
        Object.values(dep.categorias).forEach(cat => {
            cat.fornecedores = Object.values(cat.fornecedores).sort((a, b) => b.total - a.total);
        });
    });

    return { matrizDRE, matrizDepartamentos, chavesComDados };
}


function _mergeDadosMensais(listaDeDadosProcessados) {
    const monthlyMerged = { matrizDRE: {}, matrizDepartamentos: {} };
    const todasChaves = new Set();
    let saldoBaseTotal = 0;

    listaDeDadosProcessados.forEach(dados => {
        saldoBaseTotal += dados.saldoIni || 0;
        dados.chavesComDados.forEach(chave => todasChaves.add(chave));
        for (const classe in dados.matrizDRE) {
            if (!monthlyMerged.matrizDRE[classe]) monthlyMerged.matrizDRE[classe] = {};
            for (const periodo in dados.matrizDRE[classe]) {
                monthlyMerged.matrizDRE[classe][periodo] = (monthlyMerged.matrizDRE[classe][periodo] || 0) + dados.matrizDRE[classe][periodo];
            }
        }
        
        // --- LÓGICA RESTAURADA ---
        for (const chaveDepto in dados.matrizDepartamentos) {
            if (!monthlyMerged.matrizDepartamentos[chaveDepto]) {
                monthlyMerged.matrizDepartamentos[chaveDepto] = JSON.parse(JSON.stringify(dados.matrizDepartamentos[chaveDepto]));
            } else {
                const mergedDepto = monthlyMerged.matrizDepartamentos[chaveDepto];
                const deptoData = dados.matrizDepartamentos[chaveDepto];
                for (const codCat in deptoData.categorias) {
                    if (!mergedDepto.categorias[codCat]) {
                        mergedDepto.categorias[codCat] = JSON.parse(JSON.stringify(deptoData.categorias[codCat]));
                    } else {
                        const mergedCat = mergedDepto.categorias[codCat];
                        const catData = deptoData.categorias[codCat];
                        for (const periodo in catData.valores) {
                            mergedCat.valores[periodo] = (mergedCat.valores[periodo] || 0) + catData.valores[periodo];
                        }
                        for (const fornKey in catData.fornecedores) {
                            const forn = catData.fornecedores[fornKey].fornecedor;
                            if (!mergedCat.fornecedores[forn]) {
                                mergedCat.fornecedores[forn] = JSON.parse(JSON.stringify(catData.fornecedores[fornKey]));
                            } else {
                                mergedCat.fornecedores[forn].total += catData.fornecedores[fornKey].total;
                                for (const periodo in catData.fornecedores[fornKey].valores) {
                                    mergedCat.fornecedores[forn].valores[periodo] = (mergedCat.fornecedores[forn].valores[periodo] || 0) + catData.fornecedores[fornKey].valores[periodo];
                                }
                            }
                        }
                    }
                }
            }
        }
    });
    return { monthlyMerged, saldoBaseTotal, todasChaves };
}
function _calcularSaldoInicialParaPeriodo(monthlyDRE, todasChaves, primeiraColunaVisivel, saldoBaseTotal, calcularTotaisDREFunc) {
    const colunasHistoricasOrdenadas = Array.from(todasChaves).sort((a, b) => {
        const [mesA, anoA] = a.split('-'); const [mesB, anoB] = b.split('-');
        return new Date(anoA, mesA - 1) - new Date(anoB, mesB - 1);
    });
    const tempDRE = JSON.parse(JSON.stringify(monthlyDRE));
    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'].forEach(classe => {
        if (!tempDRE[classe]) tempDRE[classe] = {};
    });
    calcularTotaisDREFunc(tempDRE, colunasHistoricasOrdenadas, 0);
    let saldoAcumuladoAntesDoPeriodo = 0;
    for (const periodo of colunasHistoricasOrdenadas) {
        if (periodo === primeiraColunaVisivel) break;
        saldoAcumuladoAntesDoPeriodo += tempDRE['(=) Movimentação de Caixa Mensal']?.[periodo] || 0;
    }
    return saldoBaseTotal + saldoAcumuladoAntesDoPeriodo;
}
function _agregarDadosParaAnual(monthlyData) {
    const annualData = { matrizDRE: {}, matrizDepartamentos: {} };
    for (const classe in monthlyData.matrizDRE) {
        annualData.matrizDRE[classe] = {};
        for (const periodoMensal in monthlyData.matrizDRE[classe]) {
            const ano = periodoMensal.split('-')[1];
            annualData.matrizDRE[classe][ano] = (annualData.matrizDRE[classe][ano] || 0) + monthlyData.matrizDRE[classe][periodoMensal];
        }
    }
    // --- LÓGICA RESTAURADA ---
    for (const chaveDepto in monthlyData.matrizDepartamentos) {
        const deptoData = monthlyData.matrizDepartamentos[chaveDepto];
        annualData.matrizDepartamentos[chaveDepto] = JSON.parse(JSON.stringify(deptoData));
        const annualDepto = annualData.matrizDepartamentos[chaveDepto];
        for (const codCat in annualDepto.categorias) {
            const catData = annualDepto.categorias[codCat];
            const valoresAnuais = {};
            for (const periodoMensal in catData.valores) {
                const ano = periodoMensal.split('-')[1];
                valoresAnuais[ano] = (valoresAnuais[ano] || 0) + catData.valores[periodoMensal];
            }
            catData.valores = valoresAnuais;
            for (const fornKey in catData.fornecedores) {
                const valoresAnuaisForn = {};
                for (const periodoMensal in catData.fornecedores[fornKey].valores) {
                    const ano = periodoMensal.split('-')[1];
                    valoresAnuaisForn[ano] = (valoresAnuaisForn[ano] || 0) + catData.fornecedores[fornKey].valores[periodoMensal];
                }
                catData.fornecedores[fornKey].valores = valoresAnuaisForn;
            }
        }
    }
    return annualData;
}
/**
 * Função interna para calcular os valores das classes totalizadoras da matriz de DRE.
 * usada tanto no cálculo do saldo anterior quanto no final.
 */
function _calcularTotaisDRE(matrizDRE, colunas, saldoInicial) {
    let saldoAcumulado = saldoInicial;
    colunas.forEach(coluna => {
        const getValor = (classe) => matrizDRE[classe]?.[coluna] || 0;
        const receitaLiquida = getValor('(+) Receita Bruta') + getValor('(-) Deduções');
        if (!matrizDRE['(=) Receita Líquida']) matrizDRE['(=) Receita Líquida'] = {};
        matrizDRE['(=) Receita Líquida'][coluna] = receitaLiquida;
        const geracaoCaixa = receitaLiquida + getValor('(-) Custos') + getValor('(-) Despesas') + getValor('(+/-) IRPJ/CSLL');
        if (!matrizDRE['(+/-) Geração de Caixa Operacional']) matrizDRE['(+/-) Geração de Caixa Operacional'] = {};
        matrizDRE['(+/-) Geração de Caixa Operacional'][coluna] = geracaoCaixa;
        const movimentacaoNaoOperacional = getValor('(+/-) Resultado Financeiro') + getValor('(+/-) Aportes/Retiradas') + getValor('(+/-) Investimentos') + getValor('(+/-) Empréstimos/Consórcios');
        const movimentacaoMensal = geracaoCaixa + movimentacaoNaoOperacional;
        if (!matrizDRE['(=) Movimentação de Caixa Mensal']) matrizDRE['(=) Movimentação de Caixa Mensal'] = {};
        matrizDRE['(=) Movimentação de Caixa Mensal'][coluna] = movimentacaoMensal;
        if (!matrizDRE['Caixa Inicial']) matrizDRE['Caixa Inicial'] = {};
        matrizDRE['Caixa Inicial'][coluna] = saldoAcumulado;
        const variacaoCaixaTotal = movimentacaoMensal + getValor('Entrada de Transferência') + getValor('Saída de Transferência') + getValor('Outros');
        saldoAcumulado += variacaoCaixaTotal;
        if (!matrizDRE['Caixa Final']) matrizDRE['Caixa Final'] = {};
        matrizDRE['Caixa Final'][coluna] = saldoAcumulado;
    });
}
// --- FUNÇÃO PRINCIPAL REESCRITA (ORQUESTRADORA) ---
function mergeMatrizes(listaDeDadosProcessados, modo, colunasVisiveis) {
    if (!listaDeDadosProcessados || listaDeDadosProcessados.length === 0) {
        return { matrizDRE: {}, matrizDepartamentos: {}, saldoInicialPeriodo: 0 };
    }

    const { monthlyMerged, saldoBaseTotal, todasChaves } = _mergeDadosMensais(listaDeDadosProcessados);
    const saldoInicialPeriodo = _calcularSaldoInicialParaPeriodo(monthlyMerged.matrizDRE, todasChaves, colunasVisiveis[0], saldoBaseTotal, _calcularTotaisDRE);
    const dataBeforeTotals = (modo.toLowerCase() === 'anual') ? _agregarDadosParaAnual(monthlyMerged) : monthlyMerged;

    // Calcula a coluna TOTAL para ambas as matrizes
    Object.values(dataBeforeTotals.matrizDRE).forEach(periodos => {
        periodos.TOTAL = colunasVisiveis.reduce((acc, coluna) => acc + (periodos[coluna] || 0), 0);
    });

    Object.values(dataBeforeTotals.matrizDepartamentos).forEach(depto => {
        Object.values(depto.categorias).forEach(cat => {
            cat.TOTAL = colunasVisiveis.reduce((acc, col) => acc + (cat.valores[col] || 0), 0);
            Object.values(cat.fornecedores).forEach(forn => {
                forn.TOTAL = colunasVisiveis.reduce((acc, col) => acc + (forn.valores[col] || 0), 0);
            });
        });
    });

    // Finaliza a Matriz DRE
    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'].forEach(classe => {
        if (!dataBeforeTotals.matrizDRE[classe]) dataBeforeTotals.matrizDRE[classe] = {};
    });
    _calcularTotaisDRE(dataBeforeTotals.matrizDRE, colunasVisiveis, saldoInicialPeriodo);

    if (dataBeforeTotals.matrizDRE['Caixa Inicial']) {
        dataBeforeTotals.matrizDRE['Caixa Inicial'].TOTAL = dataBeforeTotals.matrizDRE['Caixa Inicial'][colunasVisiveis[0]] || 0;
    }
    if (dataBeforeTotals.matrizDRE['Caixa Final']) {
        dataBeforeTotals.matrizDRE['Caixa Final'].TOTAL = dataBeforeTotals.matrizDRE['Caixa Final'][colunasVisiveis[colunasVisiveis.length - 1]] || 0;
    }

    return { ...dataBeforeTotals, saldoInicialPeriodo };
}



// Exporta apenas as funções que precisam ser usadas por outros módulos.
// As funções com _ são internas e não precisam ser exportadas.
export { processarLancamentos, extrairLancamentosDosTitulos, mergeMatrizes };