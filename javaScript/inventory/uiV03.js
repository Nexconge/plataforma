// ui.js

// Função genérica para criar tabelas (Mais Vendidos / Maiores Saldos)
export function gerarTabelaPadrao(idTabela, titulo, colunas, dados) {
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
        html += `<tr><td colspan="2" class="empty-message">Sem dados para exibir.</td></tr>`;
    }

    html += `</tbody>`;
    tabela.innerHTML = html;
}

// Função específica para a tabela MRP
export function gerarTabelaRecomendacao(idTabela, dados) {
    const tabela = document.getElementById(idTabela);
    if (!tabela) return;

    let html = `
        <thead>
            <tr>
                <th colspan="5">Recomendação de Compra</th>
            </tr>
            <tr>
                <th>Produto</th>
                <th class="text-center">Estoque</th>
                <th class="text-center" title="Média últimos 90 dias">Venda/Dia</th>
                <th class="text-center" title="Ponto de Reposição">Est. Mínimo</th>
                <th class="text-right">Sugestão</th>
            </tr>
        </thead>
        <tbody>
    `;

    dados.forEach(dado => {
        // Define classes CSS baseadas na lógica
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
        html += `<tr><td colspan="5" class="empty-message">✅ Estoque saudável! Nenhuma compra urgente necessária.</td></tr>`;
    }

    html += `</tbody>`;
    tabela.innerHTML = html;
}