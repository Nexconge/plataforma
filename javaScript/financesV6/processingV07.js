// processing.js

// ------ Funções Auxiliares ------
/**
 * Converte uma string de data no formato "DD/MM/AAAA" para um objeto Date do JavaScript.
 * @param {string} dateString - A string da data a ser convertida.
 * @returns {Date|null} Um objeto Date ou null se a string for inválida.
 */
function parseDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

function gerarDepartamentosObj(departamentos, valorLancamento) {
    if (Array.isArray(departamentos) && departamentos.length > 0) {
        return departamentos.map(depto => {
            const valorRateio = valorLancamento * ((depto.PercDepto ?? 100) / 100);
            return {
                CodDpto: depto.CODDepto ? String(depto.CODDepto) : "0",
                ValorDepto: valorRateio
            };
        });
    }
    return [{
        CodDpto: "0", 
        ValorDepto: valorLancamento
    }];
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

function somaValor(destino, chave, valor) {
    destino[chave] = (destino[chave] || 0) + valor;
}

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

function gerarPeriodosEntre(primeiraChave, ultimaChave, modo = "mensal") {
    const resultado = [];
    if (!primeiraChave || !ultimaChave) return resultado;
    
    if (modo === "anual") {
        for (let ano = primeiraChave; ano <= ultimaChave; ano++) {
            resultado.push(ano.toString());
        }
        return resultado;
    }

    if (modo === "mensal") {
        let atual = primeiraChave;
        resultado.push(atual);
        while (atual !== ultimaChave) {
            atual = incrementarMes(atual);
            if (!atual) break; 
            resultado.push(atual);
        }
        return resultado;
    }
    throw new Error('Modo inválido. Use "anual" ou "mensal".');
}

function compararChaves(a, b) {
    const [mesA, anoA] = a.split('-').map(Number);
    const [mesB, anoB] = b.split('-').map(Number);
    if (anoA !== anoB) return anoA - anoB;
    return mesA - mesB;
}

// ------ Funções de Processamento ------

/**
 * Orquestra o processamento completo dos dados de uma única conta.
 * CORREÇÃO: Passa 'dadosRealizado' para 'processarCapitalDeGiro' para sincronizar o saldo de caixa.
 */
function processarDadosDaConta(AppCache, dadosApi, contaId, saldoInicialExterno = 0) {
    const lancamentos = dadosApi.lancamentosProcessados || dadosApi.lancamentos || [];
    const titulos = dadosApi.titulosEmAberto || dadosApi.titulos || [];
    const capitalDeGiro = dadosApi.capitalDeGiro || [];

    const saldoIniCC = Number(saldoInicialExterno);
    
    // Processa os dados para o modo REALIZADO (usa a lista de lancamentos)
    const dadosRealizado = processarRealizadoRealizar(AppCache, lancamentos, contaId, saldoIniCC);
    
    // Processa os dados para o modo A REALIZAR (usa a lista de titulos em aberto)
    const dadosARealizar = processarRealizadoRealizar(AppCache, titulos, contaId, saldoIniCC);
    
    // Processa Capital de Giro (passando dadosRealizado para sincronia)
    const dadosCapitalDeGiro = processarCapitalDeGiro(AppCache, capitalDeGiro, contaId, saldoIniCC, dadosRealizado);

    return {
        realizado: dadosRealizado,
        arealizar: dadosARealizar,
        capitalDeGiro: dadosCapitalDeGiro,
        saldoInicialBase: saldoIniCC
    };
}

function extrairDadosDosTitulos(titulos, contaId) {
    const lancamentosProcessados = [];
    const titulosEmAberto = [];
    const capitalDeGiro = [];

    if (!Array.isArray(titulos)) {
        console.error("A entrada para a função não é um array.", titulos);
        return { lancamentosProcessados, titulosEmAberto, capitalDeGiro };
    }
    
    titulos.forEach(titulo => {
        if (!titulo || !titulo.Categoria) return;

        let ValorPago = 0;
        titulo.Lancamentos.forEach(lancamento => {
            if (!lancamento.DataLancamento || !lancamento.CODContaC || typeof lancamento.ValorLancamento === 'undefined') return;

            let departamentosObj = gerarDepartamentosObj(titulo.Departamentos, lancamento.ValorLancamento);
            
            if (String(lancamento.CODContaC) === contaId){
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

            capitalDeGiro.push({
                Natureza: titulo.Natureza,
                DataPagamento: lancamento.DataLancamento || null,
                DataVencimento: titulo.DataVencimento || null,
                DataEmissao: titulo.DataEmissao || null,
                ValorTitulo: lancamento.ValorLancamento || 0,
                CODContaEmissao: titulo.CODContaC || null,
                CODContaPagamento: lancamento.CODContaC || null
            });

            ValorPago += lancamento.ValorBaixado
        });

        const valorFaltante = (titulo.ValorTitulo - ValorPago);
        if (valorFaltante >= 0.01 && titulo.ValorTitulo != 0) {
            let departamentosObj = gerarDepartamentosObj(titulo.Departamentos, valorFaltante);
            
            titulosEmAberto.push({
                Natureza: titulo.Natureza,
                DataLancamento: titulo.DataVencimento, 
                CODContaC: titulo.CODContaC,
                ValorLancamento: valorFaltante,
                CODCategoria: titulo.Categoria,
                Cliente: titulo.Cliente || "Cliente",
                Departamentos: departamentosObj
            });
            
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

function processarRealizadoRealizar(dadosBase, lancamentos, contaId, saldoIni) {
    const matrizDRE = {}, matrizDetalhamento = {}, chavesComDados = new Set();
    const fluxoDeCaixa = [];
    const entradasESaidas = {
        '(+) Entradas': {}, '(-) Saídas': {},
        '(+) Entradas de Transferência': {}, '(-) Saídas de Transferência': {}
    };
    const ent = entradasESaidas["(+) Entradas"];
    const sai = entradasESaidas["(-) Saídas"];
    const entT = entradasESaidas["(+) Entradas de Transferência"];
    const saiT = entradasESaidas["(-) Saídas de Transferência"];

    let valorTotal = 0;
    
    const classesParaDetalhar = new Set([
        '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL',
        '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos', 
        '(+/-) Empréstimos/Consórcios'
    ]);
    
    lancamentos.forEach(lancamento => {
        if (contaId !== String(lancamento.CODContaC)) return;
        if (!lancamento || !lancamento.DataLancamento || !lancamento.CODContaC) return;
        
        const [dia, mesRaw, ano] = lancamento.DataLancamento.split('/');
        const chaveAgregacao = `${mesRaw.padStart(2, '0')}-${ano}`;
        chavesComDados.add(chaveAgregacao);
    
        let valor = lancamento.ValorLancamento;
        if (lancamento.Natureza === "P") valor = -valor;
        valorTotal += valor;

        const codCat = lancamento.CODCategoria;
        const classeInfo = dadosBase.classesMap.get(lancamento.CODCategoria);
        const classe = classeInfo ? classeInfo.classe : 'Outros';

        let descricaoFluxo = '';
        if(codCat.startsWith("0.01") ){descricaoFluxo = 'Transferência Entre Contas'} else {
            descricaoFluxo = `${dadosBase.categoriasMap.get(codCat)} - ${lancamento.Cliente}`
        }
        const lancamentoFluxoDiario = {
            valor: valor,
            descricao: descricaoFluxo,
            data: lancamento.DataLancamento
        }
        fluxoDeCaixa.push(lancamentoFluxoDiario);

        if (!matrizDRE[classe]) matrizDRE[classe] = {};
        matrizDRE[classe][chaveAgregacao] = (matrizDRE[classe][chaveAgregacao] || 0) + valor;

        if (valor < 0) { 
            if (codCat.startsWith("0.01")){ saiT[chaveAgregacao] = (saiT[chaveAgregacao] || 0) + valor
            } else sai[chaveAgregacao] = (sai[chaveAgregacao] || 0) + valor
        } else {
            if (codCat.startsWith("0.01")){ entT[chaveAgregacao] = (entT[chaveAgregacao] || 0) + valor
            } else ent[chaveAgregacao] = (ent[chaveAgregacao] || 0) + valor
        }

         if (classesParaDetalhar.has(classe) && Array.isArray(lancamento.Departamentos) && lancamento.Departamentos.length > 0) {
            const fornecedor = lancamento.Cliente || "Não informado";
            const codCategoria = lancamento.CODCategoria
            const chavePrimaria = `${classe}|${chaveAgregacao}`; 

            if (!matrizDetalhamento[chavePrimaria]) {
                matrizDetalhamento[chavePrimaria] = { total: 0, departamentos: {} };
            }
            const entradaMatriz = matrizDetalhamento[chavePrimaria];

            lancamento.Departamentos.forEach(depto => {
                let valorRateio = depto.ValorDepto;
                if (lancamento.Natureza === "P") valorRateio = -valorRateio;
                
                entradaMatriz.total += valorRateio; 
                const nomeDepto = dadosBase.departamentosMap.get(String(depto.CodDpto)) || 'Outros Departamentos';

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
    fluxoDeCaixa.sort((a, b) => parseDate(a.data) - parseDate(b.data));
    
    return { matrizDRE, matrizDetalhamento, chavesComDados, valorTotal, entradasESaidas, saldoIni, fluxoDeCaixa };
}

/**
 * Pré-processa os dados de capital de giro.
 * CORREÇÃO: Recebe 'dadosRealizado' para usar o 'Caixa Final' da DRE como fonte da verdade.
 */
function processarCapitalDeGiro(dadosBase, capitalDeGiro, contaId, saldoInicialParam, dadosRealizado = null) {
    const saldoInicial = Number(saldoInicialParam) || 0;
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
    const mesAtual = new Date().getMonth() + 1; 
    const chaveMesAtual = `${String(mesAtual).padStart(2, '0')}-${anoAtual}`;

    if (!Array.isArray(capitalDeGiro)) return { saldoInicial, fluxoDeCaixaMensal, matrizCapitalGiro };

    for (const item of capitalDeGiro) {
        const valor = item.Natureza === 'P' ? -item.ValorTitulo : item.ValorTitulo;
        if (!valor) continue;

        // (1) Fluxo de caixa (pagamentos efetivos) - APENAS para uso local se DRE não existir
        if (item.DataPagamento && String(item.CODContaPagamento) === contaId) {
            const [dia, mes, ano] = item.DataPagamento.split('/');
            const chavePeriodo = `${mes.padStart(2, '0')}-${ano}`;
            if(compararChaves(chavePeriodo, chaveMesAtual) >= 0) continue;
            fluxoDeCaixaMensal[chavePeriodo] = (fluxoDeCaixaMensal[chavePeriodo] || 0) + valor;
            todasAsChaves.add(chavePeriodo);
        }

        // (2) Projeções de A Pagar / A Receber
        if (item.DataEmissao && item.DataVencimento && String(item.CODContaEmissao) === contaId) {
            const [, mesE, anoE] = item.DataEmissao.split('/');
            const [, mesV, anoV] = item.DataVencimento.split('/');
            const chaveEmissao = `${mesE.padStart(2, '0')}-${anoE}`;
            const chaveVencimento = `${mesV.padStart(2, '0')}-${anoV}`;

            let chaveFinal = chaveVencimento;
            if (item.DataPagamento) {
                const [, mesP, anoP] = item.DataPagamento.split('/');
                chaveFinal = `${mesP.padStart(2, '0')}-${anoP}`;
            }

            if (!chaveEmissao || !chaveFinal) continue;

            if (compararChaves(chaveEmissao, chaveFinal) <= 0) {
                let chave = chaveEmissao;
                do {
                    if (!chave) break;
                    const proximaChave = incrementarMes(chave);
                    if(compararChaves(chave, chaveMesAtual) >= 0) break;
                    const isUltimo = compararChaves(chave, chaveFinal) === 0;

                    if (item.Natureza === 'P') {
                        matrizCapitalGiro['(-) Fornecedores a Pagar'][chave] = (matrizCapitalGiro['(-) Fornecedores a Pagar'][chave] || 0) + valor;
                        if (isUltimo) matrizCapitalGiro['Curto Prazo AP'][chave] = (matrizCapitalGiro['Curto Prazo AP'][chave] || 0) + valor;     
                        else matrizCapitalGiro['Longo Prazo AP'][chave] = (matrizCapitalGiro['Longo Prazo AP'][chave] || 0) + valor;
                    } else if (item.Natureza === 'R') {
                        matrizCapitalGiro['(+) Clientes a Receber'][chave] = (matrizCapitalGiro['(+) Clientes a Receber'][chave] || 0) + valor;
                        if (isUltimo) matrizCapitalGiro['Curto Prazo AR'][chave] = (matrizCapitalGiro['Curto Prazo AR'][chave] || 0) + valor;
                        else matrizCapitalGiro['Longo Prazo AR'][chave] = (matrizCapitalGiro['Longo Prazo AR'][chave] || 0) + valor;
                    }

                    todasAsChaves.add(chave)
                    if (isUltimo) break;
                    chave = proximaChave;
                } while (chave && compararChaves(chave, chaveFinal) <= 0);
            }
        }
    }

    // (3) Preenche a linha '(+) Caixa'
    const chavesOrdenadas = Array.from(todasAsChaves).sort(compararChaves);
    let saldoAcumulado = saldoInicial;

    chavesOrdenadas.forEach(chave => {
        const curtoPrazo = (matrizCapitalGiro['Curto Prazo AP'][chave] || 0) + (matrizCapitalGiro['Curto Prazo AR'][chave] || 0)
        const longoPrazo = (matrizCapitalGiro['Longo Prazo AP'][chave] || 0) + (matrizCapitalGiro['Longo Prazo AR'][chave] || 0)

        // CORREÇÃO APLICADA:
        // Em vez de buscar 'Caixa Final' (que não existe ainda), calculamos o saldo
        // usando os mesmos fluxos (Entradas/Saídas) que geraram a DRE.
        let saldoDRE = null;
        if (dadosRealizado && dadosRealizado.entradasESaidas) {
            const es = dadosRealizado.entradasESaidas;
            const entradas = es['(+) Entradas']?.[chave] || 0;
            const saidas = es['(-) Saídas']?.[chave] || 0; // Já vem negativo
            const entTransf = es['(+) Entradas de Transferência']?.[chave] || 0;
            const saiTransf = es['(-) Saídas de Transferência']?.[chave] || 0; // Já vem negativo
            
            // Soma o fluxo líquido do DRE ao acumulado
            saldoAcumulado += (entradas + saidas + entTransf + saiTransf);
        } else {
            // Fallback original para acumulação local se não houver dados de DRE
            saldoAcumulado += fluxoDeCaixaMensal[chave] || 0;
        }

        matrizCapitalGiro['(+) Caixa'][chave] = saldoAcumulado;
        matrizCapitalGiro['Curto Prazo TT'][chave] = curtoPrazo
        matrizCapitalGiro['Longo Prazo TT'][chave] = longoPrazo
        matrizCapitalGiro['Capital Liquido'][chave] = curtoPrazo + longoPrazo + saldoAcumulado;
    });
    
    return { saldoInicial, matrizCapitalGiro };
}

function mergeMatrizes(dadosProcessados, modo, colunasVisiveis, projecao, dadosEstoque, saldoInicialExterno = null) {
    const dadosSelecionados = dadosProcessados.map(dadosConta => {
        const projData = dadosConta[projecao.toLowerCase()];
        if (!projData) return null;

        if (projecao.toLowerCase() === 'realizado' && dadosConta.capitalDeGiro) {
            projData.matrizCapitalGiro = dadosConta.capitalDeGiro.matrizCapitalGiro;
        }
        if (projecao.toLowerCase() === 'arealizar' && dadosConta.capitalDeGiro) {
            projData.matrizCapitalGiro = dadosConta.capitalDeGiro.matrizCapitalGiro;
        }
        return projData;
    }).filter(Boolean);

    if (!dadosSelecionados || dadosSelecionados.length === 0) {
        return { matrizDRE: {}, matrizDetalhamento: {}, matrizCapitalGiro: {}, entradasESaidas: {}, fluxoDeCaixa: {}, dadosEstoque: {} };
    }

    const { monthlyMerged, todasChaves } = mergeDadosMensais(dadosSelecionados, projecao, dadosEstoque);

    const dadosParaExibir = (modo.toLowerCase() === 'anual')
        ? agregarDadosParaAnual(monthlyMerged, projecao)
        : monthlyMerged;

    const PeUChave = getChavesDeControle(todasChaves, modo);

    let saldoInicialConsolidado = 0;
    if (saldoInicialExterno !== null) {
        saldoInicialConsolidado = saldoInicialExterno;
    } else {
        saldoInicialConsolidado = dadosProcessados.reduce((acc, dadosConta) => {
            return acc + (dadosConta.saldoInicialBase || 0);
        }, 0);
    }
    
    const matrizDRE = dadosParaExibir.matrizDRE;
    const colunasParaCalcular = gerarPeriodosEntre(PeUChave.primeiraChave, PeUChave.ultimaChave, modo.toLowerCase());
    
    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'].forEach(classe => {
        if (!matrizDRE[classe]) matrizDRE[classe] = {};
    });
    
    calcularLinhasDeTotalDRE(matrizDRE, colunasParaCalcular, saldoInicialConsolidado);
    calcularColunaTotalDRE(matrizDRE, colunasVisiveis, PeUChave);

    const matrizCG = dadosParaExibir.matrizCapitalGiro;
    if (matrizDRE['Caixa Final']) {
        if (!matrizCG['(+) Caixa']) matrizCG['(+) Caixa'] = {};
        if (!matrizCG['Capital Liquido']) matrizCG['Capital Liquido'] = {};

        // Percorre as colunas calculadas na DRE (mesmo as que não tinham dados de Cap. Giro)
        colunasParaCalcular.forEach(col => {
            const valorCaixaDRE = matrizDRE['Caixa Final'][col] || 0;
            
            // Força o valor na linha de Caixa do CG
            matrizCG['(+) Caixa'][col] = valorCaixaDRE;

            // Recalcula o totalizador 'Capital Liquido' para garantir consistência
            const curto = matrizCG['Curto Prazo TT']?.[col] || 0;
            const longo = matrizCG['Longo Prazo TT']?.[col] || 0;
            matrizCG['Capital Liquido'][col] = curto + longo + valorCaixaDRE;
        });
    }

    return { ...dadosParaExibir };
}

function mergeDadosMensais(listaDeDadosProcessados, projecao, dadosEstoque) {
    const monthlyMerged = { matrizDRE: {}, matrizDetalhamento: {},
    entradasESaidas: {}, matrizCapitalGiro: {}, fluxoDeCaixa: [], dadosEstoque: {} };
    const todasChaves = new Set();

    listaDeDadosProcessados.forEach(dados => {
        dados.chavesComDados.forEach(chave => todasChaves.add(chave));
        mergeGenericoMensal(dados.matrizDRE, monthlyMerged.matrizDRE);
        mergeGenericoMensal(dados.entradasESaidas, monthlyMerged.entradasESaidas);
        if(projecao.toLowerCase() == "realizado") mergeGenericoMensal(dados.matrizCapitalGiro, monthlyMerged.matrizCapitalGiro) 
        monthlyMerged.fluxoDeCaixa.push(...dados.fluxoDeCaixa);

        for (const chavePrimaria in dados.matrizDetalhamento) {
            const dadosOrigem = dados.matrizDetalhamento[chavePrimaria];
            if (!monthlyMerged.matrizDetalhamento[chavePrimaria]) {
                monthlyMerged.matrizDetalhamento[chavePrimaria] = JSON.parse(JSON.stringify(dadosOrigem));
            } else {
                const dadosDestino = monthlyMerged.matrizDetalhamento[chavePrimaria];
                dadosDestino.total += dadosOrigem.total;
                mergeDetalhamentoNivel(dadosDestino.departamentos, dadosOrigem.departamentos);
            }
        }
    });
    monthlyMerged.fluxoDeCaixa.sort((a, b) => parseDate(a.data) - parseDate(b.data));
    dadosEstoque.forEach(matrizEstoque => {
        mergeGenericoMensal(matrizEstoque, monthlyMerged.dadosEstoque);
    });
    return { monthlyMerged, todasChaves };
}

function mergeGenericoMensal(origem, destino) {
    for (const chave in origem) {
        if (!destino[chave]) destino[chave] = {};
        for (const periodo in origem[chave]) {
            destino[chave][periodo] = (destino[chave][periodo] || 0) + origem[chave][periodo];
        }
    }
}

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

function agregarDadosParaAnual(monthlyData, projecao) {
    const annualData = { matrizDRE: {}, matrizDetalhamento: {}, entradasESaidas: {},
    matrizCapitalGiro: {}, fluxoDeCaixa: {}, dadosEstoque: {} };
    const saldosAnuais = {};

    annualData.fluxoDeCaixa = monthlyData.fluxoDeCaixa;

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

    for (const classe in monthlyData.entradasESaidas) {
        annualData.entradasESaidas[classe] = {};
        for (const periodo in monthlyData.entradasESaidas[classe]) {
            const ano = periodo.split('-')[1];
            const valor = monthlyData.entradasESaidas[classe][periodo];
            somaValor(annualData.entradasESaidas[classe], ano, valor);
        }
    }

    for (const classe in saldosAnuais) {
        for (const ano in saldosAnuais[classe]) {
            annualData.matrizDRE[classe][ano] = saldosAnuais[classe][ano].valor;
        }
    }

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

    if(projecao.toLowerCase() == "realizado"){
        const anoAtual = new Date().getFullYear();
        const mesFiltro = new Date().getMonth(); 
        annualData.matrizCapitalGiro = agregarSaldosAnuais(monthlyData.matrizCapitalGiro, anoAtual, mesFiltro);
        annualData.dadosEstoque = agregarSaldosAnuais(monthlyData.dadosEstoque, anoAtual, mesFiltro);
    } else {
        annualData.matrizCapitalGiro = agregarSaldosAnuais(monthlyData.matrizCapitalGiro);
        annualData.dadosEstoque = agregarSaldosAnuais(monthlyData.dadosEstoque);
    }

    return annualData;
}

function agregarSaldosAnuais(dadosMensais, anoFiltro = null, mesFiltro = null) {
    const dadosAnuais = {}; 
    const saldosTemporarios = {}; 

    for (const linha in dadosMensais) {
        if (!saldosTemporarios[linha]) saldosTemporarios[linha] = {};
        for (const periodoMensal in dadosMensais[linha]) {
            const [mesKey, anoKey] = periodoMensal.split('-'); 
            if (!mesKey || !anoKey) continue; 

            if (anoFiltro !== null && mesFiltro !== null) {
                const anoNum = Number(anoKey);
                const mesNum = Number(mesKey) - 1; 
                if (anoNum === anoFiltro && mesNum > mesFiltro) continue; 
            }

            const valor = dadosMensais[linha][periodoMensal];
            const existente = saldosTemporarios[linha][anoKey];

            if (!existente || mesKey > existente.mesKey) {
                saldosTemporarios[linha][anoKey] = { mesKey: mesKey, valor: valor };
            }
        }
    }

    for (const linha in saldosTemporarios) {
        dadosAnuais[linha] = {}; 
        for (const ano in saldosTemporarios[linha]) {
            dadosAnuais[linha][ano] = saldosTemporarios[linha][ano].valor;
        }
    }
    return dadosAnuais;
}

function atualizarSaldoAnual(saldosAnuais, classe, ano, mes, valor) {
    if (!saldosAnuais[classe]) saldosAnuais[classe] = {};
    const existente = saldosAnuais[classe][ano];
    if (classe === 'Caixa Final') {
        if (!existente || mes > existente.mes) saldosAnuais[classe][ano] = { mes, valor };
    } else if (classe === 'Caixa Inicial') {
        if (!existente || mes < existente.mes) saldosAnuais[classe][ano] = { mes, valor };
    }
}

function calcularColunaTotalDRE(matrizDRE, colunasVisiveis, PeUChave) {
    Object.values(matrizDRE).forEach(periodos => {
        periodos.TOTAL = colunasVisiveis.reduce((acc, coluna) => acc + (periodos[coluna] || 0), 0);
    });

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
            if(matrizDRE['Caixa Inicial']) matrizDRE['Caixa Inicial'].TOTAL = matrizDRE['Caixa Inicial'][colSaldIni] || 0;
            if(matrizDRE['Caixa Final']) matrizDRE['Caixa Final'].TOTAL = matrizDRE['Caixa Final'][colSaldFim] || 0;
        }
    }
}

function calcularLinhasDeTotalDRE(matrizDRE, colunasParaCalcular, saldoInicial) {
    Object.keys(matrizDRE).forEach(classe => {
        colunasParaCalcular.forEach(coluna => {
            if (matrizDRE[classe][coluna] == null) {
                matrizDRE[classe][coluna] = 0;
            }
        });
    });

    let saldoAcumulado = saldoInicial;

    colunasParaCalcular.forEach(coluna => {
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

        const receitaLiquida = receitaBruta + deducoes;
        matrizDRE['(=) Receita Líquida'][coluna] = receitaLiquida;

        const geracaoCaixa = receitaLiquida + custos + despesas + irpj;
        matrizDRE['(+/-) Geração de Caixa Operacional'][coluna] = geracaoCaixa;

        const movimentacaoNaoOperacional = resultadoFinanceiro + aportes + investimentos + emprestimos;
        const movimentacaoMensal = geracaoCaixa + movimentacaoNaoOperacional;
        matrizDRE['(=) Movimentação de Caixa Mensal'][coluna] = movimentacaoMensal;

        matrizDRE['Caixa Inicial'][coluna] = saldoAcumulado;
        
        const variacaoCaixaTotal = movimentacaoMensal + entradaTransferencia + saidaTransferencia + outros;
        saldoAcumulado += variacaoCaixaTotal;

        matrizDRE['Caixa Final'][coluna] = saldoAcumulado;
    });
}

export { processarDadosDaConta, extrairDadosDosTitulos, mergeMatrizes };