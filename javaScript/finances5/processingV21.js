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
function _calcularLinhasDeResultadoDRE(matrizDRE, colunas, saldoInicial) {
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
/**
 * Mescla os dados processados de múltiplas contas em uma única estrutura de dados mensal.
 * @param {Array} listaDeDadosProcessados - Array com os dados processados de cada conta.
 * @returns {object} - Contém { mergedData, saldoBaseTotal, todasChaves }.
 */
function _mergeDadosMensais(listaDeDadosProcessados) {
    const mergedData = { matrizDRE: {}, matrizDepartamentos: {} };
    const todasChaves = new Set();
    let saldoBaseTotal = 0;

    listaDeDadosProcessados.forEach(dados => {
        saldoBaseTotal += dados.saldoIni || 0;
        dados.chavesComDados.forEach(chave => todasChaves.add(chave));

        // Mescla DRE
        for (const classe in dados.matrizDRE) {
            if (!mergedData.matrizDRE[classe]) mergedData.matrizDRE[classe] = {};
            for (const periodo in dados.matrizDRE[classe]) {
                mergedData.matrizDRE[classe][periodo] = (mergedData.matrizDRE[classe][periodo] || 0) + dados.matrizDRE[classe][periodo];
            }
        }
        
        // Mescla matrizDepartamentos (lógica complexa de deep merge)
        for (const chaveDepto in dados.matrizDepartamentos) {
            if (!mergedData.matrizDepartamentos[chaveDepto]) {
                mergedData.matrizDepartamentos[chaveDepto] = JSON.parse(JSON.stringify(dados.matrizDepartamentos[chaveDepto]));
            } else {
                const mergedDepto = mergedData.matrizDepartamentos[chaveDepto];
                const deptoData = dados.matrizDepartamentos[chaveDepto];
                for (const codCat in deptoData.categorias) {
                    // ... (resto da lógica de merge profundo dos departamentos) ...
                }
            }
        }
    });

    return { mergedData, saldoBaseTotal, todasChaves };
}
/**
 * Calcula o saldo inicial para o período visível, somando a movimentação de todos os meses anteriores.
 * @param {object} monthlyDRE - A matriz DRE mensal já mesclada.
 * @param {Set} todasChaves - Um Set com todas as chaves de período (ex: '01-2025').
 * @param {string} primeiraColunaVisivel - A primeira coluna do período que será exibido.
 * @param {number} saldoBaseTotal - A soma dos saldos iniciais de todas as contas.
 * @returns {number} - O saldo inicial calculado para o período.
 */
function _calcularSaldoInicialParaPeriodo(monthlyDRE, todasChaves, primeiraColunaVisivel, saldoBaseTotal) {
    const colunasHistoricasOrdenadas = Array.from(todasChaves).sort((a, b) => {
        const [mesA, anoA] = a.split('-'); const [mesB, anoB] = b.split('-');
        return new Date(anoA, mesA - 1) - new Date(anoB, mesB - 1);
    });

    const tempDRE = JSON.parse(JSON.stringify(monthlyDRE));
    _calcularLinhasDeResultadoDRE(tempDRE, colunasHistoricasOrdenadas, 0);
    
    let saldoAcumuladoAntesDoPeriodo = 0;
    for (const periodo of colunasHistoricasOrdenadas) {
        if (periodo === primeiraColunaVisivel) break;
        saldoAcumuladoAntesDoPeriodo += tempDRE['(=) Movimentação de Caixa Mensal']?.[periodo] || 0;
    }

    return saldoBaseTotal + saldoAcumuladoAntesDoPeriodo;
}
/**
 * Agrega os dados mensais em anuais.
 * @param {object} monthlyData - Os dados mensais mesclados.
 * @returns {object} - Os dados agregados por ano.
 */
function _agregarDadosParaAnual(monthlyData) {
    const annualData = { matrizDRE: {}, matrizDepartamentos: {} };
    
    // Agrega DRE
    for(const classe in monthlyData.matrizDRE) {
        annualData.matrizDRE[classe] = {};
        for(const periodoMensal in monthlyData.matrizDRE[classe]) {
            const ano = periodoMensal.split('-')[1];
            annualData.matrizDRE[classe][ano] = (annualData.matrizDRE[classe][ano] || 0) + monthlyData.matrizDRE[classe][periodoMensal];
        }
    }

    // Agrega Departamentos
    for(const chaveDepto in monthlyData.matrizDepartamentos) {
        // ... (lógica de agregação anual para departamentos) ...
    }

    return annualData;
}
/**
 * Adiciona uma propriedade 'TOTAL' a cada linha da matriz, somando as colunas visíveis.
 * @param {object} matriz - A matriz de dados (DRE ou Departamentos).
 * @param {string[]} colunasVisiveis - As colunas que devem ser somadas.
 */
function _calcularColunaTotal(matriz) {
    Object.values(matriz).forEach(periodos => {
        periodos.TOTAL = colunasVisiveis.reduce((acc, coluna) => acc + (periodos[coluna] || 0), 0);
    });
}
/**
 * Calcula as linhas de resultado e ajusta a coluna TOTAL para os saldos.
 * @param {object} matrizDRE - A matriz DRE final.
 * @param {string[]} colunasVisiveis - As colunas que serão exibidas.
 * @param {number} saldoInicialPeriodo - O saldo inicial para o período.
 */
function _finalizarMatrizDRE(matrizDRE, colunasVisiveis, saldoInicialPeriodo) {
    _calcularLinhasDeResultadoDRE(matrizDRE, colunasVisiveis, saldoInicialPeriodo);

    // Ajusta o TOTAL das linhas de saldo, que são casos especiais
    if (matrizDRE['Caixa Inicial']) {
        matrizDRE['Caixa Inicial'].TOTAL = matrizDRE['Caixa Inicial'][colunasVisiveis[0]] || 0;
    }
    if (matrizDRE['Caixa Final']) {
        matrizDRE['Caixa Final'].TOTAL = matrizDRE['Caixa Final'][colunasVisiveis[colunasVisiveis.length - 1]] || 0;
    }
}
/**
 * Orquestra a mesclagem, cálculo e agregação dos dados de múltiplas contas para exibição.
 * @param {Array} listaDeDadosProcessados - Dados processados de cada conta.
 * @param {string} modo - 'mensal' ou 'anual'.
 * @param {string[]} colunasVisiveis - As colunas a serem exibidas.
 * @returns {object} - Os dados finais prontos para renderização.
 */
function mergeMatrizes(listaDeDadosProcessados, modo, colunasVisiveis) {
    if (!listaDeDadosProcessados || listaDeDadosProcessados.length === 0) {
        return { matrizDRE: {}, matrizDepartamentos: {}, saldoInicialPeriodo: 0 };
    }

    // ETAPA 1: Mescla todos os dados das contas em uma base mensal.
    const { mergedData: monthlyData, saldoBaseTotal, todasChaves } = _mergeDadosMensais(listaDeDadosProcessados);

    // ETAPA 2: Calcula o saldo inicial correto para o período visível.
    const saldoInicialPeriodo = _calcularSaldoInicialParaPeriodo(monthlyData.matrizDRE, todasChaves, colunasVisiveis[0], saldoBaseTotal);

    // ETAPA 3: Agrega os dados anualmente, se necessário.
    const dataBeforeTotals = (modo.toLowerCase() === 'anual')
        ? _agregarDadosParaAnual(monthlyData)
        : monthlyData;

    // ETAPA 4: Calcula a coluna TOTAL para os dados já agregados.
    _calcularColunaTotal(dataBeforeTotals.matrizDRE, colunasVisiveis);
    // Opcional: Implementar o cálculo de TOTAL para a matrizDepartamentos se necessário.

    // ETAPA 5: Finaliza a Matriz DRE (calcula linhas de totais e saldos).
    _finalizarMatrizDRE(dataBeforeTotals.matrizDRE, colunasVisiveis, saldoInicialPeriodo);

    return { ...dataBeforeTotals, saldoInicialPeriodo };
}

export { processarLancamentos, extrairLancamentosDosTitulos, mergeMatrizes };






