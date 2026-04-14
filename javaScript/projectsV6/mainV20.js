import { iniciarMapa } from './ScriptLotesV18.js';
import { abrirEPreencherModalProposta } from './ScriptPropostaV03.js';

function inicializarApp(empreendimentosJSON, projectsUrl, username) {
    const mapaManager = iniciarMapa(empreendimentosJSON, projectsUrl);

    const btnProposta = document.getElementById('btnAbrirProposta');
    if (btnProposta) {
        btnProposta.addEventListener('click', () => {
            abrirEPreencherModalProposta(mapaManager, username);
        });
    }

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

    const btnAbrirPopupExcluir = document.getElementById("btnFormExcluirLotes");
    if (btnAbrirPopupExcluir) {
        btnAbrirPopupExcluir.addEventListener("click", () => {
            setTimeout(() => {
                const btnExcluir = document.getElementById("btnExcluirLotes");
                if (btnExcluir && !btnExcluir.hasAttribute('data-map-listener')) {
                    btnExcluir.setAttribute('data-map-listener', 'true');
                    btnExcluir.addEventListener("click", () => {
                        setTimeout(() => mapaManager.excluirLotesSelecionados(), 200);
                    });
                }
            }, 500);
        });
    }
}
window.inicializarApp = inicializarApp;