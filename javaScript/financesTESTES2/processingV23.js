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
function calcularTotaisDRE(matrizDRE, colunasVisiveis, saldoInicial) {
    let saldoAcumulado = saldoInicial;
    const saldosPorColuna = {};
    //Colunas visiveis tem formato (MM-AAAA)
    colunasVisiveis.forEach(coluna => {
        const getValor = (classe) => matrizDRE[classe]?.[coluna] || 0;
        const receitaLiquida = getValor('(+) Receita Bruta') + getValor('(-) Deduções');
        matrizDRE['(=) Receita Líquida'][coluna] = receitaLiquida;
        const geracaoCaixa =
            receitaLiquida +
            getValor('(-) Custos') +
            getValor('(-) Despesas') +
            getValor('(+/-) IRPJ/CSLL');
        matrizDRE['(+/-) Geração de Caixa Operacional'][coluna] = geracaoCaixa;
        const movimentacaoNaoOperacional =
            getValor('(+/-) Resultado Financeiro') +
            getValor('(+/-) Aportes/Retiradas') +
            getValor('(+/-) Investimentos') +
            getValor('(+/-) Empréstimos/Consórcios');
        const movimentacaoMensal = geracaoCaixa + movimentacaoNaoOperacional;
        matrizDRE['(=) Movimentação de Caixa Mensal'][coluna] = movimentacaoMensal;
        matrizDRE['Caixa Inicial'][coluna] = saldoAcumulado;
        const variacaoCaixaTotal =
            movimentacaoMensal +
            getValor('Entrada de Transferência') +
            getValor('Saída de Transferência') +
            getValor('Outros');
        saldoAcumulado += variacaoCaixaTotal;
        matrizDRE['Caixa Final'][coluna] = saldoAcumulado;
        // Guarda o saldo final da coluna (para reuso depois)
        saldosPorColuna[coluna] = { saldoInicial: matrizDRE['Caixa Inicial'][coluna], saldoFinal: saldoAcumulado };
    });

    return saldosPorColuna;
}
function mergeMatrizes(listaDeDadosProcessados, modo, colunasVisiveis) {
    if (!listaDeDadosProcessados || listaDeDadosProcessados.length === 0) {
        return { matrizDRE: {}, matrizDepartamentos: {}, saldoInicialPeriodo: 0 };
    }

    // ETAPA 1: Merge mensal
    const { dadosMensais, chavesMesAno, saldoBaseTotal } = mergeDadosMensais(listaDeDadosProcessados);
    const colunasHistoricasOrdenadas = Array.from(chavesMesAno).sort((a, b) => {
        const [mesA, anoA] = a.split('-');
        const [mesB, anoB] = b.split('-');
        return new Date(anoA, mesA - 1) - new Date(anoB, mesB - 1);
    });
    const tempDRE = JSON.parse(JSON.stringify(dadosMensais.matrizDRE));
    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', 
    '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final']
    .forEach(classe => {
        if (!tempDRE[classe]) tempDRE[classe] = {};
    });
    
    // ETAPA 2: Saldo inicial
    const saldosPorColuna = calcularTotaisDRE(tempDRE, colunasHistoricasOrdenadas, 0);
    const primeiraColunaVisivel = colunasVisiveis[0];
    const saldoInicialPeriodo = saldoBaseTotal + (saldosPorColuna[primeiraColunaVisivel]?.saldoInicial || 0);

    // ETAPA 3: Agregação anual (se necessário)
    const dadosAgregados = (modo.toLowerCase() === 'anual')
        ? agregarDadosAnuais(dadosMensais)
        : dadosMensais;

    // ETAPA 4: Coluna TOTAL
    Object.values(dadosAgregados.matrizDRE).forEach(periodos => {
        periodos.TOTAL = colunasVisiveis.reduce((acc, coluna) => acc + (periodos[coluna] || 0), 0);
    });

    // ETAPA 5: Totais e saldos finais
    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional',
     '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final']
    .forEach(classe => {
        if (!dadosAgregados.matrizDRE[classe]) dadosAgregados.matrizDRE[classe] = {};
    });

    // Ajuste final do TOTAL para linhas especiais
    if (dadosAgregados.matrizDRE['Caixa Inicial']) {
        matrizDRE['Caixa Inicial'].TOTAL = dadosAgregados.matrizDRE['Caixa Inicial'][colunasVisiveis[0]] || 0;
    }
    if (dadosAgregados.matrizDRE['Caixa Final']) {
        matrizDRE['Caixa Final'].TOTAL = dadosAgregados.matrizDRE['Caixa Final'][colunasVisiveis[colunasVisiveis.length - 1]] || 0;
    }
    return { ...dadosAgregados, saldoInicialPeriodo };
}

function mergeDadosMensais(listaDeDadosProcessados) {
    const dadosMensais = { matrizDRE: {}, matrizDepartamentos: {} };
    const chavesMesAno = new Set();

    const saldoBaseTotal = listaDeDadosProcessados.reduce((acc, dados) => {
        dados.chavesComDados.forEach(chave => chavesMesAno.add(chave));
        mesclarMatrizDRE(dadosMensais.matrizDRE, dados.matrizDRE);
        mesclarMatrizDepartamentos(dadosMensais.matrizDepartamentos, dados.matrizDepartamentos);
        return acc + (dados.saldoIni || 0);
    }, 0);

    return { dadosMensais, chavesMesAno, saldoBaseTotal };
}

function mesclarMatrizDRE(destino, origem) {
    for (const classe in origem) {
        if (!destino[classe]) destino[classe] = {};
        for (const periodo in origem[classe]) {
            destino[classe][periodo] = (destino[classe][periodo] || 0) + origem[classe][periodo];
        }
    }
}

function mesclarMatrizDepartamentos(destino, origem) {
    for (const chaveDepto in origem) {
        if (!destino[chaveDepto]) {
            destino[chaveDepto] = JSON.parse(JSON.stringify(origem[chaveDepto]));
        } else {
            const mergedDepto = destino[chaveDepto];
            const deptoData = origem[chaveDepto];
            for (const codCat in deptoData.categorias) {
                if (!mergedDepto.categorias[codCat]) {
                    mergedDepto.categorias[codCat] = JSON.parse(JSON.stringify(deptoData.categorias[codCat]));
                } else {
                    mesclarCategoria(mergedDepto.categorias[codCat], deptoData.categorias[codCat]);
                }
            }
        }
    }
}

function mesclarCategoria(mergedCat, catData) {
    for (const periodo in catData.valores) {
        mergedCat.valores[periodo] = (mergedCat.valores[periodo] || 0) + catData.valores[periodo];
    }
    for (const forn in catData.fornecedores) {
        if (!mergedCat.fornecedores[forn]) {
            mergedCat.fornecedores[forn] = JSON.parse(JSON.stringify(catData.fornecedores[forn]));
        } else {
            mergedCat.fornecedores[forn].total += catData.fornecedores[forn].total;
            for (const periodo in catData.fornecedores[forn].valores) {
                mergedCat.fornecedores[forn].valores[periodo] =
                    (mergedCat.fornecedores[forn].valores[periodo] || 0) +
                    catData.fornecedores[forn].valores[periodo];
            }
        }
    }
}

function agregarDadosAnuais(dadosMensais) {
    const annualData = { matrizDRE: {}, matrizDepartamentos: {} };

    // DRE
    for (const classe in dadosMensais.matrizDRE) {
        annualData.matrizDRE[classe] = {};
        for (const periodoMensal in dadosMensais.matrizDRE[classe]) {
            const ano = periodoMensal.split('-')[1];
            annualData.matrizDRE[classe][ano] =
                (annualData.matrizDRE[classe][ano] || 0) + dadosMensais.matrizDRE[classe][periodoMensal];
        }
    }

    // Departamentos
    for (const chaveDepto in dadosMensais.matrizDepartamentos) {
        const deptoData = dadosMensais.matrizDepartamentos[chaveDepto];
        annualData.matrizDepartamentos[chaveDepto] = JSON.parse(JSON.stringify(deptoData));
        const annualDepto = annualData.matrizDepartamentos[chaveDepto];
        for (const codCat in annualDepto.categorias) {
            const catData = annualDepto.categorias[codCat];
            catData.valores = agruparPorAno(catData.valores);
            for (const forn in catData.fornecedores) {
                catData.fornecedores[forn].valores = agruparPorAno(catData.fornecedores[forn].valores);
            }
        }
    }
    return annualData;
}

function agruparPorAno(valoresMensais) {
    const valoresAnuais = {};
    for (const periodoMensal in valoresMensais) {
        const ano = periodoMensal.split('-')[1];
        valoresAnuais[ano] = (valoresAnuais[ano] || 0) + valoresMensais[periodoMensal];
    }
    return valoresAnuais;
}



export { processarLancamentos, extrairLancamentosDosTitulos, mergeMatrizes };






