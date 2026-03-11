// uiV02.js - Parte 1: Estado, Utilitários, Filtros e Função de Atualização Principal

// ------ Estado Global e Configurações ------
const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
let chartJsPromise = null;
let graficosAtuais = { saldoCaixa: null, acumulado: null, mensal: null };

const EstadoData = {
    minDataDisponivel: null, // 'MM-YYYY'
    maxDataDisponivel: null, // 'MM-YYYY'
    selecaoInicio: null,     // 'MM-YYYY' ou 'YYYY'
    selecaoFim: null,        // 'MM-YYYY' ou 'YYYY'
    callbackMudanca: null,
    userTypeAtual: null
};

function carregarChartJs() {
    if (!window.Chart && !chartJsPromise) {
        chartJsPromise = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = resolve;
            document.head.appendChild(script);
        });
    }
}
// --- Utilitários Básicos ---
const usarNovoRangePicker = (userType) => ['developer'].includes((userType || '').toLowerCase());
const parseDataStr = (str) => {
    if (!str) return { m: 1, a: new Date().getFullYear() };
    const [m, a] = str.includes('-') ? str.split('-').map(Number) : [1, Number(str)];
    return { m, a };
};
const compStrData = (a, b) => {
    const dA = parseDataStr(a), dB = parseDataStr(b);
    return dA.a !== dB.a ? dA.a - dB.a : dA.m - dB.m;
};
const sanitizeId = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\W+/g, '_').replace(/^_+|_+$/g, '');
const getSelectItems = (select) => Array.from(select?.selectedOptions || []).map(o => o.value);

export function formatarValor(valor, fractionDigits = 0) {
    if (Math.abs(valor) < 0.01) return '-';
    const num = Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
    return valor < 0 ? `(${num})` : num;
}

export function formatarPercentual(valor) {
    return (!valor || valor === 0) ? '0,0%' : `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%`;
}

export function alternarEstadoCarregamento(carregando) {
    document.body.classList.toggle('app-loading', carregando);
    ['anoSelect', 'projSelect', 'contaSelect', 'modoSelect', 'btnARealizar', 'btnRealizado', 'inputDataInicial', 'inputDataFinal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.disabled = carregando; el.style.opacity = carregando ? '0.6' : '1'; }
    });
}

// ------ Gerenciamento de Datas e Filtros ------

export function gerarColunasPeloIntervalo(inicio, fim, modo) {
    const lista = [];
    const i = parseDataStr(inicio), f = parseDataStr(fim);
    let currA = i.a, currM = i.m;

    while (currA < f.a || (currA === f.a && currM <= f.m)) {
        if (modo === 'mensal') {
            lista.push(`${String(currM).padStart(2, '0')}-${currA}`);
            currM++;
            if (currM > 12) { currM = 1; currA++; }
        } else {
            lista.push(String(currA));
            currA++;
        }
    }
    return lista;
}
function sincronizarEstadoComSelectAntigo(ano, modo) {
    if (!ano) return;
    if (modo.toLowerCase() === 'mensal') {
        EstadoData.selecaoInicio = `01-${ano}`;
        EstadoData.selecaoFim = `12-${ano}`;
    } else {
        EstadoData.selecaoInicio = `${ano}`;
        EstadoData.selecaoFim = `${parseInt(ano) + 5}`;
    }
}
export function resetarSelecaoPeloModo(modo, usaNovo = true) {
    const ano = new Date().getFullYear();
    if (usaNovo) {
        if (modo.toLowerCase() === 'mensal') {
            EstadoData.selecaoInicio = `01-${ano}`;
            EstadoData.selecaoFim = `12-${ano}`;
        } else {
            EstadoData.selecaoInicio = `${ano}`;
            EstadoData.selecaoFim = `${ano + 5}`;
        }
    } else {
        sincronizarEstadoComSelectAntigo(ano, modo);
    }
}
export function atualizarOpcoesAnoSelect(dummy, minAno, maxAno, modo, projecao) {
    const usaNovo = usarNovoRangePicker(EstadoData.userTypeAtual);
    const margemFim = projecao === 'arealizar' ? Math.max(maxAno, new Date().getFullYear() + 5) : maxAno;
    
    EstadoData.minDataDisponivel = `01-${minAno}`;
    EstadoData.maxDataDisponivel = `12-${margemFim}`;

    if (usaNovo) {
        let aIni = parseDataStr(EstadoData.selecaoInicio).a || minAno;
        let aFim = parseDataStr(EstadoData.selecaoFim).a || aIni;
        
        if (aIni < minAno) { aIni = minAno; aFim = Math.max(aFim, minAno); }
        if (aIni > margemFim) { aIni = margemFim; aFim = margemFim; }
        if (aFim > margemFim) { aFim = margemFim; if (aIni > aFim) aIni = aFim; }

        EstadoData.selecaoInicio = modo.toLowerCase() === 'mensal' ? `01-${aIni}` : `${aIni}`;
        EstadoData.selecaoFim = modo.toLowerCase() === 'mensal' ? `12-${aIni}` : `${aFim}`;
        renderizarComponenteFiltro();
    } else {
        const select = document.getElementById('anoSelect');
        if (!select) return;
        const valorAtual = select.value;
        select.innerHTML = '';
        
        if (modo.toLowerCase() === 'mensal') {
            for (let y = minAno; y <= margemFim; y++) select.appendChild(new Option(String(y), String(y)));
            select.value = (valorAtual && Array.from(select.options).some(o => o.value === valorAtual)) ? valorAtual : String(projecao === "realizado" ? margemFim : minAno);
        } else {
            for (let cursor = minAno; cursor <= margemFim; cursor += 6) select.prepend(new Option(`${cursor} até ${cursor + 5}`, String(cursor)));
            select.value = (valorAtual && Array.from(select.options).some(o => o.value === valorAtual)) ? valorAtual : select.options[projecao === "realizado" ? 0 : select.options.length - 1].value;
        }
        sincronizarEstadoComSelectAntigo(select.value, modo);
    }
}
export function atualizarFiltroContas(select, pMap, cMap, pSel) {
    const permitidas = new Set();
    pSel.forEach(id => pMap.get(String(id))?.contas.forEach(c => permitidas.add(c)));
    select.innerHTML = '';
    Array.from(cMap.entries())
        .sort((a,b) => a[1].descricao.localeCompare(b[1].descricao))
        .forEach(([k, v]) => { if (permitidas.has(k)) select.appendChild(new Option(v.descricao, k)); });
    Array.from(select.options).forEach(opt => opt.selected = true);
}
export function obterFiltrosAtuais() {
    const modo = document.getElementById('modoSelect')?.value || 'mensal';
    if (!EstadoData.selecaoInicio) return null;

    const fimEfetivo = EstadoData.selecaoFim || EstadoData.selecaoInicio;
    const colunas = gerarColunasPeloIntervalo(EstadoData.selecaoInicio, fimEfetivo, modo.toLowerCase());
    const anosUnicos = Array.from(new Set(colunas.map(c => modo.toLowerCase() === 'mensal' ? c.split('-')[1] : c)));

    return { 
        modo, anos: anosUnicos, colunas,
        projetos: getSelectItems(document.getElementById('projSelect')), 
        contas: getSelectItems(document.getElementById('contaSelect'))
    };
}
export function configurarFiltros(appCache, anosDisp, callback) {
    const usaNovo = usarNovoRangePicker(appCache.userType);
    EstadoData.callbackMudanca = callback;
    EstadoData.userTypeAtual = appCache.userType;

    const el = {
        proj: document.getElementById('projSelect'),
        conta: document.getElementById('contaSelect'),
        modo: document.getElementById('modoSelect'),
        pickerBtn: document.getElementById('globalDatePickerBtn'),
        anoSelect: document.getElementById('anoSelect')
    };

    if (usaNovo) {
        if (el.pickerBtn) el.pickerBtn.style.display = 'inline-block';
        if (el.anoSelect) el.anoSelect.style.display = 'none';
    } else {
        if (el.pickerBtn) el.pickerBtn.style.display = 'none';
        if (el.anoSelect) el.anoSelect.style.display = 'inline-block';
    }

    const setProj = (t) => {
        appCache.projecao = t;
        const divCG = document.getElementById('groupCapitalGiro');
        if(divCG) divCG.style.display = (t === "arealizar") ? "none" : "";
        callback();
    };

    document.getElementById('btnARealizar')?.addEventListener('click', () => setProj("arealizar"));
    document.getElementById('btnRealizado')?.addEventListener('click', () => setProj("realizado"));
    
    el.conta.onchange = callback;
    el.proj.onchange = () => {
        atualizarFiltroContas(el.conta, appCache.projetosMap, appCache.contasMap, getSelectItems(el.proj));
        callback();
    };
    el.modo.onchange = () => {
        resetarSelecaoPeloModo(el.modo.value, usaNovo);
        if (usaNovo) renderizarComponenteFiltro();
        else sincronizarEstadoComSelectAntigo(el.anoSelect.value, el.modo.value);
        callback();
    };

    if (!usaNovo && el.anoSelect) {
        el.anoSelect.onchange = () => {
            sincronizarEstadoComSelectAntigo(el.anoSelect.value, el.modo.value);
            callback();
        };
    }

    resetarSelecaoPeloModo(el.modo.value || 'mensal', usaNovo);
    
    el.proj.innerHTML = '';
    Array.from(appCache.projetosMap.entries())
        .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
        .forEach(([cod, { nome }]) => el.proj.appendChild(new Option(nome, cod)));
    if (el.proj.options.length) el.proj.options[0].selected = true;
    
    atualizarFiltroContas(el.conta, appCache.projetosMap, appCache.contasMap, getSelectItems(el.proj));

    const ano = new Date().getFullYear();
    const minDisp = Math.min(...anosDisp.map(Number), ano);
    const maxDisp = Math.max(...anosDisp.map(Number), ano);
    
    if (!usaNovo) atualizarOpcoesAnoSelect(null, minDisp, maxDisp, el.modo.value, appCache.projecao);
    else renderizarComponenteFiltro(); 
    
    carregarChartJs(); // Assumindo que será declarada junto aos gráficos
    configurarAbasGraficos(); // Assumindo que será declarada junto aos gráficos
    callback();
}

// ------ Componentes do Data Picker ------
function renderizarComponenteFiltro() {
    const btn = document.getElementById('globalDatePickerBtn');
    if (!btn) return;
    const textoPeriodo = (EstadoData.selecaoInicio === EstadoData.selecaoFim || !EstadoData.selecaoFim) 
        ? EstadoData.selecaoInicio : `${EstadoData.selecaoInicio} até ${EstadoData.selecaoFim}`;
    btn.textContent = textoPeriodo;
    
    const oldDrop = document.getElementById('globalDateDropdown');
    if (oldDrop) oldDrop.remove();

    const drop = document.createElement('div');
    drop.id = 'globalDateDropdown';
    drop.className = 'filtro-dropdown'; 
    drop.style.display = 'none';
    document.body.appendChild(drop);

    btn.onclick = (e) => {
        e.stopPropagation();
        if (drop.style.display === 'block') { drop.style.display = 'none'; return; }
        document.querySelectorAll('.filtro-dropdown').forEach(d => d.style.display = 'none'); 
        montarGridCalendario(drop); // Assumindo função utilitária existente igual a V01
        const rect = btn.getBoundingClientRect();
        drop.style.position = 'fixed'; drop.style.top = `${rect.bottom + 5}px`; drop.style.left = `${rect.left}px`;       
        drop.style.zIndex = '2147483647'; drop.style.display = 'block';
    };

    const closeListener = (e) => { if (drop.style.display === 'block' && !btn.contains(e.target) && !drop.contains(e.target)) drop.style.display = 'none'; };
    const scrollListener = (e) => { if (drop.style.display === 'block' && !drop.contains(e.target)) drop.style.display = 'none'; };

    if (window._myDateDropClose) window.removeEventListener('click', window._myDateDropClose);
    if (window._myDateDropScroll) window.removeEventListener('scroll', window._myDateDropScroll, true);
    window._myDateDropClose = closeListener; window._myDateDropScroll = scrollListener;
    window.addEventListener('click', closeListener); window.addEventListener('scroll', scrollListener, true); 
}
function montarGridCalendario(container) {
    container.innerHTML = '';
    const modo = document.getElementById('modoSelect').value.toLowerCase();
    const minA = parseDataStr(EstadoData.minDataDisponivel).a;
    const maxA = parseDataStr(EstadoData.maxDataDisponivel).a;

    // Cabeçalho de instrução
    const header = document.createElement('div');
    header.className = 'filtro-ano-header';
    header.style.fontSize = '12px';
    header.textContent = modo === 'mensal' ? 'Selecione até 12 meses' : 'Selecione até 6 anos';
    container.appendChild(header);

    for (let ano = minA; ano <= maxA; ano++) {
        const row = document.createElement('div');
        
        if (modo === 'mensal') {
            row.innerHTML = `<div class="filtro-ano-header">${ano}</div><div class="grid filtro-meses-grid"></div>`;
            const grid = row.querySelector('.grid');
            
            for (let i = 1; i <= 12; i++) {
                const m = String(i).padStart(2, '0');
                const chave = `${m}-${ano}`;
                const btn = criarBotaoPeriodo(chave, modo);
                grid.appendChild(btn);
            }
        } else {
            // Modo Anual (Botão unico por ano)
            const btn = criarBotaoPeriodo(String(ano), modo);
            btn.style.width = '100%';
            btn.style.margin = '2px';
            row.appendChild(btn);
        }
        container.appendChild(row);
    }
}
function criarBotaoPeriodo(chave, modo) {
    const btn = document.createElement('div');
    btn.className = 'filtro-mes-btn';
    btn.textContent = modo === 'mensal' ? MESES_ABREV[parseInt(chave.split('-')[0]) - 1] : chave;

    const inicio = EstadoData.selecaoInicio;
    const fim = EstadoData.selecaoFim;

    // Estilização (Selecionado e Range)
    const isInicio = chave === inicio;
    const isFim = chave === fim;
    const inRange = inicio && fim && compStrData(chave, inicio) >= 0 && compStrData(chave, fim) <= 0;

    if (inRange) btn.classList.add('in-range');
    if (isInicio || isFim) btn.classList.add('selected-start'); // Reutiliza classe CSS

    btn.onclick = (e) => {
        e.stopPropagation();
        tratarCliqueData(chave, modo);
    };

    return btn;
}
function tratarCliqueData(chave, modo) {
    let i = EstadoData.selecaoInicio;
    let f = EstadoData.selecaoFim;

    // Lógica de Reinício ou Seleção de Range
    if (!i || (i && f)) {
        // Novo Início
        EstadoData.selecaoInicio = chave;
        EstadoData.selecaoFim = null;
    } else {
        // Fechando Range
        if (compStrData(chave, i) < 0) { [i, chave] = [chave, i]; } // Swap se selecionou anterior
        
        // Validação de Limites
        const maxCols = modo === 'mensal' ? 12 : 6;
        const colunasTeste = gerarColunasPeloIntervalo(i, chave, modo);
        
        if (colunasTeste.length > maxCols) {
            alert(`O período máximo é de ${maxCols} ${modo === 'mensal' ? 'meses' : 'anos'}.`);
            EstadoData.selecaoInicio = chave;
            EstadoData.selecaoFim = null;
        } else {
            EstadoData.selecaoInicio = i;
            EstadoData.selecaoFim = chave;
            // Dispara atualização
            document.getElementById('globalDateDropdown').style.display = 'none';
            renderizarComponenteFiltro();
            if (EstadoData.callbackMudanca) EstadoData.callbackMudanca();
        }
    }
    // Re-renderiza o grid para mostrar a seleção parcial
    const drop = document.getElementById('globalDateDropdown');
    if (drop.style.display === 'block') montarGridCalendario(drop);
}

// ------ Função Principal de Renderização ------
/**
 * Lê a nova estrutura padronizada gerada pelo processing e distribui para as tabelas e gráficos.
 * @param {Object} dadosConsolidados - Objeto contendo { dre, entradasSaidas, capitalGiro, fluxoDiario, detalhamento }
 * @param {Array} colunas - Colunas de período a serem renderizadas
 * @param {Array} colunasPlaceholder - Colunas extras para manter a UI alinhada (ex: 12 colunas no anual)
 * @param {Object} cache - appCache com mapas e configurações de usuário
 */
export function atualizarVisualizacoes(dadosConsolidados, colunas, colunasPlaceholder, cache) {
    const limpar = id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; };
    const idsTabelas = ['tabelaMatriz', 'tabelaCustos', 'tabelaCapitalGiro', 'resumoFluxoCaixa'];
    idsTabelas.forEach(limpar);

    // Estruturas seguras caso o processing retorne algo vazio
    const dre = dadosConsolidados?.dre || {};
    const detalhamento = dadosConsolidados?.detalhamento || {};
    const entradasSaidas = dadosConsolidados?.entradasSaidas || {};
    const cg = dadosConsolidados?.capitalGiro || {};
    const fluxo = dadosConsolidados?.fluxoDiario || [];

    // O Caixa Inicial global fica na linha 'Caixa Inicial' -> 'TOTAL' da DRE na nova estrutura, 
    // ou no primeiro período visível.
    const saldoInicialCaixa = dre['Caixa Inicial']?.[colunas[0]] || 0;

    renderizarDRE(dre, colunas, cache.userType);
    renderizarDetalhamento(cache.categoriasMap, detalhamento, colunas, entradasSaidas, cache.userType);
    renderizarCapitalGiro(cg, colunas, dadosConsolidados?.dadosEstoque); // dadosEstoque se ainda vier do merge
    renderizarGraficos(dadosConsolidados, colunas); 
    renderizarFluxoDiario(fluxo, colunas, saldoInicialCaixa, cache.projecao);
    renderizarFluxoDiarioResumido(dre['Caixa Inicial'] || {}, dre['Caixa Final'] || {}, entradasSaidas, colunas);

    if (colunasPlaceholder && colunasPlaceholder.length > 0) {
        renderizarColunasPlaceholder(colunasPlaceholder, idsTabelas);
    }
}

// --- Utilitários de Tabela ---
function formatarValor(valor, fractionDigits = 0) {
    if (Math.abs(valor) < 0.01) return '-';
    const num = Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
    return valor < 0 ? `(${num})` : num;
}
function formatarPercentual(valor) {
    return (!valor || valor === 0) ? '0,0%' : `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%`;
}
function criarLinhaEspacadora(target, colunas) {
    const r = target.insertRow();
    r.dataset.type = 'spacer';
    r.innerHTML = `<td colspan="${colunas.length + 2}"></td>`;
}

// Global para a UI interagir com as linhas expansíveis
window.toggleLinha = function(id) {
    const filhos = document.querySelectorAll(`.parent-${id}`);
    if (filhos.length === 0) return;

    const vaiFechar = !filhos[0].classList.contains('hidden');
    const linhaPai = document.getElementById(id);
    const btn = linhaPai ? linhaPai.querySelector('.expand-btn') : null;

    if (vaiFechar) {
        esconderDescendentes(id);
        if (btn) btn.textContent = '[+]';
    } else {
        filhos.forEach(filho => filho.classList.remove('hidden'));
        if (btn) btn.textContent = '[-]';
    }
};
function esconderDescendentes(id) {
    document.querySelectorAll(`.parent-${id}`).forEach(filho => {
        filho.classList.add('hidden');
        const btn = filho.querySelector('.expand-btn');
        if (btn) btn.textContent = '[+]';
        if (filho.id) esconderDescendentes(filho.id);
    });
}

// ------ 1. DRE Principal ------
export function renderizarDRE(dre, colunas, userType) {
    const tabela = document.getElementById('tabelaMatriz');
    if (!tabela || !dre) return;

    tabela.innerHTML = '';
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
        
        // Colunas temporais
        colunas.forEach(c => {
            row.insertCell().textContent = formatarValor(dre[classe]?.[c] || 0);
        });
        
        // Coluna Total Horizontal
        row.insertCell().textContent = formatarValor(dre[classe]?.['TOTAL'] || 0);

        // Estilos
        if (['(=) Receita Líquida', 'Outros'].includes(classe) || classe.includes('Transferência')) {
            row.dataset.type = 'total';
        } else if (['(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal'].includes(classe)) {
            row.dataset.type = 'total-negrito';
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

// ------ 2. Detalhamento (Drill-down) ------
export function renderizarDetalhamento(catMap, detalhamento, colunas, entradasSaidas, userType) {
    const tabela = document.getElementById('tabelaCustos');
    if (!tabela || !detalhamento) return;

    tabela.innerHTML = '';
    const thead = tabela.createTHead();
    const trH = thead.insertRow();
    trH.insertCell().textContent = 'Detalhamento';
    colunas.forEach(c => trH.insertCell().textContent = c);
    trH.insertCell().textContent = 'TOTAL';
    criarLinhaEspacadora(thead, colunas);

    const tbody = tabela.createTBody();
    
    // Organiza a estrutura plana 'Classe|Periodo' em um objeto hierárquico
    const dadosOrg = {};
    Object.keys(detalhamento).forEach(chave => {
        const [classe, periodo] = chave.split('|');
        if (!dadosOrg[classe]) dadosOrg[classe] = {};
        dadosOrg[classe][periodo] = detalhamento[chave];
    });

    const prioridade = [
        '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', 
        '(+/-) IRPJ/CSLL', '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', 
        '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios'
    ];
    
    const render = (classe) => renderDrillDown(classe, dadosOrg[classe], tbody, catMap, colunas);
    
    prioridade.forEach(c => { if (dadosOrg[c]) render(c); });
    Object.keys(dadosOrg).filter(c => !prioridade.includes(c)).forEach(render);

    criarLinhaEspacadora(tbody, colunas);

    // Renderiza Entradas e Saídas (Resumo final da tabela)
    const extras = userType?.toLowerCase() === 'developer' ? ['(+) Entradas de Transferência', '(-) Saídas de Transferência'] : [];
    [...extras, '(+) Entradas', '(-) Saídas'].forEach(c => {
        if (entradasSaidas[c]) {
            const r = tbody.insertRow();
            r.dataset.type = 'saldo';
            r.insertCell().textContent = c;
            colunas.forEach(col => r.insertCell().textContent = formatarValor(entradasSaidas[c][col] || 0));
            r.insertCell().textContent = formatarValor(entradasSaidas[c]['TOTAL'] || 0);
        }
    });
}
function renderDrillDown(classe, dadosDaClasse, tbody, catMap, colunas) {
    const temDados = colunas.some(col => dadosDaClasse[col]);
    if (!temDados) return;

    const idBase = `classe_${sanitizeId(classe)}`;
    
    // --- Nível 0: Classe ---
    const rC = tbody.insertRow();
    rC.dataset.type = 'header-group';
    rC.id = idBase;
    rC.onclick = () => window.toggleLinha(idBase);
    
    const cellC = rC.insertCell();
    cellC.innerHTML = `<span class="expand-btn">[+]</span> ${classe}`;
    cellC.title = classe;
    
    let totC = 0;
    colunas.forEach(col => { 
        const v = dadosDaClasse[col]?.total || 0; 
        totC += v; 
        rC.insertCell().textContent = formatarValor(v); 
    });
    rC.insertCell().textContent = formatarValor(totC); // Total Horizontal

    // Mapeamento dinâmico da árvore para os períodos visíveis
    const arvore = {};
    colunas.forEach(per => {
        if (!dadosDaClasse[per] || !dadosDaClasse[per].departamentos) return;
        
        const dpts = dadosDaClasse[per].departamentos;
        for (const dep in dpts) {
            if (!arvore[dep]) arvore[dep] = {};
            for (const cat in dpts[dep].categorias) {
                if (!arvore[dep][cat]) arvore[dep][cat] = new Set();
                Object.keys(dpts[dep].categorias[cat].fornecedores).forEach(f => arvore[dep][cat].add(f));
            }
        }
    });

    // --- Nível 1: Departamentos ---
    Object.keys(arvore).sort().forEach(dep => {
        const idDep = `${idBase}_dp_${sanitizeId(dep)}`;
        const rD = tbody.insertRow();
        rD.className = `parent-${idBase} hidden`;
        rD.dataset.indent = '1';
        rD.id = idDep;
        rD.onclick = () => window.toggleLinha(idDep);
        
        const cellD = rD.insertCell();
        cellD.innerHTML = `<span class="expand-btn">[+]</span> ${dep}`;
        cellD.title = dep;
        
        let totD = 0;
        colunas.forEach(col => { 
            const v = dadosDaClasse[col]?.departamentos[dep]?.total || 0; 
            totD += v; 
            rD.insertCell().textContent = formatarValor(v); 
        });
        rD.insertCell().textContent = formatarValor(totD);

        // --- Nível 2: Categorias ---
        Object.keys(arvore[dep]).sort().forEach(cat => {
            const idCat = `${idDep}_cat_${sanitizeId(cat)}`;
            const rCat = tbody.insertRow();
            rCat.className = `parent-${idDep} hidden`;
            rCat.dataset.indent = '2';
            rCat.id = idCat;
            rCat.onclick = (e) => { e.stopPropagation(); window.toggleLinha(idCat); };
            
            const cellCat = rCat.insertCell();
            const nomeCat = catMap.get(cat) || 'Desconhecida';
            cellCat.innerHTML = `<span class="expand-btn">[+]</span> ${nomeCat}`;
            cellCat.title = nomeCat;

            let totCat = 0;
            colunas.forEach(col => { 
                const v = dadosDaClasse[col]?.departamentos[dep]?.categorias[cat]?.total || 0; 
                totCat += v; 
                rCat.insertCell().textContent = formatarValor(v); 
            });
            rCat.insertCell().textContent = formatarValor(totCat);

            // --- Nível 3: Fornecedores ---
            Array.from(arvore[dep][cat]).sort().forEach(forn => {
                const rF = tbody.insertRow();
                rF.className = `parent-${idCat} hidden`;
                rF.dataset.indent = 'lancamento';
                
                const cellF = rF.insertCell();
                cellF.textContent = forn;
                cellF.title = forn;
                
                let totF = 0;
                colunas.forEach(col => { 
                    const v = dadosDaClasse[col]?.departamentos[dep]?.categorias[cat]?.fornecedores[forn]?.total || 0; 
                    totF += v; 
                    rF.insertCell().textContent = formatarValor(v); 
                });
                rF.insertCell().textContent = formatarValor(totF);
            });
        });
    });
}

// ------ 3. Capital de Giro ------
export function renderizarCapitalGiro(cg, colunas, estoque) {
    const t = document.getElementById('tabelaCapitalGiro');
    if (!t || !colunas.length || !cg) return;

    t.innerHTML = ''; 
    const thead = t.createTHead();
    const trH = thead.insertRow();
    trH.innerHTML = `<td>Capital de Giro</td>${colunas.map(c => `<td>${c}</td>`).join('')}<td></td>`;
    
    const tb = t.createTBody();
    criarLinhaEspacadora(tb, colunas);

    // Calcula porcentagens de Curto/Longo prazo em tempo de renderização
    const pcts = {
        'Curto Prazo AR %': {}, 'Longo Prazo AR %': {},
        'Curto Prazo AP %': {}, 'Longo Prazo AP %': {}
    };

    const calcPct = (tipo) => {
        colunas.forEach(c => {
            const curto = cg[`Curto Prazo ${tipo}`]?.[c] || 0;
            const longo = cg[`Longo Prazo ${tipo}`]?.[c] || 0;
            const tot = curto + longo;
            pcts[`Curto Prazo ${tipo} %`][c] = tot ? (curto / tot) * 100 : 0;
            pcts[`Longo Prazo ${tipo} %`][c] = tot ? (longo / tot) * 100 : 0;
        });
    };
    calcPct('AR'); 
    calcPct('AP');

    const add = (lbl, key, isPct, type, indent) => {
        const r = tb.insertRow();
        if(type) r.dataset.type = type;
        if(indent) r.dataset.indent = '1';
        
        r.insertCell().textContent = lbl;
        
        colunas.forEach(c => {
            let v = 0;
            if (key === 'Estoque') v = estoque?.['(+) Estoque']?.[c] ?? 0;
            else if (isPct) v = pcts[key]?.[c] ?? 0;
            else v = cg[key]?.[c] ?? 0;
            
            r.insertCell().textContent = isPct && v !== 0 ? formatarPercentual(v) : formatarValor(v);
        });
        r.insertCell(); // Coluna TOTAL vazia para CG
    };
    
    const spc = () => criarLinhaEspacadora(tb, colunas);

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
        const valLiq = (cg['Capital Liquido']?.[c] ?? 0) + (estoque?.['(+) Estoque']?.[c] ?? 0);
        rF.insertCell().textContent = formatarValor(valLiq);
    });
    rF.insertCell();
}

// ------ Gráficos ------
export function renderizarGraficos(dadosConsolidados, colunas) {
    if (!dadosConsolidados?.dre || !window.Chart) return;
    
    let l=[], s=[], r=[], p=[], accR=0, accP=0, rAc=[], pAc=[];

    colunas.forEach(c => {
        const valSaldo = dadosConsolidados.dre['Caixa Final']?.[c];
        const sv = (valSaldo === undefined || valSaldo === null) ? null : valSaldo;

        const valEntrada = dadosConsolidados.entradasSaidas['(+) Entradas']?.[c];
        const rv = (valEntrada === undefined || valEntrada === null) ? null : valEntrada;

        const valSaida = dadosConsolidados.entradasSaidas['(-) Saídas']?.[c];
        // Saídas são negativas na nova estrutura, convertemos para positivo no gráfico
        const pv = (valSaida === undefined || valSaida === null) ? null : Math.abs(valSaida);
        
        l.push(c);
        s.push(sv);
        r.push(rv);
        p.push(pv);

        if (rv !== null) { accR += rv; rAc.push(accR); } else { rAc.push(null); }
        if (pv !== null) { accP += pv; pAc.push(accP); } else { pAc.push(null); }
    });

    const common = (tit) => ({
        responsive: true, maintainAspectRatio: false, spanGaps: false,
        plugins: { 
            title: {display:true, text:tit, font:{size:16}}, 
            legend:{position:'bottom'},
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) label += ': ';
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

    const VERDE = '#28a745';
    const VERMELHO = '#dc3545';

    let optSaldo = common('Saldo de Caixa (R$)');
    optSaldo.plugins.legend = {display:false};
    
    createChart('graficoSaldoCaixa', 'saldoCaixa', {
        type: 'line', 
        data: { 
            labels:l, 
            datasets: [{ 
                label: 'Saldo', data:s, tension:0.3, pointRadius: 4, pointHoverRadius: 6,
                pointBackgroundColor: (ctx) => ctx.parsed.y < 0 ? VERMELHO : VERDE,
                pointBorderColor: (ctx) => ctx.parsed.y < 0 ? VERMELHO : VERDE,
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

    createChart('graficoRecebientoPagamentoAcumulado', 'acumulado', {
        type: 'line', 
        data: { 
            labels:l, 
            datasets:[
                { label:'Entradas', data:rAc, borderColor: VERDE, backgroundColor:'rgba(40, 167, 69, 0.2)', fill:true, tension:0.3, pointRadius: 3 },
                { label:'Saídas', data:pAc, borderColor: VERMELHO, backgroundColor:'rgba(220, 53, 69, 0.2)', fill:true, tension:0.3, pointRadius: 3 }
            ]
        }, 
        options: common('Evolução (R$)')
    });

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
export function configurarAbasGraficos() {
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
export function renderizarFluxoDiario(fluxoDiario, colunas, saldoIni, projecao) {
    const tb = document.getElementById('tabelaFluxoDiario');
    if (!tb || !colunas || !colunas.length) return;
    tb.textContent = '';
    
    const isAnual = colunas[0].length === 4;
    const colSet = new Set(colunas);
    const dados = [];
    
    fluxoDiario.forEach(x => {
        if (!x.data) return;
        const parts = x.data.split('/');
        const mes = parts[1];
        const ano = parts[2];
        const k = `${mes}-${ano}`;
        
        if (isAnual) {
            if (colSet.has(ano)) dados.push({...x, k});
        } else {
            if (colSet.has(k)) dados.push({...x, k});
        }
    });

    const tbody = tb.createTBody();
    const thead = tb.createTHead();
    const trH = thead.insertRow();
    
    const thData = document.createElement('th'); thData.innerHTML = `Data`; trH.appendChild(thData);
    ['Descrição', 'Valor (R$)', 'Saldo (R$)'].forEach(t => {
        const th = document.createElement('th'); th.textContent = t; trH.appendChild(th);
    });

    let iniVis = isAnual ? `01-${colunas[0]}` : colunas[0];
    let fimVis = isAnual ? `12-${colunas[colunas.length - 1]}` : colunas[colunas.length - 1];

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
    const compKeys = (a, b) => {
        if(!a||!b) return 0;
        const [ma, aa] = a.split('-').map(Number), [mb, ab] = b.split('-').map(Number);
        return aa !== ab ? aa - ab : ma - mb;
    };

    itens.forEach(x => { if(compKeys(x.k, ini) < 0) s += x.valor; });

    const rS = tbody.insertRow();
    rS.innerHTML = `<td></td><td><b>Saldo Inicial</b></td><td></td><td style="text-align:right"><b>${formatarValor(s, 2)}</b></td>`;

    visiveis.forEach(i => {
        s += i.valor;
        const r = tbody.insertRow();
        const obs = i.obs ? ` <span class="tooltip-target" data-tooltip="${i.obs}">ℹ️</span>` : '';
        r.innerHTML = `<td>${i.data}</td><td>${i.descricao}${obs}</td><td style="text-align:right">${formatarValor(i.valor, 2)}</td><td style="text-align:right">${formatarValor(s, 2)}</td>`;
    });
}

// ------ Fluxo Diário Resumido -----
export function renderizarFluxoDiarioResumido(linhaCaixaIni, linhaCaixaFim, es, colunas) { 
    const tabela = document.getElementById('resumoFluxoCaixa');
    if (!tabela) return;

    const colunasProcessar = [...colunas, 'TOTAL'];
    let htmlHeader = `<thead><tr><th>Resumo Financeiro</th>${colunasProcessar.map(c => `<th>${c}</th>`).join('')}</tr></thead>`;

    let cellsEntradas = [], cellsSaidas = [], cellsBalanco = [], cellsSaldoIni = [], cellsSaldoFim = [];

    colunasProcessar.forEach(col => {
        const isTotal = col === 'TOTAL';
        const vEntradas = (es['(+) Entradas']?.[col] || 0);
        const vSaidas = (es['(-) Saídas']?.[col] || 0); 
        const vBalanco = vEntradas + vSaidas;

        const valSaldoIni = linhaCaixaIni[col] || 0;
        const valSaldoFim = linhaCaixaFim[col] || 0;

        const styleCell = isTotal ? 'font-weight:bold;text-align:right;' : 'text-align:right;';
        const classeBalanco = vBalanco >= 0 ? 'texto-verde' : 'texto-vermelho';

        cellsEntradas.push(`<td class="texto-verde" style="${styleCell}">${formatarValor(vEntradas)}</td>`);
        cellsSaidas.push(`<td class="texto-vermelho" style="${styleCell}">${formatarValor(vSaidas)}</td>`);
        cellsBalanco.push(`<td class="${classeBalanco}" style="${styleCell} font-weight:bold">${formatarValor(vBalanco)}</td>`);
        cellsSaldoIni.push(`<td style="${styleCell}">${formatarValor(valSaldoIni)}</td>`);
        cellsSaldoFim.push(`<td style="${styleCell}">${formatarValor(valSaldoFim)}</td>`);
    });

    const htmlBody = `
        <tbody>
            <tr><td colspan="${colunasProcessar.length + 1}" style="height:30px; padding:0; background:transparent; border:none;"></td></tr>
            <tr><td class="texto-verde">(+) Entradas</td>${cellsEntradas.join('')}</tr>
            <tr><td class="texto-vermelho">(-) Saídas</td>${cellsSaidas.join('')}</tr>
            <tr><td class="texto-azul">(=) Balanço</td>${cellsBalanco.join('')}</tr>
            <tr><td colspan="${colunasProcessar.length + 1}" style="height:30px; padding:0; background:transparent; border:none;"></td></tr>
            <tr data-type="saldo"><td>Caixa Inicial</td>${cellsSaldoIni.join('')}</tr>
            <tr data-type="saldo"><td>Caixa Final</td>${cellsSaldoFim.join('')}</tr>
        </tbody>
    `;

    tabela.innerHTML = htmlHeader + htmlBody;
}

// ------ Placeholders ------
export function renderizarColunasPlaceholder(colunasVazias, idsTabelas) {
    if (!colunasVazias || colunasVazias.length === 0) return;

    idsTabelas.forEach(id => {
        const tabela = document.getElementById(id);
        if (!tabela) return;

        const thead = tabela.tHead;
        if (thead) {
            Array.from(thead.rows).forEach(row => {
                const cells = row.cells;
                if (cells.length === 1 && cells[0].hasAttribute('colspan')) {
                    cells[0].setAttribute('colspan', (parseInt(cells[0].getAttribute('colspan')) || 1) + colunasVazias.length);
                    return;
                }
                const indexTotal = cells.length - 1;
                if (indexTotal < 0) return;
                
                const cellTotal = cells[indexTotal];
                const cellAnterior = indexTotal > 0 ? cells[indexTotal - 1] : null;

                colunasVazias.forEach(nome => {
                    const th = document.createElement('th');
                    th.textContent = nome;
                    if (cellAnterior) { th.className = cellAnterior.className; th.style.cssText = cellAnterior.style.cssText; }
                    row.insertBefore(th, cellTotal);
                });
            });
        }

        Array.from(tabela.tBodies).forEach(tbody => {
            Array.from(tbody.rows).forEach(row => {
                const cells = row.cells;
                const primeiroColspan = cells.length > 0 && cells[0].hasAttribute('colspan') ? parseInt(cells[0].getAttribute('colspan')) : 1;

                if (cells.length === 1 && primeiroColspan > 1) {
                    cells[0].setAttribute('colspan', primeiroColspan + colunasVazias.length);
                    return;
                }

                const indexTotal = cells.length - 1;
                if (indexTotal < 0) return;

                const cellTotal = cells[indexTotal];
                const cellAnterior = indexTotal > 0 ? cells[indexTotal - 1] : null;

                colunasVazias.forEach(() => {
                    const td = document.createElement('td');
                    td.textContent = '-'; 
                    if (cellAnterior) {
                        td.className = cellAnterior.className;
                        td.style.cssText = cellAnterior.style.cssText;
                        td.classList.remove('texto-verde', 'texto-vermelho', 'texto-azul');
                        if (td.style.color) td.style.color = '';
                    } 
                    if (!td.style.textAlign) td.style.textAlign = 'right';
                    row.insertBefore(td, cellTotal);
                });
            });
        });
    });
}