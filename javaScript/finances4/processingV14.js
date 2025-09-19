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
                const contaInfo = contasMap.get(codConta); // Garantir que a chave é string
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

            // 3. Processa e formata os Departamentos
            //Cria o array vazio
            let departamentosArray = [];
            if (Array.isArray(titulo.Departamentos)) {
                departamentosArray = titulo.Departamentos.map(depto => {
                    if (!depto.CODDepto || typeof depto.PercDepto === 'undefined') {
                        return null; // Ignora departamentos malformados.
                    }
                    
                    // Calcula o valor do lançamento dentro do departamento
                    const valorRateio = lancamento.ValorLancamento * (depto.PercDepto / 100);
                    return {
                        CodDepto: depto.CODDepto,
                        ValDepto: valorRateio
                    };
                }).filter(Boolean); // Remove quaisquer entradas nulas.
            }

            // 4. Monta o objeto de lançamento final no formato esperado.
            lancamentosProcessados.push({
                Natureza: titulo.Natureza,
                DataLancamento: lancamento.DataLancamento,
                CODContaC: lancamento.CODContaC,
                ValorLancamento: lancamento.ValorLancamento,
                CODCategoria: titulo.Categoria,
                Cliente: titulo.Cliente,
                Departamentos: departamentosArray
            });
        });
    });
    return lancamentosProcessados;
}

function processarLancamentos(appCache, contasFiltradas, novosLancamentos) {
    const matrizDRE = {}, matrizDepartamentos = {}, chavesComDados = new Set();
    
    //Define as classes a serem detalhadas na tabela de departamentos
    const classesParaDetalhar = new Set([
        '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL',
        '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos', 
        '(+/-) Empréstimos/Consórcios'
    ]);

    //Para cada novo lançamento, processa e agrega os dados;  
    novosLancamentos.forEach(lancamento => {
        if (!lancamento || !lancamento.DataLancamento || !lancamento.CODContaC) {
            return; 
        }
        
        //Verifica se o lançamento pertence a uma conta filtrada para evitar repetições em caso
        //de titulos com lançamentos em múltiplas contas
        const codConta = lancamento.CODContaC;
        if (!contasFiltradas.has(codConta)) return;

        //Extrai mes e ano do lançamento para agregar na matriz
        const [dia, mesRaw, ano] = lancamento.DataLancamento.split('/');
        const mes = String(mesRaw).padStart(2, '0');
        const mesAno = `${mes}-${ano}`;

        //Define se o valor é negativo ou positivo com base na natureza do título
        let valor = lancamento.ValorLancamento;
        if (lancamento.Natureza === "P") {
            valor = -valor;
        }
        //Agrega os dados na matriz DRE e na matriz de Departamentos
        chavesComDados.add(mesAno);

        //Extrai dados de classe e categoria do mapa  
        const codCategoria = lancamento.CODCategoria || 'SemCategoria';
        const classeInfo = appCache.classesMap.get(codCategoria);
        const classe = classeInfo ? classeInfo.classe : 'Outros';

        // Matriz DRE
        if (!matrizDRE[classe]) matrizDRE[classe] = {};
        matrizDRE[classe][mesAno] = (matrizDRE[classe][mesAno] || 0) + valor;

        // Matriz Departamentos
        if (classesParaDetalhar.has(classe) && Array.isArray(lancamento.Departamentos)) {
            //Define fornecedor
            const fornecedor = lancamento.Cliente;
            //Para cada departamento do lançamento
            lancamento.Departamentos.forEach(depto => {

                //Extrai informações do departamento
                const codDepto = Number(depto.CodDepto || 0);
                let valorRateio = Number(depto.ValDepto || 0);
                //Define se o valor é negativo ou positivo
                if (lancamento.Natureza === "P") {
                    valorRateio = -valorRateio;
                }
                //Cria uma chave de agragação Depto+Classe
                const chaveDepto = `${codDepto}|${classe}`;

                //Se o objeto para a conta e Depto+Classe não existir na matriz cria ele
                if (!matrizDepartamentos[chaveDepto]) {
                    matrizDepartamentos[chaveDepto] = { depto: codDepto, classe, categorias: {} };
                }

                //Referencia o campo categorias
                const categoriaRef = matrizDepartamentos[chaveDepto].categorias;
                //Se o array de categoria não existir dentro do objeto cria uma vazia
                if (!categoriaRef[codCategoria]) {
                    categoriaRef[codCategoria] = { valores: {}, fornecedores: {} };
                }
                //Atribui o valor do departamento a categoria no mes e ano
                const catData = categoriaRef[codCategoria];
                catData.valores[mesAno] = (catData.valores[mesAno] || 0) + valorRateio;


                //Se o array de fornecedores não existir no array de categorias cria 
                if (!catData.fornecedores[fornecedor]) {
                    catData.fornecedores[fornecedor] = { fornecedor, total: 0 };
                }
                //Soma o valor ao total do fornecedor neste periodo dentro desta
                //categoria dentro deste departamento para esta conta corrente
                catData.fornecedores[fornecedor].total += valorRateio;
            });
        }
    });

    // Ordena fornecedores por total dentro de cada categoria
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