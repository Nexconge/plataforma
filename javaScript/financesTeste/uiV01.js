// ui.js - Módulo de Interface do Usuário
// Contém todas as funções relacionadas à manipulação do DOM,
// renderização de tabelas e gerenciamento de filtros.

// --- Funções Utilitárias de Formatação e DOM ---

function formatarValor(valor) {
    if (valor === 0) return '-';
    const numeroFormatado = Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return valor < 0 ? `(${numeroFormatado})` : numeroFormatado;
}

function formatarPercentual(valor) {
    if (!valor || valor === 0) return '0,0%';
    return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function sanitizeId(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\W+/g, '_').replace(/^_+|_+$/g, '');
}

function compararChaves(a, b) {
    const [mesA, anoA] = a.split('-').map(Number);
    const [mesB, anoB] = b.split('-').map(Number);
    if (anoA !== anoB) return anoA - anoB;
    return mesA - mesB;
}

function toggleLinha(id) {
    const filhos = document.querySelectorAll(`.parent-${id}`);
    if (filhos.length === 0) return;

    const algumVisivel = [...filhos].some(linha => !linha.classList.contains('hidden'));
    if (algumVisivel) {
        esconderDescendentes(id); // Recolhe toda a árvore
    } else {
        filhos.forEach(filho => filho.classList.remove('hidden')); // Expande apenas filhos diretos
    }
}

function esconderDescendentes(id) {
    const filhos = document.querySelectorAll(`.parent-${id}`);
    filhos.forEach(filho => {
        filho.classList.add('hidden');
        if (filho.id) {
            esconderDescendentes(filho.id); // Recursão para garantir que toda a árvore seja escondida
        }
    });
}

function getSelectItems(select) {
    if (!select.selectedOptions || select.selectedOptions.length === 0) {
        return Array.from(select.options).map(option => option.value);
    }
    return Array.from(select.selectedOptions).map(option => option.value);
}

// --- Funções de Configuração e Gerenciamento de Filtros ---

function configurarFiltros(appCache, anosDisponiveis, atualizarCallback) {
    const anoSelect = document.getElementById('anoSelect');
    const projSelect = document.getElementById('projSelect');
    const contaSelect = document.getElementById('contaSelect');
    const modoSelect = document.getElementById('modoSelect');
    const btnARealizar = document.getElementById('btnARealizar');
    const btnRealizado = document.getElementById('btnRealizado');
    
    if (!projSelect || !contaSelect || !modoSelect || !anoSelect || !btnARealizar || !btnRealizado) {
        console.error("Um ou mais elementos de filtro não foram encontrados no HTML.");
        return;
    }

    // Popula o filtro de projetos
    projSelect.innerHTML = '';
    Array.from(appCache.projetosMap.entries())
        .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
        .forEach(([codProj, { nome }]) => {
            const option = document.createElement('option');
            option.value = codProj; 
            option.textContent = nome;
            projSelect.appendChild(option);
        });
    if (projSelect.options.length > 0) projSelect.options[0].selected = true;

    // Adiciona event listeners para os filtros
    btnARealizar.addEventListener('click', () => {
        appCache.projecao = "arealizar";
        atualizarCallback();
    });
    btnRealizado.addEventListener('click', () => {
        appCache.projecao = "realizado";
        atualizarCallback();
    });
    anoSelect.addEventListener('change', atualizarCallback);
    contaSelect.addEventListener('change', atualizarCallback);
    projSelect.addEventListener('change', () => {
        const projetosSelecionados = getSelectItems(projSelect);
        atualizarFiltroContas(contaSelect, appCache.projetosMap, appCache.contasMap, projetosSelecionados);
        atualizarCallback();
    });
    modoSelect.addEventListener('change', () => {
        // Recalcula as opções de ano/período ao mudar entre mensal e anual
        const anosAtuais = Array.from(new Set(Array.from(anoSelect.options).map(opt => opt.value)));
        atualizarOpcoesAnoSelect(anoSelect, anosAtuais, modoSelect.value, appCache.projecao);
        atualizarCallback();
    });
    
    // Configuração inicial
    atualizarOpcoesAnoSelect(anoSelect, anosDisponiveis, modoSelect.value, appCache.projecao);
    const projetosSelecionadosInicial = getSelectItems(projSelect);
    atualizarFiltroContas(contaSelect, appCache.projetosMap, appCache.contasMap, projetosSelecionadosInicial);
    atualizarCallback();
}

function obterFiltrosAtuais() {
    const modoSelect = document.getElementById('modoSelect');
    const anoSelect = document.getElementById('anoSelect');
    const projSelect = document.getElementById('projSelect');
    const contaSelect = document.getElementById('contaSelect');

    if (!modoSelect || !anoSelect || !projSelect || !contaSelect) return null;

    const modo = modoSelect.value;
    const valorSelecionado = anoSelect.value;
    if (!valorSelecionado) return null;

    let anosParaProcessar = [];
    if (modo.toLowerCase() === 'mensal') {
        anosParaProcessar = [valorSelecionado];
    } else { // Anual (período de 6 anos)
        const anoInicio = Number(valorSelecionado);
        const anoFim = anoInicio + 5;
        for (let ano = anoInicio; ano <= anoFim; ano++) {
            anosParaProcessar.push(String(ano));
        }
    }
    
    const colunas = (modo.toLowerCase() === 'anual')
        ? [...anosParaProcessar].sort()
        : Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}-${valorSelecionado}`);

    return {
        modo,
        anos: anosParaProcessar,
        projetos: getSelectItems(projSelect).map(Number),
        contas: getSelectItems(contaSelect).map(Number),
        colunas
    };
}

function atualizarOpcoesAnoSelect(anoSelect, anosDisponiveis, modo, projecao) {
    const valorAtual = anoSelect.value;
    anoSelect.innerHTML = '';

    if (modo.toLowerCase() === 'mensal') {
        anosDisponiveis.forEach(ano => {
            const option = new Option(ano, ano);
            anoSelect.appendChild(option);
        });
        
        if (anosDisponiveis.includes(valorAtual)) {
            anoSelect.value = valorAtual;
        } else if (anosDisponiveis.length > 0) {
            // Default: mais recente para 'realizado', mais antigo para 'a realizar'
            anoSelect.value = projecao === "realizado" 
                ? anosDisponiveis[anosDisponiveis.length - 1] 
                : anosDisponiveis[0];
        }
    } else { // Modo Anual (períodos)
        const duracaoPeriodo = 6;
        const anosNums = anosDisponiveis.map(Number).filter(Boolean);
        if (anosNums.length === 0) anosNums.push(new Date().getFullYear());
        
        const menorAno = Math.min(...anosNums);
        const maiorAno = Math.max(...anosNums);
        const periodos = new Set();
        
        for (let ano = menorAno; ano <= maiorAno; ano++) {
            const inicioPeriodo = ano - ((ano - menorAno) % duracaoPeriodo);
            periodos.add(inicioPeriodo);
        }

        const periodosOrdenados = Array.from(periodos).sort((a, b) => b - a);
        periodosOrdenados.forEach(inicio => {
            const fim = inicio + duracaoPeriodo - 1;
            const option = new Option(`${inicio}-${fim}`, inicio);
            anoSelect.appendChild(option);
        });

        if (periodosOrdenados.includes(Number(valorAtual))) {
            anoSelect.value = valorAtual;
        } else if (periodosOrdenados.length > 0) {
            anoSelect.value = projecao === "realizado" 
                ? periodosOrdenados[0] // Mais recente
                : periodosOrdenados[periodosOrdenados.length - 1]; // Mais antigo
        }
    }
}

function atualizarFiltroContas(contaSelect, projetosMap, contasMap, projetosSelecionados) {
    const contasVisiveis = new Set();
    projetosSelecionados.forEach(codProj => {
        const projeto = projetosMap.get(Number(codProj));
        if (projeto) {
            projeto.contas.forEach(contaId => contasVisiveis.add(contaId));
        }
    });

    contaSelect.innerHTML = '';
    Array.from(contasMap.entries())
        .sort((a, b) => a[1].descricao.localeCompare(b[1].descricao))
        .forEach(([codigo, { descricao }]) => {
            if (contasVisiveis.has(codigo)) {
                const option = new Option(descricao, codigo);
                contaSelect.appendChild(option);
            }
        });
}

// --- Funções de Renderização ---

function atualizarVisualizacoes(dadosProcessados, colunas, appCache) {
    if (!dadosProcessados) {
        document.getElementById('tabelaMatriz').innerHTML = '';
        document.getElementById('tabelaCustos').innerHTML = '';
        document.getElementById('tabelaCapitalGiro').innerHTML = '';
        return;
    }
    const { matrizDRE, matrizDepartamentos, chavesDeControle, matrizCapitalGiro } = dadosProcessados;
    renderizarTabelaDRE(matrizDRE, colunas, appCache.userType, chavesDeControle);
    renderizarTabelaDepartamentos(appCache.categoriasMap, matrizDepartamentos, colunas);
    renderizarTabelaCapitalGiro(matrizCapitalGiro, colunas);
}

function renderizarTabelaDRE(matrizDRE, colunas, userType, chavesDeControle) {
    const tabela = document.getElementById('tabelaMatriz');
    tabela.innerHTML = '';
    const fragment = document.createDocumentFragment();

    const ordemClassesBase = [
        '(+) Receita Bruta', '(-) Deduções', '(=) Receita Líquida', '(-) Custos', '(-) Despesas',
        '(+/-) IRPJ/CSLL', '(+/-) Geração de Caixa Operacional', '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas',
        '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios', '(=) Movimentação de Caixa Mensal'
    ];
    const ordemClassesAdmin = ['Entrada de Transferência', 'Saída de Transferência', 'Outros'];
    const ordemClassesSaldo = ['Caixa Inicial', 'Caixa Final'];
    
    const ordemClasses = [...ordemClassesBase];
    if (userType && userType.toLowerCase() === 'developer') {
        ordemClasses.push(...ordemClassesAdmin);
    }
    ordemClasses.push(...ordemClassesSaldo);

    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr class="cabecalho">
            <th>Classe</th>
            ${colunas.map(col => `<th>${col}</th>`).join('')}
            <th>TOTAL</th>
        </tr>
        <tr><td colspan="${colunas.length + 2}" class="linhaBranco"></td></tr>
    `;
    fragment.appendChild(thead);
    
    const tbody = document.createElement('tbody');
    ordemClasses.forEach(classe => {
        const row = tbody.insertRow();
        row.insertCell().textContent = classe;

        if (['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal'].includes(classe)) {
            row.classList.add('linhatotal');
        } else if (['Caixa Inicial', 'Caixa Final'].includes(classe)) {
            row.classList.add('linhaSaldo');
        } else {
            row.cells[0].classList.add('idented');
        }

        const { primeiraChave, ultimaChave } = chavesDeControle || {};
        
        colunas.forEach(coluna => {
            let valor = matrizDRE[classe]?.[coluna] || 0;
            // Para saldos, exibe 0 fora do período com dados para evitar confusão
            if (primeiraChave && ultimaChave && (classe === 'Caixa Inicial' || classe === 'Caixa Final')) {
                if (compararChaves(coluna, primeiraChave) < 0 || compararChaves(coluna, ultimaChave) > 0) {
                    valor = 0;
                }
            }
            row.insertCell().textContent = formatarValor(valor);
        });
        
        const total = matrizDRE[classe]?.TOTAL || 0;
        row.insertCell().textContent = formatarValor(total);
        
        if (['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal', 'Outros'].includes(classe)) {
           tbody.insertRow().innerHTML = `<td colspan="${colunas.length + 2}" class="linhaBranco"></td>`;
        }
    });

    fragment.appendChild(tbody);
    tabela.appendChild(fragment);
}

function renderizarTabelaDepartamentos(categoriasMap, dadosAgrupados, colunas) {
    const tabela = document.getElementById('tabelaCustos');
    tabela.innerHTML = '';
    const fragment = document.createDocumentFragment();

    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr class="cabecalho">
            <th>Classe / Departamento / Categoria / Fornecedor</th>
            ${colunas.map(coluna => `<th>${coluna}</th>`).join('')}
            <th>TOTAL</th>
        </tr>
        <tr><td colspan="${colunas.length + 2}" class="linhaBranco"></td></tr>
    `;
    fragment.appendChild(thead);

    const tbody = document.createElement('tbody');
    
    const classesMap = {};
    Object.values(dadosAgrupados).forEach(deptoData => {
        const { classe, nome, categorias } = deptoData;
        if (!classesMap[classe]) classesMap[classe] = [];
        classesMap[classe].push({ nome, categorias });
    });

    const ordemClasses = ['(+) Receita Bruta', '(-) Deduções', '(-) Custos', '(-) Despesas', '(+/-) IRPJ/CSLL', '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas', '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios'];

    ordemClasses.forEach(classe => {
        if (classesMap[classe]) {
            renderClasse(classe, classesMap[classe], tbody, categoriasMap, colunas);
        }
    });
    
    Object.keys(classesMap).forEach(classe => {
        if (!ordemClasses.includes(classe)) {
            renderClasse(classe, classesMap[classe], tbody, categoriasMap, colunas);
        }
    });

    fragment.appendChild(tbody);
    tabela.appendChild(fragment);
}

function renderClasse(classe, departamentos, tbody, categoriasMap, colunas) {
    const classeId = `classe_${sanitizeId(classe)}`;
    const rowClasse = tbody.insertRow();
    rowClasse.className = 'linhaClasseDetalhamento';
    rowClasse.id = classeId;
    rowClasse.onclick = () => toggleLinha(classeId);
    rowClasse.insertCell().innerHTML = `<span class="expand-btn">[+]</span> ${classe}`;

    const totaisClasse = {};
    departamentos.forEach(dep => {
        Object.values(dep.categorias).forEach(cat => {
            colunas.forEach(col => {
                totaisClasse[col] = (totaisClasse[col] || 0) + (cat.valores[col] || 0);
            });
        });
    });
    colunas.forEach(col => rowClasse.insertCell().textContent = formatarValor(totaisClasse[col] || 0));
    rowClasse.insertCell().textContent = formatarValor(Object.values(totaisClasse).reduce((a, b) => a + b, 0));

    departamentos.forEach(dep => {
        const deptoId = `depto_${sanitizeId(dep.nome)}_${sanitizeId(classe)}`;
        const rowDepto = tbody.insertRow();
        rowDepto.className = `linhaDepto parent-${classeId} hidden`;
        rowDepto.id = deptoId;
        rowDepto.onclick = () => toggleLinha(deptoId);
        rowDepto.insertCell().innerHTML = `<span class="expand-btn">[+]</span> ${dep.nome}`;

        const totaisDepto = {};
        Object.values(dep.categorias).forEach(cat => {
            colunas.forEach(col => totaisDepto[col] = (totaisDepto[col] || 0) + (cat.valores[col] || 0));
        });
        colunas.forEach(col => rowDepto.insertCell().textContent = formatarValor(totaisDepto[col] || 0));
        rowDepto.insertCell().textContent = formatarValor(Object.values(totaisDepto).reduce((a, b) => a + b, 0));

        Object.entries(dep.categorias).forEach(([codCategoria, catData]) => {
            const catId = `${deptoId}_cat_${sanitizeId(codCategoria)}`;
            const rowCat = tbody.insertRow();
            rowCat.className = `linha-categoria parent-${deptoId} hidden`;
            rowCat.id = catId;
            rowCat.onclick = (e) => { e.stopPropagation(); toggleLinha(catId); };
            
            rowCat.insertCell().innerHTML = `<span class="expand-btn">[+]</span> ${categoriasMap.get(codCategoria) || 'Categoria desconhecida'}`;
            rowCat.cells[0].classList.add('idented');

            let totalCategoria = 0;
            colunas.forEach(coluna => {
                const valor = catData.valores[coluna] || 0;
                totalCategoria += valor;
                rowCat.insertCell().textContent = formatarValor(valor);
            });
            rowCat.insertCell().textContent = formatarValor(totalCategoria);

            Object.values(catData.fornecedores).sort((a, b) => b.total - a.total).forEach(fornecedorData => {
                const rowForn = tbody.insertRow();
                rowForn.className = `linha-lancamento parent-${catId} hidden`;
                rowForn.insertCell().textContent = fornecedorData.fornecedor;
                rowForn.cells[0].classList.add('idented2');
                
                colunas.forEach(coluna => {
                    const valor = fornecedorData.valores[coluna] || 0;
                    rowForn.insertCell().textContent = formatarValor(valor);
                });
                rowForn.insertCell().textContent = formatarValor(fornecedorData.total);
            });
        });
    });
}

function renderizarTabelaCapitalGiro(matriz, colunas) {
    const tabela = document.getElementById('tabelaCapitalGiro');
    if (!tabela) {
        console.error("Elemento 'tabelaCapitalGiro' não encontrado.");
        return;
    }
    tabela.innerHTML = '';
    if (!matriz || Object.keys(matriz).length === 0) return;

    try {
        const fragment = document.createDocumentFragment();

        const thead = document.createElement('thead');
        thead.innerHTML = `<tr class="cabecalho"><th>Capital de Giro</th>${colunas.map(c => `<th>${c}</th>`).join('')}</tr>`;
        fragment.appendChild(thead);

        const tbody = document.createElement('tbody');
        const criarLinha = (label, chave, isPercent = false, cssClass = '') => {
            const row = tbody.insertRow();
            if (cssClass) row.className = cssClass;
            row.insertCell().textContent = label;
            const formatFunc = isPercent ? formatarPercentual : formatarValor;
            colunas.forEach(col => {
                row.insertCell().textContent = formatFunc(matriz[chave]?.[col] || 0);
            });
        };
        const criarLinhaBranca = () => tbody.insertRow().innerHTML = `<td colspan="${colunas.length + 1}" class="linhaBranco"></td>`;

        criarLinha('(+) Caixa', '(+) Caixa', false, 'linhatotal');
        criarLinhaBranca();
        criarLinha('(+) Clientes a Receber', '(+) Clientes a Receber', false, 'linhatotal');
        criarLinha('Curto Prazo (30 dias)', 'Curto Prazo AR', false, 'idented');
        criarLinha('Longo Prazo (maior que 30 dias)', 'Longo Prazo AR', false, 'idented');
        criarLinha('Curto Prazo (%)', 'Curto Prazo AR %', true, 'idented');
        criarLinha('Longo Prazo (%)', 'Longo Prazo AR %', true, 'idented');
        criarLinhaBranca();
        criarLinha('(-) Fornecedores a Pagar', '(-) Fornecedores a Pagar', false, 'linhatotal');
        criarLinha('Curto Prazo (30 dias)', 'Curto Prazo AP', false, 'idented');
        criarLinha('Longo Prazo (maior que 30 dias)', 'Longo Prazo AP', false, 'idented');
        criarLinha('Curto Prazo (%)', 'Curto Prazo AP %', true, 'idented');
        criarLinha('Longo Prazo (%)', 'Longo Prazo AP %', true, 'idented');
        criarLinhaBranca();
        criarLinha('(+) Curto Prazo (30 dias)', '(+) Curto Prazo (30 dias)', false, 'linhatotal');
        criarLinha('(-) Longo Prazo (maior que 30 dias)', '(-) Longo Prazo (maior que 30 dias)', false, 'linhatotal');
        criarLinhaBranca();
        criarLinha('(=) Capital Líquido Circulante', '(=) Capital Líquido Circulante', false, 'linhaSaldo');

        fragment.appendChild(tbody);
        tabela.appendChild(fragment);
    } catch (error) {
        console.error("Erro ao renderizar a tabela de Capital de Giro:", error);
    }
}

export { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect };