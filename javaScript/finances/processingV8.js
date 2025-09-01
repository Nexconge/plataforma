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
    const matrizDRE = {}, chavesComDados = new Set();
    const colunas = (modo.toLowerCase() === 'anual') ? [...anosParaProcessar].sort() : Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}-${anosParaProcessar[0]}`);
    
    // Lista de todas as classes que queremos detalhar na tabela de departamentos.
    const classesParaDetalhar = [
        '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL',
        '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos',
        '(+/-) Empréstimos/Consórcios'
    ];

    // Cria dinamicamente a estrutura para armazenar os dados de cada classe.
    const matrizDepartamentos = classesParaDetalhar.reduce((acc, classe) => {
        acc[classe] = { deptoMap: new Map(), totaisMensais: Array(colunas.length).fill(0), totalGeral: 0 };
        return acc;
    }, {});
    
    // Se não houver anos para processar, retorna estruturas vazias
    if (anosParaProcessar.length === 0) {
        return { matrizDRE, matrizDepartamentos, saldoInicialPeriodo: saldoBase, chavesComDados };
    }
    
    const primeiroAno = Math.min(...anosParaProcessar.map(Number));
    let saldoInicialPeriodo = saldoBase;
    appCache.lancamentos.forEach(lanc => {
        const lancAno = lanc.data.substring(0, 4);
        if (Number(lancAno) < primeiroAno) {
            if (contasFiltradas.has(lanc.codConta)) {
                saldoInicialPeriodo += Number(lanc.valor);
            }
        }
    });

    appCache.lancamentos.forEach(lanc => {
        const lancAno = lanc.data.substring(0, 4);
        if (!anosParaProcessar.includes(lancAno) || !contasFiltradas.has(lanc.codConta)) {
            return;
        }

        const coluna = (modo.toLowerCase() === 'anual') ? lancAno : lanc.data.substring(5, 7) + '-' + lancAno;
        const classeInfo = appCache.classesMap.get(lanc.codCategoria);
        if (!classeInfo) return;

        chavesComDados.add(classeInfo.classe);
        matrizDRE[classeInfo.classe] = matrizDRE[classeInfo.classe] || {};
        matrizDRE[classeInfo.classe][coluna] = (matrizDRE[classeInfo.classe][coluna] || 0) + lanc.valor;
        
        const grupo = matrizDepartamentos[classeInfo.classe];
        if(grupo && lanc.codDepartamento) {
            const nomeDepto = appCache.departamentosMap.get(lanc.codDepartamento) || 'Departamento Desconhecido';
            const deptoKey = `${nomeDepto}|${classeInfo.classe}`;

            if (!grupo.deptoMap.has(deptoKey)) {
                grupo.deptoMap.set(deptoKey, {
                    nome: nomeDepto,
                    classe: classeInfo.classe,
                    categorias: {}
                });
            }
            const depto = grupo.deptoMap.get(deptoKey);

            if (!depto.categorias[lanc.codCategoria]) {
                depto.categorias[lanc.codCategoria] = { valores: {}, fornecedores: [] };
            }
            const categoria = depto.categorias[lanc.codCategoria];

            categoria.valores[coluna] = (categoria.valores[coluna] || 0) + lanc.valor;

            let fornecedor = categoria.fornecedores.find(f => f.fornecedor === lanc.fornecedor);
            if (!fornecedor) {
                fornecedor = { fornecedor: lanc.fornecedor, valores: {} };
                categoria.fornecedores.push(fornecedor);
            }
            fornecedor.valores[coluna] = (fornecedor.valores[coluna] || 0) + lanc.valor;
            
            // Atualiza os totais da classe
            const colIndex = colunas.indexOf(coluna);
            if (colIndex !== -1) {
                grupo.totaisMensais[colIndex] += lanc.valor;
                grupo.totalGeral += lanc.valor;
            }
        }
    });
    
    // Retorna a nova estrutura de dados em vez da matrizDepartamentos
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