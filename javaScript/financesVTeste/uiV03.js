// uiV022.js
const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
// --- Cache de Elementos DOM ---
// Evita buscar document.getElementById repetidamente
const DOM = {
    ano: () => document.getElementById('anoSelect'),
    modo: () => document.getElementById('modoSelect'),
    proj: () => document.getElementById('projSelect'),
    conta: () => document.getElementById('contaSelect'),
    tables: {
        dre: () => document.getElementById('tabelaMatriz'),
        custos: () => document.getElementById('tabelaCustos'),
        cg: () => document.getElementById('tabelaCapitalGiro'),
        fluxo: () => document.getElementById('tabelaFluxoDiario'),
        resumo: () => document.getElementById('resumoFluxoCaixa')
    }
};

export function configurarFiltros(State, anosDisp, callback) {
    const el = {
        ano: document.getElementById('anoSelect'),
        proj: document.getElementById('projSelect'),
        conta: document.getElementById('contaSelect'),
        modo: document.getElementById('modoSelect'),
        btnARealizar: document.getElementById('btnARealizar'),
        btnRealizado: document.getElementById('btnRealizado')
    };

    if (!el.ano) return; // Proteção contra erro de DOM

    // Popula Projetos
    el.proj.innerHTML = '';
    Array.from(State.refs.projetos.entries())
        .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
        .forEach(([cod, { nome }]) => el.proj.appendChild(new Option(nome, cod)));
    if (el.proj.options.length) el.proj.options[0].selected = true;

    // Configura Listeners
    const setProj = (t) => {
        State.config.projecao = t;
        // Atualiza estilo dos botões (opcional)
        el.btnARealizar.classList.toggle('active', t === 'arealizar');
        el.btnRealizado.classList.toggle('active', t === 'realizado');
        // Esconde Capital de Giro se for A Realizar (regra de negócio original)
        const divCG = document.getElementById('groupCapitalGiro');
        if(divCG) divCG.style.display = (t === "arealizar") ? "none" : "";
        callback();
    };

    el.btnARealizar.onclick = () => setProj("arealizar");
    el.btnRealizado.onclick = () => setProj("realizado");
    
    el.ano.onchange = callback;
    el.conta.onchange = callback;
    
    el.proj.onchange = () => {
        // Atualiza filtro de contas baseado no projeto selecionado
        const projsSelecionados = Array.from(el.proj.selectedOptions).map(o => o.value);
        const permitidas = new Set();
        projsSelecionados.forEach(id => {
            State.refs.projetos.get(String(id))?.contas.forEach(c => permitidas.add(c));
        });
        
        el.conta.innerHTML = '';
        Array.from(State.refs.contas.entries())
            .sort((a,b) => a[1].descricao.localeCompare(b[1].descricao))
            .forEach(([k, v]) => {
                if (permitidas.has(k)) el.conta.appendChild(new Option(v.descricao, k));
            });
        
        // Seleciona todas por padrão
        Array.from(el.conta.options).forEach(opt => opt.selected = true);
        callback();
    };

    el.modo.onchange = () => {
        // Recalcula opções de ano (Mensal vs Anual)
        const range = State.cache.periodosConta.get(`${el.conta.value}|${State.config.projecao}`);
        if(range) atualizarOpcoesAnoSelect(range.inicio, range.fim, State.config.projecao);
        callback();
    };

    // Inicialização
    el.proj.onchange(); // Dispara preenchimento inicial de contas
    setProj(State.config.projecao); // Define estado inicial
}

const FORMATOS = {
    moeda: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    pct: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1 })
};

// --- Funções de Formatação ---

function fmtValor(v) {
    if (Math.abs(v) < 0.01) return '-';
    const s = FORMATOS.moeda.format(Math.abs(v));
    return v < 0 ? `(${s})` : s;
}
function fmtPct(v) { return (!v) ? '0,0%' : `${FORMATOS.pct.format(v)}%`; }

// --- Utilitários de UI ---

export function alternarEstadoCarregamento(isLoading) {
    document.body.classList.toggle('app-loading', isLoading);
    const inputs = ['anoSelect', 'projSelect', 'contaSelect', 'modoSelect', 'btnARealizar', 'btnRealizado'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.disabled = isLoading; el.style.opacity = isLoading ? 0.6 : 1; }
    });
}

// Helper para criar células rapidamente
const createCell = (row, text, className) => {
    const td = row.insertCell();
    td.textContent = text;
    if (className) td.className = className;
    return td;
};

function sanitizeId(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\W+/g, '_').replace(/^_+|_+$/g, '');
}
// --- Renderização de Tabelas ---

export function atualizarVisualizacoes(dados, colunas, State) {
    const { matrizDRE, matrizDetalhamento, matrizCapitalGiro, entradasESaidas, fluxoDeCaixa, dadosEstoque } = dados;

    renderDRE(matrizDRE, colunas, State.meta.userType);
    renderDetalhamento(matrizDetalhamento, State.refs.categorias, colunas, entradasESaidas);
    renderCapitalGiro(matrizCapitalGiro, colunas, dadosEstoque);
    // (A função de gráficos e fluxo diário pode ser mantida similar à original pela complexidade de charts, 
    // mas chame-as aqui)
    // ... renderGraficos ... renderFluxoDiario ...
}

function renderDRE(matriz, colunas, userType) {
    const tb = DOM.tables.dre();
    if (!tb) return;
    tb.innerHTML = '';

    // Header
    const thead = tb.createTHead();
    const tr = thead.insertRow();
    createCell(tr, 'Fluxo de Caixa');
    colunas.forEach(c => createCell(tr, c));
    createCell(tr, 'TOTAL');

    // Body
    const tbody = tb.createTBody();
    const linhas = [
        '(+) Receita Bruta', '(-) Deduções', '(=) Receita Líquida', 
        '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL', 
        '(+/-) Geração de Caixa Operacional', 
        // ... adicione as outras constantes aqui ...
        'Caixa Inicial', 'Caixa Final'
    ];

    linhas.forEach(linha => {
        const row = tbody.insertRow();
        createCell(row, linha);
        colunas.forEach(c => createCell(row, fmtValor(matriz[linha]?.[c] || 0)));
        createCell(row, fmtValor(matriz[linha]?.TOTAL || 0));
        
        // Estilização condicional
        if (linha.includes('(=)') || linha.includes('Geração')) row.dataset.type = 'total';
        else if (linha.includes('Caixa')) row.dataset.type = 'saldo';
    });
}

export function renderDetalhamento(dados, catMap, colunas, es) {
    const tb = DOM.tables.custos();
    if (!tb) return;
    tb.innerHTML = ''; // Limpa tabela

    // Header
    const thead = tb.createTHead();
    const tr = thead.insertRow();
    const createCell = (r, t) => { const c = r.insertCell(); c.textContent = t; return c; };
    createCell(tr, 'Detalhamento');
    colunas.forEach(c => createCell(tr, c));
    createCell(tr, 'TOTAL');

    const tbody = tb.createTBody();
    
    // Organiza Hierarquia
    const dadosOrg = {};
    Object.entries(dados).forEach(([k, v]) => {
        const [classe, per] = k.split('|');
        if (!dadosOrg[classe]) dadosOrg[classe] = {};
        dadosOrg[classe][per] = v;
    });

    const fmtValor = (v) => {
        if (Math.abs(v) < 0.01) return '-';
        const s = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        return v < 0 ? `(${s})` : s;
    };

    const renderNode = (classe, dadosDaClasse) => {
        const idBase = `classe_${sanitizeId(classe)}`;
        
        // Nível 0: Classe
        const tr = tbody.insertRow();
        tr.className = 'drill-root';
        tr.onclick = () => window.toggleLinha(idBase);
        tr.insertCell().innerHTML = `<span class="expand-btn">[+]</span> ${classe}`;
        
        let totC = 0;
        colunas.forEach(c => { 
            const v = dadosDaClasse[c]?.total || 0; 
            totC += v; 
            createCell(tr, fmtValor(v)); 
        });
        createCell(tr, fmtValor(totC));

        // Prepara dados dos filhos
        const arvore = {};
        Object.keys(dadosDaClasse).forEach(per => {
            const dpts = dadosDaClasse[per].departamentos || {};
            for (const dep in dpts) {
                if (!arvore[dep]) arvore[dep] = {};
                const cats = dpts[dep].categorias || {};
                for (const cat in cats) {
                    if (!arvore[dep][cat]) arvore[dep][cat] = new Set();
                    const forns = cats[cat].fornecedores || {};
                    Object.keys(forns).forEach(f => arvore[dep][cat].add(f));
                }
            }
        });

        // Nível 1: Departamentos
        Object.keys(arvore).sort().forEach(dep => {
            const idDep = `${idBase}_dp_${sanitizeId(dep)}`;
            const rD = tbody.insertRow();
            rD.className = `parent-${idBase} hidden sub-row-1`;
            rD.id = idDep;
            rD.onclick = () => window.toggleLinha(idDep);
            rD.insertCell().innerHTML = `<span class="expand-btn">[+]</span> ${dep}`;

            let totD = 0;
            colunas.forEach(c => { 
                const v = dadosDaClasse[c]?.departamentos?.[dep]?.total || 0; 
                totD += v; 
                createCell(rD, fmtValor(v)); 
            });
            createCell(rD, fmtValor(totD));

            // Nível 2: Categorias
            Object.keys(arvore[dep]).sort().forEach(cat => {
                const idCat = `${idDep}_cat_${sanitizeId(cat)}`;
                const rCat = tbody.insertRow();
                rCat.className = `parent-${idDep} hidden sub-row-2`;
                rCat.id = idCat;
                rCat.onclick = (e) => { e.stopPropagation(); window.toggleLinha(idCat); };
                rCat.insertCell().innerHTML = `<span class="expand-btn">[+]</span> ${catMap.get(cat) || cat}`;

                let totCat = 0;
                colunas.forEach(c => { 
                    const v = dadosDaClasse[c]?.departamentos?.[dep]?.categorias?.[cat]?.total || 0; 
                    totCat += v; 
                    createCell(rCat, fmtValor(v)); 
                });
                createCell(rCat, fmtValor(totCat));

                // Nível 3: Fornecedores
                arvore[dep][cat].forEach(forn => {
                    const rF = tbody.insertRow();
                    rF.className = `parent-${idCat} hidden sub-row-3`;
                    createCell(rF, forn);
                    
                    let totF = 0;
                    colunas.forEach(c => { 
                        const v = dadosDaClasse[c]?.departamentos?.[dep]?.categorias?.[cat]?.fornecedores?.[forn]?.total || 0; 
                        totF += v; 
                        createCell(rF, fmtValor(v)); 
                    });
                    createCell(rF, fmtValor(totF));
                });
            });
        });
    };

    const prioridade = ['(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL'];
    prioridade.forEach(c => { if(dadosOrg[c]) renderNode(c, dadosOrg[c]); });
    Object.keys(dadosOrg).filter(c => !prioridade.includes(c)).forEach(c => renderNode(c, dadosOrg[c]));

    // Totais Finais
    ['(+) Entradas', '(-) Saídas'].forEach(c => {
        if (es[c]) {
            const r = tbody.insertRow();
            r.dataset.type = 'saldo';
            createCell(r, c);
            colunas.forEach(col => createCell(r, fmtValor(es[c][col] || 0)));
            createCell(r, fmtValor(es[c].TOTAL || 0));
        }
    });
}

// --- Renderização Capital de Giro ---

export function renderCapitalGiro(matriz, colunas, estoque) {
    const tb = DOM.tables.cg();
    if (!tb) return;
    tb.innerHTML = '';

    const thead = tb.createTHead();
    const tr = thead.insertRow();
    createCell(tr, 'Capital de Giro');
    colunas.forEach(c => createCell(tr, c));
    createCell(tr, ''); // Coluna vazia para layout

    const tbody = tb.createTBody();

    // Helper interno para adicionar linha
    const addRow = (label, key, isPct, type) => {
        const row = tbody.insertRow();
        if (type) row.dataset.type = type;
        createCell(row, label);
        
        colunas.forEach(c => {
            let val = 0;
            // Busca especial para Estoque
            if (key === 'Estoque') {
                val = estoque?.['(+) Estoque']?.[c] || 0;
            } else if (isPct) {
                // Cálculo de percentual on-the-fly
                const tipo = key.includes('AR') ? 'AR' : 'AP'; // A Receber ou A Pagar
                const curto = matriz[`Curto Prazo ${tipo}`]?.[c] || 0;
                const longo = matriz[`Longo Prazo ${tipo}`]?.[c] || 0;
                const total = curto + longo;
                const alvo = key.includes('Curto') ? curto : longo;
                val = total ? (alvo / total) * 100 : 0;
            } else {
                val = matriz[key]?.[c] || 0;
            }
            createCell(row, isPct ? fmtPct(val) : fmtValor(val));
        });
        row.insertCell(); // Final vazio
    };

    addRow('(+) Caixa', '(+) Caixa', false, 'total');
    // Linha vazia
    tbody.insertRow().insertCell();

    addRow('(+) Clientes a Receber', '(+) Clientes a Receber', false, 'total');
    addRow('Curto Prazo (30 dias)', 'Curto Prazo AR', false);
    addRow('Longo Prazo (> 30 dias)', 'Longo Prazo AR', false);
    addRow('Curto Prazo (%)', 'Curto Prazo AR', true); // Passa key base, flag true
    addRow('Longo Prazo (%)', 'Longo Prazo AR', true);

    if (estoque) {
        tbody.insertRow().insertCell();
        addRow('(+) Estoque', 'Estoque', false, 'total');
    }

    tbody.insertRow().insertCell();
    addRow('(-) Fornecedores a Pagar', '(-) Fornecedores a Pagar', false, 'total');
    addRow('Curto Prazo (30 dias)', 'Curto Prazo AP', false);
    addRow('Longo Prazo (> 30 dias)', 'Longo Prazo AP', false);
    addRow('Curto Prazo (%)', 'Curto Prazo AP', true);
    addRow('Longo Prazo (%)', 'Longo Prazo AP', true);

    tbody.insertRow().insertCell();
    addRow('(=) Curto Prazo Total', 'Curto Prazo TT', false, 'total');
    addRow('(=) Longo Prazo Total', 'Longo Prazo TT', false, 'total');

    // Linha Final
    const rowFinal = tbody.insertRow();
    rowFinal.dataset.type = 'saldo';
    createCell(rowFinal, '(=) Capital Líquido Circulante');
    colunas.forEach(c => {
        const liq = (matriz['Capital Liquido']?.[c] || 0) + (estoque?.['(+) Estoque']?.[c] || 0);
        createCell(rowFinal, fmtValor(liq));
    });
    rowFinal.insertCell();
}
// --- Renderização de Gráficos (Chart.js) ---

let charts = {}; // Cache de instâncias

export function renderGraficos(dados, colunas) {
    if (!window.Chart) return;

    const labels = colunas;
    const dataSaldo = colunas.map(c => dados.matrizDRE['Caixa Final']?.[c] ?? null);
    const dataEntradas = colunas.map(c => dados.entradasESaidas['(+) Entradas']?.[c] ?? 0);
    const dataSaidas = colunas.map(c => Math.abs(dados.entradasESaidas['(-) Saídas']?.[c] ?? 0));

    // Acumulado
    let accE = 0, accS = 0;
    const accEntradas = dataEntradas.map(v => { accE += v; return accE; });
    const accSaidas = dataSaidas.map(v => { accS += v; return accS; });

    const createConfig = (title, type, datasets) => ({
        type: type,
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: title }, legend: { position: 'bottom' } }
        }
    });

    const updateChart = (id, config) => {
        const ctx = document.getElementById(id);
        if (!ctx) return;
        if (charts[id]) charts[id].destroy();
        charts[id] = new window.Chart(ctx, config);
    };

    // 1. Saldo Caixa (Linha)
    updateChart('graficoSaldoCaixa', createConfig('Saldo de Caixa (R$)', 'line', [{
        label: 'Saldo',
        data: dataSaldo,
        borderColor: '#007bff',
        tension: 0.3,
        segment: {
            borderColor: ctx => (ctx.p0.parsed.y < 0 || ctx.p1.parsed.y < 0) ? '#dc3545' : '#28a745'
        }
    }]));

    // 2. Acumulado (Area)
    updateChart('graficoRecebientoPagamentoAcumulado', createConfig('Evolução Acumulada', 'line', [
        { label: 'Entradas', data: accEntradas, borderColor: '#28a745', fill: true, backgroundColor: 'rgba(40, 167, 69, 0.1)' },
        { label: 'Saídas', data: accSaidas, borderColor: '#dc3545', fill: true, backgroundColor: 'rgba(220, 53, 69, 0.1)' }
    ]));

    // 3. Mensal (Barras)
    updateChart('graficoEntradasSaidasMensal', createConfig('Entradas vs Saídas Mensais', 'bar', [
        { label: 'Entradas', data: dataEntradas, backgroundColor: '#28a745' },
        { label: 'Saídas', data: dataSaidas, backgroundColor: '#dc3545' }
    ]));
}

export function obterFiltrosAtuais() {
    const domAno = DOM.ano();
    const domModo = DOM.modo();
    if (!domAno || !domModo) return null;
    
    // ... Lógica de extração de valores (getSelectItems) mantida ...
    // Retorna { modo, anos, contas, projetos, colunas }
    return {
        // ... preencher com valores do DOM ...
    };
}

export function atualizarOpcoesAnoSelect(min, max, projecao) {
    const sel = DOM.ano();
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = '';
    
    // Garante range lógico
    let start = min, end = max;
    if (projecao === 'arealizar') end = Math.max(end, new Date().getFullYear() + 5);
    
    // Popula options
    for (let y = start; y <= end; y++) {
        sel.appendChild(new Option(String(y), String(y)));
    }
    // Restaura seleção ou define default
    if (atual && y >= start && y <= end) sel.value = atual;
}

window.toggleLinha = function(id) {
    const filhos = document.querySelectorAll(`.parent-${id}`);
    if (filhos.length === 0) return;

    const vaiFechar = !filhos[0].classList.contains('hidden');
    const linhaPai = document.getElementById(id);
    const btn = linhaPai ? linhaPai.querySelector('.expand-btn') : null;

    if (vaiFechar) {
        document.querySelectorAll(`.parent-${id}`).forEach(filho => {
            filho.classList.add('hidden');
            const subBtn = filho.querySelector('.expand-btn');
            if (subBtn) subBtn.textContent = '[+]';
            if (filho.id) window.toggleLinha(filho.id); // Recursão para fechar netos se necessário
        });
        if (btn) btn.textContent = '[+]';
    } else {
        filhos.forEach(filho => filho.classList.remove('hidden'));
        if (btn) btn.textContent = '[-]';
    }
};

// --- uiV01.js (Parte Faltante) ---

// 1. Implementação completa de obterFiltrosAtuais
export function obterFiltrosAtuais() {
    const el = {
        ano: DOM.ano(),
        modo: DOM.modo(),
        proj: DOM.proj(),
        conta: DOM.conta()
    };

    if (!el.ano || !el.modo || !el.ano.value) return null;

    const modo = el.modo.value;
    const valorAno = el.ano.value;
    
    // Utilitário para pegar múltiplos valores de um select
    const getSelectItems = (select) => Array.from(select.selectedOptions || []).map(o => o.value);

    // Define as colunas (cabeçalho da tabela) baseada no modo
    let colunas = [];
    let anos = [];

    if (modo.toLowerCase() === 'mensal') {
        anos = [valorAno];
        colunas = Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}-${valorAno}`);
    } else {
        // Modo Anual (Exibe 6 anos: o selecionado + 5 futuros)
        const start = Number(valorAno);
        colunas = Array.from({ length: 6 }, (_, i) => String(start + i));
        anos = colunas; // No modo anual, as colunas são os próprios anos
    }

    return {
        modo,
        anos,
        projetos: getSelectItems(el.proj),
        contas: getSelectItems(el.conta),
        colunas
    };
}

// 2. Função para limpar telas (necessária para validação no main.js)
export function exibirTabelasVazias() {
    const ids = ['tabelaMatriz', 'tabelaCustos', 'tabelaCapitalGiro', 'tabelaFluxoDiario', 'resumoFluxoCaixa'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
    // Remove spinner se estiver ativo
    alternarEstadoCarregamento(false);
}

// 3. Renderização do Fluxo Diário (Lógica complexa de dropdown mantida e limpa)
export function renderFluxoDiario(fluxo, colunas, saldoIni, projecao) {
    const tb = DOM.tables.fluxo();
    if (!tb) return;
    tb.innerHTML = '';
    
    if (!colunas.length) return;

    // Expande colunas anuais para mensais se necessário para visualização diária
    const colsAll = (colunas[0].length === 4) 
        ? colunas.flatMap(a => Array.from({length:12},(_,i)=>`${String(i+1).padStart(2,'0')}-${a}`)) 
        : colunas;
        
    const colSet = new Set(colsAll);
    const dados = [];
    const periodos = new Set();

    // Filtra dados relevantes
    fluxo.forEach(x => {
        const [d, m, a] = x.data.split('/');
        const k = `${m}-${a}`;
        periodos.add(k);
        if (colSet.has(k)) dados.push({...x, k});
    });

    // Define range de visualização inicial (últimos 6 meses ou primeiros 6)
    const perOrd = Array.from(periodos).filter(p => colSet.has(p)).sort((a,b) => {
        const [ma, aa] = a.split('-'); const [mb, ab] = b.split('-');
        return aa !== ab ? aa - ab : ma - mb;
    });

    let iniVis, fimVis;
    const MAX_MESES = 6;

    if (perOrd.length) {
        if (projecao === 'arealizar') {
            iniVis = perOrd[0];
            fimVis = perOrd[Math.min(perOrd.length - 1, MAX_MESES - 1)];
        } else {
            fimVis = perOrd[perOrd.length - 1];
            // Pega 6 meses para trás
            const idx = perOrd.indexOf(fimVis);
            iniVis = perOrd[Math.max(0, idx - MAX_MESES + 1)];
        }
    } else {
        // Fallback se não tiver dados
        iniVis = colsAll[0];
        fimVis = colsAll[Math.min(colsAll.length-1, MAX_MESES-1)];
    }

    const tbody = tb.createTBody();
    
    // Renderiza Header com Filtro Interativo
    criarHeaderFluxo(tb, Array.from(periodos).sort(), (i, f) => {
        renderLinhasFluxo(tbody, dados, saldoIni, i, f);
    }, iniVis, fimVis);

    // Renderiza Linhas Iniciais
    renderLinhasFluxo(tbody, dados, saldoIni, iniVis, fimVis);
}

function renderLinhasFluxo(tbody, itens, baseSaldo, ini, fim) {
    tbody.innerHTML = '';
    
    const valKey = k => { const [m, a] = k.split('-'); return parseInt(a)*100 + parseInt(m); };
    const vI = valKey(ini);
    const vF = valKey(fim);
    
    // Filtra itens dentro do range selecionado
    const visiveis = itens.filter(x => { 
        const v = valKey(x.k); 
        return v >= vI && v <= vF; 
    });

    if (!visiveis.length) {
        const r = tbody.insertRow();
        r.innerHTML = `<td colspan="4" style="text-align:center; padding: 20px;">Nenhum lançamento no período (${ini} a ${fim}).</td>`;
        return;
    }

    // Calcula saldo acumulado ANTES do período visível
    let s = baseSaldo;
    itens.forEach(x => { 
        if (valKey(x.k) < vI) s += x.valor; 
    });

    // Linha de Saldo Inicial
    const rS = tbody.insertRow();
    rS.className = 'fluxo-saldo-ini';
    rS.innerHTML = `<td></td><td><b>Saldo Anterior</b></td><td></td><td style="text-align:right"><b>${fmtValor(s)}</b></td>`;

    // Linhas de Lançamento
    visiveis.forEach(i => {
        s += i.valor;
        const r = tbody.insertRow();
        const obs = i.obs ? ` <span title="${i.obs}" style="cursor:help">ℹ️</span>` : '';
        createCell(r, i.data);
        r.insertCell().innerHTML = `${i.descricao}${obs}`;
        createCell(r, fmtValor(i.valor), 'text-right');
        createCell(r, fmtValor(s), 'text-right');
    });
}

function criarHeaderFluxo(table, periodosDisponiveis, callback, iniDef, fimDef) {
    const thead = table.createTHead();
    const tr = thead.insertRow();
    
    // Coluna 1: Data com Dropdown
    const thData = document.createElement('th');
    thData.className = 'data-header-filter';
    
    // Container do Filtro
    const wrap = document.createElement('div');
    wrap.style.cursor = 'pointer';
    wrap.innerHTML = `Data <span style="font-size:0.8em">(${iniDef} - ${fimDef})</span> ▼`;
    
    // Dropdown (Elemento flutuante)
    const drop = criarDropCal(periodosDisponiveis, (i, f) => {
        wrap.innerHTML = `Data <span style="font-size:0.8em">(${i} - ${f})</span> ▼`;
        drop.style.display = 'none';
        callback(i, f);
    }, iniDef, fimDef);

    // Eventos de abrir/fechar
    wrap.onclick = (e) => { 
        e.stopPropagation(); 
        const isVisible = drop.style.display === 'block';
        // Fecha outros se houver
        document.querySelectorAll('.filtro-dropdown').forEach(d => d.style.display = 'none');
        drop.style.display = isVisible ? 'none' : 'block'; 
    };
    
    // Fecha ao clicar fora
    document.addEventListener('click', (e) => { 
        if (!thData.contains(e.target)) drop.style.display = 'none'; 
    });

    thData.appendChild(wrap);
    thData.appendChild(drop);
    tr.appendChild(thData);

    ['Descrição', 'Valor (R$)', 'Saldo (R$)'].forEach(t => createCell(tr, t));
}

function criarDropCal(pers, cb, sIni, sFim) {
    const d = document.createElement('div'); 
    d.className = 'filtro-dropdown'; // Certifique-se de ter CSS para isso (position: absolute)
    d.style.display = 'none';
    
    let selI = sIni || pers[0];
    let selF = sFim || pers[pers.length-1];

    const render = () => {
        d.innerHTML = '';
        const grp = {}; 
        pers.forEach(p => { const[m,a]=p.split('-'); (grp[a]=grp[a]||[]).push(m); });
        
        Object.keys(grp).sort().forEach(a => {
            const row = document.createElement('div');
            // Estilize .ano-header e .grid-meses no CSS
            row.innerHTML = `<div style="font-weight:bold; margin:5px 0; border-bottom:1px solid #eee">${a}</div><div style="display:grid; grid-template-columns:repeat(4,1fr); gap:2px"></div>`;
            const grid = row.lastChild;
            
            for(let i=1; i<=12; i++){
                const m = String(i).padStart(2,'0'), k = `${m}-${a}`;
                const btn = document.createElement('div');
                btn.textContent = MESES_ABREV[i-1];
                btn.style.textAlign = 'center';
                btn.style.padding = '4px';
                btn.style.fontSize = '0.8em';
                btn.style.cursor = 'pointer';
                
                if (grp[a].includes(m)) {
                    // Lógica visual de seleção
                    const v = val => { const[mm,aa]=val.split('-'); return parseInt(aa)*100+parseInt(mm); };
                    const cur = v(k), v1 = v(selI), v2 = v(selF);
                    
                    if (k === selI || k === selF) btn.style.backgroundColor = '#007bff', btn.style.color = '#fff';
                    else if (cur > v1 && cur < v2) btn.style.backgroundColor = '#e2e6ea';
                    
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        // Lógica de seleção de range
                        if (!selI || (selI && selF)) { selI = k; selF = null; } 
                        else { 
                            let [i, f] = [selI, k]; 
                            if(v(f)<v(i)) [i,f]=[f,i];
                            // Limite de 12 meses para não quebrar layout se quiser
                            selI = i; selF = f; 
                            cb(i, f);
                        }
                        render();
                    };
                } else {
                    btn.style.color = '#ccc';
                    btn.style.cursor = 'default';
                }
                grid.appendChild(btn);
            }
            d.appendChild(row);
        });
    };
    render();
    return d;
}

// 4. Fluxo Resumido (Header fixo com totais)
export function renderFluxoDiarioResumido(caixaIni, caixaFim, es, colunas) {
    const tb = DOM.tables.resumo();
    if (!tb) return;
    tb.innerHTML = '';
    
    // Filtra colunas para não ficar gigante (opcional, pega as 12 primeiras se for mensal)
    const colsView = colunas; 

    // Header
    const thead = tb.createTHead();
    const tr = thead.insertRow();
    createCell(tr, 'Resumo');
    colsView.forEach(c => createCell(tr, c));
    createCell(tr, 'TOTAL');

    const tbody = tb.createTBody();

    const addRow = (label, dados, classeCss) => {
        const r = tbody.insertRow();
        createCell(r, label, classeCss);
        let tot = 0;
        colsView.forEach(c => {
            const v = dados[c] || 0;
            tot += v;
            createCell(r, fmtValor(v), classeCss);
        });
        createCell(r, fmtValor(tot), classeCss);
    };

    // Linhas de Entradas e Saídas
    addRow('(+) Entradas', es['(+) Entradas'], 'texto-verde');
    addRow('(-) Saídas', es['(-) Saídas'], 'texto-vermelho');
    
    // Linha de Balanço
    const rBal = tbody.insertRow();
    createCell(rBal, '(=) Balanço', 'texto-azul');
    let totBal = 0;
    colsView.forEach(c => {
        const v = (es['(+) Entradas'][c]||0) + (es['(-) Saídas'][c]||0);
        totBal += v;
        createCell(rBal, fmtValor(v), v >= 0 ? 'texto-verde' : 'texto-vermelho');
    });
    createCell(rBal, fmtValor(totBal));

    // Espaçador
    tbody.insertRow().style.height = '20px';

    // Saldos (Não soma total, pega inicial/final)
    const addSaldo = (label, dados) => {
        const r = tbody.insertRow();
        r.dataset.type = 'saldo';
        createCell(r, label);
        colsView.forEach(c => createCell(r, fmtValor(dados[c] || 0)));
        createCell(r, '-'); // Saldo total não faz sentido somar
    };

    addSaldo('Caixa Inicial', caixaIni);
    addSaldo('Caixa Final', caixaFim);
}

export { 
    alternarEstadoCarregamento, 
    atualizarVisualizacoes, 
    obterFiltrosAtuais, 
    atualizarOpcoesAnoSelect, 
    exibirTabelasVazias,
    renderFluxoDiario,
    renderFluxoDiarioResumido
};