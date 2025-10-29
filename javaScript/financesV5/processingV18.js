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
function extrairDadosDosTitulos(titulos, contaId) {
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
            // Filtra lançamentos que não foram pagos por está conta  
            if (Number(lancamento.CODContaC) === contaId) {
                lancamentosProcessados.push({
                    Natureza: titulo.Natureza,
                    DataLancamento: lancamento.DataLancamento,
                    CODContaC: lancamento.CODContaC,
                    ValorLancamento: lancamento.ValorLancamento,
                    CODCategoria: titulo.Categoria,
                    Cliente: titulo.Cliente,
                    Departamentos: departamentosObj
                });
            }

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
 * //   matrizDetalhamento: { "Classe|Periodo": { Categorias[{ total, departamentos [{total, fornecedores { fornecedors, total }}]}] }
 * //   chavesComDados: ("03-2025", "04-2025", ...),
 * //   valorTotal: 3500
 * //   entradasESaidas { "Entradas":{ "02-2023": 1500...}, "Saidas" {"01-2024": 2000...}...}
 * // }
 */
function processarRealizadoRealizar(dadosBase, lancamentos, contaId, saldoIni) {
    const matrizDRE = {}, matrizDetalhamento = {}, chavesComDados = new Set();
    const fluxoDeCaixa = {};
    const entradasESaidas = {
        '(+) Entradas': {},
        '(-) Saídas': {},
        '(+) Entradas de Transferência': {},
        '(-) Saídas de Transferência': {}
    };
    const ent = entradasESaidas["(+) Entradas"]
    const sai = entradasESaidas["(-) Saídas"]
    const entT = entradasESaidas["(+) Entradas de Transferência"]
    const saiT = entradasESaidas["(-) Saídas de Transferência"]

    let valorTotal = 0;
    
    // Classes que terão seus dados detalhados por departamento/categoria/fornecedor.
    const classesParaDetalhar = new Set([
        '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL',
        '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos', 
        '(+/-) Empréstimos/Consórcios'
    ]);
    
    lancamentos.forEach(lancamento => {

        const lancamentoFluxoDiario = {
            valor: lancamento.ValorLancamento,
            fornecedor: lancamento.Cliente,
            data: lancamento.DataLancamento
        }
        fluxoDeCaixa.push(lancamentoFluxoDiario);

        // Ignora lançamentos que não pertencem à conta que está sendo processada.
        if (contaId != Number(lancamento.CODContaC)) return;
        if (!lancamento || !lancamento.DataLancamento || !lancamento.CODContaC) return;
        
        // Cria a chave de agregação no formato 'MM-AAAA'.
        const [dia, mesRaw, ano] = lancamento.DataLancamento.split('/');
        const chaveAgregacao = `${mesRaw.padStart(2, '0')}-${ano}`;
        chavesComDados.add(chaveAgregacao);
    
        // Converte o valor para negativo se for um pagamento.
        let valor = lancamento.ValorLancamento;
        if (lancamento.Natureza === "P") valor = -valor;
        valorTotal += valor;

        // Encontra a classe da DRE correspondente à categoria do lançamento.
        const codCat = lancamento.CODCategoria
        const classeInfo = dadosBase.classesMap.get(lancamento.CODCategoria);
        const classe = classeInfo ? classeInfo.classe : 'Outros';

        // Adiciona o valor à matriz DRE na classe e período corretos.
        if (!matrizDRE[classe]) matrizDRE[classe] = {};
        matrizDRE[classe][chaveAgregacao] = (matrizDRE[classe][chaveAgregacao] || 0) + valor;

        // Adiciona também às linhas totalizadoras de entradas e saídas.
        if (valor < 0) { 
            if (codCat.startsWith("0.01")){ saiT[chaveAgregacao] = (saiT[chaveAgregacao] || 0) + valor
            } else sai[chaveAgregacao] = (sai[chaveAgregacao] || 0) + valor
        } else {
            if (codCat.startsWith("0.01")){ entT[chaveAgregacao] = (entT[chaveAgregacao] || 0) + valor
            } else ent[chaveAgregacao] = (ent[chaveAgregacao] || 0) + valor
        }

        // Se a classe do lançamento deve ser detalhada, processa os departamentos.
         if (classesParaDetalhar.has(classe) && Array.isArray(lancamento.Departamentos) && lancamento.Departamentos.length > 0) {
            const fornecedor = lancamento.Cliente || "Não informado";
            const codCategoria = lancamento.CODCategoria
            const chavePrimaria = `${classe}|${chaveAgregacao}`; // Ex: "(-) Despesas|09-2025"

            // Garante a existência da entrada principal
            if (!matrizDetalhamento[chavePrimaria]) {
                matrizDetalhamento[chavePrimaria] = { total: 0, departamentos: {} };
            }
            const entradaMatriz = matrizDetalhamento[chavePrimaria];

            lancamento.Departamentos.forEach(depto => {
                let valorRateio = depto.ValorDepto;
                if (lancamento.Natureza === "P") valorRateio = -valorRateio;
                
                entradaMatriz.total += valorRateio; // Adiciona ao total da classe/período
                const nomeDepto = dadosBase.departamentosMap.get(depto.CodDpto) || 'Outros Departamentos';

                if (!entradaMatriz.departamentos[nomeDepto]) {
                    entradaMatriz.departamentos[nomeDepto] = { total: 0, categorias: {} };
                }
                const deptoRef = entradaMatriz.departamentos[nomeDepto];
                deptoRef.total += valorRateio;

                if (!deptoRef.categorias[codCategoria]) {
                    deptoRef.categorias[codCategoria] = { total: 0, fornecedores: {} };
                }
                const catRef = deptoRef.categorias[codCategoria];
                catRef.total += valorRateio;
                
                if (!catRef.fornecedores[fornecedor]) {
                    catRef.fornecedores[fornecedor] = { total: 0 };
                }
                catRef.fornecedores[fornecedor].total += valorRateio;
            });
        }
    });

    return { matrizDRE, matrizDetalhamento, chavesComDados, valorTotal, entradasESaidas, saldoIni, fluxoDeCaixa };
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
    const todasAsChaves = new Set();

    const fluxoDeCaixaMensal = {};
    const matrizCapitalGiro = {};
    const linhasMatriz = [
        '(+) Caixa',
        '(+) Clientes a Receber', 'Curto Prazo AR', 'Longo Prazo AR',
        '(-) Fornecedores a Pagar', 'Curto Prazo AP', 'Longo Prazo AP',
        'Curto Prazo TT', 'Longo Prazo TT', 'Capital Liquido'
    ];
    linhasMatriz.forEach(linha => matrizCapitalGiro[linha] = {});

    const anoAtual = new Date().getFullYear();
    const mesAtual = new Date().getMonth() + 1; // +1 porque getMonth() é 0-indexed
    const chaveMesAtual = `${String(mesAtual).padStart(2, '0')}-${anoAtual}`;

    if (!Array.isArray(capitalDeGiro)) return { saldoInicial, fluxoDeCaixaMensal, matrizCapitalGiro };

    for (const item of capitalDeGiro) {
        const valor = item.Natureza === 'P' ? -item.ValorTitulo : item.ValorTitulo;
        if (!valor) continue;

        // --- (1) Fluxo de caixa (pagamentos efetivos) ---
        if (item.DataPagamento && item.CODContaPagamento == contaId) {
            const [dia, mes, ano] = item.DataPagamento.split('/');
            const chavePeriodo = `${mes.padStart(2, '0')}-${ano}`;

            if(compararChaves(chavePeriodo, chaveMesAtual) >= 0) continue;
            fluxoDeCaixaMensal[chavePeriodo] = (fluxoDeCaixaMensal[chavePeriodo] || 0) + valor;
            todasAsChaves.add(chavePeriodo);
        }

        // --- (2) Projeções de A Pagar / A Receber ---
        if (item.DataEmissao && item.DataVencimento && item.CODContaEmissao == contaId) {
            const [, mesE, anoE] = item.DataEmissao.split('/');
            const [, mesV, anoV] = item.DataVencimento.split('/');
            const chaveEmissao = `${mesE.padStart(2, '0')}-${anoE}`;
            const chaveVencimento = `${mesV.padStart(2, '0')}-${anoV}`;

            // Caso tenha pagamento registrado, considerar até o mês de pagamento
            let chaveFinal = chaveVencimento;
            if (item.DataPagamento) {
                const [, mesP, anoP] = item.DataPagamento.split('/');
                chaveFinal = `${mesP.padStart(2, '0')}-${anoP}`;
            }

            if (!chaveEmissao || !chaveFinal) {
                console.warn('Chave inválida, pulando item:', item);
                continue;
            }

            // Itera pelos meses entre emissão e pagamento/vencimento
            if (compararChaves(chaveEmissao, chaveFinal) <= 0) {
                let chave = chaveEmissao;
                do {
                    if (!chave) break; // Segurança

                    const proximaChave = incrementarMes(chave);
                    // A projeção existe até o mês do vencimento/pagamento.
                    // O valor é de "curto prazo" no mês final.
                    if(compararChaves(chave, chaveMesAtual) >= 0) break;
                    const isUltimo = compararChaves(chave, chaveFinal) === 0;

                    if (item.Natureza === 'P') {
                        matrizCapitalGiro['(-) Fornecedores a Pagar'][chave] = (matrizCapitalGiro['(-) Fornecedores a Pagar'][chave] || 0) + valor;
                        if (isUltimo){
                            matrizCapitalGiro['Curto Prazo AP'][chave] = (matrizCapitalGiro['Curto Prazo AP'][chave] || 0) + valor;     
                        } else{
                            matrizCapitalGiro['Longo Prazo AP'][chave] = (matrizCapitalGiro['Longo Prazo AP'][chave] || 0) + valor;
                        }
                    } else if (item.Natureza === 'R') {
                        matrizCapitalGiro['(+) Clientes a Receber'][chave] = (matrizCapitalGiro['(+) Clientes a Receber'][chave] || 0) + valor;
                        if (isUltimo){
                            matrizCapitalGiro['Curto Prazo AR'][chave] = (matrizCapitalGiro['Curto Prazo AR'][chave] || 0) + valor;
                        } else{
                            matrizCapitalGiro['Longo Prazo AR'][chave] = (matrizCapitalGiro['Longo Prazo AR'][chave] || 0) + valor;
                        }
                    }

                    todasAsChaves.add(chave)
                    if (isUltimo) break; // Sai do loop após processar o mês final
                    chave = proximaChave;

                } while (chave && compararChaves(chave, chaveFinal) <= 0);
            }
        }
    }

    // --- (3) Preenche a linha '(+) Caixa' usando o fluxo de caixa mensal ---
    const chavesOrdenadas = Array.from(todasAsChaves).sort(compararChaves); // garante ordem temporal
    let saldoAcumulado = saldoInicial;

    chavesOrdenadas.forEach(chave => {
        const curtoPrazo = (matrizCapitalGiro['Curto Prazo AP'][chave] || 0) + (matrizCapitalGiro['Curto Prazo AR'][chave] || 0)
        const longoPrazo = (matrizCapitalGiro['Longo Prazo AP'][chave] || 0) + (matrizCapitalGiro['Longo Prazo AR'][chave] || 0)

        saldoAcumulado += fluxoDeCaixaMensal[chave] || 0;
        matrizCapitalGiro['(+) Caixa'][chave] = saldoAcumulado;
        matrizCapitalGiro['Curto Prazo TT'][chave] = curtoPrazo
        matrizCapitalGiro['Longo Prazo TT'][chave] = longoPrazo
        matrizCapitalGiro['Capital Liquido'][chave] = curtoPrazo + longoPrazo + saldoAcumulado;
    });
    
    return { saldoInicial, matrizCapitalGiro };
}
function incrementarMes(chave) {
    if (!chave) return null;
    const partes = chave.split('-');
    if (partes.length !== 2) return null;
    let [mesStr, anoStr] = partes;
    let mes = parseInt(mesStr, 10);
    let ano = parseInt(anoStr, 10);
    if (isNaN(mes) || isNaN(ano)) return null;

    mes += 1;
    if (mes > 12) {
        mes = 1;
        ano += 1;
    }
    return `${mes.toString().padStart(2, '0')}-${ano}`;
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
 * //   realizado: { matrizDRE, matrizDetalhamento, chavesComDados, valorTotal },
 * //   arealizar: { matrizDRE, matrizDetalhamento, chavesComDados, valorTotal },
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
 * //     matrizDetalhamento: { "Classe|Periodo": { ...dados consolidados } } 
 *        entradasESaidas: 
 * //   },
 * //   saldoBaseTotal: 15000, // Soma dos saldos iniciais de todas as contas.
 * //   todasChaves: Set("01-2025", "02-2025", ...) // Um Set com todos os períodos únicos.
 * // }
 */
function mergeDadosMensais(listaDeDadosProcessados, projecao) {
    const monthlyMerged = { matrizDRE: {}, matrizDetalhamento: {},
    entradasESaidas: {}, matrizCapitalGiro: {}, fluxoDeCaixa: {} };
    const todasChaves = new Set();

    listaDeDadosProcessados.forEach(dados => {
        dados.chavesComDados.forEach(chave => todasChaves.add(chave));

        mergeGenericoMensal(dados.matrizDRE, monthlyMerged.matrizDRE);
        mergeGenericoMensal(dados.entradasESaidas, monthlyMerged.entradasESaidas);
        if(projecao.toLowerCase() == "realizado") mergeGenericoMensal(dados.matrizCapitalGiro, monthlyMerged.matrizCapitalGiro) 
        
        monthlyMerged.fluxoDeCaixa = monthlyMerged.fluxoDeCaixa.concat(dados.fluxoDeCaixa);

        // Mescla matrizDetalhamento
        for (const chavePrimaria in dados.matrizDetalhamento) {
            const dadosOrigem = dados.matrizDetalhamento[chavePrimaria];
            
            if (!monthlyMerged.matrizDetalhamento[chavePrimaria]) {
                monthlyMerged.matrizDetalhamento[chavePrimaria] = JSON.parse(JSON.stringify(dadosOrigem));
            } else {
                const dadosDestino = monthlyMerged.matrizDetalhamento[chavePrimaria];
                dadosDestino.total += dadosOrigem.total;

                for (const nomeDepto in dadosOrigem.departamentos) {
                    const deptoOrigem = dadosOrigem.departamentos[nomeDepto];
                    if (!dadosDestino.departamentos[nomeDepto]) {
                        dadosDestino.departamentos[nomeDepto] = JSON.parse(JSON.stringify(deptoOrigem));
                    } else {
                        const deptoDestino = dadosDestino.departamentos[nomeDepto];
                        deptoDestino.total += deptoOrigem.total;

                        for (const codCat in deptoOrigem.categorias) {
                            const catOrigem = deptoOrigem.categorias[codCat];
                            if (!deptoDestino.categorias[codCat]) {
                                deptoDestino.categorias[codCat] = JSON.parse(JSON.stringify(catOrigem));
                            } else {
                                const catDestino = deptoDestino.categorias[codCat];
                                catDestino.total += catOrigem.total;

                                for (const nomeForn in catOrigem.fornecedores) {
                                    const fornOrigem = catOrigem.fornecedores[nomeForn];
                                    if (!catDestino.fornecedores[nomeForn]) {
                                        catDestino.fornecedores[nomeForn] = JSON.parse(JSON.stringify(fornOrigem));
                                    } else {
                                        catDestino.fornecedores[nomeForn].total += fornOrigem.total;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });
    
    return { monthlyMerged, todasChaves };
}
/**
 * Mescla uma matriz numérica de um objeto de dados em outro objeto acumulador.
 * @param {object} origem - Matriz de origem (ex.: dados.matrizDRE)
 * @param {object} destino - Matriz de destino (ex.: monthlyMerged.matrizDRE)
 */
function mergeGenericoMensal(origem, destino) {
    for (const chave in origem) {
        if (!destino[chave]) destino[chave] = {};
        for (const periodo in origem[chave]) {
            destino[chave][periodo] = (destino[chave][periodo] || 0) + origem[chave][periodo];
        }
    }
}
/**
 * Agrega os dados mensais consolidados em totais anuais, tratando corretamente as linhas de saldo.
 * @param {object} monthlyData - O objeto de dados mesclados com valores mensais.
 * @returns {object} Um novo objeto de dados com a mesma estrutura, mas com valores agregados por ano.
 */
function agregarDadosParaAnual(monthlyData, projecao) {
    const annualData = { matrizDRE: {}, matrizDetalhamento: {}, entradasESaidas: {},
    matrizCapitalGiro: {}, fluxoDeCaixa: {} };
    const saldosAnuais = {};

    // --- Fluxo de Caixa ---
    annualData.fluxoDeCaixa = monthlyData.fluxoDeCaixa;

    // --- Matriz DRE ---
    for (const classe in monthlyData.matrizDRE) {
        annualData.matrizDRE[classe] = {};
        for (const periodo in monthlyData.matrizDRE[classe]) {
            const [mes, ano] = periodo.split('-');
            const valor = monthlyData.matrizDRE[classe][periodo];

            if (classe === 'Caixa Inicial' || classe === 'Caixa Final') {
                atualizarSaldoAnual(saldosAnuais, classe, ano, mes, valor);
            } else {
                somaValor(annualData.matrizDRE[classe], ano, valor);
            }
        }
    }

    // --- Entradas e Saídas ---
    for (const classe in monthlyData.entradasESaidas) {
        annualData.entradasESaidas[classe] = {};
        for (const periodo in monthlyData.entradasESaidas[classe]) {
            const ano = periodo.split('-')[1];
            const valor = monthlyData.entradasESaidas[classe][periodo];
            somaValor(annualData.entradasESaidas[classe], ano, valor);
        }
    }

    // --- Aplica saldos calculados ---
    for (const classe in saldosAnuais) {
        for (const ano in saldosAnuais[classe]) {
            annualData.matrizDRE[classe][ano] = saldosAnuais[classe][ano].valor;
        }
    }

    // --- Detalhamento ---
    for (const chaveMensal in monthlyData.matrizDetalhamento) {
        const dadosMensais = monthlyData.matrizDetalhamento[chaveMensal];
        const [classe, periodoMensal] = chaveMensal.split('|');
        const ano = periodoMensal.split('-')[1];
        const chaveAnual = `${classe}|${ano}`;
        if (!annualData.matrizDetalhamento[chaveAnual]) annualData.matrizDetalhamento[chaveAnual] = { total: 0, departamentos: {} };

        const dadosAnuais = annualData.matrizDetalhamento[chaveAnual];
        dadosAnuais.total += dadosMensais.total;
        mergeDetalhamentoNivel(dadosAnuais.departamentos, dadosMensais.departamentos);
    }

    // --- Agrega Matriz Capital de Giro ---
    if(projecao.toLowerCase() == "realizado"){
        const saldosAnuaisCG = {};
        const anoAtual = new Date().getFullYear();
        const mesAnterior = new Date().getMonth(); // +1 porque getMonth() é 0-indexed (Janeiro=0)

        for (const linha in monthlyData.matrizCapitalGiro) {
            annualData.matrizCapitalGiro[linha] = {};

            for (const periodoMensal in monthlyData.matrizCapitalGiro[linha]) {
                const [mes, ano] = periodoMensal.split('-');
                const anoNum = Number(ano);
                const mesNum = Number(mes);
                const valor = monthlyData.matrizCapitalGiro[linha][periodoMensal];

                if (anoNum === anoAtual && mesNum > mesAnterior) {
                    continue; // Pula este mês futuro
                }
                if (!saldosAnuaisCG[linha]) saldosAnuaisCG[linha] = {};
                const existente = saldosAnuaisCG[linha][ano];
                // Guarda o valor do último mês
                if (!existente || mes > existente.mes) {
                    saldosAnuaisCG[linha][ano] = { mes, valor };
                }
            }
        }
        for (const linha in saldosAnuaisCG) {
            for (const ano in saldosAnuaisCG[linha]) {
                annualData.matrizCapitalGiro[linha][ano] = saldosAnuaisCG[linha][ano].valor;
            }
        }
    }
    
    return annualData;
}
/**
 * Soma valores em um objeto destino, inicializando se necessário.
 */
function somaValor(destino, chave, valor) {
    destino[chave] = (destino[chave] || 0) + valor;
}
/**
 * Atualiza os saldos anuais (Caixa Inicial/Final)
 */
function atualizarSaldoAnual(saldosAnuais, classe, ano, mes, valor) {
    if (!saldosAnuais[classe]) saldosAnuais[classe] = {};
    const existente = saldosAnuais[classe][ano];
    if (classe === 'Caixa Final') {
        if (!existente || mes > existente.mes) saldosAnuais[classe][ano] = { mes, valor };
    } else if (classe === 'Caixa Inicial') {
        if (!existente || mes < existente.mes) saldosAnuais[classe][ano] = { mes, valor };
    }
}
/**
 * Mescla dados detalhados de um nível (departamento/categoria/fornecedor)
 */
function mergeDetalhamentoNivel(destino, origem) {
    for (const key in origem) {
        if (!destino[key]) destino[key] = JSON.parse(JSON.stringify(origem[key]));
        else {
            destino[key].total += origem[key].total;
            if (origem[key].departamentos) mergeDetalhamentoNivel(destino[key].departamentos, origem[key].departamentos);
            if (origem[key].categorias) mergeDetalhamentoNivel(destino[key].categorias, origem[key].categorias);
            if (origem[key].fornecedores) mergeDetalhamentoNivel(destino[key].fornecedores, origem[key].fornecedores);
        }
    }
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
    if(PeUChave.primeiraChave){
        let colSaldIni
        let colSaldFim
        let i = compararChaves(PeUChave.primeiraChave, colunasVisiveis[0])
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
 * //   matrizDetalhamento: { "NomeDepto|Classe": { ...dados detalhados... } },
 * //   saldoInicialPeriodo: 12345.67,
 * //   PeUChave: { ultimaChave: "12-2025", primeiraChave: "01-2025" },
 * //   matrizCapitalGiro: { "(+) Caixa": { "01-2025": 5000, ... }, ... }
 * // }
 */
function mergeMatrizes(dadosProcessados, modo, colunasVisiveis, projecao) {
    // Seleciona os dados da projeção correta E anexa a matriz de capital de giro ao objeto 'realizado'.
    const dadosSelecionados = dadosProcessados.map(dadosConta => {
        const projData = dadosConta[projecao.toLowerCase()];
        if (!projData) return null;

        // Se a projeção for 'realizado', injeta a matrizCapitalGiro para que ela não seja perdida.
        if (projecao.toLowerCase() === 'realizado' && dadosConta.capitalDeGiro) {
            projData.matrizCapitalGiro = dadosConta.capitalDeGiro.matrizCapitalGiro;
        }
        return projData;
    }).filter(Boolean);

    // Retorna um resultado vazio se não houver dados de entrada.
    if (!dadosSelecionados || dadosSelecionados.length === 0) {
        return { matrizDRE: {}, matrizDetalhamento: {},
        matrizCapitalGiro: {}, entradasESaidas: {}, fluxoDeCaixa: {} };
    }

    // 1. Mescla os dados mensais de todas as contas.
    const { monthlyMerged, todasChaves } = mergeDadosMensais(dadosSelecionados, projecao);
    
    // 2. Agrega os dados para o formato ANUAL, se necessário.
    const dadosParaExibir = (modo.toLowerCase() === 'anual')
        ? agregarDadosParaAnual(monthlyMerged, projecao)
        : monthlyMerged;

    // 3. Obtém a primeira e a última chave dos períodos disponíveis para controle na UI.
    const PeUChave = getChavesDeControle(todasChaves, modo);

    // 4. Somo o saldo inicial das contas selecionadas
    let saldoInicialConsolidado = dadosProcessados.reduce((acc, dadosConta) => {
        const saldoIni = dadosConta[projecao.toLowerCase()]?.saldoIni || 0;
        return acc + saldoIni;
    },0);
    
    // 5. Prepara as colunas e a matriz para o cálculo de totais.
    const matrizDRE = dadosParaExibir.matrizDRE;
    
    // Determina se as colunas para o cálculo de balanço são MESES ou ANOS.
    const colunasParaCalcular = (modo.toLowerCase() === 'anual')
        ? Array.from(new Set(Array.from(todasChaves).map(chave => chave.split('-')[1]))).sort()
        : Array.from(todasChaves).sort(compararChaves);

    // Garante que as linhas de total existam na matriz.
    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'].forEach(classe => {
        if (!matrizDRE[classe]) matrizDRE[classe] = {};
    });
    
    // 6. Executa o cálculo das linhas de total sobre os dados consolidados.
    calcularLinhasDeTotalDRE(matrizDRE, colunasParaCalcular, saldoInicialConsolidado);

    // 7. Calcula a coluna "TOTAL" final.
    calcularColunaTotalDRE(matrizDRE, colunasVisiveis, PeUChave);
    
    console.log(dadosParaExibir.matrizCapitalGiro)
    // Retorna o objeto final, pronto para a renderização.
    return { ...dadosParaExibir};
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






