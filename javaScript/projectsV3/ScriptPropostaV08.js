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
    // --- MUDANÇA: Usa a nova função getSelectedLotesData ---
    if (!mapaManager || mapaManager.selectedIds.size === 0) {
        alert("Por favor, selecione ao menos um lote no mapa!");
        return;
    }

    const lotesSelecionados = mapaManager.getSelectedLotesData();

    // Verificação de Status (todos devem estar disponíveis)
    const indisponiveis = lotesSelecionados.filter(l => l.Status !== "Disponível");
    if (indisponiveis.length > 0) {
        alert(`Os seguintes lotes não estão disponíveis: ${indisponiveis.map(l=>l.Nome).join(", ")}`);
        return;
    }

    await garantirEstruturaModal(username);
    const modal = document.getElementById('modalProposta');
    const header = document.getElementById('pageHeader');

    // --- CÁLCULOS DE TOTAIS ---
    const totalArea = lotesSelecionados.reduce((sum, l) => sum + (l.Área || 0), 0);
    const totalValor = lotesSelecionados.reduce((sum, l) => sum + (l.Valor || 0), 0);

    // Formatação de Nomes (Agrupa Quadras se possível)
    // Ex: "Quadra 10 Lotes 01, 02" ou "Q10 L01, Q11 L02"
    const nomesList = lotesSelecionados.map(l => l.Nome).join(", ");
    
    // Preenche Modal
    const fmtMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    
    // Ajuste visual para múltiplos
    document.getElementById('propQuadraNome').textContent = "Diversas"; // Simplificação
    document.getElementById('propLoteNome').textContent = nomesList; 
    document.getElementById('propLoteArea').textContent = totalArea.toLocaleString('pt-BR', {minimumFractionDigits:2});
    document.getElementById('propLoteValor').textContent = fmtMoney.format(totalValor);

    // Condição Financeira (Baseada no Total)
    const entrada = totalValor * 0.25;
    const parcela = totalValor * 0.012; // Exemplo de lógica
    const reforco = (totalValor - entrada - (parcela * 48)) / 4;

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

    // --- HELPER: Captura segura de elementos ---
    const getEl = id => document.getElementById(id);
    const getText = id => getEl(id)?.textContent || '';
    const getValue = id => getEl(id)?.value || '';
    
    const parseBR = (val) => {
        if (!val) return 0;
        return parseFloat(val.toString().replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
    };

    // --- 1. CAPTURA DE DADOS ---
    const dados = {
        // Dados dos Lotes
        lotesDescricao: getText('propLoteNome'), 
        quadraGen: getText('propQuadraNome'),
        areaTotal: parseBR(getText('propLoteArea')),
        valorTotal: parseBR(getText('propLoteValor')),
        
        // Cliente
        nomeCliente: getValue('propClienteNome'),
        cpfCliente: getValue('propClienteCPF'),
        emailCliente: getValue('propClienteEmail'),
        telefoneCliente: getValue('propClienteTelefone'),
        profissaoCliente: getValue('propClienteProfissao'),
        estadoCivilCliente: getValue('propClienteEstadoCivil'),
        enderecoCliente: getValue('propClienteEndereco'),
        cidadeCliente: getValue('propClienteCidade'),

        // Financeiro
        finValorEntrada: parseBR(getValue('propValorEntrada')),
        finDataEntrada: getValue('propDataEntrada'),
        finQntParcela: parseInt(getValue('propQtdeParcelas')) || 0,
        finValorParcela: parseBR(getValue('propValorParcela')),
        finDataParcela: getValue('propDataPrimeiraParcela'),
        finQntReforco: parseInt(getValue('propQtdeReforcos')) || 0,
        finValorReforco: parseBR(getValue('propValorReforco')),
        finDataReforco: getValue('propDataPrimeiroReforco')
    };

    dados.valorMetroQuadrado = dados.valorTotal / (dados.areaTotal || 1);

    // --- 2. VALIDAÇÃO ---
    const camposObrigatorios = [
        dados.nomeCliente, dados.cpfCliente, dados.finDataEntrada, dados.finDataParcela
    ];
    if (camposObrigatorios.some(c => !c || c === "")) {
        alert("Preencha os campos obrigatórios (Cliente, CPF, Datas) antes de gerar.");
        return;
    }

    // --- 3. GERAÇÃO PDF ---
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const hoje = new Date();
    let yAtual = 50; 

    // Imagem de Fundo
    try {
        const timbradoBase64 = await carregarTimbrado64();
        if (timbradoBase64) doc.addImage(timbradoBase64, 'PNG', 0, 0, 210, 297);
    } catch (e) { console.warn("Sem timbrado"); }

    // Título
    doc.setFontSize(18).setFont('helvetica', 'bold');
    doc.text('Proposta Comercial', 105, 30, { align: 'center' });
    
    // Helper de Seção
    const desenharSecao = (titulo, y) => {
        doc.setFontSize(14).setFont('helvetica', 'bold').text(titulo, 20, y);
        const yLinha = y + 2;
        doc.line(20, yLinha, 190, yLinha);
        return yLinha + 8;
    };

    // --- SEÇÃO: DADOS DOS IMÓVEIS (Mantido V04 para suportar Multi-Lotes) ---
    yAtual = desenharSecao('Dados dos Imóveis', yAtual);
    doc.setFontSize(10).setFont('helvetica', 'normal');

    const larguraTextoLotes = 80;
    const linhasLotes = doc.splitTextToSize(`Lotes: ${dados.lotesDescricao}`, larguraTextoLotes);
    
    doc.text(linhasLotes, 20, yAtual);
    doc.text(`Valor Total: ${dados.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 105, yAtual);
    
    const alturaBlocoLotes = linhasLotes.length * 5; 
    
    doc.text(`Área Total: ${dados.areaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m²`, 105, yAtual + 8);
    doc.text(`Valor Médio m²: ${dados.valorMetroQuadrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 105, yAtual + 16);

    yAtual += Math.max(alturaBlocoLotes, 24) + 8;

     // Seção: Dados Cliente
    yAtual = desenharSecao('Dados Cliente', yAtual);
   
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

    // --- SEÇÃO: CONDIÇÃO FINANCEIRA (Revertido para V03 - Original) ---
    // Escrita linha a linha para garantir formatação idêntica
    yAtual = desenharSecao('Condição Financeira', yAtual);

    const fmtMoeda = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtData = d => formatDateStr(d);

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

    // Assinaturas Pg 1
    doc.text(`Chapecó, ${hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.`, 190, yAtual, { align: 'right' });
    yAtual += 28;

    doc.line(32, yAtual, 92, yAtual);
    doc.line(118, yAtual, 178, yAtual);

    doc.setFontSize(10);
    doc.text(username, 62, yAtual + 5, { align: 'center' });
    doc.text("Corretor", 62, yAtual + 10, { align: 'center' });
    doc.text(dados.nomeCliente, 148, yAtual + 5, { align: 'center' });
    doc.text("Cliente", 148, yAtual + 10, { align: 'center' });

    // --- PÁGINA 2: TERMO DE INTENÇÃO ---
    doc.addPage();
    try {
        const timbradoBase64 = await carregarTimbrado64();
        if (timbradoBase64) doc.addImage(timbradoBase64, 'PNG', 0, 0, 210, 297);
    } catch (e) {}

    doc.setFontSize(18).setFont('helvetica', 'bold');
    doc.text('Termo de Intenção de Compra e Proposta Financeira', 105, 30, { align: 'center' });
    doc.setFontSize(10).setFont('helvetica', 'normal');
    yAtual = 50;

    const textoTermo = `
        Pelo presente termo e na melhor forma de direito o Sr(a). ${dados.nomeCliente}, Brasileiro(a), ${dados.estadoCivilCliente}, inscrito(a) sob CPF nº ${dados.cpfCliente}, ${dados.profissaoCliente}, residente e domiciliado(a) em ${dados.enderecoCliente}, no Município de ${dados.cidadeCliente}, formaliza o Termo de Intenção de Compra e Proposta Financeira dos imóveis abaixo descritos:

        ${dados.lotesDescricao}.
        
        Área Total: ${dados.areaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m².
         
        Ofereço para compra dos imóveis mencionados acima o valor de ${fmtMoeda(dados.valorTotal)} (${numeroPorExtenso(dados.valorTotal)}), me comprometo ainda a realizar os pagamentos da seguinte forma: Entrada de ${fmtMoeda(dados.finValorEntrada)} em moeda corrente nacional no dia ${fmtData(dados.finDataEntrada)} e o saldo dividido em ${dados.finQntParcela} parcelas mensais fixas e sucessivas vencendo a primeira em ${fmtData(dados.finDataParcela)} e ${dados.finQntReforco} reforços anuais vencendo o primeiro em ${fmtData(dados.finDataReforco)}.
        
        Caso essa proposta seja aceita, assumo desde já o compromisso de fornecer todos os documentos necessários para formalização da negociação dentro de um prazo máximo de 05 (cinco) dias.
    `;

    const linhasTermo = doc.splitTextToSize(textoTermo.trim(), 170);
    doc.text(linhasTermo, 20, yAtual);

    yAtual += (linhasTermo.length * 5) + 30;

    doc.text(`Chapecó, ${hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.`, 190, yAtual, { align: 'right' });
    yAtual += 20;

    doc.line(75, yAtual, 135, yAtual);
    doc.text(dados.nomeCliente, 105, yAtual + 5, { align: 'center' });
    doc.text("Cliente", 105, yAtual + 10, { align: 'center' });

    // Exportação
    if (/Android|iPhone/i.test(navigator.userAgent)) {
        window.open(doc.output('datauristring'), "_blank");
    } else {
        const nomeArquivo = `Proposta_${dados.nomeCliente.replace(/[^a-z0-9]/gi, '_').substring(0, 15)}.pdf`;
        doc.save(nomeArquivo);
    }
}

// Expõe para o Bubble
window.abrirModalProposta = abrirEPreencherModalProposta;