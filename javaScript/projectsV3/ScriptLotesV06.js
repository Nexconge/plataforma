class MapaLotesManager {
    constructor(mapId, url) {
        this.mapId = mapId;
        this.urlAPI = url;
        this.map = null;
        
        // Armazenamento de dados
        this.allLotes = [];
        this.polygons = {}; 
        this.selectedLoteId = null;

        // Estado dos Filtros
        this.filters = {
            empreendimento: "",
            quadra: "",
            status: "",
            zoneamento: "",
            zonaColorMode: false
        };

        this._handleFilterChange = this._handleFilterChange.bind(this);
        this._handlePolygonClick = this._handlePolygonClick.bind(this);
    }

    async init(empreendimentosJSON) {
        this._initMap();
        this._setupEventListeners();
        
        this.allLotes = await this._fetchLotesPermitidos();

        if (!this.allLotes.length) {
            console.warn("Nenhum lote encontrado.");
            document.body.classList.remove('app-loading'); // Garante que o loading sai
            return;
        }

        this._renderLotes(this.allLotes);
        this._populateAuxiliaryFilters(); 
        
        // Aplica estado inicial e remove loading
        this._updateMapVisuals(); 
        this._centralizeView();
        document.body.classList.remove('app-loading');
    }

    // --- 1. Dados ---
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

    // --- 2. Mapa ---
    _initMap() {
        this.map = L.map(this.mapId).setView([-27.093791, -52.6215887], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this.map);

        this.map.on('zoom zoomend', () => {
            const z = this.map.getZoom();
            const scale = Math.max(0.45, z / 15);
            document.documentElement.style.setProperty('--quadra-scale', String(scale));
            
            if (z < 17) document.documentElement.classList.add('quadra-hidden');
            else document.documentElement.classList.remove('quadra-hidden');
            
            const fontSize = 14 * (z / 15);
            document.querySelectorAll(".quadra-tooltip").forEach(el => el.style.fontSize = fontSize + "px");
        });
    }

    // --- 3. Renderização ---
    _renderLotes(lotes) {
        Object.values(this.polygons).forEach(p => p.remove());
        this.polygons = {};

        lotes.forEach(lote => {
            if (!lote.Coordenadas) return;
            let coords;
            try { coords = JSON.parse(lote.Coordenadas); } catch { return; }
            if (!Array.isArray(coords) || coords.length === 0) return;

            if (lote.Quadra) {
                const tempPoly = L.polygon(coords);
                const marker = L.marker(tempPoly.getBounds().getCenter(), { opacity: 0, interactive: false });
                marker.bindTooltip(lote.Nome, {
                    permanent: true, direction: "bottom", className: "quadra-tooltip", offset: [-6, 1.5]
                });
                marker.addTo(this.map);
            } else {
                const polygon = L.polygon(coords, {
                    color: "black",
                    weight: 0.6,
                    fillOpacity: 1,
                    fillColor: "#c7c7c7"
                });

                polygon.bindTooltip(`${lote.Nome} - ${lote.Status || "Desconhecido"}`, { permanent: false });
                polygon.loteData = lote;
                
                polygon.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    this._handlePolygonClick(polygon);
                });

                this.polygons[lote._id] = polygon;
            }
        });
    }

    // --- 4. Filtros ---
    _setupEventListeners() {
        const ids = ["empreendimentoSelect", "selectQuadra", "selectStatus", "selectZoneamento"];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener("change", this._handleFilterChange);
        });

        const zonaCheck = document.getElementById("zona");
        if (zonaCheck) zonaCheck.addEventListener('click', () => {
             setTimeout(() => this._handleFilterChange(), 50);
        });

        document.getElementById("buttonAlterar")?.addEventListener('click', () => this._atualizarPoligonoSelecionado());
        this.map.on('click', () => this._clearForm());
    }

    _populateAuxiliaryFilters() {
        // Evita repopular se já tiver opções (previne o bug de limpar seleção)
        if (document.getElementById("selectQuadra")?.options.length > 1) return;

        const quadras = new Set();
        const status = new Set();
        const zonas = new Set();

        this.allLotes.forEach(l => {
            if (l.Quadra) return; 
            
            const matchQ = l.Nome && l.Nome.match(/^Q(\d+)/);
            if(matchQ) quadras.add(matchQ[1]);

            if(l.Status) status.add(l.Status);
            if(l.Zoneamento) zonas.add(l.Zoneamento);
        });

        const sortAndPopulate = (setId, values) => {
            const select = document.getElementById(setId);
            if(!select) return;
            
            const firstOpt = select.firstElementChild; // Guarda o "Todos"
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
        // Oculta loading apenas após processar
        document.body.classList.add('app-loading');

        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : "";
        };

        const empVal = getVal("empreendimentoSelect");
        const empId = empVal.includes('__LOOKUP__') ? (empVal.split('__LOOKUP__')[1]).slice(0, -1) : empVal;

        this.filters = {
            empreendimento: empId,
            quadra: getVal("selectQuadra"),
            status: getVal("selectStatus"),
            zoneamento: getVal("selectZoneamento"),
            zonaColorMode: document.querySelector("#zona input[type='checkbox']")?.checked || false
        };

        // Pequeno timeout para garantir que a UI não trave
        setTimeout(() => {
            this._updateMapVisuals();
            
            if (this.selectedLoteId && !this.map.hasLayer(this.polygons[this.selectedLoteId])) {
                this._clearForm();
            }
            document.body.classList.remove('app-loading');
        }, 10);
    }

    _updateMapVisuals() {
        Object.values(this.polygons).forEach(poly => {
            const data = poly.loteData;

            // 1. Visibilidade (Empreendimento)
            if (this.filters.empreendimento && data.Empreendimento !== this.filters.empreendimento) {
                if (this.map.hasLayer(poly)) this.map.removeLayer(poly);
                return;
            } else {
                if (!this.map.hasLayer(poly)) this.map.addLayer(poly);
            }

            // 2. Filtros Auxiliares
            let isMatch = true;
            if (this.filters.quadra) {
                const matchQ = data.Nome.match(/^Q(\d+)/);
                const numQuadra = matchQ ? matchQ[1] : null;
                // Compara strings para evitar erro de tipo
                if (String(numQuadra) !== String(this.filters.quadra)) isMatch = false;
            }
            if (this.filters.status && data.Status !== this.filters.status) isMatch = false;
            if (this.filters.zoneamento && data.Zoneamento !== this.filters.zoneamento) isMatch = false;

            // 3. Estilos
            const baseColor = this._getLoteColor(data);
            const isSelected = this.selectedLoteId === data._id;
            const hasActiveFilters = this.filters.quadra || this.filters.status || this.filters.zoneamento;

            if (isSelected) {
                poly.setStyle({ weight: 2, color: "blue", fillColor: "blue", fillOpacity: 0.6 });
                poly.bringToFront();
            } else if (isMatch) {
                poly.setStyle({
                    weight: hasActiveFilters ? 2 : 0.6,
                    color: hasActiveFilters ? "#1772CB" : "black",
                    fillColor: baseColor,
                    fillOpacity: 1
                });
            } else {
                poly.setStyle({
                    weight: 0.5,
                    color: "#ccc", // Cor mais clara para borda
                    fillColor: baseColor,
                    fillOpacity: 0.3 // Mais transparente
                });
            }

            const txtStatus = this.filters.zonaColorMode ? (data.Zoneamento || "S/ Zoneamento") : (data.Status || "Desc.");
            poly.getTooltip()?.setContent(`${data.Nome} - ${txtStatus}`);
        });
    }

    _getLoteColor(lote) {
        const mode = this.filters.zonaColorMode ? lote.Zoneamento?.toLowerCase() : lote.Status?.toLowerCase();
        
        const colors = {
            "comercial": "#9fbfdf", "residencial": "#dad2b4", "equipamento público": "#f0c9ad",
            "app": "#88c4a6", "área verde": "#88c4a6",
            "disponível": "lightblue", "vendido": "ForestGreen", "reservado": "#f0c9ad", "indisponível": "#c7c7c7"
        };
        return colors[mode] || "#c7c7c7";
    }

    // --- 5. Interação ---
    _handlePolygonClick(polygon) {
        if (this.selectedLoteId) {
            this.selectedLoteId = null; 
            this._updateMapVisuals(); 
        }

        this.selectedLoteId = polygon.loteData._id;
        this._updateMapVisuals();
        this._fillForm(polygon.loteData);
    }

    _fillForm(lote) {
        // Helper para Inputs Normais (Texto/Numero)
        const setInput = (id, val) => {
            const el = document.getElementById(id);
            if (el) { el.value = val; el.dispatchEvent(new Event("change")); }
        };

        // Helper para Dropdowns do Bubble (exige aspas duplas no valor para ser JSON válido)
        const setBubbleDropdown = (id, val) => {
            const el = document.getElementById(id);
            if (el) { 
                // AQUI ESTAVA O ERRO: Adicionamos aspas explicitamente
                el.value = `"${val || ""}"`; 
                el.dispatchEvent(new Event("change")); 
            }
        };
        
        // Campos de texto simples
        setInput("quadra_lote2", lote.Nome || "");
        setInput("area2", String(lote.Área || 0));
        setInput("frente2", String(lote.Frente || 0));
        setInput("lateral2", String(lote.Lateral || 0));
        setInput("valor_metro2", String(lote.ValorM2 || 0));
        setInput("valor_total2", String(lote.Valor || 0));
        setInput("indice2", String(lote.IndiceConstrutivo || 0));

        // Campos que são Dropdowns no Bubble (Usam aspas)
        setBubbleDropdown("status2", lote.Status || "Desconhecido");
        setBubbleDropdown("zona2", lote.Zoneamento || "Desconhecido");
        
        // Empreendimento pode ser complexo, verifica se é dropdown ou input
        // Assumindo input hidden ou dropdown:
        if (lote.Empreendimento) {
             const el = document.getElementById("empreendimento2");
             if(el && el.tagName === "SELECT") {
                 setBubbleDropdown("empreendimento2", lote.Empreendimento);
             } else {
                 setInput("empreendimento2", lote.Empreendimento);
             }
        }
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

        // Ao ler DO formulário para o objeto, removemos aspas se vierem do Bubble Dropdown
        const cleanStr = (val) => val ? val.replace(/"/g, '') : "";

        Object.assign(poligono.loteData, {
            Nome: getVal("quadra_lote2"),
            Área: unmask(getVal("area2")),
            Status: cleanStr(getVal("status2")), 
            Zoneamento: cleanStr(getVal("zona2")),
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