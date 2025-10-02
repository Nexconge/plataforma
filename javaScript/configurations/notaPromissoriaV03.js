window.gerarNotaPromissoria() = function() {

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    // Dados da nota promissória
    const numeroNotaPromissoria = document.getElementById("inputNumeroNotaPromissoria").value
    const dataVencimento = document.getElementById("inputDataVencimento").value
    const valorNotaPromissora = document.getElementById("inputValorNotaPromissoria").valueAsNumber
    const nomeFavorecido = document.getElementById("inputNomeFavorecido").value
    const cnpjFavorecido = document.getElementById("inputCpfCnpjFavorecido").value
    const pracaPagamento = document.getElementById("inputPracaPagamento").value
    const nomeEmitente = document.getElementById("inputNomeEmitente").value
    const cpfCnpjEmitente = document.getElementById("inputCpfCnpjEmitente").value
    const enderecoEmitente = document.getElementById("inputEnderecoEmitente").value
    const empreendimento = document.getElementById("inputEmpreendimento").value
    const complemento = document.getElementById("inputComplemento").value
    const nomeAvalista_1 = document.getElementById("inputNomeAvalista_1").value
    const cpfCnpjAvalista_1 = document.getElementById("inputCpfCnpjAvalista_1").value

    // Dimensões da página A4 em mm
    const larguraPagina = 210;
    const alturaPagina = 297;
    let margemLateral = 20;
    let margemSuperior = 30; // valor inicial da margem superior
    let yAtual = margemSuperior + 10; // valor inicial do yAtual
    
    // Título
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("NOTA PROMISSÓRIA", margemLateral, yAtual);
    
    // Vencimento
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(`Vencimento: ${dataVencimento}` , larguraPagina - margemLateral, yAtual, { align: 'right' });
    yAtual += 5
    
    // Valor com fundo cinza
    const larguraRetangulo = 50;
    const alturaRetangulo = 8;
    doc.setFillColor(220); // cinza claro
    doc.rect((larguraPagina - margemLateral - larguraRetangulo), yAtual, larguraRetangulo, alturaRetangulo, "F"); // "F" = filled
    doc.setFontSize(14);
    doc.text(`${valorNotaPromissora.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` , (larguraPagina - margemLateral - (larguraRetangulo / 2)), yAtual + 4 + 2, { align: 'center' });
    yAtual += 18
    
    // Texto do corpo
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const longText = `        Ao(s) um dia(s) do mês de janeiro do ano de dois mil e vinte e dois pagarei por esta única via de NOTA PROMISSÓRIA à WF Soluções Imobiliárias Ltda, CNPJ 53.265.298/0001-28, na praça de Chapecó/SC, ou à sua ordem, a quantia de XXXXX em moeda corrente nacional.`
    doc.text(longText, margemLateral, yAtual, {align: "justify", maxWidth: (larguraPagina - (margemLateral * 2)), lineHeightFactor: 1.5})
    yAtual += 20
    
    // Dados complementares da nota promissória
    doc.setFontSize(8);
    doc.text(`Emitente: ${nomeEmitente}` , margemLateral, yAtual);
    yAtual += 5
    doc.text(`CPF/CNPJ: ${cpfCnpjEmitente}` , margemLateral, yAtual);
    yAtual += 5
    doc.text(`Endereço: ${enderecoEmitente}` , margemLateral, yAtual);
    yAtual += 5
    doc.text(`Empreendimento: ${empreendimento}` , margemLateral, yAtual);
    yAtual += 5
    doc.text(`Complemento: ${complemento}` , margemLateral, yAtual);
    yAtual += 5
    
    // Assinaturas
    yAtual += 15
    startX = margemLateral; // Define posição, tamanho e desenha as linhas
    endX = margemLateral + 75;
    doc.line(startX, yAtual, endX, yAtual);
    yAtual += 5;
    doc.setFontSize(8);
    doc.text(nomeEmitente, (margemLateral + ((endX - margemLateral)/ 2)), yAtual, { align: 'center' }); // Inclui Nome e Qualificação
    yAtual += 5;
    doc.text(cpfCnpjEmitente, (margemLateral + ((endX - margemLateral)/ 2)), yAtual, { align: 'center' }); // Inclui Nome e Qualificação
    yAtual += 5;
    doc.text("Emitente", (margemLateral + ((endX - margemLateral)/ 2)), yAtual, { align: 'center' }); // Inclui Nome e Qualificação
    yAtual += 5;
    
    // Rodapé
    doc.setFontSize(10);
    doc.text("Documento gerado automaticamente", 20, 280);

    // Desenhar retângulo
    margemLateral -= 5
    const alturaQuadrado = yAtual - margemSuperior;
    const larguraQuadrado = larguraPagina - margemLateral * 2;
    doc.setDrawColor(0); // cor da borda
    doc.setLineWidth(0.05); // espessura da linha
    doc.rect(margemLateral, margemSuperior, larguraQuadrado, alturaQuadrado); // x, y, largura, altura

    // Salvar
    doc.save("nota-promissoria.pdf");
}