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
//Calcula os valores para as classes totalizadoras matriz de DRE
function calcularTotaisDRE(matrizDRE, colunas, saldoInicial) {
    let saldoAcumulado = saldoInicial;
    colunas.forEach(coluna => {
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
function mergeMatrizes(listaDeDadosProcessados, modo, colunasVisiveis) {
    const monthlyMerged = { matrizDRE: {}, matrizDepartamentos: {} };
    const todasChaves = new Set();

    if (!listaDeDadosProcessados || listaDeDadosProcessados.length === 0) {
        return { matrizDRE: {}, matrizDepartamentos: {}, saldoInicialPeriodo: 0 };
    }

    // ETAPA 1: Merge de todos os dados das contas em um único conjunto de dados MENSAIS
    const saldoBaseTotal = listaDeDadosProcessados.reduce((acc, dados) => {
        dados.chavesComDados.forEach(chave => todasChaves.add(chave));

        // Mescla DRE
        for (const classe in dados.matrizDRE) {
            if (!monthlyMerged.matrizDRE[classe]) monthlyMerged.matrizDRE[classe] = {};
            for (const periodo in dados.matrizDRE[classe]) {
                monthlyMerged.matrizDRE[classe][periodo] = (monthlyMerged.matrizDRE[classe][periodo] || 0) + dados.matrizDRE[classe][periodo];
            }
        }
        
        // Mescla matrizDepartamentos
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

    // ETAPA 2: Cálculo do Saldo Inicial para o período visível
    const colunasHistoricasOrdenadas = Array.from(todasChaves).sort((a, b) => {
        const [mesA, anoA] = a.split('-'); const [mesB, anoB] = b.split('-');
        return new Date(anoA, mesA - 1) - new Date(anoB, mesB - 1);
    });

    const tempDRE = JSON.parse(JSON.stringify(monthlyMerged.matrizDRE));
    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'].forEach(classe => {
        if (!tempDRE[classe]) tempDRE[classe] = {};
    });
    calcularTotaisDRE(tempDRE, colunasHistoricasOrdenadas, 0); // Roda sobre todos os dados históricos com saldo base zero
    
    let saldoAcumuladoAntesDoPeriodo = 0;
    const primeiraColunaVisivel = colunasVisiveis[0];
    for (const periodo of colunasHistoricasOrdenadas) {
        if (periodo === primeiraColunaVisivel) break;
        saldoAcumuladoAntesDoPeriodo += tempDRE['(=) Movimentação de Caixa Mensal']?.[periodo] || 0;
    }
    const saldoInicialPeriodo = saldoBaseTotal + saldoAcumuladoAntesDoPeriodo;

    // ETAPA 3: Agregação Anual (se necessário)
    const dataBeforeTotals = (modo.toLowerCase() === 'anual') ? (() => {
        const annualData = { matrizDRE: {}, matrizDepartamentos: {} };
        for(const classe in monthlyMerged.matrizDRE) {
            annualData.matrizDRE[classe] = {};
            for(const periodoMensal in monthlyMerged.matrizDRE[classe]) {
                const ano = periodoMensal.split('-')[1];
                annualData.matrizDRE[classe][ano] = (annualData.matrizDRE[classe][ano] || 0) + monthlyMerged.matrizDRE[classe][periodoMensal];
            }
        }
        for(const chaveDepto in monthlyMerged.matrizDepartamentos) {
            const deptoData = monthlyMerged.matrizDepartamentos[chaveDepto];
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
    })() : monthlyMerged;

    // ETAPA 4: Cálculo da Coluna TOTAL para os dados já agregados
    Object.values(dataBeforeTotals.matrizDRE).forEach(periodos => {
        periodos.TOTAL = colunasVisiveis.reduce((acc, coluna) => acc + (periodos[coluna] || 0), 0);
    });
    // (A lógica para a matrizDepartamentos seria similar, mas é mais complexa e opcional)

    // ETAPA 5: Finalização da Matriz DRE (Cálculo das linhas de totais e saldos para as colunas visiveis)
    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'].forEach(classe => {
        if (!dataBeforeTotals.matrizDRE[classe]) dataBeforeTotals.matrizDRE[classe] = {};
    });
    calcularTotaisDRE(dataBeforeTotals.matrizDRE, colunasVisiveis, saldoInicialPeriodo);

    // Ajuste final para a coluna TOTAL das linhas de saldo, que são casos especiais
    if (dataBeforeTotals.matrizDRE['Caixa Inicial']) {
        dataBeforeTotals.matrizDRE['Caixa Inicial'].TOTAL = dataBeforeTotals.matrizDRE['Caixa Inicial'][colunasVisiveis[0]] || 0;
    }
    if (dataBeforeTotals.matrizDRE['Caixa Final']) {
        dataBeforeTotals.matrizDRE['Caixa Final'].TOTAL = dataBeforeTotals.matrizDRE['Caixa Final'][colunasVisiveis[colunasVisiveis.length - 1]] || 0;
    }

    return { ...dataBeforeTotals, saldoInicialPeriodo };
}

export { processarLancamentos, extrairLancamentosDosTitulos, mergeMatrizes };






