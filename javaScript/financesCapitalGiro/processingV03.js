// processing.js
/**
 * Itera sobre os títulos da API e os separa em duas listas: pagamentos já realizados e títulos a vencer.
 * @param {Array} titulos - Array de títulos vindo da API.
 * @returns {object} 
 * // {
 * //   lancamentosProcessados: [ { Natureza, DataLancamento, CODContaC, ValorLancamento, CODCategoria, Cliente, Departamentos:[{CodDpto, ValorDepto}] } ],
 * //   titulosEmAberto: [ { Natureza, DataLancamento, CODContaC, ValorLancamento, CODCategoria, Cliente, Departamentos:[{CodDpto, ValorDepto}] } ]
 * // }
 */
function extrairDadosDosTitulos(titulos) {
    const lancamentosProcessados = [];
    const titulosEmAberto = [];
    const capitalDeGiro = [];

    // Garante que a entrada seja um array para evitar erros.
    if (!Array.isArray(titulos)) {
        console.error("A entrada para a função não é um array.", titulos);
        return lancamentosProcessados;
    }
    //Para cada titlo recebido da API  
    titulos.forEach(titulo => {
        // Valida se o título contem Lançamentos e categoria
        if (!titulo || !titulo.Categoria) {
            console.warn("O título está inválido ou com dados essenciais faltando e foi ignorado:", titulo);
            return; // Pula para o próximo título do loop.
        }


        // 2. Itera sobre cada lançamento individual dentro do título.
        let ValorPago = 0;
        titulo.Lancamentos.forEach(lancamento => {
            if (!lancamento.DataLancamento || !lancamento.CODContaC || typeof lancamento.ValorLancamento === 'undefined') {
                console.warn("Lançamento individual inválido ou com dados faltando:", lancamento);
                return; // Pula para o próximo lançamento.
            }           

            //Gera um objeto de departamentos com os valores proporcionais
            let departamentosObj = gerarDepartamentosObj(titulo.Departamentos, lancamento.ValorLancamento);
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
            capitalDeGiro.push({
                Natureza: titulo.Natureza,
                DataPagamento: lancamento.DataLancamento || null,
                DataVencimento: titulo.DataVencimento || null,
                DataEmissao: titulo.DataEmissao || null,
                ValorTitulo: lancamento.ValorLancamento || 0,
            });
            //Subtrai valor do lançamento do valor do titulo (ValorBaixado desconsidera multa e juros)
            ValorPago += lancamento.ValorBaixado
        });
        //Se o titulo não estiver quitado com pagamentos, gera um titulo em aberto com o valor restante
        const valorFaltante = (titulo.ValorTitulo - ValorPago)
        if(valorFaltante >= 0.01 && titulo.ValorTitulo != 0){
            let departamentosObj = gerarDepartamentosObj(titulo.Departamentos, valorFaltante);
            titulosEmAberto.push({
                Natureza: titulo.Natureza,
                DataLancamento: titulo.DataVencimento,
                CODContaC: titulo.CODContaC,
                ValorLancamento: valorFaltante,
                CODCategoria: titulo.Categoria,
                Cliente: titulo.Cliente || "Cliente",
                Departamentos: departamentosObj
            });
            capitalDeGiro.push({
                Natureza: titulo.Natureza,
                DataPagamento: null,
                DataVencimento: titulo.DataVencimento || null,
                DataEmissao: titulo.DataEmissao || null,
                ValorTitulo: valorFaltante || 0,
            });
        }
    });
    return { lancamentosProcessados, titulosEmAberto, capitalDeGiro };
}
function gerarDepartamentosObj(departamentos, valorLancamento) {
    // Se for um array válido e tiver elementos
    if (Array.isArray(departamentos) && departamentos.length > 0) {
        return departamentos.map(depto => {
            const valorRateio = valorLancamento * ((depto.PercDepto ?? 100) / 100);
            return {
                CodDpto: depto.CODDepto || 0,
                ValorDepto: valorRateio
            };
        });
    }
    // Caso contrário, retorna o "Outros Departamentos"
    return [{
        CodDpto: 0,
        ValorDepto: valorLancamento
    }];
}
//Converte uma string de data em um objeto data
function parseDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;
    // new Date(ano, mês - 1, dia)
    return new Date(parts[2], parts[1] - 1, parts[0]);
}
/**
 * Processa uma lista de lançamentos (realizados ou a realizar) e os agrupa em matrizes DRE e de Departamentos.
 * @param {object} dadosBase - Cache da aplicação.
 * @param {Array} lancamentos - Array de lançamentos ou títulos a processar.
 * @param {number} contaId - ID da conta corrente sendo processada.
 * @returns {object} 
 * // {
 * //   matrizDRE: { "Classe": { "MM-AAAA": valor, ... }, ... },
 * //   matrizDepartamentos: { "NomeDepto|Classe": { nome, classe, categorias: { ... } }, ... },
 * //   chavesComDados: Set("MM-AAAA", ...),
 * //   valorTotal: number
 * // }
 */
function processarRealizadoRealizar(dadosBase, lancamentos, contaId) {
    const matrizDRE = {}, matrizDepartamentos = {}, chavesComDados = new Set();
    const classesParaDetalhar = new Set([
        '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL',
        '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos', 
        '(+/-) Empréstimos/Consórcios'
    ]);
    
    let valorTotal = 0; 
    lancamentos.forEach(lancamento => {
        if (contaId != Number(lancamento.CODContaC)) return;
        if (!lancamento || !lancamento.DataLancamento || !lancamento.CODContaC) return;
        
        const partesData = lancamento.DataLancamento.split('/');
        if (partesData.length !== 3) return; 
        const [dia, mesRaw, ano] = partesData;
        const chaveAgregacao = `${mesRaw.padStart(2, '0')}-${ano}`;
        chavesComDados.add(chaveAgregacao);
    
        let valor = lancamento.ValorLancamento;
        if (lancamento.Natureza === "P") valor = -valor;
        valorTotal += valor;

        const codCategoria = lancamento.CODCategoria || 'SemCategoria';
        const classeInfo = dadosBase.classesMap.get(codCategoria);
        const classe = classeInfo ? classeInfo.classe : 'Outros';

        if (!matrizDRE[classe]) matrizDRE[classe] = {};
        matrizDRE[classe][chaveAgregacao] = (matrizDRE[classe][chaveAgregacao] || 0) + valor;

        if (classesParaDetalhar.has(classe) && Array.isArray(lancamento.Departamentos) && lancamento.Departamentos.length > 0) {
            const fornecedor = lancamento.Cliente;
            lancamento.Departamentos.forEach(depto => {
                let valorRateio = depto.ValorDepto;
                if (lancamento.Natureza === "P") valorRateio = -valorRateio;
                
                const nomeDepto = dadosBase.departamentosMap.get(depto.CodDpto) || 'Outros Departamentos';
                const chaveDepto = `${nomeDepto}|${classe}`;
                
                if (!matrizDepartamentos[chaveDepto]) {
                    matrizDepartamentos[chaveDepto] = { nome: nomeDepto, classe, categorias: {} };
                }
                const categoriaRef = matrizDepartamentos[chaveDepto].categorias;
                if (!categoriaRef[codCategoria]) {
                    categoriaRef[codCategoria] = { valores: {}, fornecedores: {} };
                }
                const catData = categoriaRef[codCategoria];
                catData.valores[chaveAgregacao] = (catData.valores[chaveAgregacao] || 0) + valorRateio;
                
                if (!catData.fornecedores[fornecedor]) {
                    catData.fornecedores[fornecedor] = { fornecedor, valores: {}, total: 0 };
                }
                catData.fornecedores[fornecedor].valores[chaveAgregacao] =
                    (catData.fornecedores[fornecedor].valores[chaveAgregacao] || 0) + valorRateio;
                catData.fornecedores[fornecedor].total += valorRateio;
            });
        }
    });

    return { matrizDRE, matrizDepartamentos, chavesComDados, valorTotal };
}
// Adicione esta nova função em processingV01.js
/**
 * Pré-processa os dados de capital de giro para uma única conta.
 * Organiza os itens em listas e calcula o fluxo de caixa mensal.
 */
function processarCapitalDeGiro(dadosBase, capitalDeGiro, contaId) {
    const contaInfo = dadosBase.contasMap.get(String(contaId));
    const saldoInicial = contaInfo ? Number(contaInfo.saldoIni) : 0;

    const fluxoDeCaixaMensal = {};
    const contasAReceber = [];
    const contasAPagar = [];

    if (Array.isArray(capitalDeGiro)) {
        capitalDeGiro.forEach(item => {
            // 1. Calcula o fluxo de caixa real (transações pagas)
            if (item.DataPagamento) {
                const partesData = item.DataPagamento.split('/');
                if (partesData.length === 3) {
                    const chavePeriodo = `${partesData[1].padStart(2, '0')}-${partesData[2]}`;
                    let valor = item.ValorTitulo || 0;
                    if (item.Natureza === 'P') valor = -valor;
                    fluxoDeCaixaMensal[chavePeriodo] = (fluxoDeCaixaMensal[chavePeriodo] || 0) + valor;
                }
            }

            // 2. Organiza itens de Contas a Pagar/Receber com datas parseadas
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
        });
    }

    return {
        saldoInicial,
        fluxoDeCaixaMensal,
        contasAReceber,
        contasAPagar
    };
}
/**
 * Orquestra o processamento dos dados de uma conta, separando em 'realizado' e 'a realizar'.
 * @param {object} AppCache - O cache da aplicação com os mapas de apoio.
 * @param {object} dadosApi - Objeto com { lancamentos, titulos } extraídos da API.
 * @param {number} contaId - O ID da conta sendo processada.
 * @returns {object} 
 * // {
 * //   realizado: { matrizDRE, matrizDepartamentos, chavesComDados, valorTotal },
 * //   arealizar: { matrizDRE, matrizDepartamentos, chavesComDados, valorTotal }
 * // }
 */
function processarDadosDaConta(AppCache, dadosApi, contaId) {
    const { lancamentos, titulos , capitalDeGiro } = dadosApi;

    // Processa os dados para o modo REALIZADO
    // Retorna os dados no formato { matrizDRE, matrizDepartamentos, chavesComDados, valorTotal }
    const dadosRealizado = processarRealizadoRealizar(AppCache, lancamentos, contaId);
    const dadosARealizar = processarRealizadoRealizar(AppCache, titulos, contaId);

    // Processa os dados para Capital de Giro
    const dadosCapitalDeGiro = processarCapitalDeGiro(AppCache, capitalDeGiro, contaId);

    return {
        realizado: dadosRealizado,
        arealizar: dadosARealizar,
        capitalDeGiro: dadosCapitalDeGiro
    };
}
//Calcula as linhas totalizadoras da Matriz DRE (Demonstração do Resultado) com base nos dados de entrada.
//Esta função modifica o objeto matrizDRE diretamente (muta o objeto), preenchendo as linhas de totais e saldos.
function calcularLinhasDeTotalDRE(matrizDRE, colunasParaCalcular, saldoInicial) {
    // Inicia o saldo acumulado com o saldo inicial fornecido. Este valor será atualizado a cada coluna (período).
    let saldoAcumulado = saldoInicial;

    // Itera sobre cada coluna (mês ou ano) para calcular os totais verticalmente.
    colunasParaCalcular.forEach(coluna => {
        //Função auxiliar para obter o valor de uma classe da DRE para a coluna atual.
        const getValor = (classe) => matrizDRE[classe]?.[coluna] || 0;

        // Calcula a Receita Líquida somando a Receita Bruta com as Deduções (que são negativas).
        const receitaLiquida = getValor('(+) Receita Bruta') + getValor('(-) Deduções');
        matrizDRE['(=) Receita Líquida'][coluna] = receitaLiquida;

        // Calcula a Geração de Caixa Operacional, que é o resultado da operação principal da empresa.
        const geracaoCaixa = receitaLiquida + getValor('(-) Custos') + getValor('(-) Despesas') + getValor('(+/-) IRPJ/CSLL');
        matrizDRE['(+/-) Geração de Caixa Operacional'][coluna] = geracaoCaixa;

        // Soma todas as outras movimentações (financeiras, investimentos, etc.).
        const movimentacaoNaoOperacional = getValor('(+/-) Resultado Financeiro') + getValor('(+/-) Aportes/Retiradas') + getValor('(+/-) Investimentos') + getValor('(+/-) Empréstimos/Consórcios');
        
        // A movimentação total do mês é a soma do resultado operacional com o não operacional.
        const movimentacaoMensal = geracaoCaixa + movimentacaoNaoOperacional;
        matrizDRE['(=) Movimentação de Caixa Mensal'][coluna] = movimentacaoMensal;

        // O Caixa Inicial do período atual é o saldo acumulado até o final do período anterior.
        matrizDRE['Caixa Inicial'][coluna] = saldoAcumulado;
        
        // Calcula a variação total de caixa, incluindo transferências e outros lançamentos que afetam o caixa mas não o resultado.
        const variacaoCaixaTotal = movimentacaoMensal + getValor('Entrada de Transferência') + getValor('Saída de Transferência') + getValor('Outros');
        
        // Atualiza o saldo acumulado para o próximo período, somando a variação total de caixa do período atual.
        saldoAcumulado += variacaoCaixaTotal;

        // O Caixa Final do período atual é o novo saldo acumulado.
        matrizDRE['Caixa Final'][coluna] = saldoAcumulado;
    });
}
/**
 * Mescla os dados de múltiplas contas em um único conjunto de dados mensais.
 * @param {object[]} listaDeDadosProcessados - Array de objetos, cada um contendo os dados de uma conta.
 * @returns {object} 
 * // {
 * //   monthlyMerged: { matrizDRE, matrizDepartamentos },
 * //   saldoBaseTotal: number,
 * //   todasChaves: Set("MM-AAAA", ...)
 * // }
 */
function mergeDadosMensais(listaDeDadosProcessados) {
    const monthlyMerged = { matrizDRE: {}, matrizDepartamentos: {} };
    const todasChaves = new Set(); // Armazena todos os períodos únicos (ex: '01-2024', '02-2024')

    // Soma o saldo inicial de todas as contas para obter um saldo base consolidado.
    const saldoBaseTotal = listaDeDadosProcessados.reduce((acc, dados) => {
        // Coleta todas as chaves de período de todas as contas.
        dados.chavesComDados.forEach(chave => todasChaves.add(chave));

        // Mescla os dados da DRE.
        for (const classe in dados.matrizDRE) {
            if (!monthlyMerged.matrizDRE[classe]) monthlyMerged.matrizDRE[classe] = {};
            for (const periodo in dados.matrizDRE[classe]) {
                monthlyMerged.matrizDRE[classe][periodo] = (monthlyMerged.matrizDRE[classe][periodo] || 0) + dados.matrizDRE[classe][periodo];
            }
        }

        // Mescla os dados dos Departamentos (uma estrutura mais complexa).
        for (const chaveDepto in dados.matrizDepartamentos) {
            // Se o departamento ainda não existe no objeto mesclado, faz uma cópia profunda.
            if (!monthlyMerged.matrizDepartamentos[chaveDepto]) {
                monthlyMerged.matrizDepartamentos[chaveDepto] = JSON.parse(JSON.stringify(dados.matrizDepartamentos[chaveDepto]));
            } else {
                // Se já existe, itera sobre as categorias e fornecedores para somar os valores.
                const mergedDepto = monthlyMerged.matrizDepartamentos[chaveDepto];
                const deptoData = dados.matrizDepartamentos[chaveDepto];
                for (const codCat in deptoData.categorias) {
                    if (!mergedDepto.categorias[codCat]) {
                        mergedDepto.categorias[codCat] = JSON.parse(JSON.stringify(deptoData.categorias[codCat]));
                    } else {
                        const mergedCat = mergedDepto.categorias[codCat];
                        const catData = deptoData.categorias[codCat];
                        // Soma valores mensais da categoria
                        for (const periodo in catData.valores) {
                            mergedCat.valores[periodo] = (mergedCat.valores[periodo] || 0) + catData.valores[periodo];
                        }
                        // Soma valores dos fornecedores dentro da categoria
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
        // Acumula o saldo inicial de cada conta.
        return acc + (dados.saldoIni || 0);
    }, 0);

    return { monthlyMerged, saldoBaseTotal, todasChaves };
}
/**
 * Calcula o saldo de caixa inicial para um período de visualização específico.
 * @param {object} monthlyDRE - Objeto com os dados financeiros mensais.
 * @param {Set|Array} todasChaves - Todas as chaves de período (MM-AAAA) disponíveis nos dados.
 * @param {Array<string>} colunasVisiveis - As colunas/períodos selecionados para exibição.
 * @param {number} saldoBaseTotal - O saldo de caixa inicial absoluto, antes de qualquer período histórico.
 * @returns {number} O saldo de caixa inicial para o primeiro período visível.
 */
function calcularSaldoInicialPeriodo(monthlyDRE, todasChaves, colunasVisiveis, saldoBaseTotal) {
    // Função auxiliar para parsear e comparar datas no formato 'MM-AAAA'
    const compararPeriodos = (a, b) => {
        const [mesA, anoA] = a.split('-');
        const [mesB, anoB] = b.split('-');
        return new Date(anoA, mesA - 1) - new Date(anoB, mesB - 1);
    };

    // 1. Ordena todas as chaves de período cronologicamente.
    const colunasHistoricasOrdenadas = Array.from(todasChaves).sort(compararPeriodos);

    // 2. Garante que as colunas visíveis também estejam ordenadas.
    const colunasVisiveisOrdenadas = [...colunasVisiveis].sort(compararPeriodos);

    // Se não houver colunas visíveis, não há o que calcular.
    if (colunasVisiveisOrdenadas.length === 0) {
        return saldoBaseTotal;
    }

    // 3. Cria uma cópia temporária da DRE para não alterar a original.
    const tempDRE = JSON.parse(JSON.stringify(monthlyDRE));
    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'].forEach(classe => {
        if (!tempDRE[classe]) tempDRE[classe] = {};
    });

    // 4. Calcula a 'Movimentação de Caixa Mensal' de cada período histórico com um saldo base de zero.
    calcularLinhasDeTotalDRE(tempDRE, colunasHistoricasOrdenadas, 0);

    let saldoAcumuladoAntesDoPeriodo = 0;
    let primeiraColunaVisivel = colunasVisiveisOrdenadas[0];
    if (primeiraColunaVisivel && !primeiraColunaVisivel.includes('-')) {
        primeiraColunaVisivel = `01-${primeiraColunaVisivel}`;
    }
    
    // 5. Itera sobre os períodos históricos e soma a movimentação de caixa de todos os meses
    //    ANTES do primeiro mês que será exibido na tela.
    for (const periodo of colunasHistoricasOrdenadas) {
        // Interrompe a iteração se o período do histórico for IGUAL ou POSTERIOR 
        // ao primeiro mês visível, garantindo que somamos apenas os meses ANTERIORES.
        if (compararPeriodos(periodo, primeiraColunaVisivel) >= 0) {
            break;
        }
        const variacaoDoPeriodo = (tempDRE['(=) Movimentação de Caixa Mensal']?.[periodo] || 0) +
                            (tempDRE['Entrada de Transferência']?.[periodo] || 0) +
                            (tempDRE['Saída de Transferência']?.[periodo] || 0) +
                            (tempDRE['Outros']?.[periodo] || 0);
                            
        saldoAcumuladoAntesDoPeriodo += variacaoDoPeriodo || 0;
    }

    // 6. O saldo inicial é a soma do saldo base com a variação de caixa acumulada dos meses anteriores.
    return saldoBaseTotal + saldoAcumuladoAntesDoPeriodo;
}
/**
 * Agrega os dados mensais consolidados em totais anuais, se necessário.
 * @param {object} monthlyData - O objeto de dados mesclados com valores mensais.
 * @returns {object} - Um novo objeto de dados com valores agregados por ano.
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
 * Calcula a coluna 'TOTAL' para a matriz DRE.
 * Soma os valores de todas as colunas visíveis para cada linha da DRE.
 * @param {object} matrizDRE - A matriz DRE (mensal ou anual).
 * @param {string[]} colunasVisiveis - As colunas que devem ser somadas no total.
 */
function calcularColunaTotalDRE(matrizDRE, colunasVisiveis) {
    Object.values(matrizDRE).forEach(periodos => {
        periodos.TOTAL = colunasVisiveis.reduce((acc, coluna) => acc + (periodos[coluna] || 0), 0);
    });
}
/**
 * Função principal que orquestra a mesclagem e o processamento de dados de múltiplas contas.
 * Consolida, calcula saldos, agrega (se necessário) e finaliza os dados para exibição.
 * @param {object[]} listaDeDadosProcessados - Array de objetos, cada um contendo os dados de uma conta.
 * @param {string} modo - O modo de visualização ('mensal' ou 'anual').
 * @param {string[]} colunasVisiveis - As colunas (períodos) que devem ser exibidas.
 * @param {string} projecao - O modo de visualização ('realizado' ou 'aRealizar').
 * @returns {object} 
 * // {
 * //   matrizDRE: { "Classe": { "MM-AAAA": valor, "TOTAL": valorTotal, ... }, ... },
 * //   matrizDepartamentos: { "NomeDepto|Classe": { ... } },
 * //   saldoInicialPeriodo: number,
 * //   PeUChave: { ultimaChave: "MM-AAAA", primeiraChave: "MM-AAAA" }
 * // }
 */
function mergeMatrizes(listaDeDadosProcessados, modo, colunasVisiveis, projecao) {
    const dadosSelecionados = listaDeDadosProcessados
        .map(dadosConta => dadosConta[projecao.toLowerCase()])
        .filter(Boolean); // Filtra quaisquer contas que não tenham dados para o modo selecionado

    // Retorna um resultado vazio se não houver dados de entrada.
    if (!dadosSelecionados || dadosSelecionados.length === 0) {
        return { matrizDRE: {}, matrizDepartamentos: {}, saldoInicialPeriodo: 0,  matrizCapitalGiro: {}};
    }

    // Mescla os dados mes a mes de todas as contas selecionadas.
    // Calcula o saldo inicial correto para o primeiro período que será exibido.
    // Agrega os dados de mensais para anuais, se o modo for 'anual'.
    const { monthlyMerged, saldoBaseTotal, todasChaves } = mergeDadosMensais(dadosSelecionados);
    const saldoInicialPeriodo = calcularSaldoInicialPeriodo(monthlyMerged.matrizDRE, todasChaves, colunasVisiveis, saldoBaseTotal);
    const dadosAntesDosTotais = (modo.toLowerCase() === 'anual')
        ? agregarDadosParaAnual(monthlyMerged)
        : monthlyMerged;

    // Calcula as linhas totalizadoras e saldos para as colunas visíveis e a coluna TOTAL.
    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'].forEach(classe => {
        if (!dadosAntesDosTotais.matrizDRE[classe]) dadosAntesDosTotais.matrizDRE[classe] = {};
    });
    calcularLinhasDeTotalDRE(dadosAntesDosTotais.matrizDRE, colunasVisiveis, saldoInicialPeriodo);
    calcularColunaTotalDRE(dadosAntesDosTotais.matrizDRE, colunasVisiveis);
    // Adicion o saldo inicial do primeiro período visivel e o saldo final do último período visivel na coluna TOTAL
    dadosAntesDosTotais.matrizDRE['Caixa Inicial'].TOTAL = dadosAntesDosTotais.matrizDRE['Caixa Inicial'][colunasVisiveis[0]] || 0;
    dadosAntesDosTotais.matrizDRE['Caixa Final'].TOTAL = dadosAntesDosTotais.matrizDRE['Caixa Final'][colunasVisiveis[colunasVisiveis.length - 1]] || 0;
    // Calcula as chaves de controle (primeira e última chave) para o período exibido.
    const PeUChave = getChavesDeControle(todasChaves, modo);

    // Geração da Matriz de Capital de Giro
    let matrizCapitalGiro = {};
    // O cálculo só faz sentido na visão mensal, conforme o modelo.
    if (modo.toLowerCase() === 'mensal') {
        const dadosCapitalGiro = listaDeDadosProcessados.map(c => c.capitalDeGiro).filter(Boolean);
        matrizCapitalGiro = gerarMatrizCapitalGiro(dadosCapitalGiro, colunasVisiveis);
    }

    // Retorna o objeto final
    return { ...dadosAntesDosTotais, saldoInicialPeriodo, PeUChave, matrizCapitalGiro };
}
// Adicione esta nova função em processingV01.js

/**
 * Consolida os dados de capital de giro de múltiplas contas e gera a matriz final para exibição.
 * @param {Array} listaDeDadosCapitalGiro - Array com os objetos pré-processados de cada conta.
 * @param {Array} colunasVisiveis - As colunas (períodos 'MM-AAAA') a serem exibidas.
 * @returns {object} A matriz formatada para a tabela de Capital de Giro.
 */
function gerarMatrizCapitalGiro(listaDeDadosCapitalGiro, colunasVisiveis) {
    // 1. Agrega dados de todas as contas selecionadas
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

    const matriz = {};
    const chaves = ['(+) Caixa', '(+) Clientes a Receber', 'Curto Prazo AR', 'Longo Prazo AR',
                    '(-) Fornecedores a Pagar', 'Curto Prazo AP', 'Longo Prazo AP'];
    chaves.forEach(chave => matriz[chave] = {});

    // 2. Calcula o saldo de caixa para cada período visível
    let caixaAcumulado = saldoInicialTotal;
    const todosPeriodosHistoricos = Object.keys(fluxoCaixaAgregado).sort(compararChaves);
    const primeiraColunaVisivel = [...colunasVisiveis].sort(compararChaves)[0];

    // Acumula o caixa de todos os meses ANTERIORES ao primeiro mês visível
    if (primeiraColunaVisivel) {
        todosPeriodosHistoricos.forEach(periodo => {
            if (compararChaves(periodo, primeiraColunaVisivel) < 0) {
                caixaAcumulado += fluxoCaixaAgregado[periodo] || 0;
            }
        });
    }

    // Agora, preenche o caixa para as colunas que serão exibidas
    colunasVisiveis.forEach(coluna => {
        caixaAcumulado += fluxoCaixaAgregado[coluna] || 0;
        matriz['(+) Caixa'][coluna] = caixaAcumulado;
    });

    // 3. Calcula Contas a Receber e a Pagar para cada período
    const getFimPeriodo = (periodo) => new Date(periodo.split('-')[1], periodo.split('-')[0], 0, 23, 59, 59, 999);

    colunasVisiveis.forEach(coluna => {
        const fimPeriodo = getFimPeriodo(coluna);
        let cpAR = 0, lpAR = 0, cpAP = 0, lpAP = 0;

        const processarItens = (itens, cb) => {
            itens.forEach(item => {
                // Regra: Emitido até o fim do período E (pago após o período OU não pago)
                if (item.DataEmissao && item.DataEmissao <= fimPeriodo && (!item.DataPagamento || item.DataPagamento > fimPeriodo)) {
                    cb(item);
                }
            });
        };

        // Processa Contas a Receber
        processarItens(contasAReceberAgregadas, item => {
            const valor = item.ValorTitulo || 0;
            // Regra: Vencimento passou em relação ao período = Curto Prazo
            if (item.DataVencimento && item.DataVencimento <= fimPeriodo) cpAR += valor;
            else lpAR += valor;
        });

        // Processa Contas a Pagar
        processarItens(contasAPagarAgregadas, item => {
            const valor = item.ValorTitulo || 0;
            if (item.DataVencimento && item.DataVencimento <= fimPeriodo) cpAP += valor;
            else lpAP += valor;
        });

        matriz['Curto Prazo AR'][coluna] = cpAR;
        matriz['Longo Prazo AR'][coluna] = lpAR;
        matriz['Curto Prazo AP'][coluna] = cpAP;
        matriz['Longo Prazo AP'][coluna] = lpAP;
    });

    // 4. Calcula os totais, percentuais e linhas finais
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
// Obtem a primeira e ultima chave do periodo de dados selecionados
function getChavesDeControle(chavesSet, modo) {
    let primeiraChave = null;
    for (const chave of chavesSet) {
        if (!primeiraChave || compararChaves(chave, primeiraChave) < 0) {
            primeiraChave = chave;
        }
    }
    let ultimaChave = null;
    for (const chave of chavesSet) {
        if (!ultimaChave || compararChaves(chave, ultimaChave) > 0) {
            ultimaChave = chave;
        }
    }
    if (modo.toLowerCase() === "anual") {
        primeiraChave = primeiraChave ? primeiraChave.split('-')[1] : null;
        ultimaChave = ultimaChave ? ultimaChave.split('-')[1] : null;
    }

    return { ultimaChave, primeiraChave };
}
// Faz a comparação entre duas chaves no formato "MM-AAAA" ou "AAAA" e retorna em ordem crescente
function compararChaves(a, b) {
    const [mesA, anoA] = a.split('-').map(Number);
    const [mesB, anoB] = b.split('-').map(Number);

    if (anoA !== anoB) return anoA - anoB;
    return mesA - mesB;
}

export { processarDadosDaConta, extrairDadosDosTitulos, mergeMatrizes };






