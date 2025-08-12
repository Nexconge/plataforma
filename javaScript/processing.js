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

        if (Number(ano) < primeiroAno) {
            saldoInicialPeriodo += lancamento.ValorLancamento;
            return;
        }
        if (!anosParaProcessar.includes(ano)) return;

        const anoMes = `${mes.padStart(2, '0')}-${ano}`;
        const chaveAgregacao = (modo.toLowerCase() === 'anual') ? ano : anoMes;
        chavesComDados.add(chaveAgregacao);

        const codCategoria = lancamento.CODCategoria || 'SemCategoria';
        const classe = appCache.classesMap.get(codCategoria) || 'Outros';

        if (!matrizDRE[classe]) matrizDRE[classe] = {};
        matrizDRE[classe][chaveAgregacao] = (matrizDRE[classe][chaveAgregacao] || 0) + lancamento.ValorLancamento;

        if (classe === '(-) Custos' || classe === '(-) Despesas') {
            const fornecedor = appCache.fornecedoresMap.get(lancamento.CODCliente) || `Fornecedor ${lancamento.CODCliente}`;

            // --- NOVO TRECHO ---
            if (lancamento.Departamentos && typeof lancamento.Departamentos === 'string') {
                lancamento.Departamentos.split(',').forEach(pair => {
                    const [codigo, valorStr] = pair.split(':');
                    const codDepto = Number(codigo);
                    const valorRateio = Number(valorStr) || 0;
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
        const receitaLiquida = getValor('(+) Receita Bruta') + getValor('(-) Deduções');
        matrizDRE['(=) Receita Líquida'] ??= {};
        matrizDRE['(=) Receita Líquida'][coluna] = receitaLiquida;
        const geracaoCaixa = receitaLiquida + getValor('(-) Custos') + getValor('(-) Despesas') + getValor('(+/-) IRPJ/CSLL');
        matrizDRE['(+/-) Geração de Caixa Operacional'] ??= {};
        matrizDRE['(+/-) Geração de Caixa Operacional'][coluna] = geracaoCaixa;
        const movimentacaoMensal = geracaoCaixa + getValor('(+/-) Resultado Financeiro') + getValor('(+/-) Aportes/Retiradas') + getValor('(+/-) Investimentos') + getValor('(+/-) Empréstimos/Consórcios');
        matrizDRE['(=) Movimentação de Caixa Mensal'] ??= {};
        matrizDRE['(=) Movimentação de Caixa Mensal'][coluna] = movimentacaoMensal;
        matrizDRE['Caixa Inicial'] ??= {};
        matrizDRE['Caixa Final'] ??= {};
        if (chavesComDados.has(coluna)) {
            matrizDRE['Caixa Inicial'][coluna] = saldoAcumulado;
            const variacaoCaixa = movimentacaoMensal + getValor('Entrada de Transferência') + getValor('Saída de Transferência') + getValor('Outros');
            saldoAcumulado += variacaoCaixa;
            matrizDRE['Caixa Final'][coluna] = saldoAcumulado;
        } else {
            matrizDRE['Caixa Inicial'][coluna] = 0;
            matrizDRE['Caixa Final'][coluna] = 0;
        }
    });
}

export { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE };