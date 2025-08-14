// main.js - MODIFICADO

// --- Importa as funções de cada módulo especializado ---
import { filtrarContasESaldo, processarLancamentos, calcularTotaisDRE } from './processingV4.js';
import { configurarFiltros, atualizarVisualizacoes } from './ui.js';

// --- O cache em memória e as funções de serialização ---
let appCache = {
    userId: null, userType: null, lancamentos: null,
    categoriasMap: new Map(), classesMap: new Map(),
    projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
    anosDisponiveis: []
};

function replacer(key, value) {
    if (value instanceof Map) return { dataType: 'Map', value: Array.from(value.entries()) };
    return value;
}

function reviver(key, value) {
    if (typeof value === 'object' && value !== null && value.dataType === 'Map') {
        return new Map(value.value);
    }
    return value;
}

window.IniciarDoZero = async function(lancamentos, id, type, contasJson, classesJson, projetosJson) {
    
    // Recria o objeto appCache limpo
    appCache = {
        userId: null, userType: null, lancamentos: null,
        categoriasMap: new Map(), classesMap: new Map(),
        projetosMap: new Map(), contasMap: new Map(), departamentosMap: new Map(),
        anosDisponiveis: []
    };

    // 1. Recebe os lançamentos e converte o texto JSON em um objeto JavaScript
    appCache.lancamentos = JSON.parse(lancamentos);
    
    // 2. Popula os maps de categorias e departamentos a partir dos lançamentos
    appCache.lancamentos.forEach(l => {
        if (l.Departamentos && typeof l.Departamentos === 'string') {
            l.Departamentos.split(',').forEach(pair => {
                const [codigo, valor] = pair.split(':');
                const codigoNum = Number(codigo);
                const deptoDesc = codigoNum === 0 ? 'Não especificado' : valor;
                appCache.departamentosMap.set(codigoNum, deptoDesc);
            });
        }
    });

    // 3. Processa dados do Bubble (JSONs)
    const classes = JSON.parse(classesJson);
    const projetos = JSON.parse(projetosJson);
    const contas = JSON.parse(contasJson);
    
    // Além de popular o classesMap, agora também populamos o categoriasMap
    classes.forEach(c => {
        appCache.classesMap.set(c.codigo, { classe: c.Classe, categoria: c.Categoria });
        appCache.categoriasMap.set(c.codigo, c.Categoria); // <-- ADICIONADO AQUI
    });

    // --- CORREÇÃO APLICADA AQUI ---
    // Garante que p.contas seja um array antes de usar .map(), evitando erro em projetos sem contas.
    projetos.forEach(p => appCache.projetosMap.set(p.codProj, { nome: p.nomeProj, contas: (p.contas || []).map(String) }));
    
    contas.forEach(c => appCache.contasMap.set(String(c.codigo), { descricao: c.descricao, saldoIni: c.saldoIni }));
    
    // 4. Calcula dados derivados
    const anos = new Set(appCache.lancamentos.map(l => l.DataLancamento.split('/')[2]));
    appCache.anosDisponiveis = Array.from(anos).sort();

    // 5. Prepara e salva o cache PARCIAL
    appCache.userId = id;
    appCache.userType = type;
    
    const cacheParaSalvar = { ...appCache };
    delete cacheParaSalvar.lancamentos;
    delete cacheParaSalvar.anosDisponiveis;
    
    localStorage.setItem(`appCache_${id}`, JSON.stringify(cacheParaSalvar, replacer));
    console.log("Cache parcial (sem lançamentos e dados derivados) salvo com sucesso.");

    // 6. Configura a UI
    configurarFiltros(appCache, () => atualizarVisualizacoes(appCache, filtrarContasESaldo, processarLancamentos, calcularTotaisDRE));
};