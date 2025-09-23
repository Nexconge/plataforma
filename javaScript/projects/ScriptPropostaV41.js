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
    const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
    const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
    const centenas = ["", "cem", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

    function parteInteira(n) {
        if (n < 20) return unidades[n];
        if (n < 100) return dezenas[Math.floor(n / 10)] + (n % 10 ? " e " + unidades[n % 10] : "");
        if (n < 1000) {
            if (n === 100) return "cem";
            return centenas[Math.floor(n / 100)] + (n % 100 ? " e " + parteInteira(n % 100) : "");
        }
        return n.toString(); // simplificado para até 999
    }

    const inteiro = Math.floor(valor);
    const centavos = Math.round((valor - inteiro) * 100);

    let resultado = parteInteira(inteiro) + (inteiro === 1 ? " real" : " reais");
    if (centavos > 0) {
        resultado += " e " + parteInteira(centavos) + (centavos === 1 ? " centavo" : " centavos");
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
        const timbradoBase64 = "data:image/png;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAExsQq0AACAASURBVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+MceHAgAAAAAAPm/NoKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoKe3AgAAAAAADk/9oIqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqV+0zvAAAIABJREFUqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqKuzBgQAAAAAAkP9rI6iqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqwBwcCAAAAAED+r42gqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqrFd2hTAAAgAElEQVSqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqwt6dpqmKQwEALUfkc9qB+19mF3MCYSq1hn7n/Ol+JYYQNeReQgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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";

        doc.addImage(timbradoBase64, 'PNG', 0, 0, 210, 297);
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
        // doc.addImage(timbrado, 'PNG', 0, 0, 210, 297); // Se quiser o timbrado na segunda página, adicione aqui também

        // Adicionar título
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold')
        doc.text('Termo de Intenção de Compra', 105, 30, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal')
        yAtual = 50;

        const longText = `        Pelo presente termo e na melhor forma de direito o Sr(a). ${dados.nomeCliente}, Brasileiro(a), ${dados.estadoCivilCliente}, inscrito(a) sob CPF nº ${dados.cpfCliente}, ${dados.profissaoCliente}, Residente e domiciliado em ${dados.enderecoCliente}, no Município de ${dados.cidadeCliente}, formalizo para a empresa WF Soluções Imobiliárias Ltda, inscrita no CNPJ 53.265.298/0001-28, neste ato representada por seus Sócios Procuradores Sr. Marcos Aurelio Fortes dos Santos inscrito sob nº CPF 006.614.829-44 e/ou José Eduardo Bevilaqua inscrito sob nº CPF 061.248.209-00 o Termo de Intenção de Compra e Proposta Financeira do imóvel abaixo descrito:

        Lote urbano nº ${dados.lote}, da quadra nº ${dados.quadra}, com ${dados.area.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} metros de área, sito no Município e Comarca de Chapeco/SC, inserido no empreendimento denominado “Origens Bairro Inteligente”.
         
        Ofereço para compra do imóvel mencionado acima o valor de ${dados.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${numeroPorExtenso(dados.valorTotal)}). Me comprometo ainda a realizar os pagamentos da seguinte forma: 25% (vinte e cinco por cento) do valor total do imóvel pago em moeda corrente nacional no dia ${formatDateStr(dados.finDataEntrada)} e o saldo dividido em 48 (quarenta e oito) parcelas mensais fixas e sucessivas vencendo a primeira em ${formatDateStr(dados.finDataParcela)} e 04 reforços anuais vencendo o primeiro em ${formatDateStr(dados.finDataReforco)}.
        
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