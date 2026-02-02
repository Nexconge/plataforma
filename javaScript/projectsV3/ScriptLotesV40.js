class MapaLotesManager {
    constructor(mapId, url) {
        this.mapId = mapId;
        this.urlAPI = url;
        this.map = null;
        
        this.selectedIds = new Set();
        this.allLotes = [];
        this.polygons = {}; 
        
        // Controle de "Debounce" para evitar tremedeira
        this.filterDebounceTimer = null;

        this.filters = {
            empreendimento: "",
            quadra: "",
            status: "",
            Atividade: "",
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
            document.body.classList.remove('app-loading'); 
            return;
        }

        this._renderLotes(this.allLotes);
        this._populateAuxiliaryFilters(); 
        
        // Chama o filtro inicial
        this._handleFilterChange();
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
            
            if (z < 16) document.documentElement.classList.add('quadra-hidden');
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
                console.log("Lote adicionado ao mapa:", lote);
                
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
        const ids = ["empreendimentoSelect", "selectQuadra", "selectStatus", "selectAtividade"];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener("change", this._handleFilterChange);
        });

        const zonaCheck = document.getElementById("zona");
        if (zonaCheck) zonaCheck.addEventListener('click', () => {
             // Pequeno delay para garantir que o checkbox mudou de estado
             setTimeout(() => this._handleFilterChange(), 50);
        });

        document.getElementById("buttonAlterar")?.addEventListener('click', () => {
            this._atualizarPoligonoSelecionado();
        });
        
        this.map.on('click', () => this._clearForm());
    }

    _populateAuxiliaryFilters() {
        if (document.getElementById("selectQuadra")?.options.length > 1) return;

        const quadras = new Set();
        const status = new Set();
        const zonas = new Set();

        this.allLotes.forEach(l => {
            if (l.Quadra) return; 
            const matchQ = l.Nome && l.Nome.match(/^(Q\d+)/); 
            if(matchQ) quadras.add(matchQ[1]); 
            if(l.Status) status.add(l.Status);
            if(l.Atividade) zonas.add(l.Atividade);
        });

        const sortAndPopulate = (setId, values) => {
            const select = document.getElementById(setId);
            if(!select) return;
            select.innerHTML = '<option value="">Todos</option>';
            Array.from(values).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})).forEach(val => {
                if(!val) return;
                const opt = document.createElement("option");
                opt.value = val;
                opt.textContent = val;
                select.appendChild(opt);
            });
        };

        sortAndPopulate("selectQuadra", quadras);
        sortAndPopulate("selectStatus", status);
        sortAndPopulate("selectAtividade", zonas);
    }

    // --- CORREÇÃO AQUI: DEBOUNCE PARA EVITAR TREMEDEIRA ---
    _handleFilterChange() {
        // 1. Cancela a execução anterior se ela ainda não aconteceu
        if (this.filterDebounceTimer) {
            clearTimeout(this.filterDebounceTimer);
        }

        // 2. Define uma nova execução para daqui a 500ms
        this.filterDebounceTimer = setTimeout(() => {
            this._executarFiltroReal();
            this.filterDebounceTimer = null;
        }, 100); 
    }

    _executarFiltroReal() {
        const getCleanVal = (id) => {
            const el = document.getElementById(id);
            if (!el) return "";
            let val = el.value.replace(/"/g, '');
            if (val.startsWith("BLANK") || val.startsWith("PLACEHOLDER")) return "";
            return val.trim();
        };

        // 1. Captura o valor atual do Empreendimento ANTES de atualizar os filtros
        // Isso é crucial para saber se mudamos de mapa ou apenas de filtro visual
        const prevEmp = this.filters.empreendimento;

        let empVal = getCleanVal("empreendimentoSelect");
        if (empVal.includes('__LOOKUP__')) empVal = empVal.split('__LOOKUP__')[1];

        // 2. Atualiza o objeto de filtros
        this.filters = {
            empreendimento: empVal,
            quadra: getCleanVal("selectQuadra"),
            status: getCleanVal("selectStatus"),
            Atividade: getCleanVal("selectAtividade"),
            zonaColorMode: document.querySelector("#zona input[type='checkbox']")?.checked || false
        };

        // 3. Atualiza as cores/visibilidade dos polígonos
        this._updateMapVisuals();
        
        // 4. Verifica se os polígonos selecionados ainda são válidos
        let changed = false;
        this.selectedIds.forEach(id => {
            if (!this.polygons[id] || !this.map.hasLayer(this.polygons[id])) {
                this.selectedIds.delete(id);
                changed = true;
            }
        });

        if (changed) this._fillForm();
        if (this.selectedIds.size === 0) this._clearForm();

        if (prevEmp !== empVal) {
            this._centralizeView();
        }

        document.body.classList.remove('app-loading');
    }

    _updateMapVisuals() {
        const hasActiveFilters = !!(this.filters.quadra || this.filters.status || this.filters.Atividade);

        Object.values(this.polygons).forEach(poly => {
            const data = poly.loteData;

            if (this.filters.empreendimento && data.Empreendimento !== this.filters.empreendimento) {
                if (this.map.hasLayer(poly)) this.map.removeLayer(poly);
                return;
            } else {
                if (!this.map.hasLayer(poly)) this.map.addLayer(poly);
            }

            let isMatch = true;
            if (hasActiveFilters) {
                if (this.filters.quadra) {
                    const filterQ = this.filters.quadra.replace(/\D/g, ''); 
                    const matchQ = data.Nome.match(/Q(\d+)/i);
                    const lotQ = matchQ ? matchQ[1] : "";
                    if (filterQ !== lotQ) isMatch = false;
                }
                if (this.filters.status && data.Status !== this.filters.status) isMatch = false;
                if (this.filters.Atividade && data.Atividade !== this.filters.Atividade) isMatch = false;
            }

            const baseColor = this._getLoteColor(data);
            const isSelected = this.selectedIds.has(data._id);

            if (isSelected) {
                poly.setStyle({ weight: 2, color: "blue", fillColor: "blue", fillOpacity: 0.6 });
                poly.bringToFront();
            } else if (!hasActiveFilters) {
                poly.setStyle({ weight: 0.6, color: "black", fillColor: baseColor, fillOpacity: 1 });
            } else if (isMatch) {
                poly.setStyle({ weight: 2, color: "#1772CB", fillColor: baseColor, fillOpacity: 1 });
            } else {
                poly.setStyle({ weight: 0.5, color: "#ccc", fillColor: baseColor, fillOpacity: 0.65 });
            }

            const txtStatus = this.filters.zonaColorMode ? (data.Atividade || "S/ Atividade") : (data.Status || "Desc.");
            poly.getTooltip()?.setContent(`${data.Nome} - ${txtStatus}`);
        });
    }

    _getLoteColor(lote) {
        const mode = this.filters.zonaColorMode ? lote.Atividade?.toLowerCase() : lote.Status?.toLowerCase();
        const colors = {
            "comercial": "#9fbfdf", "residencial": "#dad2b4", "equipamento público": "#f0c9ad",
            "app": "#88c4a6", "área verde": "#88c4a6",
            "disponível": "lightblue", "vendido": "ForestGreen", "reservado": "#f0c9ad", "indisponível": "#c7c7c7"
        };
        return colors[mode] || "#c7c7c7";
    }

    _handlePolygonClick(polygon) {
        const id = polygon.loteData._id;
        if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
        } else {
            this.selectedIds.add(id);
        }
        this._updateMapVisuals();
        this._fillForm();
    }

    _fillForm() {
        const setInput = (id, val) => {
            const el = document.getElementById(id);
            if (el) { el.value = val; el.dispatchEvent(new Event("change")); }
        };

        const setBubbleDropdown = (id, val) => {
            const el = document.getElementById(id);
            if (!el) return;
            let valorSeguro = (val === undefined || val === null || val === "undefined") ? "" : val;
            el.value = JSON.stringify(valorSeguro); 
            el.dispatchEvent(new Event("change"));
        };

        if (this.selectedIds.size === 0) {
            this._clearForm();
            return;
        }

        let totalArea = 0, totalFrente = 0, totalLateral = 0, totalValor = 0;
        let nomes = [], clientes = [], statusSet = new Set(), zonaSet = new Set(), empSet = new Set();

        this.selectedIds.forEach(id => {
            const lote = this.polygons[id].loteData;
            totalArea += (lote.Área || 0);
            totalFrente += (lote.Frente || 0);
            totalLateral += (lote.Lateral || 0);
            totalValor += (lote.Valor || 0);
            clientes.push(lote.Cliente || "");
            nomes.push(lote.Nome);
            statusSet.add(lote.Status);
            zonaSet.add(lote.Atividade);
            empSet.add(lote.Empreendimento);
        });

        const cleanList = (set) => [...set].filter(v => v && v !== "undefined" && v !== "null");
        const statusList = cleanList(statusSet);
        const zonaList = cleanList(zonaSet);
        const empList = cleanList(empSet);

        setInput("quadra_lote2", nomes.length > 1 ? `Lotes: ${nomes.join(", ")}` : nomes[0]);
        setInput("area2", totalArea.toFixed(2));
        setInput("frente2", totalFrente.toFixed(2)); 
        setInput("lateral2", totalLateral.toFixed(2));
        setInput("valor_metro2", totalArea > 0 ? (totalValor / totalArea).toFixed(2) : "0.00");
        setInput("valor_total2", totalValor.toFixed(2));
        setInput("cliente2", clientes.length > 1 ? `Clientes: ${clientes.join(", ")}` : clientes[0]);

        setBubbleDropdown("status2", statusList.length === 1 ? statusList[0] : (statusList.length > 1 ? "Vários" : ""));
        setBubbleDropdown("zona2", zonaList.length === 1 ? zonaList[0] : (zonaList.length > 1 ? "Vários" : ""));

        const elEmp = document.getElementById("empreendimento2");
        if(elEmp && elEmp.tagName === "SELECT") {
             setBubbleDropdown("empreendimento2", empList.length === 1 ? empList[0] : "");
        } else {
             setInput("empreendimento2", empList.length === 1 ? empList[0] : "");
        }
    }

    _clearForm() {
        this.selectedIds.clear();
        this._updateMapVisuals();
        const ids = ["zona2", "quadra_lote2", "area2","cliente2", "status2", "frente2", "lateral2", "valor_metro2", "valor_total2", "indice2", "empreendimento2"];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = ""; el.dispatchEvent(new Event("change")); }
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
        
        // CORREÇÃO: Impede animação se não houver lotes visíveis ou se já estiver centralizando
        if (count > 0) {
            // duration: 1 segundo, mas se for chamado de novo, o Debounce protegeu
            this.map.flyToBounds(bounds, { padding: [50, 50], duration: 1.2 });
        } else {
            this.map.flyTo(this.map.options.center, this.map.options.zoom);
        }
    }

    _atualizarPoligonoSelecionado() {
        if (this.selectedIds.size !== 1) return;
        const [id] = this.selectedIds;
        const poligono = this.polygons[id];
        if(!poligono) return;

        const getVal = id => document.getElementById(id)?.value || "";
        const unmask = (val) => parseFloat(val.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
        const cleanStr = (val) => val ? val.replace(/"/g, '') : "";

        Object.assign(poligono.loteData, {
            Nome: getVal("quadra_lote2"),
            Área: unmask(getVal("area2")),
            Cliente: cleanStr(getVal("cliente2")),
            Status: cleanStr(getVal("status2")), 
            Atividade: cleanStr(getVal("zona2")),
            Frente: unmask(getVal("frente2")),
            Lateral: unmask(getVal("lateral2")),
            ValorM2: unmask(getVal("valor_metro2")),
            Valor: unmask(getVal("valor_total2"))
        });
        this._updateMapVisuals();
    }

    getSelectedLotesData() {
        return Array.from(this.selectedIds).map(id => this.polygons[id].loteData);
    }
}

export function iniciarMapa(empreendimentosJSON, urlAPI) {
    const mapaManager = new MapaLotesManager('meuMapa', urlAPI);
    mapaManager.init(empreendimentosJSON);
    return mapaManager;
}