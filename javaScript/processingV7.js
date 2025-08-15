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

function processarLancamentos(appCache, modo, anosParaProcessar, contasFiltradas, saldoBase) {
    const matrizDRE = {}, matrizDepartamentos = {}, chavesComDados = new Set();
    if (anosParaProcessar.length === 0) {
        return { matrizDRE, matrizDepartamentos, saldoInicialPeriodo: saldoBase, chavesComDados };
    }
    const primeiroAno = Math.min(...anosParaProcessar.map(Number));
    let saldoInicialPeriodo = saldoBase;

    appCache.lancamentos.forEach(lancamento => {
        const codConta = String(lancamento.CODContaC).trim();
        if (!contasFiltradas.has(codConta)) return;
        const [dia, mes, ano] = lancamento.DataLancamento.split('/');

        let valor = lancamento.ValorLancamento;
        if (lancamento.Origem.slice(-1) === "P") {
            valor = -valor;
        }

        if (Number(ano) < primeiroAno) {
            saldoInicialPeriodo += valor;
            return;
        }
        if (!anosParaProcessar.includes(ano)) return;

        const anoMes = `${mes.padStart(2, '0')}-${ano}`;
        const chaveAgregacao = (modo.toLowerCase() === 'anual') ? ano : anoMes;
        chavesComDados.add(chaveAgregacao);

        const codCategoria = lancamento.CODCategoria || 'SemCategoria';
        const classeInfo = appCache.classesMap.get(codCategoria);
        const classe = classeInfo ? classeInfo.classe : 'Outros';

        if (!matrizDRE[classe]) matrizDRE[classe] = {};
        matrizDRE[classe][chaveAgregacao] = (matrizDRE[classe][chaveAgregacao] || 0) + valor;

        if (classe === '(-) Custos' || classe === '(-) Despesas') {
            const fornecedor = lancamento.Cliente;

            // --- NOVO TRECHO ---
            if (lancamento.Departamentos && typeof lancamento.Departamentos === 'string') {
                lancamento.Departamentos.split(',').forEach(pair => {
                    const [codigo, valorStr] = pair.split(':');
                    const codDepto = Number(codigo);
                    let valorRateio = Number(valorStr) || 0;
                    if (lancamento.Origem.slice(-1) === "P") {
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
        }
    });

    Object.values(matrizDepartamentos).forEach(dep => {
        Object.values(dep.categorias).forEach(cat => {
            cat.fornecedores = Object.values(cat.fornecedores).sort((a, b) => b.total - a.total);
        });
    });

    return { matrizDRE, matrizDepartamentos, saldoInicialPeriodo, chavesComDados };
}


function calcularTotaisDRE(matrizDRE, colunas, saldoInicial, chavesComDados) {
    let saldoAcumulado = saldoInicial;

    colunas.forEach(coluna => {
        const getValor = (classe) => matrizDRE[classe]?.[coluna] || 0;

        // Cálculos intermediários (sem alterações)
        const receitaLiquida = getValor('(+) Receita Bruta') + getValor('(-) Deduções');
        matrizDRE['(=) Receita Líquida'] ??= {};
        matrizDRE['(=) Receita Líquida'][coluna] = receitaLiquida;

        const geracaoCaixa = receitaLiquida + getValor('(-) Custos') + getValor('(-) Despesas') + getValor('(+/-) IRPJ/CSLL');
        matrizDRE['(+/-) Geração de Caixa Operacional'] ??= {};
        matrizDRE['(+/-) Geração de Caixa Operacional'][coluna] = geracaoCaixa;

        const movimentacaoNaoOperacional = getValor('(+/-) Resultado Financeiro') + getValor('(+/-) Aportes/Retiradas') + getValor('(+/-) Investimentos') + getValor('(+/-) Empréstimos/Consórcios');

        const movimentacaoMensal = geracaoCaixa + movimentacaoNaoOperacional;
        matrizDRE['(=) Movimentação de Caixa Mensal'] ??= {};
        matrizDRE['(=) Movimentação de Caixa Mensal'][coluna] = movimentacaoMensal;

        // 2. Define o Caixa Inicial da coluna atual
        matrizDRE['Caixa Inicial'] ??= {};
        matrizDRE['Caixa Inicial'][coluna] = saldoAcumulado;

        // 3. A variação REAL do caixa inclui a movimentação mensal E as transferências/outros.
        const variacaoCaixaTotal = movimentacaoMensal + getValor('Entrada de Transferência') + getValor('Saída de Transferência') + getValor('Outros');

        // 4. Atualiza o saldo acumulado com a variação TOTAL para o próximo período.
        saldoAcumulado += variacaoCaixaTotal;

        // 5. Define o Caixa Final da coluna atual
        matrizDRE['Caixa Final'] ??= {};
        matrizDRE['Caixa Final'][coluna] = saldoAcumulado;
    });
}

export { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE };