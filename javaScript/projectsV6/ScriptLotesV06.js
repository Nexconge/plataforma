class MapaLotesManager {
    constructor(mapId, url) {
        this.mapId = mapId;
        this.urlAPI = url;
        this.map = null;
        
        this.selectedIds = new Set();
        this.allLotes = [];
        this.polygons = {}; 
        this.quadraMarkers = [];
        
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

        // --- ADIÇÃO: Estilos da Legenda ---
        const style = document.createElement('style');
        style.innerHTML = `
            .info.legend { background: white; padding: 10px; border-radius: 5px; box-shadow: 0 0 15px rgba(0,0,0,0.2); font-size: 12px; font-family: sans-serif; }
            .legend-item { display: flex; align-items: center; margin-bottom: 4px; }
            .legend-color { width: 18px; height: 18px; margin-right: 8px; border: 1px solid #ccc; opacity: 0.8; }
        `;
        document.head.appendChild(style);

        // --- ADIÇÃO: Controle da Legenda ---
        const legend = L.control({ position: 'topright' });
        legend.onAdd = () => {
            this.legendContainer = L.DomUtil.create('div', 'info legend');
            L.DomEvent.disableClickPropagation(this.legendContainer); // Evita clique no mapa através da legenda
            return this.legendContainer;
        };
        legend.addTo(this.map);

        this.map.on('zoom zoomend', () => {
            const z = this.map.getZoom();
            const scale = Math.max(0.45, z / 15);
            document.documentElement.style.setProperty('--quadra-scale', String(scale));
            
            if (z < 18) document.documentElement.classList.add('quadra-hidden');
            else document.documentElement.classList.remove('quadra-hidden');
            
            const fontSize = 14 * (z / 15);
            document.querySelectorAll(".quadra-tooltip").forEach(el => el.style.fontSize = fontSize + "px");
        });
    }

    // --- 3. Renderização ---
    _renderLotes(lotes) {
        Object.values(this.polygons).forEach(p => p.remove());
        this.polygons = {};

        this.quadraMarkers.forEach(m => m.remove());
        this.quadraMarkers = [];

        lotes.forEach(lote => {
            if (!lote.Coordenadas) return;
            let coords;
            try { coords = JSON.parse(lote.Coordenadas); } catch { return; }
            if (!Array.isArray(coords) || coords.length === 0) return;

            // Remove duplicatas consecutivas E remove o último ponto se for igual ao primeiro
            let cleanCoords = coords.filter((item, index, arr) => {
                if (index === 0) return true;
                const prev = arr[index - 1];
                return item[0] !== prev[0] || item[1] !== prev[1];
            });

            // Se o último for igual ao primeiro, remove para evitar falso positivo na verificação
            if (cleanCoords.length > 2) {
                const first = cleanCoords[0];
                const last = cleanCoords[cleanCoords.length - 1];
                if (first[0] === last[0] && first[1] === last[1]) {
                    cleanCoords.pop();
                }
            }

            // 2. VERIFICAÇÃO INTELIGENTE
            // Agora a verificação só vai falhar se houver cruzamento REAL no meio do lote
            let finalCoords = cleanCoords;
            const isClean = this._isSimplePolygon(cleanCoords);

            if (!isClean) {
                // console.log(`Corrigindo lote quebrado: ${lote.Nome}`);
                finalCoords = this._organizarPontosRadialmente(cleanCoords);
            }

            // Adiciona o primeiro ponto ao final novamente para fechar o desenho no mapa (opcional no Leaflet, mas bom para garantir)
            finalCoords.push(finalCoords[0]);
            
            //Se for uma quadra desenha apenas o marcador central com tooltip, sem polígono
            if (lote.Quadra) {
                const tempPoly = L.polygon(finalCoords);
                const marker = L.marker(tempPoly.getBounds().getCenter(), { opacity: 0, interactive: false });
                marker.bindTooltip(lote.Nome, {
                    permanent: true, direction: "bottom", className: "quadra-tooltip", offset: [-6, 1.5]
                });

                marker.loteData = lote; 
                marker.addTo(this.map);
                this.quadraMarkers.push(marker);
            
            // Se o lote for inativo, desenha o poligono sem interatividade
            } else if (lote.Inativo) {
                const polygon = L.polygon(finalCoords, {
                    color: "black",
                    weight: 0.6,
                    fillOpacity: 1,
                    fillColor: "#c7c7c7",
                    interactive: false
                });
                
                polygon.loteData = lote;
                polygon.addTo(this.map);
                this.polygons[lote._id] = polygon;

            // Caso contrário, desenha o polígono normalmente com interatividade
            } else {
                const polygon = L.polygon(finalCoords, {
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
        const ids = ["empreendimentoSelect", "selectQuadra", "selectStatus", "selectAtividade"];
        
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            if (el.tagName === "DIV") {
                const observer = new MutationObserver(() => {
                    this._handleFilterChange();
                });
                observer.observe(el, { childList: true, subtree: true, characterData: true });
            } else {
                el.addEventListener("change", this._handleFilterChange);
            }
        });

        document.getElementById("buttonAlterar")?.addEventListener('click', () => {
            this._atualizarPoligonoSelecionado();
        });
        
        this.map.on('click', () => this._clearForm());

        const checkExist = setInterval(() => {
            const zonaCheck = document.getElementById("zona");
            if (zonaCheck) {
                const novoElemento = zonaCheck.cloneNode(true);
                zonaCheck.parentNode.replaceChild(novoElemento, zonaCheck);
                novoElemento.addEventListener('change', (e) => {
                    this._handleFilterChange();
                });
                clearInterval(checkExist);
            }
        }, 500); 
    }

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

    _updateLegenda() {
        if (!this.legendContainer) return;

        const isZona = this.filters.zonaColorMode;
        
        // Definição das categorias e cores (baseado no seu _getLoteColor)
        const items = isZona ? [
            { label: "Comercial", color: "#9fbfdf" },
            { label: "Residencial", color: "#dad2b4" },
            { label: "Equipamento Público", color: "#f0c9ad" },
            { label: "Área Verde / APP", color: "#88c4a6" }
        ] : [
            { label: "Disponível", color: "lightblue" },
            { label: "Vendido", color: "ForestGreen" },
            { label: "Reservado", color: "#f0c9ad" },
            { label: "Indisponível", color: "#c7c7c7" }
        ];

        let html = `<h4 style="margin:0 0 8px; font-weight:bold; border-bottom:1px solid #eee; padding-bottom:4px;">${isZona ? "Atividade" : "Situação"}</h4>`;
        
        items.forEach(item => {
            html += `
                <div class="legend-item">
                    <i class="legend-color" style="background:${item.color};"></i>
                    <span>${item.label}</span>
                </div>`;
        });

        this.legendContainer.innerHTML = html;
    }

    _executarFiltroReal() {
        const getCleanVal = (id) => {
            const el = document.getElementById(id);
            if (!el) return "";
            let val = el.value ? el.value.replace(/"/g, '') : "";
            if (val.startsWith("BLANK") || val.startsWith("PLACEHOLDER")) return "";
            return val.trim();
        };

        // Nova função para capturar os arrays do MultiDropdown
        const getMultiVal = (id) => {
            const el = document.getElementById(id);
            if (!el) return [];
            
            if (el.tagName === "DIV" && el.classList.contains("select2-MultiDropdown")) {
                return el.innerText.split('\n')
                    .map(linha => linha.trim())
                    .filter(linha => linha.startsWith('×'))
                    .map(linha => linha.substring(1).trim());
            }
            
            // Fallback caso algum ainda seja select normal
            const val = getCleanVal(id);
            return val ? [val] : [];
        };

        const prevEmp = this.filters.empreendimento;

        let empVal = getCleanVal("empreendimentoSelect");
        if (empVal.includes('__LOOKUP__')) empVal = empVal.split('__LOOKUP__')[1];
        
        // Fallback do empreendimento
        if (!empVal) {
            const primeiroValido = this.allLotes.find(l => l.Empreendimento && l.Empreendimento.trim() !== "");
            empVal = primeiroValido ? primeiroValido.Empreendimento : ""; 
        }

        const zonaEl = document.getElementById("zona");
        
        // Agora salvamos os filtros como Listas (Arrays)
        this.filters = {
            empreendimento: empVal,
            quadras: getMultiVal("selectQuadra"),
            status: getMultiVal("selectStatus"),
            Atividades: getMultiVal("selectAtividade"),
            zonaColorMode: zonaEl ? zonaEl.checked : false 
        };

        this._updateLegenda();
        this._updateMapVisuals();
        
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
        // Verifica se há pelo menos um item em qualquer uma das listas de filtro
        const hasActiveFilters = !!(this.filters.quadras.length > 0 || this.filters.status.length > 0 || this.filters.Atividades.length > 0);

        this.quadraMarkers.forEach(marker => {
            const data = marker.loteData;
            if (this.filters.empreendimento && data.Empreendimento !== this.filters.empreendimento) {
                if (this.map.hasLayer(marker)) this.map.removeLayer(marker);
            } else {
                if (!this.map.hasLayer(marker)) this.map.addLayer(marker);
            }
        });

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
                // Filtragem MultiQuadra
                if (this.filters.quadras.length > 0) {
                    // Extrai apenas os números do filtro e do lote para comparar corretamente
                    const filterQs = this.filters.quadras.map(q => q.replace(/\D/g, ''));
                    const matchQ = data.Nome.match(/Q(\d+)/i);
                    const lotQ = matchQ ? matchQ[1] : "";
                    
                    if (!filterQs.includes(lotQ)) isMatch = false;
                }
                
                // Filtragem MultiStatus
                if (this.filters.status.length > 0) {
                    if (!this.filters.status.includes(data.Status)) isMatch = false;
                }
                
                // Filtragem MultiAtividade
                if (this.filters.Atividades.length > 0) {
                    if (!this.filters.Atividades.includes(data.Atividade)) isMatch = false;
                }
            }

            const theme = this._getLoteColor(data);
            const isSelected = this.selectedIds.has(data._id);

            if (isSelected) {
                // Lote clicado/selecionado no momento (Prioridade máxima)
                poly.setStyle({ weight: 3, color: "blue", fillColor: "blue", fillOpacity: 0.7 });
                poly.bringToFront();
            } else if (!hasActiveFilters) {
                // Mapa no estado normal (sem nenhum filtro ativo)
                poly.setStyle({ weight: 0.8, color: "black", fillColor: theme.fill, fillOpacity: 1 });
            } else if (isMatch) {
                // Lote que ESTÁ no filtro (Destaque total)
                poly.setStyle({ weight: 1.8, color: theme.stroke, fillColor: theme.fill, fillOpacity: 1 });
                poly.bringToFront(); 
            } else {
                // Lote FORA do filtro (Quase invisível / Apagado)
                poly.setStyle({ weight: 0.5, color: "#e8e8e8", fillColor: theme.fill, fillOpacity: 0.35 });
            }

            const txtStatus = this.filters.zonaColorMode ? (data.Atividade || "S/ Atividade") : (data.Status || "Desc.");
            poly.getTooltip()?.setContent(`${data.Nome} - ${txtStatus}`);
        });
    }

    _getLoteColor(lote) {
        const mode = this.filters.zonaColorMode ? lote.Atividade?.toLowerCase() : lote.Status?.toLowerCase();
        
        const themes = {
            "comercial": { fill: "#9fbfdf", stroke: "#6e9bc7" },
            "residencial": { fill: "#dad2b4", stroke: "#b8ae86" },
            "equipamento público": { fill: "#f0c9ad", stroke: "#d4a482" },
            "app": { fill: "#88c4a6", stroke: "#5ca47f" },
            "área verde": { fill: "#88c4a6", stroke: "#5ca47f" },
            "disponível": { fill: "lightblue", stroke: "#6b9eaf" }, 
            "vendido": { fill: "ForestGreen", stroke: "#155e15" },
            "reservado": { fill: "#f0c9ad", stroke: "#d4a482" },
            "indisponível": { fill: "#c7c7c7", stroke: "#999999" }
        };
        
        return themes[mode] || { fill: "#c7c7c7", stroke: "#999999" };
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

    _clearForm() {
        this.selectedIds.clear();
        this._updateMapVisuals();
        
        const resetEl = (id, isComplex = false) => {
            const el = document.getElementById(id);
            if (!el) return;

            el.value = "";
            
            try {
                el.dispatchEvent(new Event("change"));
            } catch (e) {
                // Silencia o erro "undefined is not valid JSON" pois o campo já está visualmente limpo
                // console.warn("Bubble JSON error ignorado ao limpar:", id); 
            }
        };

        const textIds = ["quadra_lote2", "area2", "cliente2", "frente2", "lateral2", "valor_metro2", "valor_total2", "indice2"];
        const complexIds = ["atividade2", "status2", "empreendimento2", "zona2"];

        textIds.forEach(id => resetEl(id, false));
        complexIds.forEach(id => resetEl(id, true));
    }

    _fillForm() {
        const setInput = (id, val, disable = false) => {
            const el = document.getElementById(id);
            if (el) { 
                // Proteção contra undefined/null sendo escritos como texto
                el.value = (val === undefined || val === null) ? "" : val; 
                el.dispatchEvent(new Event("change")); 
            }
        };
        
        const setBubbleDropdown = (id, val, disable = false) => {
            const el = document.getElementById(id);
            if (!el) return;
            
            if (val === undefined || val === null || val === "undefined" || val === "") {
                el.value = "null"; 
            } else {
                el.value = JSON.stringify(val); 
            }
            
            el.dispatchEvent(new Event("change"));
        };

        if (this.selectedIds.size === 0) {
            this._clearForm();
            return;
        }
        const isMulti = this.selectedIds.size > 1;
        const isEmpty = this.selectedIds.size === 0;

        let totalArea = 0, totalFrente = 0, totalLateral = 0, totalValor = 0;
        let nomes = [], listaClientes = [], statusSet = new Set(), attSet = new Set(), empSet = new Set(), zonaSet = new Set();

        this.selectedIds.forEach(id => {
            const lote = this.polygons[id].loteData;
            totalArea += (lote.Área || 0);
            totalFrente += (lote.Frente || 0);
            totalLateral += (lote.Lateral || 0);
            totalValor += (lote.Valor || 0);
            // Verificação robusta para cliente
            if (lote.Cliente && typeof lote.Cliente === 'string' && lote.Cliente.trim() !== "") {
                listaClientes.push(lote.Cliente);
            }
            nomes.push(lote.Nome);
            statusSet.add(lote.Status);
            attSet.add(lote.Atividade);
            empSet.add(lote.Empreendimento);
            zonaSet.add(lote.Zoneamento);
        });

        const cleanList = (set) => [...set].filter(v => v && v !== "undefined" && v !== "null");
        const statusList = cleanList(statusSet);
        const attList = cleanList(attSet);
        const zonaList = cleanList(zonaSet);
        const empList = cleanList(empSet);
        const clienteValor = isMulti ? `Clientes: ${listaClientes.join(", ")}` : (listaClientes[0] || "");

        const formatarNumPTBR = (num) => {
            return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };
        setInput("quadra_lote2", nomes.length > 1 ? `Lotes: ${nomes.join(", ")}` : nomes[0]);
        setInput("area2", formatarNumPTBR(totalArea));
        setInput("frente2", this.selectedIds.size === 1 ? formatarNumPTBR(totalFrente) : "-");
        setInput("lateral2", this.selectedIds.size === 1 ? formatarNumPTBR(totalLateral) : "-");
        setInput("valor_metro2", totalArea > 0 ? formatarNumPTBR(totalValor / totalArea) : "0,00");
        setInput("valor_total2", formatarNumPTBR(totalValor));
        setInput("cliente2", clienteValor, isMulti);
        setBubbleDropdown("status2", statusList.length === 1 ? statusList[0] : (statusList.length > 1 ? "Vários" : ""));
        setBubbleDropdown("atividade2", attList.length === 1 ? attList[0] : (attList.length > 1 ? "Vários" : ""));
        setBubbleDropdown("zona2", zonaList.length === 1 ? zonaList[0] : (zonaList.length > 1 ? "Vários" : ""));

        // Tratamento especial para Empreendimento (pode ser select ou input)
        const elEmp = document.getElementById("empreendimento2");
        if(elEmp && elEmp.tagName === "SELECT") {
             setBubbleDropdown("empreendimento2", empList.length === 1 ? empList[0] : "");
        } else {
             setInput("empreendimento2", empList.length === 1 ? empList[0] : "");
        }
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
        if (this.selectedIds.size > 1) {
            return;
        }
        if (this.selectedIds.size !== 1) return;

        const [id] = this.selectedIds;
        const poligono = this.polygons[id];
        if(!poligono) return;

        const getVal = id => document.getElementById(id)?.value || "";
        const cleanStr = (val) => val ? val.replace(/"/g, '') : "";

        // CONVERSÃO CORRIGIDA:
        // Input: "1,200.50" (Vírgula = Milhar, Ponto = Decimal)
        // Ação: Remove vírgulas -> "1200.50" -> parseFloat
        const getNum = (id) => {
            let val = getVal(id);
            if (!val) return 0;
            
            // Remove o "R$ " se estiver presente
            val = val.toString().replace("R$ ", '').trim();
            // Remove os pontos (separador de milhar do PT-BR)
            val = val.replace(/\./g, '');
            // Substitui a vírgula (separador decimal do PT-BR) por ponto para o JS entender
            val = val.replace(',', '.');
            
            return parseFloat(val) || 0;
        };

        Object.assign(poligono.loteData, {
            Nome: getVal("quadra_lote2"),
            Área: getNum("area2"),
            Cliente: cleanStr(getVal("cliente2")),
            Status: cleanStr(getVal("status2")), 
            Atividade: cleanStr(getVal("atividade2")),
            Frente: getNum("frente2"),
            Lateral: getNum("lateral2"),
            ValorM2: getNum("valor_metro2"),
            Valor: getNum("valor_total2"),
            Zoneamento: cleanStr(getVal("zona2"))
        });
        
        this._updateMapVisuals();
    }

    // Verifica se o polígono é "Simples" (não tem linhas se cruzando)
    _isSimplePolygon(coords) {
        // Função auxiliar para verificar intersecção de dois segmentos (p1-q1 e p2-q2)
        const onSegment = (p, q, r) => {
            return q[0] <= Math.max(p[0], r[0]) && q[0] >= Math.min(p[0], r[0]) &&
                   q[1] <= Math.max(p[1], r[1]) && q[1] >= Math.min(p[1], r[1]);
        };

        const orientation = (p, q, r) => {
            const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
            if (val === 0) return 0; // Colinear
            return (val > 0) ? 1 : 2; // Horário ou Anti-horário
        };

        const doIntersect = (p1, q1, p2, q2) => {
            const o1 = orientation(p1, q1, p2);
            const o2 = orientation(p1, q1, q2);
            const o3 = orientation(p2, q2, p1);
            const o4 = orientation(p2, q2, q1);

            if (o1 !== o2 && o3 !== o4) return true;
            
            // Casos especiais (colineares)
            if (o1 === 0 && onSegment(p1, p2, q1)) return true;
            if (o2 === 0 && onSegment(p1, q2, q1)) return true;
            if (o3 === 0 && onSegment(p2, p1, q2)) return true;
            if (o4 === 0 && onSegment(p2, q1, q2)) return true;
            return false;
        };

        const n = coords.length;
        if (n < 4) return true; // Triângulos nunca se cruzam

        // Testa cada segmento contra todos os outros não-adjacentes
        for (let i = 0; i < n; i++) {
            for (let j = i + 2; j < n; j++) {
                // Ignora o fechamento do último com o primeiro se forem vizinhos
                if (i === 0 && j === n - 1) continue;
                
                // P1-Q1 é o segmento atual, P2-Q2 é o segmento de teste
                if (doIntersect(coords[i], coords[(i + 1) % n], coords[j], coords[(j + 1) % n])) {
                    return false; // ENCONTROU CRUZAMENTO! O polígono está quebrado.
                }
            }
        }
        return true; // Polígono limpo
    }

    // Mantemos o método de correção radial que criamos antes
    _organizarPontosRadialmente(points) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        points.forEach(p => {
            if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
            if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
        });
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        return points.sort((a, b) => Math.atan2(a[0] - centerX, a[1] - centerY) - Math.atan2(b[0] - centerX, b[1] - centerY));
    }

    aplicarAlteracaoEmMassa() {
        if (this.selectedIds.size === 0) return;

        // Função aprimorada para ignorar placeholders do Bubble e capturar o texto real formatado
        const getValSeguro = (id) => {
            const el = document.getElementById(id);
            if (!el) return "";

            // Se for um dropdown (select), pega o texto visível ao invés do valor interno/slug (ex: evita "dispon_vel")
            if (el.tagName === "SELECT" && el.selectedIndex >= 0) {
                let text = el.options[el.selectedIndex].text;
                // Se o texto for o padrão de campo vazio do Bubble, ignora
                if (!text || text.includes("Choose") || text.includes("Escolha") || text.trim() === "") {
                    return "";
                }
                return text.trim();
            }

            // Fallback para inputs normais (removendo aspas residuais)
            let val = el.value ? el.value.replace(/"/g, '').trim() : "";
            
            // Impede que os placeholders do Bubble sobrescrevam dados reais
            if (val.startsWith("BLANK") || val.startsWith("PLACEHOLDER") || val === "null" || val === "undefined") {
                return "";
            }
            
            return val;
        };

        const newAtv = getValSeguro("dropAltMassaAtv");
        const newStat = getValSeguro("dropAltMassaStat");
        const newZon = getValSeguro("dropAltMassaZon");

        this.selectedIds.forEach(id => {
            const poligono = this.polygons[id];
            if (poligono && poligono.loteData) {
                // Só altera se a string resultante for válida (não for vazia)
                if (newAtv !== "") poligono.loteData.Atividade = newAtv;
                if (newStat !== "") poligono.loteData.Status = newStat;
                if (newZon !== "") poligono.loteData.Zoneamento = newZon;
            }
        });

        this._updateMapVisuals();
        this._fillForm(); 
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