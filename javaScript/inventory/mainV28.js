// mainV13.js
import { buscarDadosEstoque, buscarRelatoriosDisponiveis } from './apiV04.js';
import { extrairDadosRelatorio } from './processingV15.js';
import { gerarTabelaPadrao, gerarTabelaRecomendacao, preencherSelect } from './uiV05.js';

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
        // Adiciona colchetes se vier como objetos soltos separados por vírgula
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
        
        // Limpa dependentes
        elFilial.innerHTML = "";
        elData.innerHTML = "";
        limparTabelas();

        if (!idEmpresa) return;

        // A. Preencher Filiais (baseado no JSON local)
        const empresaObj = EstadoApp.cadastrosRaw.find(c => c.id === idEmpresa);
        if (empresaObj && empresaObj.entidades) {
            const listaFiliais = empresaObj.entidades.map(ent => ({
                id: ent.idEntidade,
                nome: ent.nome
            }));
            preencherSelect("filialSelect", listaFiliais, "Todas / Selecione Loja");
        }

        // B. Buscar Datas (API ou Cache)
        await carregarDatasRelatorios(idEmpresa);
    });

    // Evento: Seleção de Filial (Apenas visual por enquanto, pois API pede apenas IDCadastro)
    elFilial.addEventListener("change", (e) => {
        EstadoApp.filialSelecionada = e.target.value;
        // Opcional: Se a API suportar filtro por filial no futuro, limparíamos o cache aqui.
    });

    // Evento: Seleção de Data (Dispara o Relatório Final)
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
    
    // 1. Checar Cache
    if (EstadoApp.cacheDatas[idCadastro]) {
        console.log("Usando datas em cache para:", idCadastro);
        popularSelectDatas(EstadoApp.cacheDatas[idCadastro]);
        return;
    }

    // 2. Chamada API
    elData.innerHTML = "<option>Carregando...</option>";
    try {
        const resultado = await buscarRelatoriosDisponiveis(idCadastro);
        const stringDatas = resultado.response.relatoriosDisponivies || "";
        
        // Converte string "dd/mm/yyyy,dd/mm/yyyy" em array de objetos
        const listaDatas = stringDatas.split(',')
            .filter(d => d.trim().length > 0)
            .map(d => ({ id: d.trim(), nome: d.trim() })); // ID e Nome iguais

        // Salva Cache
        EstadoApp.cacheDatas[idCadastro] = listaDatas;
        
        // Renderiza
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
    
    // 1. Checar Cache
    if (EstadoApp.cacheRelatorios[chaveCache]) {
        console.log("Relatório em cache recuperado.");
        renderizarDashboards(EstadoApp.cacheRelatorios[chaveCache]);
        return;
    }

    // 2. Chamada API
    console.log(`Buscando relatório para ${idCadastro} na data ${data}...`);
    try {
        const dadosBrutos = await buscarDadosEstoque(idCadastro, data);
        console.log("Dados brutos recebidos:", dadosBrutos);
        // 3. Processamento
        const dadosProcessados = extrairDadosRelatorio(dadosBrutos);
        console.log("Dados extraidos:", dadosProcessados);
        // Salva Cache
        EstadoApp.cacheRelatorios[chaveCache] = dadosProcessados;

        // 4. Renderização
        renderizarDashboards(dadosProcessados);

    } catch (erro) {
        console.error("Erro fatal ao gerar relatório:", erro);
        limparTabelas();
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

function limparTabelas() {
    document.getElementById("tabelaMaisVendidos").innerHTML = "";
    document.getElementById("tabelaMaioresSaldos").innerHTML = "";
    document.getElementById("tabelaRecomendacaoCompra").innerHTML = "";
}