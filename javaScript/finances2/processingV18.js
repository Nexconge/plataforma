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

function processarDados(appCache, modo, anosParaProcessar, contasFiltradas, saldoBase) {
    const matrizDRE = {}, matrizDetalhamentoDRE = {}, matrizARealizar = {}, chavesComDados = new Set();
    
    if (anosParaProcessar.length === 0) {
        return { matrizDRE, matrizDetalhamentoDRE, saldoInicialPeriodo: saldoBase, chavesComDados };
    }

    const primeiroAno = Math.min(...anosParaProcessar.map(Number));
    let saldoInicialPeriodo = saldoBase;

    const classesParaDetalhar = new Set([
        '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL',
        '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos', 
        '(+/-) Empréstimos/Consórcios'
    ]);

    //Processa os titulos
    appCache.titulos.forEach(titulo => {

        const lancamentos = titulo.Lancamentos || titulo.lancamentos || [];

        //Processa os lançamentos dentro do título se houver
        titulo.Lancamentos.forEach(lancamento => {
            if (!lancamento || !lancamento.DataLancamento || !lancamento.CODContaC) {
                return; 
            }
            
            //-------------------------------Verifica Filtros e extrai dados --------------------------------//

            //Verifica se a conta do lançamento está entre as contas filtradas   
            const codConta = String(lancamento.CODContaC).trim();
            if (!contasFiltradas.has(codConta)) return;
            //Extrai a data, ano e mês do lançamento
            const partesData = lancamento.DataLancamento.split('/');
            if (partesData.length !== 3) return;
            // Formata mês e ano para "MM-AAAA" 
            const [dia, mesRaw, ano] = partesData;
            const mes = mesRaw.padStart(2, '0'); //garante sempre 2 dígitos
            const anoMes = `${mes}-${ano}`;
            // Define a chave de agregação conforme o modo (mensal ou anual)
            const chaveAgregacao = (modo.toLowerCase() === 'anual') ? ano : anoMes;
            // Inicializa as estruturas de dados se necessário
            let valor = lancamento.ValorLancamento;
            // Define se o valor é negativo ou positivo conforme a natureza
            if (titulo.Natureza === "P") {
                valor = -valor;
            }
            // Extrai os departamentos do titulo, se não houver adiciona um departamento 0 com 100% do valor
            const departamentosTitulo = titulo.Departamentos || titulo.departamentos || [];
            const departamentos = departamentosTitulo.length > 0
                ? departamentosTitulo
                : [{ CODDepto: 0, PercDepto: 100 }];
            

            // ------------------------------- Regras de período --------------------------------//    
            
            // Se o ano do lançamento for anterior ao primeiro ano do filtro, acumula no saldo inicial
            if (Number(ano) < primeiroAno) {
                saldoInicialPeriodo += valor;
            // Se o ano do lançamento estiver dentro dos anos para processar, inclui na matriz
            } else if (anosParaProcessar.includes(ano)) {
                chavesComDados.add(chaveAgregacao);
                //Pega a categoria do lançamento ou usa 'SemCategoria' se não existir
                const codCategoria = titulo.Categoria || 'SemCategoria';
                //Procura o código da catergoria no MAP
                const classeInfo = appCache.classesMap.get(codCategoria);
                //Pega a descrição da classe da categoria ou usa 'Outros' se não existir
                const classe = classeInfo ? classeInfo.classe : 'Outros';

                //-------------------------------Adiciona os dados as matrizes --------------------------------//
            
                ////////Matriz DRE Principal
                // Se não existe cria o objeto para a classe 
                if (!matrizDRE[classe]) matrizDRE[classe] = {};
                // Adiciona o valor na chave de agregação (Classe+(mês/ano ou ano))    
                matrizDRE[classe][chaveAgregacao] = (matrizDRE[classe][chaveAgregacao] || 0) + valor;

                ////////Matriz De detalhamento por departamnto e fornecedor

                //Estrutura da matriz: matriz[chave] =
                //{nome: nomeDepto, classe, categorias: 
                //{codCategoria: {valores: [{chave = valor}, {chave2 = valor}], fornecedores: 
                //{fornecedor: {fornecedor, valores:{}, total}}}}}  

                //Se classes para detalhamento foram definidas e o array de departamentos existe no título
                if (classesParaDetalhar.has(classe) && Array.isArray(departamentos)) {
                    const fornecedor = titulo.Cliente;
                    
                    //Divide os departamentos e valores rateados
                    departamentos.forEach(depto => {
                        //extrai porcentual e código do departamento
                        const codDepto = Number(depto.CODDepto || 0);
                        const percentDepto = depto.PercDepto || 100;

                        //Calcula o valor rateado para o departamento
                        let valorRateio = Number(lancamento.ValorLancamento*(percentDepto/100)) || 0;
                        //Define se o valor é negativo ou positivo conforme a natureza
                        if (titulo.Natureza === "P") {
                            valorRateio = -valorRateio;
                        }
                        //Pega o nome do departamento ou usa 'Outros Departamentos' se não existir
                        const nomeDepto = appCache.departamentosMap.get(codDepto) || 'Outros Departamentos';
                        const chaveDepto = `${nomeDepto}|${classe}`;
                        //Cria a estrutura do departamento se não existir
                        if (!matrizDetalhamentoDRE[chaveDepto]) {
                            matrizDetalhamentoDRE[chaveDepto] = {nome: nomeDepto, classe, categorias: {}};
                        }
                        //Cria a estrutura da categoria dentro do departamento se não existir
                        const categoriaRef = matrizDetalhamentoDRE[chaveDepto].categorias;
                        if (!categoriaRef[codCategoria]) {
                            categoriaRef[codCategoria] = { valores: {}, fornecedores: {} };
                        }
                        const catData = categoriaRef[codCategoria];
                        //Adiciona o valor rateado na categoria e no fornecedor
                        catData.valores[chaveAgregacao] = (catData.valores[chaveAgregacao] || 0) + valorRateio;
                        //Cria a estrutura do fornecedor dentro da categoria se não existir
                        if (!catData.fornecedores[fornecedor]) {
                            catData.fornecedores[fornecedor] = { fornecedor, valores: {}, total: 0 };
                        }
                        //Adiciona o valor rateado na categoria e no fornecedor por chave[mês/ano ou ano]
                        catData.fornecedores[fornecedor].valores[chaveAgregacao] =
                            (catData.fornecedores[fornecedor].valores[chaveAgregacao] || 0) + valorRateio;
                        catData.fornecedores[fornecedor].total += valorRateio;
                    });
                }
            }
        });
    });
    
    //Ordena os fornecedores dentro de cada categoria por valor total decrescente
    Object.values(matrizDetalhamentoDRE).forEach(dep => {
        Object.values(dep.categorias).forEach(cat => {
            cat.fornecedores = Object.values(cat.fornecedores).sort((a, b) => b.total - a.total);
        });
    });
    console.log("Matriz DRE processada:", matrizDRE);
    console.log("Matriz Detalhamento DRE processada:", matrizDetalhamentoDRE);
    console.log("Saldo Inicial do Período:", saldoInicialPeriodo);
    console.log("Chaves com dados:", Array.from(chavesComDados).sort());
    return { matrizDRE, matrizDetalhamentoDRE, saldoInicialPeriodo, chavesComDados };
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

export { filtrarContasESaldo, processarDados, calcularTotaisDRE };