import { iniciarMapa } from './ScriptLotesV15.js';
import { abrirEPreencherModalProposta } from './ScriptPropostaV09.js';

function inicializarApp(empreendimentosJSON, projectsUrl, username) {
    // 1. Inicia o mapa
    const mapaManager = iniciarMapa(empreendimentosJSON, projectsUrl);

    // 2. Configura botão da proposta
    const btn = document.getElementById('btnAbrirProposta');
    if (btn) {
        btn.addEventListener('click', () => {
            abrirEPreencherModalProposta(mapaManager, username);
        });
    } else {
        console.error("Botão 'btnAbrirProposta' não encontrado.");
    }
}

window.inicializarApp = inicializarApp;