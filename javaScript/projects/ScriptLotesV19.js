class MapaLotesManager {
    // --- Propriedades da Classe ---
    constructor(mapId, url) {
        this.mapId = mapId;
        this.map = null;
        this.polygons = {};
        this.allLotes = [];
        this.urlAPI = url;
        // MUDANÇA: Agora armazena objetos {id: "...", nome: "..."}
        this.allowedEmpreendimentos = [];
        this.selectedLoteId = null;

        this._handlePolygonClick = this._handlePolygonClick.bind(this);
        this._handleFilterChange = this._handleFilterChange.bind(this);
        this._handleZoneToggle = this._handleZoneToggle.bind(this);
    }

    // --- Inicialização ---
    // MUDANÇA: A função agora espera um JSON com a lista de empreendimentos (id e nome)
    async init(empreendimentosJSON) {
        if (!document.getElementById(this.mapId) || !empreendimentosJSON) {
            console.error("Div do mapa ou JSON de empreendimentos não encontrados.");
            return;
        }

        try {
            // Tenta parsear o JSON recebido do Bubble
            this.allowedEmpreendimentos = JSON.parse(empreendimentosJSON);
        } catch (e) {
            console.error("Erro ao parsear JSON de empreendimentos:", e);
            return;
        }

        this._initMap();
        this._setupEventListeners();

        this.allLotes = await this._fetchLotesPermitidos();

        if (!this.allLotes.length) {
            console.warn("Nenhum lote encontrado para os empreendimentos permitidos.");
            this._centralizeView();
            return;
        }

        this._renderLotes(this.allLotes);
        this._populateEmpreendimentoFilter();
        this._centralizeView();
    }

    //VERSAO BUBBLE
    async _fetchLotesPermitidos() {
        const urlBase = this.urlAPI;
        let todosOsLotes = [];
        let cursor = 0;
        const limit = 100; // O Bubble permite até 100 por página

        console.log("Iniciando busca paginada de lotes...");

        while (true) {
            // Monta a URL com os parâmetros de paginação
            const params = new URLSearchParams({
                cursor: cursor,
                limit: limit.toString()
            });
            const urlComParams = `${urlBase}?${params.toString()}`;

            try {
                // ATENÇÃO: A API de Dados usa GET, não POST.
                // O Bubble aplicará as Regras de Privacidade automaticamente no servidor.
                const response = await fetch(urlComParams);

                if (!response.ok) {
                    console.error(`Erro na API do Bubble: ${response.status}`);
                    break; // Sai do loop em caso de erro
                }

                const data = await response.json();
                const novosLotes = data.response.results || [];

                if (novosLotes.length > 0) {
                    todosOsLotes = todosOsLotes.concat(novosLotes);
                }

                // O Bubble nos informa quantos registros ainda faltam
                const remaining = data.response.remaining;
                console.log(`Recebidos ${novosLotes.length} lotes. Faltam: ${remaining}`);

                if (remaining === 0) {
                    break; // Sai do loop se não houver mais lotes
                }

                // Prepara o cursor para a próxima página
                cursor += novosLotes.length;

            } catch (error) {
                console.error("Falha ao buscar página de lotes:", error);
                break; // Sai do loop em caso de erro de rede
            }
        }

        console.log(`Busca finalizada. Total de lotes carregados: ${todosOsLotes.length}`);
        return todosOsLotes;
    }

    // --- Métodos de Renderização e Mapa ---
    _initMap() {
        this.map = L.map(this.mapId).setView([-27.093791, -52.6215887], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this.map);
    }

    _renderLotes(lotes) {
        // Limpa polígonos antigos caso a função seja chamada novamente
        Object.values(this.polygons).forEach(p => p.remove());
        this.polygons = {};

        lotes.forEach(lote => {
            if (!lote.Coordenadas) return;

            let coordenadas;
            try {
                coordenadas = JSON.parse(lote.Coordenadas);
                if (!Array.isArray(coordenadas) || coordenadas.length === 0) return;
            } catch { return; }

            const cor = this._getLoteColor(lote);

            console.log(lote.Quadra);
            // Se o campo 'Quadra' for verdadeiro, cria um círculo no centro
            if (lote.Quadra) {
                // Cria polígono temporário só para calcular centro
                const tempPolygon = L.polygon(coordenadas);
                const centro = tempPolygon.getBounds().getCenter();

                // Círculo de contorno
                const circle = L.circle(centro, {
                    radius: 20,
                    color: "invisible",
                    fillOpacity: 0,
                    weight: 1
                }).addTo(this.map);
                // Tooltip que escala junto com o mapa
                circle.setText(lote.Nome, {
                    center: true,
                    attributes: { 
                        "font-size": "14", 
                        "font-weight": "bold", 
                        "fill": "black", 
                        "stroke": "white", 
                        "stroke-width": "2" 
                    }
                });
                // Clique no círculo chama o mesmo handler
                circle.on("click", (e) => {
                    L.DomEvent.stopPropagation(e);
                });

            } else {
                // Caso normal: desenha o polígono
                const polygon = L.polygon(coordenadas, {
                    color: "black",
                    fillColor: cor,
                    weight: 0.6,
                    fillOpacity: 1
                });

                polygon.loteData = lote;
                polygon.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    this._handlePolygonClick(polygon);
                });

                this.polygons[lote._id] = polygon;
                polygon.addTo(this.map);
            }
        });
        // Dispara o filtro para exibir os lotes corretos inicialmente
        this._handleFilterChange();
    }


    _getLoteColor(lote) {
        const isZonaAtiva = document.querySelector("#zona input[type='checkbox']")?.checked;
        let status = "";

        if (isZonaAtiva) {
            status = lote.Zoneamento?.toLowerCase();
        } else {
            status = lote.Status?.toLowerCase();
        }

        switch (status) {
            //Cases para zoneamento
            case "comercial":
                return "#9fbfdf";
            case "residencial":
                return "#dad2b4";
            case "equipamento público":
                return "#f0c9ad";
            case "app":
                return "#88c4a6";
            case "área verde":
                return "#88c4a6";
            //Cases para status
            case "disponível":
                return "lightblue"; // azul claro
            case "vendido":
                return "ForestGreen"; // verde escuro
            case "reservado":
                return "#f0c9ad"; // laranja claro
            case "indisponível":
                return "#c7c7c7"; // cinza claro
            default:
                return "#c7c7c7"; // fallback
        }
    }

    _populateEmpreendimentoFilter() {
        const select = document.getElementById("empreendimentoSelect");
        select.innerHTML = `<option value="">Todos</option>`;

        // MUDANÇA: Usa o objeto com id e nome para criar as opções
        this.allowedEmpreendimentos.forEach(empreendimento => {
            const opt = document.createElement("option");
            opt.value = empreendimento.id; // O valor é o ID
            opt.textContent = empreendimento.nome; // O texto visível é o Nome
            select.appendChild(opt);
        });
    }

    // --- Handlers de Eventos ---
    _setupEventListeners() {
        document.getElementById("empreendimentoSelect").addEventListener("change", this._handleFilterChange);
        document.getElementById("zona").addEventListener('click', this._handleZoneToggle);
        document.getElementById("buttonAlterar").addEventListener('click', () => this._atualizarPoligonoSelecionado());
        this.map.on('click', () => this._clearForm());
    }

    _handlePolygonClick(polygon) {
        if (this.selectedLoteId && this.polygons[this.selectedLoteId]) {
            const oldPolygon = this.polygons[this.selectedLoteId];
            const cor = this._getLoteColor(oldPolygon.loteData)
            oldPolygon.setStyle({ weight: 0.6, color: "black", fillColor: cor });
        }

        this.selectedLoteId = polygon.loteData._id;
        polygon.setStyle({ weight: 2, color: "blue", fillColor: "blue" });
        this._fillForm(polygon.loteData);
    }

    _handleFilterChange() {
        //Versão Bubble
        const selectedEmpreendimentoId = document.getElementById("empreendimentoSelect").value;
        Object.values(this.polygons).forEach(p => {
            // A lógica de filtro agora compara o ID do empreendimento do lote com o ID selecionado
            //Versao Bubble
            const shouldBeVisible = !selectedEmpreendimentoId || p.loteData.Empreendimento === selectedEmpreendimentoId;

            if (shouldBeVisible && !this.map.hasLayer(p)) {
                this.map.addLayer(p);
                p.bindTooltip(`${p.loteData.Nome} - ${p.loteData.Status || "Desconhecido"}`, { permanent: false });
            } else if (!shouldBeVisible && this.map.hasLayer(p)) {
                this.map.removeLayer(p);
            }
        });

        this._clearForm();
        this._centralizeView();
    }

    _handleZoneToggle() {
        const isZonaAtiva = document.querySelector("#zona input[type='checkbox']")?.checked;

        Object.values(this.polygons).forEach(p => {
            const newColor = this._getLoteColor(p.loteData);
            p.setStyle({
                fillColor: newColor
            });

            const textoTooltip = `${p.loteData.Nome} - ${isZonaAtiva ? p.loteData.Zoneamento || "Sem zoneamento" : p.loteData.Status || "Desconhecido"}`;
            p.getTooltip()?.setContent(textoTooltip);
        });

        if (this.selectedLoteId && this.polygons[this.selectedLoteId]) {
            this.polygons[this.selectedLoteId].setStyle({ fillColor: "blue", color: "blue", weight: 2 });
        }
    }

    // --- Métodos de UI (Formulário, Centralização) ---
    _fillForm(lote) {
        const campos = {
            "quadra_lote2": lote.Nome,
            "area2": String(lote.Área), // Use "Área" com acento. O "" é um problema do seu terminal
            "status2": `"${lote.Status || "Desconhecido"}"`,
            "zona2": `"${lote.Zoneamento || "Desconhecido"}"`,
            "frente2": String(lote.Frente),
            "lateral2": String(lote.Lateral),
            "valor_metro2": String(lote.ValorM2),
            "valor_total2": String(lote.Valor),
            "indice2": String(lote.IndiceConstrutivo)
        };

        for (const id in campos) {
            const el = document.getElementById(id);
            if (el) {
                el.value = campos[id] ?? "";
                el.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }
    }

    _clearForm() {
        if (this.selectedLoteId && this.polygons[this.selectedLoteId]) {
            const polygon = this.polygons[this.selectedLoteId];
            const cor = this._getLoteColor(polygon.loteData);
            polygon.setStyle({ weight: 0.6, fillColor: cor, color: "black" });
        }
        const formIds = ["zona2", "quadra_lote2", "area2", "status2", "frente2", "lateral2", "valor_metro2", "valor_total2", "indice2"];
        formIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });

        this.selectedLoteId = null;
    }

    _centralizeView() {
        const bounds = new L.LatLngBounds();
        let visibleLayersCount = 0;

        Object.values(this.polygons).forEach(layer => {
            if (!this.map.hasLayer(layer)) return;

            // Polígonos e retângulos têm getBounds()
            if (layer.getBounds) {
                bounds.extend(layer.getBounds());
            } 
            // Círculos e marcadores têm getLatLng()
            else if (layer.getLatLng) {
                bounds.extend(layer.getLatLng());
            }

            visibleLayersCount++;
        });

        if (visibleLayersCount > 0) {
            // Centraliza o mapa nos bounds calculados
            this.map.flyToBounds(bounds, { padding: [50, 50], duration: 1 });
        } else {
            // Nenhum layer visível, retorna ao centro padrão
            this.map.flyTo(this.map.options.center, this.map.options.zoom, { duration: 1 });
        }
    }


    _atualizarPoligonoSelecionado() {
        if (!this.selectedLoteId || !this.polygons[this.selectedLoteId]) {
            return; // Não faz nada se nenhum lote estiver selecionado
        }

        const poligono = this.polygons[this.selectedLoteId];
        const getVal = id => document.getElementById(id).value;

        // 1. Atualiza os dados internos do objeto
        Object.assign(poligono.loteData, {
            Nome: getVal("quadra_lote2"),
            Área: unmaskNumber(getVal("area2")),
            Status: getVal("status2").replace(/"/g, ''),
            Zoneamento: getVal("zona2").replace(/"/g, ''),
            Frente: unmaskNumber(getVal("frente2")),
            Lateral: unmaskNumber(getVal("lateral2")),
            ValorM2: unmaskNumber(getVal("valor_metro2")),
            Valor: unmaskNumber(getVal("valor_total2")),
            //IndiceConstrutivo: Number(getTxt("indice2"))
        });

        // 2. Aplica o "update" visual no mapa
        const novaCorBase = this._getLoteColor(poligono.loteData);
        poligono.setStyle({ color: novaCorBase });

        // Força a manutenção do destaque azul para o lote que está sendo editado
        if (this.selectedLoteId === poligono.loteData._id) {
            poligono.setStyle({ color: "blue", fillColor: "blue", weight: 2 });
        }

        // Atualiza o texto do tooltip
        const zonaAtiva = document.querySelector("#zona input[type='checkbox']")?.checked;
        const textoTooltip = `${poligono.loteData.Nome} - ${zonaAtiva ? poligono.loteData.Zoneamento || "Sem zoneamento" : poligono.loteData.Status || "Desconhecido"}`;

        poligono.getTooltip()?.setContent(textoTooltip);
    }
}
const unmaskNumber = (val) => {
    if (!val) return 0;
    // Remove R$ e espaços
    val = val.replace(/R\$|\s/g, "");
    // Remove vírgulas de milhar
    val = val.replace(/,/g, "");
    // Converte para float
    return parseFloat(val) || 0;
};
export function iniciarMapa(empreendimentosJSON, urlAPI) {
    const mapaManager = new MapaLotesManager('meuMapa', urlAPI);
    mapaManager.init(empreendimentosJSON);
    return mapaManager;
}