// ui.js
// Este módulo contém todas as funções relacionadas à manipulação do DOM.
// Inclui formatação de valores, gerenciamento de filtros, e a renderização das tabelas de dados.

// --- Funções Utilitárias de Formatação e DOM ---
/**
 * Formata um número para exibição monetária no padrão brasileiro.
 * Números negativos são envolvidos por parênteses. Zeros são exibidos como '-'.
 * @param {number} valor - O número a ser formatado.
 * @returns {string} O valor formatado como string.
 */
function formatarValor(valor) {
    if (valor === 0) return '-';
    const numeroFormatado = Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0});
    return valor < 0 ? `(${numeroFormatado})` : numeroFormatado;
}
/**
 * Formata um número como um percentual com uma casa decimal.
 * @param {number} valor - O número a ser formatado.
 * @returns {string} O valor formatado como string de percentual (ex: "15,5%").
 */
function formatarPercentual(valor) {
    if (!valor || valor === 0) return '0,0%';
    return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
/**
 * Limpa e sanitiza uma string para que possa ser usada como um ID de elemento HTML.
 * Remove acentos, caracteres especiais e espaços.
 * @param {string} str - A string a ser sanitizada.
 * @returns {string} A string segura para ser usada como ID.
 */
function sanitizeId(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\W+/g, '_').replace(/^_+|_+$/g, '');
}
/**
 * Compara duas chaves de período ("MM-AAAA") para ordenação cronológica.
 * @param {string} a - Primeira chave.
 * @param {string} b - Segunda chave.
 * @returns {number} Negativo se a < b, positivo se a > b, 0 se iguais.
 */
function compararChaves(a, b) {
    const [mesA, anoA] = a.split('-').map(Number);
    const [mesB, anoB] = b.split('-').map(Number);
    if (anoA !== anoB) return anoA - anoB;
    return mesA - mesB;
}
/**
 * Alterna a visibilidade das linhas filhas diretas de um elemento em uma tabela hierárquica.
 * @param {string} id - O ID do elemento pai cuja linha foi clicada.
 */
function toggleLinha(id) {
    const filhos = document.querySelectorAll(`.parent-${id}`);
    if (filhos.length === 0) return;
    const algumVisivel = [...filhos].some(linha => !linha.classList.contains('hidden'));
    if (algumVisivel) {
        esconderDescendentes(id); // Se algum filho está visível, recolhe toda a árvore.
    } else {
        filhos.forEach(filho => filho.classList.remove('hidden')); // Senão, expande apenas o primeiro nível.
    }
}
/**
 * Esconde recursivamente todos os descendentes de uma linha pai em uma tabela.
 * @param {string} id - O ID do elemento pai.
 */
function esconderDescendentes(id) {
    const filhos = document.querySelectorAll(`.parent-${id}`);
    filhos.forEach(filho => {
        filho.classList.add('hidden');
        if (filho.id) {
            esconderDescendentes(filho.id); // Chamada recursiva para garantir que toda a sub-árvore seja escondida.
        }
    });
}
/**
 * Obtém os valores selecionados de um elemento <select>.
 * Se nenhuma opção estiver selecionada, retorna os valores de todas as opções.
 * @param {HTMLSelectElement} select - O elemento select do qual obter os itens.
 * @returns {Array<string>} Um array com os valores das opções selecionadas (ou todas).
 */
function getSelectItems(select){
    if (!select.selectedOptions || select.selectedOptions.length === 0){
        return Array.from(select.options).map(option => option.value);
    }
    return Array.from(select.selectedOptions).map(option => option.value);
}

// --- Funções de Gerenciamento de Filtros ---
/**
 * Configura os elementos de filtro, popula seus dados iniciais e anexa os event listeners.
 * @param {object} appCache - O cache da aplicação.
 * @param {Array<string>} anosDisponiveis - Um array inicial de anos para popular o filtro.
 * @param {Function} atualizarCallback - A função a ser chamada quando qualquer filtro mudar (geralmente `handleFiltroChange`).
 */
function configurarFiltros(appCache, anosDisponiveis, atualizarCallback) {
    const anoSelect = document.getElementById('anoSelect'), projSelect = document.getElementById('projSelect');
    const contaSelect = document.getElementById('contaSelect'), modoSelect = document.getElementById('modoSelect');
    const btnARealizar = document.getElementById('btnARealizar'), btnRealizado = document.getElementById('btnRealizado');

    // Popula o filtro de projetos.
    projSelect.innerHTML = '';
    Array.from(appCache.projetosMap.entries())
        .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
        .forEach(([codProj, { nome }]) => {
            const option = document.createElement('option');
            option.value = codProj; option.textContent = nome;
            projSelect.appendChild(option);
        });
    if (projSelect.options.length > 0) projSelect.options[0].selected = true;

    // Adiciona event listeners para os botões e selects que disparam a atualização dos dados.
    btnARealizar.addEventListener('click', () => { appCache.projecao = "arealizar"; atualizarCallback(); });
    btnRealizado.addEventListener('click', () => { appCache.projecao = "realizado"; atualizarCallback(); });
    anoSelect.addEventListener('change', atualizarCallback);
    contaSelect.addEventListener('change', atualizarCallback);
    projSelect.addEventListener('change', () => {
        const projetosSelecionados = getSelectItems(projSelect);
        atualizarFiltroContas(contaSelect, appCache.projetosMap, appCache.contasMap, projetosSelecionados);
        atualizarCallback();
    });
    modoSelect.addEventListener('change', () => {
        atualizarOpcoesAnoSelect(anoSelect, anosDisponiveis, modoSelect.value, appCache.projecao);
        atualizarCallback();
    });

    // Configuração inicial dos filtros e primeira chamada para carregar os dados.
    atualizarOpcoesAnoSelect(anoSelect, anosDisponiveis, modoSelect.value, appCache.projecao);
    const projetosSelecionadosInicial = getSelectItems(projSelect);
    atualizarFiltroContas(contaSelect, appCache.projetosMap, appCache.contasMap, projetosSelecionadosInicial);
    atualizarCallback();
}
/**
 * Lê o estado atual de todos os elementos de filtro na UI e os compila em um objeto.
 * @returns {object|null} Um objeto contendo o estado dos filtros, ou null se algum elemento não for encontrado.
 * // Estrutura do objeto de retorno:
 * // {
 * //   modo: "mensal",
 * //   anos: ["2025"],
 * //   projetos: [123, 456],
 * //   contas: [789],
 * //   colunas: ["01-2025", "02-2025", ..., "12-2025"]
 * // }
 */
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
    } else { // Modo anual/período
        const anoInicio = Number(valorSelecionado);
        const anoFim = anoInicio + 5;
        for (let ano = anoInicio; ano <= anoFim; ano++) anosParaProcessar.push(String(ano));
    }
    
    // Gera as colunas para a tabela com base no modo (anual ou mensal).
    const colunas = (modo.toLowerCase() === 'anual')
        ? [...anosParaProcessar].sort()
        : Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}-${valorSelecionado}`);

    const projetos = getSelectItems(projSelect).map(Number);
    const contas = getSelectItems(contaSelect).map(Number);

    return { modo, anos: anosParaProcessar, projetos, contas, colunas };
}
/**
 * Atualiza as opções do <select> de ano/período com base nos dados disponíveis e no modo de visualização.
 * @param {HTMLSelectElement} anoSelect - O elemento select a ser atualizado.
 * @param {Array<string>} anosDisponiveis - Anos com dados para as contas selecionadas.
 * @param {string} modo - 'mensal' ou 'anual'.
 * @param {string} projecao - 'realizado' ou 'arealizar'.
 */
function atualizarOpcoesAnoSelect(anoSelect, anosDisponiveis, modo, projecao) {
    //salve o valor atual para tentar preservar a seleção mais tarde
    const valorAtual = anoSelect.value;
    anoSelect.innerHTML = '';

    //Se modo de visualização for mensal, popula com anos disponíveis  
    if (modo.toLowerCase() === 'mensal') {
        anosDisponiveis.forEach(ano => {
            const option = document.createElement('option');
            option.value = ano;
            option.textContent = ano;
            anoSelect.appendChild(option);
        });
        // Preserva a seleção atual se ainda estiver disponível
        if (anosDisponiveis.includes(valorAtual)) {
            anoSelect.value = valorAtual;
        // Se não estiver disponível, seleciona o mais recente para realizado e o mais antigo para a realizar
        } else if (projecao == "realizado") {
            anoSelect.value = anosDisponiveis[anosDisponiveis.length - 1] || '';
        } else {
            anoSelect.value = anosDisponiveis[0] || '';
        }
    // modo de visualização por periodo anual
    } else { 
        const duracaoP = 6; // cada período tem 6 anos
        const periodos = [];
        const anosNums = anosDisponiveis.map(a => Number(a));
        const anoAtual = new Date().getFullYear();

        // Primeiro período
        let primeiroInicio;
        //Se a projeção for a realizar, o primeiro período começa no ano atual + 5 anos
        if (projecao.toLowerCase() === 'arealizar') {
            primeiroInicio = anoAtual; // AnoAtual-(AnoAtual+5)
        } else {
        // Se a projeção for realizado, o primeiro período começa 5 anos atrás até o ano atual
            primeiroInicio = anoAtual - duracaoP + 1; // (AnoAtual-5)-AnoAtual
        }

        const anosDisponiveisSet = new Set(anosNums);
        // Função que verifica se ao menos um ano do período está disponível
        const periodoValido = (inicio) => {
            for (let i = 0; i < duracaoP; i++) {
                if (anosDisponiveisSet.has(inicio + i)) return true;
            }
            return false;
        };
        //Adiciona primeiro ano do período inicial e anteriores
        let inicio = primeiroInicio;
        while(true){
            if(periodoValido(inicio)){
                periodos.push(inicio);
                inicio = inicio - duracaoP;
            } else {
                break;
            }
        }
        //Adiciona primeiro ano dos posteriores ao inicial
        inicio = primeiroInicio + duracaoP;
        while(true){
            if(periodoValido(inicio)){
                periodos.push(inicio);
                inicio = inicio + duracaoP;
            } else {
                break;
            }
        }
        // Remove duplicados e ordena do mais recente para o mais antigo
        const periodosUnicos = Array.from(new Set(periodos)).sort((a, b) => b - a);
        // Transforma os anos inicials em periodos aaaI-aaaF
        periodosUnicos.forEach(inicio => {
            const fim = inicio + duracaoP - 1;
            const option = document.createElement('option');
            option.value = inicio;
            option.textContent = `${inicio}-${fim}`;
            anoSelect.appendChild(option);
        });
        
        // Preserva a seleção atual do período se ainda estiver disponível
        const valorAtualNum = Number(valorAtual);
        const periodoAtual = periodosUnicos.find(p => valorAtualNum >= p && valorAtualNum <= p + duracaoP - 1);
        if (periodoAtual !== undefined) {
            anoSelect.value = periodoAtual;
        } else if (projecao.toLowerCase() === "realizado") {
            // pega o último período
            anoSelect.value = periodosUnicos[0] || '';
        } else {
            // pega o primeiro período
            anoSelect.value = periodosUnicos[periodosUnicos.length - 1] || '';
        }
    }
}
/**
 * Atualiza o <select> de contas, mostrando apenas as contas associadas aos projetos selecionados.
 * @param {HTMLSelectElement} contaSelect - O elemento select de contas.
 * @param {Map} projetosMap - O mapa de projetos do cache.
 * @param {Map} contasMap - O mapa de contas do cache.
 * @param {Array<string>} projetosSelecionados - IDs dos projetos selecionados.
 */
function atualizarFiltroContas(contaSelect, projetosMap, contasMap, projetosSelecionados) {
    const contasProjetos = new Set();
    projetosSelecionados.forEach(codProj => {
        const projeto = projetosMap.get(String(codProj)); // Garantir que a chave seja string
        if (projeto) {
            projeto.contas.forEach(conta => contasProjetos.add(conta));
        }
    });

    contaSelect.innerHTML = '';
    Array.from(contasMap.entries())
        .sort((a, b) => a[1].descricao.localeCompare(b[1].descricao))
        .forEach(([codigo, { descricao }]) => {
            if (contasProjetos.has(codigo)) {
                const option = document.createElement('option');
                option.value = codigo; option.textContent = descricao;
                contaSelect.appendChild(option);
            }
        });
}
// --- Funções de Renderização de Tabelas ---
/**
 * Orquestrador principal da renderização. Chama as funções específicas para renderizar cada tabela.
 * @param {object|null} dadosProcessados - O objeto de dados final vindo de `mergeMatrizes`, ou nulo para limpar as tabelas.
 * @param {Array<string>} colunas - As colunas (períodos) a serem exibidas.
 * @param {object} appCache - O cache da aplicação.
 */
function atualizarVisualizacoes(dadosProcessados, colunas, appCache) {
    if (!dadosProcessados) {
        document.getElementById('tabelaMatriz').innerHTML = '';
        document.getElementById('tabelaCustos').innerHTML = '';
        document.getElementById('tabelaCapitalGiro').innerHTML = '';
        return;
    }
    const { matrizDRE, matrizDepartamentos, matrizCapitalGiro } = dadosProcessados;
    renderizarTabelaDRE(matrizDRE, colunas, appCache.userType);
    renderizarTabelaDepartamentos(appCache.categoriasMap, matrizDepartamentos, colunas);
    renderizarTabelaCapitalGiro(matrizCapitalGiro, colunas);
}
/**
 * Renderiza a tabela principal da DRE (Demonstração de Resultado).
 * @param {object} matrizDRE - Os dados processados para a DRE.
 * @param {Array<string>} colunas - As colunas a serem exibidas (meses ou anos).
 * @param {string} userType - O tipo de usuário, para exibir/ocultar linhas específicas.
 * @param {object} PeUchave - Objeto com a primeira e última chave de período com dados.
 */
function renderizarTabelaDRE(matrizDRE, colunas, userType) {
    const tabela = document.getElementById('tabelaMatriz');
    tabela.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // Define a ordem de exibição das linhas da DRE.
    const ordemClasses = [
        '(+) Receita Bruta', '(-) Deduções', '(=) Receita Líquida', '(-) Custos', '(-) Despesas',
        '(+/-) IRPJ/CSLL', '(+/-) Geração de Caixa Operacional', '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas',
        '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios', '(=) Movimentação de Caixa Mensal'
    ];
    // Adiciona linhas extras para usuários 'developer'.
    if (userType && userType.toLowerCase() === 'developer') {
        ordemClasses.push('Entrada de Transferência', 'Saída de Transferência', 'Outros');
    }
    ordemClasses.push('Caixa Inicial', 'Caixa Final');

    // Cria o cabeçalho da tabela.
    const thead = document.createElement('thead');
    const headerRow = thead.insertRow();
    headerRow.className = 'cabecalho';
    headerRow.insertCell().textContent = 'Classe';
    colunas.forEach(coluna => headerRow.insertCell().textContent = coluna);
    headerRow.insertCell().textContent = 'TOTAL';
    fragment.appendChild(thead);
    
    // Cria o corpo da tabela.
    const tbody = document.createElement('tbody');
    ordemClasses.forEach(classe => {
        
        const row = tbody.insertRow();
        row.insertCell().textContent = classe;
        // Aplica estilos CSS com base no tipo de linha.
        if (['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal'].includes(classe)) {
            row.classList.add('linhatotal');
        } else if (['Caixa Inicial', 'Caixa Final'].includes(classe)) {
            row.classList.add('linhaSaldo');
        }

        // Renderiza os valores para cada coluna do período.
        colunas.forEach(coluna => {
            const valor = matrizDRE[classe]?.[coluna] || 0;
            row.insertCell().textContent = formatarValor(valor);
        });
        
        // Renderiza o valor da coluna TOTAL (já pré-calculado).
        const total = matrizDRE[classe]?.TOTAL || 0;
        row.insertCell().textContent = formatarValor(total);
        
        // Adiciona linhas em branco para espaçamento visual.
        if(['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional','(=) Movimentação de Caixa Mensal','Outros'].includes(classe)){
           tbody.insertRow().innerHTML = `<td colspan="${colunas.length + 2}" class="linhaBranco"></td>`;
        }
    });

    fragment.appendChild(tbody);
    tabela.appendChild(fragment);
}
/**
 * Renderiza a tabela de detalhamento por Departamentos/Categorias/Fornecedores.
 * @param {Map} categoriasMap - O mapa de categorias para traduzir códigos em nomes.
 * @param {object} dadosAgrupados - A `matrizDepartamentos` vinda dos dados processados.
 * @param {Array<string>} colunas - As colunas de período a serem exibidas.
 */
function renderizarTabelaDepartamentos(categoriasMap, dadosAgrupados, colunas) {
    const tabela = document.getElementById('tabelaCustos');
    tabela.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // Cabeçalho
    const thead = document.createElement('thead');
    const headRow = thead.insertRow();
    headRow.className = 'cabecalho';
    headRow.insertCell().textContent = 'Classe / Departamento / Categoria / Fornecedor';
    colunas.forEach(coluna => {
        headRow.insertCell().textContent = coluna;
    });
    headRow.insertCell().textContent = 'TOTAL';
    thead.insertRow().innerHTML = `<td colspan="${colunas.length + 2}" class="linhaBranco"></td>`;
    fragment.appendChild(thead);

    const tbody = document.createElement('tbody');

    // Agrupa departamentos por classe
    const classesMap = {};
    Object.entries(dadosAgrupados).forEach(([chave, deptoData]) => {
        const { nome, classe, categorias } = deptoData;
        if (!classesMap[classe]) {
            classesMap[classe] = [];
        }
        classesMap[classe].push({ nome, categorias });
    });

    // Ordem fixa das classes
    const ordemClasses = [
        '(+) Receita Bruta', '(-) Deduções', '(=) Receita Líquida',
        '(-) Custos', '(-) Despesas',
        '(+/-) IRPJ/CSLL', '(+/-) Geração de Caixa Operacional',
        '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas',
        '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios',
        '(=) Movimentação de Caixa Mensal'
    ];

    // Renderiza as classes na ordem definida
    ordemClasses.forEach(classe => {
        if (classesMap[classe]) {
            renderClasse(classe, classesMap[classe], tbody, categoriasMap, colunas);
        }
    });

    // Caso existam classes não previstas em ordemClasses, renderiza no fim
    Object.keys(classesMap).forEach(classe => {
        if (!ordemClasses.includes(classe)) {
            renderClasse(classe, classesMap[classe], tbody, categoriasMap, colunas);
        }
    });

    let row = tbody.insertRow().innerHTML = `<td colspan="${colunas.length + 2}" class="linhaBranco"></td>`;
    row.insertCell().textContent = "(+) Entradas"
    colunas.forEach(col => {
        row.insertCell().textContent = matrizDepartamentos['(+) Entradas'][col]
    })
    row = tbody.insertRow().innerHTML = `<td colspan="${colunas.length + 2}" class="linhaBranco"></td>`;
    row.insertCell().textContent = "(-) Saídas"
    colunas.forEach(col => {
        row.insertCell().textContent = matrizDepartamentos['(-) Saídas'][col]
    })

    fragment.appendChild(tbody);
    tabela.appendChild(fragment);
}
function renderClasse(classe, departamentos, tbody, categoriasMap, colunas) {

    console.log(`Renderiziando classe: ${classe}`)
    const classeId = `classe_${sanitizeId(classe)}`;
    const rowClasse = tbody.insertRow();
    rowClasse.className = 'linhaClasseDetalhamento';
    rowClasse.id = classeId;
    rowClasse.onclick = () => toggleLinha(classeId);

    const cellClasse = rowClasse.insertCell();
    cellClasse.innerHTML = `<span class="expand-btn">[+]</span> ${classe}`;

    // Totais da classe
    const totaisClasse = Array(colunas.length).fill(0);
    departamentos.forEach(dep => {
        Object.values(dep.categorias).forEach(cat => {
            colunas.forEach((coluna, idx) => {
                totaisClasse[idx] += cat.valores[coluna] || 0;
            });
        });
    });
    totaisClasse.forEach(valor => {
        rowClasse.insertCell().textContent = formatarValor(valor);
    });
    rowClasse.insertCell().textContent = formatarValor(totaisClasse.reduce((a, b) => a + b, 0));

    // Renderiza departamentos
    departamentos.forEach(dep => {
        const deptoId = `depto_${sanitizeId(dep.nome)}_${sanitizeId(classe)}`;
        const rowDepto = tbody.insertRow();
        rowDepto.className = `linhaDepto parent-${classeId} hidden`;
        rowDepto.id = deptoId;
        rowDepto.onclick = () => toggleLinha(deptoId);

        const cellDepto = rowDepto.insertCell();
        cellDepto.innerHTML = `<span class="expand-btn">[+]</span> ${dep.nome}`;

        const totaisDepto = Array(colunas.length).fill(0);
        Object.values(dep.categorias).forEach(cat => {
            colunas.forEach((coluna, idx) => {
                totaisDepto[idx] += cat.valores[coluna] || 0;
            });
        });
        totaisDepto.forEach(valor => {
            rowDepto.insertCell().textContent = formatarValor(valor);
        });
        rowDepto.insertCell().textContent = formatarValor(totaisDepto.reduce((a, b) => a + b, 0));

        // Categorias
        Object.entries(dep.categorias).forEach(([codCategoria, catData]) => {
            const catId = `${deptoId}_cat_${sanitizeId(codCategoria)}`;
            const rowCat = tbody.insertRow();
            rowCat.className = `linha-categoria parent-${deptoId} hidden`;
            rowCat.id = catId;
            rowCat.onclick = (e) => { e.stopPropagation(); toggleLinha(catId); };

            const cellCat = rowCat.insertCell();
            cellCat.className = 'idented';
            cellCat.innerHTML = `<span class="expand-btn">[+]</span> ${categoriasMap.get(codCategoria) || 'Categoria desconhecida'}`;

            let totalCategoria = 0;
            colunas.forEach(coluna => {
                const valor = catData.valores[coluna] || 0;
                totalCategoria += valor;
                rowCat.insertCell().textContent = formatarValor(valor);
            });
            rowCat.insertCell().textContent = formatarValor(totalCategoria);

            Object.values(catData.fornecedores)
                .sort((a, b) => b.total - a.total)
                .forEach(fornecedorData => {
                    const rowLan = tbody.insertRow();
                    rowLan.className = `linha-lancamento parent-${catId} hidden`;
                    const cellLan = rowLan.insertCell();
                    cellLan.className = 'idented2';
                    cellLan.textContent = fornecedorData.fornecedor;

                    let totalFornecedor = 0;
                    colunas.forEach(coluna => {
                        const valor = fornecedorData.valores[coluna] || 0;
                        totalFornecedor += valor;
                        rowLan.insertCell().textContent = formatarValor(valor);
                    });
                    rowLan.insertCell().textContent = formatarValor(totalFornecedor);
                });
        });
    });
}
/**
 * Renderiza a tabela de Capital de Giro.
 * @param {object} matriz - A matriz de dados gerada por `gerarMatrizCapitalGiro`.
 * @param {Array<string>} colunas - O array de colunas (períodos) a serem exibidos.
 */
function renderizarTabelaCapitalGiro(matriz, colunas) {
    const tabela = document.getElementById('tabelaCapitalGiro');
    // Validação de segurança: verifica se o elemento da tabela existe no DOM.
    if (!tabela) {
        console.error("ERRO CRÍTICO: O elemento com id 'tabelaCapitalGiro' não foi encontrado no HTML.");
        return;
    }
    tabela.innerHTML = '';
    // Validação de segurança: verifica se há dados para renderizar.
    if (!matriz || Object.keys(matriz).length === 0) {
        console.warn("AVISO: A matriz de dados (matrizCapitalGiro) está vazia. Nada será renderizado.");
        return;
    }
    try {
        const fragment = document.createDocumentFragment();

        // Cria o Cabeçalho da tabela.
        const thead = document.createElement('thead');
        const headerRow = thead.insertRow();
        headerRow.className = 'cabecalho';
        headerRow.insertCell().textContent = 'Capital de Giro';
        colunas.forEach(col => headerRow.insertCell().textContent = col);
        fragment.appendChild(thead);

        const tbody = document.createElement('tbody');

        // Função auxiliar para criar uma linha de dados na tabela, evitando repetição de código.
        const criarLinha = (label, chaveDados, isPercent = false, cssClass = '') => {
            const row = tbody.insertRow();
            if (cssClass) row.classList.add(cssClass);
            
            row.insertCell().textContent = label;
            const formatFunc = isPercent ? formatarPercentual : formatarValor;
            colunas.forEach(col => {
                const valor = matriz[chaveDados]?.[col] || 0;
                row.insertCell().textContent = formatFunc(valor);
            });
        };
        const criarLinhaBranca = () => tbody.insertRow().innerHTML = `<td colspan="${colunas.length + 1}" class="linhaBranco"></td>`;

        // Monta o corpo da tabela usando a função auxiliar.
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
        console.error("ERRO DURANTE A RENDERIZAÇÃO: Um erro inesperado ocorreu ao construir a tabela de Capital de Giro.", error);
    }
}

export { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect };