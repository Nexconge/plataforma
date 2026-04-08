import { iniciarMapa } from './ScriptLotesV13.js';
import { abrirEPreencherModalProposta } from './ScriptPropostaV01.js';

function inicializarApp(empreendimentosJSON, projectsUrl, username) {
    const mapaManager = iniciarMapa(empreendimentosJSON, projectsUrl);

    // 1. Configura botão da proposta
    const btnProposta = document.getElementById('btnAbrirProposta');
    if (btnProposta) {
        btnProposta.addEventListener('click', () => {
            abrirEPreencherModalProposta(mapaManager, username);
        });
    }

    // 2. Configura botões de alteração em massa
    const btnAbrirPopupAlt = document.getElementById("btnFormAltMassa");
    if (btnAbrirPopupAlt) {
        btnAbrirPopupAlt.addEventListener("click", () => {
            setTimeout(() => {
                const btnEnviarAlt = document.getElementById("btnAltMassa");
                if (btnEnviarAlt && !btnEnviarAlt.hasAttribute('data-map-listener')) {
                    btnEnviarAlt.setAttribute('data-map-listener', 'true');
                    btnEnviarAlt.addEventListener("click", () => {
                        setTimeout(() => mapaManager.aplicarAlteracaoEmMassa(), 200);
                    });
                }
            }, 500);
        });
    }
}

window.inicializarApp = inicializarApp;