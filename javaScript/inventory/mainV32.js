// mainV31.js
import { buscarDadosEstoque, buscarRelatoriosDisponiveis } from './apiV05.js';
import { extrairDadosRelatorio } from './processingV16.js';
import { gerarTabelaPadrao, gerarTabelaRecomendacao, preencherSelect } from './uiV07.js';

// --- ESTADO & CACHE ---
const EstadoApp = {
    cadastrosRaw: [], // Dados brutos recebidos
    empresaSelecionada: null,
    filialSelecionada: null,
    cacheDatas: {}, // Key: IDCadastro -> Value: Array de datas
    cacheRelatorios: {} // Key: IDCadastro_Data -> Value: Dados Processados
};

// --- FUNÇÃO PRINCIPAL DE INICIALIZAÇÃO ---
window.iniciarAplicacao = function(textoCadastros) {
    console.log("Iniciando aplicação...");
    
    try {
        // 1. Parse do Input (Trata o formato JSON colado)
        let jsonString = textoCadastros.trim();
        if (!jsonString.startsWith("[")) {
            jsonString = `[${jsonString}]`;
        }
        
        EstadoApp.cadastrosRaw = JSON.parse(jsonString);
        
        // 2. Preencher Dropdown de Empresas
        const listaEmpresas = EstadoApp.cadastrosRaw.map(c => ({
            id: c.id,
            nome: c.cadastro
        }));
        
        preencherSelect("empresaSelect", listaEmpresas, "Selecione a Empresa");

        // 3. Renderizar Tabelas Vazias (Placeholders)
        renderizarPlaceholders();
        
        // Configurar Listeners
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

    // Evento: Seleção de Empresa
    elEmpresa.addEventListener("change", async (e) => {
        const idEmpresa = e.target.value;
        EstadoApp.empresaSelecionada = idEmpresa;
        
        // Limpa dependentes e restaura placeholders
        elFilial.innerHTML = "";
        elData.innerHTML = "";
        limparTabelas(); 

        if (!idEmpresa) return;

        // A. Preencher Filiais
        const empresaObj = EstadoApp.cadastrosRaw.find(c => c.id === idEmpresa);
        if (empresaObj && empresaObj.entidades) {
            const listaFiliais = empresaObj.entidades.map(ent => ({
                id: ent.idEntidade,
                nome: ent.nome
            }));
            preencherSelect("filialSelect", listaFiliais, "Todas / Selecione Loja");
        }

        // B. Buscar Datas
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
        console.log("Dados brutos recebidos:", dadosBrutos);
        
        const dadosProcessados = extrairDadosRelatorio(dadosBrutos);
        console.log("Dados extraidos:", dadosProcessados);
        
        EstadoApp.cacheRelatorios[chaveCache] = dadosProcessados;

        renderizarDashboards(dadosProcessados);

    } catch (erro) {
        console.error("Erro fatal ao gerar relatório:", erro);
        limparTabelas(); // Volta para o estado de placeholder
    }
}

function renderizarDashboards(dados) {
    gerarTabelaPadrao(
        "tabelaMaisVendidos", 
        "Produtos Mais Movimentados", 
        ["Produto", "Total Saída"], 
        dados.maisVendidos
    );

    gerarTabelaPadrao(
        "tabelaMaioresSaldos", 
        "Maiores Saldos", 
        ["Produto", "Saldo Total"], 
        dados.maioresSaldos
    );

    gerarTabelaRecomendacao(
        "tabelaRecomendacaoCompra", 
        dados.recomendacaoCompra
    );
}

// --- FUNÇÕES VISUAIS ---

function renderizarPlaceholders() {
    // Renderiza as tabelas com arrays vazios e mensagem de espera
    gerarTabelaPadrao(
        "tabelaMaisVendidos", 
        "Produtos Mais Movimentados", 
        ["Produto", "Total Saída"], 
        [], 
        "Aguardando seleção..."
    );

    gerarTabelaPadrao(
        "tabelaMaioresSaldos", 
        "Maiores Saldos", 
        ["Produto", "Saldo Total"], 
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
    // Ao invés de apagar o HTML, restauramos os placeholders
    renderizarPlaceholders();
}