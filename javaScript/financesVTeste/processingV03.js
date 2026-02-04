// processingV03.js

// --- Constantes e Configurações ---
const DRE_CONSTANTS = {
    RECEITA_BRUTA: '(+) Receita Bruta',
    DEDUCOES: '(-) Deduções',
    CUSTOS: '(-) Custos',
    DESPESAS: '(-) Despesas',
    IRPJ_CSLL: '(+/-) IRPJ/CSLL',
    RES_FINANCEIRO: '(+/-) Resultado Financeiro',
    APORTES: '(+/-) Aportes/Retiradas',
    INVESTIMENTOS: '(+/-) Investimentos',
    EMPRESTIMOS: '(+/-) Empréstimos/Consórcios',
    OUTROS: 'Outros'
};

// Classes que exigem drill-down (detalhamento por departamento/fornecedor)
const CLASSES_DETALHAMENTO = new Set([
    ...Object.values(DRE_CONSTANTS),
    DRE_CONSTANTS.OUTROS
]);

// --- Helpers de Data e Estrutura ---

const DataUtils = {
    parse: (str) => {
        if (!str || typeof str !== 'string') return null;
        const [d, m, y] = str.split('/');
        return new Date(y, m - 1, d);
    },
    // Compara chaves 'MM-YYYY'
    compareChaves: (a, b) => {
        const [ma, aa] = a.split('-').map(Number);
        const [mb, ab] = b.split('-').map(Number);
        return aa !== ab ? aa - ab : ma - mb;
    },
    incrementarMes: (chave) => {
        let [m, a] = chave.split('-').map(Number);
        m++;
        if (m > 12) { m = 1; a++; }
        return `${String(m).padStart(2, '0')}-${a}`;
    }
};

/**
 * Organiza uma lista plana em buckets baseados no ID do Projeto.
 * Útil para processar DRE isolada por projeto antes de consolidar.
 */
function segmentarPorProjeto(lista) {
    const buckets = { 'SEM_PROJETO': [] };
    if (!Array.isArray(lista)) return buckets;

    for (const item of lista) {
        const key = item.CODProjeto ? String(item.CODProjeto) : 'SEM_PROJETO';
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(item);
    }
    return buckets;
}

// --- Funções de Extração de Dados (Parsing) ---

/**
 * Normaliza a Natureza ('D' -> 'P'agar, 'R'eceber).
 */
const normalizarNatureza = (nat) => (nat === 'D' || nat === 'P') ? 'P' : 'R';

/**
 * Processa JSON bruto de Títulos para objetos de negócio.
 * Separa lógica de DRE (filtrada por ano) e Capital de Giro (todo histórico).
 */
export function extrairDadosDosTitulos(titulosRaw, contaId, anoFiltro = null) {
    const result = { lancamentosProcessados: [], titulosEmAberto: [], capitalDeGiro: [] };
    if (!Array.isArray(titulosRaw)) return result;

    for (const titulo of titulosRaw) {
        if (!titulo?.Categoria) continue;
        const natureza = normalizarNatureza(titulo.Natureza);
        let valorPagoAcumulado = 0;

        // 1. Processar Baixas (Realizado)
        if (Array.isArray(titulo.Lancamentos)) {
            for (const lanc of titulo.Lancamentos) {
                if (!lanc.DataLancamento || !lanc.CODContaC || lanc.ValorLancamento === undefined) continue;

                valorPagoAcumulado += (lanc.ValorBaixado || 0);

                // Regra: DRE obedece estritamente o ano selecionado.
                // Capital de Giro precisa do histórico para curvas de pagamento.
                const anoLancamento = lanc.DataLancamento.split('/')[2];
                const pertenceAoAno = !anoFiltro || anoLancamento === String(anoFiltro);

                // Adiciona ao DRE se for da conta e ano corretos
                if (String(lanc.CODContaC) === contaId && pertenceAoAno) {
                    result.lancamentosProcessados.push({
                        Natureza: natureza,
                        DataLancamento: lanc.DataLancamento,
                        CODContaC: lanc.CODContaC,
                        CODProjeto: titulo.CODProjeto || null,
                        ValorLancamento: lanc.ValorLancamento,
                        CODCategoria: titulo.Categoria,
                        Cliente: titulo.Cliente,
                        Departamentos: gerarRateioDeptos(titulo.Departamentos, lanc.ValorLancamento),
                        obs: titulo.obsTitulo ?? lanc.obs ?? null
                    });
                }

                // Adiciona ao Capital de Giro (Histórico de Liquidação)
                result.capitalDeGiro.push({
                    Natureza: natureza,
                    DataPagamento: lanc.DataLancamento,
                    DataVencimento: titulo.DataVencimento,
                    DataEmissao: titulo.DataEmissao,
                    ValorTitulo: lanc.ValorLancamento,
                    CODContaEmissao: titulo.CODContaC, // Quem emitiu
                    CODContaPagamento: lanc.CODContaC, // Quem pagou
                    CODProjeto: titulo.CODProjeto
                });
            }
        }

        // 2. Processar Saldos em Aberto (A Realizar)
        const saldoDevedor = titulo.ValorTitulo - valorPagoAcumulado;
        if (saldoDevedor >= 0.01 && titulo.ValorTitulo !== 0) {
            // DRE Futura
            result.titulosEmAberto.push({
                Natureza: natureza,
                DataLancamento: titulo.DataVencimento,
                CODContaC: titulo.CODContaC,
                CODProjeto: titulo.CODProjeto,
                ValorLancamento: saldoDevedor,
                CODCategoria: titulo.Categoria,
                Cliente: titulo.Cliente || "Cliente",
                Departamentos: gerarRateioDeptos(titulo.Departamentos, saldoDevedor),
                obs: titulo.obsTitulo
            });

            // Projeção Capital Giro
            result.capitalDeGiro.push({
                Natureza: natureza,
                DataPagamento: null,
                DataVencimento: titulo.DataVencimento,
                DataEmissao: titulo.DataEmissao,
                ValorTitulo: saldoDevedor,
                CODContaEmissao: titulo.CODContaC,
                CODContaPagamento: null,
                CODProjeto: titulo.CODProjeto
            });
        }
    }
    return result;
}

export function extrairLancamentosSimples(lancamentosRaw, contaId, anoFiltro = null) {
    const result = [];
    if (!Array.isArray(lancamentosRaw)) return result;

    for (const item of lancamentosRaw) {
        if (!item?.Lancamentos) continue;
        const natureza = normalizarNatureza(item.Natureza);

        for (const lanc of item.Lancamentos) {
            if (!lanc.DataLancamento || String(lanc.CODContaC) !== contaId) continue;
            
            if (anoFiltro) {
                if (lanc.DataLancamento.split('/')[2] !== String(anoFiltro)) continue;
            }

            result.push({
                Natureza: natureza,
                DataLancamento: lanc.DataLancamento,
                CODContaC: lanc.CODContaC,
                CODProjeto: item.CODProjeto,
                ValorLancamento: lanc.ValorLancamento,
                CODCategoria: item.Categoria,
                Cliente: item.Cliente,
                Departamentos: gerarRateioDeptos(item.Departamentos, lanc.ValorLancamento),
                obs: lanc.obs
            });
        }
    }
    return result;
}

function gerarRateioDeptos(deptos, valorTotal) {
    if (Array.isArray(deptos) && deptos.length > 0) {
        return deptos.map(d => ({
            CodDpto: String(d.CODDepto || "0"),
            ValorDepto: valorTotal * ((d.PercDepto ?? 100) / 100)
        }));
    }
    return [{ CodDpto: "0", ValorDepto: valorTotal }];
}

// --- Processamento Core (Cálculo de Matrizes) ---

/**
 * Orquestrador de processamento da conta.
 * Divide os dados por projeto e calcula DRE e Capital de Giro para cada segmento.
 */
export function processarDadosDaConta(appCache, dadosApi, contaId, saldoInicialExterno = 0) {
    const lancamentos = dadosApi.lancamentosProcessados || dadosApi.lancamentos || [];
    const titulos = dadosApi.titulosEmAberto || dadosApi.titulos || [];
    const capitalGiro = dadosApi.capitalDeGiro || [];

    // Segmenta tudo por projeto
    const bLanc = segmentarPorProjeto(lancamentos);
    const bTit = segmentarPorProjeto(titulos);
    const bCG = segmentarPorProjeto(capitalGiro);

    const todosProjetos = new Set([...Object.keys(bLanc), ...Object.keys(bTit), ...Object.keys(bCG)]);
    const resultadoSegmentado = {};

    todosProjetos.forEach(proj => {
        // Processa DREs (Realizado e A Realizar)
        // Nota: Saldo inicial é 0 aqui pois estamos calculando apenas a movimentação do projeto/segmento
        const realizado = calcularDREeFluxo(appCache, bLanc[proj] || [], contaId, 0);
        const arealizar = calcularDREeFluxo(appCache, bTit[proj] || [], contaId, 0);

        // Processa Capital de Giro (depende do realizado para calcular o caixa acumulado)
        const capGiro = calcularCapitalDeGiro(bCG[proj] || [], contaId, 0, realizado);

        resultadoSegmentado[proj] = { realizado, arealizar, capitalDeGiro: capGiro };
    });

    return {
        isSegmented: true,
        segments: resultadoSegmentado,
        saldoInicialBase: Number(saldoInicialExterno) // Saldo global da conta bancária
    };
}

/**
 * Calcula a Matriz DRE, Detalhamento e Fluxo de Caixa a partir de lançamentos.
 */
function calcularDREeFluxo(appCache, listaLancamentos, contaId, saldoIni) {
    const matrizDRE = {};
    const matrizDetalhamento = {};
    const entradasESaidas = {
        '(+) Entradas': {}, '(-) Saídas': {},
        '(+) Entradas de Transferência': {}, '(-) Saídas de Transferência': {}
    };
    const fluxoDeCaixa = [];
    const chavesComDados = new Set();
    let valorTotal = 0;

    for (const lanc of listaLancamentos) {
        if (String(lanc.CODContaC) !== contaId || !lanc.DataLancamento) continue;

        const [dia, mes, ano] = lanc.DataLancamento.split('/');
        const chavePeriodo = `${mes.padStart(2, '0')}-${ano}`;
        chavesComDados.add(chavePeriodo);

        // Define valor com sinal
        const valor = (lanc.Natureza === 'P') ? -lanc.ValorLancamento : lanc.ValorLancamento;
        valorTotal += valor;

        // Classificação
        const infoClasse = appCache.classesMap.get(lanc.CODCategoria);
        const nomeClasse = infoClasse ? infoClasse.classe : DRE_CONSTANTS.OUTROS;
        const nomeCategoria = appCache.categoriasMap.get(lanc.CODCategoria);

        // 1. Popula Fluxo de Caixa (Lista Plana)
        const isTransf = lanc.CODCategoria.startsWith("0.01");
        fluxoDeCaixa.push({
            valor,
            descricao: isTransf ? 'Transferência Entre Contas' : `${nomeCategoria} - ${lanc.Cliente}`,
            data: lanc.DataLancamento,
            obs: lanc.obs
        });

        // 2. Popula Matriz DRE (Agregado)
        matrizDRE[nomeClasse] = matrizDRE[nomeClasse] || {};
        matrizDRE[nomeClasse][chavePeriodo] = (matrizDRE[nomeClasse][chavePeriodo] || 0) + valor;

        // 3. Popula Entradas e Saídas (Auxiliar para Gráficos)
        const tipoES = (valor < 0) 
            ? (isTransf ? '(-) Saídas de Transferência' : '(-) Saídas')
            : (isTransf ? '(+) Entradas de Transferência' : '(+) Entradas');
        entradasESaidas[tipoES][chavePeriodo] = (entradasESaidas[tipoES][chavePeriodo] || 0) + valor;

        // 4. Popula Matriz Detalhamento (Drill-down profundo)
        if (CLASSES_DETALHAMENTO.has(nomeClasse) && lanc.Departamentos?.length) {
            processarDetalhamento(matrizDetalhamento, appCache, lanc, nomeClasse, chavePeriodo, valor, nomeCategoria);
        }
    }

    fluxoDeCaixa.sort((a, b) => DataUtils.parse(a.data) - DataUtils.parse(b.data));

    return { matrizDRE, matrizDetalhamento, chavesComDados, valorTotal, entradasESaidas, saldoIni, fluxoDeCaixa };
}

/**
 * Helper para preencher a árvore de detalhamento (Classe -> Depto -> Categoria -> Fornecedor).
 */
function processarDetalhamento(matriz, appCache, lanc, classe, periodo, valorTotalLanc, nomeCategoria) {
    const chaveRaiz = `${classe}|${periodo}`;
    if (!matriz[chaveRaiz]) matriz[chaveRaiz] = { total: 0, departamentos: {} };

    const nodeRaiz = matriz[chaveRaiz];
    const fornecedor = lanc.Cliente || "Indefinido";

    lanc.Departamentos.forEach(depto => {
        let val = depto.ValorDepto;
        if (lanc.Natureza === 'P') val = -val;

        // Nível 1: Total da Classe
        nodeRaiz.total += val;

        // Nível 2: Departamento
        const nomeDepto = appCache.departamentosMap.get(String(depto.CodDpto)) || 'Outros';
        if (!nodeRaiz.departamentos[nomeDepto]) nodeRaiz.departamentos[nomeDepto] = { total: 0, categorias: {} };
        const nodeDepto = nodeRaiz.departamentos[nomeDepto];
        nodeDepto.total += val;

        // Nível 3: Categoria
        const codCat = lanc.CODCategoria;
        if (!nodeDepto.categorias[codCat]) nodeDepto.categorias[codCat] = { total: 0, fornecedores: {} };
        const nodeCat = nodeDepto.categorias[codCat];
        nodeCat.total += val;

        // Nível 4: Fornecedor
        if (!nodeCat.fornecedores[fornecedor]) nodeCat.fornecedores[fornecedor] = { total: 0 };
        nodeCat.fornecedores[fornecedor].total += val;
    });
}

// ... (Código anterior de extração e DRE permanece igual) ...

// --- Lógica Completa de Capital de Giro (Substitui a versão resumida) ---

/**
 * Calcula a matriz de Capital de Giro projetando pagamentos e recebimentos.
 */
function calcularCapitalDeGiro(raw, contaId, saldoIni, dadosRealizado) {
    const matriz = {};
    const linhas = [
        '(+) Caixa', '(+) Clientes a Receber', 'Curto Prazo AR', 'Longo Prazo AR', 
        '(-) Fornecedores a Pagar', 'Curto Prazo AP', 'Longo Prazo AP', 
        'Curto Prazo TT', 'Longo Prazo TT', 'Capital Liquido'
    ];
    linhas.forEach(l => matriz[l] = {});

    // Data de corte ("Hoje")
    const hoje = new Date();
    const chaveAtual = `${String(hoje.getMonth()+1).padStart(2,'0')}-${hoje.getFullYear()}`;
    const todasChaves = new Set();
    const fluxoLocal = {}; // Para quando não houver DRE associado

    // 1. Itera sobre títulos para projetar o futuro
    for (const item of raw) {
        const val = item.Natureza === 'P' ? -item.ValorTitulo : item.ValorTitulo;
        if (!val) continue;

        // Histórico de pagamentos efetivos (para fluxoLocal)
        if (item.DataPagamento && String(item.CODContaPagamento) === contaId) {
            const [d, m, y] = item.DataPagamento.split('/');
            const k = `${m.padStart(2,'0')}-${y}`;
            if (DataUtils.compareChaves(k, chaveAtual) < 0) {
                fluxoLocal[k] = (fluxoLocal[k] || 0) + val;
                todasChaves.add(k);
            }
        }

        // Projeção futura (A Receber / A Pagar)
        if (item.DataEmissao && item.DataVencimento && String(item.CODContaEmissao) === contaId) {
            processarProjecaoCG(matriz, item, chaveAtual, todasChaves);
        }
    }

    // 2. Calcula Saldo de Caixa (Acumulado)
    let saldo = saldoIni;
    // Une as chaves do DRE realizado
    if (dadosRealizado && dadosRealizado.chavesComDados) {
        dadosRealizado.chavesComDados.forEach(c => todasChaves.add(c));
    }
    
    // Ordena cronologicamente
    Array.from(todasChaves).sort(DataUtils.compareChaves).forEach(k => {
        // Para o saldo ao chegar no futuro (caixa futuro é apenas projeção de curto/longo prazo)
        if (DataUtils.compareChaves(k, chaveAtual) >= 0) return;

        // Soma o fluxo líquido do período
        let fluxoLiq = fluxoLocal[k] || 0;
        if (dadosRealizado && dadosRealizado.entradasESaidas) {
            const es = dadosRealizado.entradasESaidas;
            fluxoLiq = (es['(+) Entradas'][k]||0) + (es['(-) Saídas'][k]||0) +
                       (es['(+) Entradas de Transferência'][k]||0) + (es['(-) Saídas de Transferência'][k]||0);
        }
        saldo += fluxoLiq;

        // Calcula totais da coluna
        const cp = (matriz['Curto Prazo AP'][k]||0) + (matriz['Curto Prazo AR'][k]||0);
        const lp = (matriz['Longo Prazo AP'][k]||0) + (matriz['Longo Prazo AR'][k]||0);
        
        matriz['(+) Caixa'][k] = saldo;
        matriz['Curto Prazo TT'][k] = cp;
        matriz['Longo Prazo TT'][k] = lp;
        matriz['Capital Liquido'][k] = cp + lp + saldo;
    });

    return { saldoInicial: saldoIni, matrizCapitalGiro: matriz };
}

// Helper para isolar a complexidade do loop de projeção do Capital de Giro
function processarProjecaoCG(matriz, item, chaveAtual, chavesSet) {
    const val = item.Natureza === 'P' ? -item.ValorTitulo : item.ValorTitulo;
    const [, me, ae] = item.DataEmissao.split('/');
    const [, mv, av] = item.DataVencimento.split('/');
    
    // Define fim da projeção: Pagamento (se houve) ou Vencimento
    let chaveFim = `${mv.padStart(2,'0')}-${av}`;
    if(item.DataPagamento) {
        const [, mp, ap] = item.DataPagamento.split('/');
        chaveFim = `${mp.padStart(2,'0')}-${ap}`;
    }

    let cursor = `${me.padStart(2,'0')}-${ae}`;
    // Validação de datas invertidas
    if (DataUtils.compareChaves(cursor, chaveFim) > 0) return;

    // Loop mês a mês
    while (cursor && DataUtils.compareChaves(cursor, chaveFim) <= 0) {
        // Se entrou no futuro (modo Realizado), pare.
        if (DataUtils.compareChaves(cursor, chaveAtual) >= 0) break;

        const isUltimo = cursor === chaveFim;
        const mainLine = item.Natureza === 'P' ? '(-) Fornecedores a Pagar' : '(+) Clientes a Receber';
        const sufixo = item.Natureza === 'P' ? 'AP' : 'AR';

        // Preenche linha principal
        matriz[mainLine][cursor] = (matriz[mainLine][cursor] || 0) + val;
        
        // Distribui Curto/Longo Prazo
        const prazoLine = isUltimo ? `Curto Prazo ${sufixo}` : `Longo Prazo ${sufixo}`;
        matriz[prazoLine][cursor] = (matriz[prazoLine][cursor] || 0) + val;

        chavesSet.add(cursor);
        
        if (isUltimo) break;
        cursor = DataUtils.incrementarMes(cursor);
    }
}


// --- Consolidação (Merge) ---

export function mergeMatrizes(dadosProcessados, modo, colunas, projecao, dadosEstoque, saldoInicialExterno, projetosFiltro) {
    // 1. Aplainar dados (Flattening) filtrando por projeto
    const listaParaMerge = [];
    const projetosPermitidos = new Set((projetosFiltro || []).map(String));
    let saldoInicialAcumulado = 0;

    for (const conta of dadosProcessados) {
        if (!conta) continue;
        saldoInicialAcumulado += (conta.saldoInicialBase || 0);

        if (conta.isSegmented && conta.segments) {
            Object.entries(conta.segments).forEach(([projId, dadosProj]) => {
                if (projId === 'SEM_PROJETO' || projetosPermitidos.has(projId)) {
                    const dadosModo = dadosProj[projecao.toLowerCase()];
                    if (dadosModo) {
                        // Traz o CG junto para o merge
                        if (dadosProj.capitalDeGiro) dadosModo.matrizCapitalGiro = dadosProj.capitalDeGiro.matrizCapitalGiro;
                        listaParaMerge.push(dadosModo);
                    }
                }
            });
        }
    }

    if (listaParaMerge.length === 0) return { matrizDRE: {}, matrizDetalhamento: {}, entradasESaidas: {}, fluxoDeCaixa: [], dadosEstoque: {}, matrizCapitalGiro: {} };

    // 2. Soma Mensal
    const merged = consolidarDadosMensais(listaParaMerge, projecao, dadosEstoque);

    // 3. Agrega Anual se necessário
    const dadosFinais = (modo.toLowerCase() === 'anual') 
        ? agregarParaAnual(merged, projecao) 
        : merged;

    // 4. Calcula Totais Calculados (Receita Líquida, Caixa Final, etc)
    const saldoInicial = (saldoInicialExterno !== null) ? saldoInicialExterno : saldoInicialAcumulado;
    calcularLinhasCalculadasDRE(dadosFinais.matrizDRE, colunas, saldoInicial, modo);
    
    // Calcula Totais das Colunas
    ['matrizDRE', 'entradasESaidas'].forEach(k => calcularTotaisHorizontais(dadosFinais[k], colunas));

    return dadosFinais;
}

function consolidarDadosMensais(lista, projecao, dadosEstoque) {
    const res = { matrizDRE: {}, matrizDetalhamento: {}, entradasESaidas: {}, matrizCapitalGiro: {}, fluxoDeCaixa: [], dadosEstoque: {} };

    lista.forEach(dado => {
        mergeGenerico(dado.matrizDRE, res.matrizDRE);
        mergeGenerico(dado.entradasESaidas, res.entradasESaidas);
        if (projecao === "realizado") mergeGenerico(dado.matrizCapitalGiro, res.matrizCapitalGiro);
        
        res.fluxoDeCaixa.push(...dado.fluxoDeCaixa);
        
        // Merge Detalhamento (Deep Merge)
        Object.entries(dado.matrizDetalhamento).forEach(([key, val]) => {
            if (!res.matrizDetalhamento[key]) res.matrizDetalhamento[key] = JSON.parse(JSON.stringify(val));
            else {
                res.matrizDetalhamento[key].total += val.total;
                mergeDeep(res.matrizDetalhamento[key].departamentos, val.departamentos);
            }
        });
    });

    dadosEstoque.forEach(est => mergeGenerico(est, res.dadosEstoque));
    res.fluxoDeCaixa.sort((a, b) => DataUtils.parse(a.data) - DataUtils.parse(b.data));
    return res;
}

// Utilitários de Merge e Cálculo
function mergeGenerico(origem, destino) {
    for (const k in origem) {
        if (!destino[k]) destino[k] = {};
        for (const p in origem[k]) destino[k][p] = (destino[k][p] || 0) + origem[k][p];
    }
}

function mergeDeep(destino, origem) {
    for (const k in origem) {
        if (!destino[k]) destino[k] = JSON.parse(JSON.stringify(origem[k]));
        else {
            destino[k].total += origem[k].total;
            if (origem[k].departamentos) mergeDeep(destino[k].departamentos, origem[k].departamentos);
            if (origem[k].categorias) mergeDeep(destino[k].categorias, origem[k].categorias);
            if (origem[k].fornecedores) mergeDeep(destino[k].fornecedores, origem[k].fornecedores);
        }
    }
}

/**
 * Calcula a matriz de Capital de Giro projetando pagamentos e recebimentos.
 */
function calcularCapitalDeGiro(capitalGiroRaw, contaId, saldoInicial, dadosRealizado) {
    const matrizCG = {};
    const linhas = [
        '(+) Caixa', '(+) Clientes a Receber', 'Curto Prazo AR', 'Longo Prazo AR',
        '(-) Fornecedores a Pagar', 'Curto Prazo AP', 'Longo Prazo AP',
        'Curto Prazo TT', 'Longo Prazo TT', 'Capital Liquido'
    ];
    linhas.forEach(l => matrizCG[l] = {});
    
    // Define "Hoje" para separar passado de futuro
    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1;
    const anoAtual = hoje.getFullYear();
    const chaveAtual = `${String(mesAtual).padStart(2, '0')}-${anoAtual}`;
    
    const todasChaves = new Set();
    const fluxoDeCaixaMensal = {}; // Fallback se não houver DRE

    // 1. Processamento dos Títulos (Projeção)
    for (const item of capitalGiroRaw) {
        const valor = item.Natureza === 'P' ? -item.ValorTitulo : item.ValorTitulo;
        if (!valor) continue;

        // Caso A: É um pagamento efetivo (Histórico/Fluxo realizado local)
        if (item.DataPagamento && String(item.CODContaPagamento) === contaId) {
            const [d, m, y] = item.DataPagamento.split('/');
            const chave = `${m.padStart(2, '0')}-${y}`;
            
            // Só considera no fluxo local se for passado
            if (DataUtils.compareChaves(chave, chaveAtual) < 0) {
                fluxoDeCaixaMensal[chave] = (fluxoDeCaixaMensal[chave] || 0) + valor;
                todasChaves.add(chave);
            }
        }

        // Caso B: É uma projeção (A Pagar / A Receber)
        // Regra: Tem Data Emissão E Vencimento E pertence à conta emissora
        if (item.DataEmissao && item.DataVencimento && String(item.CODContaEmissao) === contaId) {
            // Executa a projeção detalhada mês a mês
            processarProjecaoCG(matrizCG, item, chaveAtual, todasChaves);
        }
    }

    // 2. Cálculo da Linha de Caixa (Saldo Acumulado)
    let saldoAcumulado = saldoInicial;

    // Une chaves do DRE (Realizado) com as do Capital de Giro
    if (dadosRealizado && dadosRealizado.chavesComDados) {
        dadosRealizado.chavesComDados.forEach(c => todasChaves.add(c));
    }
    
    const chavesOrdenadas = Array.from(todasChaves).sort(DataUtils.compareChaves);

    chavesOrdenadas.forEach(chave => {
        // Interrompe cálculo de saldo se chegou no futuro (pois Caixa é saldo real)
        if (DataUtils.compareChaves(chave, chaveAtual) >= 0) return;

        // Tenta pegar o fluxo líquido do DRE (mais preciso). Se não, usa o local.
        let fluxoLiquidoPeriodo = 0;
        if (dadosRealizado && dadosRealizado.entradasESaidas) {
            const es = dadosRealizado.entradasESaidas;
            fluxoLiquidoPeriodo = (es['(+) Entradas'][chave] || 0) + 
                                  (es['(-) Saídas'][chave] || 0) +
                                  (es['(+) Entradas de Transferência'][chave] || 0) + 
                                  (es['(-) Saídas de Transferência'][chave] || 0);
        } else {
            fluxoLiquidoPeriodo = fluxoDeCaixaMensal[chave] || 0;
        }

        saldoAcumulado += fluxoLiquidoPeriodo;

        // Cálculos de Totais
        const cp = (matrizCG['Curto Prazo AP'][chave] || 0) + (matrizCG['Curto Prazo AR'][chave] || 0);
        const lp = (matrizCG['Longo Prazo AP'][chave] || 0) + (matrizCG['Longo Prazo AR'][chave] || 0);

        matrizCG['(+) Caixa'][chave] = saldoAcumulado;
        matrizCG['Curto Prazo TT'][chave] = cp;
        matrizCG['Longo Prazo TT'][chave] = lp;
        matrizCG['Capital Liquido'][chave] = cp + lp + saldoAcumulado;
    });

    return { saldoInicial, matrizCapitalGiro: matrizCG };
}

function processarProjecaoCG(matriz, item, chaveAtual, chavesSet) {
    const valor = item.Natureza === 'P' ? -item.ValorTitulo : item.ValorTitulo;
    
    // Determina o intervalo [Inicio, Fim]
    const [, me, ae] = item.DataEmissao.split('/');
    const [, mv, av] = item.DataVencimento.split('/');
    
    // A data final é o Pagamento (se houve) ou o Vencimento (se aberto)
    let chaveFim;
    if (item.DataPagamento) {
        const [, mp, ap] = item.DataPagamento.split('/');
        chaveFim = `${mp.padStart(2,'0')}-${ap}`;
    } else {
        chaveFim = `${mv.padStart(2,'0')}-${av}`;
    }
    
    // Validação básica: Emissão deve ser antes do Fim
    const chaveEmissao = `${me.padStart(2,'0')}-${ae}`;
    if (DataUtils.compareChaves(chaveEmissao, chaveFim) > 0) return;

    let cursor = chaveEmissao;

    // Loop: Preenche todos os meses entre Emissão e Fim (Liquidação)
    while (cursor && DataUtils.compareChaves(cursor, chaveFim) <= 0) {
        // Se ultrapassar a data atual (Futuro), paramos (pois é "Realizado")
        // *Nota: Se a projeção for "A Realizar", esse filtro deve ser ajustado, 
        // mas a lógica original usa o `chaveAtual` para cortar projeções passadas em dados futuros.
        if (DataUtils.compareChaves(cursor, chaveAtual) >= 0) break;

        const isUltimoMes = (cursor === chaveFim);
        
        // Seleciona as linhas corretas
        const linhaPrincipal = item.Natureza === 'P' ? '(-) Fornecedores a Pagar' : '(+) Clientes a Receber';
        const sufixo = item.Natureza === 'P' ? 'AP' : 'AR'; // AP = A Pagar, AR = A Receber

        // 1. Linha Principal (Acumula o valor cheio enquanto a dívida existe)
        matriz[linhaPrincipal][cursor] = (matriz[linhaPrincipal][cursor] || 0) + valor;

        // 2. Classificação Curto vs Longo Prazo
        // Regra: Se vence/paga neste mês = Curto Prazo. Se não = Longo Prazo.
        const chavePrazo = isUltimoMes ? `Curto Prazo ${sufixo}` : `Longo Prazo ${sufixo}`;
        matriz[chavePrazo][cursor] = (matriz[chavePrazo][cursor] || 0) + valor;

        chavesSet.add(cursor);
        
        if (isUltimoMes) break;
        cursor = DataUtils.incrementarMes(cursor);
    }
}

// --- Lógica Completa de Agregação Anual ---

/**
 * Transforma dados Mensais em Anuais.
 * Regra DRE: Soma fluxos.
 * Regra Balanço (Caixa/Estoque): Pega o último valor do ano (Saldo).
 */
function agregarParaAnual(mensal, projecao) {
    const annual = { 
        matrizDRE: {}, 
        matrizDetalhamento: {}, 
        entradasESaidas: {},
        matrizCapitalGiro: {}, 
        dadosEstoque: {},
        fluxoDeCaixa: mensal.fluxoDeCaixa // Fluxo diário não muda a lista, só a visualização
    };

    // 1. DRE e Entradas/Saídas (Soma Simples)
    ['matrizDRE', 'entradasESaidas'].forEach(tipoMatriz => {
        for (const classe in mensal[tipoMatriz]) {
            annual[tipoMatriz][classe] = {};
            for (const periodo in mensal[tipoMatriz][classe]) {
                const [mes, ano] = periodo.split('-');
                const valor = mensal[tipoMatriz][classe][periodo];

                // Exceção: Saldos de Caixa no DRE não se somam
                if (classe === 'Caixa Inicial' || classe === 'Caixa Final') {
                    // Ignora aqui, será recalculado no final pelo 'calcularLinhasCalculadasDRE'
                    continue; 
                }
                
                annual[tipoMatriz][classe][ano] = (annual[tipoMatriz][classe][ano] || 0) + valor;
            }
        }
    });

    // 2. Capital de Giro e Estoque (Lógica de Saldo Final)
    // Precisamos saber qual o último mês disponível de cada ano para pegar o saldo correto.
    const anoAtual = new Date().getFullYear();
    const mesAtualIndex = new Date().getMonth(); // 0-11

    const agregarSaldos = (origem) => {
        const destino = {};
        const bufferSaldos = {}; // { 'Classe': { '2024': { mes: 10, valor: 500 } } }

        for (const classe in origem) {
            if (!bufferSaldos[classe]) bufferSaldos[classe] = {};
            
            for (const periodo in origem[classe]) {
                const [mesStr, anoStr] = periodo.split('-');
                const mes = parseInt(mesStr);
                const ano = parseInt(anoStr);

                // Filtro de Realidade: No modo 'Realizado', não pegamos saldo futuro
                if (projecao === 'realizado' && ano === anoAtual && (mes - 1) > mesAtualIndex) continue;

                const registroAtual = bufferSaldos[classe][anoStr];
                
                // Se ainda não tem registro deste ano OU se este mês é mais recente que o guardado
                if (!registroAtual || mes > registroAtual.mes) {
                    bufferSaldos[classe][anoStr] = { mes: mes, valor: origem[classe][periodo] };
                }
            }
        }

        // Transfere do buffer para o objeto final
        for (const classe in bufferSaldos) {
            destino[classe] = {};
            for (const ano in bufferSaldos[classe]) {
                destino[classe][ano] = bufferSaldos[classe][ano].valor;
            }
        }
        return destino;
    };

    annual.matrizCapitalGiro = agregarSaldos(mensal.matrizCapitalGiro);
    annual.dadosEstoque = agregarSaldos(mensal.dadosEstoque);

    // 3. Detalhamento (Drill-down)
    // Agrupa chaves 'Classe|MM-YYYY' para 'Classe|YYYY'
    for (const chaveMensal in mensal.matrizDetalhamento) {
        const [classe, periodo] = chaveMensal.split('|');
        const ano = periodo.split('-')[1];
        const chaveAnual = `${classe}|${ano}`;

        if (!annual.matrizDetalhamento[chaveAnual]) {
            annual.matrizDetalhamento[chaveAnual] = { total: 0, departamentos: {} };
        }
        
        const origem = mensal.matrizDetalhamento[chaveMensal];
        const destino = annual.matrizDetalhamento[chaveAnual];

        destino.total += origem.total;
        mergeDeep(destino.departamentos, origem.departamentos);
    }

    return annual;
}

function calcularLinhasCalculadasDRE(matriz, colunas, saldoInicial) {
    let saldoAtual = saldoInicial;

    colunas.forEach(col => {
        const v = (key) => matriz[key]?.[col] || 0;
        
        const recLiq = v(DRE_CONSTANTS.RECEITA_BRUTA) + v(DRE_CONSTANTS.DEDUCOES);
        matriz['(=) Receita Líquida'][col] = recLiq;

        const genCaixa = recLiq + v(DRE_CONSTANTS.CUSTOS) + v(DRE_CONSTANTS.DESPESAS) + v(DRE_CONSTANTS.IRPJ_CSLL);
        matriz['(+/-) Geração de Caixa Operacional'][col] = genCaixa;

        const naoOperacional = v(DRE_CONSTANTS.RES_FINANCEIRO) + v(DRE_CONSTANTS.APORTES) + v(DRE_CONSTANTS.INVESTIMENTOS) + v(DRE_CONSTANTS.EMPRESTIMOS);
        const movMensal = genCaixa + naoOperacional;
        matriz['(=) Movimentação de Caixa Mensal'][col] = movMensal;

        matriz['Caixa Inicial'][col] = saldoAtual;
        
        // Variação final (inclui transferências)
        const variacaoFinal = movMensal + v('Entrada de Transferência') + v('Saída de Transferência') + v('Outros');
        saldoAtual += variacaoFinal;
        
        matriz['Caixa Final'][col] = saldoAtual;
    });
}

function calcularTotaisHorizontais(matriz, colunas) {
    Object.keys(matriz).forEach(k => {
        // Soma simples para a maioria, lógica de saldo inicial/final para Caixa
        if (k === 'Caixa Inicial') matriz[k].TOTAL = matriz[k][colunas[0]] || 0;
        else if (k === 'Caixa Final') matriz[k].TOTAL = matriz[k][colunas[colunas.length - 1]] || 0;
        else matriz[k].TOTAL = colunas.reduce((acc, c) => acc + (matriz[k][c] || 0), 0);
    });
}