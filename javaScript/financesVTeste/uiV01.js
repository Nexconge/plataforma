// uiV022.js
// Responsabilidade: Manipulação do DOM, Renderização de Tabelas e Gráficos.

// --- Estado Local de UI ---
let graficosInstances = {};
let chartJsLoaded = false;

// --- Formatadores ---
const formatCurrency = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const formatPct = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmtValor(v) { 
    if (Math.abs(v) < 0.01) return '-';
    return v < 0 ? `(${formatCurrency.format(Math.abs(v))})` : formatCurrency.format(v);
}
function fmtPct(v) { return v ? `${formatPct.format(v)}%` : '0,0%'; }

// --- Controles de Loading e Filtros ---

export function alternarLoading(ativo) {
    document.body.classList.toggle('app-loading', ativo);
    const inputs = document.querySelectorAll('select, button, input');
    inputs.forEach(el => {
        el.disabled = ativo;
        if(ativo) el.style.opacity = '0.6'; else el.style.opacity = '1';
    });
}

export function lerFiltrosUI() {
    const getVal = id => document.getElementById(id)?.value;
    const getMulti = id => Array.from(document.getElementById(id)?.selectedOptions || []).map(o => o.value);
    
    const modo = getVal('modoSelect');
    const ano = getVal('anoSelect');
    
    if(!modo || !ano) return null;

    // Gera colunas baseado no modo
    let colunas = [];
    let anosQuery = [];
    
    if (modo === 'mensal') {
        anosQuery = [ano];
        colunas = Array.from({length: 12}, (_, i) => `${String(i+1).padStart(2,'0')}-${ano}`);
    } else {
        // Modo anual (exibe bloco de 6 anos)
        const anoBase = Number(ano);
        anosQuery = Array.from({length: 6}, (_, i) => String(anoBase + i));
        colunas = [...anosQuery];
    }

    return {
        modo,
        anos: anosQuery,
        colunas, // Períodos visíveis na tabela (MM-YYYY ou YYYY)
        projetos: getMulti('projSelect'),
        contas: getMulti('contaSelect')
    };
}

export function preencherSelectsIniciais(mapas, callbackChange) {
    const elProj = document.getElementById('projSelect');
    const elConta = document.getElementById('contaSelect');
    const elModo = document.getElementById('modoSelect');
    const elAno = document.getElementById('anoSelect');

    // Popula Projetos
    elProj.innerHTML = '';
    [...mapas.projetos.entries()]
        .sort((a,b) => a[1].nome.localeCompare(b[1].nome))
        .forEach(([cod, p]) => elProj.add(new Option(p.nome, cod)));
    if(elProj.options.length) elProj.options[0].selected = true;

    // Eventos
    elProj.onchange = () => {
        atualizarContasDisponiveis(elConta, mapas, Array.from(elProj.selectedOptions).map(o=>o.value));
        callbackChange();
    };
    elConta.onchange = callbackChange;
    elModo.onchange = () => {
        atualizarSelectAnos(elAno, null, null, elModo.value); // Reset range
        callbackChange();
    };
    elAno.onchange = callbackChange;

    // Setup inicial
    atualizarContasDisponiveis(elConta, mapas, [elProj.value]);
    atualizarSelectAnos(elAno, new Date().getFullYear(), new Date().getFullYear(), 'mensal');
}

function atualizarContasDisponiveis(select, mapas, projetosIds) {
    const contasPermitidas = new Set();
    projetosIds.forEach(pid => {
        mapas.projetos.get(pid)?.contas.forEach(c => contasPermitidas.add(c));
    });

    select.innerHTML = '';
    [...mapas.contas.entries()]
        .filter(([id]) => contasPermitidas.has(id))
        .sort((a,b) => a[1].descricao.localeCompare(b[1].descricao))
        .forEach(([id, c]) => {
            const opt = new Option(c.descricao, id);
            opt.selected = true;
            select.add(opt);
        });
}

export function atualizarSelectAnos(select, minAno, maxAno, modo) {
    const atual = select.value;
    const hoje = new Date().getFullYear();
    const inicio = minAno || hoje;
    const fim = Math.max(maxAno || hoje, hoje + 5); // Garante pelo menos 5 anos futuros

    select.innerHTML = '';
    
    if (modo === 'mensal') {
        for(let y = inicio; y <= fim; y++) select.add(new Option(y, y));
    } else {
        for(let y = inicio; y <= fim; y += 6) select.add(new Option(`${y} a ${y+5}`, y));
    }
    
    // Tenta manter seleção ou define padrão
    if ([...select.options].some(o => o.value === atual)) select.value = atual;
    else select.value = select.options[0].value;
}

// --- Renderização Principal ---

// --- Auxiliar de Toggle (Interatividade) ---
window.toggleLinha = function(id) {
    const pai = document.getElementById(id);
    const btn = pai.querySelector('.btn-toggle');
    const estadoAtual = btn.textContent === '[+]';
    
    // Alterna ícone
    btn.textContent = estadoAtual ? '[-]' : '[+]';
    
    // Busca todos os filhos diretos e indiretos
    const todosFilhos = document.querySelectorAll(`[data-parent="${id}"]`);
    todosFilhos.forEach(filho => {
        if (estadoAtual) {
            // Abrindo: Mostra apenas os filhos diretos
            if (filho.classList.contains('nivel-direto')) filho.style.display = 'table-row';
        } else {
            // Fechando: Esconde tudo recursivamente e reseta os botões internos
            filho.style.display = 'none';
            const btnInterno = filho.querySelector('.btn-toggle');
            if (btnInterno) btnInterno.textContent = '[+]';
        }
    });
};

export function renderizarTudo(dados, colunas, userType, projecao) {
    renderizarDRE(dados.matrizDRE, colunas, userType);
    renderizarDetalhamento(dados.matrizDetalhamento, colunas, dados.entradasESaidas, userType);
    renderizarCapitalGiro(dados.matrizCapitalGiro, colunas, dados.dadosEstoque);
    renderizarFluxo(dados.fluxoDeCaixa, colunas, dados.matrizDRE['Caixa Inicial']?.TOTAL || 0);
    renderizarGraficos(dados, colunas);
}

// 1. Tabela DRE
function renderizarDRE(matriz, colunas, userType) {
    const tbody = initTable('tabelaMatriz', colunas, 'Fluxo de Caixa');
    if (!tbody) return;

    const linhas = [
        '(+) Receita Bruta', '(-) Deduções', '(=) Receita Líquida', 
        '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL', 
        '(+/-) Geração de Caixa Operacional', 
        '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', 
        '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios', 
        '(=) Movimentação de Caixa Mensal'
    ];
    
    // Developer vê linhas extras de debug/transferência
    if (userType === 'developer') linhas.push('Entrada de Transferência', 'Saída de Transferência', 'Outros');
    linhas.push('Caixa Inicial', 'Caixa Final');

    linhas.forEach(chave => {
        const row = tbody.insertRow();
        row.insertCell().textContent = chave;
        colunas.forEach(c => row.insertCell().textContent = fmtValor(matriz[chave]?.[c] || 0));
        row.insertCell().textContent = fmtValor(matriz[chave]?.TOTAL || 0);

        // Estilização baseada no nome
        if (chave.startsWith('(=)') || chave.includes('Geração')) row.classList.add('row-total');
        if (chave.includes('Caixa I') || chave.includes('Caixa F')) row.classList.add('row-saldo');
        if (chave.startsWith('(-)')) row.classList.add('row-deduction');
    });
}

// 2. Tabela Detalhamento (Drill-down)
function renderizarDetalhamento(matriz, colunas, es, userType) {
    const tbody = initTable('tabelaCustos', colunas, 'Detalhamento');
    if (!tbody) return;

    // Agrupamento Inicial
    const grupos = {};
    Object.keys(matriz).forEach(key => {
        const [classe, periodo] = key.split('|');
        if (!grupos[classe]) grupos[classe] = {};
        grupos[classe][periodo] = matriz[key];
    });

    Object.keys(grupos).sort().forEach((classe, idx) => {
        const idClasse = `c-${idx}`;
        
        // 1. Renderiza Linha Mestra (Classe)
        criarLinhaInterativa(tbody, idClasse, null, classe, grupos[classe], colunas, 0);

        // Prepara dados para recursão (Departamentos -> Categorias -> Fornecedores)
        // Isso consolida os dados de todos os meses para saber quais filhos existem
        const arvore = consolidarArvore(grupos[classe], colunas);

        Object.keys(arvore).sort().forEach((depto, iD) => {
            const idDepto = `${idClasse}-d-${iD}`;
            criarLinhaInterativa(tbody, idDepto, idClasse, depto, grupos[classe], colunas, 1, 'departamentos', depto);

            Object.keys(arvore[depto]).sort().forEach((cat, iC) => {
                const idCat = `${idDepto}-c-${iC}`;
                // Precisamos buscar o nome da categoria no AppState ou passar o mapa aqui. 
                // Assumindo 'cat' como código ou nome.
                criarLinhaInterativa(tbody, idCat, idDepto, cat, grupos[classe], colunas, 2, 'categorias', depto, cat);

                arvore[depto][cat].forEach((forn, iF) => {
                    const idForn = `${idCat}-f-${iF}`;
                    criarLinhaInterativa(tbody, idForn, idCat, forn, grupos[classe], colunas, 3, 'fornecedores', depto, cat, forn);
                });
            });
        });
    });
}

function criarLinhaInterativa(tbody, id, parentId, label, dadosPeriodos, colunas, nivel, tipoSub = null, ...path) {
    const row = tbody.insertRow();
    row.id = id;
    if (parentId) {
        row.setAttribute('data-parent', parentId);
        row.style.display = 'none'; // Começa fechado
        if (nivel === 1) row.classList.add('nivel-direto'); // Marcador para o toggle do pai saber que é filho direto
        if (nivel > 1) row.classList.remove('nivel-direto');
    }

    const padding = nivel * 20;
    const temFilhos = nivel < 3; // Nível 3 é fornecedor (folha)
    const btnHTML = temFilhos ? `<span class="btn-toggle" style="cursor:pointer; font-family:monospace; margin-right:5px">[+]</span>` : '';
    
    // Célula de Nome
    const cellNome = row.insertCell();
    cellNome.innerHTML = `<div style="padding-left:${padding}px">${btnHTML}${label}</div>`;
    if (temFilhos) cellNome.onclick = () => window.toggleLinha(id);

    // Células de Valores
    let totalRow = 0;
    colunas.forEach(col => {
        let val = 0;
        const root = dadosPeriodos[col];
        
        if (root) {
            if (nivel === 0) val = root.total;
            else if (nivel === 1) val = root.departamentos?.[path[0]]?.total || 0;
            else if (nivel === 2) val = root.departamentos?.[path[0]]?.categorias?.[path[1]]?.total || 0;
            else if (nivel === 3) val = root.departamentos?.[path[0]]?.categorias?.[path[1]]?.fornecedores?.[path[2]]?.total || 0;
        }
        
        totalRow += val;
        row.insertCell().textContent = fmtValor(val);
    });
    row.insertCell().textContent = fmtValor(totalRow);
}

function consolidarArvore(dadosPeriodos, colunas) {
    const arvore = {};
    colunas.forEach(col => {
        const d = dadosPeriodos[col]?.departamentos || {};
        Object.keys(d).forEach(depto => {
            if (!arvore[depto]) arvore[depto] = {};
            const cats = d[depto].categorias || {};
            Object.keys(cats).forEach(cat => {
                if (!arvore[depto][cat]) arvore[depto][cat] = new Set();
                const forns = cats[cat].fornecedores || {};
                Object.keys(forns).forEach(f => arvore[depto][cat].add(f));
            });
        });
    });
    // Converte Sets para Arrays
    Object.keys(arvore).forEach(d => {
        Object.keys(arvore[d]).forEach(c => {
            arvore[d][c] = Array.from(arvore[d][c]).sort();
        });
    });
    return arvore;
}

// 3. Tabela Capital de Giro
function renderizarCapitalGiro(matriz, colunas, estoque) {
    const tbody = initTable('tabelaCapitalGiro', colunas, 'Capital de Giro');
    if (!tbody) return;

    const addRow = (label, key, isPct = false) => {
        const r = tbody.insertRow();
        r.insertCell().textContent = label;
        colunas.forEach(c => {
            let val = matriz[key]?.[c] || 0;
            if(key === 'Estoque') val = estoque?.['(+) Estoque']?.[c] || 0;
            r.insertCell().textContent = isPct ? fmtPct(val) : fmtValor(val);
        });
        r.insertCell(); // Coluna Total vazia
    };

    addRow('(+) Caixa', '(+) Caixa');
    tbody.insertRow().innerHTML = '<td colspan="100" class="spacer"></td>';
    addRow('(+) Clientes a Receber', '(+) Clientes a Receber');
    addRow('Curto Prazo', 'Curto Prazo AR');
    addRow('Longo Prazo', 'Longo Prazo AR');
    
    if (estoque) {
        tbody.insertRow().innerHTML = '<td colspan="100" class="spacer"></td>';
        addRow('(+) Estoque', 'Estoque');
    }

    tbody.insertRow().innerHTML = '<td colspan="100" class="spacer"></td>';
    addRow('(-) Fornecedores a Pagar', '(-) Fornecedores a Pagar');
    addRow('(=) Capital Líquido', 'Capital Liquido');
}

// 4. Gráficos (Chart.js)
async function renderizarGraficos(dados, colunas) {
    if (typeof Chart === 'undefined') return;

    const ctx = document.getElementById('graficoSaldoCaixa');
    if (!ctx) return;

    if (graficosInstances.saldo) graficosInstances.saldo.destroy();

    const labels = colunas;
    const dataSaldo = colunas.map(c => dados.matrizDRE['Caixa Final']?.[c] || 0);

    graficosInstances.saldo = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Saldo de Caixa',
                data: dataSaldo,
                borderColor: '#28a745',
                tension: 0.4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderizarFluxo(fluxo, colunas, saldoInicial) {
    // Implementação simplificada do renderizador de lista
    const tbody = document.getElementById('tabelaFluxoDiario')?.querySelector('tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    let saldo = saldoInicial;
    // Filtra apenas o range visível nas colunas
    // (Assumindo que fluxo já vem ordenado do processing)
    
    fluxo.forEach(item => {
        saldo += item.valor;
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${item.data}</td>
            <td>${item.descricao} <small>${item.obs || ''}</small></td>
            <td class="${item.valor < 0 ? 'text-danger' : 'text-success'}">${fmtValor(item.valor)}</td>
            <td><b>${fmtValor(saldo)}</b></td>
        `;
    });
}

// Helpers
function initTable(id, colunas, tituloHeader) {
    const table = document.getElementById(id);
    if (!table) return null;
    table.innerHTML = '';
    
    const thead = table.createTHead();
    const row = thead.insertRow();
    row.insertCell().textContent = tituloHeader;
    colunas.forEach(c => row.insertCell().textContent = c);
    row.insertCell().textContent = 'TOTAL';
    
    return table.createTBody();
}