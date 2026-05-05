import { buscarDadosEstoque, buscarRelatoriosDisponiveis } from './apiV05.js';
import { extrairDadosRelatorio } from './processingV19.js';
import { 
    preencherSelect, renderizarDashboards,  renderizarPlaceholders,  limparTabelas,  renderizarTagNoHTML, aplicarLogicaDeFiltro 
} from './uiV10.js';

const EstadoApp = {
    cadastrosRaw: [],
    empresaSelecionada: null,
    filialSelecionada: null,
    cacheDatas: {},
    cacheRelatorios: {},
    filtrosAtivos: [],
    ordenacaoSaldos: 'quantidade', 
    mesFiltroVendas: null 
};

window.alterarOrdenacaoSaldos = function(tipo) {
    EstadoApp.ordenacaoSaldos = tipo; 
    atualizarDashboards();
};

window.filtrarVendasPorMes = function(mes) {
    EstadoApp.mesFiltroVendas = mes; 
    atualizarDashboards();
};

window.iniciarAplicacao = function (textoCadastros) {
    console.log("Iniciando aplicação...");
    try {
        let jsonString = textoCadastros.trim();
        if (!jsonString.startsWith("[")) jsonString = `[${jsonString}]`;
        
        EstadoApp.cadastrosRaw = JSON.parse(jsonString);
        const listaEmpresas = EstadoApp.cadastrosRaw.map(c => ({ id: c.id, nome: c.cadastro }));

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
            const listaFiliais = empresaObj.entidades.map(ent => ({ id: ent.idEntidade, nome: ent.nome }));
            preencherSelect("filialSelect", listaFiliais, "Todas / Selecione Loja");
        }
        await carregarDatasRelatorios(idEmpresa);
    });

    elFilial.addEventListener("change", (e) => EstadoApp.filialSelecionada = e.target.value);

    elData.addEventListener("change", async (e) => {
        const dataSelecionada = e.target.value;
        if (dataSelecionada && EstadoApp.empresaSelecionada) {
            await carregarRelatorioFinal(EstadoApp.empresaSelecionada, dataSelecionada);
        }
    });

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

async function carregarDatasRelatorios(idCadastro) {
    const elData = document.getElementById("dataSelect");
    if (EstadoApp.cacheDatas[idCadastro]) {
        preencherSelect("dataSelect", EstadoApp.cacheDatas[idCadastro], "Selecione a Data");
        return;
    }

    elData.innerHTML = "<option>Carregando...</option>";
    try {
        const resultado = await buscarRelatoriosDisponiveis(idCadastro);
        const stringDatas = resultado.response.relatoriosDisponivies || "";
        const listaDatas = stringDatas.split(',').filter(d => d.trim().length > 0).map(d => ({ id: d.trim(), nome: d.trim() }));
        EstadoApp.cacheDatas[idCadastro] = listaDatas;
        preencherSelect("dataSelect", listaDatas, "Selecione a Data");
    } catch (erro) {
        elData.innerHTML = "<option>Erro ao carregar</option>";
    }
}

async function carregarRelatorioFinal(idCadastro, data) {
    const chaveCache = `${idCadastro}_${data}`;
    if (EstadoApp.cacheRelatorios[chaveCache]) {
        renderizarDashboards(EstadoApp.cacheRelatorios[chaveCache], EstadoApp);
        return;
    }

    try {
        const dadosBrutos = await buscarDadosEstoque(idCadastro, data);
        const dadosProcessados = extrairDadosRelatorio(dadosBrutos);
        EstadoApp.cacheRelatorios[chaveCache] = dadosProcessados;
        renderizarDashboards(dadosProcessados, EstadoApp);
    } catch (erro) {
        limparTabelas();
    }
}

function atualizarDashboards() {
    const dataSelecionada = document.getElementById("dataSelect").value;
    const chaveCache = `${EstadoApp.empresaSelecionada}_${dataSelecionada}`;
    if (EstadoApp.cacheRelatorios[chaveCache]) {
        renderizarDashboards(EstadoApp.cacheRelatorios[chaveCache], EstadoApp);
    }
}

function processarNovaTag(textoRaw) {
    let tipo = 'inc'; 
    let termo = textoRaw;

    if (textoRaw.startsWith('inc:')) { tipo = 'inc'; termo = textoRaw.replace('inc:', ''); } 
    else if (textoRaw.startsWith('exc:')) { tipo = 'exc'; termo = textoRaw.replace('exc:', ''); }

    if (!termo || termo.trim() === "") return;
    if (EstadoApp.filtrosAtivos.some(f => f.termo.toLowerCase() === termo.toLowerCase() && f.tipo === tipo)) return;

    EstadoApp.filtrosAtivos.push({ tipo, termo: termo.trim() });
    
    renderizarTagNoHTML(tipo, termo.trim(), (tipoRemovido, termoRemovido) => {
        EstadoApp.filtrosAtivos = EstadoApp.filtrosAtivos.filter(f => !(f.termo === termoRemovido && f.tipo === tipoRemovido));
        aplicarLogicaDeFiltro(EstadoApp.filtrosAtivos);
    });

    const tagArea = document.querySelector('.tag-area');
    setTimeout(() => tagArea.scrollLeft = tagArea.scrollWidth, 10);
    
    aplicarLogicaDeFiltro(EstadoApp.filtrosAtivos);
}