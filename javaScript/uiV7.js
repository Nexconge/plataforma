// ui.js

// --- CORREÇÃO --- Importa as funções de processamento que serão usadas pela UI
import { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE } from './processingV6.js';

// Funções que não dependem de estado externo
function formatarValor(valor) {
    if (valor === 0) return '-';
    const numeroFormatado = Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0});
    return valor < 0 ? `(${numeroFormatado})` : numeroFormatado;
}
function sanitizeId(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\W+/g, '_').replace(/^_+|_+$/g, '');
}
function toggleLinha(id) {
    const linhas = document.querySelectorAll(`.parent-${id}`);
    linhas.forEach(linha => {
        const isHidden = linha.classList.toggle('hidden');
        if (isHidden && linha.id) {
            const filhos = document.querySelectorAll(`.parent-${linha.id}`);
            filhos.forEach(filho => filho.classList.add('hidden'));
        }
    });
}
function getSelectItems(select){
    if(!select.selectedOptions || select.selectedOptions.length === 0){
        return Array.from(select.options).map(option => option.value);
    }
    return Array.from(select.selectedOptions).map(option => option.value);
}
/**
 * Renderiza a tabela de DRE, agora com colunas dinâmicas.
 * @param {object} matrizDRE - Os dados processados para o DRE.
 * @param {string[]} colunas - As colunas a serem exibidas (meses ou anos).
 */
function renderizarTabelaDRE(matrizDRE, colunas, userType) {
    const tabela = document.getElementById('tabelaMatriz');
    tabela.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // Define a ordem base das classes que todos os usuários veem
    const ordemClasses = [
        '(+) Receita Bruta', '(-) Deduções', '(=) Receita Líquida', '(-) Custos', '(-) Despesas',
        '(+/-) IRPJ/CSLL', '(+/-) Geração de Caixa Operacional', '(+/-) Resultado Financeiro', '(+/-) Aportes/Retiradas',
        '(+/-) Investimentos', '(+/-) Empréstimos/Consórcios', '(=) Movimentação de Caixa Mensal'
    ];
    // Adiciona as classes extras APENAS se o usuário for Admin
    if (userType === 'Admin') {
        ordemClasses.push('Entrada de Transferência', 'Saída de Transferência', 'Outros');
    }
    // Adiciona as linhas de saldo, que sempre aparecem no final para todos
    ordemClasses.push('Caixa Inicial', 'Caixa Final');

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

        // Aplica estilos
        if (['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional', '(=) Movimentação de Caixa Mensal'].includes(classe)) {
            row.classList.add('linhatotal');
        } else if (['Caixa Inicial', 'Caixa Final'].includes(classe)) {
            row.classList.add('linhaSaldo');
        } else {
            cellClasse.classList.add('idented');
        }

        let totalLinha = 0;
        colunas.forEach(coluna => {
            const valor = matrizDRE[classe]?.[coluna] || 0;
            if (!['Caixa Inicial', 'Caixa Final'].includes(classe)) {
                totalLinha += valor;
            }
            row.insertCell().textContent = formatarValor(valor);
        });
        
        if (classe === 'Caixa Final') {
            const ultimoValor = matrizDRE[classe]?.[colunas[colunas.length - 1]] || 0;
            row.insertCell().textContent = formatarValor(ultimoValor);
        } else if (classe === 'Caixa Inicial') {
            const primeiroValor = matrizDRE[classe]?.[colunas[0]] || 0;
            row.insertCell().textContent = formatarValor(primeiroValor);
        } else {
            row.insertCell().textContent = formatarValor(totalLinha);
        }
        
        if(['(=) Receita Líquida', '(+/-) Geração de Caixa Operacional','(=) Movimentação de Caixa Mensal','Outros'].includes(classe)){
           tbody.insertRow().innerHTML = `<td colspan="${colunas.length + 2}" class="linhaBranco"></td>`;
        }
    });

    fragment.appendChild(tbody);
    tabela.appendChild(fragment);
}

/**
 * Renderiza a tabela de Custos/Despesas por Departamento, com colunas dinâmicas.
 * @param {object} dadosAgrupados - Os dados processados e agrupados por classe, com totais.
 * @param {string[]} colunas - As colunas a serem exibidas (meses ou anos).
 */
function renderizarTabelaDepartamentos(categoriasMap, dadosAgrupados, colunas) {
    const tabela = document.getElementById('tabelaCustos');
    tabela.innerHTML = '';
    const fragment = document.createDocumentFragment();

    const thead = document.createElement('thead');
    const headRow = thead.insertRow();
    headRow.className = 'cabecalho';
    headRow.insertCell().textContent = 'Departamento / Categoria / Fornecedor';
    colunas.forEach(coluna => { // LOOP CORRIGIDO
        headRow.insertCell().textContent = coluna;
    });
    headRow.insertCell().textContent = 'TOTAL';
    thead.insertRow().innerHTML = `<td colspan="${colunas.length + 2}" class="linhaBranco"></td>`;
    fragment.appendChild(thead);

    const tbody = document.createElement('tbody');
    Object.entries(dadosAgrupados).forEach(([classe, grupoData]) => {
        if (grupoData.deptoMap.size === 0) return;

        const rowClasse = tbody.insertRow();
        rowClasse.className = 'linhaSaldo';
        rowClasse.insertCell().textContent = classe;
        grupoData.totaisMensais.forEach(valor => { // LOOP CORRIGIDO (indireto)
            rowClasse.insertCell().textContent = formatarValor(valor);
        });
        rowClasse.insertCell().textContent = formatarValor(grupoData.totalGeral);

        grupoData.deptoMap.forEach((item) => {
            const { nome, categorias } = item;
            const deptoId = `depto_${sanitizeId(nome)}_${sanitizeId(classe)}`;
            const rowDepto = tbody.insertRow();
            rowDepto.className = 'linhatotal';
            rowDepto.onclick = () => toggleLinha(deptoId);
            const cellDepto = rowDepto.insertCell();
            cellDepto.innerHTML = `<span class="expand-btn">[+]</span> ${nome}`;

            const totaisDepartamento = Array(colunas.length).fill(0); // LOOP CORRIGIDO
            Object.values(categorias).forEach(cat => {
                colunas.forEach((coluna, index) => { // LOOP CORRIGIDO
                    totaisDepartamento[index] += cat.valores[coluna] || 0;
                });
            });
            
            totaisDepartamento.forEach(valor => {
                rowDepto.insertCell().textContent = formatarValor(valor);
            });
            rowDepto.insertCell().textContent = formatarValor(totaisDepartamento.reduce((a, b) => a + b, 0));
            
            Object.entries(categorias).forEach(([codCategoria, catData]) => {
                const catId = `${deptoId}_cat_${sanitizeId(codCategoria)}`;
                const rowCat = tbody.insertRow();
                rowCat.className = `linha-categoria parent-${deptoId} hidden`;
                rowCat.id = catId;
                rowCat.onclick = (e) => { e.stopPropagation(); toggleLinha(catId); };
                const cellCat = rowCat.insertCell();
                cellCat.className = 'idented';
                cellCat.innerHTML = `<span class="expand-btn">[+]</span> ${categoriasMap.get(codCategoria) || 'Categoria desconhecida'}`;

                let totalCategoria = 0;
                colunas.forEach(coluna => { // LOOP CORRIGIDO
                    const valor = catData.valores[coluna] || 0;
                    totalCategoria += valor;
                    rowCat.insertCell().textContent = formatarValor(valor);
                });
                rowCat.insertCell().textContent = formatarValor(totalCategoria);
                
                catData.fornecedores.forEach(fornecedorData => {
                    const rowLan = tbody.insertRow();
                    rowLan.className = `linha-lancamento parent-${catId} hidden`;
                    const cellLan = rowLan.insertCell();
                    cellLan.className = 'idented2';
                    cellLan.textContent = fornecedorData.fornecedor;

                    let totalLancamento = 0;
                    colunas.forEach(coluna => { // LOOP CORRIGIDO
                        const valor = fornecedorData.valores[coluna] || 0;
                        totalLancamento += valor;
                        rowLan.insertCell().textContent = formatarValor(valor);
                    });
                    rowLan.insertCell().textContent = formatarValor(totalLancamento);
                });
            });
        });
    });
    fragment.appendChild(tbody);
    tabela.appendChild(fragment);
}
// Funções de UI que precisam do estado (appCache)
function atualizarOpcoesAnoSelect(anoSelect, anosDisponiveis, modo) {
    anoSelect.innerHTML = '';
    if (modo.toLowerCase() === 'mensal') {
        anosDisponiveis.forEach(ano => {
            const option = document.createElement('option');
            option.value = ano; option.textContent = ano;
            anoSelect.appendChild(option);
        });
        anoSelect.value = anosDisponiveis[anosDisponiveis.length - 1] || '';
    } else { // anual
        const periodos = new Set();
        anosDisponiveis.forEach(ano => {
            const anoNum = Number(ano);
            const inicioPeriodo = Math.floor((anoNum - 1) / 5) * 5 + 1;
            periodos.add(inicioPeriodo);
        });
        const periodosOrdenados = Array.from(periodos).sort((a, b) => b - a);
        periodosOrdenados.forEach(inicio => {
            const fim = inicio + 4;
            const option = document.createElement('option');
            option.value = inicio; option.textContent = `${inicio}-${fim}`;
            anoSelect.appendChild(option);
        });
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

function atualizarVisualizacoes(appCache, fContasESaldo, fProcessaLancamentos, fCalculaTotais) {
    const modoSelect = document.getElementById('modoSelect'), anoSelect = document.getElementById('anoSelect');
    const projSelect = document.getElementById('projSelect'), contaSelect = document.getElementById('contaSelect');
    const modo = modoSelect.value, valorSelecionado = anoSelect.value;
    if (!valorSelecionado) return;

    let anosParaProcessar = [];
    if (modo.toLowerCase() === 'mensal') {
        anosParaProcessar = [valorSelecionado];
    } else {
        const anoInicio = Number(valorSelecionado);
        const anoFim = anoInicio + 4;
        for (let ano = anoInicio; ano <= anoFim; ano++) {
            if (appCache.anosDisponiveis.includes(String(ano))) {
                anosParaProcessar.push(String(ano));
            }
        }
    }
    if (anosParaProcessar.length === 0) return;
    
    const colunas = (modo.toLowerCase() === 'anual') ? [...anosParaProcessar].sort() : Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}-${valorSelecionado}`);
    const projetosSelecionados = getSelectItems(projSelect);
    const contasSelecionadas = getSelectItems(contaSelect);

    const { contasFiltradas, saldoBase } = fContasESaldo(appCache.projetosMap, appCache.contasMap, projetosSelecionados, contasSelecionadas);
    const { matrizDRE, matrizDepartamentos, saldoInicialPeriodo, chavesComDados } = fProcessaLancamentos(appCache, modo, anosParaProcessar, contasFiltradas, saldoBase);
    
    fCalculaTotais(matrizDRE, colunas, saldoInicialPeriodo, chavesComDados);

    const dadosTabelaDeptos = {
        '(-) Custos': { deptoMap: new Map(), totaisMensais: Array(colunas.length).fill(0), totalGeral: 0 },
        '(-) Despesas': { deptoMap: new Map(), totaisMensais: Array(colunas.length).fill(0), totalGeral: 0 }
    };
    Object.values(matrizDepartamentos).forEach(item => {
        const grupo = dadosTabelaDeptos[item.classe];
        if (grupo) {
            grupo.deptoMap.set(`${item.nome}|${item.classe}`, item);
            Object.values(item.categorias).forEach(cat => {
                colunas.forEach((coluna, index) => {
                    const valor = cat.valores[coluna] || 0;
                    if (valor !== 0) {
                        grupo.totaisMensais[index] += valor;
                        grupo.totalGeral += valor;
                    }
                });
            });
        }
    });

    renderizarTabelaDRE(matrizDRE, colunas, appCache.userType);
    renderizarTabelaDepartamentos(appCache.categoriasMap, dadosTabelaDeptos, colunas);
}

function configurarFiltros(appCache, atualizarCallback) {
    const anoSelect = document.getElementById('anoSelect'), projSelect = document.getElementById('projSelect');
    const contaSelect = document.getElementById('contaSelect'), modoSelect = document.getElementById('modoSelect');
    
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
    anoSelect.addEventListener('change', atualizarCallback);
    contaSelect.addEventListener('change', atualizarCallback);
    projSelect.addEventListener('change', () => {
        const projetosSelecionados = getSelectItems(projSelect);
        atualizarFiltroContas(contaSelect, appCache.projetosMap, appCache.contasMap, projetosSelecionados);
        atualizarCallback();
    });
    modoSelect.addEventListener('change', () => {
        atualizarOpcoesAnoSelect(anoSelect, appCache.anosDisponiveis, modoSelect.value);
        atualizarCallback();
    });

    // Configura o filtro de ano
    atualizarOpcoesAnoSelect(anoSelect, appCache.anosDisponiveis, modoSelect.value);
    // Atualiza o filtro de contas com base no projeto selecionado
    const projetosSelecionadosInicial = getSelectItems(projSelect);
    atualizarFiltroContas(contaSelect, appCache.projetosMap, appCache.contasMap, projetosSelecionadosInicial);
    atualizarCallback();
}

/**
 * Captura os filtros selecionados e formata o período (anos) para a API.
 * @returns {object|null} Um objeto com os filtros para a API ou null se algum elemento não for encontrado.
 */
function obterFiltrosSelecionados() {
    const modoSelect = document.getElementById('modoSelect');
    const anoSelect = document.getElementById('anoSelect');
    const projSelect = document.getElementById('projSelect');
    const contaSelect = document.getElementById('contaSelect');

    if (!modoSelect || !anoSelect || !projSelect || !contaSelect) {
        console.error("Um ou mais elementos de filtro não foram encontrados no HTML.");
        return null;
    }

    let anosParaApi = [];
    const modo = modoSelect.value;
    const anoSelecionado = anoSelect.value;

    if (modo.toLowerCase() === 'mensal') {
        // Se o modo for mensal, o array contém apenas o ano selecionado.
        if (anoSelecionado) {
            anosParaApi.push(anoSelecionado);
        }
    } else if (modo.toLowerCase() === 'anual') {
        // Se o modo for anual, gera um array com 5 anos a partir do ano inicial.
        const anoInicio = Number(anoSelecionado);
        if (anoInicio) {
            const anoFim = anoInicio + 4;
            for (let ano = anoInicio; ano <= anoFim; ano++) {
                anosParaApi.push(String(ano));
            }
        }
    }

    const contasEmTexto = getSelectItems(contaSelect);
    const contasEmNumero = contasEmTexto.map(Number); // Converte cada item do array para número
    
    const filtros = {
        anos: anosParaApi,
        projetos: getSelectItems(projSelect), // Reutiliza a função auxiliar existente
        contas: contasEmNumero
    };
    return filtros;
}

export { configurarFiltros, atualizarVisualizacoes, obterFiltrosSelecionados };