// Função para escrever números por extenos
function numeroPorExtenso(valor) {
    if (typeof valor !== 'number') {
        throw new Error('O valor deve ser numérico');
    }

    const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
    const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
    const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

    function extensoAte999(n) {
        if (n === 0) return "";
        if (n === 100) return "cem";
        if (n < 20) return unidades[n];
        if (n < 100) return dezenas[Math.floor(n / 10)] + (n % 10 ? " e " + unidades[n % 10] : "");
        return centenas[Math.floor(n / 100)] + (n % 100 ? " e " + extensoAte999(n % 100) : "");
    }

    function grupoExtenso(n, escalaSing, escalaPlural) {
        if (n === 0) return "";
        if (n === 1) return extensoAte999(n) + " " + escalaSing;
        return extensoAte999(n) + " " + escalaPlural;
    }

    const inteiro = Math.floor(valor);
    const centavos = Math.round((valor - inteiro) * 100);

    if (inteiro > 999999999) {
        throw new Error('Valor máximo suportado é 999.999.999,99');
    }

    const milhoes = Math.floor(inteiro / 1000000);
    const milhares = Math.floor((inteiro % 1000000) / 1000);
    const centenasFinal = inteiro % 1000;

    let partes = [];

    if (milhoes) partes.push(grupoExtenso(milhoes, "milhão", "milhões"));
    if (milhares) partes.push(grupoExtenso(milhares, "mil", "mil"));
    if (centenasFinal) partes.push(extensoAte999(centenasFinal));

    let resultado = partes.join(" e ");
    if (!resultado) resultado = "zero";

    resultado += inteiro === 1 ? " real" : " reais";

    if (centavos > 0) {
        resultado += " e " + (centavos === 1
            ? extensoAte999(centavos) + " centavo"
            : extensoAte999(centavos) + " centavos");
    }

    return resultado;
}

// Função principal para gerar a nota promissória
window.gerarNotaPromissoria = async function () {
    const { jsPDF } = window.jspdf;
    // const formatadorDeMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

    // --- Captura de dados em um objeto ---
    const dados = {
        numeroNotaPromissoria: document.getElementById("inputNumeroNotaPromissoria")?.value?.trim(),
        dataVencimento: document.getElementById("inputDataVencimento")?.value?.trim(),
        valorNotaPromissoria: parseFloat(document.getElementById("inputValorNotaPromissoria")?.value?.trim().replace(/[^\d,.-]/g, '').replace('.', ',').replace(',', '.')) || 0,
        nomeFavorecido: document.getElementById("inputNomeFavorecido")?.value?.trim(),
        cnpjFavorecido: document.getElementById("inputCpfCnpjFavorecido")?.value?.trim(),
        pracaPagamento: document.getElementById("inputPracaPagamento")?.value?.trim(),
        nomeEmitente: document.getElementById("inputNomeEmitente")?.value?.trim(),
        cpfCnpjEmitente: document.getElementById("inputCpfCnpjEmitente")?.value?.trim(),
        enderecoEmitente: document.getElementById("inputEnderecoEmitente")?.value?.trim(),
        empreendimento: document.getElementById("inputEmpreendimento")?.value?.trim(),
        complemento: document.getElementById("inputComplemento")?.value?.trim(),
        nomeAssinanteAdc: document.getElementById("inputNomeAssinanteAdc")?.value?.trim(),
        cpfCnpjAssinanteAdc: document.getElementById("inputCpfCnpjAssinanteAdc")?.value?.trim(),
        nomeAvalista_1: document.getElementById("inputNomeAvalista_1")?.value?.trim(),
        cpfCnpjAvalista_1: document.getElementById("inputCpfCnpjAvalista_1")?.value?.trim(),
        nomeAvalista_2: document.getElementById("inputNomeAvalista_2")?.value?.trim(),
        cpfCnpjAvalista_2: document.getElementById("inputCpfCnpjAvalista_2")?.value?.trim(),
        nomeAvalista_3: document.getElementById("inputNomeAvalista_3")?.value?.trim(),
        cpfCnpjAvalista_3: document.getElementById("inputCpfCnpjAvalista_3")?.value?.trim(),
        nomeAvalista_4: document.getElementById("inputNomeAvalista_4")?.value?.trim(),
        cpfCnpjAvalista_4: document.getElementById("inputCpfCnpjAvalista_4")?.value?.trim(),
    };
    console.log("Dados capturados para a nota promissória:", dados);

    // --- Validação: todos os campos obrigatórios ---
    const obrigatorios = [
        "numeroNotaPromissoria", "dataVencimento", "valorNotaPromissoria",
        "nomeFavorecido", "cnpjFavorecido", "pracaPagamento",
        "nomeEmitente", "cpfCnpjEmitente", "enderecoEmitente"
    ];

    let faltando = obrigatorios.filter(campo => {
        const valor = dados[campo];
        return (
            valor === "" || valor === null ||
            valor === "dd/mm/aaaa" || valor === "Invalid Date" ||
            (typeof valor === "number" && (isNaN(valor) || valor <= 0))
        );
    });

    if (faltando.length > 0) {
        alert("⚠️ Preencha todos os campos obrigatórios antes de gerar a nota promissória!");
        return; // interrompe a função
    }

    // --- Se chegou aqui, gera o PDF ---
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    // Dimensões da página A4
    const larguraPagina = 210;
    const alturaPagina = 297;
    let margemLateral = 20;
    let margemSuperior = 30;
    let yAtual = margemSuperior + 10;
    let startX = margemLateral;
    let endX = margemLateral + 75;

    // Título
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("NOTA PROMISSÓRIA", margemLateral, yAtual);

    // Vencimento
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(`Vencimento: ${dados.dataVencimento}`, larguraPagina - margemLateral, yAtual, { align: "right" });
    yAtual += 5;

    // Valor com fundo cinza
    const larguraRetangulo = 50;
    const alturaRetangulo = 8;
    doc.setFillColor(220);
    doc.rect((larguraPagina - margemLateral - larguraRetangulo), yAtual, larguraRetangulo, alturaRetangulo, "F");
    doc.setFontSize(14);
    doc.text(
        `${dados.valorNotaPromissoria.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        (larguraPagina - margemLateral - (larguraRetangulo / 2)),
        yAtual + 6,
        { align: "center" }
    );
    yAtual += 18;

    // Texto do corpo (adaptado com dados reais)
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const longText = `Ao(s) um dia(s) do mês de janeiro do ano de dois mil e vinte e dois pagarei por esta única via de NOTA PROMISSÓRIA à ${dados.nomeFavorecido}, CPF/CNPJ ${dados.cnpjFavorecido}, na praça de ${dados.pracaPagamento}, ou à sua ordem, a quantia de ${dados.valorNotaPromissoria.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (${numeroPorExtenso(dados.valorNotaPromissoria).toUpperCase()}) em moeda corrente nacional.`;
    doc.text(longText, margemLateral, yAtual, {
        align: "justify",
        maxWidth: (larguraPagina - (margemLateral * 2)),
        lineHeightFactor: 1.5
    });
    yAtual += 30;

    // Dados complementares
    doc.setFontSize(8);
    doc.text(`Emitente: ${dados.nomeEmitente}`, margemLateral, yAtual); yAtual += 5;
    doc.text(`CPF/CNPJ: ${dados.cpfCnpjEmitente}`, margemLateral, yAtual); yAtual += 5;
    doc.text(`Endereço: ${dados.enderecoEmitente}`, margemLateral, yAtual); yAtual += 5;
    doc.text(`Empreendimento: ${dados.empreendimento}`, margemLateral, yAtual); yAtual += 5;
    doc.text(`Complemento: ${dados.complemento}`, margemLateral, yAtual); yAtual += 5;

    // Assinatura Emitente
    yAtual += 15;
    doc.line(startX, yAtual, endX, yAtual);
    yAtual += 5;
    doc.setFontSize(8);
    doc.text(dados.nomeEmitente, (margemLateral + ((endX - margemLateral) / 2)), yAtual, { align: "center" }); yAtual += 5;
    doc.text(dados.cpfCnpjEmitente, (margemLateral + ((endX - margemLateral) / 2)), yAtual, { align: "center" }); yAtual += 5;
    doc.text("Emitente", (margemLateral + ((endX - margemLateral) / 2)), yAtual, { align: "center" }); yAtual += 5;

    // Assinatura Assinante Adicional
    if (dados.nomeAssinanteAdc !== "" && dados.cpfCnpjAssinanteAdc !== "") {
        yAtual -= 20;
        startX = larguraPagina - margemLateral - 75;
        endX = larguraPagina - margemLateral;
        doc.line(startX, yAtual, endX, yAtual);
        yAtual += 5;
        doc.setFontSize(8);
        doc.text(dados.nomeAssinanteAdc, (startX + ((endX - startX) / 2)), yAtual, { align: "center" }); yAtual += 5;
        doc.text(dados.cpfCnpjAssinanteAdc, (startX + ((endX - startX) / 2)), yAtual, { align: "center" }); yAtual += 5;
        doc.text("Assinante Adicional", (startX + ((endX - startX) / 2)), yAtual, { align: "center" }); yAtual += 5;
    }

    // Assinatura Avalistas
    if (dados.nomeAvalista_1 !== "" && dados.cpfCnpjAvalista_1 !== "") {
        yAtual += 15;
        startX = margemLateral;
        endX = margemLateral + 75;
        doc.line(startX, yAtual, endX, yAtual);
        yAtual += 5;
        doc.setFontSize(8);
        doc.text(dados.nomeAvalista_1, (margemLateral + ((endX - margemLateral) / 2)), yAtual, { align: "center" }); yAtual += 5;
        doc.text(dados.cpfCnpjAvalista_1, (margemLateral + ((endX - margemLateral) / 2)), yAtual, { align: "center" }); yAtual += 5;
        doc.text("Avalista", (margemLateral + ((endX - margemLateral) / 2)), yAtual, { align: "center" }); yAtual += 5;
    }

    if (dados.nomeAvalista_2 !== "" && dados.cpfCnpjAvalista_2 !== "") {
        yAtual -= 20;
        startX = larguraPagina - margemLateral - 75;
        endX = larguraPagina - margemLateral;
        doc.line(startX, yAtual, endX, yAtual);
        yAtual += 5;
        doc.setFontSize(8);
        doc.text(dados.nomeAvalista_2, (startX + ((endX - startX) / 2)), yAtual, { align: "center" }); yAtual += 5;
        doc.text(dados.cpfCnpjAvalista_2, (startX + ((endX - startX) / 2)), yAtual, { align: "center" }); yAtual += 5;
        doc.text("Avalista", (startX + ((endX - startX) / 2)), yAtual, { align: "center" }); yAtual += 5;
    }

    // Borda do documento
    margemLateral -= 5;
    const alturaQuadrado = yAtual - margemSuperior;
    const larguraQuadrado = larguraPagina - margemLateral * 2;
    doc.setDrawColor(0);
    doc.setLineWidth(0.05);
    doc.rect(margemLateral, margemSuperior, larguraQuadrado, alturaQuadrado);

    // Salvar
    doc.save("nota-promissoria.pdf");

};