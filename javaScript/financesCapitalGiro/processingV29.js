// processing.js
/**
 * Itera sobre os títulos brutos da API, processa-os e os separa em três listas distintas:
 * 1. Lançamentos Processados: Transações que já ocorreram (pagamentos/recebimentos).
 * 2. Títulos em Aberto: Valores residuais de títulos que ainda não foram totalmente quitados.
 * 3. Capital de Giro: Uma lista formatada para análise de fluxo de caixa e posições de contas a pagar/receber.
 * * @param {Array} titulos - Array de títulos vindo da API, conforme a estrutura de `buscarTitulos`.
 * @returns {object} Um objeto contendo as três listas de dados processados.
 * // Estrutura do objeto de retorno:
 * // {
 * //   lancamentosProcessados: [ { Natureza, DataLancamento, CODContaC, ValorLancamento, CODCategoria, Cliente, Departamentos:[{CodDpto, ValorDepto}] } ],
 * //   titulosEmAberto: [ { Natureza, DataLancamento, CODContaC, ValorLancamento, CODCategoria, Cliente, Departamentos:[{CodDpto, ValorDepto}] } ],
 * //   capitalDeGiro: [ { Natureza, DataPagamento, DataVencimento, DataEmissao, ValorTitulo, CODContaEmissao, CODContaPagamento } ]
 * // }
 */
function extrairDadosDosTitulos(titulos) {
    const lancamentosProcessados = [];
    const titulosEmAberto = [];
    const capitalDeGiro = [];

    // Garante que a entrada seja um array para evitar erros.
    if (!Array.isArray(titulos)) {
        console.error("A entrada para a função não é um array.", titulos);
        return { lancamentosProcessados, titulosEmAberto, capitalDeGiro };
    }
    
    // Para cada titulo recebido da API
    titulos.forEach(titulo => {
        // Valida se o título contem Lançamentos e Categoria
        if (!titulo || !titulo.Categoria) {
            console.warn("O título está inválido ou com dados essenciais faltando e foi ignorado:", titulo);
            return; // Pula para o próximo título do loop.
        }

        let ValorPago = 0;
        // Itera sobre cada lançamento individual dentro do título.
        titulo.Lancamentos.forEach(lancamento => {
            if (!lancamento.DataLancamento || !lancamento.CODContaC || typeof lancamento.ValorLancamento === 'undefined') {
                console.warn("Lançamento individual inválido ou com dados faltando:", lancamento);
                return; // Pula para o próximo lançamento.
            }           

            // Gera um objeto de departamentos com os valores proporcionais
            let departamentosObj = gerarDepartamentosObj(titulo.Departamentos, lancamento.ValorLancamento);
            
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

            // Adiciona a transação à lista de capital de giro como um evento de caixa realizado.
            capitalDeGiro.push({
                Natureza: titulo.Natureza,
                DataPagamento: lancamento.DataLancamento || null,
                DataVencimento: titulo.DataVencimento || null,
                DataEmissao: titulo.DataEmissao || null,
                ValorTitulo: lancamento.ValorLancamento || 0,
                CODContaEmissao: titulo.CODContaC || null,
                CODContaPagamento: lancamento.CODContaC || null
            });

            // Acumula o valor pago para verificar se o título foi quitado.
            ValorPago += lancamento.ValorBaixado
        });

        // Se o titulo não estiver quitado, gera um "título em aberto" com o valor restante.
        const valorFaltante = (titulo.ValorTitulo - ValorPago);
        if (valorFaltante >= 0.01 && titulo.ValorTitulo != 0) {
            let departamentosObj = gerarDepartamentosObj(titulo.Departamentos, valorFaltante);
            
            // Adiciona o valor restante à lista de títulos a realizar/em aberto.
            titulosEmAberto.push({
                Natureza: titulo.Natureza,
                DataLancamento: titulo.DataVencimento, // A data de referência é o vencimento.
                CODContaC: titulo.CODContaC,
                ValorLancamento: valorFaltante,
                CODCategoria: titulo.Categoria,
                Cliente: titulo.Cliente || "Cliente",
                Departamentos: departamentosObj
            });
            
            // Adiciona também à lista de capital de giro como uma previsão (sem data de pagamento).
            capitalDeGiro.push({
                Natureza: titulo.Natureza,
                DataPagamento: null,
                DataVencimento: titulo.DataVencimento || null,
                DataEmissao: titulo.DataEmissao || null,
                ValorTitulo: valorFaltante || 0,
                CODContaEmissao: titulo.CODContaC || null,
                CODContaPagamento: null
            });
        }
    });
    return { lancamentosProcessados, titulosEmAberto, capitalDeGiro };
}
/**
 * Calcula o valor rateado para cada departamento com base no percentual de participação.
 * @param {Array} departamentos - O array de departamentos vindo do título da API. Ex: [{ CODDepto, PercDepto }].
 * @param {number} valorLancamento - O valor total do lançamento a ser rateado.
 * @returns {Array<object>} Um array de objetos, cada um contendo o código do departamento e o valor correspondente. Ex: [{ CodDpto, ValorDepto }].
 */
function gerarDepartamentosObj(departamentos, valorLancamento) {
    // Se for um array válido e tiver elementos, faz o rateio.
    if (Array.isArray(departamentos) && departamentos.length > 0) {
        return departamentos.map(depto => {
            const valorRateio = valorLancamento * ((depto.PercDepto ?? 100) / 100);
            return {
                CodDpto: depto.CODDepto || 0,
                ValorDepto: valorRateio
            };
        });
    }
    // Caso contrário, atribui 100% do valor a um departamento padrão "Outros".
    return [{
        CodDpto: 0, // 0 representa "Outros Departamentos"
        ValorDepto: valorLancamento
    }];
}
/**
 * Converte uma string de data no formato "DD/MM/AAAA" para um objeto Date do JavaScript.
 * @param {string} dateString - A string da data a ser convertida.
 * @returns {Date|null} Um objeto Date ou null se a string for inválida.
 */
function parseDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;
    // new Date(ano, mês - 1, dia) - O mês no construtor do Date é base 0.
    return new Date(parts[2], parts[1] - 1, parts[0]);
}
/**
 * Processa uma lista de lançamentos (realizados ou a realizar) e os agrupa em matrizes para DRE e Departamentos.
 * Esta é a função central que transforma uma lista de transações em dados estruturados para os relatórios.
 * @param {object} dadosBase - O cache da aplicação (`appCache`), contendo mapas de apoio como `classesMap` e `departamentosMap`.
 * @param {Array} lancamentos - Array de lançamentos ou títulos a processar (saída de `extrairDadosDosTitulos`).
 * @param {number} contaId - ID da conta corrente que está sendo processada, para filtrar os lançamentos.
 * @returns {object} Um objeto contendo as matrizes calculadas e metadados.
 * // Estrutura do objeto de retorno:
 * // {
 * //   matrizDRE: { "ClasseExemplo": { "03-2025": 1500, "04-2025": 2000 }, ... },
 * //   matrizDepartamentos: { "NomeDepto|Classe": { nome, classe, categorias: { ... } }, ... },
 * //   chavesComDados: Set("03-2025", "04-2025", ...),
 * //   valorTotal: 3500
 * // }
 */
function processarRealizadoRealizar(dadosBase, lancamentos, contaId, saldoIni) {
    const matrizDRE = {}, matrizDepartamentos = {}, chavesComDados = new Set();
    matrizDepartamentos.totais = {};
    // Classes que terão seus dados detalhados por departamento/categoria/fornecedor.
    const classesParaDetalhar = new Set([
        '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL',
        '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos', 
        '(+/-) Empréstimos/Consórcios'
    ]);

    let valorTotal = 0;
    
    // Inicializa as classes de entrada/saída para garantir que sempre existam.
    matrizDepartamentos.totais['(+) Entradas'] = {};
    matrizDepartamentos.totais['(-) Saídas'] = {};

    lancamentos.forEach(lancamento => {
        // Ignora lançamentos que não pertencem à conta que está sendo processada.
        if (contaId != Number(lancamento.CODContaC)) return;
        if (!lancamento || !lancamento.DataLancamento || !lancamento.CODContaC) return;
        
        // Cria a chave de agregação no formato 'MM-AAAA'.
        const partesData = lancamento.DataLancamento.split('/');
        if (partesData.length !== 3) return; 
        const [dia, mesRaw, ano] = partesData;
        const chaveAgregacao = `${mesRaw.padStart(2, '0')}-${ano}`;
        chavesComDados.add(chaveAgregacao);
    
        // Converte o valor para negativo se for um pagamento.
        let valor = lancamento.ValorLancamento;
        if (lancamento.Natureza === "P") valor = -valor;
        valorTotal += valor;

        // Encontra a classe da DRE correspondente à categoria do lançamento.
        const codCategoria = lancamento.CODCategoria || 'SemCategoria';
        const classeInfo = dadosBase.classesMap.get(codCategoria);
        const classe = classeInfo ? classeInfo.classe : 'Outros';

        // Adiciona o valor à matriz DRE na classe e período corretos.
        if (!matrizDRE[classe]) matrizDRE[classe] = {};
        matrizDRE[classe][chaveAgregacao] = (matrizDRE[classe][chaveAgregacao] || 0) + valor;

        // Adiciona também às linhas totalizadoras de entradas e saídas para a matriz de departamentos
        if (valor < 0) {
            matrizDepartamentos.totais['(-) Saídas'][chaveAgregacao] = (matrizDepartamentos.totais['(-) Saídas'][chaveAgregacao] || 0) + valor;
        } else {
            matrizDepartamentos.totais['(+) Entradas'][chaveAgregacao] = (matrizDepartamentos.totais['(+) Entradas'][chaveAgregacao] || 0) + valor;
        }

        // Se a classe do lançamento deve ser detalhada, processa os departamentos.
        if (classesParaDetalhar.has(classe) && Array.isArray(lancamento.Departamentos) && lancamento.Departamentos.length > 0) {
            const fornecedor = lancamento.Cliente;
            lancamento.Departamentos.forEach(depto => {
                let valorRateio = depto.ValorDepto;
                if (lancamento.Natureza === "P") valorRateio = -valorRateio;
                
                const nomeDepto = dadosBase.departamentosMap.get(depto.CodDpto) || 'Outros Departamentos';
                const chaveDepto = `${nomeDepto}|${classe}`;
                
                // Inicializa a estrutura do departamento se ainda não existir.
                if (!matrizDepartamentos[chaveDepto]) {
                    matrizDepartamentos[chaveDepto] = { nome: nomeDepto, classe, categorias: {} };
                }
                const categoriaRef = matrizDepartamentos[chaveDepto].categorias;
                if (!categoriaRef[codCategoria]) {
                    categoriaRef[codCategoria] = { valores: {}, fornecedores: {} };
                }
                const catData = categoriaRef[codCategoria];
                // Acumula o valor na categoria e período corretos.
                catData.valores[chaveAgregacao] = (catData.valores[chaveAgregacao] || 0) + valorRateio;
                
                // Detalha por fornecedor.
                if (!catData.fornecedores[fornecedor]) {
                    catData.fornecedores[fornecedor] = { fornecedor, valores: {}, total: 0 };
                }
                catData.fornecedores[fornecedor].valores[chaveAgregacao] =
                    (catData.fornecedores[fornecedor].valores[chaveAgregacao] || 0) + valorRateio;
                catData.fornecedores[fornecedor].total += valorRateio;
            });
        }

        //Calcula as linhas totalizadoras (Saldo inicial e final, Receita Liquida, Geração de Caixa, etc.)
        const colunasOrdenadas = Array.from(chavesComDados).sort(compararChaves);
        ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'].forEach(classe => {
            if (!matrizDRE[classe]) matrizDRE[classe] = {};
        });
        calcularLinhasDeTotalDRE(matrizDRE, colunasOrdenadas, saldoIni);
    });

    return { matrizDRE, matrizDepartamentos, chavesComDados, valorTotal };
}
/**
 * Pré-processa os dados de capital de giro para uma única conta.
 * A função organiza os itens em listas de "contas a receber" e "contas a pagar" e calcula o fluxo de caixa mensal já realizado.
 * @param {object} dadosBase - O cache da aplicação (`appCache`).
 * @param {Array} capitalDeGiro - A lista de itens de capital de giro vinda de `extrairDadosDosTitulos`.
 * @param {number} contaId - O ID da conta sendo processada.
 * @returns {object} Um objeto com os dados pré-processados para a análise de capital de giro.
 * // Estrutura do objeto de retorno:
 * // {
 * //   saldoInicial: 5000,
 * //   fluxoDeCaixaMensal: { "03-2025": 10000, "04-2025": -5000 },
 * //   contasAReceber: [ { ...itemProcessado } ],
 * //   contasAPagar: [ { ...itemProcessado } ]
 * // }
 */
function processarCapitalDeGiro(dadosBase, capitalDeGiro, contaId) {
    const contaInfo = dadosBase.contasMap.get(String(contaId));
    const saldoInicial = contaInfo ? Number(contaInfo.saldoIni) : 0;

    const fluxoDeCaixaMensal = {};
    const contasAReceber = [];
    const contasAPagar = [];

    const nomeConta = contaInfo ? contaInfo.nome : `Conta ${contaId}`;
    console.log(`Processando Capital de Giro para a conta: ${nomeConta} (ID: ${contaId})`);
    
    if (Array.isArray(capitalDeGiro)) {
        capitalDeGiro.forEach(item => {
            // (1) Soma no fluxo de caixa se tiver data de pagamento válida E a conta de pagamento for a conta atual.
            if (item.DataPagamento && typeof item.DataPagamento === 'string' && (item.CODContaPagamento == contaId)) {
                const partesData = item.DataPagamento.split('/');
                if (partesData.length === 3) {
                    const chavePeriodo = `${partesData[1].padStart(2, '0')}-${partesData[2]}`;
                    let valor = item.ValorTitulo || 0;
                    if (item.Natureza === 'P') valor = -valor;                    
                    fluxoDeCaixaMensal[chavePeriodo] = (fluxoDeCaixaMensal[chavePeriodo] || 0) + valor;
                }
            }
            
            // (2) Entra nas listas de previsão (A Pagar/A Receber) se tiver data de emissão E vencimento, e a conta de EMISSÃO for a conta atual.
            if (item.DataEmissao && item.DataVencimento && (item.CODContaEmissao == contaId)){
                const itemProcessado = {
                    ...item,
                    DataEmissao: parseDate(item.DataEmissao),
                    DataVencimento: parseDate(item.DataVencimento),
                    DataPagamento: parseDate(item.DataPagamento)
                };

                if (item.Natureza === 'R') {
                    contasAReceber.push(itemProcessado);
                } else if (item.Natureza === 'P') {
                    contasAPagar.push(itemProcessado);
                }
            }
        });
    }

    return {
        saldoInicial,
        fluxoDeCaixaMensal,
        contasAReceber,
        contasAPagar
    };
}
/**
 * Orquestra o processamento completo dos dados de uma única conta.
 * Chama as funções de processamento para DRE (realizado e a realizar) e para Capital de Giro.
 * @param {object} AppCache - O cache da aplicação com os mapas de apoio.
 * @param {object} dadosApi - Objeto com os dados extraídos da API (`{ lancamentos, titulos, capitalDeGiro }`).
 * @param {number} contaId - O ID da conta sendo processada.
 * @returns {object} Um objeto estruturado contendo todos os dados processados para a conta.
 * // Estrutura do objeto de retorno:
 * // {
 * //   realizado: { matrizDRE, matrizDepartamentos, chavesComDados, valorTotal },
 * //   arealizar: { matrizDRE, matrizDepartamentos, chavesComDados, valorTotal },
 * //   capitalDeGiro: { saldoInicial, fluxoDeCaixaMensal, contasAReceber, contasAPagar }
 * // }
 */
function processarDadosDaConta(AppCache, dadosApi, contaId) {
    const { lancamentos, titulos , capitalDeGiro } = dadosApi;

    //Obtém o saldo inicial da conta para passá-lo para a função de processamento.
    const contaInfo = AppCache.contasMap.get(String(contaId));
    const saldoIniCC = contaInfo ? Number(contaInfo.saldoIni) : 0;
    
    // Processa os dados para o modo REALIZADO (transações passadas).
    const dadosRealizado = processarRealizadoRealizar(AppCache, lancamentos, contaId, saldoIniCC);

    // O saldo inicial do "A Realizar" é o saldo da conta + o resultado total do "Realizado".
    const saldoIniARealizar = saldoIniCC + (dadosRealizado ? dadosRealizado.valorTotal : 0);

    // Processa os dados para o modo A REALIZAR (previsões futuras).
    const dadosARealizar = processarRealizadoRealizar(AppCache, titulos, contaId, saldoIniARealizar);
    // Processa os dados para o relatório de Capital de Giro.
    const dadosCapitalDeGiro = processarCapitalDeGiro(AppCache, capitalDeGiro, contaId);

    return {
        realizado: dadosRealizado,
        arealizar: dadosARealizar,
        capitalDeGiro: dadosCapitalDeGiro
    };
}
/**
 * Calcula as linhas totalizadoras da Matriz DRE (Demonstração do Resultado) com base nos dados de entrada.
 * Esta função modifica o objeto `matrizDRE` diretamente (muta o objeto), preenchendo as linhas de totais e saldos.
 * @param {object} matrizDRE - O objeto da matriz DRE a ser modificado.
 * @param {Array<string>} colunasParaCalcular - Um array com as chaves dos períodos a serem calculados (ex: ["01-2025", "02-2025"]).
 * @param {number} saldoInicial - O saldo de caixa inicial para o primeiro período a ser calculado.
 * @returns {void} A função não retorna um valor, pois modifica o objeto `matrizDRE` por referência.
 */
function calcularLinhasDeTotalDRE(matrizDRE, colunasParaCalcular, saldoInicial) {
    // Inicia o saldo acumulado com o saldo inicial fornecido. Este valor será atualizado a cada coluna (período).
    let saldoAcumulado = saldoInicial;

    // Itera sobre cada coluna (mês ou ano) para calcular os totais verticalmente.
    colunasParaCalcular.forEach(coluna => {
        // Função auxiliar para obter o valor de uma classe da DRE para a coluna atual, retornando 0 se não existir.
        const getValor = (classe) => matrizDRE[classe]?.[coluna] || 0;
        
        const receitaBruta = getValor('(+) Receita Bruta');
        const deducoes = getValor('(-) Deduções');
        const custos = getValor('(-) Custos');
        const despesas = getValor('(-) Despesas');
        const irpj = getValor('(+/-) IRPJ/CSLL');
        const resultadoFinanceiro = getValor('(+/-) Resultado Financeiro');
        const aportes = getValor('(+/-) Aportes/Retiradas');
        const investimentos = getValor('(+/-) Investimentos');
        const emprestimos = getValor('(+/-) Empréstimos/Consórcios');
        const entradaTransferencia = getValor('Entrada de Transferência');
        const saidaTransferencia = getValor('Saída de Transferência');
        const outros = getValor('Outros');

        // Calcula a Receita Líquida.
        const receitaLiquida = receitaBruta + deducoes;
        matrizDRE['(=) Receita Líquida'][coluna] = receitaLiquida;

        // Calcula a Geração de Caixa Operacional (resultado da operação principal).
        const geracaoCaixa = receitaLiquida + custos + despesas + irpj;
        matrizDRE['(+/-) Geração de Caixa Operacional'][coluna] = geracaoCaixa;

        // Soma as movimentações não operacionais.
        const movimentacaoNaoOperacional = resultadoFinanceiro + aportes + investimentos + emprestimos;
        
        // A movimentação total do mês é a soma do resultado operacional com o não operacional.
        const movimentacaoMensal = geracaoCaixa + movimentacaoNaoOperacional;
        matrizDRE['(=) Movimentação de Caixa Mensal'][coluna] = movimentacaoMensal;

        // O Caixa Inicial do período é o saldo acumulado até o final do período anterior.
        matrizDRE['Caixa Inicial'][coluna] = saldoAcumulado;
        
        // Calcula a variação total de caixa, incluindo movimentações que não afetam o resultado (transferências, etc).
        const variacaoCaixaTotal = movimentacaoMensal + entradaTransferencia + saidaTransferencia + outros;
        
        // Atualiza o saldo acumulado para o próximo período.
        saldoAcumulado += variacaoCaixaTotal;

        // O Caixa Final do período é o novo saldo acumulado.
        matrizDRE['Caixa Final'][coluna] = saldoAcumulado;
    });
}
/**
 * Mescla os dados processados de múltiplas contas em um único conjunto de dados mensais consolidados.
 * @param {Array<object>} listaDeDadosProcessados - Array de objetos, cada um sendo a saída de `processarRealizadoRealizar` para uma conta.
 * @returns {object} Um objeto contendo os dados consolidados e metadados.
 * // Estrutura do objeto de retorno:
 * // {
 * //   monthlyMerged: { 
 * //     matrizDRE: { "Classe": { "03-2025": valorTotal } }, 
 * //     matrizDepartamentos: { "Depto|Classe": { ...dados consolidados } } 
 * //   },
 * //   saldoBaseTotal: 15000, // Soma dos saldos iniciais de todas as contas.
 * //   todasChaves: Set("01-2025", "02-2025", ...) // Um Set com todos os períodos únicos.
 * // }
 */
function mergeDadosMensais(listaDeDadosProcessados) {
    const monthlyMerged = { matrizDRE: {}, matrizDepartamentos: {} };
    const todasChaves = new Set(); // Armazena todos os períodos únicos (ex: '01-2024', '02-2024')

    // Soma o saldo inicial de todas as contas para obter um saldo base consolidado.
    const saldoBaseTotal = listaDeDadosProcessados.reduce((acc, dados) => {
        // Coleta todas as chaves de período de todas as contas.
        dados.chavesComDados.forEach(chave => todasChaves.add(chave));

        // Mescla os dados da DRE somando os valores de cada classe/período.
        for (const classe in dados.matrizDRE) {
            if (!monthlyMerged.matrizDRE[classe]) monthlyMerged.matrizDRE[classe] = {};
            for (const periodo in dados.matrizDRE[classe]) {
                monthlyMerged.matrizDRE[classe][periodo] = (monthlyMerged.matrizDRE[classe][periodo] || 0) + dados.matrizDRE[classe][periodo];
            }
        }

        // Mescla os dados dos Departamentos (uma estrutura mais complexa).
        for (const chaveDepto in dados.matrizDepartamentos) {
            // Se o departamento ainda não existe no objeto mesclado, faz uma cópia profunda para evitar mutação.
            if (!monthlyMerged.matrizDepartamentos[chaveDepto]) {
                monthlyMerged.matrizDepartamentos[chaveDepto] = JSON.parse(JSON.stringify(dados.matrizDepartamentos[chaveDepto]));
            } else {
                // Se já existe, itera sobre as categorias e fornecedores para somar os valores.
                const mergedDepto = monthlyMerged.matrizDepartamentos[chaveDepto];
                const deptoData = dados.matrizDepartamentos[chaveDepto];
                for (const codCat in deptoData.categorias) {
                    if (!mergedDepto.categorias[codCat]) {
                        mergedDepto.categorias[codCat] = JSON.parse(JSON.stringify(deptoData.categorias[codCat]));
                    } else {
                        const mergedCat = mergedDepto.categorias[codCat];
                        const catData = deptoData.categorias[codCat];
                        // Soma valores mensais da categoria.
                        for (const periodo in catData.valores) {
                            mergedCat.valores[periodo] = (mergedCat.valores[periodo] || 0) + catData.valores[periodo];
                        }
                        // Soma valores dos fornecedores dentro da categoria.
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
        // Acumula o saldo inicial de cada conta.
        return acc + (dados.saldoIni || 0);
    }, 0);

    return { monthlyMerged, saldoBaseTotal, todasChaves };
}
/**
 * Calcula o saldo de caixa inicial para um período de visualização específico.
 * Isso é feito somando o saldo base de todas as contas com a variação de caixa de todos os meses ANTERIORES ao primeiro mês visível.
 * @param {object} monthlyDRE - Objeto com os dados financeiros mensais consolidados.
 * @param {Set|Array} todasChaves - Todas as chaves de período (MM-AAAA) disponíveis nos dados.
 * @param {Array<string>} colunasVisiveis - As colunas/períodos selecionados para exibição.
 * @param {number} saldoBaseTotal - O saldo de caixa inicial absoluto (soma dos saldos das contas).
 * @returns {number} O saldo de caixa inicial correto para o primeiro período visível.
 */
function calcularSaldoInicialPeriodo(monthlyDRE, todasChaves, colunasVisiveis, saldoBaseTotal) {
    // Função auxiliar para comparar datas no formato 'MM-AAAA'.
    const compararPeriodos = (a, b) => {
        const [mesA, anoA] = a.split('-');
        const [mesB, anoB] = b.split('-');
        return new Date(anoA, mesA - 1) - new Date(anoB, mesB - 1);
    };

    // 1. Ordena todas as chaves de período cronologicamente.
    const colunasHistoricasOrdenadas = Array.from(todasChaves).sort(compararPeriodos);

    // 2. Garante que as colunas visíveis também estejam ordenadas.
    const colunasVisiveisOrdenadas = [...colunasVisiveis].sort(compararPeriodos);
    if (colunasVisiveisOrdenadas.length === 0) return saldoBaseTotal;

    // 3. Cria uma cópia temporária da DRE para calcular movimentações sem alterar a original.
    const tempDRE = JSON.parse(JSON.stringify(monthlyDRE));
    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'].forEach(classe => {
        if (!tempDRE[classe]) tempDRE[classe] = {};
    });

    // 4. Calcula a 'Movimentação de Caixa Mensal' de todo o histórico, partindo de um saldo zero.
    calcularLinhasDeTotalDRE(tempDRE, colunasHistoricasOrdenadas, 0);

    let saldoAcumuladoAntesDoPeriodo = 0;
    const primeiraColunaVisivel = colunasVisiveisOrdenadas[0];
    
    // 5. Itera sobre os períodos históricos e soma a variação de caixa de todos os meses ANTES do primeiro mês visível.
    for (const periodo of colunasHistoricasOrdenadas) {
        // Interrompe a soma quando chegamos no primeiro mês que será exibido.
        if (compararPeriodos(periodo, primeiraColunaVisivel) >= 0) {
            break;
        }
        // A variação do período inclui a movimentação mensal e outras transações de caixa (transferências, etc).
        const variacaoDoPeriodo = (tempDRE['(=) Movimentação de Caixa Mensal']?.[periodo] || 0) +
                                  (tempDRE['Entrada de Transferência']?.[periodo] || 0) +
                                  (tempDRE['Saída de Transferência']?.[periodo] || 0) +
                                  (tempDRE['Outros']?.[periodo] || 0);
                            
        saldoAcumuladoAntesDoPeriodo += variacaoDoPeriodo;
    }

    // 6. O saldo inicial final é a soma do saldo base com a variação de caixa acumulada dos meses anteriores.
    return saldoBaseTotal + saldoAcumuladoAntesDoPeriodo;
}
/**
 * Agrega os dados mensais consolidados em totais anuais, tratando corretamente as linhas de saldo.
 * @param {object} monthlyData - O objeto de dados mesclados com valores mensais.
 * @returns {object} Um novo objeto de dados com a mesma estrutura, mas com valores agregados por ano.
 */
function agregarDadosParaAnual(monthlyData) {
    const annualData = { matrizDRE: {}, matrizDepartamentos: {} };
    const saldosAnuais = {}; // { 'Caixa Final': { '2025': { mes: '12', valor: 1000 }, ... } }

    // Agrega DRE
    for (const classe in monthlyData.matrizDRE) {
        annualData.matrizDRE[classe] = {};
        for (const periodoMensal in monthlyData.matrizDRE[classe]) {
            const [mes, ano] = periodoMensal.split('-');
            const valor = monthlyData.matrizDRE[classe][periodoMensal];

            // Lógica de exceção para saldos
            if (classe === 'Caixa Inicial' || classe === 'Caixa Final') {
                if (!saldosAnuais[classe]) saldosAnuais[classe] = {};
                const MaisRecente = !saldosAnuais[classe][ano] || mes > saldosAnuais[classe][ano].mes;
                const MaisAntigo = !saldosAnuais[classe][ano] || mes < saldosAnuais[classe][ano].mes;
                if (classe === 'Caixa Final' && MaisRecente) {
                    saldosAnuais[classe][ano] = { mes, valor };
                }
                if (classe === 'Caixa Inicial' && MaisAntigo) {
                    saldosAnuais[classe][ano] = { mes, valor };
                }
            } else {
                // Lógica padrão de soma
                annualData.matrizDRE[classe][ano] = (annualData.matrizDRE[classe][ano] || 0) + valor;
            }
        }
    }

    // Atribui os saldos anuais corretos que foram calculados
    for (const classe in saldosAnuais) {
        for (const ano in saldosAnuais[classe]) {
            annualData.matrizDRE[classe][ano] = saldosAnuais[classe][ano].valor;
        }
    }

    // Agrega Departamentos
    for (const chaveDepto in monthlyData.matrizDepartamentos) {
        const deptoData = monthlyData.matrizDepartamentos[chaveDepto];
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
}
/**
 * Calcula a coluna 'TOTAL' para a matriz DRE, somando os valores de todas as colunas visíveis.
 * Esta função modifica o objeto `matrizDRE` diretamente.
 * @param {object} matrizDRE - A matriz DRE (mensal ou anual).
 * @param {string[]} colunasVisiveis - As colunas que devem ser somadas no total.
 * @returns {void}
 */
function calcularColunaTotalDRE(matrizDRE, colunasVisiveis, PeUChave) {
    //Outras linhas
    Object.values(matrizDRE).forEach(periodos => {
        periodos.TOTAL = colunasVisiveis.reduce((acc, coluna) => acc + (periodos[coluna] || 0), 0);
    });

    //Linhas de saldo
    //Verifica se o período visivel possui colunas sem dados e ajusta a referencia de saldo inicial e final para a coluna de total
    let i = compararChaves(PeUChave.primeiraChave, colunasVisiveis[0])
    let colSaldIni
    let colSaldFim
    if(i >= 0) colSaldIni = PeUChave.primeiraChave;
    if(i < 0) colSaldIni = colunasVisiveis[0]
    i = compararChaves(PeUChave.ultimaChave, colunasVisiveis[colunasVisiveis.length - 1])
    if(i <= 0) colSaldFim = PeUChave.ultimaChave;
    if(i > 0) colSaldFim = colunasVisiveis[colunasVisiveis.length - 1]

    if (colunasVisiveis.length > 0) {
        if(matrizDRE['Caixa Inicial']) {
            matrizDRE['Caixa Inicial'].TOTAL = matrizDRE['Caixa Inicial'][colSaldIni] || 0;
        }
        if(matrizDRE['Caixa Final']) {
            matrizDRE['Caixa Final'].TOTAL = matrizDRE['Caixa Final'][colSaldFim] || 0;
        }
    }
}
/**
 * Função principal que orquestra a mesclagem e o processamento final dos dados de múltiplas contas.
 * Consolida, calcula saldos, agrega (se necessário) e finaliza os dados para exibição na UI.
 * @param {Array<object>} listaDeDadosProcessados - Array de objetos, cada um contendo os dados de uma conta (saída de `processarDadosDaConta`).
 * @param {string} modo - O modo de visualização ('mensal' ou 'anual').
 * @param {Array<string>} colunasVisiveis - As colunas (períodos) que devem ser exibidas.
 * @param {string} projecao - O modo de projeção ('realizado' ou 'arealizar').
 * @returns {object} O objeto final e completo, pronto para ser renderizado pelas funções da UI.
 * // Estrutura do objeto de retorno:
 * // {
 * //   matrizDRE: { "Classe": { "MM-AAAA": valor, "TOTAL": valorTotal, ... }, ... },
 * //   matrizDepartamentos: { "NomeDepto|Classe": { ...dados detalhados... } },
 * //   saldoInicialPeriodo: 12345.67,
 * //   PeUChave: { ultimaChave: "12-2025", primeiraChave: "01-2025" },
 * //   matrizCapitalGiro: { "(+) Caixa": { "01-2025": 5000, ... }, ... }
 * // }
 */
function mergeMatrizes(listaDeDadosProcessados, modo, colunasVisiveis, projecao) {
    // Seleciona os dados corretos (realizado ou a realizar) de cada conta.
    const dadosSelecionados = listaDeDadosProcessados
        .map(dadosConta => dadosConta[projecao.toLowerCase()])
        .filter(Boolean);

    // Retorna um resultado vazio se não houver dados de entrada.
    if (!dadosSelecionados || dadosSelecionados.length === 0) {
        return { matrizDRE: {}, matrizDepartamentos: {}, matrizCapitalGiro: {} };
    }

    // 1. Mescla os dados mensais de todas as contas.
    const { monthlyMerged, todasChaves } = mergeDadosMensais(dadosSelecionados);
    
    // 2. Agrega os dados de mensais para anuais, se o modo for 'anual'.
    const dadosAntesDosTotais = (modo.toLowerCase() === 'anual')
        ? agregarDadosParaAnual(monthlyMerged)
        : monthlyMerged;

    // 3. Obtém a primeira e a última chave dos períodos disponíveis para controle na UI.
    const PeUChave = getChavesDeControle(todasChaves, modo);

    // 4. Calcula a coluna "TOTAL" para a tabela de DRE
    calcularColunaTotalDRE(dadosAntesDosTotais.matrizDRE, colunasVisiveis, PeUChave);

    // 5. Gera a Matriz de Capital de Giro.
    let matrizCapitalGiro = {};
    if (modo.toLowerCase() === 'mensal') {
        const dadosCapitalGiro = listaDeDadosProcessados.map(c => c.capitalDeGiro).filter(Boolean);
        matrizCapitalGiro = gerarMatrizCapitalGiro(dadosCapitalGiro, colunasVisiveis);
    }

    // Retorna o objeto final, pronto para a renderização.
    return { ...dadosAntesDosTotais, matrizCapitalGiro };
}
/**
 * Consolida os dados de capital de giro de múltiplas contas e gera a matriz final para exibição.
 * @param {Array<object>} listaDeDadosCapitalGiro - Array com os objetos pré-processados de cada conta (saída de `processarCapitalDeGiro`).
 * @param {Array<string>} colunasVisiveis - As colunas (períodos 'MM-AAAA') a serem exibidas.
 * @returns {object} A matriz formatada para a tabela de Capital de Giro, onde cada chave é uma linha da tabela.
 */
function gerarMatrizCapitalGiro(listaDeDadosCapitalGiro, colunasVisiveis) {
    // ETAPA 1: AGREGAÇÃO DOS DADOS DE TODAS AS CONTAS
    let saldoInicialTotal = 0;
    const fluxoCaixaAgregado = {};
    const contasAReceberAgregadas = [];
    const contasAPagarAgregadas = [];

    listaDeDadosCapitalGiro.forEach(dadosConta => {
        saldoInicialTotal += dadosConta.saldoInicial || 0;
        contasAReceberAgregadas.push(...(dadosConta.contasAReceber || []));
        contasAPagarAgregadas.push(...(dadosConta.contasAPagar || []));
        for (const periodo in dadosConta.fluxoDeCaixaMensal) {
            fluxoCaixaAgregado[periodo] = (fluxoCaixaAgregado[periodo] || 0) + dadosConta.fluxoDeCaixaMensal[periodo];
        }
    });

    // ETAPA 2: INICIALIZAÇÃO DA MATRIZ DE RETORNO
    const matriz = {};
    const chaves = ['(+) Caixa', '(+) Clientes a Receber', 'Curto Prazo AR', 'Longo Prazo AR',
                      '(-) Fornecedores a Pagar', 'Curto Prazo AP', 'Longo Prazo AP'];
    chaves.forEach(chave => matriz[chave] = {});

    // ETAPA 3: CÁLCULO DO SALDO DE CAIXA MENSAL
    let caixaAcumulado = saldoInicialTotal;
    const todosPeriodosHistoricos = Object.keys(fluxoCaixaAgregado).sort(compararChaves);
    const primeiraColunaVisivel = [...colunasVisiveis].sort(compararChaves)[0];

    // Calcula o saldo inicial correto para a primeira coluna visível.
    if (primeiraColunaVisivel) {
        todosPeriodosHistoricos.forEach(periodo => {
            if (compararChaves(periodo, primeiraColunaVisivel) < 0) {
                caixaAcumulado += fluxoCaixaAgregado[periodo] || 0;
            }
        });
    }

    // Calcula o saldo final de cada mês visível.
    colunasVisiveis.forEach(coluna => {
        caixaAcumulado += fluxoCaixaAgregado[coluna] || 0;
        matriz['(+) Caixa'][coluna] = caixaAcumulado;
    });

    // ETAPA 4: CÁLCULO DE CONTAS A RECEBER E A PAGAR PENDENTES EM CADA PERÍODO
    const getFimPeriodo = (periodo) => new Date(periodo.split('-')[1], periodo.split('-')[0], 0, 23, 59, 59, 999);

    colunasVisiveis.forEach(coluna => {
        const fimPeriodo = getFimPeriodo(coluna);
        let cpAR = 0, lpAR = 0, cpAP = 0, lpAP = 0; // Curto/Longo Prazo, A Receber/A Pagar

        const processarItens = (itens, cb) => {
            itens.forEach(item => {
                // REGRA: Um item está "em aberto" se foi emitido até o fim do período e não foi pago (ou foi pago depois).
                if (item.DataEmissao && item.DataEmissao <= fimPeriodo && (!item.DataPagamento || item.DataPagamento > fimPeriodo)) {
                    cb(item);
                }
            });
        };

        // Processa Contas a Receber
        processarItens(contasAReceberAgregadas, item => {
            if (item.DataEmissao) { // Garante que é uma transação com origem, não apenas caixa.
                const valor = item.ValorTitulo || 0;
                // REGRA: Venceu até o fim do período = Curto Prazo
                if (item.DataVencimento && item.DataVencimento <= fimPeriodo) cpAR += valor;
                else lpAR += valor;
            }
        });

        // Processa Contas a Pagar
        processarItens(contasAPagarAgregadas, item => {
            if (item.DataEmissao) {
                const valor = item.ValorTitulo || 0;
                if (item.DataVencimento && item.DataVencimento <= fimPeriodo) cpAP += valor;
                else lpAP += valor;
            }
        });

        matriz['Curto Prazo AR'][coluna] = cpAR;
        matriz['Longo Prazo AR'][coluna] = lpAR;
        matriz['Curto Prazo AP'][coluna] = cpAP;
        matriz['Longo Prazo AP'][coluna] = lpAP;
    });

    // ETAPA 5: CÁLCULO DAS LINHAS FINAIS (TOTAIS E PERCENTUAIS)
    colunasVisiveis.forEach(coluna => {
        const totalAR = matriz['Curto Prazo AR'][coluna] + matriz['Longo Prazo AR'][coluna];
        const totalAP = matriz['Curto Prazo AP'][coluna] + matriz['Longo Prazo AP'][coluna];

        matriz['(+) Clientes a Receber'][coluna] = totalAR;
        matriz['(-) Fornecedores a Pagar'][coluna] = totalAP;

        // Inicializa as chaves das linhas calculadas
        const initKey = k => matriz[k] = matriz[k] || {};
        ['Curto Prazo AR %', 'Longo Prazo AR %', 'Curto Prazo AP %', 'Longo Prazo AP %', '(+) Curto Prazo (30 dias)', '(-) Longo Prazo (maior que 30 dias)', '(=) Capital Líquido Circulante']
        .forEach(initKey);

        // Calcula percentuais (evitando divisão por zero).
        matriz['Curto Prazo AR %'][coluna] = totalAR > 0 ? (matriz['Curto Prazo AR'][coluna] / totalAR) * 100 : 0;
        matriz['Longo Prazo AR %'][coluna] = totalAR > 0 ? (matriz['Longo Prazo AR'][coluna] / totalAR) * 100 : 0;
        matriz['Curto Prazo AP %'][coluna] = totalAP > 0 ? (matriz['Curto Prazo AP'][coluna] / totalAP) * 100 : 0;
        matriz['Longo Prazo AP %'][coluna] = totalAP > 0 ? (matriz['Longo Prazo AP'][coluna] / totalAP) * 100 : 0;

        // Calcula as linhas de resultado do capital de giro.
        matriz['(+) Curto Prazo (30 dias)'][coluna] = matriz['Curto Prazo AR'][coluna] - matriz['Curto Prazo AP'][coluna];
        matriz['(-) Longo Prazo (maior que 30 dias)'][coluna] = matriz['Longo Prazo AR'][coluna] - matriz['Longo Prazo AP'][coluna];
        matriz['(=) Capital Líquido Circulante'][coluna] = matriz['(+) Caixa'][coluna] + totalAR - totalAP;
    });

    return matriz;
}
/**
 * Obtém a primeira e a última chave de período (MM-AAAA ou AAAA) de um conjunto de chaves.
 * @param {Set<string>} chavesSet - Um Set contendo todas as chaves de período.
 * @param {string} modo - O modo de visualização ('mensal' ou 'anual').
 * @returns {object} Um objeto contendo a primeira e a última chave.
 * // Estrutura do objeto de retorno:
 * // {
 * //   ultimaChave: "12-2025",
 * //   primeiraChave: "01-2025"
 * // }
 */
function getChavesDeControle(chavesSet, modo) {
    let primeiraChave = null, ultimaChave = null;
    
    for (const chave of chavesSet) {
        if (!primeiraChave || compararChaves(chave, primeiraChave) < 0) primeiraChave = chave;
        if (!ultimaChave || compararChaves(chave, ultimaChave) > 0) ultimaChave = chave;
    }

    if (modo.toLowerCase() === "anual") {
        primeiraChave = primeiraChave ? primeiraChave.split('-')[1] : null;
        ultimaChave = ultimaChave ? ultimaChave.split('-')[1] : null;
    }

    return { ultimaChave, primeiraChave };
}
/**
 * Compara duas chaves de período no formato "MM-AAAA" ou "AAAA" para ordenação cronológica.
 * @param {string} a - A primeira chave.
 * @param {string} b - A segunda chave.
 * @returns {number} Um número negativo se a < b, positivo se a > b, e 0 se a === b.
 */
function compararChaves(a, b) {
    const [mesA, anoA] = a.split('-').map(Number);
    const [mesB, anoB] = b.split('-').map(Number);

    if (anoA !== anoB) return anoA - anoB;
    return mesA - mesB;
}

export { processarDadosDaConta, extrairDadosDosTitulos, mergeMatrizes };






