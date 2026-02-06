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

            if (lote.Quadra) {
                const tempPoly = L.polygon(finalCoords);
                const marker = L.marker(tempPoly.getBounds().getCenter(), { opacity: 0, interactive: false });
                marker.bindTooltip(lote.Nome, {
                    permanent: true, direction: "bottom", className: "quadra-tooltip", offset: [-6, 1.5]
                });
                marker.addTo(this.map);
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
            if (el) el.addEventListener("change", this._handleFilterChange);
        });

        document.getElementById("buttonAlterar")?.addEventListener('click', () => {
            this._atualizarPoligonoSelecionado();
        });
        
        this.map.on('click', () => this._clearForm());

        const checkExist = setInterval(() => {
            const zonaCheck = document.getElementById("zona");
            
            if (zonaCheck) {
                // Remove listeners antigos (hack para evitar duplicação se o script rodar 2x)
                const novoElemento = zonaCheck.cloneNode(true);
                zonaCheck.parentNode.replaceChild(novoElemento, zonaCheck);
                
                // Adiciona o evento Change (mais confiável que click para checkboxes)
                novoElemento.addEventListener('change', (e) => {
                    console.log("DEBUG: Switch clicado via JS. Estado:", e.target.checked);
                    this._handleFilterChange();
                });
                
                // Para de procurar
                clearInterval(checkExist);
            }
        }, 500); 
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

        // 1. Captura o valor atual do Empreendimento
        const prevEmp = this.filters.empreendimento;

        let empVal = getCleanVal("empreendimentoSelect");
        if (empVal.includes('__LOOKUP__')) empVal = empVal.split('__LOOKUP__')[1];

        // 2. Atualiza o objeto de filtros
        const zonaEl = document.getElementById("zona");
        
        this.filters = {
            empreendimento: empVal,
            quadra: getCleanVal("selectQuadra"),
            status: getCleanVal("selectStatus"),
            Atividade: getCleanVal("selectAtividade"),
            // Antes estava procurando '#zona input', o que retornava null
            zonaColorMode: zonaEl ? zonaEl.checked : false 
        };

        console.log("DEBUG: Modo Zona Ativo?", this.filters.zonaColorMode); // Para confirmar no console

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

    _clearForm() {
        this.selectedIds.clear();
        this._updateMapVisuals();
        
        // Função para resetar estilo e valor
        const resetEl = (id, isComplex = false) => {
            const el = document.getElementById(id);
            if (!el) return;

            // 1. Reseta valor
            if (isComplex) el.value = "null";
            else el.value = "";

            // 2. Reseta Estilos (remove o cinza e libera o clique)
            el.style.removeProperty('background-color');
            el.style.removeProperty('color');
            el.style.removeProperty('pointer-events');
            el.style.removeProperty('opacity');
            el.removeAttribute('disabled');

            el.dispatchEvent(new Event("change"));
        };

        const textIds = ["quadra_lote2", "area2", "cliente2", "frente2", "lateral2", "valor_metro2", "valor_total2", "indice2"];
        const complexIds = ["atividade2", "status2", "empreendimento2", "zona2"];

        textIds.forEach(id => resetEl(id, false));
        complexIds.forEach(id => resetEl(id, true));

        // Reseta o botão Alterar
        const btnAlterar = document.getElementById("buttonAlterar");
        if (btnAlterar) {
            btnAlterar.style.opacity = "1";
            btnAlterar.style.cursor = "pointer";
        }
    }

    _fillForm() {
        // Função auxiliar robusta para aplicar estilos em elementos Bubble
        const applyLockStyle = (el, disable) => {
            if (disable) {
                // Força visual cinza e bloqueia cliques do mouse
                el.style.setProperty('background-color', '#e9ecef', 'important'); // Cinza padrão
                el.style.setProperty('color', '#6c757d', 'important'); // Texto cinza escuro
                el.style.setProperty('pointer-events', 'none', 'important'); // Bloqueia qualquer clique
                el.style.setProperty('opacity', '0.7', 'important'); // Garante aspecto visual
                // Tenta atributo nativo também
                el.setAttribute('disabled', 'true');
            } else {
                // Remove estilos forçados para voltar ao padrão do Bubble
                el.style.removeProperty('background-color');
                el.style.removeProperty('color');
                el.style.removeProperty('pointer-events');
                el.style.removeProperty('opacity');
                el.removeAttribute('disabled');
            }
        };

        const setInput = (id, val, disable = false) => {
            const el = document.getElementById(id);
            if (el) { 
                el.value = val; 
                applyLockStyle(el, disable);
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
            
            applyLockStyle(el, disable);
            el.dispatchEvent(new Event("change"));
        };

        if (this.selectedIds.size === 0) {
            this._clearForm();
            return;
        }
        const isMulti = this.selectedIds.size > 1;

        let totalArea = 0, totalFrente = 0, totalLateral = 0, totalValor = 0;
        let nomes = [], clientes = new Set(), statusSet = new Set(), attSet = new Set(), empSet = new Set(), zonaSet = new Set();

        this.selectedIds.forEach(id => {
            const lote = this.polygons[id].loteData;
            totalArea += (lote.Área || 0);
            totalFrente += (lote.Frente || 0);
            totalLateral += (lote.Lateral || 0);
            totalValor += (lote.Valor || 0);
            if (lote.Cliente) clientes.add(lote.Cliente);
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
        const clientsList = cleanList(clientes);

        setInput("quadra_lote2", nomes.length > 1 ? `Lotes: ${nomes.join(", ")}` : nomes[0]);
        setInput("area2", totalArea.toFixed(2));
        setInput("frente2", this.selectedIds.size === 1 ? totalFrente.toFixed(2) : "-");
        setInput("lateral2", this.selectedIds.size === 1 ? totalLateral.toFixed(2) : "-");
        setInput("valor_metro2", totalArea > 0 ? (totalValor / totalArea).toFixed(2) : "0.00");
        setInput("valor_total2", totalValor.toFixed(2));
        setInput("cliente2", clientsList.length > 1 ? `Clientes: ${clientsList.join(", ")}` : clientsList[0]);

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

        const btnAlterar = document.getElementById("buttonAlterar");
        if (btnAlterar) {
            btnAlterar.style.opacity = isMulti ? "0.5" : "1";
            btnAlterar.style.cursor = isMulti ? "not-allowed" : "pointer";
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
            alert("Não é possível alterar múltiplos lotes ao mesmo tempo.");
            return;
        }
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
            Atividade: cleanStr(getVal("atividade2")),
            Frente: unmask(getVal("frente2")),
            Lateral: unmask(getVal("lateral2")),
            ValorM2: unmask(getVal("valor_metro2")),
            Valor: unmask(getVal("valor_total2")),
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

    getSelectedLotesData() {
        return Array.from(this.selectedIds).map(id => this.polygons[id].loteData);
    }
}

export function iniciarMapa(empreendimentosJSON, urlAPI) {
    const mapaManager = new MapaLotesManager('meuMapa', urlAPI);
    mapaManager.init(empreendimentosJSON);
    return mapaManager;
}