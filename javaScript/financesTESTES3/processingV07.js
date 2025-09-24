// processing.js
function extrairLancamentosDosTitulos(titulos) {
    const lancamentosProcessados = [];

    // Garante que a entrada seja um array para evitar erros.
    if (!Array.isArray(titulos)) {
        console.error("A entrada para a função não é um array.", titulos);
        return lancamentosProcessados;
    }
    //Para cada titlo recebido da API  
    titulos.forEach(titulo => {
        // Valida se o título Lançamentos e categoria
        if (!titulo || !Array.isArray(titulo.Lancamentos) || !titulo.Categoria) {
            console.warn("O título está inválido ou com dados essenciais faltando e foi ignorado:", titulo);
            return; // Pula para o próximo título do loop.
        }
        
        // 2. Itera sobre cada lançamento individual dentro do título.
        titulo.Lancamentos.forEach(lancamento => {
            if (!lancamento.DataLancamento || !lancamento.CODContaC || typeof lancamento.ValorLancamento === 'undefined') {
                console.warn("Lançamento individual inválido ou com dados faltando:", lancamento);
                return; // Pula para o próximo lançamento.
            }

                        
            let departamentosObj = [];
            // Verifica se o array de departamentos do titulo não é vazi
            if (Array.isArray(titulo.Departamentos) && titulo.Departamentos.length > 0) {
                // Se não for vazio cria um objeto departamento com valor = percentual do departamento*valor do lançamento
                departamentosObj = titulo.Departamentos.map(depto => {
                    const valorRateio = lancamento.ValorLancamento * ((depto.PercDepto ?? 100) / 100);
                    return {
                        CodDpto: depto.CODDepto || 0,
                        ValorDepto: valorRateio
                    };
                });
            } else {
                // Se estiver vazio ou não existir, cria o departamento "Outros Departamentos" com o valor total do lançamento
                departamentosObj = [{
                    CodDpto: 0,
                    ValorDepto: lancamento.ValorLancamento
                }];
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
//Processa os dados recebidos da API em matrizes para salvar em cache
function processarLancamentos(dadosConta, conta) {
    const matrizDRE = {}, matrizDepartamentos = {}, chavesComDados = new Set();
    //Deifine classes para detalhar na tabela de departamentos
    const classesParaDetalhar = new Set([
        '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL',
        '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos', 
        '(+/-) Empréstimos/Consórcios'
    ]);
    //Para cada lançamento
    dadosConta.lancamentos.forEach(lancamento => {
        if (conta != Number(lancamento.CODContaC)) return;
        if (!lancamento || !lancamento.DataLancamento || !lancamento.CODContaC) {
            return; 
        }
        //Cria chave de agragação por mes-ano  
        const partesData = lancamento.DataLancamento.split('/');
        if (partesData.length !== 3) return; 
        const [dia, mesRaw, ano] = partesData;
        const mes = mesRaw.padStart(2, '0');   //garante sempre 2 dígitos
        const chaveAgregacao = `${mes}-${ano}`;
        chavesComDados.add(chaveAgregacao);
        //Negativa valor para pagamentos ("P")
        let valor = lancamento.ValorLancamento;
        if (lancamento.Natureza === "P") {
            valor = -valor;
        }
        //Extrai outros dados
        const codCategoria = lancamento.CODCategoria || 'SemCategoria';
        const classeInfo = dadosConta.classesMap.get(codCategoria);
        const classe = classeInfo ? classeInfo.classe : 'Outros';

        // Matriz DRE
        // Se a lasse não existir na matriz cria um objeto para ela
        if (!matrizDRE[classe]) matrizDRE[classe] = {};
        // Dentro do objeto da classe soma o valor separado por chave de agragação
        matrizDRE[classe][chaveAgregacao] = (matrizDRE[classe][chaveAgregacao] || 0) + valor;

        // Matriz Departamentos
        if (classesParaDetalhar.has(classe) && Array.isArray(lancamento.Departamentos) && lancamento.Departamentos.length > 0) {
            const fornecedor = lancamento.Cliente;
            //Para cada departamento no lançamento
            lancamento.Departamentos.forEach(depto => {
                const codDepto = depto.CodDpto;
                let valorRateio = depto.ValorDepto;
                if (lancamento.Natureza === "P") {
                    valorRateio = -valorRateio;
                }
                //Recupera o nome do departamento no map
                const nomeDepto = dadosConta.departamentosMap.get(codDepto) || 'Outros Departamentos';
                //Cria uma chave de agragação usando o nome do dpto e da classe
                const chaveDepto = `${nomeDepto}|${classe}`;
                //Se a chave não existir na matriz cria
                if (!matrizDepartamentos[chaveDepto]) {
                    matrizDepartamentos[chaveDepto] = { nome: nomeDepto, classe, categorias: {} };
                }
                //Pega o objeto de ctegorias dentro do objeto principal
                const categoriaRef = matrizDepartamentos[chaveDepto].categorias;
                //Se a categoria não existir cria um objeto para ela
                if (!categoriaRef[codCategoria]) {
                    categoriaRef[codCategoria] = { valores: {}, fornecedores: {} };
                }
                //Referencia o objeto criado para a categoria
                const catData = categoriaRef[codCategoria];
                //Soma o valor por chave de agragação dentro do objeto de valores
                catData.valores[chaveAgregacao] = (catData.valores[chaveAgregacao] || 0) + valorRateio;
                
                //Dentro do objeto de categoria verifica se existe um objeto para o fornecedor, se não cria    
                if (!catData.fornecedores[fornecedor]) {
                    catData.fornecedores[fornecedor] = { fornecedor, valores: {}, total: 0 };
                }
                //Soma os valores para o fornecedor dentro do objeto
                catData.fornecedores[fornecedor].valores[chaveAgregacao] =
                    (catData.fornecedores[fornecedor].valores[chaveAgregacao] || 0) + valorRateio;
                catData.fornecedores[fornecedor].total += valorRateio;
            });
        }
    });
    //Organiza os fornecedores por ordem de valor
    Object.values(matrizDepartamentos).forEach(dep => {
        Object.values(dep.categorias).forEach(cat => {
            cat.fornecedores = Object.values(cat.fornecedores).sort((a, b) => b.total - a.total);
        });
    });

    return { matrizDRE, matrizDepartamentos, chavesComDados };
}
/**
 * Calcula as linhas totalizadoras da Matriz DRE (Demonstração do Resultado do Exercício) com base nos dados de entrada.
 * Esta função modifica o objeto matrizDRE diretamente (muta o objeto), preenchendo as linhas de totais e saldos.
 * @param {object} matrizDRE - O objeto contendo os dados da DRE, onde as chaves são as classes/linhas da DRE.
 * @param {string[]} colunasParaCalcular - Um array com os nomes das colunas (períodos, ex: '01-2024') sobre as quais os cálculos serão feitos.
 * @param {number} saldoInicial - O valor do caixa inicial para o primeiro período a ser calculado.
 */
function calcularLinhasDeTotalDRE(matrizDRE, colunasParaCalcular, saldoInicial) {
    // Inicia o saldo acumulado com o saldo inicial fornecido. Este valor será atualizado a cada coluna (período).
    let saldoAcumulado = saldoInicial;

    // Itera sobre cada coluna (mês ou ano) para calcular os totais verticalmente.
    colunasParaCalcular.forEach(coluna => {
        /**
         * Função auxiliar para obter o valor de uma classe da DRE para a coluna atual.
         * Retorna 0 se a classe ou o valor para aquela coluna não existir, evitando erros de 'undefined'.
         * @param {string} classe - O nome da linha da DRE (ex: '(+) Receita Bruta').
         * @returns {number} - O valor da classe para a coluna atual.
         */
        const getValor = (classe) => matrizDRE[classe]?.[coluna] || 0;

        // --- Cálculos de Resultados Operacionais ---

        // Calcula a Receita Líquida somando a Receita Bruta com as Deduções (que são negativas).
        const receitaLiquida = getValor('(+) Receita Bruta') + getValor('(-) Deduções');
        matrizDRE['(=) Receita Líquida'][coluna] = receitaLiquida;

        // Calcula a Geração de Caixa Operacional, que é o resultado da operação principal da empresa.
        const geracaoCaixa = receitaLiquida + getValor('(-) Custos') + getValor('(-) Despesas') + getValor('(+/-) IRPJ/CSLL');
        matrizDRE['(+/-) Geração de Caixa Operacional'][coluna] = geracaoCaixa;

        // --- Cálculos de Movimentações Não Operacionais ---

        // Soma todas as movimentações que não são da operação principal (financeiras, investimentos, etc.).
        const movimentacaoNaoOperacional = getValor('(+/-) Resultado Financeiro') + getValor('(+/-) Aportes/Retiradas') + getValor('(+/-) Investimentos') + getValor('(+/-) Empréstimos/Consórcios');
        
        // A movimentação total do mês é a soma do resultado operacional com o não operacional.
        const movimentacaoMensal = geracaoCaixa + movimentacaoNaoOperacional;
        matrizDRE['(=) Movimentação de Caixa Mensal'][coluna] = movimentacaoMensal;

        // --- Cálculos de Saldo de Caixa ---

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
 * Itera sobre uma lista de dados processados de várias fontes (contas bancárias, etc.)
 * e os consolida em uma única matrizDRE e matrizDepartamentos.
 * @param {object[]} listaDeDadosProcessados - Array de objetos, cada um contendo os dados de uma conta.
 * @returns {object} - Um objeto contendo { monthlyMerged, saldoBaseTotal, todasChaves }.
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
 * Calcula o saldo de caixa inicial para o primeiro período visível na tela.
 * Para isso, ele simula os cálculos de fluxo de caixa sobre todo o histórico de dados
 * ANTERIOR ao período visível para determinar com quanto caixa o período selecionado começou.
 * @param {object} monthlyDRE - A matriz DRE com todos os dados históricos mesclados.
 * @param {Set<string>} todasChaves - Um Set com todos os períodos históricos disponíveis.
 * @param {string[]} colunasVisiveis - As colunas (períodos) que estão atualmente visíveis para o usuário.
 * @param {number} saldoBaseTotal - A soma dos saldos iniciais de todas as contas.
 * @returns {number} - O valor do saldo inicial consolidado para o início do período visível.
 */
/**
 * Calcula o saldo de caixa inicial para um período de visualização específico.
 * * @param {object} monthlyDRE - Objeto com os dados financeiros mensais.
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
    
    // 2. Garante que as colunas visíveis também estejam ordenadas. ESSA É A CORREÇÃO PRINCIPAL.
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
        saldoAcumuladoAntesDoPeriodo += tempDRE['(=) Movimentação de Caixa Mensal']?.[periodo] || 0;
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
 * @returns {object} - Um objeto contendo { matrizDRE, matrizDepartamentos, saldoInicialPeriodo } prontos para renderização.
 */
function mergeMatrizes(listaDeDadosProcessados, modo, colunasVisiveis) {
    // Retorna um resultado vazio se não houver dados de entrada.
    if (!listaDeDadosProcessados || listaDeDadosProcessados.length === 0) {
        return { matrizDRE: {}, matrizDepartamentos: {}, saldoInicialPeriodo: 0 };
    }

    // ETAPA 1: Consolida todos os dados em uma base mensal.
    const { monthlyMerged, saldoBaseTotal, todasChaves } = mergeDadosMensais(listaDeDadosProcessados);

    // ETAPA 2: Calcula o saldo inicial correto para o primeiro período que será exibido.
    const saldoInicialPeriodo = calcularSaldoInicialPeriodo(monthlyMerged.matrizDRE, todasChaves, colunasVisiveis, saldoBaseTotal);

    // ETAPA 3: Agrega os dados mensalmente consolidados em anuais, se o modo for 'anual'.
    const dadosAntesDosTotais = (modo.toLowerCase() === 'anual')
        ? agregarDadosParaAnual(monthlyMerged)
        : monthlyMerged;

    // ETAPA 4: Calcula a coluna "TOTAL" somando os valores das colunas visíveis.
    calcularColunaTotalDRE(dadosAntesDosTotais.matrizDRE, colunasVisiveis);
    // (A lógica para a matrizDepartamentos seria similar, mas é mais complexa e opcional, conforme código original)

    // ETAPA 5: Finaliza a Matriz DRE, calculando as linhas de totais e saldos para as colunas visíveis e a coluna TOTAL.
    // Garante que as linhas de totalização existam antes do cálculo.
    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'].forEach(classe => {
        if (!dadosAntesDosTotais.matrizDRE[classe]) dadosAntesDosTotais.matrizDRE[classe] = {};
    });
    
    // Calcula as linhas de totais (Receita Líquida, Geração de Caixa, etc.) para os períodos visíveis.
    calcularLinhasDeTotalDRE(dadosAntesDosTotais.matrizDRE, colunasVisiveis, saldoInicialPeriodo);

    // Ajuste final para a coluna TOTAL das linhas de saldo, que são casos especiais.
    // O TOTAL do Caixa Inicial é o valor da primeira coluna visível.
    if (dadosAntesDosTotais.matrizDRE['Caixa Inicial']) {
        dadosAntesDosTotais.matrizDRE['Caixa Inicial'].TOTAL = dadosAntesDosTotais.matrizDRE['Caixa Inicial'][colunasVisiveis[0]] || 0;
    }
    // O TOTAL do Caixa Final é o valor da última coluna visível.
    if (dadosAntesDosTotais.matrizDRE['Caixa Final']) {
        dadosAntesDosTotais.matrizDRE['Caixa Final'].TOTAL = dadosAntesDosTotais.matrizDRE['Caixa Final'][colunasVisiveis[colunasVisiveis.length - 1]] || 0;
    }

    // Retorna o objeto final
    return { ...dadosAntesDosTotais, saldoInicialPeriodo };
}
export { processarLancamentos, extrairLancamentosDosTitulos, mergeMatrizes };






