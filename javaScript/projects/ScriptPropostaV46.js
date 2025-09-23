// Se não foi, ela baixa o HTML, injeta na página e configura os eventos.
async function garantirEstruturaModal(username) {
    // Se o modal já existe, não fazemos nada e retornamos imediatamente.
    if (document.getElementById('modalProposta')) {
        return;
    }

    // Baixa o HTML do modal. 'await' pausa a execução até o fetch terminar.
    const response = await fetch('https://cdn.jsdelivr.net/gh/nexconge/plataforma@developer/html/menuPropostaV05.html');
    if (!response.ok) throw new Error('Não foi possível baixar o HTML do modal.');
    const html = await response.text();

    // Injeta o HTML no container.
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) throw new Error("Container com id 'modal-container' não foi encontrado.");
    modalContainer.innerHTML = html;

    // Configura os eventos internos do modal (fechar, submit).
    configurarEventosDoModal(username);
}

// Configura os eventos que são parte do modal (fechar, submeter formulário)
function configurarEventosDoModal(username) {
    const modal = document.getElementById('modalProposta');
    const btnFecharModal = document.getElementById('closeModal');
    const formProposta = document.getElementById('formProposta');
    const header = document.getElementById('pageHeader');
    const sideToggle2 = document.getElementById('sideToggleGroup');

    if (!modal || !btnFecharModal || !formProposta) {
        console.error("Não foi possível encontrar um ou mais elementos essenciais do modal (modalProposta, closeModal, formProposta).");
        return;
    }

    // Evento para o botão de fechar
    btnFecharModal.addEventListener('click', () => {
        modal.style.display = 'none';
        header.style.display = 'flex';
        sideToggle2.style.display = 'flex';
    });

    // Evento para fechar clicando fora do modal
    window.addEventListener('click', (e) => {
        if (e.target == modal) {
            modal.style.display = 'none';
            header.style.display = 'flex';
            sideToggle2.style.display = 'flex';
        }
    });

    // Evento para o envio do formulário, que chama a geração do PDF
    formProposta.addEventListener('submit', (e) => {
        e.preventDefault();
        console.log("Botão de gerar proposta clicado")
        gerarProposta(username); // Chamando a função de gerar PDF
    });

    // Evento de mascara do campo de CPF
    const cpfInput = document.getElementById("propClienteCPF");
    cpfInput.addEventListener('input', function () {
        let valor = this.value.replace(/\D/g, ''); // só números
        //Limita a 14 caracteres (CNPJ)
        if (valor.length > 14) {
            valor = valor.substring(0, 14);
        }
        //Aplica a mascara
        if (valor.length <= 11) {
            // CPF: 000.000.000-00
            valor = valor.replace(/(\d{3})(\d)/, "$1.$2");
            valor = valor.replace(/(\d{3})(\d)/, "$1.$2");
            valor = valor.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        } else {
            // CNPJ: 00.000.000/0000-00
            valor = valor.replace(/^(\d{2})(\d)/, "$1.$2");
            valor = valor.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
            valor = valor.replace(/\.(\d{3})(\d)/, ".$1/$2");
            valor = valor.replace(/(\d{4})(\d)/, "$1-$2");
        }
        this.value = valor;
    });

    // Evento de mascara do campo de telefone
    const telefoneInput = document.getElementById("propClienteTelefone");
    telefoneInput.addEventListener("input", () => {
        let value = telefoneInput.value;
        value = value.replace(/\D/g, ""); // Remove tudo que não for número
        value = value.replace(/^(\d{2})(\d)/, '($1) $2'); // Aplica a máscara: (xx) xxxxx-xxxx
        value = value.replace(/(\d{5})(\d)/, '$1-$2');
        telefoneInput.value = value;
    });
}

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


// --- PARTE 2: FUNÇÃO PRINCIPAL (chamada pelo Bubble) ---
// Esta é a função que o botão do Bubble vai chamar.
// Ela verifica se um lote foi selecionado, preenche os dados e MOSTRA o modal.
export async function abrirEPreencherModalProposta(mapaManager, username) {

    try {

        if (typeof mapaManager === 'undefined' || !mapaManager.selectedLoteId) {
            alert("Por favor, selecione um lote no mapa primeiro!");
            return;
        }
        const loteSelecionado = mapaManager.polygons[mapaManager.selectedLoteId].loteData;

        //Verifica se o lote selecionado está disponível
        if (loteSelecionado.Status !== "Disponível") {
            alert("O lote selecionado não está disponível para venda. Por favor, escolha outro lote.");
            return;
        }

        //Baixa o HTML do modal, se necessário, e injeta na página
        await garantirEstruturaModal(username);

        // Agora que temos 100% de certeza que o modal existe no DOM, podemos continuar.
        const modal = document.getElementById('modalProposta');
        const header = document.getElementById('pageHeader');
        const sideToggle2 = document.getElementById('sideToggle');

        const formatadorDeMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
        const match = loteSelecionado.Nome.match(/^Q(\d+)([A-Z]+)(\d+)$/); //Ragex para encontrar o primeiro conjunto de letras depois de Q para definir o numero do lote.
        if (match) {
            document.getElementById('propQuadraNome').textContent = match[1] || 'N/A'; // Quadra
            document.getElementById('propLoteNome').textContent = match[3] || 'N/A';   // Lote
        } else {
            document.getElementById('propQuadraNome').textContent = 'N/A';
            document.getElementById('propLoteNome').textContent = 'N/A';
        }

        document.getElementById('propLoteArea').textContent = (loteSelecionado.Área || '0').toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('propLoteValor').textContent = formatadorDeMoeda.format(loteSelecionado.Valor) || 0;

        // Passo D: Preenche os dados da condição financeira.
        const finValorEntrada = loteSelecionado.Valor * 0.25;
        const finValorParcela = loteSelecionado.Valor * 0.012;
        const finValorReforco = (loteSelecionado.Valor - finValorEntrada - finValorParcela * 48) / 4;
        document.getElementById('propValorEntrada').value = formatadorDeMoeda.format(finValorEntrada);
        document.getElementById('propValorEntrada').disabled = true;
        document.getElementById('propQtdeParcelas').value = 48;
        document.getElementById('propQtdeParcelas').disabled = true;
        document.getElementById('propValorParcela').value = formatadorDeMoeda.format(finValorParcela);
        document.getElementById('propValorParcela').disabled = true;
        document.getElementById('propQtdeReforcos').value = 4;
        document.getElementById('propQtdeReforcos').disabled = true;
        document.getElementById('propValorReforco').value = formatadorDeMoeda.format(finValorReforco);
        document.getElementById('propValorReforco').disabled = true;

        // Passo E: mostra o modal e esconde o header e sideToggle
        modal.style.display = 'flex';
        header.style.display = 'none';
        sideToggle2.style.display = 'none';

    } catch (error) {
        console.error("Falha ao abrir o modal da proposta:", error);
    }
}

function parseBR(valor) {
    if (!valor) return 0;
    return parseFloat(
        valor
            .toString()
            .replace(/[^\d,.-]/g, '') // remove R$, espaços e caracteres não numéricos
            .replace(/\./g, '')       // remove pontos de milhar
            .replace(',', '.')        // troca vírgula decimal por ponto
    ) || 0;
}
function formatDateStr(dataStr) {
    if (!dataStr) return '';
    const [ano, mes, dia] = dataStr.split('-');
    return `${dia}/${mes}/${ano}`;
}

/**
 * Função auxiliar para carregar uma imagem de forma assíncrona.
 * Retorna uma Promise que resolve com o objeto da imagem quando carregado.
 * @param {string} url - A URL da imagem a ser carregada.
 * @returns {Promise<HTMLImageElement>}
 */
function carregarImagem(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // Essencial para carregar imagens de outros domínios (CORS)
        img.crossOrigin = "Anonymous";
        // A Promise resolve quando a imagem termina de carregar
        img.onload = () => resolve(img);
        // A Promise rejeita se houver um erro no carregamento
        img.onerror = (err) => reject(err);
        // Inicia o download da imagem
        img.src = url;
    });
}
/**
 * Função principal para gerar a proposta em PDF.
 * @param {string} username - Nome do corretor/usuário.
 */
async function gerarProposta(username) {
    const { jsPDF } = window.jspdf;

    // Captura os dados do formulário
    const dados = {
        // Lote
        quadra: document.getElementById('propQuadraNome')?.textContent || '',
        lote: document.getElementById('propLoteNome')?.textContent || '',
        area: parseBR(document.getElementById('propLoteArea')?.textContent),
        valorTotal: parseBR(document.getElementById('propLoteValor')?.textContent),
        valorMetroQuadrado: (
            parseBR(document.getElementById('propLoteValor')?.textContent) /
            parseBR(document.getElementById('propLoteArea')?.textContent)
        ) || 0,

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
        finValorEntrada: parseFloat(document.getElementById('propValorEntrada')?.value.replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.')) || 0,
        finDataEntrada: document.getElementById('propDataEntrada').value || '',
        finQntParcela: parseInt(document.getElementById('propQtdeParcelas').value) || 0,
        finValorParcela: parseFloat(document.getElementById('propValorParcela')?.value.replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.')) || 0,
        finDataParcela: document.getElementById('propDataPrimeiraParcela').value || '',
        finQntReforco: parseInt(document.getElementById('propQtdeReforcos').value) || 0,
        finValorReforco: parseFloat(document.getElementById('propValorReforco')?.value.replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.')) || 0,
        finDataReforco: document.getElementById('propDataPrimeiroReforco').value || ''
    };

    // Validação: todos os campos obrigatórios
    const obrigatorios = [
        'quadra', 'lote', 'area', 'valorTotal',
        'nomeCliente', 'cpfCliente', 'emailCliente', 'telefoneCliente',
        'profissaoCliente', 'estadoCivilCliente', 'enderecoCliente', 'cidadeCliente',
        'finValorEntrada', 'finDataEntrada', 'finQntParcela', 'finValorParcela',
        'finDataParcela', 'finQntReforco', 'finValorReforco', 'finDataReforco'
    ];
    let faltando = obrigatorios.filter(campo => {
        const valor = dados[campo];
        return (
            valor === '' || valor === null ||
            valor === 'dd/mm/aaaa' || valor === "Invalid Date" || // máscara não preenchida
            (typeof valor === 'number' && (isNaN(valor) || valor <= 0))
        );
    });
    if (faltando.length > 0) {
        alert("⚠️ Preencha todos os campos obrigatórios antes de gerar a proposta!");
        return; // interrompe a função
    }

    console.log("Dados coletados e campos validados, iniciando construção do pdf.");

    // ----------------------------
    // Geração do PDF
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    let yAtual;
    let startX;
    let endX;
    const hoje = new Date();

    console.log("criado objeto jsPDF.");

    try {
        console.log("Adicionando imagem do timbrado via Base64...");
        const logoTimbradoB64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA6EAAAGoCAYAAAC3y+PLAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAACxIAAAsSAdLdfvwAACfgSURBVHhe7d1fchtHli/gSpASH+VZwXhWIE3IjnmUrV6A3SuwvYL2rKDdKxj3CtqzgmktoCX78YatGGkF7buCaz6SIpC3TqFkkSAB4j+yEt8XIYspkwRRAIH61cnM0wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVC31fwMU4ezp59/lJn3WDwfv8vXL4u7Lw6fPv2z/+nY6Gr50Ov764v/89Gs/LEJtxziPxt+++/mnN/1wJbUdi9qlJr+5eP3K43Ug7Xvg9+174JP42GNBzYRQoChnT//wWZPyq344fKn55uLnlz/0oyKc/cezj5vxyT/74fDl/NfiTtQeP/vo7MGoDcbpUf8vg3bxbvwvzduffuuHK6nu+Va7En+fjsjDp89/TKl5Fh/n3PxU4oXMkp198jz3H8YB/Ev7XP6uH1GYUf83QBEuXv/jx/Yd5P/2w+GblFcBiqphbvJ/98PhS83XEfr6URnawNY+j//ej4buxboBNNTzfMvn/QdVy036sf8QYGeEUKA4KTX1XLlMzeOuuluYlEdFVWc3kx6dPTyJKZ9FSSeTOp7HafMwXcOxyDm9iZkN/bBal1djIRTYOSEUKM7F5bg96a2n6pDT5Ov+w2JExbnJzdt+OHg5l3fhoqsA5uanfjhQ+Xwb08lrqYZ2x6LmIBqvCRtUvQGWJYQC5YmToNxUU6lLTfqqWxdXmlHzff/R4KWm+dcSK86tQR/jbU4prqUyXHMQzSmvtfkUwKqEUKBMp5NqAlLnalReNbSrcFW0zi3l4tbfXr5++fdBr3HOaWshtKa1yLUG0ZSsB2XYLn55mX7/Y1OiogmhQJHihLX968V0VIFUaIuKXE81tPVFkRXnwVZD83mE6H6wFTnVc3GpyiA6sh4U2A8hFChXThUFpPTo7NPnxVVDm9NJRRsUta5G5VVD340HWXHexe6+0Wt0+OtkP6gpiEbFvr/4B7Bz+oQCRXv4yfNfY71fPxy23Ly9eP2ya0JekoeffP5DrFvthwOXzy/eTT4ubXOVIR7jSRr/e4TGfrg1Q+0FvKhnY3eBKTd/64dD9eLil5fF7TJdo27GxtVpN2tjMrr67frv2TJ9QuPr89XJk9Tk7v0kp/RbyunNxdXVm22/9u3rth58+uzJqDl50kxyd1xyk96k0/GbfV4YidemnPKTlHPX8msXP8N074JJ95jGscxp/ONSr7PRe/r0tH0M1vjaFcw+3lOjH5vTq1+3/VgIoUDRKjm5+yCnz7udaQsy1FAwV2q+ma53LUd30jk++Wc/LF5UxS5/ebmzqc3XT7SHYlEIDUN/rWof8/9sH/O61uLPuPVat+Lr8dnTz79rUvpzP+zWH/Yf3nDX53Un9+PRd+0XtEE/Per/163n1dwQ2oWQ0bdt+Ph60YXZ+Jo0an7Y9DWwez5Hn+vUPO7/6ZZY4x0bji0TTuYd+/b+ftnexvdz71Nu3rbPze/a47DUzIyzT563n97L+S/3rgvtj2v7M3x7/XG5IXaNHjXfL3NMZ1/buufI9Dba50Tz9V23Ea+3bfD94a6f9cPz5u6LmIu+dmlLPre6xyI1P3Sze7ZwAcJ0XKBo2rXsnnYtuxcnaXFy2A+L157UbH0q7nXtCVV1G4bECWoEuX44OFFV6T9ky7qgNR69mQaJOUFngQhwZw9Gv0awXRgSWl0Ays3fzp4+fxPVxf6flxZfE18b32NRAA3d/Rmf/PPhJ8/XWgbRzRBJzf8svE/tzxCfE58bYan/163o7mt/XBc+LnEc2uMRAXPVnyFu4+GDkzftbfxp3m1097/9GeK4dxcse92FgN+fN3e7/rXrPN7x2C373Ooei6b5r/j87jm9ISEUKJt2LfuhXcs+DOYYT0a7XSscFz6GFMqXFZXEYe4AnM93MfWaqZRy+/u0evgMXRDpKogrfn0bGEZ59OMqwSReN+Nr4mv7f1pKF0yi+ruS/P2icDUrPvfh6cnWLo7F+3B3X28d13wer01RYez/4XcR8M9OT1YKonEb94a799rjnsfT79+9h3UzK5Z83PvHe5Xzi+kykea/lr6N36VHcWGgfcw3ek8TQoHyadeyc9NpRtq17FJMJ7vrxKY4uXm7p0BS5dTPy19efT28IKo1y259OMmP50ZXMc/p8/iTR+O5r1VteH0yDSLXta/TOf+1DUp/bE7G/3bxbvwv3fdpv+ft15f0aNkg2n1OmrQhbyaQtLcV68O7lifxJ24vNuOanT3TVeNWuPh3Leh2F6Ta7/n+dubdny4Erhx27xZTXG/c17g/MUX4l1cfxRTobjlCe3xjSm//GVPtz71aGL752He30R7DuK93HccIrPH9c3fh4oPuedM/5vEnPu6O2w3tbV0t97PN26eg+xlnHosY376tVkp/2iSItvcVoHxnnzyPF9YvpqOhy+fxRtcPijG7jmnw4gRtj5taLCOmPk2vPJcrTv72tTZwSBuPxUnY9bV79xnUZlTLrJ2rQBeSDrAmtNOGjclo/PV9F3hm1xReFwHh8t3k20Xr8e56jYkwd/lu/GTR13VTcK9XQJf4ee94js/d3OrWse8tfL2JiuCDkwhjN9/7F7y2L7UmdPp9/18/uvf4REC/VTVtg9lda0Tvfvzy+SRNPpt3LBe/VsRFh9GX856nd65Fn/OzvTfv+dmcjr9c9J4Zj2GE49nX7AjEy67ZvU4lFBgG7Vp27uKquoqzdi1rSCexDns/2pO1aoPPsCqicYLN7rS/8+0J/iYzDKZh7dXXi4JkiEDXVdmuidDQbb6zUKwDf//alM8vrsZzQ9N70+f4jWrlaheKc/7rwgte7X29eDeOkHWjWpjHJ3cG3WVNd5n9IDb2WXRcu+PQBsF+ODW5vnvsYosCaOge1zl90XNOXy+6UNKFzdlqbWwoNUc3XXcmgMbrVOzcf99F2/g5urA+83i0T7DvV10rG4RQYBC6NWS3phoN2II3iYNp34SHc9K8hNiJcI03xp3qjvH2+29uTXtysc/qcb+ZTz2/1zOGEkRXqQayhtx8v8nvVVcBXWF2QgSeCK39cCp2f13wehgVw2hvFbcVwee+sPteF+CuWX5KbgTdyf0XoaavmTc/L8cOw9sT7U76D+eanoN0U2J/mlbQXy31Hh5fs9TFh5Pb07L72Rf3vl9Mq73XLm5GRXvOYz2dhnxN+5rfh+DltI9HXKC4fnvdRY6Hq18YEEKBwaiqatK+Say0fmZPcqqpGpoerfPGuGvR0qD/sDwH2KCq5mpoKD2I3rnWi62ajGKt5bryeTcFd0URWm8+tku8HrYBI56vq02tXK+K3l2MWzLoTn+eGyFrq5v7tSFqqffi/th8tspFm2XfU7uLFDMVxmi10394r9mLm7PV3k4bTG9P+02rXxCPxy3NfN0aF9aFUGAwats8p8R2Ld0V9IpOStv7UlzAiZONUo/xtCXSftVeDQ0lB9HUZFXQHVuqEjZP7A6/ZFibdSvEbLmCGFM7c2yetJa00jHJ+cPnz65JXNXF1dXsbX/RrZPcgdUe+5nWWJO0QvX8/uP58PTkRtiO96F1Z0HcOh+LC+sr7vwvhALDkmtqJVJmu5ZVrr6WrpsmVGDFuVXi8/jFuie7G8vN3qYAH0qpQTSvGAbYr03aJU2Dwge5adYKjPE+Fa+jEdRiE53YfKfbAGh88s/2NXatjdbStVC5d/E6l/Nf+9FUSn+OjdLa+/j9Ov02d2GVgLjM8UzNzQsGm77Xz1Zfm6tTIRSo2Olu+xfuXaHtWmqqTLUn/sVVQ2N6WXHHOBW8VrUSJQbRy6uxSmjBNqqitq7Puli2ghghLMLY9bDZ7WzbBrW4eDpv994h6dajzk5/jeOT0p9G+eR/zz75/LcI3N0mgqXtLbCulG6G65UqrbelNNvaabLSBV8hFBiUbipjodPa1hKbRRRodrOJIYsTphIrzq2iqqGHmIp7jIoKonESfqjqN/fa94WqCJ8RPCOERRirIWzO1T7vuw12Ziuiv0uPuvWTuflbtHPpAmmZ7yNLy7m5EaY33pBswxArhAKDk/Koomqodi37cGtHwAKU1K6lC0XCyN6UE0StB2Uq3oeiF+bC4DmtHL5o08xf2kDzx64VTE6fT//nAEUQff3q27gf09/H+a/HXSAdj96U+H49VEIoMDjd1buZaTSDpl3LzqWm+VK7lgVyUgXdsyKC6Mh60JItO312kfZ73Pu6162BzM3f4qJo/0+d7vmZmm8ipF388jJ1vSR/eflltASJJQWbThUuRdyP+H28+OXVR12ojuronecY7fGJyuhQg2jKNyqXm+6XsP6mVFNCKDBMB2glsTPatexBevTwwUlxJw5ltGvJ56u1ZGBbDh5ER9aDrmjvF7I22iQnLrxFz8jevOm9aXJy87U+AtjJ+N+6YPbzyx8Whs1RHvQU1VlxkTuqoxG44xhE1TdeI/v/PZXz90OcmptmNoDbNES232Hm61dr1yOEAoN0a3vwgdOuZS+KqziX0K6lmGrskTpUEI1A0vUmPGKrnoTnZmZjlz0YTdbfvG62L2hqmtthMnpH3piCm89jreTSz43JpkGmXHEMoup78W7ycRfMf5ce5XF5PajvNxMSN2zZ080wuuaO1jcLCaHAcGnXsnO1tWt5+PR5iScOB30e17XGepi6ILr3ixFHuB709OpGsEp5tSpe2rhytIbUrL07a560X3vdHTtgn52e3rxPK/YlzSkNMIz1bWeWnVYba0djE6PrttxzdR+mGxF9uHjfbdq35iysh588/7b9Dh+mb0dIX+F5E4RQYLjqa9dSXqWusnYtreKO8SHbtXTVsE13SGQrLq/GX3Yncntyu71C/abVvQ8n4asEqOkFrJtrJvcjPTp7cLLye12EhFsVzuV2wF46SHS3sYV1q/sU4TN2uu3azsT6zmUv/sYa/hpmBsVFhhvy96te5IhjlmZbn62xREoIBQarm8rY1LN5ziZXvHdJu5a9OEg1tH1sTcUtxftqy56C6KQZH+mmRB/CdwSos6ef378ue7q28pAzFr7ogtOSorrV3rf/6odTMXNoiUpVTs1Sr4+xVvVWEBmCq9M2QKWv+lE7Pvn7Uu+77ecs3Dl4ILr+qNeXMqXm8cPTJY9BiM+LY3btgkx3MbNbIrUaIRQYtOratcys4SmBdi27d6h2LZNRZbMJhm5vQTSf17Kz6cpyuvl6ltKfp1ML52hPus9OT348dMWvW7LxyfN7w0J3X1J+1Q87XUiY9zo+O0W5ab68bzOkCLnRziXes/p/GoyY+XGjohkbA7aP773H9cHoxvFrA/gwf3/iQkRKN57v3cXZ9hgs87ifPRj9Gses/6dOymmtdctCKDBotbVrad8cy7uyHNOQKqo4x0nW0ld996U7xvvdIChOTI82iJRsL0H0+KbivncrhLSiavjw6fMfY41gd6L9+5/Pv7/rpHtf4ne0/e/1i1NfxM8TVdGYHjz7s7YB9NdbFdD263Maf9mFjzt0M4puHI/0KALmXesl4za7imwXcocXQN/Lo3Ebwm5WA+O4RlV8dqZMBLMI/zeqp+F0uBdnp8tsZt7T22Mwyif/G/d19vcgLmycPX3+5s7HPTXfrLukQwgFhq+idi1xtT1e9PthMcpoJbIt2rWEmqZZV2fHQbQNN0cbQkOsv50GvA+6qZbRKzNOtH//k/4Urxf9p8RFwv2uCczNr5M0ad8PrgfR9CgCUfvz/s/szxrvH/0n9fJ5fP19F5tuhbK4z7Fe8pPnuQvnbQCJj+M2b4axNuA2zX/2g8GI43HXcW2P4Z9jrWiE+e5+t/c5gln7P7+Yfk4v578svXtwoRbsyv3F7O9Bd2HjrgsxEUDXmIb7nhAKDF5t7VraF/3iNs+5fbV88Bzj2jb2qs0Og2jK6bgr4O2xvXw3frL8sW3fX9oT7nSAHYXfB6bZ0Hyf7rXkZPJkmdkOd4eyqS6c3xVA2mMXXzPU59Ki4xphvrvfd4kA+vpVFRdl+125/3jX475Id8xy+nyTABqEUKAOFbVraX1h85zdipOMmFrWD0uyn2PcnkAO/Ur+UdhRELUjciuO7euXbRDNf1kU8LpqURvmNj3h3kQEpstfXn4cQXiJ58KLCAiXr18u3+uzFbcR/TCn1bEFoSRuv5uC+XKpgFuyVY5rHJdJGv97LQH0vdidffq4N/9573Orf+zjmG3jNaR9HwaoQGwe8eDk//Wj4cv5r+2bXXHVun7N0aC25J8nKgVxotYPi7GPYxwnHO2JRDEXFWLq29zKQyEO+nzpN8dpz9o2XptY6vP+0LrdXicn0XriSU7pt6jwdc3327Daf0oxuouUV6cf55SfpJw/akbp12aSft3mz9stCxnlj5tJbm+n7OOxLXOP6xFdtNnHc+s9IRSoRmyYcGvzgMHK53F1srQ3/NigoH3jmNn4YsBOxv9WWkVwL8e4sPsthC5hW0G0oumEwHCZjgtUI6eaWomU2a7lUK1EduVI27W8MBV3gN5ua2putNYAOCwhFKhGrO+IakU/HLz2vpRXrWhPhPOeW4nsUjrGdi2pnsfv6GwhiFoPCpRACAWqkkZNNTt+xrpA7Vp27fjatVxcjoXQIdskiG5cRQXYDiEUqMq0CfNqW9kXTbuWfTimY/wiQkz/MUO1dhDdf4sRgLsIoUB1KmvCr13LjkXF+VjatbTBtqbfjeO2RhDNTRJCgSIIoUB1Lq5q2qCodTUqrlIXvcWqqjgXWA3d/jHO5/E9+wE1eB9El9zI6vJqLIQCRRBCgfq0J2bThtuVSM3XxW2eM1VPNTQ1z2qvONe0oRTXtK93kzS5N4h2FzTaz+2HAAclhAJV0q5l97Rr2b2tHuOchNBKxc7g9wdR60GBcgihQJW0a9mDruKsXctObe0Ym4pbu/uCaErWgwLlEEKBamnXsnvatezeVo6xDYmOwsIgOrIeFCiHEApUS7uW3dOuZfe2cYwno4kQeiTuCqLxOhjPo34IcHBCKFA17Vp2LzWpmmpoje1aIoBEMOmHHIHZINo+rz3+QFGEUKBq2rXs3sXrf/xYVcW5snYtKWdrQY/Q9SDaPndMxQWKIoQCddOuZS9SKnDjpDVV167ltLILMSztfRBNJ2MXIoCiCKFA9bRr2b2LyzjJXdQeYliqadeSm7fWAh63CKKeA0BphFCgenESpl3LjkUT/Ip2YK2lXUtOdsUFoDxCKHAsqqmGltqupa5pn3W0azENE4ASCaHAUdhkY5ciFdqupf3rxXRUhWG3azEVF4BCCaHAMalpg5Yi27U0OVVVcR50u5ZRVc93ACoihAJHY62NXUqmXcs+DLZdy3SzKAAojxAKHI81NnYpmnYtOxftWh58+uxJPyzJfVXOF91mUQBQICEUOCqrbuxSNu1a9iHl8irOTW4Wr/VMFV1sAaA6QihwVFba2GUAtGvZvdSkr4qrOKe84OJDPjcVF4CSCaHAMapq8xztWnbv7LSgamgbiLs+pnN0U85NxQWgYEIocHS0a9m92tq15JSK6Rk6nYKdHvXD23JSBQWgaEIocKxqqtRp17JjXcX50+dlBNE8vwra/s/zuMjSDwCgSEIocJRqa9eSx6Pi1obW1q4lT5rDh9Dp2tQvpoPbqtr9GYBqCaHAcaqsXUu3RlC7lp0qoV3LfbshpzyqZkMoAOolhAJHq7Z2LQ8fnBSzbvE97Vq2bNLMvf2oOkf1uR8CQLGEUOBo1daupVVeP8tpu5aK1oYerl1Lt+43NY/74S0pZ1NxARgEIRQ4dlVtnvPw6fOF0zUP4nRS1RTRQ7VryePFU3Eno7qOMwD1EkKBo1Zdu5YCq6FdxbnJ/90PB+9Q7VpSnr8xUjyH3/3805t+CABFE0KBo1fb5jkltmupacOcQ7Rr6TZEWjAVt1VTyyEAKieEAkevts1zSm3X0uTmbT8cvH23axlNRgtvL53EcxgAhkEIBZhunlNTpa7Idi3tO04962/33K4lpzR/PWgb7mPKcz8CgOIJoQDhdFLRdMZC27X8/LIN+tq1rOrs6R8+iynA/fCWnOq5gALAcWjf1wAIZ588jymNX0xHwxYb1Vz+8rK4taFnTz//rknpz/1w8C7ejf+lq6Tv0MNPPv+haw0zxz5+hl17+PT5j1Fd7oesIefmj7HRWj8EKJpKKMB7OWnXsmvataysm14934uhB1C2IDXfCKDAkAihAL3YPEe7lt3SrmU10wsJ6VE/vC01gsexawPodKo7wHAIoQDXaNeye9q1rCDlhdXs6c7OHK2c/yqAAkMkhAJco13L7mnXsqTHzz5atBa0ZSruPnXP2XJeG2JGwcXrV8XNdgBYhhAKcJ12LfuhXcu9zh6eLKyC5oqep0OQm+a3SZp8VkIQjQB6+cur4nbABliWEAowS7uWndOuZQl50YZE+dxGNPv37uef3hw8iObm7eW7iQooMGhCKMCMvvH/i+moCmWesOaKqqExbXabFefp95rbLig3NiQ6lIMG0TaAXlyNPzMNGxg6IRTgLtq17J52LXPdW73OSQg9oEME0di5WwAFaiGEAtxBu5bd065lvpTnb3YUz0tTcQ9vv0E0n+c0/lIABWohhALMoV3L7uVUz/rbbbVr6R6n1Dzuh7eknAXQQuwniObzuI24rf4fAAZPCAWYQ7uW3YsT65ybn/rh4G2jXUseL94VdzKqaxrz0O06iAqgQI2EUIB5pu1aaqrUFdmuJY0qaomznXYtc6dOx1RcgaQ8OwuiqfnG4w3USAgFWKSqzXPKbddS0/rbTdq1RICNab398BZTccu19SDaBtBpKyOA+gihAAvUtnlOq8h2LW24qqcaukG7ltFktPgiQVU9bOuztSCa818EUKBmQijAPVIeVRSQymzXcnFVV7hat11LTmn+YxM9Iqc9bCnYpkE0LnpdvH5VzaZoAHcRQgHuEe1aIgD0wxqUVw19+9Nvx96u5ezpHz5bNBU3p3rWztZu3SAavwOXv7wqbso8wLYJoQDLGFW0QZF2LTu3TruW9v4v/Px0Ers1MxSrBtHYJVoABY6FEAqwhOn6rC1tOFIA7Vr2YLJaxbnbvXiOOC6m4g5PPKebPJo/xfq93Ly9vBrf/3kAlRBCAZalXcvO1dSupT3Ij2OKbT9aaLpONz3qh7dUdVyOTDedPzXf9MPbYq3v1fizriUUwJEQQgGWpV3LztXWruW+KbbvpdQs/LyLS1Nxh6ybSXFnEM3nzen4SwEUODZCKMCStGvZj9ratdy7/nZakf5iOrjTCyFl+G4H0Xwea0ZNswaOkRAKsALtWnavtnYtzdXi3p9nD08WPwapUQWtxIcgOg2g3ZpRgCMkhAKsQLuWPaisXUsbOhYf4zx/Q6IIK6bi1iWC6MW7yccCKHDMhFCAVWnXsnM1tWtpj/Kjee1a+mM/dypubpq/m4pbIY8pcOSEUIAVdVPqtGvZqWNp15LH90zFzUkVFIDqCKEA66iqXUv6qsR2La16qqFz2rWkvGhX3Hx++fqlEApAdYRQgHVU1a6lac5OR8WtDY0AVnO7lm4qbhtO++Et3VRcAKiQEAqwhtrateSUFu7gekBVVZxvrL+9Z9fcutbFAsAHQijAmmoKCdGuZd7mOYd0+W5c1frb68FzUfCPCrDdUwGolRAKsKbaNs/Jk0XrEw+ka9dS0bTUvl3Lg0+fPYng3/3bHVLOpuICUC0hFGADadRUszY02rVEOOqHxUgnk+J2713ftF3LaLJ4Ku5kVNeaYwC4TggF2EC0a6lp85yUy9ugqFt/W1m7lpzS/NYsuXlrKi4ANRNCATaUcq6nGqpdy+6l5vGiqbg51VNdB4C7CKEAG7q4qmsXU+1aDiudjK0HBaBqQijAprrNc7Rr2YP6W5bk5m1MP+5HAFAlIRRgC7Rr2b3q2rXcwVRcAI6BEAqwBdq17EFt7VruMA3aAFA3IRRgS7Rr2b262rXc8iKCdv8xAFRLCAXYEu1adq+6di3XpbqrvADwnhAKsEXatexFlRsUXVzaFReA4yCEAmyRdi27V2O7lm53ZVNxATgSQijANmnXsi91VUNzUgUF4GgIoQBbVlW7ltwUWZ2rq11LPo/qbj8AgOoJoQBbVlO7lmL7VsbU1VzHbsS1t50BgFlCKMAO1NKupei+laeVVJxNxQXgyAihADtQSbuWovtWRruW9q8X09EwxXPEVFwAjo0QCrA7w67UDaFvZU6DPsYpZwEUgKMjhALsyNA3zxlC38qL1//4ccgV58loUsW0bQBYhRAKsCtdu5ZhbjozpL6VKTXf9R8OSoTn2MSqHwLA0RBCAXYonUwGGZCGtFnOtGI7vIpzylkVFICjJIQC7FBsnjO8di0D61s51HYtp6biAnCchFCA3RvU5jmDnEI8tHYtuXnb7+4LAEdHCAXYsagqDmrznAH2rRxau5ac6ugjCwDrEEIB9mMQlboIy4PtWzmgdi3ppPydhwFgV4RQgD0YSruWIfetHEq7llgjbCouAMdMCAXYh4G0axl638ohtGtJI1NxAThuQijAnpTeriWqiEPvWzmEdi3TnxEAjpcQCrAnpbdrqaJvZfntWl50PyMAHDEhFGC/yt08p5a+lSW3a0kDbH8DAFsmhALsUbHtWirqW9lVnJv83/2wIPn84ueX1oMCcPSEUID9K65SV1vfypRHxd2fIWxMBQD7IIQC7FmJ7Vpq61sZ7VqiutsPy5CTEAoALSEUYN8K2zyn2r6Vo5Iqzvk8pmL3AwA4akIowCEUtHlOrX0rp+svC6k4l71jLwDslRAKcAB95fHFdHRYVfetzGVUQyejSnYeBoAtEEIBDiWnEgJS3X0rC2g7E7shv/v5pzf9EACOnhAKcCCxec7B27VU3reyhHYtKWdrQQHgGiEU4IBSar7rPzyA4+hbeeh2LabiAsBNQijAAU3XYx5m85xj6Vt50HYt7e2aigsANwmhAId0yHYtx9S38kDtWnKyKy4AzBJCAQ7tIO1ajqtv5aHataSTinceBoA1CaEAB3aQdi3H2Ldy3+1acvO2f2wBgGuEUIAS7Lldy1FulrPvdi0HmgIMAKUTQgEKsM92Lcfat3Lf7Vqmm04BALOEUIBC7KtdyzH3rdxju5YX3aZTAMAtQihAIfbVruWY+1Z2Fefc/NQPdycdR/sbAFiHEApQin20a9G3skmj3W/KZCouAMwnhAKUZMftWvStbAPizy9/2OX6227dqam4ADCXEApQkF1vnqNv5VTKeXdhPCfHGAAWEEIBCrOzzXP0rfzdxdWuKs75/PL1SyEUABYQQgEKE5vnRGDsh9ujb+UHb3/6bRcV59zYkAgA7iOEApRoB4HRZjk35bT9augeW8AAwGAJoQAFis1zYmpnP9wGfStnxC7B22zXEpsddVVsAGAhIRSgVHmL1VB9K++0zXYtKWfHGACWIIQClOp0srWAZCru3bbZrmUy2t7jBQA1E0IBCrWtdi36Vi62jXYtEWRjem8/BAAWEEIBCraVjW70rVxoS+1a7DwMAEsSQgEKtnm7Fn0r77WFdi3pxHRnAFiWEApQug3atehbuZyN2rXk5m1Mne5HrOrxs49Syk/6UblS83H/EQAbEkIBCrdJuxZ9K5ezSbuWnLa3w+4xevjg5Ov2mfqoHxYrNc2/nn36vP1ZAdiUEAowBGu0a9G3cjXrtmsxFXdj3/Z/l28yoJ8VoGBCKMAQrNGuRd/K1azZruWFqbjri8piVBj7YflS8/js6R8+60cArEkIBRiAddq16Fu5upXbtSRrbjcywMpi+3v4Xf8hAGsSQgEGYpX1nfpWrmfarmX59bcXl6birqurKKbmcT8cjJSaZ2f/8cwmRQAbEEIBBmKVdi0rV/SY6tq1LF3dfBGf33/MioZcUczjkWoowAaEUIAhWbZdyxprSJlKJ5OlAkbOdsVdV1QSo6LYDwcnNekr1VCA9QmhAAOy1OY5+lZupFt/e2+7lnx++fqlqbhrqqKSeDXSrgVgTUIowMDcN9VW38qtWFhxXmHKLjO6KmiTvuqHw5Wab5vHzz7qRwCsQAgFGJjp5jnz6Vu5uahyLqw45+QYr6uaCmJ69PDBiWoowBqEUICh6TbPmduuRd/K7ZkT9k3FXVtUDqOCWI+a7gvA3gihAAOU05xqqL6VW3P5bvxDBM5++IENidY2rRymR/1w8FLT/OvZp89VQwFWJIQCDFD0AL1r8xx9K7doTruWycjOwxuor3I4UQ0FWJUQCjBQaXSrIqdv5ZbNtmuJdaJxAaAfsoKoGEblsB/WIzWPz57+4bN+BMAShFCAgZpt16Jv5fbNtmtJOas0r6k9jsNvyzJHbnK19w1gF4RQgAH70K7FZjk79GH97eninYm5W1QKq6yC9lJqnj349NmTfgjAPYRQgAF7365F38rd+b1dS27e2nl4PcdQKUx5ZG0owJKEUIAhe9+uRd/KXfs+J9Od1xEVwqgU9sNqpSZ9dfYfzz7uhwAskPq/ARiq6L1oQ6LdimMcHOeVTTftmRzJxj2jHy9e/+PHfgAAAAAAAAAAAAAAAAAAAAAAAADAYk3z/wGzAF/1+qaELgAAAABJRU5ErkJggg=="
        const rodapeTimbradoB64 = "data:image/png;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgP9/e3BAAwAAgDDo/VPbwwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADdqRGhK6MdbPKQAAAAASUVORK5CYII="

        doc.addImage(logoTimbradoB64, 'PNG', 10, 10, 40, 20);
        doc.addImage(rodapeTimbradoB64, 'PNG', 0, 270, 210, 20);
        console.log("Imagem do timbrado adicionada com sucesso.");

        // Título
        doc.setFontSize(18).setFont('helvetica', 'bold');
        doc.text('Proposta Comercial', 105, 30, { align: 'center' });
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
            `Área: ${dados.area.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m²`
        ];

        const colDireita = [
            `Valor Total: ${dados.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
            `Valor m²: ${dados.valorMetroQuadrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
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

        doc.text(`Entrada: ${dados.finValorEntrada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 20, yAtual); yAtual += 8;
        doc.text(`Data de Vencimento Entrada: ${formatDateStr(dados.finDataEntrada)}`, 20, yAtual); yAtual += 8;
        doc.text(`Quantidade Parcelas: ${dados.finQntParcela}`, 20, yAtual); yAtual += 8;
        doc.text(`Valor Parcelas: ${dados.finValorParcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 20, yAtual); yAtual += 8;
        doc.text(`Data de Vencimento 1ª Parcela: ${formatDateStr(dados.finDataParcela)}`, 20, yAtual); yAtual += 8;
        doc.text(`Quantidade Reforços: ${dados.finQntReforco}`, 20, yAtual); yAtual += 8;
        doc.text(`Valor Reforços: ${dados.finValorReforco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 20, yAtual); yAtual += 8;
        doc.text(`Data de Vencimento 1º Reforço: ${formatDateStr(dados.finDataReforco)}`, 20, yAtual); yAtual += 16;

        // Assinaturas
        doc.text(`Chapecó, ${hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.`, 190, yAtual, { align: 'right' });
        yAtual += 28;

        doc.line(32, yAtual, 92, yAtual);
        doc.line(118, yAtual, 178, yAtual);

        doc.setFontSize(10);
        doc.text(username, 62, yAtual + 5, { align: 'center' });
        doc.text("Corretor", 62, yAtual + 10, { align: 'center' });
        doc.text(dados.nomeCliente, 148, yAtual + 5, { align: 'center' });
        doc.text("Cliente", 148, yAtual + 10, { align: 'center' });

        console.log("primeira página construída, iniciando a segunda página.")

        // ----------------------------
        // Segunda Página - Termo de Intenção de Compra
        doc.addPage();
        doc.addImage(timbradoBase64, 'PNG', 0, 0, 210, 297); // Se quiser o timbrado na segunda página, adicione aqui também

        // Adicionar título
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold')
        doc.text('Termo de Intenção de Compra e Proposta Financeira', 105, 30, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal')
        yAtual = 50;

        const longText = `        Pelo presente termo e na melhor forma de direito o Sr(a). ${dados.nomeCliente}, Brasileiro(a), ${dados.estadoCivilCliente}, inscrito(a) sob CPF nº ${dados.cpfCliente}, ${dados.profissaoCliente}, residente e domiciliado(a) em ${dados.enderecoCliente}, no Município de ${dados.cidadeCliente}, formaliza para a empresa WF Soluções Imobiliárias Ltda, inscrita no CNPJ 53.265.298/0001-28, neste ato representada por seus Sócios Procuradores Sr. Marcos Aurelio Fortes dos Santos inscrito sob nº CPF 006.614.829-44 e/ou José Eduardo Bevilaqua inscrito sob nº CPF 061.248.209-00 o Termo de Intenção de Compra e Proposta Financeira do imóvel abaixo descrito:

        Lote urbano nº ${dados.lote}, da quadra nº ${dados.quadra}, com ${dados.area.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} metros de área, sito no Município e Comarca de Chapeco/SC, inserido no empreendimento denominado “Origens Bairro Inteligente”.
         
        Ofereço para compra do imóvel mencionado acima o valor de ${dados.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${numeroPorExtenso(dados.valorTotal)}), me comprometo ainda a realizar os pagamentos da seguinte forma: 25% (vinte e cinco por cento) do valor total do imóvel pago em moeda corrente nacional no dia ${formatDateStr(dados.finDataEntrada)} e o saldo dividido em 48 (quarenta e oito) parcelas mensais fixas e sucessivas vencendo a primeira em ${formatDateStr(dados.finDataParcela)} e 04 reforços anuais vencendo o primeiro em ${formatDateStr(dados.finDataReforco)}.
        
        Caso essa proposta seja aceita, assumo desde já o compromisso de fornecer todos os documentos necessários para formalização da negociação dentro de um prazo máximo de 05 (cinco) dias.`
            ;

        doc.text(longText, 20, yAtual, { align: "justify", maxWidth: 170, lineHeightFactor: 2.5 })

        yAtual = 230
        doc.text(`Chapecó, ${hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.`, 190, yAtual, { align: 'right' });
        yAtual += 20;

        // Define posição, tamanho e desenha as linhas
        startX = 75;
        endX = 135;
        doc.line(startX, yAtual, endX, yAtual);
        yAtual += 5;

        // Inclui Nome e Qualificação
        doc.setFontSize(10);
        doc.text(dados.nomeCliente, 105, yAtual, { align: 'center' });
        doc.text("Cliente", 105, yAtual + 5, { align: 'center' });

        console.log("pdf pronto para ser exportado")

    } catch (error) {
        // Bloco de erro caso a imagem não carregue
        console.error("Erro ao carregar a imagem do timbrado:", error);
        alert("⚠️ Ocorreu um erro ao carregar os recursos para o PDF. Verifique sua conexão e tente novamente.");
        return; // Interrompe a função
    }

    // ----------------------------
    // Exporta

    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        console.log("Lógica para iOS/Mobile ativada.");
        const dataUriString = doc.output('datauristring');
        window.open(dataUriString, "_blank");
    } else {
        console.log("Lógica para Desktop ativada (download direto).");
        doc.save(`Proposta_${dados.quadra}_${dados.lote}.pdf`);
    }

    console.log("Processo finalizado.");
}

// Expõe a função principal para o Bubble, tornando-a "global"
// O nome que o Bubble vai chamar é "abrirModalProposta"
window.abrirModalProposta = abrirEPreencherModalProposta;