// --- UTILITÁRIOS ---
function parseBR(valor) {
    if (!valor) return 0;
    return parseFloat(
        valor.toString()
            .replace(/[^\d,.-]/g, '') // remove R$, espaços, não numéricos
            .replace(/\./g, '')       // remove milhar
            .replace(',', '.')        // virgula para ponto
    ) || 0;
}

function formatDateStr(dataStr) {
    if (!dataStr) return '';
    const [ano, mes, dia] = dataStr.split('-');
    return `${dia}/${mes}/${ano}`;
}

function numeroPorExtenso(valor) {
    if (typeof valor !== 'number') throw new Error('Valor deve ser numérico');
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
    
    // Limite de segurança
    if (inteiro > 999999999) return "Valor muito alto";

    const milhoes = Math.floor(inteiro / 1000000);
    const milhares = Math.floor((inteiro % 1000000) / 1000);
    const centenasFinal = inteiro % 1000;

    let partes = [];
    if (milhoes) partes.push(grupoExtenso(milhoes, "milhão", "milhões"));
    if (milhares) partes.push(grupoExtenso(milhares, "mil", "mil"));
    if (centenasFinal) partes.push(extensoAte999(centenasFinal));

    let resultado = partes.join(" e ") || "zero";
    resultado += inteiro === 1 ? " real" : " reais";

    if (centavos > 0) {
        resultado += " e " + (centavos === 1 ? extensoAte999(centavos) + " centavo" : extensoAte999(centavos) + " centavos");
    }
    return resultado;
}

// --- MODAL & DOM ---
async function garantirEstruturaModal(username) {
    if (document.getElementById('modalProposta')) return;

    try {
        const response = await fetch('https://cdn.jsdelivr.net/gh/nexconge/plataforma@developer/html/menuPropostaV08.html');
        if (!response.ok) throw new Error('HTML Modal inacessível');
        const html = await response.text();

        const modalContainer = document.getElementById('modal-container');
        if (!modalContainer) throw new Error("Container #modal-container não encontrado.");
        modalContainer.innerHTML = html;

        configurarEventosDoModal(username);
    } catch(e) { console.error(e); }
}

function configurarEventosDoModal(username) {
    const modal = document.getElementById('modalProposta');
    const btnFechar = document.getElementById('closeModal');
    const form = document.getElementById('formProposta');
    const header = document.getElementById('pageHeader');

    if (!modal || !btnFechar || !form) return;

    const fechar = () => {
        modal.style.display = 'none';
        if(header) header.style.display = '';
    };

    btnFechar.addEventListener('click', fechar);
    window.addEventListener('click', (e) => { if (e.target == modal) fechar(); });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        gerarProposta(username);
    });

    // Máscaras
    document.getElementById("propClienteCPF")?.addEventListener('input', function() {
        let v = this.value.replace(/\D/g, '');
        if (v.length > 14) v = v.substring(0, 14);
        if (v.length <= 11) {
            v = v.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        } else {
            v = v.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
        }
        this.value = v;
    });

    const tel = document.getElementById("propClienteTelefone");
    if(tel) tel.addEventListener("input", () => {
        let v = tel.value.replace(/\D/g, "");
        v = v.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
        tel.value = v;
    });
}

// --- LÓGICA DE NEGÓCIO ---
export async function abrirEPreencherModalProposta(mapaManager, username) {
    if (!mapaManager || !mapaManager.selectedLoteId) {
        alert("Por favor, selecione um lote no mapa primeiro!");
        return;
    }
    const lote = mapaManager.polygons[mapaManager.selectedLoteId].loteData;

    if (lote.Status !== "Disponível") {
        alert("Lote não disponível para venda.");
        return;
    }

    await garantirEstruturaModal(username);
    const modal = document.getElementById('modalProposta');
    const header = document.getElementById('pageHeader');

    // Preenche dados visuais
    const fmtMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const match = lote.Nome.match(/^Q(\d+)([A-Z]+)(\d+)$/);
    
    document.getElementById('propQuadraNome').textContent = match ? (match[1] || 'N/A') : 'N/A';
    document.getElementById('propLoteNome').textContent = match ? (match[3] || 'N/A') : 'N/A';
    document.getElementById('propLoteArea').textContent = (lote.Área || 0).toLocaleString('pt-BR', {minimumFractionDigits:2});
    document.getElementById('propLoteValor').textContent = fmtMoney.format(lote.Valor || 0);

    // Condição padrão
    const entrada = lote.Valor * 0.25;
    const parcela = lote.Valor * 0.012;
    const reforco = (lote.Valor - entrada - (parcela * 48)) / 4;

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if(el) { el.value = val; el.disabled = true; }
    }
    
    setVal('propValorEntrada', fmtMoney.format(entrada));
    setVal('propQtdeParcelas', 48);
    setVal('propValorParcela', fmtMoney.format(parcela));
    setVal('propQtdeReforcos', 4);
    setVal('propValorReforco', fmtMoney.format(reforco));

    if(modal) modal.style.display = 'flex';
    if(header) header.style.display = 'none';
}

// --- PDF GENERATION ---
async function carregarTimbrado64() {
    const fimUrl = document.getElementById("empreendimento2")?.value;
    if(!fimUrl) return null;
    const url = "https://raw.githubusercontent.com/Nexconge/plataforma/refs/heads/main/pngs/" + fimUrl + ".txt";
    try {
        const r = await fetch(url);
        return r.ok ? (await r.text()).trim() : null;
    } catch(e) { console.error(e); return null; }
}

async function gerarProposta(username) {
    const { jsPDF } = window.jspdf;
    
    const getEl = id => document.getElementById(id);
    const getText = id => getEl(id)?.textContent || '';
    const getValue = id => getEl(id)?.value || '';
    const parseVal = id => parseBR(getValue(id));

    const dados = {
        quadra: getText('propQuadraNome'),
        lote: getText('propLoteNome'),
        area: parseBR(getText('propLoteArea')),
        valorTotal: parseBR(getText('propLoteValor')),
        nomeCliente: getValue('propClienteNome'),
        cpfCliente: getValue('propClienteCPF'),
        emailCliente: getValue('propClienteEmail'),
        telefoneCliente: getValue('propClienteTelefone'),
        profissaoCliente: getValue('propClienteProfissao'),
        estadoCivilCliente: getValue('propClienteEstadoCivil'),
        enderecoCliente: getValue('propClienteEndereco'),
        cidadeCliente: getValue('propClienteCidade'),
        // Financeiro
        finValorEntrada: parseVal('propValorEntrada'),
        finDataEntrada: getValue('propDataEntrada'),
        finQntParcela: parseInt(getValue('propQtdeParcelas')) || 0,
        finValorParcela: parseVal('propValorParcela'),
        finDataParcela: getValue('propDataPrimeiraParcela'),
        finQntReforco: parseInt(getValue('propQtdeReforcos')) || 0,
        finValorReforco: parseVal('propValorReforco'),
        finDataReforco: getValue('propDataPrimeiroReforco')
    };

    dados.valorMetroQuadrado = dados.valorTotal / (dados.area || 1);

    // Validação simples
    if(!dados.nomeCliente || !dados.cpfCliente || !dados.finDataEntrada) {
        alert("Preencha os campos obrigatórios e as datas.");
        return;
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const hoje = new Date();
    
    // Imagem
    try {
        const timbrado = await carregarTimbrado64();
        if(timbrado) doc.addImage(timbrado, 'PNG', 0, 0, 210, 297);
    } catch(e) { console.warn("Sem timbrado"); }

    let y = 50;
    
    // --- PÁGINA 1 ---
    doc.setFontSize(18).setFont('helvetica', 'bold').text('Proposta Comercial', 105, 30, { align: 'center' });
    
    // Helper de seção
    const addSecao = (titulo) => {
        doc.setFontSize(14).setFont('helvetica', 'bold').text(titulo, 20, y);
        y+=2; doc.line(20, y, 190, y); y+=8;
        doc.setFontSize(10).setFont('helvetica', 'normal');
    };
    
    addSecao('Dados Lote');
    doc.text(`Quadra: ${dados.quadra}`, 20, y);
    doc.text(`Valor Total: ${dados.valorTotal.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`, 105, y);
    y+=8;
    doc.text(`Lote: ${dados.lote}`, 20, y);
    doc.text(`Valor m²: ${dados.valorMetroQuadrado.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`, 105, y);
    y+=8;
    doc.text(`Área: ${dados.area.toLocaleString('pt-BR',{minimumFractionDigits:2})} m²`, 20, y);
    y+=24;

    addSecao('Dados Cliente');
    doc.text(`Nome: ${dados.nomeCliente}`, 20, y); doc.text(`Profissão: ${dados.profissaoCliente}`, 105, y); y+=8;
    doc.text(`CPF: ${dados.cpfCliente}`, 20, y); doc.text(`Estado Civil: ${dados.estadoCivilCliente}`, 105, y); y+=8;
    doc.text(`Telefone: ${dados.telefoneCliente}`, 20, y); doc.text(`Endereço: ${dados.enderecoCliente}`, 105, y); y+=8;
    doc.text(`Email: ${dados.emailCliente}`, 20, y); doc.text(`Cidade/UF: ${dados.cidadeCliente}`, 105, y); y+=24;

    addSecao('Condição Financeira');
    const linhaFin = (lbl, val) => { doc.text(`${lbl}: ${val}`, 20, y); y+=8; };
    const fmt = v => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    
    linhaFin('Entrada', fmt(dados.finValorEntrada));
    linhaFin('Vencimento Entrada', formatDateStr(dados.finDataEntrada));
    linhaFin('Qtd. Parcelas', dados.finQntParcela);
    linhaFin('Valor Parcela', fmt(dados.finValorParcela));
    linhaFin('Vencimento 1ª Parcela', formatDateStr(dados.finDataParcela));
    linhaFin('Qtd. Reforços', dados.finQntReforco);
    linhaFin('Valor Reforço', fmt(dados.finValorReforco));
    linhaFin('Vencimento 1º Reforço', formatDateStr(dados.finDataReforco));
    
    y+=10;
    doc.text(`Chapecó, ${hoje.toLocaleDateString('pt-BR',{dateStyle:'long'})}.`, 190, y, {align:'right'});
    
    // Assinaturas Pg 1
    y+=25;
    doc.line(32, y, 92, y); doc.line(118, y, 178, y);
    doc.text(username, 62, y+5, {align:'center'}); doc.text("Corretor", 62, y+10, {align:'center'});
    doc.text(dados.nomeCliente, 148, y+5, {align:'center'}); doc.text("Cliente", 148, y+10, {align:'center'});

    // --- PÁGINA 2 ---
    doc.addPage();
    try {
        const timbrado2 = await carregarTimbrado64();
        if(timbrado2) doc.addImage(timbrado2, 'PNG', 0, 0, 210, 297);
    } catch(e) {}

    doc.setFontSize(18).setFont('helvetica', 'bold').text('Termo de Intenção de Compra', 105, 30, { align: 'center' });
    doc.setFontSize(10).setFont('helvetica', 'normal');
    
    const textoLongo = `
    Pelo presente termo, ${dados.nomeCliente}, inscrito(a) sob CPF nº ${dados.cpfCliente}, residente em ${dados.enderecoCliente}, formaliza o interesse na compra do Lote ${dados.lote}, Quadra ${dados.quadra}, com ${dados.area.toLocaleString('pt-BR')} m².
    
    Valor Oferecido: ${dados.valorTotal.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} (${numeroPorExtenso(dados.valorTotal)}).
    
    Forma de Pagamento:
    Entrada de ${fmt(dados.finValorEntrada)} em ${formatDateStr(dados.finDataEntrada)}.
    Saldo em ${dados.finQntParcela} parcelas de ${fmt(dados.finValorParcela)}, iniciando em ${formatDateStr(dados.finDataParcela)}.
    ${dados.finQntReforco > 0 ? `Mais ${dados.finQntReforco} reforços de ${fmt(dados.finValorReforco)}, inicio em ${formatDateStr(dados.finDataReforco)}.` : ''}
    `;

    const linhas = doc.splitTextToSize(textoLongo.trim(), 170);
    doc.text(linhas, 20, 50);

    y = 50 + (linhas.length * 5) + 30;
    doc.text(`Chapecó, ${hoje.toLocaleDateString('pt-BR',{dateStyle:'long'})}.`, 190, y, {align:'right'});
    y+=25;
    
    doc.line(75, y, 135, y);
    doc.text(dados.nomeCliente, 105, y+5, {align:'center'});
    doc.text("Cliente", 105, y+10, {align:'center'});

    // Exportação
    if (/Android|iPhone/i.test(navigator.userAgent)) {
        window.open(doc.output('datauristring'), "_blank");
    } else {
        doc.save(`Proposta_${dados.quadra}_${dados.lote}.pdf`);
    }
}

// Expõe para o Bubble
window.abrirModalProposta = abrirEPreencherModalProposta;