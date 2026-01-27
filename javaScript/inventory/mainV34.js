// mainV32.js
import { buscarDadosEstoque, buscarRelatoriosDisponiveis } from './apiV05.js';
import { extrairDadosRelatorio } from './processingV17.js';
import { gerarTabelaDetalhada, gerarTabelaRecomendacao, preencherSelect } from './uiV08.js';

// --- ESTADO & CACHE ---
const EstadoApp = {
    cadastrosRaw: [], 
    empresaSelecionada: null,
    filialSelecionada: null,
    cacheDatas: {}, 
    cacheRelatorios: {} 
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