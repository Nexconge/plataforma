// uiV10.js

function alternarVisibilidadeFiltros(visivel) {
    const controlesSaldos = document.getElementById("controlesMaioresSaldos");
    const controlesVendas = document.getElementById("controlesMaisVendidos");
    const display = visivel ? "flex" : "none";
    
    if (controlesSaldos) controlesSaldos.style.display = display;
    if (controlesVendas) controlesVendas.style.display = display;
}

export function popularFiltroMesesDisponiveis(dados, mesSelecionadoAtual) {
    const selectMes = document.getElementById("mesFiltro");
    if (!selectMes) return mesSelecionadoAtual;

    const mesesUnicos = new Set();
    
    // DEBUG: Verifica o que exatamente está chegando na primeira posição para vermos a estrutura
    if (dados.maisVendidos.length > 0) {
        console.log("Exemplo de item mais vendido:", dados.maisVendidos[0]); 
    }

    dados.maisVendidos.forEach(item => {
        // Se `vendasPorMes` for um objeto direto
        if (item.vendasPorMes && typeof item.vendasPorMes === 'object') {
            Object.keys(item.vendasPorMes).forEach(mes => mesesUnicos.add(mes));
        } 
        // Caso o Bubble/Python tenha transformado em string, tentamos fazer o parse
        else if (item.vendasPorMes && typeof item.vendasPorMes === 'string') {
            try {
                const mesesObj = JSON.parse(item.vendasPorMes);
                Object.keys(mesesObj).forEach(mes => mesesUnicos.add(mes));
            } catch (e) {
                console.warn("Falha ao ler vendasPorMes do item", item.nome);
            }
        }
    });

    const mesesOrdenados = Array.from(mesesUnicos).sort((a, b) => b.localeCompare(a));
    console.log("Meses encontrados e ordenados:", mesesOrdenados); // DEBUG

    selectMes.innerHTML = ""; 

    const optTodos = document.createElement("option");
    optTodos.value = "";
    optTodos.text = "Todos os Meses (Total)";
    selectMes.appendChild(optTodos);

    mesesOrdenados.forEach(mes => {
        const opt = document.createElement("option");
        opt.value = mes;
        try {
            const [ano, numMes] = mes.split('-');
            const dataObj = new Date(ano, parseInt(numMes) - 1);
            const mesFormatado = dataObj.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
            opt.text = mesFormatado.charAt(0).toUpperCase() + mesFormatado.slice(1);
        } catch {
            opt.text = mes; 
        }
        selectMes.appendChild(opt);
    });

    if (mesSelecionadoAtual && mesesUnicos.has(mesSelecionadoAtual)) {
        selectMes.value = mesSelecionadoAtual;
        return mesSelecionadoAtual;
    } else {
        selectMes.value = "";
        return ""; 
    }
}

export function renderizarDashboards(dados, estadoApp) {
    // 1. Mostrar os filtros pois agora temos dados
    alternarVisibilidadeFiltros(true);

    const novoMes = popularFiltroMesesDisponiveis(dados, estadoApp.mesFiltroVendas);
    estadoApp.mesFiltroVendas = novoMes; 

    // Mais Vendidos
    let listaVendas = [...dados.maisVendidos];
    if (estadoApp.mesFiltroVendas && estadoApp.mesFiltroVendas !== "") {
        listaVendas = listaVendas.map(item => {
            let dicionarioMeses = item.vendasPorMes;
            // Proteção extra caso venha como string JSON
            if(typeof dicionarioMeses === 'string') {
                try { dicionarioMeses = JSON.parse(dicionarioMeses); } catch(e){ dicionarioMeses = {}; }
            }

            const qtdNoMes = (dicionarioMeses && dicionarioMeses[estadoApp.mesFiltroVendas]) 
                ? dicionarioMeses[estadoApp.mesFiltroVendas] : 0;
                
            return { ...item, quantidade: qtdNoMes, valorTotal: qtdNoMes * item.valorUnitario };
        }).filter(item => item.quantidade > 0); 
    }
    listaVendas.sort((a, b) => b.quantidade - a.quantidade);
    
    gerarTabelaDetalhada(
        "tabelaMaisVendidos",
        estadoApp.mesFiltroVendas ? `Mais Movimentados (${estadoApp.mesFiltroVendas})` : "Produtos Mais Movimentados (Total)",
        listaVendas
    );

    // Maiores Saldos
    let listaSaldos = [...dados.maioresSaldos];
    listaSaldos.sort((a, b) => {
        if (estadoApp.ordenacaoSaldos === 'valor') return b.valorTotal - a.valorTotal;
        return b.quantidade - a.quantidade;
    });

    gerarTabelaDetalhada(
        "tabelaMaioresSaldos",
        `Maiores Estoques (Por ${estadoApp.ordenacaoSaldos === 'valor' ? 'Valor Financeiro' : 'Quantidade'})`,
        listaSaldos
    );

    // MRP
    let listaMRP = [...dados.recomendacaoCompra];
    listaMRP.sort((a, b) => b.vendaMedia - a.vendaMedia);
    gerarTabelaRecomendacao("tabelaRecomendacaoCompra", listaMRP);
    
    aplicarLogicaDeFiltro(estadoApp.filtrosAtivos); 
}

export function renderizarPlaceholders() {
    // 2. Esconder os filtros enquanto espera
    alternarVisibilidadeFiltros(false);

    gerarTabelaDetalhada("tabelaMaisVendidos", "Produtos Mais Movimentados", [], "Aguardando seleção...");
    gerarTabelaDetalhada("tabelaMaioresSaldos", "Maiores Saldos", [], "Aguardando seleção...");
    gerarTabelaRecomendacao("tabelaRecomendacaoCompra", [], "Aguardando seleção...");
}

export function limparTabelas() {
    renderizarPlaceholders();
}

export function renderizarTagNoHTML(tipo, termo, callbackRemocao) {
    const container = document.getElementById("tag-container");
    const input = document.getElementById("tag-input");

    const tag = document.createElement("div");
    tag.className = `tag ${tipo === 'inc' ? 'tag-inc' : 'tag-exc'}`;
    tag.innerHTML = `<b>${tipo}:</b>${termo} <span class="remove-btn">&times;</span>`;

    tag.querySelector(".remove-btn").onclick = () => {
        tag.remove();
        callbackRemocao(tipo, termo);
    };

    container.insertBefore(tag, input);
}

export function aplicarLogicaDeFiltro(filtrosAtivos) {
    const tabela = document.getElementById("tabelaRecomendacaoCompra");
    if (!tabela) return;

    const linhas = tabela.querySelectorAll("tbody tr");
    const filtrosInc = filtrosAtivos.filter(f => f.tipo === 'inc');
    const filtrosExc = filtrosAtivos.filter(f => f.tipo === 'exc');

    linhas.forEach(linha => {
        const nomeProduto = linha.cells[0]?.innerText.toLowerCase() || "";
        let deveExibir = true;

        if (filtrosInc.length > 0) deveExibir = filtrosInc.some(f => nomeProduto.includes(f.termo.toLowerCase()));
        if (filtrosExc.length > 0) {
            const matchesExc = filtrosExc.some(f => nomeProduto.includes(f.termo.toLowerCase()));
            if (matchesExc) deveExibir = false;
        }

        linha.style.display = deveExibir ? "" : "none";
    });
}

// Função para preencher Selects
export function preencherSelect(idElemento, dados, placeholder = "Selecione...") {
    const select = document.getElementById(idElemento);
    if (!select) return;

    select.innerHTML = "";
    
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.text = placeholder;
    defaultOption.disabled = true;
    defaultOption.selected = true;
    select.appendChild(defaultOption);

    dados.forEach(item => {
        const option = document.createElement("option");
        option.value = item.id;
        option.text = item.nome;
        select.appendChild(option);
    });
}

// Formatadores
const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNumero = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// --- TABELA DETALHADA (Compatível com dados antigos) ---
export function gerarTabelaDetalhada(idTabela, titulo, dados, msgVazia = "Sem dados para exibir.") {
    const tabela = document.getElementById(idTabela);
    if (!tabela) return;

    // Cabeçalho sempre mostra as 5 colunas
    let html = `
        <thead>
            <tr>
                <th colspan="5">${titulo}</th>
            </tr>
            <tr>
                <th>Produto</th>
                <th class="text-center">Qtd.</th>
                <th class="text-right">Vl. Unit.</th>
                <th class="text-right">Vl. Total</th>
                <th class="text-center">Vendas/Dia</th>
            </tr>
        </thead>
        <tbody>
    `;

    dados.forEach(dado => {
        // Lógica de proteção: Se o campo não existir, renderiza string vazia
        // Usamos "!= null" para pegar tanto null quanto undefined
        const vlUnit = (dado.valorUnitario != null) ? fmtMoeda.format(dado.valorUnitario) : "";
        const vlTotal = (dado.valorTotal != null) ? fmtMoeda.format(dado.valorTotal) : "";
        const vDia = (dado.vendasDia != null) ? fmtNumero.format(dado.vendasDia) : "";

        html += `
            <tr>
                <td>${dado.nome}</td>
                <td class="text-center font-bold">${dado.quantidade}</td>
                <td class="text-right">${vlUnit}</td>
                <td class="text-right">${vlTotal}</td>
                <td class="text-center">${vDia}</td>
            </tr>
        `;
    });
    
    if (dados.length === 0) {
        html += `<tr><td colspan="5" class="empty-message">${msgVazia}</td></tr>`;
    }

    html += `</tbody>`;
    tabela.innerHTML = html;
}

// Mantida função antiga caso seja necessária em outros módulos, 
// mas o mainV32 vai usar a detalhada agora.
export function gerarTabelaPadrao(idTabela, titulo, colunas, dados, msgVazia = "Sem dados para exibir.") {
    const tabela = document.getElementById(idTabela);
    if (!tabela) return;

    let html = `
        <thead>
            <tr><th colspan="2">${titulo}</th></tr>
            <tr><th>${colunas[0]}</th><th class="text-right">${colunas[1]}</th></tr>
        </thead>
        <tbody>
    `;

    dados.forEach(dado => {
        html += `
            <tr>
                <td>${dado.nome}</td>
                <td class="text-right font-bold">${dado.quantidade}</td>
            </tr>
        `;
    });
    
    if (dados.length === 0) html += `<tr><td colspan="2" class="empty-message">${msgVazia}</td></tr>`;
    html += `</tbody>`;
    tabela.innerHTML = html;
}

// Tabela MRP (Recomendação) - Sem alterações estruturais
export function gerarTabelaRecomendacao(idTabela, dados, msgVazia = "Estoque saudável! Nenhuma compra urgente necessária.") {
    const tabela = document.getElementById(idTabela);
    if (!tabela) return;

    if(dados.length > 0) {
        dados.sort((a, b) => b.vendaMedia - a.vendaMedia);
    }

    let html = `
        <thead>
            <tr>
                <th colspan="5">Recomendação de Compra</th>
            </tr>
            <tr>
                <th>Produto</th>
                <th class="text-center">Estoque</th>
                <th class="text-center" title="Média últimos 90 dias">Venda/Dia</th>
                <th class="text-center" title="Ponto de Reposição considerando margem de segurança de 50%">Est. Mínimo</th>
                <th class="text-right">Sugestão</th>
            </tr>
        </thead>
        <tbody>
    `;

    dados.forEach(dado => {
        const classeBadge = dado.estoqueAtual <= 0 ? 'badge-vermelho' : 'badge-amarelo';

        html += `
            <tr>
                <td>${dado.nome}</td>
                <td class="text-center">
                    <span class="badge-estoque ${classeBadge}">
                        ${dado.estoqueAtual}
                    </span>
                </td>
                <td class="text-center">${dado.vendaMedia}</td>
                <td class="text-center font-bold">${dado.estoqueMinimo}</td>
                <td class="text-right sugestao-compra">+${dado.sugestao}</td>
            </tr>
        `;
    });

    if (dados.length === 0) {
        html += `<tr><td colspan="5" class="empty-message">${msgVazia}</td></tr>`;
    }

    html += `</tbody>`;
    tabela.innerHTML = html;
}