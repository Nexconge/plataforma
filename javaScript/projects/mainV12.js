import { iniciarMapa } from './ScriptLotesV12.js';
import { abrirEPreencherModalProposta } from './ScriptPropostaV03.js';

function inicializarApp(empreendimentosJSON, projectsUrl, username, userModifyers) {
    const mapaManager = iniciarMapa(empreendimentosJSON, projectsUrl, userModifyers);

    //Funcao exposta para ser chamada pelo workflow do Bubble
    window.mapaExcluirLotes = () => {
        mapaManager.excluirLotesSelecionados();
    };

    // 1. Configura botão da proposta
    const btnProposta = document.getElementById('btnAbrirProposta');
    if (btnProposta) {
        btnProposta.addEventListener('click', () => {
            abrirEPreencherModalProposta(mapaManager, username);
        });
    }
    document.body.addEventListener('input', (e) => {
        if (e.target && e.target.id === "inputAltMassaValM2") {
            let el = e.target;
            let digits = el.value.replace(/\D/g, '');
            if (!digits) { 
                el.value = ''; 
                return; 
            }
            let num = (parseInt(digits, 10) / 100);
            el.value = "R$ " + num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
    });

    // Quando o usuário clica fora do input, avisa o Bubble para salvar o dado
    document.body.addEventListener('focusout', (e) => {
        if (e.target && e.target.id === "inputAltMassaValM2") {
            let el = e.target;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            if (window.jQuery) window.jQuery(el).trigger('change');
        }
    });

    // 2. Configura botões de alteração em massa (Apenas o botão de envio)
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
            }, 500); // Aguarda o popup abrir para injetar a ação no botão de salvar
        });
    }
}

window.inicializarApp = inicializarApp;