// ScriptProposta.js
// ----------------------------
// Importa e injeta o modal no container
document.addEventListener('DOMContentLoaded', () => {
    fetch('https://cdn.jsdelivr.net/gh/nexconge/plataforma/html/menuProposta.html')
        .then(response => {
            if (!response.ok) {
                throw new Error('Não foi possível carregar o modal.');
            }
            return response.text();
        })
        .then(html => {
            document.getElementById('modal-container').innerHTML = html;
            inicializarMenuProposta();
        })
        .catch(error => console.error('Erro ao carregar o modal:', error));
});


// ----------------------------
// Função principal para gerar o PDF
async function gerarProposta() {
    const { jsPDF } = window.jspdf;

    // Captura os dados do formulário
    const dados = {
        // Lote
        quadra: document.getElementById('propQuadra')?.value || '',
        lote: document.getElementById('propLoteNome')?.textContent || '',
        area: parseFloat(document.getElementById('propLoteArea')?.textContent) || 0,
        valorTotal: parseFloat(document.getElementById('propLoteValor')?.textContent.replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.')) || 0,
        valorMetroQuadrado: parseFloat(document.getElementById('propValorMetro')?.value) || 0,

        // Cliente
        nomeCliente: document.getElementById('propClienteNome').value || '',
        cpfCliente: document.getElementById('propClienteCPF').value || '',
        emailCliente: document.getElementById('propClienteEmail').value || '',
        telefoneCliente: document.getElementById('propClienteTelefone').value || '',
        profissaoCliente: document.getElementById('propClienteProfissao')?.value || '',
        estadoCivilCliente: document.getElementById('propClienteEstadoCivil')?.value || '',
        enderecoCliente: document.getElementById('propClienteEndereco')?.value || '',
        cidadeCliente: document.getElementById('propClienteCidade')?.value || '',

        // Financeiro
        finValorEntrada: parseFloat(document.getElementById('propValorEntrada').value) || 0,
        finDataEntrada: document.getElementById('propDataEntrada').value || '',
        finQntParcela: parseInt(document.getElementById('propQtdeParcelas').value) || 0,
        finValorParcela: parseFloat(document.getElementById('propValorParcela').value) || 0,
        finDataParcela: document.getElementById('propDataPrimeiraParcela').value || '',
        finQntReforco: parseInt(document.getElementById('propQtdeReforcos').value) || 0,
        finValorReforco: parseFloat(document.getElementById('propValorReforco').value) || 0,
        finDataReforco: document.getElementById('propDataPrimeiroReforco').value || ''
    };

    // ----------------------------
    // Geração do PDF
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    let yAtual;
    let startX;
    let endX;
    const hoje = new Date();

    // Inserir timbrado
    const timbrado = new Image();
    timbrado.src = "https://4d106c5b7475e4030b25f84093f67825.cdn.bubble.io/f1755806013895x646963497024678000/Papel%20Timbrado_WF-8.png";
    doc.addImage(timbrado, 'PNG', 0, 0, 210, 297);

    // Título
    doc.setFontSize(18).setFont('helvetica', 'bold');
    doc.text('Proposta Comercial', 105, 30, {align: 'center'});
    doc.setFontSize(12).setFont('helvetica', 'normal');
    yAtual = 50;


    // ----------------------------
    // Seção: Dados do Lote
    doc.setFontSize(14).setFont('helvetica', 'bold');
    doc.text('Dados Lote', 20, yAtual);
    doc.setFontSize(10).setFont('helvetica', 'normal');
    yAtual += 2; startX = 20; endX = 190;
    doc.line(startX, yAtual, endX, yAtual);
    yAtual += 8;

    const colEsquerda = [
        `Quadra: ${dados.quadra || '---'}`,
        `Lote: ${dados.lote || '---'}`,
        `Área: ${dados.area.toLocaleString('pt-BR', {minimumFractionDigits: 2})} m²`
    ];

    const colDireita = [
        `Valor Total: ${dados.valorTotal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}`,
        `Valor m²: ${dados.valorMetroQuadrado.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}`
    ];

    colEsquerda.forEach((linha, i) => doc.text(linha, 20, yAtual + i * 8));
    colDireita.forEach((linha, i) => doc.text(linha, 105, yAtual + i * 8));
    yAtual += 32;


    // ----------------------------
    // Seção: Dados Cliente
    doc.setFontSize(14).setFont('helvetica', 'bold');
    doc.text('Dados Cliente', 20, yAtual);
    doc.setFontSize(10).setFont('helvetica', 'normal');
    yAtual += 2; doc.line(20, yAtual, 190, yAtual);
    yAtual += 8;

    const colCliEsq = [
        `Nome: ${dados.nomeCliente}`,
        `CPF: ${dados.cpfCliente}`,
        `Telefone: ${dados.telefoneCliente}`,
        `Email: ${dados.emailCliente}`
    ];
    const colCliDir = [
        `Profissão: ${dados.profissaoCliente}`,
        `Estado Civil: ${dados.estadoCivilCliente}`,
        `Endereço: ${dados.enderecoCliente}`,
        `Cidade/UF: ${dados.cidadeCliente}`
    ];

    colCliEsq.forEach((linha, i) => doc.text(linha, 20, yAtual + i * 8));
    colCliDir.forEach((linha, i) => doc.text(linha, 105, yAtual + i * 8));
    yAtual += 40;


    // ----------------------------
    // Seção: Condição Financeira
    doc.setFontSize(14).setFont('helvetica', 'bold');
    doc.text('Condição Financeira', 20, yAtual);
    doc.setFontSize(10).setFont('helvetica', 'normal');
    yAtual += 2; doc.line(20, yAtual, 190, yAtual);
    yAtual += 8;

    doc.text(`Entrada: ${dados.finValorEntrada.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}`, 20, yAtual); yAtual += 8;
    doc.text(`Data Vencimento Entrada: ${dados.finDataEntrada}`, 20, yAtual); yAtual += 8;
    doc.text(`Quantidade Parcelas: ${dados.finQntParcela}`, 20, yAtual); yAtual += 8;
    doc.text(`Valor Parcelas: ${dados.finValorParcela.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}`, 20, yAtual); yAtual += 8;
    doc.text(`Data de Vencimento Parcelas: ${dados.finDataParcela}`, 20, yAtual); yAtual += 8;
    doc.text(`Quantidade Reforços: ${dados.finQntReforco}`, 20, yAtual); yAtual += 8;
    doc.text(`Valor Reforços: ${dados.finValorReforco.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}`, 20, yAtual); yAtual += 8;
    doc.text(`Data de Vencimento Reforços: ${dados.finDataReforco}`, 20, yAtual);
    yAtual += 16;


    // ----------------------------
    // Assinaturas
    doc.text(`Chapecó, ${hoje.toLocaleDateString('pt-BR', {day:'numeric', month:'long', year:'numeric'})}.`, 190, yAtual, {align:'right'});
    yAtual += 28;

    doc.line(32, yAtual, 92, yAtual);
    doc.line(118, yAtual, 178, yAtual);

    doc.setFontSize(10);
    doc.text("Robson Kollett", 62, yAtual + 5, {align:'center'});
    doc.text("Corretor", 62, yAtual + 10, {align:'center'});
    doc.text(dados.nomeCliente, 148, yAtual + 5, {align:'center'});
    doc.text("Cliente", 148, yAtual + 10, {align:'center'});


    // ----------------------------
    // Exporta
    doc.save(`Proposta_${dados.quadra}_${dados.lote}.pdf`);
}


// ----------------------------
// Inicialização do modal
function inicializarMenuProposta() {
    const modal = document.getElementById('modalProposta');
    const btnAbrirModal = document.getElementById('btnAbrirProposta');
    const btnFecharModal = document.getElementById('closeModal');
    const formProposta = document.getElementById('formProposta');

    btnAbrirModal.addEventListener('click', () => {
        if (!mapaManager || !mapaManager.selectedLoteId) {
            alert("Por favor, selecione um lote no mapa primeiro!");
            return;
        }
        const loteSelecionado = mapaManager.polygons[mapaManager.selectedLoteId].loteData;
        document.getElementById('propLoteNome').textContent = loteSelecionado.Nome || 'N/A';
        document.getElementById('propLoteArea').textContent = loteSelecionado.Área || '0';
        document.getElementById('propLoteValor').textContent = (loteSelecionado.Valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        modal.style.display = 'flex';
    });

    btnFecharModal.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => { if (e.target == modal) modal.style.display = 'none'; });

    // Evento de submit único
    formProposta.addEventListener('submit', (e) => {
        e.preventDefault();
        gerarProposta();
    });
}

const botaoAbrir = document.getElementById('btnAbrirProposta');

if (botaoAbrir) {
  // Se entrar aqui, o botão foi encontrado
  console.log("SUCESSO: Botão 'btnAbrirProposta' encontrado. Atribuindo evento de clique.", botaoAbrir);
  botaoAbrir.addEventListener('click', abrirModalProposta);
} else {
  // Se entrar aqui, o botão NÃO foi encontrado a tempo.
  console.error("FALHA: O script executou, mas o botão 'btnAbrirProposta' ainda não existe no DOM.");
}