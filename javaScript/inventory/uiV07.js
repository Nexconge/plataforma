// uiV04.js

// Função para preencher Selects (Dropdowns)
export function preencherSelect(idElemento, dados, placeholder = "Selecione...") {
    const select = document.getElementById(idElemento);
    if (!select) return;

    select.innerHTML = ""; // Limpa anterior
    
    // Opção padrão
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

export function gerarTabelaPadrao(idTabela, titulo, colunas, dados, msgVazia = "Sem dados para exibir.") {
    const tabela = document.getElementById(idTabela);
    if (!tabela) return;

    let html = `
        <thead>
            <tr>
                <th colspan="2">${titulo}</th>
            </tr>
            <tr>
                <th>${colunas[0]}</th>
                <th class="text-right">${colunas[1]}</th>
            </tr>
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
    
    if (dados.length === 0) {
        html += `<tr><td colspan="2" class="empty-message">${msgVazia}</td></tr>`;
    }

    html += `</tbody>`;
    tabela.innerHTML = html;
}

// Função específica para a tabela MRP
export function gerarTabelaRecomendacao(idTabela, dados, msgVazia = "Estoque saudável! Nenhuma compra urgente necessária.") {
    const tabela = document.getElementById(idTabela);
    if (!tabela) return;

    //Ordena por venda/dia (proteção caso venha vazio)
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