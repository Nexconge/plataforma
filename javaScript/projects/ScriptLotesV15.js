import { buscarLotesPaginados } from './apiV04.js';

class MapaLotesManager {

    //INCIALIZAÇÃO DO OBJETO
    constructor(mapId, url, userModifyers) {
        this.mapId = mapId;
        this.urlAPI = url;
        this.map = null;
        this.isExterno = userModifyers && userModifyers.includes("Projects_externo");

        this.selectedIds = new Set();
        this.allLotes = [];
        this.lotesCache = {}; // Adicionado: Controle de cache por ID de empreendimento
        this.lotesFetchPromises = {}; // ADICIONADO: Controle de requisições em andamento
        this.polygons = {}; 
        this.quadraMarkers = [];
        this.empreendimentosLista = [];
        this.filterDebounceTimer = null;

        this.filters = {
            empreendimentos: [],
            quadras: [],
            status: [],
            Atividades: [],
            zoneamentos: [],
            zonaColorMode: false
        };
        this._handleFilterChange = this._handleFilterChange.bind(this);
        this._handlePolygonClick = this._handlePolygonClick.bind(this);
    }
    async init(empreendimentosJSON) {
        try {
            this.empreendimentosLista = JSON.parse(empreendimentosJSON || "[]");
        } catch (e) {
            console.error("Erro no parse do JSON:", e);
        }

        this._initMap();
        this._setupEventListeners();
        this._handleFilterChange();
    }

    //CONTROLE DE DADOS
    async _assegurarDadosEmCache(idsEmpreendimentos) {
        let houveMudanca = false;
        
        // Dispara a busca para TODOS os empreendimentos faltantes simultaneamente
        const promessasDeBusca = idsEmpreendimentos.map(async (idEmp) => {
            if (!idEmp) return;
            
            if (!this.lotesCache[idEmp]) {
                if (!this.lotesFetchPromises[idEmp]) {
                    this.lotesFetchPromises[idEmp] = buscarLotesPaginados(this.urlAPI, idEmp);
                }

                try {
                    const lotes = await this.lotesFetchPromises[idEmp];
                    
                    if (this.isExterno) {
                        lotes.forEach(l => {
                            if (l.Status === "Vendido") l.Status = "Reservado";
                            if (l.Status === "Reservado") {
                                l.Valor = 0; l.ValorM2 = 0; l.Cliente = ""; l.Corretor = "";
                            }
                        });
                    }

                    // Impede duplicidade
                    if (!this.lotesCache[idEmp]) {
                        this.lotesCache[idEmp] = lotes;
                        this.allLotes = this.allLotes.concat(lotes);
                        houveMudanca = true;
                    }
                } finally {
                    delete this.lotesFetchPromises[idEmp];
                }
            }
        });

        // Aguarda todas as buscas paralelas terminarem juntas
        await Promise.all(promessasDeBusca);
        
        return houveMudanca;
    }

    //INICIALIZAÇÃO DA PAGINA
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

        this._atualizarTamanhoMapa();
    }
    _setupEventListeners() {
        const ids = ["empreendimentoSelect", "selectQuadra", "selectStatus", "selectAtividade", "selectZoneamento"];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.tagName === "DIV") {
                new MutationObserver(() => this._handleFilterChange()).observe(el, { childList: true, subtree: true, characterData: true });
            } else {
                el.addEventListener("change", this._handleFilterChange);
            }
        });

        document.getElementById("buttonAlterar")?.addEventListener('click', () => this._atualizarPoligonoSelecionado());
        this.map.on('click', () => this._clearForm());

        const checkExist = setInterval(() => {
            const zonaCheck = document.getElementById("zona");
            if (zonaCheck) {
                const novoElemento = zonaCheck.cloneNode(true);
                zonaCheck.parentNode.replaceChild(novoElemento, zonaCheck);
                novoElemento.addEventListener('change', () => this._handleFilterChange());
                clearInterval(checkExist);
            }
        }, 500); 

        const areaEl = document.getElementById("area2");
        const valorTotalEl = document.getElementById("valor_total2");
        const valorM2El = document.getElementById("valor_metro2");

        const applyMask = (el, type) => {
            if (!el) return 0;
            let digits = el.value.replace(/\D/g, '');
            if (!digits) { el.value = ''; return 0; }
            let num = (parseInt(digits, 10) / 100);
            el.value = this._formatByType(num, type);
            return num;
        };

        ["frente2", "lateral2"].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => applyMask(el, 'meters'));
            el.addEventListener('blur', () => this._triggerChange(el));
        });

        if (areaEl) {
            areaEl.addEventListener('input', () => {
                const a = applyMask(areaEl, 'area');
                if (a > 0 && valorM2El) valorM2El.value = this._formatByType(this._parseNum(valorTotalEl?.value) / a, 'money');
            });
            areaEl.addEventListener('blur', () => { this._triggerChange(areaEl); this._triggerChange(valorM2El); });
        }

        if (valorTotalEl) {
            valorTotalEl.addEventListener('input', () => {
                const t = applyMask(valorTotalEl, 'money');
                const a = this._parseNum(areaEl?.value);
                if (a > 0 && valorM2El) valorM2El.value = this._formatByType(t / a, 'money');
            });
            valorTotalEl.addEventListener('blur', () => { this._triggerChange(valorTotalEl); this._triggerChange(valorM2El); });
        }

        if (valorM2El) {
            valorM2El.addEventListener('input', () => {
                const m2 = applyMask(valorM2El, 'money');
                const a = this._parseNum(areaEl?.value);
                if (a > 0 && valorTotalEl) valorTotalEl.value = this._formatByType(a * m2, 'money');
            });
            valorM2El.addEventListener('blur', () => { this._triggerChange(valorM2El); this._triggerChange(valorTotalEl); });
        }
    }


    //REDERIZAÇÃO
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

            let cleanCoords = coords.filter((item, index, arr) => index === 0 || item[0] !== arr[index - 1][0] || item[1] !== arr[index - 1][1]);
            
            if (cleanCoords.length > 2 && cleanCoords[0][0] === cleanCoords[cleanCoords.length - 1][0] && cleanCoords[0][1] === cleanCoords[cleanCoords.length - 1][1]) {
                cleanCoords.pop();
            }

            let finalCoords = this._isSimplePolygon(cleanCoords) ? cleanCoords : this._organizarPontosRadialmente(cleanCoords);
            finalCoords.push(finalCoords[0]);
            
            if (lote.isQuadra) {
                const marker = L.marker(this._calcularCentroTooltip(finalCoords), { opacity: 0, interactive: false });
                marker.bindTooltip(lote.Lote, { permanent: true, direction: "center", className: "quadra-tooltip", offset: [-15, 25] });
                marker.loteData = lote; 
                marker.addTo(this.map);
                this.quadraMarkers.push(marker);
            } else {
                // Removemos a duplicação do polígono: a única diferença do inativo é a interatividade e eventos
                const polygon = L.polygon(finalCoords, {
                    color: "black", weight: 0.6, fillOpacity: 1, fillColor: "#c7c7c7",
                    interactive: !lote.Inativo
                });

                polygon.loteData = lote;
                this.polygons[lote._id] = polygon;
                polygon.addTo(this.map);

                if (!lote.Inativo) {
                    polygon.bindTooltip("", { permanent: false, className: "lote-tooltip", direction: "auto" });
                    
                    polygon.on('click', (e) => {
                        L.DomEvent.stopPropagation(e);
                        this._handlePolygonClick(polygon);
                    });
                }
            }
        });
    }
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
    _buildTooltipHTML(data) {
        const labelStatus = this.filters.zonaColorMode ? "Atividade" : "Status";
        const txtStatus = this.filters.zonaColorMode ? (data.Atividade || "S/ Atividade") : (data.Status || "Desconhecido");

        // Pega as cores do lote ('stroke' é mais escura e legível no fundo branco)
        const theme = this._getLoteColor(data);
        const corTextoStatus = theme.stroke; 

        const areaFormatada = data.Área ? data.Área.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " m²" : "N/A";
        const valM2Formatado = data.ValorM2 ? "R$ " + data.ValorM2.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "N/A";
        const valTotalFormatado = data.Valor ? "R$ " + data.Valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "N/A";

        return `
            <div class="tooltip-content">
                <strong class="tooltip-title">Lote ${data.Lote}</strong>
                <div class="tooltip-row">
                    <span class="tooltip-label">${labelStatus}:</span> 
                    <span class="tooltip-value" style="color: ${corTextoStatus}; font-weight: bold;">${txtStatus}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">Área:</span> 
                    <span class="tooltip-value">${areaFormatada}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">Valor M²:</span> 
                    <span class="tooltip-value">${valM2Formatado}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">Valor Total:</span> 
                    <span class="tooltip-value destaque-valor">${valTotalFormatado}</span>
                </div>
            </div>
        `;
    }

    //CONTROLE DE INTERAÇÃO
    //1. Mudança de filtros
    _handleFilterChange() {
        if (this.filterDebounceTimer) {
            clearTimeout(this.filterDebounceTimer);
        }

        this.filterDebounceTimer = setTimeout(async () => {
            await this._sincronizarFiltrosEMapa();
            this.filterDebounceTimer = null;
        }, 100);
    }
    async _sincronizarFiltrosEMapa() {
        document.body.classList.add('app-loading');

        try {
            const prevEmpStr = this.filters.empreendimentos ? this.filters.empreendimentos.join() : "";

            let { idsEmpreendimentos, outrosFiltros } = this._capturarDadosDosFiltros();
            
            const idsParaProcessar = idsEmpreendimentos;

            const novosDadosCarregados = await this._assegurarDadosEmCache(idsParaProcessar);
            
            if (novosDadosCarregados) {
                this._renderLotes(this.allLotes);
            }

            this.filters = {
                ...outrosFiltros,
                empreendimentos: idsEmpreendimentos, 
                zonaColorMode: document.getElementById("zona")?.checked || false 
            };

            this._atualizarElementosVisuais();
            this._validarSelecaoAtual();
            
            const newEmpStr = this.filters.empreendimentos.join();

            this._ajustarCamera(prevEmpStr, newEmpStr);

        } catch (error) {
            console.error("[Mapa Debug] Falha na sincronização:", error);
        } finally {
            document.body.classList.remove('app-loading');
        }
    }

    _capturarDadosDosFiltros() {
        const getCleanVal = (id) => {
            const el = document.getElementById(id);
            if (!el) return "";
            let val = el.value ? el.value.replace(/"/g, '') : "";
            return (val.startsWith("BLANK") || val.startsWith("PLACEHOLDER")) ? "" : val.trim();
        };

        const getMultiVal = (id) => {
            const el = document.getElementById(id);
            if (!el) return [];
            if (el.tagName === "DIV" && el.classList.contains("select2-MultiDropdown")) {
                return el.innerText.split('\n')
                    .map(l => l.trim())
                    .filter(l => l.startsWith('×'))
                    .map(l => l.substring(1).trim());
            }
            const val = getCleanVal(id);
            return val ? [val] : [];
        };

        const valoresBrutos = getMultiVal("empreendimentoSelect");
        const idsEmpreendimentos = [...new Set(valoresBrutos.map(v => {
            const val = v.includes('__LOOKUP__') ? v.split('__LOOKUP__')[1].trim() : v.trim();
            const emp = this.empreendimentosLista.find(e => e.id === val || e.nome === val);
            return emp ? emp.id : val;
        }))];

        return {
            idsEmpreendimentos,
            outrosFiltros: {
                quadras: getMultiVal("selectQuadra"),
                status: getMultiVal("selectStatus"),
                Atividades: getMultiVal("selectAtividade"),
                zoneamentos: getMultiVal("selectZoneamento")
            }
        };
    }

    //2.Selecão de lote e preenchimento do formulário
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

            if (isComplex && el.tagName === "SELECT") {
                this._setSelectToBlank(el);
            } else {
                el.value = isComplex ? "null" : "";
            }
            this._triggerChange(el);
        };

        ["quadra_lote2", "area2", "cliente2", "corretor2", "frente2", "lateral2", "valor_metro2", "valor_total2", "indice2", "idsLotes2", "selectedCount2"].forEach(id => resetEl(id, false));
        ["atividade2", "status2", "zona2"].forEach(id => resetEl(id, true));
    }
    _fillForm() {
        if (this.selectedIds.size === 0) return this._clearForm();

        const setInput = (id, val) => {
            const el = document.getElementById(id);
            if (el) { 
                el.value = (val === undefined || val === null) ? "" : val; 
                this._triggerChange(el);
            }
        };
        
        const setBubbleDropdown = (id, val) => {
            const el = document.getElementById(id);
            if (!el) return;
            
            if (!val || val === "undefined") {
                this._setSelectToBlank(el);
            } else {
                const opt = Array.from(el.options).find(o => o.text.trim().toLowerCase() === val.toString().trim().toLowerCase());
                if (opt) el.value = opt.value;
                else this._setSelectToBlank(el);
            }
            this._triggerChange(el);
        };

        const isMulti = this.selectedIds.size > 1;
        let totalArea = 0, totalFrente = 0, totalLateral = 0, totalValor = 0;
        let nomes = [], listaClientes = [], listaCorretores = [], statusSet = new Set(), attSet = new Set(), zonaSet = new Set();

        this.selectedIds.forEach(id => {
            const lote = this.polygons[id].loteData;
            totalArea += (lote.Área || 0);
            totalFrente += (lote.Frente || 0);
            totalLateral += (lote.Lateral || 0);
            totalValor += (lote.Valor || 0);
            
            if (lote.Cliente?.trim()) listaClientes.push(lote.Cliente);
            if (lote.Corretor?.trim()) listaCorretores.push(lote.Corretor);
            
            nomes.push(lote.Lote);
            statusSet.add(lote.Status);
            attSet.add(lote.Atividade);
            zonaSet.add(lote.Zoneamento);
        });

        const cleanList = (set) => [...set].filter(v => v && v !== "undefined" && v !== "null");
        const statusList = cleanList(statusSet);
        const attList = cleanList(attSet);
        const zonaList = cleanList(zonaSet);

        setInput("quadra_lote2", nomes.length > 1 ? `Lotes: ${nomes.join(", ")}` : nomes[0]);
        setInput("area2", totalArea > 0 ? this._formatByType(totalArea, 'area') : "");
        setInput("frente2", !isMulti && totalFrente > 0 ? this._formatByType(totalFrente, 'meters') : (isMulti ? "-" : ""));
        setInput("lateral2", !isMulti && totalLateral > 0 ? this._formatByType(totalLateral, 'meters') : (isMulti ? "-" : ""));
        setInput("valor_metro2", (totalArea > 0 && totalValor > 0) ? this._formatByType(totalValor / totalArea, 'money') : "");
        setInput("valor_total2", totalValor > 0 ? this._formatByType(totalValor, 'money') : "");
        setInput("cliente2", isMulti ? `Clientes: ${listaClientes.join(", ")}` : (listaClientes[0] || ""));
        setInput("corretor2", isMulti ? `Corretores: ${listaCorretores.join(", ")}` : (listaCorretores[0] || ""));
        setInput("idsLotes2", Array.from(this.selectedIds).join(","));
        setInput("selectedCount2", this.selectedIds.size);
        
        setBubbleDropdown("status2", statusList.length === 1 ? statusList[0] : (statusList.length > 1 ? "Vários" : ""));
        setBubbleDropdown("atividade2", attList.length === 1 ? attList[0] : (attList.length > 1 ? "Vários" : ""));
        setBubbleDropdown("zona2", zonaList.length === 1 ? zonaList[0] : (zonaList.length > 1 ? "Vários" : ""));
    }
    _validarSelecaoAtual() {
        let mudou = false;
        this.selectedIds.forEach(id => {
            if (!this.polygons[id] || !this.map.hasLayer(this.polygons[id])) {
                this.selectedIds.delete(id);
                mudou = true;
            }
        });

        if (mudou) this._fillForm();
        if (this.selectedIds.size === 0) this._clearForm();
    }
    getSelectedLotesData() {
        return Array.from(this.selectedIds).map(id => this.polygons[id].loteData);
    }

    //3.Atualizações Visuais
    _atualizarElementosVisuais() {
        this._updateLegenda();
        this._updateMapVisuals();
    }
    _updateMapVisuals() {
        const hasActiveFilters = !!(this.filters.quadras.length > 0 || this.filters.status.length > 0 || this.filters.Atividades.length > 0 || this.filters.zoneamentos.length > 0);
        const hasEmpreendimentoFilter = this.filters.empreendimentos.length > 0;

        this.quadraMarkers.forEach(marker => {
            const data = marker.loteData;
            if (!hasEmpreendimentoFilter || !this.filters.empreendimentos.includes(data.Empreendimento)) {
                if (this.map.hasLayer(marker)) this.map.removeLayer(marker);
            } else {
                if (!this.map.hasLayer(marker)) this.map.addLayer(marker);
            }
        });

        Object.values(this.polygons).forEach(poly => {
            const data = poly.loteData;

            if (!hasEmpreendimentoFilter || !this.filters.empreendimentos.includes(data.Empreendimento)) {
                if (this.map.hasLayer(poly)) this.map.removeLayer(poly);
                return;
            } else {
                if (!this.map.hasLayer(poly)) this.map.addLayer(poly);
            }

            let isMatch = true;
            if (hasActiveFilters) {
                if (this.filters.quadras.length > 0) {
                    const filterQs = this.filters.quadras.map(q => q.replace(/\D/g, ''));
                    const matchQ = data.Lote.match(/Q(\d+)/i);
                    const lotQ = matchQ ? matchQ[1] : "";
                    if (!filterQs.includes(lotQ)) isMatch = false;
                }
                if (this.filters.status.length > 0) {
                    if (!this.filters.status.includes(data.Status)) isMatch = false;
                }
                if (this.filters.Atividades.length > 0) {
                    if (!this.filters.Atividades.includes(data.Atividade)) isMatch = false;
                }
                if (this.filters.zoneamentos.length > 0) {
                    if (!this.filters.zoneamentos.includes(data.Zoneamento)) isMatch = false;
                }
            }

            const theme = this._getLoteColor(data);
            const isSelected = this.selectedIds.has(data._id);

            if (isSelected) {
                poly.setStyle({ weight: 3, color: "blue", fillColor: "blue", fillOpacity: 0.7 });
                poly.bringToFront();
            } else if (!hasActiveFilters) {
                poly.setStyle({ weight: 0.8, color: "black", fillColor: theme.fill, fillOpacity: 1 });
            } else if (isMatch) {
                poly.setStyle({ weight: 1.8, color: theme.stroke, fillColor: theme.fill, fillOpacity: 1 });
                poly.bringToFront(); 
            } else {
                poly.setStyle({ weight: 0.6, color: "#e8e8e8", fillColor: theme.fill, fillOpacity: 0.55 });
            }

            poly.getTooltip()?.setContent(this._buildTooltipHTML(data));
        });
    }
    
    _updateLegenda() {
        if (!this.legendContainer) return;

        const isZona = this.filters.zonaColorMode;
        
        let items = isZona ? [
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

        // Se for modo externo, oculta a opção Vendido da legenda
        if (this.isExterno && !isZona) {
            items = items.filter(item => item.label !== "Vendido");
        }

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
    _ajustarCamera(prevEmpStr, newEmpStr) {
        // Verifica se existem polígonos de fato renderizados no mapa
        const poligonosVisiveis = Object.values(this.polygons).filter(p => this.map.hasLayer(p));
        
        // Se não houver nenhum polígono visível, não tenta centralizar
        if (poligonosVisiveis.length === 0) return;

        //Centraliza se for a primeira vez OU se o filtro de empreendimento mudou
        if (!this.hasLoadedOnce || prevEmpStr !== newEmpStr) {
            this._centralizeView();
            this.hasLoadedOnce = true;
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
    _atualizarTamanhoMapa() {
        const container = document.getElementById(this.mapId);
        if (!container) return;

        // O ResizeObserver detecta qualquer mudança no tamanho da div do mapa
        const resizeObserver = new ResizeObserver(() => {
            if (this.map) {
                // O setTimeout com 0ms garante que o DOM terminou de atualizar antes de recalcular
                setTimeout(() => {
                    this.map.invalidateSize();
                }, 0);
            }
        });

        resizeObserver.observe(container);
    }

    //4.Alteração de dados
    aplicarAlteracaoEmMassa() {
        if (this.selectedIds.size === 0) return;

        const getValSeguro = (id) => {
            const el = document.getElementById(id);
            if (!el) return "";

            if (el.tagName === "SELECT" && el.selectedIndex >= 0) {
                let text = el.options[el.selectedIndex].text.trim();
                if (!text || text.includes("...") || text.toLowerCase().includes("selecione")) return "";
                return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
            }

            let val = el.value ? el.value.replace(/"/g, '').trim() : "";
            if (!val || val === "null" || val.startsWith("BLANK") || val.startsWith("PLACEHOLDER")) {
                return "";
            }
            return val;
        };

        const newAtv = getValSeguro("dropAltMassaAtv");
        const newStat = getValSeguro("dropAltMassaStat");
        const newZon = getValSeguro("dropAltMassaZon");
        
        // Converte a string de texto com máscara (ex: R$ 1.500,00) para número (1500)
        const rawValM2 = getValSeguro("inputAltMassaValM2");
        let newValM2 = 0;
        if (rawValM2 && rawValM2 !== "-") {
            let digits = rawValM2.toString().replace(/\D/g, ''); 
            newValM2 = (parseInt(digits, 10) / 100) || 0;
        }

        this.selectedIds.forEach(id => {
            const poligono = this.polygons[id];
            if (poligono && poligono.loteData) {
                if (newAtv !== "") poligono.loteData.Atividade = newAtv;
                if (newStat !== "") poligono.loteData.Status = newStat;
                if (newZon !== "") poligono.loteData.Zoneamento = newZon;
                
                if (newValM2 > 0) {
                    poligono.loteData.ValorM2 = newValM2;
                    if (poligono.loteData.Área && poligono.loteData.Área > 0) {
                        poligono.loteData.Valor = poligono.loteData.Área * newValM2;
                    }
                }
            }
        });

        this._updateMapVisuals();
        this._fillForm(); 
    }
    excluirLotesSelecionados() {
        if (this.selectedIds.size === 0) return;

        this.selectedIds.forEach(id => {
            const poligono = this.polygons[id];
            if (poligono) {
                if (this.map.hasLayer(poligono)) this.map.removeLayer(poligono);
                delete this.polygons[id];
            }
        });

        this.allLotes = this.allLotes.filter(l => !this.selectedIds.has(l._id));
        this._clearForm();
    }
    _atualizarPoligonoSelecionado() {
        if (this.selectedIds.size !== 1) return;

        const [id] = this.selectedIds;
        const poligono = this.polygons[id];
        if(!poligono) return;

        const getVal = id => document.getElementById(id)?.value || "";
        
        // Função para capturar o texto e formatar (Garante acentos e Maiúscula)
        const getLabelFormatado = id => {
            const el = document.getElementById(id);
            if (!el || el.tagName !== "SELECT" || el.selectedIndex < 0) return "";
            const text = el.options[el.selectedIndex].text.trim();
            
            // Ignora placeholders
            if (!text || text.includes("...") || text.toLowerCase().includes("selecione")) return "";
            
            // Força Primeira letra Maiúscula e restante Minúscula
            return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        };

        const getNum = (id) => {
            let val = getVal(id);
            if (!val || val === "-") return 0;
            let digits = val.toString().replace(/\D/g, ''); 
            return (parseInt(digits, 10) / 100) || 0;
        };

        Object.assign(poligono.loteData, {
            Lote: getVal("quadra_lote2"),
            Área: getNum("area2"),
            Cliente: getVal("cliente2")?.replace(/"/g, '').trim() || "",
            Status: getLabelFormatado("status2"), 
            Atividade: getLabelFormatado("atividade2"),
            Frente: getNum("frente2"),
            Lateral: getNum("lateral2"),
            ValorM2: getNum("valor_metro2"),
            Valor: getNum("valor_total2"),
            Zoneamento: getLabelFormatado("zona2"),
            Corretor: getVal("corretor2")
        });
        
        this._updateMapVisuals();
    }

    //UTILITÁRIOS
    _triggerChange(el) {
        if (!el) return;
        try {
            el.dispatchEvent(new Event("change", { bubbles: true }));
            if (window.jQuery) window.jQuery(el).trigger('change');
        } catch (e) {}
    }
    _setSelectToBlank(el) {
        const blankOpt = Array.from(el.options).find(o => o.value.includes("BLANK") || o.text.trim() === "");
        el.value = blankOpt ? blankOpt.value : "";
    }
    _parseNum(val) {
        if (!val || val === "-") return 0;
        return (parseInt(val.toString().replace(/\D/g, ''), 10) / 100) || 0;
    }
    _formatByType(num, type) {
        const opts = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
        if (type === 'area') return num.toLocaleString('pt-BR', opts) + " m²";
        if (type === 'money') return "R$ " + num.toLocaleString('pt-BR', opts);
        if (type === 'meters') return num.toLocaleString('pt-BR', opts) + " m";
        return num;
    }
    _calcularCentroTooltip(coords) {
        let minLng = Infinity, maxLng = -Infinity;

        coords.forEach(p => {
            const lng = p[1];
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
        });

        const midLngInitial = (minLng + maxLng) / 2;
        let interseccoesLat = [];

        for (let i = 0; i < coords.length - 1; i++) {
            const [lat1, lng1] = coords[i];
            const [lat2, lng2] = coords[i + 1];

            if ((lng1 <= midLngInitial && lng2 >= midLngInitial) || (lng2 <= midLngInitial && lng1 >= midLngInitial)) {
                if (lng1 !== lng2) {
                    const latInterseccao = lat1 + (lat2 - lat1) * ((midLngInitial - lng1) / (lng2 - lng1));
                    interseccoesLat.push(latInterseccao);
                } else {
                    interseccoesLat.push(lat1, lat2);
                }
            }
        }

        if (interseccoesLat.length === 0) return L.polygon(coords).getBounds().getCenter();

        const maxLat = Math.max(...interseccoesLat);
        const minLat = Math.min(...interseccoesLat);
        const midLat = (maxLat + minLat) / 2;

        let interseccoesLng = [];

        for (let i = 0; i < coords.length - 1; i++) {
            const [lat1, lng1] = coords[i];
            const [lat2, lng2] = coords[i + 1];

            if ((lat1 <= midLat && lat2 >= midLat) || (lat2 <= midLat && lat1 >= midLat)) {
                if (lat1 !== lat2) {
                    const lngInterseccao = lng1 + (lng2 - lng1) * ((midLat - lat1) / (lat2 - lat1));
                    interseccoesLng.push(lngInterseccao);
                } else {
                    interseccoesLng.push(lng1, lng2);
                }
            }
        }

        if (interseccoesLng.length === 0) return [midLat, midLngInitial];

        const maxLngFinal = Math.max(...interseccoesLng);
        const minLngFinal = Math.min(...interseccoesLng);
        const midLngFinal = (maxLngFinal + minLngFinal) / 2;

        return [midLat, midLngFinal];
    }
    _getLoteColor(lote) {
        const mode = this.filters.zonaColorMode ? lote.Atividade?.toLowerCase() : lote.Status?.toLowerCase();
        
        // Cores atualizadas: preenchimentos mantidos suaves, bordas bem mais escuras
        const themes = {
            "comercial": { fill: "#9fbfdf", stroke: "#3b6b9e" },
            "residencial": { fill: "#dad2b4", stroke: "#8c8052" },
            "equipamento público": { fill: "#f0c9ad", stroke: "#a86c42" },
            "app": { fill: "#88c4a6", stroke: "#3d7a5b" },
            "área verde": { fill: "#88c4a6", stroke: "#3d7a5b" },
            "disponível": { fill: "lightblue", stroke: "#3a7387" }, 
            "vendido": { fill: "ForestGreen", stroke: "#0a3d0a" },
            "reservado": { fill: "#f0c9ad", stroke: "#a86c42" },
            "indisponível": { fill: "#c7c7c7", stroke: "#666666" }
        };
        
        return themes[mode] || { fill: "#c7c7c7", stroke: "#666666" };
    }
}

export function iniciarMapa(empreendimentosJSON, urlAPI, userModifyers) {
    const mapaManager = new MapaLotesManager('meuMapa', urlAPI, userModifyers);
    mapaManager.init(empreendimentosJSON);
    return mapaManager;
}