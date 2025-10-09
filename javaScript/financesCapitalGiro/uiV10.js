// ui.js

// Funções que não dependem de estado externo
function formatarValor(valor) {
    if (valor === 0) return '-';
    const numeroFormatado = Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0});
    return valor < 0 ? `(${numeroFormatado})` : numeroFormatado;
}
function formatarPercentual(valor) {
    if (!valor || valor === 0) return '0,0%';
    // Garante que o número seja formatado com uma casa decimal.
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
        // Recolher: esconde todos os filhos e descendentes
        esconderDescendentes(id);
    } else {
        // Expandir: mostra apenas os filhos diretos
        filhos.forEach(filho => filho.classList.remove('hidden'));
    }
}
function esconderDescendentes(id) {
    const filhos = document.querySelectorAll(`.parent-${id}`);
    filhos.forEach(filho => {
        filho.classList.add('hidden');
        if (filho.id) {
            esconderDescendentes(filho.id); // recursão para esconder toda a árvore
        }
    });
}
function getSelectItems(select){
    if(!select.selectedOptions || select.selectedOptions.length === 0){
        return Array.from(select.options).map(option => option.value);
    }
    return Array.from(select.selectedOptions).map(option => option.value);
}
function configurarFiltros(appCache,anosDisponiveis, atualizarCallback) {
    const anoSelect = document.getElementById('anoSelect'), projSelect = document.getElementById('projSelect');
    const contaSelect = document.getElementById('contaSelect'), modoSelect = document.getElementById('modoSelect');
    const btnARealizar = document.getElementById('btnARealizar'), btnRealizado = document.getElementById('btnRealizado')
    if(!projSelect || !contaSelect || !modoSelect || !anoSelect) {
        console.error("Um ou mais elementos de filtro não foram encontrados no HTML.");
        return;
    }
    //Pupula o filtro de projetos
    projSelect.innerHTML = '';
    Array.from(appCache.projetosMap.entries())
        .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
        .forEach(([codProj, { nome }]) => {
            const option = document.createElement('option');
            option.value = codProj; option.textContent = nome;
            projSelect.appendChild(option);
        });
    // Seleciona o primeiro projeto da lista, se houver algum
    if (projSelect.options.length > 0) {
        projSelect.options[0].selected = true;
    }

    //Adiciona event listeners para atualizar as visualizações
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
        atualizarOpcoesAnoSelect(anoSelect, anosDisponiveis, modoSelect.value, appCache.projecao);
        atualizarCallback();
    });
    // Configura o filtro de ano
    atualizarOpcoesAnoSelect(anoSelect, anosDisponiveis, modoSelect.value, appCache.projecao);
    // Atualiza o filtro de contas com base no projeto selecionado
    const projetosSelecionadosInicial = getSelectItems(projSelect);
    atualizarFiltroContas(contaSelect, appCache.projetosMap, appCache.contasMap, projetosSelecionadosInicial);
    atualizarCallback();
}
function obterFiltrosAtuais() {
    const modoSelect = document.getElementById('modoSelect');
    const anoSelect = document.getElementById('anoSelect');
    const projSelect = document.getElementById('projSelect');
    const contaSelect = document.getElementById('contaSelect');

    if (!modoSelect || !anoSelect || !projSelect || !contaSelect) {
        console.error("Um ou mais elementos de filtro não foram encontrados no HTML.");
        return null;
    }

    const modo = modoSelect.value;
    const valorSelecionado = anoSelect.value;
    if (!valorSelecionado) return null;

    let anosParaProcessar = [];
    if (modo.toLowerCase() === 'mensal') {
        anosParaProcessar = [valorSelecionado];
    } else {
        const anoInicio = Number(valorSelecionado);
        const anoFim = anoInicio + 5;
        for (let ano = anoInicio; ano <= anoFim; ano++) {
            anosParaProcessar.push(String(ano));
        }
    }
    
    const colunas = (modo.toLowerCase() === 'anual')
        ? [...anosParaProcessar].sort()
        : Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}-${valorSelecionado}`);

    const projetos = getSelectItems(projSelect).map(Number);
    const contas = getSelectItems(contaSelect).map(Number);

    return {
        modo: modo,
        anos: anosParaProcessar,
        projetos: projetos,
        contas: contas,
        colunas: colunas
    };
}
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
function atualizarFiltroContas(contaSelect, projetosMap, contasMap, projetosSelecionados) {
    const contasProjetos = new Set();
    projetosSelecionados.forEach(codProj => {
        const projeto = projetosMap.get(codProj);
        if(projeto){
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


function atualizarVisualizacoes(dadosProcessados, colunas, appCache) {
    if (!dadosProcessados) {
        document.getElementById('tabelaMatriz').innerHTML = '';
        document.getElementById('tabelaCustos').innerHTML = '';
        document.getElementById('tabelaCapitalGiro').innerHTML = '';
        return;
    }
    const { matrizDRE, matrizDepartamentos, PeUChave, matrizCapitalGiro } = dadosProcessados;
    renderizarTabelaDRE(matrizDRE, colunas, appCache.userType, PeUChave);
    renderizarTabelaDepartamentos(appCache.categoriasMap, matrizDepartamentos, colunas);
    renderizarTabelaCapitalGiro(matrizCapitalGiro, colunas);
}
/**
 * @param {object} matrizDRE - Os dados processados para o DRE.
 * @param {string[]} colunas - As colunas a serem exibidas (meses ou anos).
 */
function renderizarTabelaDRE(matrizDRE, colunas, userType, PeUchave) {
    const tabela = document.getElementById('tabelaMatriz');
    tabela.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // Define a ordem base das classes que todos os usuários veem
    const ordemClasses = [
        '(+) Receita Bruta', '(-) Deduções', '(=) Receita Líquida', '(-) Custos', '(-) Despesas',
        '(+/-) IRPJ/CSLL', '(+/-) Geração de Caixa Operacional', '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas',
        '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios', '(=) Movimentação de Caixa Mensal'
    ];
    // Adiciona as classes extras APENAS se o usuário for developer
    if (userType && userType.toLowerCase() === 'developer') {
        ordemClasses.push('Entrada de Transferência', 'Saída de Transferência', 'Outros');
    }
    // Adiciona as linhas de saldo, que sempre aparecem no final para todos
    ordemClasses.push('Caixa Inicial', 'Caixa Final');
    // Adiciona as classes extras APENAS se o usuário for Admin
    if (userType && userType.toLowerCase() === 'developer') {
        ordemClasses.push('(+) Entradas', '(-) Saídas');
    }

    const thead = document.createElement('thead');
    const headerRow = thead.insertRow();
    headerRow.className = 'cabecalho';
    headerRow.insertCell().textContent = 'Classe';
    colunas.forEach(coluna => {
        headerRow.insertCell().textContent = coluna;
    });
    headerRow.insertCell().textContent = 'TOTAL';
    thead.insertRow().innerHTML = `<td colspan="${colunas.length + 2}" class="linhaBranco"></td>`;
    fragment.appendChild(thead);
    
    const tbody = document.createElement('tbody');

    ordemClasses.forEach(classe => {
        const row = tbody.insertRow();
        const cellClasse = row.insertCell();
        cellClasse.textContent = classe;

        if (['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal'].includes(classe)) {
            row.classList.add('linhatotal');
        } else if (['Caixa Inicial', 'Caixa Final'].includes(classe)) {
            row.classList.add('linhaSaldo');
        } else {
            cellClasse.classList.add('idented');
        }

        const hoje = new Date();
        const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');
        const anoAtual = new Date().getFullYear();
        const primeiraChave = PeUchave?.primeiraChave || `${mesAtual}-${anoAtual}`;
        const ultimaChave = PeUchave?.ultimaChave || colunas[colunas.length - 1];
        // Renderiza os valores das colunas visíveis
        colunas.forEach(coluna => {
            let valor = matrizDRE[classe]?.[coluna] || 0;
            // Se for Caixa Inicial ou Final e a coluna for anterior à primeiraChave → força 0
            if (classe === 'Caixa Inicial' || classe === 'Caixa Final'){
                if((compararChaves(coluna, primeiraChave) < 0) || (compararChaves(coluna, ultimaChave) > 0)){
                    valor = 0
                }
            }
            row.insertCell().textContent = formatarValor(valor);
        });
        
        // Lê diretamente a propriedade 'TOTAL' pré-calculada
        const total = matrizDRE[classe]?.TOTAL || 0;
        row.insertCell().textContent = formatarValor(total);
        
        // Adiciona uma linha em branco após certas classes para melhorar a legibilidade
        if(['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional','(=) Movimentação de Caixa Mensal','Outros'].includes(classe)){
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

    fragment.appendChild(tbody);
    tabela.appendChild(fragment);
}
function renderClasse(classe, departamentos, tbody, categoriasMap, colunas) {
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
 * Renderiza a tabela de Capital de Giro no elemento HTML 'tabelaCapitalGiro'.
 * @param {object} matriz - A matriz de dados gerada pela função gerarMatrizCapitalGiro.
 * @param {string[]} colunas - O array de colunas (períodos) a serem exibidos.
 */
function renderizarTabelaCapitalGiro(matriz, colunas) {

    const tabela = document.getElementById('tabelaCapitalGiro');

    if (!tabela) {
        console.error("ERRO CRÍTICO: O elemento com id 'tabelaCapitalGiro' não foi encontrado no HTML. A função será interrompida.");
        return;
    }
    
    tabela.innerHTML = '';
    
    if (!matriz || Object.keys(matriz).length === 0) {
        console.warn("AVISO: A matriz de dados (matrizCapitalGiro) está vazia ou é inválida. Nada será renderizado.");
        return;
    }

    try {
        const fragment = document.createDocumentFragment();

        // Cria o Cabeçalho
        const thead = document.createElement('thead');
        const headerRow = thead.insertRow();
        headerRow.className = 'cabecalho';
        headerRow.insertCell().textContent = 'Capital de Giro';
        colunas.forEach(col => headerRow.insertCell().textContent = col);
        fragment.appendChild(thead);

        const tbody = document.createElement('tbody');

        // Funções auxiliares
        const criarLinha = (label, chaveDados, isPercent = false, cssClass = '') => {
            const row = tbody.insertRow();
            if (cssClass) row.classList.add(cssClass);
            
            const cellLabel = row.insertCell();
            cellLabel.textContent = label;
            
            const formatFunc = isPercent ? formatarPercentual : formatarValor;
            colunas.forEach(col => {
                const valor = matriz[chaveDados]?.[col] || 0;
                const cell = row.insertCell();
                cell.textContent = formatFunc(valor);
            });
            const ultimaCelula = row.insertCell();
            ultimaCelula.textContent = formatFunc(0);
        };
        const criarLinhaBranca = () => tbody.insertRow().innerHTML = `<td colspan="${colunas.length + 1}" class="linhaBranco"></td>`;

        // Monta o corpo da tabela
        criarLinha('(+) Caixa', '(+) Caixa', false, 'linhatotal');
        criarLinhaBranca();
        criarLinha('(+) Clientes a Receber', '(+) Clientes a Receber', false, 'linhatotal');
        criarLinha('Curto Prazo (30 dias)', 'Curto Prazo AR', false, 'idented');
        // ... (o restante da montagem da tabela continua aqui dentro)
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
        console.error("ERRO DURANTE A RENDERIZAÇÃO: Um erro inesperado ocorreu ao construir a tabela.", error);
    }
}


export { configurarFiltros, atualizarVisualizacoes, obterFiltrosAtuais, atualizarOpcoesAnoSelect };