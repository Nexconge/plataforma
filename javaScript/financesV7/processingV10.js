// processingV13.js

// --- Constantes de Negócio ---

const ORDEM_DRE = [
    '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas',
    '(+/-) IRPJ/CSLL', '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas',
    '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios'
];

const CLASSES_PARA_DETALHAR = new Set(ORDEM_DRE);

// --- Funções Utilitárias de Data e Chave ---

function parseDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

function incrementarMes(chave) {
    if (!chave) return null;
    const [mesStr, anoStr] = chave.split('-');
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

function compararChaves(a, b) {
    const [mesA, anoA] = a.split('-').map(Number);
    const [mesB, anoB] = b.split('-').map(Number);
    if (anoA !== anoB) return anoA - anoB;
    return mesA - mesB;
}

function getChavesDeControle(chavesSet, modo) {
    let primeiraChave = null, ultimaChave = null;
    
    // Encontrar min e max
    for (const chave of chavesSet) {
        if (!primeiraChave || compararChaves(chave, primeiraChave) < 0) primeiraChave = chave;
        if (!ultimaChave || compararChaves(chave, ultimaChave) > 0) ultimaChave = chave;
    }

    // Ajuste para retorno anual
    if (modo.toLowerCase() === "anual") {
        return {
            primeiraChave: primeiraChave ? primeiraChave.split('-')[1] : null,
            ultimaChave: ultimaChave ? ultimaChave.split('-')[1] : null
        };
    }
    return { primeiraChave, ultimaChave };
}

function gerarPeriodosEntre(primeiraChave, ultimaChave, modo = "mensal") {
    const resultado = [];
    if (!primeiraChave || !ultimaChave) return resultado;
    
    if (modo === "anual") {
        for (let ano = Number(primeiraChave); ano <= Number(ultimaChave); ano++) {
            resultado.push(String(ano));
        }
    } else if (modo === "mensal") {
        let atual = primeiraChave;
        resultado.push(atual);
        while (atual !== ultimaChave) {
            atual = incrementarMes(atual);
            if (!atual) break; 
            resultado.push(atual);
        }
    } else {
        throw new Error('Modo inválido. Use "anual" ou "mensal".');
    }
    return resultado;
}

// --- Lógica de Negócio Auxiliar ---

function gerarDepartamentosObj(departamentos, valorTotalLancamento) {
    if (Array.isArray(departamentos) && departamentos.length > 0) {
        return departamentos.map(depto => {
            const percentual = (depto.PercDepto ?? 100) / 100;
            return {
                CodDpto: depto.CODDepto ? String(depto.CODDepto) : "0",
                ValorDepto: valorTotalLancamento * percentual
            };
        });
    }
    // Retorno padrão se não houver rateio
    return [{ CodDpto: "0", ValorDepto: valorTotalLancamento }];
}

function somaValor(destino, chave, valor) {
    destino[chave] = (destino[chave] || 0) + valor;
}

// --- Funções Principais de Processamento ---

/**
 * Função principal que coordena o processamento de uma conta.
 * Processa Realizado, A Realizar e Capital de Giro.
 */
function processarDadosDaConta(AppCache, dadosApi, contaId, saldoInicialExterno = 0) {
    // Normalização das entradas
    const lancamentos = dadosApi.lancamentosProcessados || dadosApi.lancamentos || [];
    const titulos = dadosApi.titulosEmAberto || dadosApi.titulos || [];
    const capitalDeGiro = dadosApi.capitalDeGiro || [];
    const saldoIniCC = Number(saldoInicialExterno);
    
    // 1. Processa MODO REALIZADO (Baseado em lançamentos efetivos)
    const dadosRealizado = processarRealizadoRealizar(AppCache, lancamentos, contaId, saldoIniCC);
    
    // 2. Processa MODO A REALIZAR (Baseado em títulos em aberto)
    const dadosARealizar = processarRealizadoRealizar(AppCache, titulos, contaId, saldoIniCC);
    
    // 3. Processa CAPITAL DE GIRO 
    // Nota: Passamos 'dadosRealizado' para sincronizar o saldo de caixa acumulado corretamente.
    const dadosCapitalDeGiro = processarCapitalDeGiro(AppCache, capitalDeGiro, contaId, saldoIniCC, dadosRealizado);

    return {
        realizado: dadosRealizado,
        arealizar: dadosARealizar,
        capitalDeGiro: dadosCapitalDeGiro,
        saldoInicialBase: saldoIniCC
    };
}

/**
 * Converte a estrutura de TÍTULOS da API em objetos de negócio.
 * Filtra lançamentos da DRE pelo ano solicitado, mas calcula saldo total baseado em todo o histórico.
 */
/**
 * Converte a estrutura de TÍTULOS da API em objetos de negócio.
 * CORREÇÃO: 
 * - Lançamentos (DRE): Filtrados estritamente pelo ano solicitado.
 * - Capital de Giro: RECEBE TODO O HISTÓRICO (sem filtro), para projetar as curvas de responsabilidade corretamente.
 */
function extrairDadosDosTitulos(titulosRaw, contaId, anoFiltro = null) {
    const lancamentosProcessados = [];
    const titulosEmAberto = [];
    const capitalDeGiro = [];

    if (!Array.isArray(titulosRaw)) {
        console.error("extrairDadosDosTitulos: Entrada inválida.", titulosRaw);
        return { lancamentosProcessados, titulosEmAberto, capitalDeGiro };
    }
    
    titulosRaw.forEach(titulo => {
        if (!titulo || !titulo.Categoria) return;

        let valorTotalPago = 0;

        // --- PARTE 1: Processamento de Baixas ---
        if (Array.isArray(titulo.Lancamentos)) {
            titulo.Lancamentos.forEach(lancamento => {
                if (!lancamento.DataLancamento || !lancamento.CODContaC || typeof lancamento.ValorLancamento === 'undefined') return;

                // Acumula o valor pago TOTAL (independente do ano) para cálculo de saldo
                valorTotalPago += (lancamento.ValorBaixado || 0);

                // Verifica filtro de ano APENAS para a DRE
                let pertenceAoPeriodoDRE = true;
                if (anoFiltro) {
                    const parts = lancamento.DataLancamento.split('/');
                    if (parts.length === 3 && parts[2] !== String(anoFiltro)) {
                        pertenceAoPeriodoDRE = false;
                    }
                }

                // A. Adiciona à DRE (Apenas se for do ano selecionado)
                if (String(lancamento.CODContaC) === contaId && pertenceAoPeriodoDRE) {
                    const deptosRateio = gerarDepartamentosObj(titulo.Departamentos, lancamento.ValorLancamento);
                    
                    lancamentosProcessados.push({
                        Natureza: titulo.Natureza,
                        DataLancamento: lancamento.DataLancamento,
                        CODContaC: lancamento.CODContaC,
                        ValorLancamento: lancamento.ValorLancamento,
                        CODCategoria: titulo.Categoria,
                        Cliente: titulo.Cliente,
                        Departamentos: deptosRateio
                    });
                }

                // B. Adiciona ao Capital de Giro (SEMPRE, para manter histórico de liquidação)
                // Removemos o filtro 'pertenceAoPeriodoDRE' aqui para corrigir a discrepância
                capitalDeGiro.push({
                    Natureza: titulo.Natureza,
                    DataPagamento: lancamento.DataLancamento,
                    DataVencimento: titulo.DataVencimento || null,
                    DataEmissao: titulo.DataEmissao || null,
                    ValorTitulo: lancamento.ValorLancamento,
                    CODContaEmissao: titulo.CODContaC || null,
                    CODContaPagamento: lancamento.CODContaC || null
                });
            });
        }

        // --- PARTE 2: Processamento de Saldos (A Realizar) ---
        const valorFaltante = (titulo.ValorTitulo - valorTotalPago);
        
        // Se houver saldo, adiciona projeção futura (sempre adicionou sem filtro, mantido)
        if (valorFaltante >= 0.01 && titulo.ValorTitulo !== 0) {
            const deptosRateio = gerarDepartamentosObj(titulo.Departamentos, valorFaltante);
            
            titulosEmAberto.push({
                Natureza: titulo.Natureza,
                DataLancamento: titulo.DataVencimento,
                CODContaC: titulo.CODContaC,
                ValorLancamento: valorFaltante,
                CODCategoria: titulo.Categoria,
                Cliente: titulo.Cliente || "Cliente",
                Departamentos: deptosRateio
            });
            
            capitalDeGiro.push({
                Natureza: titulo.Natureza,
                DataPagamento: null,
                DataVencimento: titulo.DataVencimento || null,
                DataEmissao: titulo.DataEmissao || null,
                ValorTitulo: valorFaltante,
                CODContaEmissao: titulo.CODContaC || null,
                CODContaPagamento: null
            });
        }
    });

    return { lancamentosProcessados, titulosEmAberto, capitalDeGiro };
}

/**
 * Converte a estrutura de LANÇAMENTOS AVULSOS (manuais).
 * Estes são puramente DRE, então aplicamos o filtro de ano rigorosamente.
 */
function extrairLancamentosSimples(lancamentosRaw, contaId, anoFiltro = null) {
    const lancamentosProcessados = [];

    if (!Array.isArray(lancamentosRaw)) {
        return lancamentosProcessados;
    }

    lancamentosRaw.forEach(item => {
        if (!item || !Array.isArray(item.Lancamentos)) return;

        item.Lancamentos.forEach(lancamento => {
            if (!lancamento.DataLancamento || !lancamento.CODContaC || typeof lancamento.ValorLancamento === 'undefined') return;

            // Filtro de Ano (Obrigatório para DRE)
            if (anoFiltro) {
                const parts = lancamento.DataLancamento.split('/');
                if (parts.length === 3 && parts[2] !== String(anoFiltro)) return;
            }

            if (String(lancamento.CODContaC) === contaId) {
                const deptosRateio = gerarDepartamentosObj(item.Departamentos, lancamento.ValorLancamento);
                
                lancamentosProcessados.push({
                    Natureza: item.Natureza,
                    DataLancamento: lancamento.DataLancamento,
                    CODContaC: lancamento.CODContaC,
                    ValorLancamento: lancamento.ValorLancamento,
                    CODCategoria: item.Categoria,
                    Cliente: item.Cliente,
                    Departamentos: deptosRateio
                });
            }
        });
    });

    return lancamentosProcessados;
}

/**
 * Processa uma lista de lançamentos para gerar Matriz DRE e Detalhamento.
 * Usado tanto para Realizado quanto A Realizar.
 */
function processarRealizadoRealizar(AppCache, listaLancamentos, contaId, saldoIni) {
    const matrizDRE = {};
    const matrizDetalhamento = {};
    const chavesComDados = new Set();
    const fluxoDeCaixa = [];
    
    const entradasESaidas = {
        '(+) Entradas': {}, '(-) Saídas': {},
        '(+) Entradas de Transferência': {}, '(-) Saídas de Transferência': {}
    };

    let valorTotal = 0;
    
    listaLancamentos.forEach(lancamento => {
        // Filtro de segurança
        if (contaId !== String(lancamento.CODContaC)) return;
        if (!lancamento || !lancamento.DataLancamento) return;
        
        // Identificação Temporal
        const [dia, mesRaw, ano] = lancamento.DataLancamento.split('/');
        const chaveAgregacao = `${mesRaw.padStart(2, '0')}-${ano}`;
        chavesComDados.add(chaveAgregacao);
    
        // Definição de Valor (Positivo/Negativo)
        let valor = lancamento.ValorLancamento;
        if (lancamento.Natureza === "P") valor = -valor;
        valorTotal += valor;

        // Categorização
        const codCat = lancamento.CODCategoria;
        const classeInfo = AppCache.classesMap.get(lancamento.CODCategoria);
        const classe = classeInfo ? classeInfo.classe : 'Outros';

        // Fluxo Diário
        const isTransferencia = codCat.startsWith("0.01");
        const descricaoFluxo = isTransferencia 
            ? 'Transferência Entre Contas' 
            : `${AppCache.categoriasMap.get(codCat)} - ${lancamento.Cliente}`;
            
        fluxoDeCaixa.push({
            valor: valor,
            descricao: descricaoFluxo,
            data: lancamento.DataLancamento
        });

        // Popula Matriz DRE
        if (!matrizDRE[classe]) matrizDRE[classe] = {};
        matrizDRE[classe][chaveAgregacao] = (matrizDRE[classe][chaveAgregacao] || 0) + valor;

        // Popula Entradas e Saídas (Auxiliar)
        if (valor < 0) { 
            const chaveES = isTransferencia ? '(-) Saídas de Transferência' : '(-) Saídas';
            entradasESaidas[chaveES][chaveAgregacao] = (entradasESaidas[chaveES][chaveAgregacao] || 0) + valor;
        } else {
            const chaveES = isTransferencia ? '(+) Entradas de Transferência' : '(+) Entradas';
            entradasESaidas[chaveES][chaveAgregacao] = (entradasESaidas[chaveES][chaveAgregacao] || 0) + valor;
        }

        // Popula Matriz de Detalhamento (Drill-down)
        if (CLASSES_PARA_DETALHAR.has(classe) && Array.isArray(lancamento.Departamentos) && lancamento.Departamentos.length > 0) {
            const fornecedor = lancamento.Cliente || "Não informado";
            const chavePrimaria = `${classe}|${chaveAgregacao}`; 

            if (!matrizDetalhamento[chavePrimaria]) {
                matrizDetalhamento[chavePrimaria] = { total: 0, departamentos: {} };
            }
            const nodeClasse = matrizDetalhamento[chavePrimaria];

            lancamento.Departamentos.forEach(depto => {
                // Rateio do valor
                let valorRateio = depto.ValorDepto;
                if (lancamento.Natureza === "P") valorRateio = -valorRateio;
                
                // Nível 1: Classe Total
                nodeClasse.total += valorRateio; 
                
                // Nível 2: Departamento
                const nomeDepto = AppCache.departamentosMap.get(String(depto.CodDpto)) || 'Outros Departamentos';
                if (!nodeClasse.departamentos[nomeDepto]) {
                    nodeClasse.departamentos[nomeDepto] = { total: 0, categorias: {} };
                }
                const nodeDepto = nodeClasse.departamentos[nomeDepto];
                nodeDepto.total += valorRateio;

                // Nível 3: Categoria
                if (!nodeDepto.categorias[codCat]) {
                    nodeDepto.categorias[codCat] = { total: 0, fornecedores: {} };
                }
                const nodeCat = nodeDepto.categorias[codCat];
                nodeCat.total += valorRateio;
                
                // Nível 4: Fornecedor
                if (!nodeCat.fornecedores[fornecedor]) {
                    nodeCat.fornecedores[fornecedor] = { total: 0 };
                }
                nodeCat.fornecedores[fornecedor].total += valorRateio;
            });
        }
    });

    // Ordenação cronológica do fluxo
    fluxoDeCaixa.sort((a, b) => parseDate(a.data) - parseDate(b.data));
    
    return { matrizDRE, matrizDetalhamento, chavesComDados, valorTotal, entradasESaidas, saldoIni, fluxoDeCaixa };
}

/**
 * Calcula a matriz de Capital de Giro (Contas a Pagar/Receber).
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
    
    let saldoAcumulado = saldoInicial;

    // 1. Cria o Set unificado (como você já fazia)
    const chavesUnicas = dadosRealizado.chavesComDados.union(todasAsChaves);
    
    // 2. Converte para Array e ORDENA cronologicamente usando sua função auxiliar compararChaves
    const chavesOrdenadas = Array.from(chavesUnicas).sort(compararChaves);

    // 3. Itera sobre a lista ordenada
    chavesOrdenadas.forEach(chave => {
        if(compararChaves(chave, chaveMesAtual) >= 0) return;
        const curtoPrazo = (matrizCapitalGiro['Curto Prazo AP'][chave] || 0) + (matrizCapitalGiro['Curto Prazo AR'][chave] || 0)
        const longoPrazo = (matrizCapitalGiro['Longo Prazo AP'][chave] || 0) + (matrizCapitalGiro['Longo Prazo AR'][chave] || 0)

        // CORREÇÃO APLICADA:
        // Em vez de buscar 'Caixa Final' (que não existe ainda), calculamos o saldo
        // usando os mesmos fluxos (Entradas/Saídas) que geraram a DRE.
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

// --- Função de Consolidação (Merge) ---

function mergeMatrizes(dadosProcessados, modo, colunasVisiveis, projecao, dadosEstoque, saldoInicialExterno = null) {
    // 1. Filtragem de dados baseada na projeção
    const dadosSelecionados = dadosProcessados.map(dadosConta => {
        const projData = dadosConta[projecao.toLowerCase()];
        if (!projData) return null;

        // Anexa Capital de Giro se disponível
        if (dadosConta.capitalDeGiro) {
            projData.matrizCapitalGiro = dadosConta.capitalDeGiro.matrizCapitalGiro;
        }
        return projData;
    }).filter(Boolean);

    // Retorno rápido se vazio
    if (!dadosSelecionados || dadosSelecionados.length === 0) {
        return { matrizDRE: {}, matrizDetalhamento: {}, matrizCapitalGiro: {}, entradasESaidas: {}, fluxoDeCaixa: {}, dadosEstoque: {} };
    }

    // 2. Merge inicial em nível MENSAL
    const { monthlyMerged, todasChaves } = mergeDadosMensais(dadosSelecionados, projecao, dadosEstoque);

    // 3. Agregação para ANUAL se necessário
    const dadosParaExibir = (modo.toLowerCase() === 'anual')
        ? agregarDadosParaAnual(monthlyMerged, projecao)
        : monthlyMerged;

    // 4. Cálculo de Totais e Linhas Calculadas da DRE
    const PeUChave = getChavesDeControle(todasChaves, modo);

    // Determina Saldo Inicial Global
    let saldoInicialConsolidado = (saldoInicialExterno !== null) 
        ? saldoInicialExterno 
        : dadosProcessados.reduce((acc, d) => acc + (d.saldoInicialBase || 0), 0);
    
    const matrizDRE = dadosParaExibir.matrizDRE;
    const colunasParaCalcular = gerarPeriodosEntre(PeUChave.primeiraChave, PeUChave.ultimaChave, modo.toLowerCase());
    
    // Inicializa linhas calculadas
    ['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'].forEach(classe => {
        if (!matrizDRE[classe]) matrizDRE[classe] = {};
    });
    
    calcularLinhasDeTotalDRE(matrizDRE, colunasParaCalcular, saldoInicialConsolidado);
    calcularColunaTotalDRE(matrizDRE, colunasVisiveis, PeUChave);

    return { ...dadosParaExibir };
}

// --- Funções Auxiliares de Merge ---

function mergeDadosMensais(listaDeDadosProcessados, projecao, dadosEstoque) {
    const monthlyMerged = { 
        matrizDRE: {}, matrizDetalhamento: {},
        entradasESaidas: {}, matrizCapitalGiro: {}, 
        fluxoDeCaixa: [], dadosEstoque: {} 
    };
    const todasChaves = new Set();

    listaDeDadosProcessados.forEach(dados => {
        dados.chavesComDados.forEach(chave => todasChaves.add(chave));
        
        mergeGenericoMensal(dados.matrizDRE, monthlyMerged.matrizDRE);
        mergeGenericoMensal(dados.entradasESaidas, monthlyMerged.entradasESaidas);
        
        if(projecao.toLowerCase() === "realizado") {
            mergeGenericoMensal(dados.matrizCapitalGiro, monthlyMerged.matrizCapitalGiro);
        }
        
        monthlyMerged.fluxoDeCaixa.push(...dados.fluxoDeCaixa);

        // Merge complexo do detalhamento (profundidade)
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
    const annualData = { 
        matrizDRE: {}, matrizDetalhamento: {}, entradasESaidas: {},
        matrizCapitalGiro: {}, fluxoDeCaixa: monthlyData.fluxoDeCaixa, dadosEstoque: {} 
    };
    const saldosAnuais = {};

    // 1. DRE Anual
    for (const classe in monthlyData.matrizDRE) {
        annualData.matrizDRE[classe] = {};
        for (const periodo in monthlyData.matrizDRE[classe]) {
            const [mes, ano] = periodo.split('-');
            const valor = monthlyData.matrizDRE[classe][periodo];
            
            // Tratamento especial para saldos (não somam, pegam o último/primeiro)
            if (classe === 'Caixa Inicial' || classe === 'Caixa Final') {
                atualizarSaldoAnual(saldosAnuais, classe, ano, mes, valor);
            } else {
                somaValor(annualData.matrizDRE[classe], ano, valor);
            }
        }
    }

    // 2. Entradas e Saídas Anual
    for (const classe in monthlyData.entradasESaidas) {
        annualData.entradasESaidas[classe] = {};
        for (const periodo in monthlyData.entradasESaidas[classe]) {
            const ano = periodo.split('-')[1];
            somaValor(annualData.entradasESaidas[classe], ano, monthlyData.entradasESaidas[classe][periodo]);
        }
    }

    // Aplica os saldos calculados
    for (const classe in saldosAnuais) {
        for (const ano in saldosAnuais[classe]) {
            annualData.matrizDRE[classe][ano] = saldosAnuais[classe][ano].valor;
        }
    }

    // 3. Detalhamento Anual
    for (const chaveMensal in monthlyData.matrizDetalhamento) {
        const dadosMensais = monthlyData.matrizDetalhamento[chaveMensal];
        const [classe, periodoMensal] = chaveMensal.split('|');
        const ano = periodoMensal.split('-')[1];
        const chaveAnual = `${classe}|${ano}`;
        
        if (!annualData.matrizDetalhamento[chaveAnual]) {
            annualData.matrizDetalhamento[chaveAnual] = { total: 0, departamentos: {} };
        }
        const dadosAnuais = annualData.matrizDetalhamento[chaveAnual];
        dadosAnuais.total += dadosMensais.total;
        mergeDetalhamentoNivel(dadosAnuais.departamentos, dadosMensais.departamentos);
    }

    // 4. Capital de Giro e Estoque Anual
    // Dependendo da projeção, aplicamos filtros de data atual para saldos
    const anoAtual = new Date().getFullYear();
    const mesFiltro = new Date().getMonth(); 
    
    if(projecao.toLowerCase() === "realizado"){
        annualData.matrizCapitalGiro = agregarSaldosAnuais(monthlyData.matrizCapitalGiro, anoAtual, mesFiltro);
        annualData.dadosEstoque = agregarSaldosAnuais(monthlyData.dadosEstoque, anoAtual, mesFiltro);
    } else {
        annualData.matrizCapitalGiro = agregarSaldosAnuais(monthlyData.matrizCapitalGiro);
        annualData.dadosEstoque = agregarSaldosAnuais(monthlyData.dadosEstoque);
    }

    return annualData;
}

/**
 * Agrega saldos onde o valor do ano é o valor do último mês disponível.
 */
function agregarSaldosAnuais(dadosMensais, anoFiltro = null, mesFiltro = null) {
    const dadosAnuais = {}; 
    const saldosTemporarios = {}; 

    for (const linha in dadosMensais) {
        if (!saldosTemporarios[linha]) saldosTemporarios[linha] = {};
        for (const periodoMensal in dadosMensais[linha]) {
            const [mesKey, anoKey] = periodoMensal.split('-'); 
            if (!mesKey || !anoKey) continue; 

            // Filtra futuro se solicitado (ex: não mostrar saldo de dez/2025 se estamos em jan/2025 no realizado)
            if (anoFiltro !== null && mesFiltro !== null) {
                const anoNum = Number(anoKey);
                const mesNum = Number(mesKey) - 1; 
                if (anoNum === anoFiltro && mesNum > mesFiltro) continue; 
            }

            const valor = dadosMensais[linha][periodoMensal];
            const existente = saldosTemporarios[linha][anoKey];

            // Pega sempre o mês mais avançado do ano
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
    // Total soma simples
    Object.values(matrizDRE).forEach(periodos => {
        periodos.TOTAL = colunasVisiveis.reduce((acc, coluna) => acc + (periodos[coluna] || 0), 0);
    });

    // Sobrescrita para saldos (Total = Saldo Inicial do primeiro, Saldo Final do último)
    if(PeUChave.primeiraChave){
        let colSaldIni, colSaldFim;
        
        const idxPrimeira = compararChaves(PeUChave.primeiraChave, colunasVisiveis[0]);
        colSaldIni = (idxPrimeira >= 0) ? PeUChave.primeiraChave : colunasVisiveis[0];

        const idxUltima = compararChaves(PeUChave.ultimaChave, colunasVisiveis[colunasVisiveis.length - 1]);
        colSaldFim = (idxUltima <= 0) ? PeUChave.ultimaChave : colunasVisiveis[colunasVisiveis.length - 1];

        if (colunasVisiveis.length > 0) {
            if(matrizDRE['Caixa Inicial']) matrizDRE['Caixa Inicial'].TOTAL = matrizDRE['Caixa Inicial'][colSaldIni] || 0;
            if(matrizDRE['Caixa Final']) matrizDRE['Caixa Final'].TOTAL = matrizDRE['Caixa Final'][colSaldFim] || 0;
        }
    }
}

function calcularLinhasDeTotalDRE(matrizDRE, colunasParaCalcular, saldoInicial) {
    // Garante zeros onde não há dados
    Object.keys(matrizDRE).forEach(classe => {
        colunasParaCalcular.forEach(coluna => {
            if (matrizDRE[classe][coluna] == null) {
                matrizDRE[classe][coluna] = 0;
            }
        });
    });

    let saldoAcumulado = saldoInicial;

    colunasParaCalcular.forEach(coluna => {
        const getVal = (classe) => matrizDRE[classe]?.[coluna] || 0;
        
        const receitaLiquida = getVal('(+) Receita Bruta') + getVal('(-) Deduções');
        matrizDRE['(=) Receita Líquida'][coluna] = receitaLiquida;

        const geracaoCaixa = receitaLiquida + getVal('(-) Custos') + getVal('(-) Despesas') + getVal('(+/-) IRPJ/CSLL');
        matrizDRE['(+/-) Geração de Caixa Operacional'][coluna] = geracaoCaixa;

        const movNaoOperacional = getVal('(+/-) Resultado Financeiro') + getVal('(+/-) Aportes/Retiradas') 
                                + getVal('(+/-) Investimentos') + getVal('(+/-) Empréstimos/Consórcios');
        
        const movimentacaoMensal = geracaoCaixa + movNaoOperacional;
        matrizDRE['(=) Movimentação de Caixa Mensal'][coluna] = movimentacaoMensal;

        matrizDRE['Caixa Inicial'][coluna] = saldoAcumulado;
        
        // Variação Total inclui transferências e outros ajustes
        const variacaoTotal = movimentacaoMensal + getVal('Entrada de Transferência') 
                            + getVal('Saída de Transferência') + getVal('Outros');
        
        saldoAcumulado += variacaoTotal;
        matrizDRE['Caixa Final'][coluna] = saldoAcumulado;
    });
}

export { processarDadosDaConta, extrairDadosDosTitulos, extrairLancamentosSimples, mergeMatrizes };