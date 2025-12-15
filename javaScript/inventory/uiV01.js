// ui.js

export function gerarTabelaPadrao(idTabela, titulo, colunas, dados) {
    const tabela = document.getElementById(idTabela);
    if (!tabela) return;

    let html = `
        <thead>
            <tr><th colspan="2" style="background-color: #333; color: #fff; text-align: left; padding: 10px;">${titulo}</th></tr>
            <tr>
                <th style="text-align: left; background-color: #f4f4f4; padding: 8px;">${colunas[0]}</th>
                <th style="text-align: right; background-color: #f4f4f4; padding: 8px;">${colunas[1]}</th>
            </tr>
        </thead>
        <tbody>
    `;

    dados.forEach(dado => {
        html += `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${dado.nome}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${dado.quantidade}</td>
            </tr>
        `;
    });
    html += `</tbody>`;
    tabela.innerHTML = html;
}

export function gerarTabelaRecomendacao(idTabela, dados) {
    const tabela = document.getElementById(idTabela);
    if (!tabela) return;

    let html = `
        <thead>
            <tr><th colspan="4" style="background-color: #d9534f; color: #fff; text-align: left; padding: 10px;">Recomendação de Compra (Risco de Ruptura)</th></tr>
            <tr style="font-size: 12px;">
                <th style="text-align: left; background-color: #f4f4f4; padding: 8px;">Produto</th>
                <th style="text-align: center; background-color: #f4f4f4; padding: 8px;">Estoque</th>
                <th style="text-align: center; background-color: #f4f4f4; padding: 8px;">Demanda</th>
                <th style="text-align: right; background-color: #f4f4f4; padding: 8px;">Sugestão</th>
            </tr>
        </thead>
        <tbody>
    `;

    dados.forEach(dado => {
        const corEstoque = dado.estoque <= 0 ? '#d9534f' : '#f0ad4e';
        const corTexto = dado.estoque <= 0 ? 'white' : 'black';

        html += `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee; font-size: 13px;">${dado.nome}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">
                    <span style="background-color: ${corEstoque}; color: ${corTexto}; padding: 2px 6px; border-radius: 4px; font-size: 11px;">
                        ${dado.estoque}
                    </span>
                </td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${dado.demanda}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #d9534f;">+${dado.sugestao}</td>
            </tr>
        `;
    });

    if (dados.length === 0) {
        html += `<tr><td colspan="4" style="padding:10px; text-align:center;">Estoque saudável.</td></tr>`;
    }

    html += `</tbody>`;
    tabela.innerHTML = html;
}