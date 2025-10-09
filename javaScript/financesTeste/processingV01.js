// processing.js - Módulo de Processamento de Dados

/**
 * Itera sobre os títulos da API, processa pagamentos parciais e os separa em três listas:
 * - lancamentosProcessados: Pagamentos já realizados.
 * - titulosEmAberto: Valores restantes de títulos não quitados.
 * - capitalDeGiro: Todos os movimentos para a análise de Capital de Giro.
 * @param {Array} titulos - Array de títulos vindo da API.
 * @returns {object} Objeto contendo as três listas processadas.
 */
function extrairDadosDosTitulos(titulos) {
    const lancamentosProcessados = [];
    const titulosEmAberto = [];
    const capitalDeGiro = [];

    if (!Array.isArray(titulos)) {
        console.error("A entrada para a função 'extrairDadosDosTitulos' não é um array.", titulos);
        return { lancamentosProcessados, titulosEmAberto, capitalDeGiro };
    }
    
    titulos.forEach(titulo => {
        if (!titulo || !titulo.Categoria) {
            console.warn("Título inválido ou sem categoria foi ignorado:", titulo);
            return;
        }

        let valorPago = 0;
        // 1. Processa cada lançamento (pagamento) dentro do título.
        if (Array.isArray(titulo.Lancamentos)) {
            titulo.Lancamentos.forEach(lancamento => {
                if (!lancamento.DataLancamento || !lancamento.CODContaC || typeof lancamento.ValorLancamento === 'undefined') {
                    console.warn("Lançamento individual inválido ou com dados faltando:", lancamento);
                    return;
                }           

                const departamentosObj = gerarDepartamentosObj(titulo.Departamentos, lancamento.ValorLancamento);
                
                lancamentosProcessados.push({
                    Natureza: titulo.Natureza,
                    DataLancamento: lancamento.DataLancamento,
                    CODContaC: lancamento.CODContaC,
                    ValorLancamento: lancamento.ValorLancamento,
                    CODCategoria: titulo.Categoria,
                    Cliente: titulo.Cliente,
                    Departamentos: departamentosObj
                });
                
                // Adiciona o lançamento à lista de capital de giro
                capitalDeGiro.push({
                    Natureza: titulo.Natureza,
                    DataPagamento: lancamento.DataLancamento || null,
                    DataVencimento: titulo.DataVencimento || null,
                    DataEmissao: titulo.DataEmissao || null,
                    ValorTitulo: lancamento.ValorLancamento || 0,
                    CODContaEmissao: titulo.CODContaC || null,
                    CODContaPagamento: lancamento.CODContaC || null
                });

                valorPago += lancamento.ValorBaixado;
            });
        }

        // 2. Se o título não foi totalmente quitado, gera um "título em aberto" com o valor restante.
        const valorFaltante = titulo.ValorTitulo - valorPago;
        if (valorFaltante >= 0.01 && titulo.ValorTitulo !== 0) {
            const departamentosObj = gerarDepartamentosObj(titulo.Departamentos, valorFaltante);
            
            titulosEmAberto.push({
                Natureza: titulo.Natureza,
                DataLancamento: titulo.DataVencimento, // Data para projeção futura é o vencimento
                CODContaC: titulo.CODContaC,
                ValorLancamento: valorFaltante,
                CODCategoria: titulo.Categoria,
                Cliente: titulo.Cliente || "Cliente",
                Departamentos: departamentosObj
            });
            
            // Adiciona o valor em aberto à lista de capital de giro como uma previsão
            capitalDeGiro.push({
                Natureza: titulo.Natureza,
                DataPagamento: null, // Ainda não foi pago
                DataVencimento: titulo.DataVencimento || null,
                DataEmissao: titulo.DataEmissao || null,
                ValorTitulo: valorFaltante,
                CODContaEmissao: titulo.CODContaC || null,
                CODContaPagamento: null
            });
        }
    });
    return { lancamentosProcessados, titulosEmAberto, capitalDeGiro };
}

/**
 * Gera o objeto de departamentos com valores rateados.
 * Se não houver departamentos, atribui 100% ao departamento 'Outros' (código 0).
 * @param {Array} departamentos - O array de departamentos do título.
 * @param {number} valorLancamento - O valor base para o rateio.
 * @returns {Array} Array de objetos de departamento com valores calculados.
 */
function gerarDepartamentosObj(departamentos, valorLancamento) {
    if (Array.isArray(departamentos) && departamentos.length > 0) {
        return departamentos.map(depto => {
            const percentual = depto.PercDepto ?? 100;
            const valorRateio = valorLancamento * (percentual / 100);
            return { CodDpto: depto.CODDepto || 0, ValorDepto: valorRateio };
        });
    }
    // Caso padrão: atribui ao departamento "Outros"
    return [{ CodDpto: 0, ValorDepto: valorLancamento }];
}

/**
 * Converte uma string de data (DD/MM/AAAA) para um objeto Date.
 * @param {string} dateString - A data em formato de string.
 * @returns {Date|null} O objeto Date ou null se a string for inválida.
 */
function parseDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;
    // new Date(ano, mês - 1, dia)
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

/**
 * Processa uma lista de lançamentos (realizados ou a realizar) e os agrupa
 * em matrizes para o DRE e para o detalhamento por Departamentos.
 * @param {object} dadosBase - Cache da aplicação (classesMap, departamentosMap).
 * @param {Array} lancamentos - Array de lançamentos ou títulos a processar.
 * @param {number} contaId - ID da conta corrente sendo processada.
 * @returns {object} As matrizes DRE, Departamentos, chaves com dados e o valor total.
 */
function processarRealizadoRealizar(dadosBase, lancamentos, contaId) {
    const matrizDRE = {}, matrizDepartamentos = {}, chavesComDados = new Set();
    // Classes que terão seus dados detalhados por departamento/categoria/fornecedor.
    const classesParaDetalhar = new Set([
        '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL',
        '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos', 
        '(+/-) Empréstimos/Consórcios'
    ]);
    
    let valorTotal = 0; 
    lancamentos.forEach(lancamento => {
        if (contaId !== Number(lancamento.CODContaC) || !lancamento || !lancamento.DataLancamento) return;
        
        const partesData = lancamento.DataLancamento.split('/');
        if (partesData.length !== 3) return; 
        const [dia, mes, ano] = partesData;
        const chaveAgregacao = `${mes.padStart(2, '0')}-${ano}`;
        chavesComDados.add(chaveAgregacao);
    
        let valor = lancamento.Natureza === "P" ? -lancamento.ValorLancamento : lancamento.ValorLancamento;
        valorTotal += valor;

        const codCategoria = lancamento.CODCategoria || 'SemCategoria';
        const classeInfo = dadosBase.classesMap.get(codCategoria);
        const classe = classeInfo ? classeInfo.classe : 'Outros';

        // Agrega valor na matriz DRE
        if (!matrizDRE[classe]) matrizDRE[classe] = {};
        matrizDRE[classe][chaveAgregacao] = (matrizDRE[classe][chaveAgregacao] || 0) + valor;

        // Se a classe for detalhável, agrega na matriz de Departamentos
        if (classesParaDetalhar.has(classe) && Array.isArray(lancamento.Departamentos) && lancamento.Departamentos.length > 0) {
            lancamento.Departamentos.forEach(depto => {
                let valorRateio = lancamento.Natureza === "P" ? -depto.ValorDepto : depto.ValorDepto;
                
                const nomeDepto = dadosBase.departamentosMap.get(depto.CodDpto) || 'Outros Departamentos';
                const chaveDepto = `${nomeDepto}|${classe}`;
                
                // Estrutura: matriz[chaveDepto].categorias[codCategoria].fornecedores[nomeFornecedor]
                if (!matrizDepartamentos[chaveDepto]) {
                    matrizDepartamentos[chaveDepto] = { nome: nomeDepto, classe, categorias: {} };
                }
                const categoriaRef = matrizDepartamentos[chaveDepto].categorias;
                if (!categoriaRef[codCategoria]) {
                    categoriaRef[codCategoria] = { valores: {}, fornecedores: {} };
                }
                const catData = categoriaRef[codCategoria];
                catData.valores[chaveAgregacao] = (catData.valores[chaveAgregacao] || 0) + valorRateio;
                
                const fornecedor = lancamento.Cliente || "Não informado";
                if (!catData.fornecedores[fornecedor]) {
                    catData.fornecedores[fornecedor] = { fornecedor, valores: {}, total: 0 };
                }
                catData.fornecedores[fornecedor].valores[chaveAgregacao] = (catData.fornecedores[fornecedor].valores[chaveAgregacao] || 0) + valorRateio;
                catData.fornecedores[fornecedor].total += valorRateio;
            });
        }
    });

    return { matrizDRE, matrizDepartamentos, chavesComDados, valorTotal };
}

/**
 * Pré-processa os dados de capital de giro, organizando os itens em listas 
 * e calculando o fluxo de caixa mensal realizado.
 * @param {object} dadosBase - Cache da aplicação.
 * @param {Array} capitalDeGiro - Lista de todos os movimentos (pagos e a pagar/receber).
 * @param {number} contaId - ID da conta corrente sendo processada.
 * @returns {object} Dados pré-processados para a matriz de Capital de Giro.
 */
function processarCapitalDeGiro(dadosBase, capitalDeGiro, contaId) {
    const contaInfo = dadosBase.contasMap.get(String(contaId));
    const saldoInicial = contaInfo ? Number(contaInfo.saldoIni) : 0;

    const fluxoDeCaixaMensal = {};
    const contasAReceber = [];
    const contasAPagar = [];

    if (Array.isArray(capitalDeGiro)) {
        capitalDeGiro.forEach(item => {
            // 1. Calcula o fluxo de caixa REALIZADO (considera apenas itens com Data de Pagamento na conta atual)
            if (item.DataPagamento && String(item.CODContaPagamento) === String(contaId)) {
                const partesData = item.DataPagamento.split('/');
                if (partesData.length === 3) {
                    const chavePeriodo = `${partesData[1].padStart(2, '0')}-${partesData[2]}`;
                    let valor = item.Natureza === 'P' ? -item.ValorTitulo : item.ValorTitulo;
                    fluxoDeCaixaMensal[chavePeriodo] = (fluxoDeCaixaMensal[chavePeriodo] || 0) + valor;
                }
            }
            
            // 2. Monta as listas de contas a pagar/receber (previsões)
            // Um item entra na previsão se foi emitido pela conta atual e possui datas de controle.
            if (item.DataEmissao && item.DataVencimento && String(item.CODContaEmissao) === String(contaId)){
                const itemProcessado = {
                    ...item,
                    DataEmissao: parseDate(item.DataEmissao),
                    DataVencimento: parseDate(item.DataVencimento),
                    DataPagamento: parseDate(item.DataPagamento)
                };

                if (item.Natureza === 'R') {
                    contasAReceber.push(itemProcessado);
                } else if (item.Natureza === 'P') {
                    contasAPagar.push(itemProcessado);
                }
            }
        });
    }

    return { saldoInicial, fluxoDeCaixaMensal, contasAReceber, contasAPagar };
}

/**
 * Orquestra o processamento completo dos dados de uma única conta.
 * @param {object} appCache - O cache da aplicação com os mapas de apoio.
 * @param {object} dadosApi - Objeto com { lancamentos, titulos, capitalDeGiro }.
 * @param {number} contaId - O ID da conta sendo processada.
 * @returns {object} Um objeto com os dados processados para 'realizado', 'arealizar' e 'capitalDeGiro'.
 */
function processarDadosDaConta(appCache, dadosApi, contaId) {
    const { lancamentos, titulos, capitalDeGiro } = dadosApi;

    // Processa os dados para os modos 'realizado' e 'a realizar'
    const dadosRealizado = processarRealizadoRealizar(appCache, lancamentos, contaId);
    const dadosARealizar = processarRealizadoRealizar(appCache, titulos, contaId);

    // Processa os dados para o Capital de Giro
    const dadosCapitalDeGiro = processarCapitalDeGiro(appCache, capitalDeGiro, contaId);
    
    return {
        realizado: dadosRealizado,
        arealizar: dadosARealizar,
        capitalDeGiro: dadosCapitalDeGiro
    };
}

/**
 * Calcula as linhas de totais e saldos da Matriz DRE.
 * Esta função modifica (muta) o objeto matrizDRE diretamente.
 * @param {object} matrizDRE - A matriz DRE a ser calculada.
 * @param {Array<string>} colunasParaCalcular - As colunas (períodos) a serem processadas.
 * @param {number} saldoInicial - O saldo de caixa inicial para o primeiro período.
 */
function calcularLinhasDeTotalDRE(matrizDRE, colunasParaCalcular, saldoInicial) {
    let saldoAcumulado = saldoInicial;

    colunasParaCalcular.forEach(coluna => {
        const getValor = (classe) => matrizDRE[classe]?.[coluna] || 0;

        const receitaLiquida = getValor('(+) Receita Bruta') + getValor('(-) Deduções');
        matrizDRE['(=) Receita Líquida'][coluna] = receitaLiquida;

        const geracaoCaixa = receitaLiquida + getValor('(-) Custos') + getValor('(-) Despesas') + getValor('(+/-) IRPJ/CSLL');
        matrizDRE['(+/-) Geração de Caixa Operacional'][coluna] = geracaoCaixa;

        const movimentacaoNaoOperacional = getValor('(+/-) Resultado Financeiro') + getValor('(+/-) Aportes/Retiradas') + getValor('(+/-) Investimentos') + getValor('(+/-) Empréstimos/Consórcios');
        
        const movimentacaoMensal = geracaoCaixa + movimentacaoNaoOperacional;
        matrizDRE['(=) Movimentação de Caixa Mensal'][coluna] = movimentacaoMensal;

        matrizDRE['Caixa Inicial'][coluna] = saldoAcumulado;
        
        const variacaoCaixaTotal = movimentacaoMensal + getValor('Entrada de Transferência') + getValor('Saída de Transferência') + getValor('Outros');
        
        saldoAcumulado += variacaoCaixaTotal;

        matrizDRE['Caixa Final'][coluna] = saldoAcumulado;
    });
}

/**
 * Mescla os dados já processados de múltiplas contas em um único conjunto de dados.
 * @param {Array<object>} listaDeDadosProcessados - Array de objetos, cada um contendo os dados de uma conta.
 * @returns {object} Contendo os dados mensais mesclados, o saldo base total e o conjunto de todas as chaves de período.
 */
function mergeDadosMensais(listaDeDadosProcessados) {
    const monthlyMerged = { matrizDRE: {}, matrizDepartamentos: {} };
    const todasChaves = new Set(); 

    const saldoBaseTotal = listaDeDadosProcessados.reduce((acc, dados) => {
        dados.chavesComDados.forEach(chave => todasChaves.add(chave));

        // Mescla matriz DRE
        for (const classe in dados.matrizDRE) {
            if (!monthlyMerged.matrizDRE[classe]) monthlyMerged.matrizDRE[classe] = {};
            for (const periodo in dados.matrizDRE[classe]) {
                monthlyMerged.matrizDRE[classe][periodo] = (monthlyMerged.matrizDRE[classe][periodo] || 0) + dados.matrizDRE[classe][periodo];
            }
        }

        // Mescla matriz de Departamentos
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
                        for (const forn in catData.fornecedores) {
                            if (!mergedCat.fornecedores[forn]) {
                                mergedCat.fornecedores[forn] = JSON.parse(JSON.stringify(catData.fornecedores[forn]));
                            } else {
                                mergedCat.fornecedores[forn].total += catData.fornecedores[forn].total;
                                for (const periodo in catData.fornecedores[forn].valores) {
                                    mergedCat.fornecedores[forn].valores[periodo] = (mergedCat.fornecedores[forn].valores[periodo] || 0) + catData.fornecedores[forn].valores[periodo];
                                }
                            }
                        }
                    }
                }
            }
        }
        return acc + (dados.saldoIni || 0);
    }, 0);

    return { monthlyMerged, saldoBaseTotal, todasChaves };
}

/**
 * Calcula o saldo de caixa inicial para um período de visualização específico,
 * somando toda a movimentação de caixa dos períodos anteriores ao primeiro período visível.
 * @param {object} monthlyDRE - Objeto DRE com dados mensais.
 * @param {Set|Array} todasChaves - Todas as chaves de período (MM-AAAA) disponíveis.
 * @param {Array<string>} colunasVisiveis - As colunas/períodos selecionados para exibição.
 * @param {number} saldoBaseTotal - O saldo de caixa inicial absoluto de todas as contas.
 * @returns {number} O saldo de caixa inicial para o primeiro período visível.
 */
function calcularSaldoInicialPeriodo(monthlyDRE, todasChaves, colunasVisiveis, saldoBaseTotal) {
    const compararPeriodos = (a, b) => {
        const [mesA, anoA] = a.split('-');
        const [mesB, anoB] = b.split('-');
        return new Date(anoA, mesA - 1) - new Date(anoB, mesB - 1);
    };

    const colunasHistoricasOrdenadas = Array.from(todasChaves).sort(compararPeriodos);
    const colunasVisiveisOrdenadas = [...colunasVisiveis].sort(compararPeriodos);
    if (colunasVisiveisOrdenadas.length === 0) return saldoBaseTotal;

    const tempDRE = JSON.parse(JSON.stringify(monthlyDRE));
    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'].forEach(classe => {
        if (!tempDRE[classe]) tempDRE[classe] = {};
    });

    calcularLinhasDeTotalDRE(tempDRE, colunasHistoricasOrdenadas, 0);

    let saldoAcumuladoAntesDoPeriodo = 0;
    const primeiraColunaVisivel = colunasVisiveisOrdenadas[0];
    
    for (const periodo of colunasHistoricasOrdenadas) {
        if (compararPeriodos(periodo, primeiraColunaVisivel) >= 0) {
            break; // Para de somar quando chega no primeiro período visível
        }
        const variacaoDoPeriodo = (tempDRE['(=) Movimentação de Caixa Mensal']?.[periodo] || 0) +
                                  (tempDRE['Entrada de Transferência']?.[periodo] || 0) +
                                  (tempDRE['Saída de Transferência']?.[periodo] || 0) +
                                  (tempDRE['Outros']?.[periodo] || 0);
                            
        saldoAcumuladoAntesDoPeriodo += variacaoDoPeriodo;
    }
    
    return saldoBaseTotal + saldoAcumuladoAntesDoPeriodo;
}

/**
 * Agrega dados mensais consolidados em totais anuais.
 * @param {object} monthlyData - O objeto de dados mesclados com valores mensais.
 * @returns {object} Um novo objeto de dados com valores agregados por ano.
 */
function agregarDadosParaAnual(monthlyData) {
    const annualData = { matrizDRE: {}, matrizDepartamentos: {} };
    
    // Agrega DRE
    for (const classe in monthlyData.matrizDRE) {
        annualData.matrizDRE[classe] = {};
        for (const periodoMensal in monthlyData.matrizDRE[classe]) {
            const ano = periodoMensal.split('-')[1];
            annualData.matrizDRE[classe][ano] = (annualData.matrizDRE[classe][ano] || 0) + monthlyData.matrizDRE[classe][periodoMensal];
        }
    }
    // Agrega Departamentos
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
            for (const forn in catData.fornecedores) {
                const valoresAnuaisForn = {};
                for (const periodoMensal in catData.fornecedores[forn].valores) {
                    const ano = periodoMensal.split('-')[1];
                    valoresAnuaisForn[ano] = (valoresAnuaisForn[ano] || 0) + catData.fornecedores[forn].valores[periodoMensal];
                }
                catData.fornecedores[forn].valores = valoresAnuaisForn;
            }
        }
    }
    return annualData;
}

/**
 * Calcula a coluna 'TOTAL' para a matriz DRE somando os valores das colunas visíveis.
 * @param {object} matrizDRE - A matriz DRE (mensal ou anual).
 * @param {string[]} colunasVisiveis - As colunas que devem ser somadas no total.
 */
function calcularColunaTotalDRE(matrizDRE, colunasVisiveis) {
    for (const classe in matrizDRE) {
        matrizDRE[classe].TOTAL = colunasVisiveis.reduce((acc, coluna) => acc + (matrizDRE[classe][coluna] || 0), 0);
    }
}

/**
 * Função principal que orquestra a mesclagem e o processamento final dos dados.
 * @param {Array<object>} listaDeDadosProcessados - Array com os dados de cada conta selecionada.
 * @param {string} modo - O modo de visualização ('mensal' ou 'anual').
 * @param {string[]} colunasVisiveis - As colunas (períodos) a serem exibidas.
 * @param {string} projecao - O modo de projeção ('realizado' ou 'arealizar').
 * @returns {object} O objeto de dados final, pronto para ser renderizado.
 */
function mergeMatrizes(listaDeDadosProcessados, modo, colunasVisiveis, projecao) {
    const dadosSelecionados = listaDeDadosProcessados
        .map(dadosConta => dadosConta[projecao.toLowerCase()])
        .filter(Boolean);

    if (dadosSelecionados.length === 0) {
        return { matrizDRE: {}, matrizDepartamentos: {}, saldoInicialPeriodo: 0, matrizCapitalGiro: {} };
    }

    const { monthlyMerged, saldoBaseTotal, todasChaves } = mergeDadosMensais(dadosSelecionados);
    const saldoInicialPeriodo = calcularSaldoInicialPeriodo(monthlyMerged.matrizDRE, todasChaves, colunasVisiveis, saldoBaseTotal);
    
    const dadosAntesDosTotais = (modo.toLowerCase() === 'anual')
        ? agregarDadosParaAnual(monthlyMerged)
        : monthlyMerged;

    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'].forEach(classe => {
        if (!dadosAntesDosTotais.matrizDRE[classe]) dadosAntesDosTotais.matrizDRE[classe] = {};
    });

    calcularLinhasDeTotalDRE(dadosAntesDosTotais.matrizDRE, colunasVisiveis, saldoInicialPeriodo);
    calcularColunaTotalDRE(dadosAntesDosTotais.matrizDRE, colunasVisiveis);

    // Regra específica: Saldo Inicial/Final da coluna TOTAL reflete o primeiro/último período visível.
    if (colunasVisiveis.length > 0) {
        dadosAntesDosTotais.matrizDRE['Caixa Inicial'].TOTAL = dadosAntesDosTotais.matrizDRE['Caixa Inicial'][colunasVisiveis[0]] || 0;
        dadosAntesDosTotais.matrizDRE['Caixa Final'].TOTAL = dadosAntesDosTotais.matrizDRE['Caixa Final'][colunasVisiveis[colunasVisiveis.length - 1]] || 0;
    }

    const chavesDeControle = getChavesDeControle(todasChaves, modo);

    // Geração da Matriz de Capital de Giro (apenas para visão mensal)
    let matrizCapitalGiro = {};
    if (modo.toLowerCase() === 'mensal') {
        const dadosCapitalGiro = listaDeDadosProcessados.map(c => c.capitalDeGiro).filter(Boolean);
        matrizCapitalGiro = gerarMatrizCapitalGiro(dadosCapitalGiro, colunasVisiveis);
    }

    return { ...dadosAntesDosTotais, saldoInicialPeriodo, chavesDeControle, matrizCapitalGiro };
}

/**
 * Consolida e gera a matriz final para a tabela de Capital de Giro.
 * @param {Array} listaDeDadosCapitalGiro - Array com os dados pré-processados de cada conta.
 * @param {Array} colunasVisiveis - As colunas (períodos 'MM-AAAA') a serem exibidas.
 * @returns {object} A matriz formatada para a tabela de Capital de Giro.
 */
function gerarMatrizCapitalGiro(listaDeDadosCapitalGiro, colunasVisiveis) {
    // --- ETAPA 1: AGREGAÇÃO DOS DADOS DE TODAS AS CONTAS ---
    let saldoInicialTotal = 0;
    const fluxoCaixaAgregado = {};
    const contasAReceberAgregadas = [];
    const contasAPagarAgregadas = [];

    listaDeDadosCapitalGiro.forEach(dadosConta => {
        saldoInicialTotal += dadosConta.saldoInicial || 0;
        contasAReceberAgregadas.push(...(dadosConta.contasAReceber || []));
        contasAPagarAgregadas.push(...(dadosConta.contasAPagar || []));
        for (const periodo in dadosConta.fluxoDeCaixaMensal) {
            fluxoCaixaAgregado[periodo] = (fluxoCaixaAgregado[periodo] || 0) + dadosConta.fluxoDeCaixaMensal[periodo];
        }
    });

    // --- ETAPA 2: INICIALIZAÇÃO DA MATRIZ DE SAÍDA ---
    const matriz = {};
    const chaves = ['(+) Caixa', '(+) Clientes a Receber', 'Curto Prazo AR', 'Longo Prazo AR',
                      '(-) Fornecedores a Pagar', 'Curto Prazo AP', 'Longo Prazo AP'];
    chaves.forEach(chave => matriz[chave] = {});

    // --- ETAPA 3: CÁLCULO DO SALDO DE CAIXA PERÍODO A PERÍODO ---
    let caixaAcumulado = saldoInicialTotal;
    const todosPeriodosHistoricos = Object.keys(fluxoCaixaAgregado).sort(compararChaves);
    const primeiraColunaVisivel = [...colunasVisiveis].sort(compararChaves)[0];

    if (primeiraColunaVisivel) {
        todosPeriodosHistoricos.forEach(periodo => {
            // Acumula o fluxo de caixa de todos os meses ANTERIORES ao primeiro mês visível
            if (compararChaves(periodo, primeiraColunaVisivel) < 0) {
                caixaAcumulado += fluxoCaixaAgregado[periodo] || 0;
            }
        });
    }

    colunasVisiveis.forEach(coluna => {
        caixaAcumulado += fluxoCaixaAgregado[coluna] || 0;
        matriz['(+) Caixa'][coluna] = caixaAcumulado;
    });

    // --- ETAPA 4: CÁLCULO DE CONTAS A RECEBER E A PAGAR (EM ABERTO) ---
    const getFimPeriodo = (periodo) => new Date(periodo.split('-')[1], periodo.split('-')[0], 0, 23, 59, 59, 999);

    colunasVisiveis.forEach(coluna => {
        const fimPeriodo = getFimPeriodo(coluna);
        let curtoPrazoAR = 0, longoPrazoAR = 0, curtoPrazoAP = 0, longoPrazoAP = 0;

        const processarItens = (itens, callback) => {
            itens.forEach(item => {
                // REGRA: Um item está "em aberto" se foi emitido antes do fim do período
                // e não foi pago, ou foi pago somente depois do fim do período.
                if (item.DataEmissao && item.DataEmissao <= fimPeriodo && (!item.DataPagamento || item.DataPagamento > fimPeriodo)) {
                    callback(item);
                }
            });
        };
        // Processa Contas a Receber
        processarItens(contasAReceberAgregadas, item => {
            const valor = item.ValorTitulo || 0;
            // REGRA: Vencido no período = Curto Prazo; A vencer = Longo Prazo.
            if (item.DataVencimento && item.DataVencimento <= fimPeriodo) curtoPrazoAR += valor;
            else longoPrazoAR += valor;
        });
        // Processa Contas a Pagar
        processarItens(contasAPagarAgregadas, item => {
            const valor = item.ValorTitulo || 0;
            if (item.DataVencimento && item.DataVencimento <= fimPeriodo) curtoPrazoAP += valor;
            else longoPrazoAP += valor;
        });

        matriz['Curto Prazo AR'][coluna] = curtoPrazoAR;
        matriz['Longo Prazo AR'][coluna] = longoPrazoAR;
        matriz['Curto Prazo AP'][coluna] = curtoPrazoAP;
        matriz['Longo Prazo AP'][coluna] = longoPrazoAP;
    });

    // --- ETAPA 5: CÁLCULO DAS LINHAS DE TOTAIS E PERCENTUAIS ---
    colunasVisiveis.forEach(coluna => {
        const totalAR = matriz['Curto Prazo AR'][coluna] + matriz['Longo Prazo AR'][coluna];
        const totalAP = matriz['Curto Prazo AP'][coluna] + matriz['Longo Prazo AP'][coluna];

        matriz['(+) Clientes a Receber'][coluna] = totalAR;
        matriz['(-) Fornecedores a Pagar'][coluna] = totalAP;
        
        const initKey = k => matriz[k] = matriz[k] || {};
        ['Curto Prazo AR %', 'Longo Prazo AR %', 'Curto Prazo AP %', 'Longo Prazo AP %', '(+) Curto Prazo (30 dias)', '(-) Longo Prazo (maior que 30 dias)', '(=) Capital Líquido Circulante']
            .forEach(initKey);

        matriz['Curto Prazo AR %'][coluna] = totalAR > 0 ? (matriz['Curto Prazo AR'][coluna] / totalAR) * 100 : 0;
        matriz['Longo Prazo AR %'][coluna] = totalAR > 0 ? (matriz['Longo Prazo AR'][coluna] / totalAR) * 100 : 0;
        matriz['Curto Prazo AP %'][coluna] = totalAP > 0 ? (matriz['Curto Prazo AP'][coluna] / totalAP) * 100 : 0;
        matriz['Longo Prazo AP %'][coluna] = totalAP > 0 ? (matriz['Longo Prazo AP'][coluna] / totalAP) * 100 : 0;

        matriz['(+) Curto Prazo (30 dias)'][coluna] = matriz['Curto Prazo AR'][coluna] - matriz['Curto Prazo AP'][coluna];
        matriz['(-) Longo Prazo (maior que 30 dias)'][coluna] = matriz['Longo Prazo AR'][coluna] - matriz['Longo Prazo AP'][coluna];
        matriz['(=) Capital Líquido Circulante'][coluna] = matriz['(+) Caixa'][coluna] + totalAR - totalAP;
    });

    return matriz;
}

/**
 * Obtém a primeira e a última chave de período (MM-AAAA) do conjunto de dados.
 * @param {Set} chavesSet - O conjunto de todas as chaves de período.
 * @param {string} modo - 'mensal' ou 'anual'.
 * @returns {object} Objeto com a primeira e última chave.
 */
function getChavesDeControle(chavesSet, modo) {
    if (chavesSet.size === 0) return { ultimaChave: null, primeiraChave: null };

    const chavesOrdenadas = Array.from(chavesSet).sort(compararChaves);
    let primeiraChave = chavesOrdenadas[0];
    let ultimaChave = chavesOrdenadas[chavesOrdenadas.length - 1];

    if (modo.toLowerCase() === "anual") {
        primeiraChave = primeiraChave.split('-')[1];
        ultimaChave = ultimaChave.split('-')[1];
    }

    return { ultimaChave, primeiraChave };
}

/**
 * Compara duas chaves de período no formato "MM-AAAA" para ordenação.
 * @param {string} a - Primeira chave.
 * @param {string} b - Segunda chave.
 * @returns {number} Resultado da comparação para a função sort().
 */
function compararChaves(a, b) {
    const [mesA, anoA] = a.split('-').map(Number);
    const [mesB, anoB] = b.split('-').map(Number);
    if (anoA !== anoB) return anoA - anoB;
    return mesA - mesB;
}

export { processarDadosDaConta, extrairDadosDosTitulos, mergeMatrizes };