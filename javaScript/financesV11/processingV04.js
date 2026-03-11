// processingV04.js

// --- Constantes Globais ---
const ORDEM_DRE = [
    '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas',
    '(+/-) IRPJ/CSLL', '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas',
    '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios', 'Outros'
];

const LINHAS_CALCULADAS_DRE = [
    '(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', 
    '(=) Movimentação de Caixa Mensal', 'Caixa Inicial', 'Caixa Final'
];

// --- Funções Auxiliares Básicas ---
const formatarChaveMesAno = (dataString) => {
    if (!dataString) return null;
    const partes = dataString.split('/');
    if (partes.length !== 3) return null;
    return `${partes[1].padStart(2, '0')}-${partes[2]}`;
};

const normalizarNatureza = (nat) => (nat === 'D' || nat === 'P') ? 'P' : 'R';

// --- Criação de Estrutura Base ---
const criarEstruturaUI = (saldoInicial = 0) => {
    const estrutura = {
        saldoInicialBase: Number(saldoInicial),
        chavesEncontradas: new Set(),
        dre: {}, 
        entradasSaidas: {
            '(+) Entradas': {}, '(-) Saídas': {},
            '(+) Entradas de Transferência': {}, '(-) Saídas de Transferência': {}
        },
        capitalGiro: {
            '(+) Caixa': {},
            '(+) Clientes a Receber': {}, 'Curto Prazo AR': {}, 'Longo Prazo AR': {},
            '(-) Fornecedores a Pagar': {}, 'Curto Prazo AP': {}, 'Longo Prazo AP': {},
            'Curto Prazo TT': {}, 'Longo Prazo TT': {}, 'Capital Liquido': {}
        },
        fluxoDiario: [],
        detalhamento: {}
    };

    [...ORDEM_DRE, ...LINHAS_CALCULADAS_DRE, 'Entrada de Transferência', 'Saída de Transferência'].forEach(linha => {
        estrutura.dre[linha] = {};
    });

    return estrutura;
};

// --- EXTRAÇÃO DE DADOS (A CORREÇÃO DO PROBLEMA DE DADOS VAZIOS) ---

/**
 * Normaliza a estrutura aninhada da API em arrays 1D simples.
 * Extrai baixas filhas e calcula saldos de títulos A Realizar.
 */
function extrairDadosAninhados(rawArray, contaId) {
    const lancamentos = [];
    const titulosAbertos = [];
    const capitalGiro = [];

    if (!Array.isArray(rawArray)) return { lancamentos, titulosAbertos, capitalGiro };

    rawArray.forEach(item => {
        if (!item) return;
        const natureza = normalizarNatureza(item.Natureza);
        let valorTotalPago = 0;

        // 1. Extração de Baixas (Lançamentos Filhos)
        if (Array.isArray(item.Lancamentos)) {
            item.Lancamentos.forEach(lanc => {
                if (!lanc.DataLancamento || !lanc.CODContaC || typeof lanc.ValorLancamento === 'undefined') return;
                
                valorTotalPago += (lanc.ValorBaixado || 0);

                // Apenas insere na DRE se o pagamento for na conta corrente selecionada
                if (String(lanc.CODContaC) === String(contaId)) {
                    lancamentos.push({
                        DataLancamento: lanc.DataLancamento,
                        ValorLancamento: lanc.ValorLancamento,
                        Natureza: natureza,
                        CODCategoria: item.Categoria || item.CODCategoria,
                        Cliente: item.Cliente,
                        Departamentos: item.Departamentos || [],
                        CODProjeto: item.CODProjeto,
                        obs: lanc.obs || item.obsTitulo || null
                    });
                }

                // Insere sempre no Capital de Giro para manter histórico
                capitalGiro.push({
                    Natureza: natureza,
                    DataPagamento: lanc.DataLancamento,
                    DataVencimento: item.DataVencimento || null,
                    DataEmissao: item.DataEmissao || null,
                    ValorTitulo: lanc.ValorLancamento,
                    CODContaEmissao: item.CODContaC || null,
                    CODContaPagamento: lanc.CODContaC || null,
                    CODProjeto: item.CODProjeto || null
                });
            });
        }

        // 2. Extração de Saldos Restantes (A Realizar)
        if (typeof item.ValorTitulo !== 'undefined') {
            const valorFaltante = item.ValorTitulo - valorTotalPago;
            
            if (valorFaltante >= 0.01 && item.ValorTitulo !== 0) {
                if (String(item.CODContaC) === String(contaId)) {
                    titulosAbertos.push({
                        DataLancamento: item.DataVencimento, // Usa vencimento no A Realizar
                        ValorLancamento: valorFaltante,
                        Natureza: natureza,
                        CODCategoria: item.Categoria || item.CODCategoria,
                        Cliente: item.Cliente || "Cliente",
                        Departamentos: item.Departamentos || [],
                        CODProjeto: item.CODProjeto,
                        obs: item.obsTitulo || null
                    });
                }

                capitalGiro.push({
                    Natureza: natureza,
                    DataPagamento: null,
                    DataVencimento: item.DataVencimento || null,
                    DataEmissao: item.DataEmissao || null,
                    ValorTitulo: valorFaltante,
                    CODContaEmissao: item.CODContaC || null,
                    CODContaPagamento: null,
                    CODProjeto: item.CODProjeto || null
                });
            }
        }
    });

    return { lancamentos, titulosAbertos, capitalGiro };
}

// --- Funções Principais de Processamento ---

export function processarDadosConta(dadosRaw, dicionarios, contaId, saldoInicial = 0) {
    const bucketsPorProjeto = {
        'SEM_PROJETO': criarEstruturaUI(saldoInicial)
    };

    const obterBucket = (idProjeto) => {
        const chave = (idProjeto && idProjeto !== "0") ? String(idProjeto) : 'SEM_PROJETO';
        if (!bucketsPorProjeto[chave]) {
            bucketsPorProjeto[chave] = criarEstruturaUI(0);
        }
        return bucketsPorProjeto[chave];
    };

    // 1. Extrai e Planifica os Dados
    const dadosLimpados = { lancamentos: [], titulos: [] };

    if (Array.isArray(dadosRaw.lancamentosProcessados)) {
        const extraido = extrairDadosAninhados(dadosRaw.lancamentosProcessados, contaId);
        dadosLimpados.lancamentos.push(...extraido.lancamentos);
    }
    if (Array.isArray(dadosRaw.titulosEmAberto)) {
        const extraido = extrairDadosAninhados(dadosRaw.titulosEmAberto, contaId);
        dadosLimpados.titulos.push(...extraido.titulosAbertos);
    }

    // 2. Processa Lançamentos Realizados
    dadosLimpados.lancamentos.forEach(lancamento => {
        const bucket = obterBucket(lancamento.CODProjeto);
        processarDRE(lancamento, bucket, dicionarios);
    });

    // 3. Processa Títulos A Realizar
    dadosLimpados.titulos.forEach(titulo => {
        const bucket = obterBucket(titulo.CODProjeto);
        processarDRE(titulo, bucket, dicionarios);
    });

    Object.values(bucketsPorProjeto).forEach(bucket => {
        aplicarRegrasDeTotaisDRE(bucket);
    });

    return bucketsPorProjeto;
}

function processarDRE(item, destino, dicionarios) {
    const dataAlvo = item.DataLancamento;
    if (!dataAlvo) return;

    const chaveMes = formatarChaveMesAno(dataAlvo);
    destino.chavesEncontradas.add(chaveMes);

    let valor = parseFloat(item.ValorLancamento || 0);
    if (item.Natureza === 'P') valor = -valor; 

    const codCat = String(item.CODCategoria);
    const classeObj = dicionarios.classesMap.get(codCat);
    const classe = classeObj ? classeObj.classe : 'Outros';
    const isTransferencia = codCat.startsWith("0.01");

    if (!destino.dre[classe]) destino.dre[classe] = {};
    destino.dre[classe][chaveMes] = (destino.dre[classe][chaveMes] || 0) + valor;

    const chaveES = valor < 0 
        ? (isTransferencia ? '(-) Saídas de Transferência' : '(-) Saídas')
        : (isTransferencia ? '(+) Entradas de Transferência' : '(+) Entradas');
    destino.entradasSaidas[chaveES][chaveMes] = (destino.entradasSaidas[chaveES][chaveMes] || 0) + valor;

    destino.fluxoDiario.push({
        data: dataAlvo,
        valor: valor,
        descricao: isTransferencia ? 'Transferência Entre Contas' : `${dicionarios.categoriasMap.get(codCat) || 'S/ Categoria'} - ${item.Cliente || ''}`,
        obs: item.obs || null
    });

    if (ORDEM_DRE.includes(classe) && Array.isArray(item.Departamentos)) {
        popularDetalhamento(item, destino.detalhamento, classe, chaveMes, Math.abs(item.ValorLancamento), dicionarios);
    }
}

function popularDetalhamento(item, detalhamentoBase, classe, chaveMes, valorTotalAbs, dicionarios) {
    const fornecedor = item.Cliente || "Não informado";
    const chavePrimaria = `${classe}|${chaveMes}`;
    
    if (!detalhamentoBase[chavePrimaria]) detalhamentoBase[chavePrimaria] = { total: 0, departamentos: {} };
    const noRaiz = detalhamentoBase[chavePrimaria];

    const deptos = item.Departamentos.length > 0 ? item.Departamentos : [{ CodDpto: "0", PercDepto: 100 }];

    deptos.forEach(d => {
        const percentual = (d.PercDepto ?? 100) / 100;
        let valorRateado = valorTotalAbs * percentual;
        if (item.Natureza === 'P') valorRateado = -valorRateado;

        const nomeDepto = dicionarios.departamentosMap.get(String(d.CodDpto)) || 'Outros Departamentos';
        const codCat = String(item.CODCategoria);

        noRaiz.total += valorRateado;

        if (!noRaiz.departamentos[nomeDepto]) noRaiz.departamentos[nomeDepto] = { total: 0, categorias: {} };
        const noDepto = noRaiz.departamentos[nomeDepto];
        noDepto.total += valorRateado;

        if (!noDepto.categorias[codCat]) noDepto.categorias[codCat] = { total: 0, fornecedores: {} };
        const noCat = noDepto.categorias[codCat];
        noCat.total += valorRateado;

        if (!noCat.fornecedores[fornecedor]) noCat.fornecedores[fornecedor] = { total: 0 };
        noCat.fornecedores[fornecedor].total += valorRateado;
    });
}

// --- Pós Processamento Matemático ---

export function aplicarRegrasDeTotaisDRE(estrutura, arrayColunasOrdenadas = null) {
    const dre = estrutura.dre;
    const colunas = arrayColunasOrdenadas || Array.from(estrutura.chavesEncontradas).sort((a, b) => {
        const [mA, aA] = a.split('-').map(Number);
        const [mB, aB] = b.split('-').map(Number);
        return aA !== aB ? aA - aB : mA - mB;
    });

    let saldoAcumulado = estrutura.saldoInicialBase || 0;

    colunas.forEach(col => {
        const v = (linha) => dre[linha]?.[col] || 0;

        const recLiq = v('(+) Receita Bruta') + v('(-) Deduções');
        dre['(=) Receita Líquida'][col] = recLiq;

        const gerCaixa = recLiq + v('(-) Custos') + v('(-) Despesas') + v('(+/-) IRPJ/CSLL');
        dre['(+/-) Geração de Caixa Operacional'][col] = gerCaixa;

        const movNaoOp = v('(+/-) Resultado Financeiro') + v('(+/-) Aportes/Retiradas') + 
                         v('(+/-) Investimentos') + v('(+/-) Empréstimos/Consórcios');
        const movMensal = gerCaixa + movNaoOp;
        dre['(=) Movimentação de Caixa Mensal'][col] = movMensal;

        dre['Caixa Inicial'][col] = saldoAcumulado;
        
        const fechamentoMes = movMensal + v('Entrada de Transferência') + v('Saída de Transferência') + v('Outros');
        saldoAcumulado += fechamentoMes;
        
        dre['Caixa Final'][col] = saldoAcumulado;
    });

    Object.keys(dre).forEach(linha => {
        if (linha === 'Caixa Inicial') dre[linha]['TOTAL'] = dre[linha][colunas[0]] || 0;
        else if (linha === 'Caixa Final') dre[linha]['TOTAL'] = dre[linha][colunas[colunas.length - 1]] || 0;
        else dre[linha]['TOTAL'] = colunas.reduce((acc, col) => acc + (dre[linha][col] || 0), 0);
    });

    Object.keys(estrutura.entradasSaidas).forEach(linha => {
        estrutura.entradasSaidas[linha]['TOTAL'] = colunas.reduce((acc, col) => acc + (estrutura.entradasSaidas[linha][col] || 0), 0);
    });
}

// --- Funções Auxiliares de Data ---
export const incrementarMes = (chave) => {
    if (!chave) return null;
    let [m, a] = chave.split('-').map(Number);
    return m === 12 ? `01-${a + 1}` : `${String(m + 1).padStart(2, '0')}-${a}`;
};

export const compararChaves = (a, b) => {
    const [ma, aa] = a.split('-').map(Number);
    const [mb, ab] = b.split('-').map(Number);
    return aa !== ab ? aa - ab : ma - mb;
};

// --- Processamento de Capital de Giro ---

export function processarCapitalDeGiro(dadosCapitalGiroRaw, bucketsPorProjeto, contaId, projecao) {
    if (!Array.isArray(dadosCapitalGiroRaw)) return;

    // Desaninha os dados brutos da API para termos as Emissões e Pagamentos planificados
    const extracao = extrairDadosAninhados(dadosCapitalGiroRaw, contaId);
    const capitalGiro = extracao.capitalGiro;

    const hoje = new Date();
    const chaveMesAtual = `${String(hoje.getMonth() + 1).padStart(2, '0')}-${hoje.getFullYear()}`;

    capitalGiro.forEach(cg => {
        if (!cg || typeof cg.ValorTitulo === 'undefined') return;
        
        const codProjeto = (cg.CODProjeto && cg.CODProjeto !== "0") ? String(cg.CODProjeto) : 'SEM_PROJETO';
        const bucket = bucketsPorProjeto[codProjeto] || bucketsPorProjeto['SEM_PROJETO'];
        const destinoCG = bucket.capitalGiro;

        const valor = cg.Natureza === 'P' ? -cg.ValorTitulo : cg.ValorTitulo;

        if (cg.DataEmissao && cg.DataVencimento && String(cg.CODContaEmissao) === String(contaId)) {
            const chaveE = formatarChaveMesAno(cg.DataEmissao);
            const chaveV = formatarChaveMesAno(cg.DataVencimento);
            
            let chaveFinal = chaveV;
            if (cg.DataPagamento) {
                chaveFinal = formatarChaveMesAno(cg.DataPagamento);
            }

            if (chaveE && chaveFinal && compararChaves(chaveE, chaveFinal) <= 0) {
                let chaveAtual = chaveE;

                while (chaveAtual && compararChaves(chaveAtual, chaveFinal) <= 0) {
                    if (projecao === "realizado" && compararChaves(chaveAtual, chaveMesAtual) >= 0) break;

                    const isUltimoMes = compararChaves(chaveAtual, chaveFinal) === 0;
                    bucket.chavesEncontradas.add(chaveAtual);

                    if (valor < 0) {
                        destinoCG['(-) Fornecedores a Pagar'][chaveAtual] = (destinoCG['(-) Fornecedores a Pagar'][chaveAtual] || 0) + valor;
                        if (isUltimoMes) destinoCG['Curto Prazo AP'][chaveAtual] = (destinoCG['Curto Prazo AP'][chaveAtual] || 0) + valor;
                        else destinoCG['Longo Prazo AP'][chaveAtual] = (destinoCG['Longo Prazo AP'][chaveAtual] || 0) + valor;
                    } else {
                        destinoCG['(+) Clientes a Receber'][chaveAtual] = (destinoCG['(+) Clientes a Receber'][chaveAtual] || 0) + valor;
                        if (isUltimoMes) destinoCG['Curto Prazo AR'][chaveAtual] = (destinoCG['Curto Prazo AR'][chaveAtual] || 0) + valor;
                        else destinoCG['Longo Prazo AR'][chaveAtual] = (destinoCG['Longo Prazo AR'][chaveAtual] || 0) + valor;
                    }

                    if (isUltimoMes) break;
                    chaveAtual = incrementarMes(chaveAtual);
                }
            }
        }
    });
}

// --- Pós Processamento Matemático do CG ---
export function aplicarRegrasDeTotaisCG(estrutura, arrayColunasOrdenadas = null) {
    const cg = estrutura.capitalGiro;
    const colunas = arrayColunasOrdenadas || Array.from(estrutura.chavesEncontradas).sort(compararChaves);
    
    let saldoCaixaAcumulado = estrutura.saldoInicialBase || 0;

    colunas.forEach(col => {
        const cpAP = cg['Curto Prazo AP'][col] || 0;
        const cpAR = cg['Curto Prazo AR'][col] || 0;
        const lpAP = cg['Longo Prazo AP'][col] || 0;
        const lpAR = cg['Longo Prazo AR'][col] || 0;

        const curtoPrazo = cpAP + cpAR;
        const longoPrazo = lpAP + lpAR;

        cg['Curto Prazo TT'][col] = curtoPrazo;
        cg['Longo Prazo TT'][col] = longoPrazo;

        const entradas = estrutura.entradasSaidas['(+) Entradas']?.[col] || 0;
        const saidas = estrutura.entradasSaidas['(-) Saídas']?.[col] || 0; 
        const entTransf = estrutura.entradasSaidas['(+) Entradas de Transferência']?.[col] || 0;
        const saiTransf = estrutura.entradasSaidas['(-) Saídas de Transferência']?.[col] || 0;

        saldoCaixaAcumulado += (entradas + saidas + entTransf + saiTransf);

        cg['(+) Caixa'][col] = saldoCaixaAcumulado;
        cg['Capital Liquido'][col] = curtoPrazo + longoPrazo + saldoCaixaAcumulado;
    });
}

// --- Funções de Merge (Mensal e Anual) ---
const criarEstruturaVaziaParaMerge = () => {
    const est = {
        saldoInicialBase: 0,
        chavesEncontradas: new Set(),
        dre: {}, entradasSaidas: {}, capitalGiro: {},
        fluxoDiario: [], detalhamento: {}
    };
    
    ['(+) Entradas', '(-) Saídas', '(+) Entradas de Transferência', '(-) Saídas de Transferência'].forEach(l => est.entradasSaidas[l] = {});
    ['(+) Caixa', '(+) Clientes a Receber', 'Curto Prazo AR', 'Longo Prazo AR', '(-) Fornecedores a Pagar', 'Curto Prazo AP', 'Longo Prazo AP', 'Curto Prazo TT', 'Longo Prazo TT', 'Capital Liquido'].forEach(l => est.capitalGiro[l] = {});
    
    return est;
};

const mergeDicionario = (origem, destino) => {
    for (const linha in origem) {
        if (!destino[linha]) destino[linha] = {};
        for (const coluna in origem[linha]) {
            destino[linha][coluna] = (destino[linha][coluna] || 0) + origem[linha][coluna];
        }
    }
};

const mergeDetalhamento = (origem, destino) => {
    for (const chave in origem) {
        if (!destino[chave]) {
            destino[chave] = JSON.parse(JSON.stringify(origem[chave]));
        } else {
            destino[chave].total += origem[chave].total;
            mergeNiveis(destino[chave].departamentos, origem[chave].departamentos);
        }
    }
};

const mergeNiveis = (destino, origem) => {
    for (const key in origem) {
        if (!destino[key]) {
            destino[key] = JSON.parse(JSON.stringify(origem[key]));
        } else {
            destino[key].total += origem[key].total;
            ['categorias', 'fornecedores'].forEach(sub => {
                if (origem[key][sub]) mergeNiveis(destino[key][sub], origem[key][sub]);
            });
        }
    }
};

const converterParaAnual = (estruturaMensal) => {
    const anual = criarEstruturaVaziaParaMerge();
    anual.saldoInicialBase = estruturaMensal.saldoInicialBase;
    anual.fluxoDiario = estruturaMensal.fluxoDiario; 
    
    const mapaAnos = {};
    const colunasOrdenadas = Array.from(estruturaMensal.chavesEncontradas).sort((a, b) => {
        const [mA, aA] = a.split('-').map(Number);
        const [mB, aB] = b.split('-').map(Number);
        return aA !== aB ? aA - aB : mA - mB;
    });

    colunasOrdenadas.forEach(col => {
        const ano = col.split('-')[1];
        if (!mapaAnos[ano]) mapaAnos[ano] = [];
        mapaAnos[ano].push(col);
        anual.chavesEncontradas.add(ano);
    });

    const agruparMatriz = (matrizMensal, matrizAnual, linhasPrimeiroValor = [], linhasUltimoValor = []) => {
        for (const linha in matrizMensal) {
            matrizAnual[linha] = {};
            const isPrimeiro = linhasPrimeiroValor.includes(linha);
            const isUltimo = linhasUltimoValor.includes(linha) || linhasUltimoValor.includes('*');

            for (const ano in mapaAnos) {
                const mesesDoAno = mapaAnos[ano];
                if (!mesesDoAno || mesesDoAno.length === 0) continue;

                if (isPrimeiro) {
                    const mesIni = mesesDoAno.find(m => matrizMensal[linha][m] != null);
                    matrizAnual[linha][ano] = mesIni ? matrizMensal[linha][mesIni] : 0;
                } else if (isUltimo) {
                    const mesFim = [...mesesDoAno].reverse().find(m => matrizMensal[linha][m] != null);
                    matrizAnual[linha][ano] = mesFim ? matrizMensal[linha][mesFim] : 0;
                } else {
                    matrizAnual[linha][ano] = mesesDoAno.reduce((acc, mes) => acc + (matrizMensal[linha][mes] || 0), 0);
                }
            }
        }
    };

    agruparMatriz(estruturaMensal.dre, anual.dre, ['Caixa Inicial'], ['Caixa Final']);
    agruparMatriz(estruturaMensal.entradasSaidas, anual.entradasSaidas);
    agruparMatriz(estruturaMensal.capitalGiro, anual.capitalGiro, [], ['*']);

    for (const chave in estruturaMensal.detalhamento) {
        const [classe, mesAno] = chave.split('|');
        const ano = mesAno.split('-')[1];
        const novaChave = `${classe}|${ano}`;

        if (!anual.detalhamento[novaChave]) anual.detalhamento[novaChave] = { total: 0, departamentos: {} };
        anual.detalhamento[novaChave].total += estruturaMensal.detalhamento[chave].total;
        mergeNiveis(anual.detalhamento[novaChave].departamentos, estruturaMensal.detalhamento[chave].departamentos);
    }

    return anual;
};

export function mergeMatrizes(estruturasProcessadas, modo, colunasVisiveis) {
    let consolidadoMensal = criarEstruturaVaziaParaMerge();

    estruturasProcessadas.forEach(est => {
        if (!est) return;

        consolidadoMensal.saldoInicialBase += (est.saldoInicialBase || 0);
        est.chavesEncontradas.forEach(c => consolidadoMensal.chavesEncontradas.add(c));
        
        mergeDicionario(est.dre, consolidadoMensal.dre);
        mergeDicionario(est.entradasSaidas, consolidadoMensal.entradasSaidas);
        mergeDicionario(est.capitalGiro, consolidadoMensal.capitalGiro);
        
        if (est.fluxoDiario && est.fluxoDiario.length > 0) consolidadoMensal.fluxoDiario.push(...est.fluxoDiario);
        
        mergeDetalhamento(est.detalhamento, consolidadoMensal.detalhamento);
    });

    consolidadoMensal.fluxoDiario.sort((a, b) => {
        const [dA, mA, yA] = a.data.split('/');
        const [dB, mB, yB] = b.data.split('/');
        return new Date(yA, mA - 1, dA) - new Date(yB, mB - 1, dB);
    });

    let resultadoFinal = modo.toLowerCase() === 'anual' ? converterParaAnual(consolidadoMensal) : consolidadoMensal;

    if (typeof aplicarRegrasDeTotaisDRE === 'function') aplicarRegrasDeTotaisDRE(resultadoFinal, colunasVisiveis);
    if (typeof aplicarRegrasDeTotaisCG === 'function') aplicarRegrasDeTotaisCG(resultadoFinal, colunasVisiveis);

    return resultadoFinal;
}