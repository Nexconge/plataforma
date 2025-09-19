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

        // 1. Mapeia o campo "Natureza" para "Origem".
        // O script de processamento ('processingV13.js') verifica se a Origem termina com "P"
        // para negativar o valor. Esta lógica garante a compatibilidade.
        // "R" (Receita) resulta em um valor positivo, "P" (Pagamento) em um negativo.
        const origem = titulo.Natureza === 'P' ? 'EXTR_P' : 'EXTR_R';

        // 2. Itera sobre cada lançamento individual dentro do título.
        titulo.Lancamentos.forEach(lancamento => {
            if (!lancamento.DataLancamento || !lancamento.CODContaC || typeof lancamento.ValorLancamento === 'undefined') {
                console.warn("Lançamento individual inválido ou com dados faltando:", lancamento);
                return; // Pula para o próximo lançamento.
            }

            // 3. Processa e formata os Departamentos.
            // O formato de destino é uma string como "CODIGO1:VALOR1,CODIGO2:VALOR2".
            let departamentosStr = "";
            if (Array.isArray(titulo.Departamentos)) {
                const deptosArray = titulo.Departamentos.map(depto => {
                    if (!depto.CODDepto || typeof depto.PercDepto === 'undefined') {
                        return null; // Ignora departamentos malformados.
                    }
                    // Calcula o valor absoluto do rateio para este lançamento específico.
                    const valorRateio = lancamento.ValorLancamento * (depto.PercDepto / 100);
                    return `${depto.CODDepto}:${valorRateio}`;
                }).filter(Boolean); // Remove quaisquer entradas nulas.

                departamentosStr = deptosArray.join(',');
            }

            // 4. Monta o objeto de lançamento final no formato esperado.
            lancamentosProcessados.push({
                Origem: origem,
                DataLancamento: lancamento.DataLancamento,
                CODContaC: lancamento.CODContaC,
                ValorLancamento: lancamento.ValorLancamento,
                CODCategoria: titulo.Categoria,
                Cliente: titulo.Cliente,
                Departamentos: departamentosStr
            });
        });
    });

    return lancamentosProcessados;
}

function processarLancamentos(appCache, modo, anosParaProcessar, contasFiltradas, saldoBase) {
    const matrizDRE = {}, matrizDepartamentos = {}, chavesComDados = new Set();
    
    if (anosParaProcessar.length === 0) {
        return { matrizDRE, matrizDepartamentos, saldoInicialPeriodo: saldoBase, chavesComDados };
    }

    const primeiroAno = Math.min(...anosParaProcessar.map(Number));
    let saldoInicialPeriodo = saldoBase;

    const classesParaDetalhar = new Set([
        '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL',
        '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos', 
        '(+/-) Empréstimos/Consórcios'
    ]);

    appCache.lancamentos.forEach(lancamento => {
        if (!lancamento || !lancamento.DataLancamento || !lancamento.CODContaC) {
            return; 
        }

        const codConta = String(lancamento.CODContaC).trim();
        if (!contasFiltradas.has(codConta)) return;

        const partesData = lancamento.DataLancamento.split('/');
        if (partesData.length !== 3) return; 

        const [dia, mesRaw, ano] = partesData;
        const mes = mesRaw.padStart(2, '0');   // 🔥 garante sempre 2 dígitos
        const anoMes = `${mes}-${ano}`;
        const chaveAgregacao = (modo.toLowerCase() === 'anual') ? ano : anoMes;

        let valor = lancamento.ValorLancamento;
        if (lancamento.Origem.slice(-1) === "P") {
            valor = -valor;
        }

        if (Number(ano) < primeiroAno) {
            saldoInicialPeriodo += valor;
        } else if (anosParaProcessar.includes(ano)) {
            chavesComDados.add(chaveAgregacao);

            const codCategoria = lancamento.CODCategoria || 'SemCategoria';
            const classeInfo = appCache.classesMap.get(codCategoria);
            const classe = classeInfo ? classeInfo.classe : 'Outros';

            // Matriz DRE
            if (!matrizDRE[classe]) matrizDRE[classe] = {};
            matrizDRE[classe][chaveAgregacao] = (matrizDRE[classe][chaveAgregacao] || 0) + valor;

            // Matriz Departamentos
            if (classesParaDetalhar.has(classe) && lancamento.Departamentos && typeof lancamento.Departamentos === 'string') {
                const fornecedor = lancamento.Cliente;
                
                lancamento.Departamentos.split(',').forEach(pair => {
                    const [codigo, valorStr] = pair.split(':');
                    if (!codigo || !valorStr) return;

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

export { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE, extrairLancamentosDosTitulos};