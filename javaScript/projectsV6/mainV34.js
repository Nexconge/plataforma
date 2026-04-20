import { iniciarMapa } from './ScriptLotesV29.js';
import { abrirEPreencherModalProposta } from './ScriptPropostaV03.js';

function inicializarApp(empreendimentosJSON, projectsUrl, username) {
    const mapaManager = iniciarMapa(empreendimentosJSON, projectsUrl);

    //Funcao exposta para ser chamada pelo workflow do Bubble quando o usuário clicar em "Excluir Lotes" no popup.
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

    // 2. Configura botões de alteração em massa
    const btnAbrirPopupAlt = document.getElementById("btnFormAltMassa");
    if (btnAbrirPopupAlt) {
        btnAbrirPopupAlt.addEventListener("click", () => {
            setTimeout(() => {
                // Configura botão de envio
                const btnEnviarAlt = document.getElementById("btnAltMassa");
                if (btnEnviarAlt && !btnEnviarAlt.hasAttribute('data-map-listener')) {
                    btnEnviarAlt.setAttribute('data-map-listener', 'true');
                    btnEnviarAlt.addEventListener("click", () => {
                        setTimeout(() => mapaManager.aplicarAlteracaoEmMassa(), 200);
                    });
                }

                // Configura a máscara do Input de Valor M2 (que acabou de ser renderizado no popup)
                const inputAltMassaValM2 = document.getElementById("inputAltMassaValM2");
                if (inputAltMassaValM2 && !inputAltMassaValM2.hasAttribute('data-mask-listener')) {
                    inputAltMassaValM2.setAttribute('data-mask-listener', 'true');
                    
                    inputAltMassaValM2.addEventListener('input', () => {
                        let digits = inputAltMassaValM2.value.replace(/\D/g, '');
                        if (!digits) { 
                            inputAltMassaValM2.value = ''; 
                            return; 
                        }
                        let num = (parseInt(digits, 10) / 100);
                        inputAltMassaValM2.value = "R$ " + num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    });

                    inputAltMassaValM2.addEventListener('blur', () => {
                        inputAltMassaValM2.dispatchEvent(new Event("change", { bubbles: true }));
                        if (window.jQuery) window.jQuery(inputAltMassaValM2).trigger('change');
                    });
                }
            }, 500); // Tempo para o popup renderizar
        });
    }
}

window.inicializarApp = inicializarApp;