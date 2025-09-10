// Importa as funções públicas dos outros módulos
import { iniciarMapa } from './ScriptLotesV03.js';
import { abrirEPreencherModalProposta } from './ScriptPropostaV05.js';

// Função principal de inicialização do aplicativo
function inicializarApp(empreendimentosJSON, projectsUrl, username) {

    // 1. Inicializa o mapa e guarda a instância dele
    const mapaManager = iniciarMapa(empreendimentosJSON, projectsUrl);

    // 2. Encontra o botão da proposta
    const btnAbrirProposta = document.getElementById('btnAbrirProposta');

    if (btnAbrirProposta) {
        // 3. Conecta o botão à função da proposta
        btnAbrirProposta.addEventListener('click', () => {
            // Ao clicar, chama a função importada, passando a instância do mapa para ela
            abrirEPreencherModalProposta(mapaManager, username);
        });
        console.log("Botão da proposta conectado com sucesso.");
    } else {
        console.error("Botão 'btnAbrirProposta' não foi encontrado pelo main.js");
    }
}

window.inicializarApp = inicializarApp;