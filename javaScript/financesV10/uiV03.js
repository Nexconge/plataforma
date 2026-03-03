// uiV09.js Refatorado

// ------ Estado Global ------
let graficosAtuais = { saldoCaixa: null, acumulado: null, mensal: null };
let chartJsPromise = null;
const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const EstadoData = {
    minDataDisponivel: null, // 'MM-YYYY'
    maxDataDisponivel: null, // 'MM-YYYY'
    selecaoInicio: null,     // 'MM-YYYY' ou 'YYYY'
    selecaoFim: null,        // 'MM-YYYY' ou 'YYYY'
    callbackMudanca: null
};

// --- Funções de estado ----
function usarNovoRangePicker(userType) {
    if (!userType) return false;
    const tiposAvancados = ['developer']; 
    return tiposAvancados.includes(userType.toLowerCase());
}

// --- Funções Auxiliares de Data para UI ---
function parseDataStr(str) {
    if (!str) return { m: 1, a: new Date().getFullYear() };
    const [m, a] = str.includes('-') ? str.split('-').map(Number) : [1, Number(str)];
    return { m, a };
}
function compStrData(a, b) {
    const dA = parseDataStr(a);
    const dB = parseDataStr(b);
    return dA.a !== dB.a ? dA.a - dB.a : dA.m - dB.m;
}
function gerarColunasPeloIntervalo(inicio, fim, modo) {
    const lista = [];
    const i = parseDataStr(inicio);
    const f = parseDataStr(fim);
    
    let currA = i.a;
    let currM = i.m;

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
        // No modo anual antigo, selecionar a base "2026" significa ver 6 anos (2026 a 2031)
        EstadoData.selecaoInicio = `${ano}`;
        EstadoData.selecaoFim = `${parseInt(ano) + 5}`;
    }
}
function executarValidacaoRangeNovo(minAno, margemFim, modo) {
    let anoSelInicio = 0;
    let anoSelFim = 0;

    if (EstadoData.selecaoInicio) {
        const p = EstadoData.selecaoInicio.split('-');
        anoSelInicio = parseInt(p.length === 2 ? p[1] : p[0]);
    }
    if (EstadoData.selecaoFim) {
        const p = EstadoData.selecaoFim.split('-');
        anoSelFim = parseInt(p.length === 2 ? p[1] : p[0]);
    } else {
        anoSelFim = anoSelInicio;
    }

    let mudou = false;

    if (anoSelInicio < minAno) {
        anoSelInicio = minAno;
        anoSelFim = Math.max(anoSelFim, minAno);
        mudou = true;
    }
    if (anoSelInicio > margemFim) {
        anoSelInicio = margemFim;
        anoSelFim = margemFim;
        mudou = true;
    }
    if (anoSelFim > margemFim) {
        anoSelFim = margemFim;
        if (anoSelInicio > anoSelFim) anoSelInicio = anoSelFim;
        mudou = true;
    }

    if (mudou) {
        if (modo.toLowerCase() === 'mensal') {
            EstadoData.selecaoInicio = `01-${anoSelInicio}`;
            EstadoData.selecaoFim = `12-${anoSelInicio}`; 
        } else {
            EstadoData.selecaoInicio = `${anoSelInicio}`;
            EstadoData.selecaoFim = `${anoSelFim}`; 
        }
    }
}

// ------ Formatação ------
function formatarValor(valor, fractionDigits = 0) {
    if (Math.abs(valor) < 0.01) return '-';
    const num = Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
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
    const { userType } = appCache;
    const usaNovo = usarNovoRangePicker(userType);
    
    // 1. Configura Limites Iniciais
    const anoAtual = new Date().getFullYear();
    EstadoData.minDataDisponivel = `01-${Math.min(...anosDisp.map(Number), anoAtual)}`;
    EstadoData.maxDataDisponivel = `12-${Math.max(...anosDisp.map(Number), anoAtual)}`;
    EstadoData.callbackMudanca = callback;

    const el = {
        proj: document.getElementById('projSelect'),
        conta: document.getElementById('contaSelect'),
        modo: document.getElementById('modoSelect'),
        pickerBtn: document.getElementById('globalDatePickerBtn'), // Novo
        anoSelect: document.getElementById('anoSelect')           // Antigo
    };

    // --- Lógica de Visibilidade ---
    if (usaNovo) {
        if (el.pickerBtn) el.pickerBtn.style.display = 'inline-block';
        if (el.anoSelect) el.anoSelect.style.display = 'none';
        // Remove label antiga se estiver solta no HTML (opcional, depende do seu HTML)
    } else {
        if (el.pickerBtn) el.pickerBtn.style.display = 'none';
        if (el.anoSelect) el.anoSelect.style.display = 'inline-block';
    }

    // 2. Listeners Comuns
    const btnARealizar = document.getElementById('btnARealizar');
    const btnRealizado = document.getElementById('btnRealizado');

    const setProj = (t) => {
        appCache.projecao = t;
        const divCG = document.getElementById('groupCapitalGiro');
        if(divCG) divCG.style.display = (t === "arealizar") ? "none" : "";
        callback();
    };

    if(btnARealizar) btnARealizar.onclick = () => setProj("arealizar");
    if(btnRealizado) btnRealizado.onclick = () => setProj("realizado");
    
    el.conta.onchange = callback;
    
    el.proj.onchange = () => {
        atualizarFiltroContas(el.conta, appCache.projetosMap, appCache.contasMap, getSelectItems(el.proj));
        callback();
    };
    
    el.modo.onchange = () => {
        // Ao mudar o modo, reseta a seleção para evitar inconsistências
        resetarSelecaoPeloModo(el.modo.value, usaNovo);
        
        if (usaNovo) {
            renderizarComponenteFiltro();
        } else {
            // No modo antigo, mudar Anual/Mensal apenas dispara o callback, 
            // pois o valor do Select (ex: 2026) serve para os dois modos.
            // Mas precisamos sincronizar o EstadoData:
            sincronizarEstadoComSelectAntigo(el.anoSelect.value, el.modo.value);
        }
        callback();
    };

    // 3. Listener Específico do Filtro Antigo
    if (!usaNovo && el.anoSelect) {
        el.anoSelect.onchange = () => {
            const anoSelecionado = el.anoSelect.value;
            const modoAtual = el.modo.value;
            
            // MAGIA AQUI: Converte "2026" para o formato de range que o sistema novo espera
            sincronizarEstadoComSelectAntigo(anoSelecionado, modoAtual);
            
            callback();
        };
    }

    // 4. Inicialização
    resetarSelecaoPeloModo(el.modo.value || 'mensal', usaNovo);
    
    // Popula Projetos
    el.proj.innerHTML = '';
    Array.from(appCache.projetosMap.entries())
        .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
        .forEach(([cod, { nome }]) => el.proj.appendChild(new Option(nome, cod)));
    
    if (el.proj.options.length) el.proj.options[0].selected = true;
    
    // Atualiza contas e dispara fluxo inicial
    atualizarFiltroContas(el.conta, appCache.projetosMap, appCache.contasMap, getSelectItems(el.proj));
    
    // Renderiza UI inicial (Texto do botão OU Opções do Select)
    // Passamos userType para dentro da função de atualização saber o que fazer
    EstadoData.userTypeAtual = userType;

    if (!usaNovo) {
        // Popula inicial com o range real disponível, e não apenas o ano atual
        const ano = new Date().getFullYear();
        const minDisp = Math.min(...anosDisp.map(Number), ano);
        const maxDisp = Math.max(...anosDisp.map(Number), ano);
        atualizarOpcoesAnoSelect(null, minDisp, maxDisp, el.modo.value, appCache.projecao);
    } else {
        renderizarComponenteFiltro(); 
    }
    
    carregarChartJs();
    configurarAbasGraficos();
    callback();
}
function resetarSelecaoPeloModo(modo, usaNovo = true) {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    
    if (usaNovo) {
        if (modo.toLowerCase() === 'mensal') {
            EstadoData.selecaoInicio = `01-${ano}`;
            EstadoData.selecaoFim = `12-${ano}`;
        } else {
            EstadoData.selecaoInicio = `${ano}`;
            EstadoData.selecaoFim = `${ano + 5}`;
        }
    } else {
        // Modo antigo: Resetar significa apenas garantir que o ano atual está no EstadoData
        sincronizarEstadoComSelectAntigo(ano, modo);
    }
}

function atualizarOpcoesAnoSelect(dummy, minAno, maxAno, modo, projecao) {
    const usaNovo = usarNovoRangePicker(EstadoData.userTypeAtual);
    
    // Calcula Margem (igual para ambos)
    const margemFim = projecao === 'arealizar' ? Math.max(maxAno, new Date().getFullYear() + 5) : maxAno;
    
    // Atualiza limites globais
    EstadoData.minDataDisponivel = `01-${minAno}`;
    EstadoData.maxDataDisponivel = `12-${margemFim}`;

    if (usaNovo) {
        // ================= CAMINHO NOVO (Range Picker) =================
        executarValidacaoRangeNovo(minAno, margemFim, modo);
        renderizarComponenteFiltro();

    } else {
        // ================= CAMINHO ANTIGO (Select Box) =================
        const select = document.getElementById('anoSelect');
        if (!select) return;

        // 1. Salva valor atual para tentar manter
        const valorAtual = select.value;
        select.innerHTML = '';
        
        // 2. Constrói as opções com base no modo
        if (modo.toLowerCase() === 'mensal') {
            for (let y = minAno; y <= margemFim; y++) {
                select.appendChild(new Option(String(y), String(y)));
            }
            // Mantém a seleção ou vai pro limite padrão
            if (valorAtual && Array.from(select.options).some(o => o.value === valorAtual)) {
                select.value = valorAtual;
            } else {
                select.value = String(projecao === "realizado" ? margemFim : minAno);
            }
        } else {
            // Modo Anual: Cria blocos de 6 anos usando o formato antigo
            for (let cursor = minAno; cursor <= margemFim; cursor += 6) {
                // prepend para a ordem decrescente que você usava, ou append se preferir normal
                select.prepend(new Option(`${cursor} até ${cursor + 5}`, String(cursor)));
            }
            // Mantém a seleção ou vai pro limite padrão
            if (valorAtual && Array.from(select.options).some(o => o.value === valorAtual)) {
                select.value = valorAtual;
            } else {
                select.value = select.options[projecao === "realizado" ? 0 : select.options.length - 1].value;
            }
        }

        // 3. CRUCIAL: Sincroniza o EstadoData com o valor que acabou de ser selecionado/recalculado
        sincronizarEstadoComSelectAntigo(select.value, modo);
    }
}
function renderizarComponenteFiltro() {
    const btn = document.getElementById('globalDatePickerBtn');
    if (!btn) return;

    // Atualiza texto do botão
    const textoPeriodo = (EstadoData.selecaoInicio === EstadoData.selecaoFim || !EstadoData.selecaoFim) 
        ? EstadoData.selecaoInicio 
        : `${EstadoData.selecaoInicio} até ${EstadoData.selecaoFim}`;
    
    btn.textContent = `${textoPeriodo}`;
    
    // Remove dropdown anterior se existir
    const oldDrop = document.getElementById('globalDateDropdown');
    if (oldDrop) oldDrop.remove();

    // Cria Dropdown
    const drop = document.createElement('div');
    drop.id = 'globalDateDropdown';
    drop.className = 'filtro-dropdown'; 
    drop.style.display = 'none';
    
    // Anexa ao BODY (fora do container do Bubble)
    document.body.appendChild(drop);

    // Evento de Click no Botão
    btn.onclick = (e) => {
        e.stopPropagation();
        
        if (drop.style.display === 'block') {
            drop.style.display = 'none';
            return;
        }

        document.querySelectorAll('.filtro-dropdown').forEach(d => d.style.display = 'none'); 

        montarGridCalendario(drop);
        
        // --- CÁLCULO DE POSIÇÃO FIXA ---
        const rect = btn.getBoundingClientRect();

        drop.style.position = 'fixed'; 
        drop.style.top = `${rect.bottom + 5}px`; 
        drop.style.left = `${rect.left}px`;       
        drop.style.zIndex = '2147483647';         
        drop.style.display = 'block';
    };

    // Fecha ao clicar fora
    const closeListener = (e) => {
        if (drop.style.display === 'block' && !btn.contains(e.target) && !drop.contains(e.target)) {
            drop.style.display = 'none';
        }
    };
    
    // --- Scroll Inteligente ---
    const scrollListener = (e) => {
        // Se o dropdown não está visível, não faz nada
        if (drop.style.display !== 'block') return;

        // Se o elemento que está rolando é o próprio dropdown (ou está dentro dele), NÃO FECHA
        if (drop.contains(e.target)) return;

        // Se for qualquer outro scroll (ex: scroll da página principal), aí sim fecha
        drop.style.display = 'none';
    };

    // Limpeza de listeners antigos
    if (window._myDateDropClose) window.removeEventListener('click', window._myDateDropClose);
    if (window._myDateDropScroll) window.removeEventListener('scroll', window._myDateDropScroll, true);

    window._myDateDropClose = closeListener;
    window._myDateDropScroll = scrollListener;

    window.addEventListener('click', closeListener);
    
    // 'true' aqui é importante para capturar o evento de scroll antes dele terminar
    window.addEventListener('scroll', scrollListener, true); 
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

function obterFiltrosAtuais() {
    const el = { modo: document.getElementById('modoSelect'), proj: document.getElementById('projSelect'), conta: document.getElementById('contaSelect') };
    
    // Se o Picker ainda não foi inicializado corretamente
    if (!EstadoData.selecaoInicio) return null;

    const modo = el.modo.value;
    
    // Se Fim é nulo (seleção em andamento), assume Início como Fim temporariamente
    const fimEfetivo = EstadoData.selecaoFim || EstadoData.selecaoInicio;
    
    const colunas = gerarColunasPeloIntervalo(EstadoData.selecaoInicio, fimEfetivo, modo.toLowerCase());

    // Calcula os Anos envolvidos para a API
    const anosUnicos = new Set();
    colunas.forEach(c => {
        if (modo.toLowerCase() === 'mensal') anosUnicos.add(c.split('-')[1]);
        else anosUnicos.add(c);
    });

    return { 
        modo, 
        anos: Array.from(anosUnicos), 
        projetos: getSelectItems(el.proj), 
        contas: getSelectItems(el.conta), 
        colunas 
    };
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
function atualizarVisualizacoes(dados, colunas, colunasPlaceholder, cache) {
    const limpar = id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; };
    const idsTabelas = ['tabelaMatriz', 'tabelaCustos', 'tabelaCapitalGiro', 'resumoFluxoCaixa'];
    idsTabelas.forEach(limpar);

    renderizarDRE(dados.matrizDRE, colunas, cache.userType);
    renderizarDetalhamento(cache.categoriasMap, dados.matrizDetalhamento, colunas, dados.entradasESaidas, cache.userType);
    renderizarCapitalGiro(dados.matrizCapitalGiro, colunas, dados.dadosEstoque);
    
    renderizarGraficos(dados, colunas);
    renderizarFluxoDiario(dados.fluxoDeCaixa, colunas, dados.matrizDRE['Caixa Inicial']?.TOTAL || 0, cache.projecao);
    renderizarFluxoDiarioResumido(dados.matrizDRE['Caixa Inicial'], dados.matrizDRE['Caixa Final'], dados.entradasESaidas, colunas);

    // Adiciona as colunas vazias nas tabelas que possuem estrutura de colunas temporais
    if (colunasPlaceholder && colunasPlaceholder.length > 0) {
        renderizarColunasPlaceholder(colunasPlaceholder, idsTabelas);
    }
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
    criarLinhaEspacadora(tb, colunas);

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
    if (!tb) return;
    tb.textContent = '';
    
    if (!colunas || !colunas.length) return;

    // 1. Detecta se estamos no modo Anual (strings de 4 dígitos)
    const isAnual = colunas[0].length === 4;

    const dados = [];
    const colSet = new Set(colunas);
    
    // 2. Filtragem dos dados
    fluxo.forEach(x => {
        // Extrai partes da data do lançamento (DD/MM/AAAA)
        const parts = x.data.split('/');
        const mes = parts[1];
        const ano = parts[2];
        
        // Chave usada para ordenação e display (sempre MM-AAAA)
        const k = `${mes}-${ano}`;
        
        // Lógica de inclusão:
        // Se for Anual: Verifica se o ANO (2026) está nas colunas
        // Se for Mensal: Verifica se a chave completa (05-2026) está nas colunas
        if (isAnual) {
            if (colSet.has(ano)) dados.push({...x, k});
        } else {
            if (colSet.has(k)) dados.push({...x, k});
        }
    });

    const tbody = tb.createTBody();
    
    // 3. Cabeçalho
    const thead = tb.createTHead();
    const trH = thead.insertRow();
    
    const thData = document.createElement('th');
    thData.innerHTML = `Data`;
    trH.appendChild(thData);
    
    ['Descrição', 'Valor (R$)', 'Saldo (R$)'].forEach(t => {
        const th = document.createElement('th'); th.textContent = t; trH.appendChild(th);
    });

    // 4. Definição dos Limites Visuais (Para a função renderFD funcionar corretamente)
    // A função renderFD exige o formato MM-AAAA para calcular a ordem cronológica.
    let iniVis, fimVis;

    if (isAnual) {
        // Se é 2026 a 2028, transformamos em "01-2026" a "12-2028"
        iniVis = `01-${colunas[0]}`;
        fimVis = `12-${colunas[colunas.length - 1]}`;
    } else {
        iniVis = colunas[0];
        fimVis = colunas[colunas.length - 1];
    }

    // Renderiza passando os limites convertidos
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
    rS.innerHTML = `<td></td><td><b>Saldo Inicial</b></td><td></td><td><b>${formatarValor(s, 2)}</b></td>`;

    visiveis.forEach(i => {
        s += i.valor;
        const r = tbody.insertRow();
        const obs = i.obs ? ` <span class="tooltip-target" data-tooltip="${i.obs}">ℹ️</span>` : '';
        r.innerHTML = `<td>${i.data}</td><td>${i.descricao}${obs}</td><td style="text-align:right">${formatarValor(i.valor, 2)}</td><td style="text-align:right">${formatarValor(s, 2)}</td>`;
    });
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
                <td colspan="${colunasProcessar.length + 1}" style="height:30px; padding:0; background:transparent; border:none;"></td> 
            </tr>
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
                <td colspan="${colunasProcessar.length + 1}" style="height:30px; padding:0; background:transparent; border:none;"></td> 
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

// ------ Placeholders para colunas sem dados ------
/**
 * Insere colunas vazias antes da coluna TOTAL, mantendo a formatação visual.
 * @param {string[]} colunasVazias - Lista de nomes das colunas (ex: ['01-2026', '02-2026'])
 * @param {string[]} idsTabelas - IDs das tabelas a serem afetadas
 */
function renderizarColunasPlaceholder(colunasVazias, idsTabelas) {
    if (!colunasVazias || colunasVazias.length === 0) return;

    idsTabelas.forEach(id => {
        const tabela = document.getElementById(id);
        if (!tabela) return;

        // 1. Ajuste do Cabeçalho (THEAD)
        const thead = tabela.tHead;
        if (thead) {
            Array.from(thead.rows).forEach(row => {
                const cells = row.cells;
                
                // Se for linha de espaçamento no header ou título full-width (com colspan total)
                if (cells.length === 1 && cells[0].hasAttribute('colspan')) {
                    const atual = parseInt(cells[0].getAttribute('colspan')) || 1;
                    cells[0].setAttribute('colspan', atual + colunasVazias.length);
                    return;
                }

                // Insere antes do TOTAL (assumindo que TOTAL é a última coluna)
                const indexTotal = cells.length - 1;
                if (indexTotal < 0) return;
                
                const cellTotal = cells[indexTotal];
                // Pega a célula anterior (última coluna de dados) para clonar o estilo
                const cellAnterior = indexTotal > 0 ? cells[indexTotal - 1] : null;

                colunasVazias.forEach(nome => {
                    const th = document.createElement('th');
                    th.textContent = nome;
                    // Copia estilos da célula anterior (bordas, alinhamento, fonte)
                    if (cellAnterior) {
                        th.className = cellAnterior.className;
                        th.style.cssText = cellAnterior.style.cssText;
                    }
                    row.insertBefore(th, cellTotal);
                });
            });
        }

        // 2. Ajuste do Corpo (TBODY)
        // Itera sobre todos os tBodies (algumas tabelas podem ter múltiplos ou apenas um)
        Array.from(tabela.tBodies).forEach(tbody => {
            Array.from(tbody.rows).forEach(row => {
                const cells = row.cells;
                
                // Detecção robusta de linhas de espaçamento/título
                // Verifica se a linha tem apenas 1 célula E essa célula tem colspan > 1
                const primeiroColspan = cells.length > 0 && cells[0].hasAttribute('colspan') 
                    ? parseInt(cells[0].getAttribute('colspan')) : 1;

                if (cells.length === 1 && primeiroColspan > 1) {
                    cells[0].setAttribute('colspan', primeiroColspan + colunasVazias.length);
                    return;
                }

                // Linhas normais de dados: insere antes do último (Total)
                const indexTotal = cells.length - 1;
                if (indexTotal < 0) return;

                const cellTotal = cells[indexTotal];
                const cellAnterior = indexTotal > 0 ? cells[indexTotal - 1] : null;

                colunasVazias.forEach(() => {
                    const td = document.createElement('td');
                    td.textContent = '-'; // Placeholder padrão

                    // Copia formatação visual da célula de dados anterior
                    if (cellAnterior) {
                        td.className = cellAnterior.className;
                        td.style.cssText = cellAnterior.style.cssText;

                        // IMPORTANTE: Remove classes semânticas de cor (verde/vermelho/azul)
                        // para que o traço "-" fique neutro (cor padrão do texto)
                        td.classList.remove('texto-verde', 'texto-vermelho', 'texto-azul');
                        
                        // Limpa cor inline se houver
                        if (td.style.color) td.style.color = '';
                    } 
                    
                    // Garante alinhamento à direita para números se não herdou nada explícito
                    if (!td.style.textAlign) {
                        td.style.textAlign = 'right';
                    }

                    row.insertBefore(td, cellTotal);
                });
            });
        });
    });
}

export { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect, alternarEstadoCarregamento};