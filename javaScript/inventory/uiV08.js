// uiV07.js

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
const fmtNumero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

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