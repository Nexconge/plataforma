// mainV32.js
import { buscarDadosEstoque, buscarRelatoriosDisponiveis } from './apiV05.js';
import { extrairDadosRelatorio } from './processingV18.js';
import { gerarTabelaDetalhada, gerarTabelaRecomendacao, preencherSelect } from './uiV08.js';

// --- ESTADO & CACHE ---
const EstadoApp = {
    cadastrosRaw: [], 
    empresaSelecionada: null,
    filialSelecionada: null,
    cacheDatas: {}, 
    cacheRelatorios: {},
    filtrosAtivos: []
};

// --- FUNÇÃO PRINCIPAL DE INICIALIZAÇÃO ---
window.iniciarAplicacao = function(textoCadastros) {
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

function renderizarDashboards(dados) {
    // Usamos sempre a tabela detalhada. 
    // Se o dado for antigo (sem valorUnitario), as colunas extras ficarão em branco.
    gerarTabelaDetalhada(
        "tabelaMaisVendidos", 
        "Produtos Mais Movimentados", 
        dados.maisVendidos
    );

    gerarTabelaDetalhada(
        "tabelaMaioresSaldos", 
        "Maiores Saldos", 
        dados.maioresSaldos
    );

    gerarTabelaRecomendacao(
        "tabelaRecomendacaoCompra", 
        dados.recomendacaoCompra
    );

    aplicarFiltrosExistentes();
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