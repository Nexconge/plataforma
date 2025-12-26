// uiV04.js

// ------ Estado Global de UI ------
let graficosAtuais = {
    saldoCaixa: null,
    acumulado: null,
    mensal: null
};
let chartJsPromise = null;

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ------ Formatação ------

function formatarValor(valor) {
    if (valor < 0.01 && valor > -0.01) return '-';
    const numeroFormatado = Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0});
    return valor < 0 ? `(${numeroFormatado})` : numeroFormatado;
}

function formatarPercentual(valor) {
    if (!valor || valor === 0) return '0,0%';
    return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function sanitizeId(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\W+/g, '_').replace(/^_+|_+$/g, '');
}

// ------ Utilitários DOM ------

function getSelectItems(select){
    if (!select.selectedOptions || select.selectedOptions.length === 0) return [];
    return Array.from(select.selectedOptions).map(option => option.value);
}

function toggleLinha(id) {
    const filhos = document.querySelectorAll(`.parent-${id}`);
    if (filhos.length === 0) return;
    const algumVisivel = [...filhos].some(linha => !linha.classList.contains('hidden'));
    if (algumVisivel) esconderDescendentes(id);
    else filhos.forEach(filho => filho.classList.remove('hidden'));
}

function esconderDescendentes(id) {
    const filhos = document.querySelectorAll(`.parent-${id}`);
    filhos.forEach(filho => {
        filho.classList.add('hidden');
        if (filho.id) esconderDescendentes(filho.id);
    });
}

/**
 * Bloqueia ou libera a interface durante processamento.
 * @param {boolean} carregando - true para bloquear, false para liberar.
 */
function alternarEstadoCarregamento(carregando) {
    // 1. Alterna a classe visual no Body
    if (carregando) {
        document.body.classList.add('app-loading');
    } else {
        document.body.classList.remove('app-loading');
    }

    // 2. Lista de IDs dos filtros que devem ser travados
    const idsParaBloquear = [
        'anoSelect', 
        'projSelect', 
        'contaSelect', 
        'modoSelect', 
        'btnARealizar', 
        'btnRealizado',
        'inputDataInicial', // Se houver inputs de data
        'inputDataFinal'
    ];

    // 3. Aplica ou remove o atributo 'disabled'
    idsParaBloquear.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = carregando;
            // Opcional: Visual extra para inputs desabilitados
            el.style.opacity = carregando ? '0.6' : '1'; 
        }
    });
}

// ------ Gerenciamento de Dependências (Chart.js) ------

function carregarChartJs() {
    if (window.Chart) return Promise.resolve();
    if (chartJsPromise) return chartJsPromise;

    chartJsPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
            console.error("Falha ao carregar Chart.js.");
            chartJsPromise = null;
            reject(new Error('Falha ao carregar Chart.js'));
        };
        document.body.appendChild(script);
    });
    return chartJsPromise;
}

// ------ Gerenciamento de Filtros ------

function configurarFiltros(appCache, anosDisponiveis, atualizarCallback) {
    const elementos = {
        ano: document.getElementById('anoSelect'),
        proj: document.getElementById('projSelect'),
        conta: document.getElementById('contaSelect'),
        modo: document.getElementById('modoSelect'),
        btnARealizar: document.getElementById('btnARealizar'),
        btnRealizado: document.getElementById('btnRealizado')
    };

    // Popula Projetos
    elementos.proj.innerHTML = '';
    Array.from(appCache.projetosMap.entries())
        .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
        .forEach(([codProj, { nome }]) => {
            const option = new Option(nome, codProj);
            elementos.proj.appendChild(option);
        });
    if (elementos.proj.options.length > 0) elementos.proj.options[0].selected = true;

    // Listeners
    const setProjecao = (tipo) => {
        appCache.projecao = tipo;
        atualizarVisibilidadeCapitalGiro(tipo);
        atualizarCallback();
    };

    elementos.btnARealizar.addEventListener('click', () => setProjecao("arealizar"));
    elementos.btnRealizado.addEventListener('click', () => setProjecao("realizado"));
    elementos.ano.addEventListener('change', atualizarCallback);
    elementos.conta.addEventListener('change', atualizarCallback);
    
    elementos.proj.addEventListener('change', () => {
        atualizarFiltroContas(elementos.conta, appCache.projetosMap, appCache.contasMap, getSelectItems(elementos.proj));
        atualizarCallback();
    });

    elementos.modo.addEventListener('change', () => {
        atualizarOpcoesAnoSelect(elementos.ano, anosDisponiveis, elementos.modo.value, appCache.projecao);
        atualizarCallback();
    });

    // Init
    carregarChartJs();
    configurarAbasGraficos();
    atualizarOpcoesAnoSelect(elementos.ano, anosDisponiveis, elementos.modo.value, appCache.projecao);
    atualizarFiltroContas(elementos.conta, appCache.projetosMap, appCache.contasMap, getSelectItems(elementos.proj));
    atualizarCallback();
}

function atualizarVisibilidadeCapitalGiro(projecao){
    const groupCapitalG = document.getElementById('groupCapitalGiro');
    if(groupCapitalG) groupCapitalG.style.display = (projecao === "arealizar") ? "none" : "";
}

function obterFiltrosAtuais() {
    const elementos = {
        modo: document.getElementById('modoSelect'),
        ano: document.getElementById('anoSelect'),
        proj: document.getElementById('projSelect'),
        conta: document.getElementById('contaSelect')
    };

    if (!elementos.modo || !elementos.ano || !elementos.proj || !elementos.conta) return null;
    const valorAno = elementos.ano.value;
    if (!valorAno) return null;

    const modo = elementos.modo.value;
    let anosParaProcessar = [];
    
    if (modo.toLowerCase() === 'mensal') {
        anosParaProcessar = [valorAno];
    } else { 
        const inicio = Number(valorAno);
        for (let i = 0; i <= 5; i++) anosParaProcessar.push(String(inicio + i));
    }
    
    const colunas = (modo.toLowerCase() === 'anual')
        ? [...anosParaProcessar].sort()
        : Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}-${valorAno}`);

    return {
        modo,
        anos: anosParaProcessar,
        projetos: getSelectItems(elementos.proj),
        contas: getSelectItems(elementos.conta),
        colunas
    };
}

function atualizarOpcoesAnoSelect(anoSelect, anoInicio, anoFim, modo, projecao) {
    if (!anoSelect) return;
    const valorAtual = anoSelect.value;
    anoSelect.innerHTML = '';

    const atual = new Date().getFullYear();
    let start = Number(anoInicio) || atual;
    let end = Number(anoFim) || atual;

    if (start > end) [start, end] = [end, start];

    if (projecao === 'arealizar') {
        end = Math.max(end, atual + 5);
        start = Math.max(start, atual);
    }

    if (modo.toLowerCase() === 'mensal') {
        for (let ano = start; ano <= end; ano++) {
            anoSelect.appendChild(new Option(String(ano), String(ano)));
        }
        
        // Mantém seleção anterior se possível, senão define padrão inteligente
        const existe = Array.from(anoSelect.options).some(op => op.value === valorAtual);
        if (valorAtual && existe) anoSelect.value = valorAtual;
        else anoSelect.value = String(projecao === "realizado" ? end : start);

    } else { 
        // Modo Anual (Blocos de 6 anos)
        const duracao = 6;
        for (let cursor = start; cursor <= end; cursor += duracao) {
            const fimBloco = cursor + duracao - 1;
            anoSelect.prepend(new Option(`${cursor}-${fimBloco}`, cursor)); // Mais recente no topo
        }
        
        if (valorAtual && Array.from(anoSelect.options).some(op => op.value === valorAtual)) {
            anoSelect.value = valorAtual;
        } else if (anoSelect.options.length > 0) {
            // Se for realizado → pega a primeira opção
            if (projecao === "realizado") {
                anoSelect.value = anoSelect.options[0].value;
            // Caso contrário → pega a última opção
            } else {
                anoSelect.value = anoSelect.options[anoSelect.options.length - 1].value;
            }
        }
    }
}

function atualizarFiltroContas(contaSelect, projetosMap, contasMap, projetosSelecionados) {
    const contasPermitidas = new Set();
    projetosSelecionados.forEach(codProj => {
        const projeto = projetosMap.get(String(codProj));
        if (projeto) projeto.contas.forEach(c => contasPermitidas.add(c));
    });

    contaSelect.innerHTML = '';
    Array.from(contasMap.entries())
        .sort((a, b) => a[1].descricao.localeCompare(b[1].descricao))
        .forEach(([codigo, { descricao }]) => {
            if (contasPermitidas.has(codigo)) {
                contaSelect.appendChild(new Option(descricao, codigo));
            }
        });
    
    if (contaSelect.options.length > 0) contaSelect.options[0].selected = true;
}

// ------ Renderização de Tabelas ------

function atualizarVisualizacoes(dadosProcessados, colunas, appCache) {
    const limpar = (id) => { const el = document.getElementById(id); if(el) el.innerHTML = ''; };
    limpar('tabelaMatriz');
    limpar('tabelaCustos');
    limpar('tabelaCapitalGiro');

    const { matrizDRE, matrizDetalhamento, entradasESaidas, matrizCapitalGiro, dadosEstoque } = dadosProcessados;

    renderizarTabelaDRE(matrizDRE, colunas, appCache.userType);
    renderizarTabelaDetalhamento(appCache.categoriasMap, matrizDetalhamento, colunas, entradasESaidas, appCache.userType);
    renderizarTabelaCapitalGiro(matrizCapitalGiro, colunas, dadosEstoque);
    
    // Gráficos e Fluxo Diário
    renderizarGraficos(dadosProcessados, colunas);
    const saldoIni = matrizDRE['Caixa Inicial']?.TOTAL || 0;
    renderizarFluxoDiario(dadosProcessados.fluxoDeCaixa, colunas, saldoIni, appCache.projecao);
}

// 1. Tabela DRE
function renderizarTabelaDRE(matrizDRE, colunas, userType) {
    const tabela = document.getElementById('tabelaMatriz');
    const fragment = document.createDocumentFragment();

    const ordemClasses = [
        '(+) Receita Bruta', '(-) Deduções', '(=) Receita Líquida', '(-) Custos', '(-) Despesas',
        '(+/-) IRPJ/CSLL', '(+/-) Geração de Caixa Operacional', '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas',
        '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios', '(=) Movimentação de Caixa Mensal'
    ];
    if (userType?.toLowerCase() === 'developer') {
        ordemClasses.push('Entrada de Transferência', 'Saída de Transferência', 'Outros');
    }
    ordemClasses.push('Caixa Inicial', 'Caixa Final');

    // Cabeçalho
    const thead = tabela.createTHead();
    const row = thead.insertRow();
    row.className = 'cabecalho';
    row.insertCell().textContent = 'Fluxo de Caixa';
    colunas.forEach(c => row.insertCell().textContent = c);
    row.insertCell().textContent = 'TOTAL';
    fragment.appendChild(thead);

    // Corpo
    const tbody = tabela.createTBody();
    tbody.insertRow().innerHTML = `<td colspan="${colunas.length + 2}" class="linhaBranco"></td>`;

    ordemClasses.forEach(classe => {
        tbody.appendChild(criarLinhaTabela(classe, colunas, matrizDRE[classe]));
        if(['(+/-) Geração de Caixa Operacional','(=) Movimentação de Caixa Mensal','Outros'].includes(classe)){
           tbody.insertRow().innerHTML = `<td colspan="${colunas.length + 2}" class="linhaBranco"></td>`;
        }
    });

    fragment.appendChild(tbody);
    tabela.appendChild(fragment);
}

function criarLinhaTabela(classe, colunas, dadosLinha, DRE = true) {
    const row = document.createElement('tr');
    row.insertCell().textContent = classe;

    // Estilização
    if (['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Outros'].includes(classe)) {
        row.classList.add('linhatotal');
    } else if (['Caixa Inicial', 'Caixa Final','(+) Entradas','(-) Saídas'].includes(classe)) {
        row.classList.add('linhaSaldo');
    } else if (!classe.includes('Transferência')){
        row.classList.add('idented'); 
    }
    // Estilização linha de transferência
    if (classe.includes('Transferência')) {
        if (DRE){
            row.classList.add('linhatotal');
        }else{
            row.classList.add('linhaSaldo');
        }
    }

    // Colunas de Período
    colunas.forEach(col => {
        const valor = dadosLinha?.[col] || 0;
        row.insertCell().textContent = formatarValor(valor);
    });

    // Total
    const total = dadosLinha?.TOTAL || 0;
    row.insertCell().textContent = formatarValor(total);
    return row;
}

// 2. Tabela Detalhamento
function renderizarTabelaDetalhamento(categoriasMap, dadosAgrupados, colunas, entradasESaidas, userType) {
    const tabela = document.getElementById('tabelaCustos');
    const fragment = document.createDocumentFragment();

    // Cabeçalho
    const thead = tabela.createTHead();
    const row = thead.insertRow();
    row.className = 'cabecalho';
    row.insertCell().textContent = 'Detalhamento';
    colunas.forEach(c => row.insertCell().textContent = c);
    row.insertCell().textContent = 'TOTAL';
    thead.insertRow().innerHTML = `<td colspan="${colunas.length + 2}" class="linhaBranco"></td>`;
    fragment.appendChild(thead);

    const tbody = tabela.createTBody();

    // Organiza dados
    const dadosPorClasse = {};
    Object.entries(dadosAgrupados).forEach(([chave, dados]) => {
        const [classe, periodo] = chave.split('|');
        if (!dadosPorClasse[classe]) dadosPorClasse[classe] = {};
        dadosPorClasse[classe][periodo] = dados;
    });

    const ordemPrioritaria = [
        '(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL',
        '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios'
    ];

    // Renderiza prioridades
    ordemPrioritaria.forEach(classe => {
        if (dadosPorClasse[classe]) renderLinhaDrillDown(classe, dadosPorClasse[classe], tbody, categoriasMap, colunas);
    });
    // Renderiza o resto
    Object.keys(dadosPorClasse).forEach(classe => {
        if (!ordemPrioritaria.includes(classe)) renderLinhaDrillDown(classe, dadosPorClasse[classe], tbody, categoriasMap, colunas);
    });

    tbody.insertRow().innerHTML = `<td colspan="${colunas.length + 2}" class="linhaBranco"></td>`;
    
    // Entradas e Saídas Extras
    const classesES = [];
    if(userType?.toLowerCase() === 'developer') classesES.push('(+) Entradas de Transferência', '(-) Saídas de Transferência');
    classesES.push('(+) Entradas', '(-) Saídas');

    classesES.forEach(classe => {
        if(entradasESaidas[classe]) tbody.appendChild(criarLinhaTabela(classe, colunas, entradasESaidas[classe], false));
    });
    
    fragment.appendChild(tbody);
    tabela.appendChild(fragment);
}

function renderLinhaDrillDown(classe, dadosDaClasse, tbody, categoriasMap, colunas) {
    const classeId = `classe_${sanitizeId(classe)}`;
    
    // 1. Linha Mestre (Classe)
    const rowClasse = tbody.insertRow();
    rowClasse.className = 'linhaClasseDetalhamento';
    rowClasse.id = classeId;
    rowClasse.onclick = () => toggleLinha(classeId);
    rowClasse.insertCell().innerHTML = `<span class="expand-btn">[+]</span> ${classe}`;

    let totalGeral = 0;
    colunas.forEach(col => {
        const val = dadosDaClasse[col]?.total || 0;
        totalGeral += val;
        rowClasse.insertCell().textContent = formatarValor(val);
    });
    rowClasse.insertCell().textContent = formatarValor(totalGeral);

    // 2. Processa hierarquia
    const arvore = {};
    Object.keys(dadosDaClasse).forEach(periodo => {
        const deptos = dadosDaClasse[periodo].departamentos;
        for (const nomeDepto in deptos) {
            if (!arvore[nomeDepto]) arvore[nomeDepto] = { categorias: {} };
            for (const codCat in deptos[nomeDepto].categorias) {
                if (!arvore[nomeDepto].categorias[codCat]) arvore[nomeDepto].categorias[codCat] = { fornecedores: {} };
                for (const forn in deptos[nomeDepto].categorias[codCat].fornecedores) {
                    arvore[nomeDepto].categorias[codCat].fornecedores[forn] = true;
                }
            }
        }
    });

    // 3. Renderiza Filhos
    Object.keys(arvore).sort().forEach(nomeDepto => {
        const deptoId = `${classeId}_dp_${sanitizeId(nomeDepto)}`;
        const rowDepto = tbody.insertRow();
        rowDepto.className = `linhaDepto parent-${classeId} hidden`;
        rowDepto.id = deptoId;
        rowDepto.onclick = () => toggleLinha(deptoId);
        rowDepto.insertCell().innerHTML = `<span class="expand-btn">[+]</span> ${nomeDepto}`;

        let totalDepto = 0;
        colunas.forEach(col => {
            const val = dadosDaClasse[col]?.departamentos[nomeDepto]?.total || 0;
            totalDepto += val;
            rowDepto.insertCell().textContent = formatarValor(val);
        });
        rowDepto.insertCell().textContent = formatarValor(totalDepto);

        Object.keys(arvore[nomeDepto].categorias).sort().forEach(codCat => {
            const catId = `${deptoId}_cat_${sanitizeId(codCat)}`;
            const rowCat = tbody.insertRow();
            rowCat.className = `linha-categoria parent-${deptoId} hidden`;
            rowCat.id = catId;
            rowCat.onclick = (e) => { e.stopPropagation(); toggleLinha(catId); };
            
            const nomeCat = categoriasMap.get(codCat) || 'Categoria desconhecida';
            rowCat.insertCell().innerHTML = `<span style="padding-left:20px"><span class="expand-btn">[+]</span> ${nomeCat}</span>`;

            let totalCat = 0;
            colunas.forEach(col => {
                const val = dadosDaClasse[col]?.departamentos[nomeDepto]?.categorias[codCat]?.total || 0;
                totalCat += val;
                rowCat.insertCell().textContent = formatarValor(val);
            });
            rowCat.insertCell().textContent = formatarValor(totalCat);

            Object.keys(arvore[nomeDepto].categorias[codCat].fornecedores).sort().forEach(nomeForn => {
                const rowForn = tbody.insertRow();
                rowForn.className = `linha-lancamento parent-${catId} hidden`;
                rowForn.insertCell().innerHTML = `<span style="padding-left:40px">${nomeForn}</span>`;

                let totalForn = 0;
                colunas.forEach(col => {
                    const val = dadosDaClasse[col]?.departamentos[nomeDepto]?.categorias[codCat]?.fornecedores[nomeForn]?.total || 0;
                    totalForn += val;
                    rowForn.insertCell().textContent = formatarValor(val);
                });
                rowForn.insertCell().textContent = formatarValor(totalForn);
            });
        });
    });
}

// 3. Tabela Capital de Giro
function renderizarTabelaCapitalGiro(matriz, colunas, dadosEstoque) {
    const tabela = document.getElementById('tabelaCapitalGiro');
    if (!tabela) return;
    tabela.innerHTML = '';
    
    if (!colunas || !colunas.length || !matriz || Object.keys(matriz).length === 0) return;

    const fragment = document.createDocumentFragment();
    const thead = tabela.createTHead();
    const hRow = thead.insertRow();
    hRow.className = 'cabecalho';
    hRow.insertCell().textContent = 'Capital de Giro';
    colunas.forEach(c => hRow.insertCell().textContent = c);
    hRow.insertCell(); // Coluna extra vazia

    fragment.appendChild(thead);
    const tbody = tabela.createTBody();

    // Calcula percentuais
    calcularPercentuaisCG(matriz, colunas);
    const espaco = () => tbody.insertRow().innerHTML = `<td colspan="${colunas.length + 2}" class="linhaBranco"></td>`;

    // Renderiza blocos
    renderLinhaCG(tbody, matriz, colunas, '(+) Caixa', '(+) Caixa', false, 'linhatotal');
    espaco();
    renderLinhaCG(tbody, matriz, colunas, '(+) Clientes a Receber', '(+) Clientes a Receber', false, 'linhatotal');
    renderLinhaCG(tbody, matriz, colunas, 'Curto Prazo (30 dias)', 'Curto Prazo AR', false, 'idented');
    renderLinhaCG(tbody, matriz, colunas, 'Longo Prazo (maior que 30 dias)', 'Longo Prazo AR', false, 'idented');
    renderLinhaCG(tbody, matriz, colunas, 'Curto Prazo (%)', 'Curto Prazo AR %', true, 'idented');
    renderLinhaCG(tbody, matriz, colunas, 'Longo Prazo (%)', 'Longo Prazo AR %', true, 'idented');
    
    if (dadosEstoque && dadosEstoque['(+) Estoque']) {
        espaco();
        renderLinhaCG(tbody, dadosEstoque, colunas, '(+) Estoque', '(+) Estoque', false, 'linhatotal');
    }

    espaco();
    renderLinhaCG(tbody, matriz, colunas, '(-) Fornecedores a Pagar', '(-) Fornecedores a Pagar', false, 'linhatotal');
    renderLinhaCG(tbody, matriz, colunas, 'Curto Prazo (30 dias)', 'Curto Prazo AP', false, 'idented');
    renderLinhaCG(tbody, matriz, colunas, 'Longo Prazo (maior que 30 dias)', 'Longo Prazo AP', false, 'idented');
    renderLinhaCG(tbody, matriz, colunas, 'Curto Prazo (%)', 'Curto Prazo AP %', true, 'idented');
    renderLinhaCG(tbody, matriz, colunas, 'Longo Prazo (%)', 'Longo Prazo AP %', true, 'idented');
    
    espaco();
    renderLinhaCG(tbody, matriz, colunas, '(=) Curto Prazo (30 dias)', 'Curto Prazo TT', false, 'linhatotal');
    renderLinhaCG(tbody, matriz, colunas, '(=) Longo Prazo (maior que 30 dias)', 'Longo Prazo TT', false, 'linhatotal');
    
    espaco();
    // Linha Final com soma do estoque
    const rowFinal = tbody.insertRow();
    rowFinal.classList.add('linhaSaldo');
    rowFinal.insertCell().textContent = '(=) Capital Líquido Circulante';
    colunas.forEach(col => {
        let val = (matriz['Capital Liquido']?.[col] ?? 0) + (dadosEstoque['(+) Estoque']?.[col] ?? 0);
        rowFinal.insertCell().textContent = formatarValor(val);
    });
    rowFinal.insertCell();
    
    fragment.appendChild(tbody);
    tabela.appendChild(fragment);
}

function renderLinhaCG(tbody, matriz, colunas, label, chave, isPercent, cssClass) {
    const row = tbody.insertRow();
    if (cssClass) row.classList.add(cssClass);
    row.insertCell().textContent = label;
    colunas.forEach(col => {
        let val = matriz[chave]?.[col] ?? 0;
        // Ajuste específico para Capital Líquido (soma estoque apenas se passado explicitamente, 
        // mas aqui estamos usando a função genérica, o cálculo final é feito fora)
        row.insertCell().textContent = isPercent && val !== 0 ? formatarPercentual(val) : formatarValor(val);
    });
    row.insertCell();
}

function calcularPercentuaisCG(matriz, colunas) {
    ['AR', 'AP'].forEach(tipo => {
        const curto = `Curto Prazo ${tipo}`;
        const longo = `Longo Prazo ${tipo}`;
        const pctCurto = `Curto Prazo ${tipo} %`;
        const pctLongo = `Longo Prazo ${tipo} %`;

        matriz[pctCurto] = {};
        matriz[pctLongo] = {};

        colunas.forEach(col => {
            const vCurto = matriz[curto][col] || 0;
            const vLongo = matriz[longo][col] || 0;
            const total = vCurto + vLongo;
            
            matriz[pctCurto][col] = total ? (vCurto / total) * 100 : 0;
            matriz[pctLongo][col] = total ? (vLongo / total) * 100 : 0;
        });
    });
}

// ------ Gráficos ------

function renderizarGraficos(dadosProcessados, colunas) {
    if (!dadosProcessados || !window.Chart || !dadosProcessados.matrizDRE) return;

    const { matrizDRE, entradasESaidas } = dadosProcessados;
    
    // Preparação dos Arrays de Dados
    let labels = [], saldos = [], recebimentos = [], pagamentos = [];
    let accRec = 0, accPag = 0;
    const recAcum = [], pagAcum = [];

    colunas.forEach(col => {
        const s = matrizDRE['Caixa Final']?.[col] ?? 0;
        const r = entradasESaidas['(+) Entradas']?.[col] ?? 0;
        const p = Math.abs(entradasESaidas['(-) Saídas']?.[col] ?? 0);

        if (Math.abs(s) + Math.abs(r) + Math.abs(p) > 0) {
            labels.push(col);
            saldos.push(s);
            recebimentos.push(r);
            pagamentos.push(p);

            accRec += r; accPag += p;
            recAcum.push(accRec);
            pagAcum.push(accPag);
        }
    });

    renderizarGraficoMensal(labels, recebimentos, pagamentos);
    renderizarGraficoSaldoCaixa(labels, saldos);
    renderizarGraficoAcumulado(labels, recAcum, pagAcum);
}

// Helper para configurações comuns do Chart.js
function getChartCommonOptions(title, isCurrency = true) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: { display: true, text: title, font: { size: 16 } },
            legend: { position: 'bottom' },
            tooltip: {
                backgroundColor: 'rgba(200, 200, 200, 0.9)',
                titleColor: 'black',
                bodyColor: 'black',
                callbacks: {
                    label: ctx => {
                        const val = ctx.raw;
                        const label = ctx.dataset.label || '';
                        return `${label}: ${isCurrency ? 'R$ ' : ''}${val.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
                    }
                }
            }
        },
        scales: {
            x: { grid: { display: false } },
            y: { ticks: { callback: v => isCurrency ? `R$ ${v.toLocaleString('pt-BR')}` : v } }
        }
    };
}

function renderizarGraficoSaldoCaixa(labels, dados) {
    const ctx = document.getElementById('graficoSaldoCaixa');
    if (graficosAtuais.saldoCaixa) graficosAtuais.saldoCaixa.destroy();
    if (!ctx) return;

    graficosAtuais.saldoCaixa = new window.Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: dados,
                fill: false,
                tension: 0.3,
                segment: { borderColor: ctx => ctx.p1.parsed.y < 0 ? 'rgb(220, 53, 69)' : 'rgb(40, 167, 69)' },
                pointRadius: 0,
                pointHitRadius: 20
            }]
        },
        options: getChartCommonOptions('Saldo de Caixa Acumulado (R$)')
    });
}

function renderizarGraficoAcumulado(labels, rec, pag) {
    const ctx = document.getElementById('graficoRecebientoPagamentoAcumulado');
    if (graficosAtuais.acumulado) graficosAtuais.acumulado.destroy();
    if (!ctx) return;

    graficosAtuais.acumulado = new window.Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Entradas Acumuladas', data: rec, borderColor: 'rgb(40, 167, 69)', backgroundColor: 'rgba(40, 167, 69, 0.2)', fill: true, tension: 0.3, pointRadius: 0 },
                { label: 'Pagamentos Acumulados', data: pag, borderColor: 'rgb(220, 53, 69)', backgroundColor: 'rgba(220, 53, 69, 0.2)', fill: true, tension: 0.3, pointRadius: 0 }
            ]
        },
        options: getChartCommonOptions('Evolução de Desembolso (R$)')
    });
}

function renderizarGraficoMensal(labels, rec, pag) {
    const ctx = document.getElementById('graficoEntradasSaidasMensal');
    if (graficosAtuais.mensal) graficosAtuais.mensal.destroy();
    if (!ctx) return;

    graficosAtuais.mensal = new window.Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Entradas', data: rec, borderColor: 'rgb(40, 167, 69)', backgroundColor: 'rgba(40, 167, 69, 0.2)', tension: 0.3, pointRadius: 0 },
                { label: 'Pagamentos', data: pag, borderColor: 'rgb(220, 53, 69)', backgroundColor: 'rgba(220, 53, 69, 0.2)', tension: 0.3, pointRadius: 0 }
            ]
        },
        options: getChartCommonOptions('Entradas X Pagamentos (R$)')
    });
}

// ------ Abas e UI Interativa ------

function mostrarAbaGrafico(idCanvas, abaAtiva) {
    document.querySelectorAll('#graficos-content canvas').forEach(c => c.style.display = 'none');
    document.querySelectorAll('.grafico-tabs .tab-link').forEach(a => a.classList.remove('active'));
    
    const canvas = document.getElementById(idCanvas);
    if (canvas) canvas.style.display = 'block';
    if (abaAtiva) abaAtiva.classList.add('active');
}

function configurarAbasGraficos() {
    const binds = {
        'tab-btn-saldo': 'graficoSaldoCaixa',
        'tab-btn-acumulado': 'graficoRecebientoPagamentoAcumulado',
        'tab-btn-mensal': 'graficoEntradasSaidasMensal'
    };
    Object.entries(binds).forEach(([btnId, canvasId]) => {
        const btn = document.getElementById(btnId);
        if (btn) btn.addEventListener('click', (e) => mostrarAbaGrafico(canvasId, e.currentTarget));
    });
}

// ------ Fluxo Diário ------
const MAX_MESES_FLUXO = 6; // Define o limite máximo de meses a serem exibidos no fluxo diário

// Em uiV18.js -> renderizarFluxoDiario

// Adicione o parâmetro 'projecao' na assinatura da função
function renderizarFluxoDiario(fluxoDeCaixa, colunas, saldoIni, projecao) {
    const tabela = document.getElementById('tabelaFluxoDiario');
    tabela.textContent = '';
    
    if (!Array.isArray(colunas) || colunas.length === 0) return;

    // 1. Prepara TODAS as colunas possíveis
    const colunasTotais = colunas[0].length === 4 ? expandirColunasAnoMes(colunas) : colunas;
    const colunasSet = new Set(colunasTotais); 

    // 2. Processamento dos DADOS
    const itensFiltrados = [];
    const periodosDisponiveis = new Set(); 

    fluxoDeCaixa.forEach(item => {
        const parts = item.data.split('/');
        const chave = `${parts[1]}-${parts[2]}`;
        
        periodosDisponiveis.add(chave);

        if (colunasSet.has(chave)) {
            itensFiltrados.push({ ...item, chaveAgregacao: chave });
        }
    });

    const periodosComDadosOrdenados = Array.from(periodosDisponiveis)
        .filter(p => colunasSet.has(p))
        .sort(compararChavesUI);

    // 3. Define o Range VISUAL Inicial
    let inicioVisualizacao, fimVisualizacao;

    if (periodosComDadosOrdenados.length > 0) {
        // --- CENÁRIO COM DADOS ---
        
        if (projecao === 'arealizar') {
            // LÓGICA "A REALIZAR": Prioriza o INÍCIO dos dados
            // Pega o PRIMEIRO mês que tem dados
            const primeiroComDados = periodosComDadosOrdenados[0];
            const indexInicio = colunasTotais.indexOf(primeiroComDados);

            if (indexInicio !== -1) {
                inicioVisualizacao = colunasTotais[indexInicio];
                
                // Calcula o FIM somando o limite para frente
                const indexFim = Math.min(colunasTotais.length - 1, indexInicio + MAX_MESES_FLUXO - 1);
                fimVisualizacao = colunasTotais[indexFim];
            } else {
                // Fallback
                inicioVisualizacao = primeiroComDados;
                fimVisualizacao = firstWithData;
            }

        } else {
            // LÓGICA PADRÃO ("REALIZADO"): Prioriza o FIM dos dados
            // Pega o ÚLTIMO mês que tem dados
            const ultimoComDados = periodosComDadosOrdenados[periodosComDadosOrdenados.length - 1];
            const indexFim = colunasTotais.indexOf(ultimoComDados);
            
            if (indexFim !== -1) {
                fimVisualizacao = colunasTotais[indexFim];
                // Calcula o INÍCIO subtraindo o limite para trás
                const indexInicio = Math.max(0, indexFim - MAX_MESES_FLUXO + 1);
                inicioVisualizacao = colunasTotais[indexInicio];
            } else {
                // Fallback
                fimVisualizacao = ultimoComDados;
                inicioVisualizacao = ultimoComDados; 
            }
        }

    } else {
        // --- CENÁRIO SEM DADOS (Tabela Vazia) ---
        
        if (projecao === 'arealizar') {
            // Se for A Realizar e vazio, mostra os PRIMEIROS meses do filtro (futuro imediato)
            const corte = colunasTotais.slice(0, MAX_MESES_FLUXO);
            inicioVisualizacao = corte[0];
            fimVisualizacao = corte[corte.length - 1];
        } else {
            // Se for Realizado e vazio, mostra os ÚLTIMOS meses do filtro (passado recente)
            const corte = colunasTotais.slice(-MAX_MESES_FLUXO);
            inicioVisualizacao = corte[0];
            fimVisualizacao = corte[corte.length - 1];
        }
    }
    
    // Lista para dropdown
    const periodosParaDropdown = Array.from(periodosDisponiveis).sort(compararChavesUI);
    
    const tbody = tabela.createTBody();

    // 4. Criação do Cabeçalho
    criarCabecalhoFluxo(
        tabela, 
        periodosParaDropdown, 
        (ini, fim) => atualizarTabelaFD(tbody, itensFiltrados, saldoIni, ini, fim),
        inicioVisualizacao,
        fimVisualizacao
    );

    // 5. Renderização
    atualizarTabelaFD(tbody, itensFiltrados, saldoIni, inicioVisualizacao, fimVisualizacao);
}

function atualizarTabelaFD(tbody, itens, saldoBase, inicioSel, fimSel) {
    tbody.innerHTML = '';
    
    if (!inicioSel || !fimSel) {
        const r = tbody.insertRow();
        r.className = 'linha-sem-dados'; // <--- ADICIONE ESTA LINHA (Classe CSS)
        
        const c = r.insertCell();
        c.colSpan = 4;
        c.textContent = 'Selecione um período.';
        c.style.textAlign = 'center';
        return;
    }

    // Filtra itens pelo range selecionado
    const [mI, aI] = inicioSel.split('-').map(Number);
    const [mF, aF] = fimSel.split('-').map(Number);
    const minVal = aI * 100 + mI;
    const maxVal = aF * 100 + mF;

    const visiveis = itens.filter(it => {
        const [m, a] = it.chaveAgregacao.split('-').map(Number);
        const val = a * 100 + m;
        return val >= minVal && val <= maxVal;
    });

    if (visiveis.length === 0) {
        const r = tbody.insertRow();
        r.className = 'linha-sem-dados'; // <--- ADICIONE ESTA LINHA (Classe CSS)
        
        const c = r.insertCell();
        c.colSpan = 4;
        c.textContent = 'Nenhum lançamento no período.';
        c.style.textAlign = 'center';
        return;
    }

    // Calcula saldo anterior ao range visível
    let saldo = saldoBase;
    for (const item of itens) {
        if (compararChavesUI(item.chaveAgregacao, inicioSel) >= 0) break;
        saldo += item.valor;
    }

    // Linha Saldo Inicial
    const rowIni = tbody.insertRow();
    rowIni.insertCell();
    const cDesc = rowIni.insertCell();
    cDesc.textContent = 'Saldo Inicial do Período';
    cDesc.style.fontWeight = 'bold';
    rowIni.insertCell();
    const cSaldo = rowIni.insertCell();
    cSaldo.textContent = formatarValor(saldo);
    cSaldo.style.fontWeight = 'bold';

    // Itens
    visiveis.forEach(item => {
        const r = tbody.insertRow();
        r.insertCell().textContent = item.data;
        
        const cellDesc = r.insertCell();
        cellDesc.textContent = item.descricao;

        // Se houver observação, adiciona o tooltip e um indicador visual
        if (item.obs) {
            // Criamos um SPAN para ser o "dono" do tooltip
            const icon = document.createElement('span');
            icon.textContent = " ℹ️";
            
            // Adicionamos a classe para o CSS e o texto da observação
            icon.className = 'tooltip-target'; 
            icon.dataset.tooltip = item.obs;
            
            // Adiciona o ícone ao lado do texto na célula
            cellDesc.appendChild(icon);
        }
        
        r.insertCell().textContent = formatarValor(item.valor);
        saldo += item.valor;
        r.insertCell().textContent = formatarValor(saldo);
    });
    if (visiveis.length < 10) {
        for (let i = visiveis.length; i <= 10; i++) {
            const r = tbody.insertRow();
            r.className = 'linha-vazia';
        }
    }
}

// ------ Auxiliares Fluxo Diário ------

function calcularDiferencaMeses(p1, p2) {
    const [m1, a1] = p1.split('-').map(Number);
    const [m2, a2] = p2.split('-').map(Number);
 
    // Retorna a quantidade absoluta de meses (inclusivo)
    return Math.abs((a2 - a1) * 12 + (m2 - m1)) + 1;
}

function compararChavesUI(a, b) {
    if (!a || !b) return 0;
    const [mA, aA] = a.split('-').map(Number);
    const [mB, aB] = b.split('-').map(Number);
    return aA !== aB ? aA - aB : mA - mB;
}

function expandirColunasAnoMes(colunasAnuais) {
    const expandido = [];
    colunasAnuais.forEach(ano => {
        for (let i = 1; i <= 12; i++) expandido.push(`${String(i).padStart(2,'0')}-${ano}`);
    });
    return expandido;
}

function criarCabecalhoFluxo(tabela, periodosOrdenados, callbackUpdate, startPadrao, endPadrao) {
    const thead = tabela.createTHead();
    const row = thead.insertRow();
    row.className = 'cabecalho';

    const thData = document.createElement('th');
    thData.className = 'data-header';
    thData.style.position = 'relative'; 
    
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '5px';
    
    // Inicializa o texto
    container.innerHTML = `<div>Data</div><div style="font-size:0.8em; cursor:pointer" id="fd-periodo-label">${startPadrao} → ${endPadrao} ▼</div>`;
    
    // Precisamos capturar initialStart e initialEnd que voltam da função criarDropdownPeriodoVisual
    const { dropdown, initialStart, initialEnd } = criarDropdownPeriodoVisual(periodosOrdenados, (ini, fim) => {
        container.querySelector('#fd-periodo-label').textContent = `${ini} → ${fim} ▼`;
        callbackUpdate(ini, fim);
    }, startPadrao, endPadrao); 

    thData.appendChild(container);
    thData.appendChild(dropdown);

    // Eventos do Dropdown
    const btn = container.querySelector('#fd-periodo-label');
    btn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
    };

    document.addEventListener('click', (e) => {
        if (!thData.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    row.appendChild(thData);
    ['Descrição', 'Valor (R$)', 'Saldo (R$)'].forEach(t => row.insertCell().textContent = t);

    // Agora initialStart e initialEnd existem porque foram declarados na const acima
    if (initialStart) container.querySelector('#fd-periodo-label').textContent = `${initialStart} → ${initialEnd} ▼`;
    
    return { initialStart, initialEnd };
}

function criarDropdownPeriodoVisual(periodos, onChange, startInicial, endInicial) {
    const dropdown = document.createElement('div');
    dropdown.className = 'filtro-dropdown filtro-calendario';

    // Usa os valores passados ou fallback
    let selStart = startInicial || periodos[0] || null;
    let selEnd = endInicial || periodos[periodos.length - 1] || null;

    // Função principal de renderização (agora encapsulada para poder ser chamada recursivamente ao clicar)
    const renderizarCalendario = () => {
        dropdown.innerHTML = ''; // Limpa tudo para redesenhar
        const grupos = {};
        periodos.forEach(p => {
            const [m, a] = p.split('-');
            if (!grupos[a]) grupos[a] = [];
            grupos[a].push(m);
        });
        Object.keys(grupos).sort().forEach(ano => {
            const divAno = document.createElement('div');
            divAno.className = 'filtro-ano-grupo';
            divAno.innerHTML = `<div class="filtro-ano-header">${ano}</div><div class="filtro-meses-grid"></div>`;
            const grid = divAno.querySelector('.filtro-meses-grid');
            
            for (let i = 1; i <= 12; i++) {
                const mes = String(i).padStart(2,'0');
                const periodoAtual = `${mes}-${ano}`;
                const divMes = document.createElement('div');
                divMes.textContent = MESES_ABREV[i-1];
                
                // Variáveis de Estado
                // Verifica se há um período selecionado
                const perSelecionado = selStart && selEnd;
                // Verifica se há dados para o mês atual
                const possuiDados = grupos[ano].includes(mes);
                // Verifica se estamos no meio de uma seleção (clicou no primeiro, falta o segundo)
                const selecionando = selStart && !selEnd;
                // Verificar se é o periodo inicial selecionado
                const isStartSelected = selStart === periodoAtual;  
                // Verifica se o mês atual está fora do limite permitido
                let foraDoLimite = false;
                if (selecionando && possuiDados) {
                    const dist = calcularDiferencaMeses(selStart, periodoAtual);
                    if (dist > MAX_MESES_FLUXO) {
                        foraDoLimite = true;
                    }
                }
                //Verifica se o mês atual está fora da seleção já finalizada
                const foraDaSelecao = perSelecionado && (compararChavesUI(periodoAtual, selStart) < 0 || compararChavesUI(periodoAtual, selEnd) > 0);

                // LÓGICA DE RENDERIZAÇÃO
                // Só é clicável se: tiver dados E não estiver bloqueado pelo limite
                if (possuiDados && !foraDoLimite) {
                    divMes.className = 'filtro-mes-btn';
                    divMes.dataset.periodo = periodoAtual;

                    // Aplica classes visuais de seleção
                    if ((!foraDaSelecao && !selecionando) || isStartSelected) divMes.classList.add('selected-start');
                
                    // Evento de Clique
                    divMes.onclick = (e) => {
                        e.stopPropagation(); // Evita fechar o menu

                        if (!selStart || (selStart && selEnd)) {
                            // 1º Clique: Inicia nova seleção
                            selStart = periodoAtual;
                            selEnd = null;
                            // Redesenha para aplicar o "fade" nos meses distantes
                            renderizarCalendario();
                        } else {
                            // 2º Clique: Finaliza seleção
                            let inicio = selStart;
                            let fim = periodoAtual;
                            
                            if (compararChavesUI(fim, inicio) < 0) {
                                [inicio, fim] = [fim, inicio];
                            }
                            // Dupla checagem de segurança (embora visualmente já esteja bloqueado)
                            if (calcularDiferencaMeses(inicio, fim) <= MAX_MESES_FLUXO) {
                                selStart = inicio;
                                selEnd = fim;
                                onChange(selStart, selEnd);
                                // Redesenha para limpar o "fade" e mostrar o range final
                                renderizarCalendario();
                            }
                        }
                    };
                } else {
                    // Renderiza como slot desativado (cinza claro)
                    // Aplica-se a meses sem dados OU meses bloqueados pelo limite
                    divMes.className = 'filtro-mes-slot';
                    divMes.style.opacity = '0.3'; 
                    divMes.style.cursor = 'not-allowed';
                }
                grid.appendChild(divMes);
            }
            dropdown.appendChild(divAno);
        });
    };
    // Inicialização
    renderizarCalendario();
    return { dropdown, initialStart: selStart, initialEnd: selEnd };
}

export { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect, alternarEstadoCarregamento };