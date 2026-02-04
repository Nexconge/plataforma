// mainV27.js
// Responsabilidade: Entry Point, Gerenciamento de Estado (Cache) e Orquestração de Fluxo.

import * as API from './apiV01.js';
import * as Processor from './processingV01.js';
import * as UI from './uiV01.js';

// --- Estado da Aplicação (Store) ---
const AppState = {
    cache: {
        contas: new Map(), // Cache de dados brutos processados por conta/ano
        estoque: new Map(),
        periodos: new Map() // Metadados de range de datas
    },
    meta: {
        projetos: new Map(),
        contas: new Map(),
        classes: new Map(),
        categorias: new Map(),
        departamentos: new Map()
    },
    user: { id: null, type: null },
    projecaoAtual: 'realizado' // 'realizado' ou 'arealizar'
};

// --- Entry Point ---
window.IniciarDoZero = async function(deptos, userId, userType, contas, classes, projetos) {
    console.log("Iniciando Aplicação...");
    
    // 1. Inicializa Metadados
    AppState.user = { id: userId, type: userType };
    
    const parse = (json) => json ? JSON.parse(json) : [];
    
    parse(classes).forEach(c => {
        AppState.meta.classes.set(c.codigo, c);
        AppState.meta.categorias.set(c.codigo, c.Categoria);
    });
    parse(projetos).forEach(p => 
        AppState.meta.projetos.set(String(p.codProj), { nome: p.nomeProj, contas: (p.contas||[]).map(String) })
    );
    parse(contas).forEach(c => 
        AppState.meta.contas.set(c.codigo, c)
    );
    parse(deptos).forEach(d => 
        AppState.meta.departamentos.set(String(d.codigo), d.descricao)
    );

    // 2. Configura UI Inicial
    UI.preencherSelectsIniciais(AppState.meta, aoAlterarFiltros);
    
    // 3. Dispara primeira carga
    aoAlterarFiltros();
};

// --- Controlador de Eventos ---

async function aoAlterarFiltros() {
    UI.alternarLoading(true);
    try {
        const filtros = UI.lerFiltrosUI();
        if (!filtros) return; // UI ainda não pronta

        // Define modo de projeção baseado em botão (lógica de UI deve gerenciar qual botão está ativo)
        // Por padrão assume o estado atual, mas idealmente viria da UI
        const projecao = AppState.projecaoAtual; 

        // 1. Verifica/Atualiza Range de Anos (Se necessário)
        // Se estivermos em "Realizado", perguntamos à API quais anos existem para as contas selecionadas
        if (projecao === 'realizado') {
            await stepVerificarPeriodosDisponiveis(filtros.contas);
        }

        // 2. Garante que temos os dados em cache
        await stepCarregarDadosFaltantes(filtros, projecao);

        // 3. Processa e Consolida (Merge)
        const dadosCompletos = Processor.mergeMatrizes(
            filtros.contas.map(id => AppState.cache.contas.get(`${id}|${projecao}`)),
            filtros,
            projecao,
            filtros.projetos.map(id => AppState.cache.estoque.get(id)).filter(Boolean),
            0 // Saldo Inicial Global (será calculado dentro do merge baseado nas contas)
        );

        // 4. Renderiza
        UI.renderizarTudo(dadosCompletos, filtros.colunas, AppState.user.type, projecao);

    } catch (erro) {
        console.error("Erro Crítico no Fluxo:", erro);
        alert("Erro ao processar dados. Verifique o console.");
    } finally {
        UI.alternarLoading(false);
    }
}

// --- Steps do Workflow ---

async function stepVerificarPeriodosDisponiveis(contasIds) {
    const contasSemInfo = contasIds.filter(id => !AppState.cache.periodos.has(id));
    
    if (contasSemInfo.length > 0) {
        const promises = contasSemInfo.map(id => API.buscarPeriodosComDados(id, 'realizado'));
        const resultados = await Promise.all(promises);
        
        resultados.forEach((res, index) => {
            const id = contasSemInfo[index];
            if (res.response) {
                // Atualiza cache de períodos para ajustar o select de anos na UI se necessário
                // (Implementação simplificada: apenas guarda, UI pode consultar depois)
                AppState.cache.periodos.set(id, res.response);
            }
        });
    }
    // Aqui poderia chamar UI.atualizarSelectAnos se o range mudou drasticamente
}

async function stepCarregarDadosFaltantes(filtros, projecao) {
    const requisicoes = [];
    const anoAtual = new Date().getFullYear();

    filtros.contas.forEach(contaId => {
        // Se for "A REALIZAR", precisamos garantir que temos o saldo acumulado deste ano
        if (projecao === 'arealizar') {
            const keyCache = `${contaId}|AREALIZAR`;
            if (!AppState.cache.contas.has(keyCache)) {
                requisicoes.push({ contaId, tipo: 'AREALIZAR', anoRef: anoAtual });
            }
        } else {
            // Lógica padrão Realizado (por ano)
            filtros.anos.forEach(ano => {
                if (!AppState.cache.contas.has(`${contaId}|${ano}`)) {
                    requisicoes.push({ contaId, tipo: 'REALIZADO', anoRef: ano });
                }
            });
        }
    });

    if (requisicoes.length === 0) return;

    // Dispara requisições
    const promises = requisicoes.map(req => {
        // Se for A Realizar, a API original pedia "AREALIZAR". 
        // Mas para calcular o saldo correto, precisamos também baixar o Realizado do Ano Atual.
        if (req.tipo === 'AREALIZAR') {
            return Promise.all([
                API.buscarTitulos({ conta: req.contaId, ano: 'AREALIZAR' }),
                API.buscarTitulos({ conta: req.contaId, ano: String(req.anoRef) }) // Baixa realizado corrente
            ]).then(([resFuturo, resAtual]) => ({
                req,
                dadosFuturo: resFuturo.response,
                dadosAtual: resAtual.response
            }));
        } else {
            return API.buscarTitulos({ conta: req.contaId, ano: req.anoRef })
                .then(res => ({ req, dadosAtual: res.response }));
        }
    });

    const resultados = await Promise.all(promises);

    resultados.forEach(({ req, dadosFuturo, dadosAtual }) => {
        const { contaId } = req;
        
        let dadosProcessados;

        if (req.tipo === 'AREALIZAR') {
            // --- Lógica Especial A REALIZAR (Restaurada) ---
            
            // 1. Processa o Realizado deste ano apenas para pegar o saldo acumulado
            // Nota: extrairDadosSimplificado agora deve filtrar pelo ano para não pegar lixo
            const inputsAtual = {
                lancamentos: Processor.extrairDadosSimplificado(Processor.parseListaApi(dadosAtual.dadosLancamentos), contaId, String(req.anoRef)),
                titulos: Processor.extrairDadosSimplificado(Processor.parseListaApi(dadosAtual.dadosRealizado), contaId, String(req.anoRef))
            };
            
            // Processa para descobrir quanto variou o caixa este ano
            const processadoAtual = Processor.processarDadosDaConta(AppState.meta, inputsAtual, contaId, 0);
            
            // Saldo Inicial do Futuro = Saldo Inicial API + Variação Realizada no Ano
            let saldoBaseFuturo = (dadosAtual.saldoInicial || 0);
            
            // Soma variações de todos os projetos do realizado
            Object.values(processadoAtual.segments).forEach(seg => {
                if(seg.realizado) saldoBaseFuturo += seg.realizado.valorTotal;
            });

            // 2. Processa o Futuro com o novo saldo inicial
            const inputsFuturo = {
                titulos: Processor.extrairDadosSimplificado(Processor.parseListaApi(dadosFuturo.dadosArealizar), contaId)
            };
            
            dadosProcessados = Processor.processarDadosDaConta(AppState.meta, inputsFuturo, contaId, saldoBaseFuturo);
            
            AppState.cache.contas.set(`${contaId}|AREALIZAR`, dadosProcessados);

        } else {
            // --- Lógica Padrão REALIZADO ---
            const inputs = {
                lancamentos: Processor.extrairDadosSimplificado(Processor.parseListaApi(dadosAtual.dadosLancamentos), contaId, String(req.anoRef)),
                titulos: Processor.extrairDadosSimplificado(Processor.parseListaApi(dadosAtual.dadosCapitalG), contaId), // CG pega tudo
                capitalDeGiro: Processor.parseListaApi(dadosAtual.dadosCapitalG).flatMap(g => Processor.extrairDadosSimplificado([g], contaId))
            };

            dadosProcessados = Processor.processarDadosDaConta(AppState.meta, inputs, contaId, dadosAtual.saldoInicial);
            AppState.cache.contas.set(`${contaId}|${req.anoRef}`, dadosProcessados);
        }
    });

    // Carregamento de Estoque (se necessário)
    const projsSemEstoque = filtros.projetos.filter(p => !AppState.cache.estoque.has(p));
    if(projsSemEstoque.length) {
        const estoques = await Promise.all(projsSemEstoque.map(p => API.buscarValoresEstoque({ periodos: filtros.colunas, projeto: [p] })));
        estoques.forEach((dados, i) => {
            // Converte array da API para objeto { '01-2024': 500 }
            const mapEstoque = { '(+) Estoque': {} };
            if(dados.response && dados.response.Saldos) {
                dados.response.Saldos.forEach(s => mapEstoque['(+) Estoque'][s.Periodo] = s.Valor);
            }
            AppState.cache.estoque.set(projsSemEstoque[i], mapEstoque);
        });
    }
}