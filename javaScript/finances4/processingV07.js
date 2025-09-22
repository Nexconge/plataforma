// processing.js

function filtrarContasESaldo(projetosMap, contasMap, filtroProjeto, filtroConta) {
    const contasFiltradas = new Set();
    let saldoBase = 0;

    filtroProjeto.forEach(idProjeto => {
        const projeto = projetosMap.get(idProjeto);
        if (!projeto) return;
        projeto.contas.forEach(codConta => {
            if (filtroConta.length === 0 || filtroConta.includes(codConta)) {
                contasFiltradas.add(codConta);
                const contaInfo = contasMap.get(String(codConta)); // Garantir que a chave é string
                if (contaInfo) {
                    saldoBase += Number(contaInfo.saldoIni) || 0;
                }
            }
        });
    });
    return { contasFiltradas, saldoBase };
}
function extrairLancamentosDosTitulos(titulos) {
    const lancamentosProcessados = [];

    // Garante que a entrada seja um array para evitar erros.
    if (!Array.isArray(titulos)) {
        console.error("A entrada para a função não é um array.", titulos);
        return lancamentosProcessados;
    }

    titulos.forEach(titulo => {
        // Valida se o título possui os dados mínimos necessários para o processamento.
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
            // MUDANÇA: Verifica se o array de departamentos original tem conteúdo.
            if (Array.isArray(titulo.Departamentos) && titulo.Departamentos.length > 0) {
                // Se tiver, processa normalmente.
                departamentosObj = titulo.Departamentos.map(depto => {
                    const valorRateio = lancamento.ValorLancamento * ((depto.PercDepto ?? 100) / 100);
                    return {
                        CodDpto: depto.CODDepto || 0,
                        ValorDepto: valorRateio
                    };
                });
            } else {
                // Se estiver vazio ou não existir, cria o departamento "Outros Departamentos" com o valor total.
                departamentosObj = [{
                    CodDpto: 0,
                    ValorDepto: lancamento.ValorLancamento
                }];
            }

            // 4. Monta o objeto de lançamento final no formato esperado.
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
        console.log(lancamentosProcessados);
    });

    return lancamentosProcessados;
}
function processarLancamentos(appCache, conta) {
    const matrizDRE = {}, matrizDepartamentos = {}, chavesComDados = new Set();
    const classesParaDetalhar = new Set([
        '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL',
        '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos', 
        '(+/-) Empréstimos/Consórcios'
    ]);
    appCache.lancamentos.forEach(lancamento => {
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
        const classeInfo = appCache.classesMap.get(codCategoria);
        const classe = classeInfo ? classeInfo.classe : 'Outros';

        // Matriz DRE
        if (!matrizDRE[classe]) matrizDRE[classe] = {};
        matrizDRE[classe][chaveAgregacao] = (matrizDRE[classe][chaveAgregacao] || 0) + valor;

        // Matriz Departamentos
        if (classesParaDetalhar.has(classe) && Array.isArray(lancamento.Departamentos) && lancamento.Departamentos.length > 0) {
            const fornecedor = lancamento.Cliente;
            
            lancamento.Departamentos.forEach(depto => {
                const codDepto = depto.CodDpto;
                let valorRateio = depto.ValorDepto;

                if (lancamento.Natureza === "P") {
                    valorRateio = -valorRateio;
                }
                const nomeDepto = appCache.departamentosMap.get(codDepto) || 'Outros Departamentos';
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

    Object.values(matrizDepartamentos).forEach(dep => {
        Object.values(dep.categorias).forEach(cat => {
            cat.fornecedores = Object.values(cat.fornecedores).sort((a, b) => b.total - a.total);
        });
    });

    return { matrizDRE, matrizDepartamentos, chavesComDados };
}
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

export { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE, extrairLancamentosDosTitulos, mergeMatrizes };






