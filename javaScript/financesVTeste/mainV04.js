// mainV27.js
import * as API from './apiV03.js';
import * as Processing from './processingV04.js';
import * as UI from './uiV03.js';

// --- State Manager (Centraliza dados e cache) ---
const State = {
    meta: { userId: null, userType: null },
    config: { projecao: "realizado", flagAnos: false },
    cache: {
        dadosContaAno: new Map(),   // Chave: `contaId|ano`
        estoqueProjeto: new Map(),  // Chave: `projetoId`
        periodosConta: new Map()    // Chave: `contaId|projecao`
    },
    refs: {
        categorias: new Map(),
        classes: new Map(),
        projetos: new Map(),
        contas: new Map(),
        departamentos: new Map()
    },
    
    reset(userId, userType) {
        this.meta = { userId, userType };
        this.cache.dadosContaAno.clear();
        this.cache.estoqueProjeto.clear();
        this.cache.periodosConta.clear();
        this.config.projecao = "realizado";
    }
};

// --- Entry Point ---

window.IniciarDoZero = async function(deptosJson, id, type, contasJson, classesJson, projetosJson) {
    State.reset(id, type);

    // Carrega referências (Metadados)
    safeParse(classesJson).forEach(c => {
        State.refs.classes.set(c.codigo, { classe: c.Classe, categoria: c.Categoria });
        State.refs.categorias.set(c.codigo, c.Categoria);
    });
    safeParse(projetosJson).forEach(p => 
        State.refs.projetos.set(String(p.codProj), { nome: p.nomeProj, contas: (p.contas||[]).map(String) })
    );
    safeParse(contasJson).forEach(c => 
        State.refs.contas.set(c.codigo, { descricao: c.descricao, saldoIni: c.saldoIni })
    );
    safeParse(deptosJson).forEach(d => 
        State.refs.departamentos.set(String(d.codigo), d.descricao)
    );

    // Inicializa UI
    UI.configurarFiltros(State, [String(new Date().getFullYear())], handleFiltroChange);
};

// --- Controle Principal (Orquestrador) ---

async function handleFiltroChange() {
    if (State.config.flagAnos) return;
    
    UI.alternarEstadoCarregamento(true);
    try {
        let filtros = UI.obterFiltrosAtuais();
        if (!validarFiltros(filtros)) return;

        // Estratégia varia conforme modo (Realizado vs A Realizar)
        if (State.config.projecao === 'arealizar') {
            await carregarDados(filtros);
            atualizarRangeAnosPeloCache(filtros.contas); // Descobre anos futuros dinamicamente
            filtros = UI.obterFiltrosAtuais(); // Re-lê filtros pois o select de ano pode ter mudado
        } else {
            await gerenciarPeriodosDisponiveis(filtros.contas); // Busca metadados de anos na API
            filtros = UI.obterFiltrosAtuais();
            await carregarDados(filtros);
        }

        consolidarEExibir(filtros);
        
    } catch (err) {
        console.error("Erro no fluxo principal:", err);
        alert("Ocorreu um erro ao processar.");
    } finally {
        UI.alternarEstadoCarregamento(false);
    }
}

// --- Passos do Workflow ---

async function gerenciarPeriodosDisponiveis(contasIds) {
    const contasSemCache = contasIds.filter(id => !State.cache.periodosConta.has(`${id}|${State.config.projecao}`));
    
    if (contasSemCache.length > 0) {
        const promises = contasSemCache.map(id => API.buscarPeriodosComDados(id, State.config.projecao));
        const resultados = await Promise.all(promises);
        
        resultados.forEach((res, idx) => {
            const { periodo_ini, periodo_fim } = res.response || {};
            const parseAno = (val) => val ? (String(val).includes('-') ? new Date(val).getFullYear() : Number(val)) : new Date().getFullYear();
            
            State.cache.periodosConta.set(`${contasSemCache[idx]}|${State.config.projecao}`, {
                inicio: parseAno(periodo_ini),
                fim: parseAno(periodo_fim)
            });
        });
    }

    // Determina Min/Max global
    let min = null, max = null;
    contasIds.forEach(id => {
        const p = State.cache.periodosConta.get(`${id}|${State.config.projecao}`);
        if (p) {
            min = (min === null || p.inicio < min) ? p.inicio : min;
            max = (max === null || p.fim > max) ? p.fim : max;
        }
    });

    // Atualiza Select na UI
    State.config.flagAnos = true;
    UI.atualizarOpcoesAnoSelect(min || new Date().getFullYear(), max, State.config.projecao);
    State.config.flagAnos = false;
}

async function carregarDados(filtros) {
    const reqs = [];
    const isRealizado = State.config.projecao === "realizado";
    const tag = isRealizado ? null : "AREALIZAR";

    // 1. Identifica o que falta no cache
    filtros.contas.forEach(contaId => {
        const periodos = isRealizado ? filtros.anos : [tag];
        periodos.forEach(p => {
            const chave = `${contaId}|${p}`;
            if (!State.cache.dadosContaAno.has(chave)) {
                State.cache.dadosContaAno.set(chave, null); // Placeholder para evitar req duplicada
                reqs.push({ contaId, periodo: p, filtroApi: isRealizado ? String(p) : ["AREALIZAR"] });
            }
        });
    });

    // 2. Busca Títulos (Financeiro)
    const promises = reqs.map(req => 
        API.buscarTitulos({ conta: req.contaId, ano: req.filtroApi })
           .then(res => ({ ...res, context: req, tipo: 'TITULOS' }))
    );

    // 3. Busca Estoque (se necessário)
    const projsFaltantes = filtros.projetos.filter(p => !State.cache.estoqueProjeto.has(p));
    if (projsFaltantes.length) {
        promises.push(...projsFaltantes.map(p => 
            API.buscarValoresEstoque({ periodos: filtros.colunas, projeto: [p] })
               .then(res => ({ response: { Saldos: res.response?.Saldos }, tipo: 'ESTOQUE', projId: p }))
        ));
    }

    const responses = await Promise.all(promises);

    // 4. Processa Resultados
    responses.forEach(res => {
        if (res.tipo === 'ESTOQUE') {
            processarRespostaEstoque(res);
        } else {
            const { contaId, periodo } = res.context;
            const saldoIni = Number(res.response?.saldoInicial || 0);
            
            // Processamento Heavy-Duty
            // Nota: Se for 'A Realizar', precisamos calcular um saldo inicial virtual baseado no realizado do ano atual
            let dadosProcessados;
            if (!isRealizado) {
                 dadosProcessados = processarLogicaARealizar(contaId, res.response, saldoIni);
            } else {
                 dadosProcessados = processarLogicaRealizado(contaId, periodo, res.response, saldoIni);
            }
            State.cache.dadosContaAno.set(`${contaId}|${periodo}`, dadosProcessados);
        }
    });
}

function processarLogicaRealizado(contaId, ano, apiResponse, saldoIni) {
    const input = { 
        lancamentos: [], capitalDeGiro: [] 
    };
    
    // Extrai dados usando os Helpers
    // Filtramos DRE pelo ano, mas mantemos Capital de Giro completo
    if (apiResponse.dadosCapitalG) {
        const ext = Processing.extrairDadosDosTitulos(safeParseList(apiResponse.dadosCapitalG), contaId, ano);
        input.lancamentos.push(...ext.lancamentosProcessados);
        input.capitalDeGiro = ext.capitalDeGiro;
    }
    if (apiResponse.dadosLancamentos) {
        const ext = Processing.extrairLancamentosSimples(safeParseList(apiResponse.dadosLancamentos), contaId, ano);
        input.lancamentos.push(...ext);
    }

    return Processing.processarDadosDaConta(State, input, contaId, saldoIni);
}

function processarLogicaARealizar(contaId, apiResponse, saldoIniApi) {
    const anoAtual = new Date().getFullYear();
    let saldoAcumulado = saldoIniApi;

    // Calcula saldo realizado até o momento (Year To Date) para somar ao saldo inicial
    if (apiResponse.dadosRealizado) {
        const extCY = Processing.extrairDadosDosTitulos(safeParseList(apiResponse.dadosRealizado), contaId, anoAtual);
        const processedCY = Processing.processarDadosDaConta(State, extCY, contaId, saldoIniApi);
        // Salva Realizado do Ano Atual no cache (útil e evita reprocessar)
        State.cache.dadosContaAno.set(`${contaId}|${anoAtual}`, processedCY);
        
        // Pega o valor acumulado no DRE do realizado
        if (processedCY.segments) {
            Object.values(processedCY.segments).forEach(seg => {
                if(seg.realizado) saldoAcumulado += (seg.realizado.valorTotal || 0);
            });
        }
    }

    const input = { titulos: [] };
    if (apiResponse.dadosArealizar) {
        const ext = Processing.extrairDadosDosTitulos(safeParseList(apiResponse.dadosArealizar), contaId);
        input.titulos = ext.titulosEmAberto;
    }

    return Processing.processarDadosDaConta(State, input, contaId, saldoAcumulado);
}

function processarRespostaEstoque(res) {
    const matriz = { '(+) Estoque': {} };
    (res.response?.Saldos || []).forEach(s => {
        if(s.Periodo) matriz['(+) Estoque'][s.Periodo] = (matriz['(+) Estoque'][s.Periodo] || 0) + s.Valor;
    });
    State.cache.estoqueProjeto.set(res.projId, matriz);
}

function consolidarEExibir(filtros) {
    const list = [];
    const suf = State.config.projecao === "realizado" ? null : "AREALIZAR";

    // Coleta dados do Cache
    filtros.contas.forEach(c => {
        if (suf) list.push(State.cache.dadosContaAno.get(`${c}|${suf}`));
        else filtros.anos.forEach(a => list.push(State.cache.dadosContaAno.get(`${c}|${a}`)));
    });

    const est = filtros.projetos.map(p => State.cache.estoqueProjeto.get(p)).filter(Boolean);

    // Merge dos dados
    const dados = Processing.mergeMatrizes(
        list, 
        filtros.modo, 
        filtros.colunas, 
        State.config.projecao, 
        est, 
        null, 
        filtros.projetos
    );

    // Renderiza Tabelas
    UI.atualizarVisualizacoes(dados, filtros.colunas, State);
    
    // Renderiza Fluxo Diário e Resumo (Estas linhas são essenciais)
    const saldoIniVisivel = dados.matrizDRE['Caixa Inicial']?.[filtros.colunas[0]] || 0;
    
    UI.renderFluxoDiario(
        dados.fluxoDeCaixa, 
        filtros.colunas, 
        saldoIniVisivel, 
        State.config.projecao
    );
    
    UI.renderFluxoDiarioResumido(
        dados.matrizDRE['Caixa Inicial'], 
        dados.matrizDRE['Caixa Final'], 
        dados.entradasESaidas, 
        filtros.colunas
    );
    
    UI.renderGraficos(dados, filtros.colunas);
}


function atualizarRangeAnosPeloCache(contas) {
    let min = new Date().getFullYear(), max = min;
    contas.forEach(c => {
        const d = State.cache.dadosContaAno.get(`${c}|AREALIZAR`);
        // Lógica simplificada: varre chaves encontradas no processamento
        if (d && d.segments) {
            Object.values(d.segments).forEach(seg => {
                if (seg.arealizar?.chavesComDados) {
                    seg.arealizar.chavesComDados.forEach(k => {
                        const y = parseInt(k.split('-')[1]);
                        if (y < min) min = y;
                        if (y > max) max = y;
                    });
                }
            });
        }
    });
    State.config.flagAnos = true;
    UI.atualizarOpcoesAnoSelect(min, max, State.config.projecao);
    State.config.flagAnos = false;
}

// Helpers Simples
const safeParse = (json) => { try { return JSON.parse(json); } catch { return []; } };
const safeParseList = (str) => safeParse(`[${str}]`);
function validarFiltros(f) { 
    if (!f || !f.contas.length) { UI.exibirTabelasVazias(); return false; } 
    return true; 
}