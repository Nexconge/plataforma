class MapaLotesManager {
    constructor(mapId, url) {
        this.mapId = mapId;
        this.urlAPI = url;
        this.map = null;
        
        // Armazenamento de dados
        this.allLotes = [];
        this.polygons = {}; // Mapa de _id -> Layer (Leaflet)
        this.selectedLoteId = null;

        // Estado dos Filtros
        this.filters = {
            empreendimento: "",
            quadra: "",
            status: "",
            zoneamento: "",
            zonaColorMode: false // Checkbox de zona ativa
        };

        // Binds
        this._handleFilterChange = this._handleFilterChange.bind(this);
        this._handlePolygonClick = this._handlePolygonClick.bind(this);
    }

    async init(empreendimentosJSON) {
        this._initMap();
        this._setupEventListeners();
        
        this.allLotes = await this._fetchLotesPermitidos();

        if (!this.allLotes.length) {
            console.warn("Nenhum lote encontrado.");
            return;
        }

        this._renderLotes(this.allLotes);
        this._populateAuxiliaryFilters(); // Preenche Quadra, Status e Zoneamento dinamicamente
        this._updateMapVisuals(); // Aplica filtros iniciais
        this._centralizeView();
    }

    // --- 1. Dados (Data Fetching) ---
    async _fetchLotesPermitidos() {
        const urlBase = this.urlAPI;
        let todosOsLotes = [];
        let cursor = 0;
        const limit = 100; 

        console.log("Iniciando busca dos lotes...");
        
        while (true) {
            try {
                const params = new URLSearchParams({ cursor: cursor, limit: limit.toString() });
                const response = await fetch(`${urlBase}?${params.toString()}`);

                if (!response.ok) break;

                const data = await response.json();
                const novosLotes = data.response.results || [];

                if (novosLotes.length > 0) {
                    todosOsLotes = todosOsLotes.concat(novosLotes);
                }

                if (!data.response.remaining || data.response.remaining === 0) break;
                cursor += novosLotes.length;

            } catch (error) {
                console.error("Erro ao buscar lotes:", error);
                break;
            }
        }
        return todosOsLotes;
    }

    // --- 2. Mapa Core (Leaflet Init & Helpers) ---
    _initMap() {
        this.map = L.map(this.mapId).setView([-27.093791, -52.6215887], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this.map);

        // Zoom Handler para labels das quadras
        this.map.on('zoom zoomend', () => {
            const z = this.map.getZoom();
            const scale = Math.max(0.45, z / 15);
            document.documentElement.style.setProperty('--quadra-scale', String(scale));
            
            if (z < 17) document.documentElement.classList.add('quadra-hidden');
            else document.documentElement.classList.remove('quadra-hidden');
            
            // Ajuste de fonte dinâmico
            const fontSize = 14 * (z / 15);
            document.querySelectorAll(".quadra-tooltip").forEach(el => el.style.fontSize = fontSize + "px");
        });
    }

    // --- 3. Renderização Inicial ---
    _renderLotes(lotes) {
        // Limpa camadas antigas
        Object.values(this.polygons).forEach(p => p.remove());
        this.polygons = {};

        lotes.forEach(lote => {
            if (!lote.Coordenadas) return;
            let coords;
            try { coords = JSON.parse(lote.Coordenadas); } catch { return; }
            if (!Array.isArray(coords) || coords.length === 0) return;

            // Tipo A: Label de Quadra (marcador invisível)
            if (lote.Quadra) {
                const tempPoly = L.polygon(coords);
                const marker = L.marker(tempPoly.getBounds().getCenter(), { opacity: 0, interactive: false });
                marker.bindTooltip(lote.Nome, {
                    permanent: true, direction: "bottom", className: "quadra-tooltip", offset: [-6, 1.5]
                });
                marker.addTo(this.map);
                // Não adicionamos ao this.polygons pois não é clicável/filtrável da mesma forma
            } 
            // Tipo B: Lote Real (Polígono)
            else {
                const polygon = L.polygon(coords, {
                    color: "black",
                    weight: 0.6,
                    fillOpacity: 1,
                    fillColor: "#c7c7c7" // Cor inicial temporária
                });

                polygon.bindTooltip(`${lote.Nome} - ${lote.Status || "Desconhecido"}`, { permanent: false });
                polygon.loteData = lote;
                
                polygon.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    this._handlePolygonClick(polygon);
                });

                this.polygons[lote._id] = polygon;
                // Adicionaremos ao mapa no _updateMapVisuals
            }
        });
    }

    // --- 4. Lógica de UI e Filtros ---
    _setupEventListeners() {
        const ids = ["empreendimentoSelect", "selectQuadra", "selectStatus", "selectZoneamento"];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener("change", this._handleFilterChange);
        });

        // Toggle Zona
        const zonaCheck = document.getElementById("zona");
        if (zonaCheck) zonaCheck.addEventListener('click', () => {
             // Pequeno delay para garantir que o checked atualizou
             setTimeout(() => this._handleFilterChange(), 50);
        });

        // Botão Alterar
        document.getElementById("buttonAlterar")?.addEventListener('click', () => this._atualizarPoligonoSelecionado());
        
        // Limpar seleção ao clicar no mapa vazio
        this.map.on('click', () => this._clearForm());
    }

    _populateAuxiliaryFilters() {
        // Extrai valores únicos para preencher os selects
        const quadras = new Set();
        const status = new Set();
        const zonas = new Set();

        this.allLotes.forEach(l => {
            if (l.Quadra) return; // Ignora labels de quadra
            
            // Tenta extrair número da quadra do Nome (Ex: Q10...)
            const matchQ = l.Nome && l.Nome.match(/^Q(\d+)/);
            if(matchQ) quadras.add(matchQ[1]);

            if(l.Status) status.add(l.Status);
            if(l.Zoneamento) zonas.add(l.Zoneamento);
        });

        const sortAndPopulate = (setId, values) => {
            const select = document.getElementById(setId);
            if(!select) return;
            // Preserva a primeira opção (Geralmente "Todos")
            const firstOpt = select.firstElementChild;
            select.innerHTML = ''; 
            if(firstOpt) select.appendChild(firstOpt);

            Array.from(values).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})).forEach(val => {
                const opt = document.createElement("option");
                opt.value = val;
                opt.textContent = val;
                select.appendChild(opt);
            });
        };

        sortAndPopulate("selectQuadra", quadras);
        sortAndPopulate("selectStatus", status);
        sortAndPopulate("selectZoneamento", zonas);
    }

    _handleFilterChange() {
        document.body.classList.toggle('app-loading', true);

        // 1. Atualizar Estado dos Filtros
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : "";
        };

        // Lógica específica do Bubble para Empreendimento
        const empVal = getVal("empreendimentoSelect");
        const empId = empVal.includes('__LOOKUP__') ? (empVal.split('__LOOKUP__')[1]).slice(0, -1) : empVal;

        this.filters = {
            empreendimento: empId,
            quadra: getVal("selectQuadra"),
            status: getVal("selectStatus"),
            zoneamento: getVal("selectZoneamento"),
            zonaColorMode: document.querySelector("#zona input[type='checkbox']")?.checked || false
        };

        // 2. Atualizar Visuais
        this._updateMapVisuals();

        // 3. Limpar formulário se o lote selecionado sumir ou for filtrado
        if (this.selectedLoteId && !this.map.hasLayer(this.polygons[this.selectedLoteId])) {
            this._clearForm();
        }

        document.body.classList.toggle('app-loading', false);
    }

    _updateMapVisuals() {
        Object.values(this.polygons).forEach(poly => {
            const data = poly.loteData;

            // --- Filtro 1: Visibilidade (Empreendimento) ---
            // Se tiver filtro de empreendimento e não bater, remove do mapa.
            if (this.filters.empreendimento && data.Empreendimento !== this.filters.empreendimento) {
                if (this.map.hasLayer(poly)) this.map.removeLayer(poly);
                return; // Pula o resto
            } else {
                if (!this.map.hasLayer(poly)) this.map.addLayer(poly);
            }

            // --- Filtro 2: Match dos Filtros Auxiliares (Highlight vs Dim) ---
            let isMatch = true;

            // Match Quadra
            if (this.filters.quadra) {
                const matchQ = data.Nome.match(/^Q(\d+)/);
                const numQuadra = matchQ ? matchQ[1] : null;
                if (numQuadra !== this.filters.quadra) isMatch = false;
            }
            // Match Status
            if (this.filters.status && data.Status !== this.filters.status) isMatch = false;
            // Match Zoneamento
            if (this.filters.zoneamento && data.Zoneamento !== this.filters.zoneamento) isMatch = false;

            // --- Aplicação de Estilo ---
            const baseColor = this._getLoteColor(data);
            const isSelected = this.selectedLoteId === data._id;

            if (isSelected) {
                // Estilo Selecionado (Prioridade Máxima)
                poly.setStyle({ weight: 2, color: "blue", fillColor: "blue", fillOpacity: 0.6 });
                poly.bringToFront();
            } else if (isMatch) {
                // Estilo Normal (Passou nos filtros)
                // Se houver algum filtro ativo (mas passou), damos destaque com borda azul. 
                // Se não houver filtros ativos, mantemos borda preta.
                const hasActiveFilters = this.filters.quadra || this.filters.status || this.filters.zoneamento;
                
                poly.setStyle({
                    weight: hasActiveFilters ? 2 : 0.6,
                    color: hasActiveFilters ? "#1772CB" : "black", // Borda azul se filtrado
                    fillColor: baseColor,
                    fillOpacity: 1
                });
            } else {
                // Estilo "Dimmed" (Não passou nos filtros)
                poly.setStyle({
                    weight: 0.5,
                    color: "#999",
                    fillColor: baseColor,
                    fillOpacity: 0.4 // Bem transparente
                });
            }

            // Atualiza Tooltip com base no modo de cor
            const txtStatus = this.filters.zonaColorMode ? (data.Zoneamento || "S/ Zoneamento") : (data.Status || "Desc.");
            poly.getTooltip()?.setContent(`${data.Nome} - ${txtStatus}`);
        });
    }

    _getLoteColor(lote) {
        // Se checkbox "zona" estiver ativo, cor por zoneamento. Senão, por status.
        const mode = this.filters.zonaColorMode ? lote.Zoneamento?.toLowerCase() : lote.Status?.toLowerCase();
        
        const colors = {
            // Zoneamento
            "comercial": "#9fbfdf",
            "residencial": "#dad2b4",
            "equipamento público": "#f0c9ad",
            "app": "#88c4a6",
            "área verde": "#88c4a6",
            // Status
            "disponível": "lightblue",
            "vendido": "ForestGreen",
            "reservado": "#f0c9ad",
            "indisponível": "#c7c7c7"
        };
        return colors[mode] || "#c7c7c7";
    }

    // --- 5. Interação e Formulário ---
    _handlePolygonClick(polygon) {
        // Reseta estilo do anterior
        if (this.selectedLoteId && this.polygons[this.selectedLoteId]) {
            // Apenas chamamos updateVisuals para restaurar o estado correto (match ou dim)
            // mas precisamos limpar o ID primeiro temporariamente para ele não ser re-selecionado
            const prevId = this.selectedLoteId;
            this.selectedLoteId = null; 
            // Atualiza visual daquele poligono especifico seria mais performatico, 
            // mas chamar updateMapVisuals garante consistencia com filtros
            this._updateMapVisuals(); 
        }

        this.selectedLoteId = polygon.loteData._id;
        this._updateMapVisuals(); // Aplica estilo de seleção no novo
        this._fillForm(polygon.loteData);
    }

    _fillForm(lote) {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) { el.value = val; el.dispatchEvent(new Event("change")); }
        };
        
        setVal("quadra_lote2", lote.Nome);
        setVal("area2", String(lote.Área || 0));
        setVal("status2", `"${lote.Status || "Desconhecido"}"`);
        setVal("zona2", `"${lote.Zoneamento || "Desconhecido"}"`);
        setVal("frente2", String(lote.Frente || 0));
        setVal("lateral2", String(lote.Lateral || 0));
        setVal("valor_metro2", String(lote.ValorM2 || 0));
        setVal("valor_total2", String(lote.Valor || 0));
        setVal("indice2", String(lote.IndiceConstrutivo || 0));
        setVal("empreendimento2", lote.Empreendimento);
    }

    _clearForm() {
        if (this.selectedLoteId) {
            this.selectedLoteId = null;
            this._updateMapVisuals();
        }
        
        const ids = ["zona2", "quadra_lote2", "area2", "status2", "frente2", "lateral2", "valor_metro2", "valor_total2", "indice2", "empreendimento2"];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
    }

    _centralizeView() {
        const bounds = new L.LatLngBounds();
        let count = 0;
        Object.values(this.polygons).forEach(layer => {
            if (this.map.hasLayer(layer)) {
                bounds.extend(layer.getBounds());
                count++;
            }
        });
        if (count > 0) this.map.flyToBounds(bounds, { padding: [50, 50], duration: 1 });
        else this.map.flyTo(this.map.options.center, this.map.options.zoom);
    }

    _atualizarPoligonoSelecionado() {
        if (!this.selectedLoteId || !this.polygons[this.selectedLoteId]) return;

        const poligono = this.polygons[this.selectedLoteId];
        const getVal = id => document.getElementById(id).value;
        const unmask = (val) => parseFloat(val.replace(/R\$|\s|\./g, "").replace(",", ".")) || 0;

        Object.assign(poligono.loteData, {
            Nome: getVal("quadra_lote2"),
            Área: unmask(getVal("area2")),
            Status: getVal("status2").replace(/"/g, ''),
            Zoneamento: getVal("zona2").replace(/"/g, ''),
            Frente: unmask(getVal("frente2")),
            Lateral: unmask(getVal("lateral2")),
            ValorM2: unmask(getVal("valor_metro2")),
            Valor: unmask(getVal("valor_total2"))
        });

        this._updateMapVisuals();
    }
}

export function iniciarMapa(empreendimentosJSON, urlAPI) {
    const mapaManager = new MapaLotesManager('meuMapa', urlAPI);
    mapaManager.init(empreendimentosJSON);
    return mapaManager;
}