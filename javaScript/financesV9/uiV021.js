// uiV09.js Refatorado

// ------ Estado Global ------
let graficosAtuais = { saldoCaixa: null, acumulado: null, mensal: null };
let chartJsPromise = null;
const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MAX_MESES_FLUXO = 6;

// ------ Formatação ------
function formatarValor(valor) {
    if (Math.abs(valor) < 0.01) return '-';
    const num = Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return valor < 0 ? `(${num})` : num;
}

function formatarPercentual(valor) {
    return (!valor || valor === 0) ? '0,0%' : `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%`;
}

function sanitizeId(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\W+/g, '_').replace(/^_+|_+$/g, '');
}

// ------ Utilitários DOM ------
function getSelectItems(select) {
    return Array.from(select.selectedOptions || []).map(o => o.value);
}

function toggleLinha(id) {
    const filhos = document.querySelectorAll(`.parent-${id}`);
    if (filhos.length === 0) return;

    // Detecta se vamos abrir ou fechar baseando-se no primeiro filho
    const vaiFechar = !filhos[0].classList.contains('hidden');
    
    // Referência ao elemento pai (linha clicada) para trocar o ícone
    const linhaPai = document.getElementById(id);
    const btn = linhaPai ? linhaPai.querySelector('.expand-btn') : null;

    if (vaiFechar) {
        // Fecha recursivamente
        esconderDescendentes(id);
        if (btn) btn.textContent = '[+]';
    } else {
        // Abre apenas os filhos diretos
        filhos.forEach(filho => filho.classList.remove('hidden'));
        if (btn) btn.textContent = '[-]';
    }
}

function esconderDescendentes(id) {
    document.querySelectorAll(`.parent-${id}`).forEach(filho => {
        filho.classList.add('hidden');
        
        // Se o filho também for um "pai" (tiver botão), reseta o ícone para [+]
        const btn = filho.querySelector('.expand-btn');
        if (btn) btn.textContent = '[+]';

        // Continua a recursão se o filho tiver ID (for um sub-pai)
        if (filho.id) esconderDescendentes(filho.id);
    });
}

function alternarEstadoCarregamento(carregando) {
    document.body.classList.toggle('app-loading', carregando);
    const ids = ['anoSelect', 'projSelect', 'contaSelect', 'modoSelect', 'btnARealizar', 'btnRealizado', 'inputDataInicial', 'inputDataFinal'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = carregando;
            el.style.opacity = carregando ? '0.6' : '1';
        }
    });
}

// ------ Chart.js ------
function carregarChartJs() {
    if (window.Chart) return Promise.resolve();
    if (chartJsPromise) return chartJsPromise;
    return chartJsPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.async = true;
        script.onload = resolve;
        script.onerror = () => { chartJsPromise = null; reject(new Error('Erro Chart.js')); };
        document.body.appendChild(script);
    });
}

// ------ Filtros ------
function configurarFiltros(appCache, anosDisp, callback) {
    const el = {
        ano: document.getElementById('anoSelect'),
        proj: document.getElementById('projSelect'),
        conta: document.getElementById('contaSelect'),
        modo: document.getElementById('modoSelect'),
        btnARealizar: document.getElementById('btnARealizar'),
        btnRealizado: document.getElementById('btnRealizado')
    };

    el.proj.innerHTML = '';
    Array.from(appCache.projetosMap.entries())
        .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
        .forEach(([cod, { nome }]) => el.proj.appendChild(new Option(nome, cod)));
    if (el.proj.options.length) el.proj.options[0].selected = true;

    const setProj = (t) => {
        appCache.projecao = t;
        const divCG = document.getElementById('groupCapitalGiro');
        if(divCG) divCG.style.display = (t === "arealizar") ? "none" : "";
        callback();
    };

    el.btnARealizar.onclick = () => setProj("arealizar");
    el.btnRealizado.onclick = () => setProj("realizado");
    el.ano.onchange = callback;
    el.conta.onchange = callback;
    el.proj.onchange = () => {
        atualizarFiltroContas(el.conta, appCache.projetosMap, appCache.contasMap, getSelectItems(el.proj));
        callback();
    };
    el.modo.onchange = () => {
        atualizarOpcoesAnoSelect(el.ano, anosDisp, el.modo.value, appCache.projecao);
        callback();
    };

    carregarChartJs();
    configurarAbasGraficos();
    atualizarOpcoesAnoSelect(el.ano, anosDisp, el.modo.value, appCache.projecao);
    atualizarFiltroContas(el.conta, appCache.projetosMap, appCache.contasMap, getSelectItems(el.proj));
    callback();
}

function obterFiltrosAtuais() {
    const el = { modo: document.getElementById('modoSelect'), ano: document.getElementById('anoSelect'), proj: document.getElementById('projSelect'), conta: document.getElementById('contaSelect') };
    if (!el.modo || !el.ano || !el.ano.value) return null;

    const modo = el.modo.value;
    const valorAno = el.ano.value;
    let anos = modo.toLowerCase() === 'mensal' ? [valorAno] : Array.from({length: 6}, (_, i) => String(Number(valorAno) + i));
    
    const colunas = modo.toLowerCase() === 'anual' ? [...anos].sort() : Array.from({length: 12}, (_, i) => `${String(i + 1).padStart(2,'0')}-${valorAno}`);

    return { modo, anos, projetos: getSelectItems(el.proj), contas: getSelectItems(el.conta), colunas };
}

function atualizarOpcoesAnoSelect(select, inicio, fim, modo, projecao) {
    if (!select) return;
    const atualVal = select.value;
    select.innerHTML = '';
    
    const hoje = new Date().getFullYear();
    let s = Number(inicio) || hoje, e = Number(fim) || hoje;
    if (s > e) [s, e] = [e, s];
    if (projecao === 'arealizar') { e = Math.max(e, hoje + 5); s = Math.min(s, hoje); }

    if (modo.toLowerCase() === 'mensal') {
        for (let y = s; y <= e; y++) select.appendChild(new Option(String(y), String(y)));
        select.value = Array.from(select.options).some(o => o.value === atualVal) ? atualVal : String(projecao === "realizado" ? e : s);
    } else {
        for (let cursor = s; cursor <= e; cursor += 6) select.prepend(new Option(`${cursor}-${cursor + 5}`, cursor));
        if (atualVal && Array.from(select.options).some(o => o.value === atualVal)) select.value = atualVal;
        else select.value = select.options[projecao === "realizado" ? 0 : select.options.length - 1].value;
    }
}

function atualizarFiltroContas(select, pMap, cMap, pSel) {
    const permitidas = new Set();
    pSel.forEach(id => pMap.get(String(id))?.contas.forEach(c => permitidas.add(c)));
    select.innerHTML = '';
    Array.from(cMap.entries()).sort((a,b) => a[1].descricao.localeCompare(b[1].descricao)).forEach(([k, v]) => {
        if (permitidas.has(k)) select.appendChild(new Option(v.descricao, k));
    });
    //Seleciona tudo por padrão
    if (select.options.length) {
        Array.from(select.options).forEach(opt => opt.selected = true);
    }
}

// ------ Tabelas (Renderização) ------
function atualizarVisualizacoes(dados, colunas, cache) {
    const limpar = id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; };
    ['tabelaMatriz', 'tabelaCustos', 'tabelaCapitalGiro'].forEach(limpar);

    renderizarDRE(dados.matrizDRE, colunas, cache.userType);
    renderizarDetalhamento(cache.categoriasMap, dados.matrizDetalhamento, colunas, dados.entradasESaidas, cache.userType);
    renderizarCapitalGiro(dados.matrizCapitalGiro, colunas, dados.dadosEstoque);
    
    renderizarGraficos(dados, colunas);
    renderizarFluxoDiario(dados.fluxoDeCaixa, colunas, dados.matrizDRE['Caixa Inicial']?.TOTAL || 0, cache.projecao);
    renderizarFluxoDiarioResumido(dados.matrizDRE['Caixa Inicial'], dados.matrizDRE['Caixa Final'], dados.entradasESaidas, colunas);
}

// 1. DRE
function renderizarDRE(matriz, colunas, userType) {
    const tabela = document.getElementById('tabelaMatriz');

    if (!tabela) {
        console.warn('Tabela tabelaMatriz não encontrada no DOM');
        return;
    }

    const thead = tabela.createTHead();
    const trH = thead.insertRow();
    trH.insertCell().textContent = 'Fluxo de Caixa';
    colunas.forEach(c => trH.insertCell().textContent = c);
    trH.insertCell().textContent = 'TOTAL';

    const tbody = tabela.createTBody();
    criarLinhaEspacadora(tbody, colunas);

    const ordem = [
        '(+) Receita Bruta', '(-) Deduções', '(=) Receita Líquida', '(-) Custos', '(-) Despesas',
        '(+/-) IRPJ/CSLL', '(+/-) Geração de Caixa Operacional', '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas',
        '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios', '(=) Movimentação de Caixa Mensal'
    ];
    if (userType?.toLowerCase() === 'developer') ordem.push('Entrada de Transferência', 'Saída de Transferência', 'Outros');
    ordem.push('Caixa Inicial', 'Caixa Final');

    ordem.forEach(classe => {
        const row = tbody.insertRow();
        row.insertCell().textContent = classe;
        colunas.forEach(c => row.insertCell().textContent = formatarValor(matriz[classe]?.[c] || 0));
        row.insertCell().textContent = formatarValor(matriz[classe]?.TOTAL || 0);

        // Lógica de Estilo via Data Attributes
        if (['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Outros'].includes(classe) || classe.includes('Transferência')) {
            row.dataset.type = 'total';
        } else if (['Caixa Inicial', 'Caixa Final'].includes(classe)) {
            row.dataset.type = 'saldo';
        } else {
            row.dataset.indent = '1';
        }
        
        if (['(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Outros'].includes(classe)) {
            criarLinhaEspacadora(tbody, colunas);
        }
    });
}

// 2. Detalhamento
function renderizarDetalhamento(catMap, dados, colunas, es, userType) {
    const tabela = document.getElementById('tabelaCustos');

    if (!tabela) {
        console.warn('Tabela tabelaCustos não encontrada no DOM');
        return;
    }

    const thead = tabela.createTHead();
    const trH = thead.insertRow();
    trH.insertCell().textContent = 'Detalhamento';
    colunas.forEach(c => trH.insertCell().textContent = c);
    trH.insertCell().textContent = 'TOTAL';
    criarLinhaEspacadora(thead, colunas);

    const tbody = tabela.createTBody();
    
    // Organiza Hierarquia
    const dadosOrg = {};
    Object.entries(dados).forEach(([k, v]) => {
        const [classe, per] = k.split('|');
        if (!dadosOrg[classe]) dadosOrg[classe] = {};
        dadosOrg[classe][per] = v;
    });

    const prioridade = ['(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL', '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios'];
    const render = (c) => renderDrillDown(c, dadosOrg[c], tbody, catMap, colunas);
    
    prioridade.forEach(c => { if(dadosOrg[c]) render(c); });
    Object.keys(dadosOrg).filter(c => !prioridade.includes(c)).forEach(render);

    criarLinhaEspacadora(tbody, colunas);

    const extras = userType?.toLowerCase() === 'developer' ? ['(+) Entradas de Transferência', '(-) Saídas de Transferência'] : [];
    [...extras, '(+) Entradas', '(-) Saídas'].forEach(c => {
        if (es[c]) {
            const r = tbody.insertRow();
            r.dataset.type = 'saldo';
            r.insertCell().textContent = c;
            colunas.forEach(col => r.insertCell().textContent = formatarValor(es[c][col] || 0));
            r.insertCell().textContent = formatarValor(es[c].TOTAL || 0);
        }
    });
}

function renderDrillDown(classe, dados, tbody, catMap, colunas) {
    const idBase = `classe_${sanitizeId(classe)}`;
    
    // Nível 0: Classe
    const rC = tbody.insertRow();
    rC.dataset.type = 'header-group';
    rC.id = idBase;
    rC.onclick = () => toggleLinha(idBase);
    rC.insertCell().innerHTML = `<span class="expand-btn">[+]</span> ${classe}`;
    
    let totC = 0;
    colunas.forEach(col => { const v = dados[col]?.total || 0; totC += v; rC.insertCell().textContent = formatarValor(v); });
    rC.insertCell().textContent = formatarValor(totC);

    // Constrói árvore
    const arvore = {};
    Object.keys(dados).forEach(per => {
        const dpts = dados[per].departamentos;
        for (const dep in dpts) {
            if (!arvore[dep]) arvore[dep] = {};
            for (const cat in dpts[dep].categorias) {
                if (!arvore[dep][cat]) arvore[dep][cat] = new Set();
                Object.keys(dpts[dep].categorias[cat].fornecedores).forEach(f => arvore[dep][cat].add(f));
            }
        }
    });

    // Renderiza Níveis
    Object.keys(arvore).sort().forEach(dep => {
        const idDep = `${idBase}_dp_${sanitizeId(dep)}`;
        const rD = tbody.insertRow();
        rD.className = `parent-${idBase} hidden`;
        rD.dataset.indent = '1';
        rD.id = idDep;
        rD.onclick = () => toggleLinha(idDep);
        rD.insertCell().innerHTML = `<span class="expand-btn">[+]</span> ${dep}`;

        let totD = 0;
        colunas.forEach(col => { const v = dados[col]?.departamentos[dep]?.total || 0; totD += v; rD.insertCell().textContent = formatarValor(v); });
        rD.insertCell().textContent = formatarValor(totD);

        Object.keys(arvore[dep]).sort().forEach(cat => {
            const idCat = `${idDep}_cat_${sanitizeId(cat)}`;
            const rCat = tbody.insertRow();
            rCat.className = `parent-${idDep} hidden`;
            rCat.dataset.indent = '2';
            rCat.id = idCat;
            rCat.onclick = (e) => { e.stopPropagation(); toggleLinha(idCat); };
            rCat.insertCell().innerHTML = `<span class="expand-btn">[+]</span> ${catMap.get(cat) || 'Desconhecida'}`;

            let totCat = 0;
            colunas.forEach(col => { const v = dados[col]?.departamentos[dep]?.categorias[cat]?.total || 0; totCat += v; rCat.insertCell().textContent = formatarValor(v); });
            rCat.insertCell().textContent = formatarValor(totCat);

            Array.from(arvore[dep][cat]).sort().forEach(forn => {
                const rF = tbody.insertRow();
                rF.className = `parent-${idCat} hidden`;
                rF.dataset.indent = 'lancamento';
                rF.insertCell().textContent = forn;
                
                let totF = 0;
                colunas.forEach(col => { const v = dados[col]?.departamentos[dep]?.categorias[cat]?.fornecedores[forn]?.total || 0; totF += v; rF.insertCell().textContent = formatarValor(v); });
                rF.insertCell().textContent = formatarValor(totF);
            });
        });
    });
}

// 3. Capital de Giro
function renderizarCapitalGiro(matriz, colunas, estoque) {
    const t = document.getElementById('tabelaCapitalGiro');
    // Verifica se os elementos necessários existem antes de continuar
    if (!t || !colunas.length || !matriz) return;

    // Limpa e cria cabeçalho
    t.innerHTML = ''; 
    const thead = t.createTHead();
    const trH = thead.insertRow();
    trH.innerHTML = `<td>Capital de Giro</td>${colunas.map(c=>`<td>${c}</td>`).join('')}<td></td>`;
    
    const tb = t.createTBody();

    // --- CORREÇÃO AQUI ---
    const calcPct = (tipo) => {
        // Inicializa os objetos vazios se não existirem
        matriz[`Curto Prazo ${tipo} %`] = {};
        matriz[`Longo Prazo ${tipo} %`] = {};

        colunas.forEach(c => {
            const tot = (matriz[`Curto Prazo ${tipo}`]?.[c] || 0) + (matriz[`Longo Prazo ${tipo}`]?.[c] || 0);
            
            // Cálculo seguro
            matriz[`Curto Prazo ${tipo} %`][c] = tot ? (matriz[`Curto Prazo ${tipo}`][c] / tot) * 100 : 0;
            matriz[`Longo Prazo ${tipo} %`][c] = tot ? (matriz[`Longo Prazo ${tipo}`][c] / tot) * 100 : 0;
        });
    };
    
    // Executa os cálculos
    calcPct('AR'); 
    calcPct('AP');

    // Função auxiliar para adicionar linhas
    const add = (lbl, key, isPct, type, indent) => {
        const r = tb.insertRow();
        if(type) r.dataset.type = type;
        if(indent) r.dataset.indent = '1';
        
        r.insertCell().textContent = lbl;
        
        colunas.forEach(c => {
            // Lógica para pegar do estoque ou da matriz principal
            let v = 0;
            if (key === 'Estoque') {
                v = estoque?.['(+) Estoque']?.[c] ?? 0;
            } else {
                v = matriz[key]?.[c] ?? 0;
            }
            
            r.insertCell().textContent = isPct && v !== 0 ? formatarPercentual(v) : formatarValor(v);
        });
        r.insertCell(); // Coluna final vazia
    };
    
    const spc = () => criarLinhaEspacadora(tb, colunas);

    // Renderização das linhas
    add('(+) Caixa', '(+) Caixa', false, 'total');
    spc();
    add('(+) Clientes a Receber', '(+) Clientes a Receber', false, 'total');
    add('Curto Prazo (30 dias)', 'Curto Prazo AR', false, null, true);
    add('Longo Prazo (> 30 dias)', 'Longo Prazo AR', false, null, true);
    add('Curto Prazo (%)', 'Curto Prazo AR %', true, null, true);
    add('Longo Prazo (%)', 'Longo Prazo AR %', true, null, true);
    
    if (estoque && estoque['(+) Estoque']) { 
        spc(); 
        add('(+) Estoque', 'Estoque', false, 'total'); 
    }

    spc();
    add('(-) Fornecedores a Pagar', '(-) Fornecedores a Pagar', false, 'total');
    add('Curto Prazo (30 dias)', 'Curto Prazo AP', false, null, true);
    add('Longo Prazo (> 30 dias)', 'Longo Prazo AP', false, null, true);
    add('Curto Prazo (%)', 'Curto Prazo AP %', true, null, true);
    add('Longo Prazo (%)', 'Longo Prazo AP %', true, null, true);

    spc();
    add('(=) Curto Prazo (30 dias)', 'Curto Prazo TT', false, 'total');
    add('(=) Longo Prazo (> 30 dias)', 'Longo Prazo TT', false, 'total');
    
    spc();
    const rF = tb.insertRow();
    rF.dataset.type = 'saldo';
    rF.insertCell().textContent = '(=) Capital Líquido Circulante';
    colunas.forEach(c => {
        const valLiq = (matriz['Capital Liquido']?.[c] ?? 0) + (estoque?.['(+) Estoque']?.[c] ?? 0);
        rF.insertCell().textContent = formatarValor(valLiq);
    });
    rF.insertCell();
}

function criarLinhaEspacadora(target, colunas) {
    const r = target.insertRow();
    r.dataset.type = 'spacer';
    r.innerHTML = `<td colspan="${colunas.length + 2}"></td>`;
}

// ------ Gráficos ------
function renderizarGraficos(dados, colunas) {
    if (!dados?.matrizDRE || !window.Chart) {
        console.warn("Chart.js não carregado ou dados insuficientes.");
        return;
    }
    
    let l=[], s=[], r=[], p=[], accR=0, accP=0, rAc=[], pAc=[];

    colunas.forEach(c => {
        // Lógica de tratamento de nulos (mantida da versão anterior)
        const valSaldo = dados.matrizDRE['Caixa Final']?.[c];
        const sv = (valSaldo === undefined || valSaldo === null) ? null : valSaldo;

        const valEntrada = dados.entradasESaidas['(+) Entradas']?.[c];
        const rv = (valEntrada === undefined || valEntrada === null) ? null : valEntrada;

        const valSaida = dados.entradasESaidas['(-) Saídas']?.[c];
        const pv = (valSaida === undefined || valSaida === null) ? null : Math.abs(valSaida);
        
        l.push(c);
        s.push(sv);
        r.push(rv);
        p.push(pv);

        if (rv !== null) { accR += rv; rAc.push(accR); } else { rAc.push(null); }
        if (pv !== null) { accP += pv; pAc.push(accP); } else { pAc.push(null); }
    });

    const common = (tit) => ({
        responsive: true, 
        maintainAspectRatio: false,
        spanGaps: false, // Importante: não conecta pontos distantes com nulos no meio
        plugins: { 
            title: {display:true, text:tit, font:{size:16}}, 
            legend:{position:'bottom'},
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) { label += ': '; }
                        if (context.parsed.y !== null) {
                            label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                        }
                        return label;
                    }
                }
            }
        },
        scales: { 
            x: {grid:{display:false}}, 
            y: {ticks:{callback:v=>`R$ ${v.toLocaleString('pt-BR')}`}} 
        }
    });

    const createChart = (id, key, cfg) => {
        const ctx = document.getElementById(id);
        if (!ctx) return;
        if (graficosAtuais[key]) graficosAtuais[key].destroy();
        graficosAtuais[key] = new window.Chart(ctx, cfg);
    };

    // Cores constantes para reutilização
    const VERDE = '#28a745';
    const VERMELHO = '#dc3545';

    // Configuração do Gráfico de Saldo
    let optSaldo = common('Saldo de Caixa (R$)');
    optSaldo.plugins.legend = {display:false};
    
    createChart('graficoSaldoCaixa', 'saldoCaixa', {
        type: 'line', 
        data: { 
            labels:l, 
            datasets: [{ 
                label: 'Saldo',
                data:s, 
                tension:0.3,
                // Aumentamos o raio para o ponto ser visivel sozinho
                pointRadius: 4, 
                pointHoverRadius: 6,
                // Colore o PONTO individualmente
                pointBackgroundColor: (ctx) => {
                    const v = ctx.parsed.y;
                    return v < 0 ? VERMELHO : VERDE;
                },
                pointBorderColor: (ctx) => {
                    const v = ctx.parsed.y;
                    return v < 0 ? VERMELHO : VERDE;
                },
                // Colore a LINHA (segmento entre dois pontos)
                segment: {
                    borderColor: ctx => {
                        if(ctx.p0.parsed.y === null || ctx.p1.parsed.y === null) return undefined;
                        return ctx.p0.parsed.y < 0 || ctx.p1.parsed.y < 0 ? VERMELHO : VERDE;
                    }
                }
            }] 
        }, 
        options: optSaldo
    });

    // Configuração do Gráfico Acumulado
    createChart('graficoRecebientoPagamentoAcumulado', 'acumulado', {
        type: 'line', 
        data: { 
            labels:l, 
            datasets:[
                {
                    label:'Entradas', 
                    data:rAc, 
                    borderColor: VERDE, 
                    backgroundColor:'rgba(40, 167, 69, 0.2)', 
                    fill:true, 
                    tension:0.3, 
                    pointRadius: 3 // Antes era 0, agora é 3 para aparecer se for ponto único
                },
                {
                    label:'Saídas', 
                    data:pAc, 
                    borderColor: VERMELHO, 
                    backgroundColor:'rgba(220, 53, 69, 0.2)', 
                    fill:true, 
                    tension:0.3, 
                    pointRadius: 3 // Antes era 0, agora é 3
                }
            ]
        }, 
        options: common('Evolução (R$)')
    });

    // Configuração do Gráfico Mensal (Barras não precisam de ajuste de ponto)
    createChart('graficoEntradasSaidasMensal', 'mensal', {
        type: 'bar', 
        data: { 
            labels:l, 
            datasets:[
                {label:'Entradas', data:r, backgroundColor: VERDE},
                {label:'Pagamentos', data:p, backgroundColor: VERMELHO}
            ]
        }, 
        options: common('Mensal (R$)')
    });
}

function configurarAbasGraficos() {
    const mapa = {'tab-btn-saldo':'graficoSaldoCaixa', 'tab-btn-acumulado':'graficoRecebientoPagamentoAcumulado', 'tab-btn-mensal':'graficoEntradasSaidasMensal'};
    Object.entries(mapa).forEach(([btn, cnv]) => {
        const b = document.getElementById(btn);
        if(b) b.onclick = (e) => {
            document.querySelectorAll('#graficos-content canvas').forEach(c => c.style.display='none');
            document.querySelectorAll('.tab-link').forEach(a => a.classList.remove('active'));
            const c = document.getElementById(cnv); if(c) c.style.display='block';
            e.currentTarget.classList.add('active');
        };
    });
}

// ------ Fluxo Diário ------
function renderizarFluxoDiario(fluxo, colunas, saldoIni, projecao) {
    const tb = document.getElementById('tabelaFluxoDiario');

    if (!tb) {
        console.warn('Tabela tabelaFluxoDiario não encontrada no DOM');
        return;
    }

    tb.textContent = '';
    if (!colunas.length) return;

    const colsAll = colunas[0].length === 4 ? colunas.flatMap(a => Array.from({length:12},(_,i)=>`${String(i+1).padStart(2,'0')}-${a}`)) : colunas;
    const colSet = new Set(colsAll);
    const dados = [], periodos = new Set();

    fluxo.forEach(x => {
        const k = `${x.data.split('/')[1]}-${x.data.split('/')[2]}`;
        periodos.add(k);
        if (colSet.has(k)) dados.push({...x, k});
    });

    const perOrd = Array.from(periodos).filter(p=>colSet.has(p)).sort(compKeys);
    let iniVis, fimVis;
    
    if (perOrd.length) {
        if (projecao === 'arealizar') {
            iniVis = colsAll[colsAll.indexOf(perOrd[0])] || perOrd[0];
            fimVis = colsAll[Math.min(colsAll.length-1, colsAll.indexOf(iniVis) + MAX_MESES_FLUXO - 1)];
        } else {
            fimVis = colsAll[colsAll.indexOf(perOrd[perOrd.length-1])] || perOrd[perOrd.length-1];
            iniVis = colsAll[Math.max(0, colsAll.indexOf(fimVis) - MAX_MESES_FLUXO + 1)];
        }
    } else {
        const c = projecao === 'arealizar' ? colsAll.slice(0, MAX_MESES_FLUXO) : colsAll.slice(-MAX_MESES_FLUXO);
        iniVis = c[0]; fimVis = c[c.length-1];
    }

    const tbody = tb.createTBody();
    criarHeaderFluxo(tb, Array.from(periodos).sort(compKeys), (i, f) => renderFD(tbody, dados, saldoIni, i, f), iniVis, fimVis);
    renderFD(tbody, dados, saldoIni, iniVis, fimVis);
}

function renderFD(tbody, itens, baseSaldo, ini, fim) {
    tbody.innerHTML = '';
    if (!ini || !fim || !itens.length) return tbody.insertRow().innerHTML = `<td colspan="4" class="linha-sem-dados">Nenhum lançamento.</td>`;

    const val = k => { const [m,a]=k.split('-'); return a*100+Number(m); };
    const vI=val(ini), vF=val(fim);
    const visiveis = itens.filter(x => { const v=val(x.k); return v>=vI && v<=vF; });

    if (!visiveis.length) return tbody.insertRow().innerHTML = `<td colspan="4" class="linha-sem-dados">Sem dados no período.</td>`;

    let s = baseSaldo;
    itens.forEach(x => { if(compKeys(x.k, ini) < 0) s += x.valor; });

    const rS = tbody.insertRow();
    rS.innerHTML = `<td></td><td><b>Saldo Inicial</b></td><td></td><td><b>${formatarValor(s)}</b></td>`;

    visiveis.forEach(i => {
        s += i.valor;
        const r = tbody.insertRow();
        const obs = i.obs ? ` <span class="tooltip-target" data-tooltip="${i.obs}">ℹ️</span>` : '';
        r.innerHTML = `<td>${i.data}</td><td>${i.descricao}${obs}</td><td style="text-align:right">${formatarValor(i.valor)}</td><td style="text-align:right">${formatarValor(s)}</td>`;
    });
}

function criarHeaderFluxo(tab, pers, cb, iniDef, fimDef) {
    const thead = tab.createTHead();
    const thRow = thead.insertRow();
    
    // --- Célula 1: Filtro (TH manual) ---
    const thData = document.createElement('th');
    thData.className = 'data-header';
    thData.style.position = 'relative'; // Importante para o dropdown absoluto

    // Container do Filtro
    const wrap = document.createElement('div');
    wrap.id = 'fd-periodo-container';
    
    // Label clicável
    const labelDiv = document.createElement('div');
    labelDiv.id = 'fd-periodo-label';
    labelDiv.textContent = `${iniDef} → ${fimDef} ▼`;
    
    // Texto fixo "Data"
    const textDiv = document.createElement('div');
    textDiv.textContent = 'Data';
    
    wrap.appendChild(textDiv);
    wrap.appendChild(labelDiv);
    
    // Lógica do Dropdown
    const { drop, ini, fim } = criarDropCal(pers, (i, f) => { 
        labelDiv.textContent = `${i} → ${f} ▼`; 
        cb(i, f); 
    }, iniDef, fimDef);

    if(ini) labelDiv.textContent = `${ini} → ${fim} ▼`;

    // Eventos de Clique (Corrigido)
    labelDiv.onclick = (e) => { 
        e.stopPropagation(); 
        const isVisible = drop.style.display === 'block';
        drop.style.display = isVisible ? 'none' : 'block'; 
    };
    
    document.addEventListener('click', (e) => { 
        // Fecha se clicar fora da TH
        if (!thData.contains(e.target)) drop.style.display = 'none'; 
    });

    thData.appendChild(wrap);
    thData.appendChild(drop);
    thRow.appendChild(thData);

    // --- Células 2, 3, 4: Colunas Normais (TH manuais) ---
    // Usamos createElement('th') para garantir que peguem o estilo do CSS
    ['Descrição', 'Valor (R$)', 'Saldo (R$)'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        thRow.appendChild(th);
    });
}

function criarDropCal(pers, cb, sIni, sFim) {
    const d = document.createElement('div'); d.className = 'filtro-dropdown';
    let selI = sIni || pers[0], selF = sFim || pers[pers.length-1];

    const render = () => {
        d.innerHTML = '';
        const grp = {}; pers.forEach(p=>{ const[m,a]=p.split('-'); (grp[a]=grp[a]||[]).push(m); });
        
        Object.keys(grp).sort().forEach(a => {
            const row = document.createElement('div');
            row.innerHTML = `<div class="filtro-ano-header">${a}</div><div class="filtro-meses-grid"></div>`;
            const grid = row.querySelector('.grid') || row.lastChild;
            
            for(let i=1; i<=12; i++){
                const m = String(i).padStart(2,'0'), k = `${m}-${a}`;
                const btn = document.createElement('div');
                btn.textContent = MESES_ABREV[i-1];
                
                const hasData = grp[a].includes(m);
                const isSel = selI && !selF; // Selecionando...
                const diff = isSel ? Math.abs(((Number(a)-Number(selI.split('-')[1]))*12) + (i - Number(selI.split('-')[0]))) : 0;
                
                if (hasData && (!isSel || diff <= MAX_MESES_FLUXO)) {
                    btn.className = 'filtro-mes-btn';
                    if (selI === k || (selI && selF && compKeys(k, selI)>=0 && compKeys(k, selF)<=0)) btn.classList.add('in-range');
                    if (k === selI || k === selF) btn.classList.add('selected-start');
                    
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        if (!selI || (selI && selF)) { selI = k; selF = null; } 
                        else { 
                            let [i, f] = [selI, k]; if(compKeys(f, i)<0) [i,f]=[f,i];
                            if (Math.abs(((Number(f.split('-')[1])-Number(i.split('-')[1]))*12)+(Number(f.split('-')[0])-Number(i.split('-')[0]))) <= MAX_MESES_FLUXO) {
                                selI = i; selF = f; cb(i, f);
                            }
                        }
                        render();
                    };
                } else {
                    btn.className = 'filtro-mes-slot';
                }
                grid.appendChild(btn);
            }
            d.appendChild(row);
        });
    };
    render();
    return { drop: d, ini: selI, fim: selF };
}

function compKeys(a, b) {
    if(!a||!b) return 0;
    const [ma, aa] = a.split('-'), [mb, ab] = b.split('-');
    return aa !== ab ? aa - ab : ma - mb;
}

// ------ Fluxo Diário Resumido -----
function renderizarFluxoDiarioResumido(linhaCaixaIni, linhaCaixaFim, es, colunas) { 
    const tabela = document.getElementById('resumoFluxoCaixa');
    if (!tabela) return;

    // Criamos um array local com 'TOTAL' no final para iterar tudo junto
    const colunasProcessar = [...colunas, 'TOTAL'];

    // --- 1. Construção do Cabeçalho ---
    let htmlHeader = `
        <thead>
            <tr>
                <th>Resumo Financeiro</th>
                ${colunasProcessar.map(c => `<th>${c}</th>`).join('')}
            </tr>
        </thead>`;

    // --- 2. Preparação dos Dados por Coluna ---
    let cellsEntradas = [];
    let cellsSaidas = [];
    let cellsBalanco = [];
    let cellsSaldoIni = [];
    let cellsSaldoFim = [];

    colunasProcessar.forEach(col => {
        const isTotal = col === 'TOTAL';

        // 1. Recuperação de Valores (Entradas e Saídas)
        const vEntradas = (es['(+) Entradas']?.[col] || 0);
        const vSaidas = (es['(-) Saídas']?.[col] || 0);
        
        // 2. Balanço do dia/período (Entradas + Saídas)
        const vBalanco = vEntradas + vSaidas;

        // 3. Recuperação de Saldos (Direto dos objetos passados, sem cálculo manual)
        const valSaldoIni = linhaCaixaIni[col] || 0;
        const valSaldoFim = linhaCaixaFim[col] || 0;

        // --- 4. Formatação Visual ---
        const styleCell = isTotal ? 'font-weight:bold;' : '';
        const classeBalanco = vBalanco >= 0 ? 'texto-verde' : 'texto-vermelho';

        // Linhas Operacionais
        cellsEntradas.push(`<td class="texto-verde" style="${styleCell}">${formatarValor(vEntradas)}</td>`);
        cellsSaidas.push(`<td class="texto-vermelho" style="${styleCell}">${formatarValor(vSaidas)}</td>`);
        cellsBalanco.push(`<td class="${classeBalanco}" style="font-weight:bold">${formatarValor(vBalanco)}</td>`);

        // Linhas de Caixa (Dados prontos)
        cellsSaldoIni.push(`<td style="${styleCell}">${formatarValor(valSaldoIni)}</td>`);
        cellsSaldoFim.push(`<td style="${styleCell}">${formatarValor(valSaldoFim)}</td>`);
    });

    // --- 3. Montagem do Corpo da Tabela ---
    const htmlBody = `
        <tbody>
            <tr>
                <td class="texto-verde">(+) Entradas</td>
                ${cellsEntradas.join('')}
            </tr>
            <tr>
                <td class="texto-vermelho">(-) Saídas</td>
                ${cellsSaidas.join('')}
            </tr>
            <tr>
                <td class="texto-azul">(=) Balanço</td>
                ${cellsBalanco.join('')}
            </tr>
            <tr>
                <td colspan="${colunasProcessar.length + 1}" style="height:10px; padding:0; background:transparent; border:none;"></td> 
            </tr>
            <tr data-type="saldo">
                <td>Caixa Inicial</td>
                ${cellsSaldoIni.join('')}
            </tr>
            <tr data-type="saldo">
                <td>Caixa Final</td>
                ${cellsSaldoFim.join('')}
            </tr>
        </tbody>
    `;

    tabela.innerHTML = htmlHeader + htmlBody;
}

export { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect, alternarEstadoCarregamento };