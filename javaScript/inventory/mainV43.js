// mainV42.js
import { buscarDadosEstoque, buscarRelatoriosDisponiveis } from './apiV05.js';
import { extrairDadosRelatorio } from './processingV19.js';
import { gerarTabelaDetalhada, gerarTabelaRecomendacao, preencherSelect } from './uiV09.js';

// --- ESTADO & CACHE ---
const EstadoApp = {
    cadastrosRaw: [],
    empresaSelecionada: null,
    filialSelecionada: null,
    cacheDatas: {},
    cacheRelatorios: {},
    filtrosAtivos: [],
    ordenacaoSaldos: 'quantidade', // 'quantidade' ou 'valorTotal'
    mesFiltroVendas: null // Ex: "2024-05"
};

// Funções para alternar visões via UI
window.alterarOrdenacaoSaldos = function(tipo) {
    EstadoApp.ordenacaoSaldos = tipo; // 'quantidade' ou 'valor'
    atualizarDashboards();
};

window.filtrarVendasPorMes = function(mes) {
    EstadoApp.mesFiltroVendas = mes; // null (para total) ou string do mês
    atualizarDashboards();
};

// --- FUNÇÃO PRINCIPAL DE INICIALIZAÇÃO ---
window.iniciarAplicacao = function (textoCadastros) {
    console.log("Iniciando aplicação...");

    try {
        let jsonString = textoCadastros.trim();
        if (!jsonString.startsWith("[")) {
            jsonString = `[${jsonString}]`;
        }

        EstadoApp.cadastrosRaw = JSON.parse(jsonString);

        const listaEmpresas = EstadoApp.cadastrosRaw.map(c => ({
            id: c.id,
            nome: c.cadastro
        }));

        preencherSelect("empresaSelect", listaEmpresas, "Selecione a Empresa");
        renderizarPlaceholders();
        configurarListeners();

    } catch (e) {
        console.error("Erro ao iniciar aplicação (Parse JSON):", e);
        alert("Erro ao ler dados de acesso. Verifique o console.");
    }
};

function configurarListeners() {
    const elEmpresa = document.getElementById("empresaSelect");
    const elFilial = document.getElementById("filialSelect");
    const elData = document.getElementById("dataSelect");
    const elTagInput = document.getElementById("tag-input");

    elEmpresa.addEventListener("change", async (e) => {
        const idEmpresa = e.target.value;
        EstadoApp.empresaSelecionada = idEmpresa;

        elFilial.innerHTML = "";
        elData.innerHTML = "";
        limparTabelas();

        if (!idEmpresa) return;

        const empresaObj = EstadoApp.cadastrosRaw.find(c => c.id === idEmpresa);
        if (empresaObj && empresaObj.entidades) {
            const listaFiliais = empresaObj.entidades.map(ent => ({
                id: ent.idEntidade,
                nome: ent.nome
            }));
            preencherSelect("filialSelect", listaFiliais, "Todas / Selecione Loja");
        }

        await carregarDatasRelatorios(idEmpresa);
    });

    elFilial.addEventListener("change", (e) => {
        EstadoApp.filialSelecionada = e.target.value;
    });

    elData.addEventListener("change", async (e) => {
        const dataSelecionada = e.target.value;
        if (dataSelecionada && EstadoApp.empresaSelecionada) {
            await carregarRelatorioFinal(EstadoApp.empresaSelecionada, dataSelecionada);
        }
    });

    // --- Listener das Tags de Exclusão ---
    elTagInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const rawValue = elTagInput.value.trim();
            if (rawValue) {
                processarNovaTag(rawValue);
                elTagInput.value = "";
            }
        }
    });
}

// --- LÓGICA DE DADOS E CACHE ---
async function carregarDatasRelatorios(idCadastro) {
    const elData = document.getElementById("dataSelect");

    if (EstadoApp.cacheDatas[idCadastro]) {
        console.log("Usando datas em cache para:", idCadastro);
        popularSelectDatas(EstadoApp.cacheDatas[idCadastro]);
        return;
    }

    elData.innerHTML = "<option>Carregando...</option>";
    try {
        const resultado = await buscarRelatoriosDisponiveis(idCadastro);
        const stringDatas = resultado.response.relatoriosDisponivies || "";

        const listaDatas = stringDatas.split(',')
            .filter(d => d.trim().length > 0)
            .map(d => ({ id: d.trim(), nome: d.trim() }));

        EstadoApp.cacheDatas[idCadastro] = listaDatas;
        popularSelectDatas(listaDatas);

    } catch (erro) {
        console.error("Erro ao buscar datas:", erro);
        elData.innerHTML = "<option>Erro ao carregar</option>";
    }
}

function popularSelectDatas(lista) {
    preencherSelect("dataSelect", lista, "Selecione a Data");
}

async function carregarRelatorioFinal(idCadastro, data) {
    const chaveCache = `${idCadastro}_${data}`;

    if (EstadoApp.cacheRelatorios[chaveCache]) {
        console.log("Relatório em cache recuperado.");
        renderizarDashboards(EstadoApp.cacheRelatorios[chaveCache]);
        return;
    }

    console.log(`Buscando relatório para ${idCadastro} na data ${data}...`);
    try {
        const dadosBrutos = await buscarDadosEstoque(idCadastro, data);
        const dadosProcessados = extrairDadosRelatorio(dadosBrutos);

        EstadoApp.cacheRelatorios[chaveCache] = dadosProcessados;
        renderizarDashboards(dadosProcessados);

    } catch (erro) {
        console.error("Erro fatal ao gerar relatório:", erro);
        limparTabelas();
    }
}

function atualizarDashboards() {
    const dataSelecionada = document.getElementById("dataSelect").value;
    const chaveCache = `${EstadoApp.empresaSelecionada}_${dataSelecionada}`;
    
    if (EstadoApp.cacheRelatorios[chaveCache]) {
        renderizarDashboards(EstadoApp.cacheRelatorios[chaveCache]);
    }
}

function renderizarDashboards(dados) {
    //Preenche o select de meses disponíveis para filtro com base nos dados atuais
    popularFiltroMesesDisponiveis(dados);
    // --------------------------------------------------------
    // 1. Lógica Dinâmica: Mais Vendidos (Filtro de Mês)
    // --------------------------------------------------------
    let listaVendas = [...dados.maisVendidos];

    if (EstadoApp.mesFiltroVendas && EstadoApp.mesFiltroVendas !== "") {
        // Se um mês foi selecionado, recalculamos as quantidades baseadas apenas naquele mês
        listaVendas = listaVendas.map(item => {
            const qtdNoMes = (item.vendasPorMes && item.vendasPorMes[EstadoApp.mesFiltroVendas]) 
                ? item.vendasPorMes[EstadoApp.mesFiltroVendas] 
                : 0;
            
            return {
                ...item,
                quantidade: qtdNoMes,
                valorTotal: qtdNoMes * item.valorUnitario // Recalcula o valor total vendido no mês
            };
        }).filter(item => item.quantidade > 0); // Oculta quem não vendeu no mês
    }

    // Ordena do maior pro menor e pega o Top 15
    listaVendas.sort((a, b) => b.quantidade - a.quantidade);
    const topVendas = listaVendas.slice(0, 15);

    gerarTabelaDetalhada(
        "tabelaMaisVendidos",
        EstadoApp.mesFiltroVendas ? `Mais Movimentados (${EstadoApp.mesFiltroVendas})` : "Produtos Mais Movimentados (Total)",
        topVendas
    );

    // --------------------------------------------------------
    // 2. Lógica Dinâmica: Maiores Saldos (Ordenação)
    // --------------------------------------------------------
    let listaSaldos = [...dados.maioresSaldos];

    listaSaldos.sort((a, b) => {
        if (EstadoApp.ordenacaoSaldos === 'valor') {
            return b.valorTotal - a.valorTotal; // Ordena pela fortuna parada em estoque
        }
        return b.quantidade - a.quantidade; // Ordena por unidades (Padrão)
    });
    
    // Pega o Top 15 da ordenação escolhida
    const topSaldos = listaSaldos.slice(0, 15);

    gerarTabelaDetalhada(
        "tabelaMaioresSaldos",
        `Maiores Estoques (Por ${EstadoApp.ordenacaoSaldos === 'valor' ? 'Valor Financeiro' : 'Quantidade'})`,
        topSaldos
    );

    // --------------------------------------------------------
    // 3. Recomendação MRP e Filtros de Exclusão/Inclusão
    // --------------------------------------------------------
    let listaMRP = [...dados.recomendacaoCompra];
    listaMRP.sort((a, b) => b.vendaMedia - a.vendaMedia);
    
    gerarTabelaRecomendacao("tabelaRecomendacaoCompra", listaMRP.slice(0, 15));
    aplicarLogicaDeFiltro(); // Aplica suas tags
}

// --- FUNÇÕES VISUAIS ---

function renderizarPlaceholders() {
    gerarTabelaDetalhada(
        "tabelaMaisVendidos",
        "Produtos Mais Movimentados",
        [],
        "Aguardando seleção..."
    );

    gerarTabelaDetalhada(
        "tabelaMaioresSaldos",
        "Maiores Saldos",
        [],
        "Aguardando seleção..."
    );

    gerarTabelaRecomendacao(
        "tabelaRecomendacaoCompra",
        [],
        "Aguardando seleção..."
    );
}

function limparTabelas() {
    renderizarPlaceholders();
}

// --- NOVAS FUNÇÕES DE GESTÃO DE TAGS (Filtro de Exclusão) ---

function processarNovaTag(textoRaw) {
    let tipo = 'inc'; // MUDANÇA: O padrão agora é inclusão (inc)
    let termo = textoRaw;

    if (textoRaw.startsWith('inc:')) {
        tipo = 'inc';
        termo = textoRaw.replace('inc:', '');
    } else if (textoRaw.startsWith('exc:')) {
        tipo = 'exc';
        termo = textoRaw.replace('exc:', '');
    }
    // Se não cair nos 'if' acima, o 'tipo' continua 'inc' e o 'termo' é o próprio 'textoRaw'

    if (!termo || termo.trim() === "") return;

    // Evita duplicados (mesmo termo com mesmo tipo)
    if (EstadoApp.filtrosAtivos.some(f => f.termo.toLowerCase() === termo.toLowerCase() && f.tipo === tipo)) return;

    // Após inserir a tag no DOM:
    const tagArea = document.querySelector('.tag-area');

    // Pequeno delay para garantir que o DOM atualizou o tamanho
    setTimeout(() => {
        tagArea.scrollLeft = tagArea.scrollWidth;
    }, 10);

    EstadoApp.filtrosAtivos.push({ tipo, termo: termo.trim() });
    renderizarTagNoHTML(tipo, termo.trim());
    aplicarLogicaDeFiltro();
}

function renderizarTagNoHTML(tipo, termo) {
    const container = document.getElementById("tag-container");
    const input = document.getElementById("tag-input");

    const tag = document.createElement("div");
    // Adicionamos uma classe CSS diferente para inclusão e exclusão se quiser colorir
    tag.className = `tag ${tipo === 'inc' ? 'tag-inc' : 'tag-exc'}`;
    tag.innerHTML = `<b>${tipo}:</b>${termo} <span class="remove-btn">&times;</span>`;

    tag.querySelector(".remove-btn").onclick = () => {
        EstadoApp.filtrosAtivos = EstadoApp.filtrosAtivos.filter(f => !(f.termo === termo && f.tipo === tipo));
        tag.remove();
        aplicarLogicaDeFiltro();
    };

    container.insertBefore(tag, input);
}

function aplicarLogicaDeFiltro() {
    const tabela = document.getElementById("tabelaRecomendacaoCompra");
    if (!tabela) return;

    const linhas = tabela.querySelectorAll("tbody tr");
    const filtrosInc = EstadoApp.filtrosAtivos.filter(f => f.tipo === 'inc');
    const filtrosExc = EstadoApp.filtrosAtivos.filter(f => f.tipo === 'exc');

    linhas.forEach(linha => {
        const nomeProduto = linha.cells[0]?.innerText.toLowerCase() || "";
        let deveExibir = true;

        // 1. Se houver filtros de INCLUSÃO, o item DEVE atender a pelo menos um deles (Lógica OR)
        // Se preferir que atenda a TODOS, mude .some para .every
        if (filtrosInc.length > 0) {
            deveExibir = filtrosInc.some(f => nomeProduto.includes(f.termo.toLowerCase()));
        }

        // 2. Se houver filtros de EXCLUSÃO, o item NÃO PODE atender a nenhum deles
        if (filtrosExc.length > 0) {
            const matchesExc = filtrosExc.some(f => nomeProduto.includes(f.termo.toLowerCase()));
            if (matchesExc) deveExibir = false;
        }

        linha.style.display = deveExibir ? "" : "none";
    });
}

function popularFiltroMesesDisponiveis(dados) {
    const selectMes = document.getElementById("mesFiltro");
    if (!selectMes) return;

    // 1. Extrair todos os meses únicos disponíveis nos dados de vendas
    const mesesUnicos = new Set();
    
    // Varre todos os produtos vendidos
    dados.maisVendidos.forEach(item => {
        if (item.vendasPorMes) {
            // Pega as chaves do dicionário de meses (ex: "2024-05", "2024-04")
            Object.keys(item.vendasPorMes).forEach(mes => mesesUnicos.add(mes));
        }
    });

    // 2. Ordenar os meses (do mais recente pro mais antigo)
    const mesesOrdenados = Array.from(mesesUnicos).sort((a, b) => b.localeCompare(a));

    // 3. Montar as opções do Select
    selectMes.innerHTML = ""; // Limpa opções anteriores

    // Opção padrão (Total)
    const optTodos = document.createElement("option");
    optTodos.value = "";
    optTodos.text = "Todos os Meses (Total)";
    selectMes.appendChild(optTodos);

    // Adiciona os meses encontrados formatados (Opcional: formatar "2024-05" para "Mai/2024")
    mesesOrdenados.forEach(mes => {
        const opt = document.createElement("option");
        opt.value = mes;
        
        // Exemplo de formatação visual (se o formato for YYYY-MM)
        try {
            const [ano, numMes] = mes.split('-');
            const dataObj = new Date(ano, parseInt(numMes) - 1);
            const mesFormatado = dataObj.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
            // Capitaliza a primeira letra (ex: mai de 2024 -> Mai de 2024)
            opt.text = mesFormatado.charAt(0).toUpperCase() + mesFormatado.slice(1);
        } catch {
            opt.text = mes; // Fallback se der erro
        }
        
        selectMes.appendChild(opt);
    });

    // 4. Se o usuário já tinha um mês selecionado antes de atualizar os dados, mantê-lo selecionado
    if (EstadoApp.mesFiltroVendas && mesesUnicos.has(EstadoApp.mesFiltroVendas)) {
        selectMes.value = EstadoApp.mesFiltroVendas;
    } else {
        // Se o mês selecionado não existe mais nos dados novos, reseta
        EstadoApp.mesFiltroVendas = "";
        selectMes.value = "";
    }
}