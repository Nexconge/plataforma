// processingV01.js

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

/** Garante o formato MM-AAAA */
const formatarChaveMesAno = (dataString) => {
    if (!dataString) return null;
    const partes = dataString.split('/');
    if (partes.length !== 3) return null;
    return `${partes[1].padStart(2, '0')}-${partes[2]}`;
};

/** Padroniza R (Receita) e P (Pagamento) */
const normalizarNatureza = (nat) => (nat === 'D' || nat === 'P') ? 'P' : 'R';

// --- Criação de Estrutura Base ---

/** * Cria o esqueleto vazio pronto para receber dados e ser lido pela UI.
 * Facilita o merge pois todas as chaves já existem.
 */
const criarEstruturaUI = (saldoInicial = 0) => {
    const estrutura = {
        saldoInicialBase: Number(saldoInicial),
        chavesEncontradas: new Set(),
        
        // Matriz pronta para a tabela DRE (Linha -> Coluna -> Valor)
        dre: {}, 
        
        // Matriz de Entradas e Saídas simples
        entradasSaidas: {
            '(+) Entradas': {}, '(-) Saídas': {},
            '(+) Entradas de Transferência': {}, '(-) Saídas de Transferência': {}
        },
        
        // Dados para a tabela de Capital de Giro
        capitalGiro: {
            '(+) Caixa': {},
            '(+) Clientes a Receber': {}, 'Curto Prazo AR': {}, 'Longo Prazo AR': {},
            '(-) Fornecedores a Pagar': {}, 'Curto Prazo AP': {}, 'Longo Prazo AP': {},
            'Curto Prazo TT': {}, 'Longo Prazo TT': {}, 'Capital Liquido': {}
        },
        
        // Arrays simples
        fluxoDiario: [],
        
        // Objeto hierárquico para o drill-down (Classe -> Depto -> Categoria -> Fornecedor)
        detalhamento: {}
    };

    // Pré-popula as linhas do DRE para garantir a ordem na UI
    [...ORDEM_DRE, ...LINHAS_CALCULADAS_DRE, 'Entrada de Transferência', 'Saída de Transferência'].forEach(linha => {
        estrutura.dre[linha] = {};
    });

    return estrutura;
};

// --- Função Principal de Processamento ---

/**
 * Ponto de entrada. Converte o JSON bruto da API diretamente para a estrutura da UI.
 * Separa tudo por Projeto no nível mais alto para permitir filtros dinâmicos sem reprocessar.
 * * @param {Object} dadosRaw - Resposta bruta da API { lancamentosProcessados, titulosEmAberto, capitalDeGiro }
 * @param {Object} dicionarios - Mapas cacheados { classesMap, categoriasMap, departamentosMap }
 * @param {String} contaId - ID da conta atual sendo processada
 * @param {Number} saldoInicial - Saldo inicial da conta
 * @returns {Object} Estrutura segmentada por projeto
 */
export function processarDadosConta(dadosRaw, dicionarios, contaId, saldoInicial = 0) {
    // O Bucket raiz armazena os dados sem projeto (ou globais)
    const bucketsPorProjeto = {
        'SEM_PROJETO': criarEstruturaUI(saldoInicial)
    };

    const obterBucket = (idProjeto) => {
        const chave = (idProjeto && idProjeto !== "0") ? String(idProjeto) : 'SEM_PROJETO';
        if (!bucketsPorProjeto[chave]) {
            // Apenas o bucket principal leva o saldo inicial real, os outros partem de 0 para o merge não duplicar
            bucketsPorProjeto[chave] = criarEstruturaUI(0);
        }
        return bucketsPorProjeto[chave];
    };

    // 1. Processa Lançamentos Realizados (DRE e Fluxo)
    if (Array.isArray(dadosRaw.lancamentosProcessados)) {
        dadosRaw.lancamentosProcessados.forEach(lancamento => {
            if (String(lancamento.CODContaC) !== String(contaId)) return;
            const bucket = obterBucket(lancamento.CODProjeto);
            processarDRE(lancamento, bucket, dicionarios);
        });
    }

    // 2. Processa Títulos A Realizar (DRE Futuro)
    if (Array.isArray(dadosRaw.titulosEmAberto)) {
        dadosRaw.titulosEmAberto.forEach(titulo => {
            if (String(titulo.CODContaC) !== contaId) return;
            const bucket = obterBucket(titulo.CODProjeto);
            processarDRE(titulo, bucket, dicionarios);
        });
    }

    // 3. Pós-processamento Local (Cálculo de Totais Horizontais e Verticais por Projeto)
    Object.values(bucketsPorProjeto).forEach(bucket => {
        aplicarRegrasDeTotaisDRE(bucket);
    });

    return bucketsPorProjeto;
}

// --- Funções Auxiliares de Preenchimento ---

/**
 * Extrai os dados do lançamento e popula a matriz DRE, Entradas/Saídas e Fluxo.
 */
function processarDRE(item, destino, dicionarios) {
    const dataAlvo = item.DataLancamento || item.DataVencimento;
    if (!dataAlvo) return;

    const chaveMes = formatarChaveMesAno(dataAlvo);
    destino.chavesEncontradas.add(chaveMes);

    const natureza = normalizarNatureza(item.Natureza);
    let valor = parseFloat(item.ValorLancamento || item.ValorTitulo || 0);
    if (natureza === 'P') valor = -valor; // Saídas são negativas no processamento

    const codCat = String(item.CODCategoria || item.Categoria);
    const classeObj = dicionarios.classesMap.get(codCat);
    const classe = classeObj ? classeObj.classe : 'Outros';
    const isTransferencia = String(codCat).startsWith("0.01");

    // 1. DRE Principal
    if (!destino.dre[classe]) destino.dre[classe] = {};
    destino.dre[classe][chaveMes] = (destino.dre[classe][chaveMes] || 0) + valor;

    // 2. Entradas e Saídas (Resumo)
    const chaveES = valor < 0 
        ? (isTransferencia ? '(-) Saídas de Transferência' : '(-) Saídas')
        : (isTransferencia ? '(+) Entradas de Transferência' : '(+) Entradas');
    destino.entradasSaidas[chaveES][chaveMes] = (destino.entradasSaidas[chaveES][chaveMes] || 0) + valor;

    // 3. Fluxo Diário (Lista simples para a tabela de fluxo)
    destino.fluxoDiario.push({
        data: dataAlvo,
        valor: valor,
        descricao: isTransferencia ? 'Transferência Entre Contas' : `${dicionarios.categoriasMap.get(codCat) || 'S/ Categoria'} - ${item.Cliente || ''}`,
        obs: item.obs || item.obsTitulo || null
    });

    // 4. Detalhamento Hierárquico (Rateio por Departamentos)
    if (ORDEM_DRE.includes(classe) && Array.isArray(item.Departamentos)) {
        popularDetalhamento(item, destino.detalhamento, classe, chaveMes, valor, dicionarios);
    }
}

/**
 * Constrói a árvore de Drill-down (Classe -> Depto -> Categoria -> Fornecedor)
 */
function popularDetalhamento(item, detalhamentoBase, classe, chaveMes, valorTotal, dicionarios) {
    const fornecedor = item.Cliente || "Não informado";
    const chavePrimaria = `${classe}|${chaveMes}`; // A UI agrupa por esta chave
    
    if (!detalhamentoBase[chavePrimaria]) detalhamentoBase[chavePrimaria] = { total: 0, departamentos: {} };
    const noRaiz = detalhamentoBase[chavePrimaria];

    // Se não houver departamentos definidos, joga 100% para o departamento "0"
    const deptos = item.Departamentos.length > 0 ? item.Departamentos : [{ CodDpto: "0", PercDepto: 100 }];

    deptos.forEach(d => {
        const percentual = (d.PercDepto ?? 100) / 100;
        const valorRateado = valorTotal * percentual;
        const nomeDepto = dicionarios.departamentosMap.get(String(d.CodDpto)) || 'Outros Departamentos';
        const codCat = item.CODCategoria || item.Categoria;

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

/**
 * Calcula as linhas de fechamento (Receita Líquida, Caixa Final, etc) 
 * e adiciona a coluna "TOTAL" para todas as linhas.
 * Pode ser chamado no processamento individual e também APÓS o merge global.
 */
export function aplicarRegrasDeTotaisDRE(estrutura, arrayColunasOrdenadas = null) {
    const dre = estrutura.dre;
    
    // Se não informaram as colunas (processamento inicial), usamos as que foram encontradas
    const colunas = arrayColunasOrdenadas || Array.from(estrutura.chavesEncontradas).sort((a, b) => {
        const [mA, aA] = a.split('-').map(Number);
        const [mB, aB] = b.split('-').map(Number);
        return aA !== aB ? aA - aB : mA - mB;
    });

    let saldoAcumulado = estrutura.saldoInicialBase || 0;

    colunas.forEach(col => {
        // Função auxiliar para pegar valor seguro (0 se nulo)
        const v = (linha) => dre[linha]?.[col] || 0;

        // 1. Receita Líquida
        const recLiq = v('(+) Receita Bruta') + v('(-) Deduções');
        dre['(=) Receita Líquida'][col] = recLiq;

        // 2. Geração de Caixa Operacional
        const gerCaixa = recLiq + v('(-) Custos') + v('(-) Despesas') + v('(+/-) IRPJ/CSLL');
        dre['(+/-) Geração de Caixa Operacional'][col] = gerCaixa;

        // 3. Movimentação Mensal
        const movNaoOp = v('(+/-) Resultado Financeiro') + v('(+/-) Aportes/Retiradas') + 
                         v('(+/-) Investimentos') + v('(+/-) Empréstimos/Consórcios');
        const movMensal = gerCaixa + movNaoOp;
        dre['(=) Movimentação de Caixa Mensal'][col] = movMensal;

        // 4. Fechamento de Caixa
        dre['Caixa Inicial'][col] = saldoAcumulado;
        
        // Aplica transferências e não classificados para o saldo final real
        const fechamentoMes = movMensal + v('Entrada de Transferência') + v('Saída de Transferência') + v('Outros');
        saldoAcumulado += fechamentoMes;
        
        dre['Caixa Final'][col] = saldoAcumulado;
    });

    // 5. Cálculo da Coluna "TOTAL" Horizontal
    Object.keys(dre).forEach(linha => {
        if (linha === 'Caixa Inicial') {
            // O Total do Caixa Inicial é o valor do primeiro período
            dre[linha]['TOTAL'] = dre[linha][colunas[0]] || 0;
        } else if (linha === 'Caixa Final') {
            // O Total do Caixa Final é o valor do último período
            dre[linha]['TOTAL'] = dre[linha][colunas[colunas.length - 1]] || 0;
        } else {
            // Demais linhas são a soma convencional
            dre[linha]['TOTAL'] = colunas.reduce((acc, col) => acc + (dre[linha][col] || 0), 0);
        }
    });

    // Faz o mesmo para Entradas e Saídas
    Object.keys(estrutura.entradasSaidas).forEach(linha => {
        estrutura.entradasSaidas[linha]['TOTAL'] = colunas.reduce((acc, col) => acc + (estrutura.entradasSaidas[linha][col] || 0), 0);
    });
}

// --- Funções Auxiliares de Data ---

/** Incrementa um mês no formato MM-AAAA */
export const incrementarMes = (chave) => {
    if (!chave) return null;
    let [m, a] = chave.split('-').map(Number);
    return m === 12 ? `01-${a + 1}` : `${String(m + 1).padStart(2, '0')}-${a}`;
};

/** Compara duas chaves MM-AAAA. Retorna < 0 se a < b, 0 se iguais, > 0 se a > b */
export const compararChaves = (a, b) => {
    const [ma, aa] = a.split('-').map(Number);
    const [mb, ab] = b.split('-').map(Number);
    return aa !== ab ? aa - ab : ma - mb;
};

// --- Processamento de Capital de Giro ---

/**
 * Processa as projeções de Contas a Pagar e a Receber para a matriz de Capital de Giro.
 * @param {Array} dadosCapitalGiro - Array de objetos (titulos) retornados pela API
 * @param {Object} bucketsPorProjeto - Os buckets já instanciados pela processarDadosConta
 * @param {String} contaId - ID da conta atual
 */
export function processarCapitalDeGiro(dadosCapitalGiro, bucketsPorProjeto, contaId, projecao) {
    if (!Array.isArray(dadosCapitalGiro)) return;

    const hoje = new Date();
    const chaveMesAtual = `${String(hoje.getMonth() + 1).padStart(2, '0')}-${hoje.getFullYear()}`;

    dadosCapitalGiro.forEach(cg => {
        if (!cg || typeof cg.ValorTitulo === 'undefined') return;
        
        const codProjeto = (cg.CODProjeto && cg.CODProjeto !== "0") ? String(cg.CODProjeto) : 'SEM_PROJETO';
        const bucket = bucketsPorProjeto[codProjeto] || bucketsPorProjeto['SEM_PROJETO'];
        const destinoCG = bucket.capitalGiro;

        const valor = normalizarNatureza(cg.Natureza) === 'P' ? -cg.ValorTitulo : cg.ValorTitulo;

        if (cg.DataEmissao && cg.DataVencimento && String(cg.CODContaEmissao) === contaId) {
            const chaveE = formatarChaveMesAno(cg.DataEmissao);
            const chaveV = formatarChaveMesAno(cg.DataVencimento);
            
            let chaveFinal = chaveV;
            if (cg.DataPagamento) {
                chaveFinal = formatarChaveMesAno(cg.DataPagamento);
            }

            if (chaveE && chaveFinal && compararChaves(chaveE, chaveFinal) <= 0) {
                let chaveAtual = chaveE;

                while (chaveAtual && compararChaves(chaveAtual, chaveFinal) <= 0) {
                    // Correção: Aplica a trava de data apenas se for modo "realizado"
                    if (projecao === "realizado" && compararChaves(chaveAtual, chaveMesAtual) >= 0) break;

                    const isUltimoMes = compararChaves(chaveAtual, chaveFinal) === 0;
                    bucket.chavesEncontradas.add(chaveAtual);

                    if (valor < 0) {
                        destinoCG['(-) Fornecedores a Pagar'][chaveAtual] = (destinoCG['(-) Fornecedores a Pagar'][chaveAtual] || 0) + valor;
                        if (isUltimoMes) {
                            destinoCG['Curto Prazo AP'][chaveAtual] = (destinoCG['Curto Prazo AP'][chaveAtual] || 0) + valor;
                        } else {
                            destinoCG['Longo Prazo AP'][chaveAtual] = (destinoCG['Longo Prazo AP'][chaveAtual] || 0) + valor;
                        }
                    } else {
                        destinoCG['(+) Clientes a Receber'][chaveAtual] = (destinoCG['(+) Clientes a Receber'][chaveAtual] || 0) + valor;
                        if (isUltimoMes) {
                            destinoCG['Curto Prazo AR'][chaveAtual] = (destinoCG['Curto Prazo AR'][chaveAtual] || 0) + valor;
                        } else {
                            destinoCG['Longo Prazo AR'][chaveAtual] = (destinoCG['Longo Prazo AR'][chaveAtual] || 0) + valor;
                        }
                    }

                    if (isUltimoMes) break;
                    chaveAtual = incrementarMes(chaveAtual);
                }
            }
        }
    });
}

// --- Pós Processamento Matemático do CG ---

/**
 * Calcula os totais do Capital de Giro (Líquido, Curto/Longo Prazo TT).
 * Esta função deve ser chamada APÓS o merge global ou na renderização final,
 * pois depende do saldo de caixa alimentado pela DRE.
 */
export function aplicarRegrasDeTotaisCG(estrutura, arrayColunasOrdenadas = null) {
    const cg = estrutura.capitalGiro;
    const colunas = arrayColunasOrdenadas || Array.from(estrutura.chavesEncontradas).sort(compararChaves);
    
    // O saldo base do caixa é o saldo inicial da estrutura
    let saldoCaixaAcumulado = estrutura.saldoInicialBase || 0;

    colunas.forEach(col => {
        // 1. Somatórias de Prazos
        const cpAP = cg['Curto Prazo AP'][col] || 0;
        const cpAR = cg['Curto Prazo AR'][col] || 0;
        const lpAP = cg['Longo Prazo AP'][col] || 0;
        const lpAR = cg['Longo Prazo AR'][col] || 0;

        const curtoPrazo = cpAP + cpAR;
        const longoPrazo = lpAP + lpAR;

        cg['Curto Prazo TT'][col] = curtoPrazo;
        cg['Longo Prazo TT'][col] = longoPrazo;

        // 2. Sincronização de Caixa (Fluxo DRE)
        const entradas = estrutura.entradasSaidas['(+) Entradas']?.[col] || 0;
        const saidas = estrutura.entradasSaidas['(-) Saídas']?.[col] || 0; 
        const entTransf = estrutura.entradasSaidas['(+) Entradas de Transferência']?.[col] || 0;
        const saiTransf = estrutura.entradasSaidas['(-) Saídas de Transferência']?.[col] || 0;

        saldoCaixaAcumulado += (entradas + saidas + entTransf + saiTransf);

        // 3. Fechamento do Capital Líquido
        cg['(+) Caixa'][col] = saldoCaixaAcumulado;
        cg['Capital Liquido'][col] = curtoPrazo + longoPrazo + saldoCaixaAcumulado;
    });
}

// --- Funções de Merge (Mensal e Anual) ---

/**
 * Cria uma estrutura vazia para o merge. 
 * Reutiliza a mesma lógica de criação para garantir compatibilidade.
 */
const criarEstruturaVaziaParaMerge = () => {
    const est = {
        saldoInicialBase: 0,
        chavesEncontradas: new Set(),
        dre: {}, entradasSaidas: {}, capitalGiro: {},
        fluxoDiario: [], detalhamento: {}
    };
    
    // Inicializa as matrizes para evitar erros de undefined durante o merge
    ['(+) Entradas', '(-) Saídas', '(+) Entradas de Transferência', '(-) Saídas de Transferência'].forEach(l => est.entradasSaidas[l] = {});
    ['(+) Caixa', '(+) Clientes a Receber', 'Curto Prazo AR', 'Longo Prazo AR', '(-) Fornecedores a Pagar', 'Curto Prazo AP', 'Longo Prazo AP', 'Curto Prazo TT', 'Longo Prazo TT', 'Capital Liquido'].forEach(l => est.capitalGiro[l] = {});
    
    return est;
};

/**
 * Mescla dicionários numéricos simples (1 nível de profundidade)
 */
const mergeDicionario = (origem, destino) => {
    for (const linha in origem) {
        if (!destino[linha]) destino[linha] = {};
        for (const coluna in origem[linha]) {
            destino[linha][coluna] = (destino[linha][coluna] || 0) + origem[linha][coluna];
        }
    }
};

/**
 * Merge profundo para a árvore de detalhamento (Drill-down)
 */
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

/**
 * Função recursiva auxiliar para o detalhamento
 */
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

/**
 * Agrupa os dados mensais em anos.
 * Aplica as regras de saldo inicial (pega o 1º valor) e saldo final (pega o último valor).
 */
const converterParaAnual = (estruturaMensal) => {
    const anual = criarEstruturaVaziaParaMerge();
    anual.saldoInicialBase = estruturaMensal.saldoInicialBase;
    anual.fluxoDiario = estruturaMensal.fluxoDiario; // Fluxo diário não muda a granularidade
    
    // Mapeia quais meses pertencem a quais anos, em ordem cronológica
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

    // Função interna para agrupar matrizes baseada em regras de tempo
    const agruparMatriz = (matrizMensal, matrizAnual, linhasPrimeiroValor = [], linhasUltimoValor = []) => {
        for (const linha in matrizMensal) {
            matrizAnual[linha] = {};
            const isPrimeiro = linhasPrimeiroValor.includes(linha);
            // O '*' atua como coringa para forçar todas as linhas daquela matriz a pegarem o último valor
            const isUltimo = linhasUltimoValor.includes(linha) || linhasUltimoValor.includes('*');

            for (const ano in mapaAnos) {
                const mesesDoAno = mapaAnos[ano];
                if (!mesesDoAno || mesesDoAno.length === 0) continue;

                if (isPrimeiro) {
                    // Ex: Caixa Inicial pega o valor do 1º mês disponível do ano
                    const mesIni = mesesDoAno.find(m => matrizMensal[linha][m] != null);
                    matrizAnual[linha][ano] = mesIni ? matrizMensal[linha][mesIni] : 0;
                } else if (isUltimo) {
                    // Ex: Capital de Giro e Caixa Final pegam o valor do último mês disponível do ano
                    const mesFim = [...mesesDoAno].reverse().find(m => matrizMensal[linha][m] != null);
                    matrizAnual[linha][ano] = mesFim ? matrizMensal[linha][mesFim] : 0;
                } else {
                    // Demais linhas de DRE e Entradas/Saídas somam os valores de todos os meses
                    matrizAnual[linha][ano] = mesesDoAno.reduce((acc, mes) => acc + (matrizMensal[linha][mes] || 0), 0);
                }
            }
        }
    };

    // Agrupa DRE e Entradas/Saídas
    agruparMatriz(estruturaMensal.dre, anual.dre, ['Caixa Inicial'], ['Caixa Final']);
    agruparMatriz(estruturaMensal.entradasSaidas, anual.entradasSaidas);
    
    // Agrupa Capital de Giro (todas as linhas representam uma "foto" e pegam o último valor)
    agruparMatriz(estruturaMensal.capitalGiro, anual.capitalGiro, [], ['*']);

    // Agrupa Detalhamento (Drill-down) convertendo a chave 'Classe|MM-AAAA' para 'Classe|AAAA'
    for (const chave in estruturaMensal.detalhamento) {
        const [classe, mesAno] = chave.split('|');
        const ano = mesAno.split('-')[1];
        const novaChave = `${classe}|${ano}`;

        if (!anual.detalhamento[novaChave]) {
            anual.detalhamento[novaChave] = { total: 0, departamentos: {} };
        }
        
        anual.detalhamento[novaChave].total += estruturaMensal.detalhamento[chave].total;
        mergeNiveis(anual.detalhamento[novaChave].departamentos, estruturaMensal.detalhamento[chave].departamentos);
    }

    return anual;
};

/**
 * Função principal a ser chamada pelo main.js após recuperar os dados.
 * Recebe a lista de buckets já processados e os une em uma única estrutura final.
 * * @param {Array} estruturasProcessadas - Array de objetos gerados pelo processarDadosConta
 * @param {String} modo - 'mensal' ou 'anual'
 * @param {Array} colunasVisiveis - Colunas que a UI precisa renderizar
 * @returns {Object} Estrutura consolidada e pronta para a UI
 */
export function mergeMatrizes(estruturasProcessadas, modo, colunasVisiveis) {
    let consolidadoMensal = criarEstruturaVaziaParaMerge();

    // 1. Merge de todas as estruturas em uma única base MENSAL
    estruturasProcessadas.forEach(est => {
        if (!est) return;

        consolidadoMensal.saldoInicialBase += (est.saldoInicialBase || 0);
        
        est.chavesEncontradas.forEach(c => consolidadoMensal.chavesEncontradas.add(c));
        
        mergeDicionario(est.dre, consolidadoMensal.dre);
        mergeDicionario(est.entradasSaidas, consolidadoMensal.entradasSaidas);
        mergeDicionario(est.capitalGiro, consolidadoMensal.capitalGiro);
        
        if (est.fluxoDiario && est.fluxoDiario.length > 0) {
            consolidadoMensal.fluxoDiario.push(...est.fluxoDiario);
        }
        
        mergeDetalhamento(est.detalhamento, consolidadoMensal.detalhamento);
    });

    // Ordena o fluxo de caixa consolidado cronologicamente
    consolidadoMensal.fluxoDiario.sort((a, b) => {
        const [dA, mA, yA] = a.data.split('/');
        const [dB, mB, yB] = b.data.split('/');
        return new Date(yA, mA - 1, dA) - new Date(yB, mB - 1, dB);
    });

    // 2. Converte para Anual se necessário (com base no input da UI)
    let resultadoFinal = modo.toLowerCase() === 'anual' 
        ? converterParaAnual(consolidadoMensal) 
        : consolidadoMensal;

    // 3. Aplica os totais e recalcula saldos com base nas colunas visíveis finais
    // Chamadas para as funções previamente criadas no passo anterior.
    // Isso garante que cálculos que dependem de acúmulo (como Caixa Final) estejam alinhados ao Merge.
    if (typeof aplicarRegrasDeTotaisDRE === 'function') aplicarRegrasDeTotaisDRE(resultadoFinal, colunasVisiveis);
    if (typeof aplicarRegrasDeTotaisCG === 'function') aplicarRegrasDeTotaisCG(resultadoFinal, colunasVisiveis);

    return resultadoFinal;
}