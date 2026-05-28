import { API_URL, fetchOrdens, saveOrdem, deleteOrdem, updateOrdemStatus, waitForAuthToken } from './apiV05.js';
import { MAX_FILE_BYTES, COL_LABELS, emptyCot, nowStr, cardSummary, temAnexo, passaFiltros, temFiltroAtivo, detectarMudancas } from './processingV01.js';
import { $, $$, fmtDate, fmtBRL, escapeHtml, switchTab, updateAprovarButton } from './uiV01.js';

let cards = [];
let dragId = null;
let editingId = null;
let workingCotacoes = [emptyCot(), emptyCot(), emptyCot()];
let workingVencedora = -1;
let workingHistorico = [];
let filters = {
  busca: '', tipo: '', resp: '', valorMin: '', valorMax: '', anexo: '', prazoAte: ''
};

async function loadCards() {
  try {
    const dbCards = await fetchOrdens();
    cards = dbCards.map(c => ({
      id: c.id_ordem_compra,
      titulo: c.titulo,
      tipo: c.tipo,
      col: c.status,
      resp: c.responsavel,
      prazo: c.prazo || '',
      obs: c.observacoes || '',
      cotacoes: c.cotacoes && c.cotacoes.length > 0 ? c.cotacoes.map(cot => ({
        fornecedor: cot.fornecedor,
        valor: cot.valor,
        pagto: cot.condicao_pagamento,
        anexo: cot.anexo_nome ? { name: cot.anexo_nome, dataUrl: cot.anexo_dados } : null
      })) : [emptyCot(), emptyCot(), emptyCot()],
      vencedora: c.cotacoes ? c.cotacoes.findIndex(cot => cot.vencedora) : -1,
      historico: c.historico ? c.historico.map(h => ({
        ts: h.data_hora, tipo: h.tipo, texto: h.texto
      })) : []
    }));
  } catch (e) {
    console.error('Erro ao carregar ordens:', e);
    cards = [];
  }

  cards.forEach(c => {
    while (c.cotacoes.length < 3) c.cotacoes.push(emptyCot());
    if (c.vencedora === -1) c.vencedora = -1;
  });
  render();
}

function refreshRespFilter() {
  const sel = $('#f-resp-filter');
  const cur = sel.value;
  const unique = Array.from(new Set(cards.map(c => c.resp).filter(Boolean))).sort();
  sel.innerHTML = '<option value="">Todos responsáveis</option>' +
    unique.map(r => `<option value="${escapeHtml(r)}"${r === cur ? ' selected' : ''}>${escapeHtml(r)}</option>`).join('');
}

function render() {
  refreshRespFilter();
  const visiveis = cards.filter(c => passaFiltros(c, filters));

  $$('.drop-zone').forEach(z => z.innerHTML = '');
  visiveis.forEach(c => {
    const zone = document.querySelector(`.drop-zone[data-col="${c.col}"]`);
    if (!zone) return;
    const el = document.createElement('div');
    el.className = 'card';
    el.draggable = true;
    el.dataset.id = c.id;
    const tipoLabel = c.tipo === 'material' ? 'Material' : 'Serviço';
    const tipoCls = c.tipo === 'material' ? 'badge-material' : 'badge-servico';
    const s = cardSummary(c);
    const venc = c.vencedora >= 0 ? c.cotacoes[c.vencedora] : null;

    let valorBlock = '';
    if (venc && venc.valor) {
      valorBlock = `<div class="card-value">${fmtBRL(venc.valor)} <span class="vencedora-mark"><i class="ti ti-check" aria-hidden="true"></i>vencedora</span></div>`;
    } else if (s.menor > 0) {
      valorBlock = `<div class="card-value">${fmtBRL(s.menor)} <span style="font-size:10px;color:var(--color-text-secondary);font-weight:400;">menor cotação</span></div>`;
    }

    el.innerHTML = `<p class="card-title">${escapeHtml(c.titulo)}</p>
      <div class="card-meta">
        <span class="badge ${tipoCls}">${tipoLabel}</span>
        <span class="cot-mini"><i class="ti ti-file-invoice" aria-hidden="true"></i>${s.qtd}/3 cotações</span>
        ${temAnexo(c) ? '<span class="cot-mini"><i class="ti ti-paperclip" aria-hidden="true"></i></span>' : ''}
      </div>
      ${valorBlock}
      ${c.resp ? `<div class="card-meta"><i class="ti ti-user" aria-hidden="true"></i><span>${escapeHtml(c.resp)}</span></div>` : ''}`;

    zone.appendChild(el);
  });

  $$('.col').forEach(col => {
    col.querySelector('.count').textContent = visiveis.filter(c => c.col === col.dataset.col).length;
  });

  const contador = $('#contador');
  const btnLimpar = $('#btn-limpar');
  if (temFiltroAtivo(filters)) {
    contador.classList.add('show');
    contador.textContent = `Exibindo ${visiveis.length} de ${cards.length} ordens`;
    btnLimpar.style.display = 'inline-flex';
  } else {
    contador.classList.remove('show');
    btnLimpar.style.display = 'none';
  }

  attachCardHandlers();
}

function attachCardHandlers() {
  $$('.card').forEach(card => {
    let didDrag = false;
    card.addEventListener('dragstart', e => {
      dragId = card.dataset.id;
      didDrag = true;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      dragId = null;
      $$('.drop-zone').forEach(z => z.classList.remove('drag-over'));
      setTimeout(() => { didDrag = false; }, 50);
    });
    card.addEventListener('click', () => {
      if (didDrag) return;
      openModal(card.dataset.id);
    });
  });
}

$$('.drop-zone').forEach(zone => {
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', e => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
  });
  zone.addEventListener('drop', async e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (!dragId) return;

    const newCol = zone.dataset.col;
    const card = cards.find(c => c.id == dragId);
    if (!card || card.col === newCol) return;

    const novoEvento = {
      ts: nowStr(),
      tipo: 'status',
      texto: `Status alterado de "${COL_LABELS[card.col]}" para "${COL_LABELS[newCol]}"`
    };

    const colAnterior = card.col;
    card.col = newCol;
    card.historico = card.historico || [];
    card.historico.push(novoEvento);
    render();

    try {
      await updateOrdemStatus(dragId, newCol, novoEvento);
      await loadCards();
    } catch (err) {
      // Reverte em caso de erro
      console.error('Falha ao atualizar status:', err);
      card.col = colAnterior;
      card.historico.pop();
      render();
      alert('Não foi possível mover a ordem. Tente novamente.');
    }
  });
});

function renderCotacoes() {
  const wrap = $('#cotacoes-wrap');
  wrap.innerHTML = '';
  workingCotacoes.forEach((cot, idx) => {
    const grp = document.createElement('div');
    grp.className = 'cot-group' + (workingVencedora === idx ? ' selected' : '');
    const summary = cot.fornecedor || (cot.valor ? fmtBRL(cot.valor) : 'vazio');

    grp.innerHTML = `
      <div class="cot-head" data-toggle="${idx}">
        <div class="cot-head-left">
          <span class="cot-chevron"><i class="ti ti-chevron-down" aria-hidden="true"></i></span>
          <span>Cotação ${idx + 1}</span>
          ${workingVencedora === idx ? '<span class="selected-badge"><i class="ti ti-check" aria-hidden="true"></i> vencedora</span>' : ''}
        </div>
        <div class="cot-head-right">
          <label class="cot-check" data-no-toggle="1">
            <input type="checkbox" data-select="${idx}" ${workingVencedora === idx ? 'checked' : ''} /> Selecionar
          </label>
          <span class="cot-summary">${escapeHtml(summary)}</span>
        </div>
      </div>
      <div class="cot-body">
        <div class="cot-grid">
          <div><label class="lbl">Fornecedor</label><input type="text" data-cot="${idx}" data-field="fornecedor" value="${escapeHtml(cot.fornecedor || '')}" /></div>
          <div><label class="lbl">Valor total (R$)</label><input type="number" step="0.01" data-cot="${idx}" data-field="valor" value="${cot.valor || ''}" /></div>
          <div class="full"><label class="lbl">Condição de pagamento</label><input type="text" data-cot="${idx}" data-field="pagto" value="${escapeHtml(cot.pagto || '')}" placeholder="Ex.: 30/60 dias" /></div>
        </div>
        <div class="anexo-row" data-anexo-row="${idx}"></div>
      </div>`;
    wrap.appendChild(grp);
    renderAnexo(idx);
  });

  wrap.querySelectorAll('.cot-head').forEach(h => {
    h.addEventListener('click', e => {
      if (e.target.closest('[data-no-toggle]') || e.target.tagName === 'INPUT') return;
      h.parentElement.classList.toggle('open');
    });
  });

  wrap.querySelectorAll('input[data-select]').forEach(inp => {
    inp.addEventListener('change', () => {
      const i = parseInt(inp.dataset.select, 10);
      const cot = workingCotacoes[i];
      if (inp.checked) {
        if (!cot.fornecedor && !cot.valor) {
          inp.checked = false;
          return;
        }
        workingVencedora = i;
      } else {
        workingVencedora = -1;
      }
      renderCotacoes();
      updateAprovarButton(workingVencedora);
    });
  });

  wrap.querySelectorAll('input[data-cot]').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.cot, 10);
      const f = inp.dataset.field;
      let val = inp.value;
      if (f === 'valor') val = parseFloat(val) || 0;
      workingCotacoes[i][f] = val;
      const heads = wrap.querySelectorAll('.cot-summary');
      if (heads[i]) heads[i].textContent = workingCotacoes[i].fornecedor || (workingCotacoes[i].valor ? fmtBRL(workingCotacoes[i].valor) : 'vazio');
      updateAprovarButton(workingVencedora);
    });
  });
}

function renderAnexo(idx) {
  const row = document.querySelector(`[data-anexo-row="${idx}"]`);
  if (!row) return;
  const cot = workingCotacoes[idx];
  row.innerHTML = '';

  if (cot.anexo && cot.anexo.dataUrl) {
    const link = document.createElement('a');
    link.href = cot.anexo.dataUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'anexo-link';
    link.innerHTML = `<i class="ti ti-paperclip" aria-hidden="true"></i><span class="anexo-name">${escapeHtml(cot.anexo.name)}</span><i class="ti ti-external-link" aria-hidden="true"></i>`;
    row.appendChild(link);

    const rm = document.createElement('button');
    rm.className = 'anexo-remove';
    rm.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
    rm.addEventListener('click', e => {
      e.preventDefault();
      const oldName = workingCotacoes[idx].anexo ? workingCotacoes[idx].anexo.name : '';
      workingCotacoes[idx].anexo = null;
      workingHistorico.push({ ts: nowStr(), tipo: 'anexo', texto: `Anexo removido da cotação ${idx + 1} ${oldName ? `(${oldName})` : ''}` });
      renderAnexo(idx);
    });
    row.appendChild(rm);
  } else {
    const btn = document.createElement('button');
    btn.className = 'upload-btn';
    btn.innerHTML = '<i class="ti ti-upload" aria-hidden="true"></i> Anexar cotação';
    const inputFile = document.createElement('input');
    inputFile.type = 'file';
    inputFile.style.display = 'none';
    inputFile.accept = '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx';

    btn.addEventListener('click', e => { e.preventDefault(); inputFile.click(); });
    inputFile.addEventListener('change', () => {
      const file = inputFile.files && inputFile.files[0];
      if (!file || file.size > MAX_FILE_BYTES) return;
      const reader = new FileReader();
      reader.onload = () => {
        workingCotacoes[idx].anexo = { name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataUrl: reader.result };
        workingHistorico.push({ ts: nowStr(), tipo: 'anexo', texto: `Anexo enviado na cotação ${idx + 1} (${file.name})` });
        renderAnexo(idx);
      };
      reader.readAsDataURL(file);
    });

    row.appendChild(btn);
    row.appendChild(inputFile);
    row.insertAdjacentHTML('beforeend', '<span class="anexo-hint">PDF, imagem ou documento até 3 MB</span>');
  }
}

function renderHistorico() {
  const wrap = $('#tab-historico');
  if (!workingHistorico.length) {
    wrap.innerHTML = '<div class="empty-state"><i class="ti ti-history" aria-hidden="true"></i>Nenhum evento registrado ainda</div>';
    return;
  }
  const ordenado = workingHistorico.slice().sort((a, b) => b.ts.localeCompare(a.ts));
  const iconMap = {
    criacao: { icon: 'ti-plus', cls: 'info' },
    status: { icon: 'ti-arrow-right', cls: 'info' },
    select: { icon: 'ti-target', cls: 'warn' },
    aprovacao: { icon: 'ti-check', cls: 'success' },
    anexo: { icon: 'ti-paperclip', cls: '' },
    edicao: { icon: 'ti-edit', cls: '' }
  };
  wrap.innerHTML = '<div class="timeline">' + ordenado.map(ev => {
    const m = iconMap[ev.tipo] || { icon: 'ti-circle-dot', cls: '' };
    return `<div class="tl-item"><div class="tl-dot ${m.cls}"><i class="ti ${m.icon}" aria-hidden="true"></i></div><div class="tl-text">${escapeHtml(ev.texto)}</div><div class="tl-time">${fmtDate(ev.ts)}</div></div>`;
  }).join('') + '</div>';
}

function openModal(id) {
  editingId = id || null;
  const c = id ? cards.find(x => x.id == id) : null;
  $('#modal-titulo').textContent = c ? 'Editar ordem de compra' : 'Nova ordem de compra';
  $('#f-titulo').value = c ? c.titulo : '';
  $('#f-tipo').value = c ? c.tipo : 'material';
  $('#f-col').value = c ? c.col : 'orcamento';
  $('#f-resp').value = c ? (c.resp || '') : '';
  $('#f-prazo').value = c ? (c.prazo || '') : '';
  $('#f-obs').value = c ? (c.obs || '') : '';

  if (c && Array.isArray(c.cotacoes)) {
    workingCotacoes = c.cotacoes.slice(0, 3).map(x => ({ fornecedor: x.fornecedor || '', valor: x.valor || '', pagto: x.pagto || '', anexo: x.anexo || null }));
    while (workingCotacoes.length < 3) workingCotacoes.push(emptyCot());
    workingVencedora = typeof c.vencedora === 'number' ? c.vencedora : -1;
    workingHistorico = Array.isArray(c.historico) ? c.historico.slice() : [];
  } else {
    workingCotacoes = [emptyCot(), emptyCot(), emptyCot()];
    workingVencedora = -1;
    workingHistorico = [];
  }
  renderCotacoes();
  updateAprovarButton(workingVencedora);

  $('#hist-count').textContent = workingHistorico.length ? `(${workingHistorico.length})` : '';
  renderHistorico();
  switchTab('detalhes');
  $('#btn-excluir').classList.toggle('show', !!c);
  $('#modal-bg').classList.add('show');
}

function closeModal() {
  $('#modal-bg').classList.remove('show');
  editingId = null;
}
  
window.initKanban = function() {
  if (!$('#f-col')) {
      console.warn("HTML do Kanban ainda não foi carregado.");
      return;
  }

  $('#f-col').addEventListener('change', () => updateAprovarButton(workingVencedora));
  $('#btn-novo').addEventListener('click', () => openModal(null));
  $('#btn-fechar').addEventListener('click', closeModal);
  $('#btn-cancelar').addEventListener('click', closeModal);
  $('#modal-bg').addEventListener('click', e => { if (e.target === $('#modal-bg')) closeModal(); });

  $$('.tab').forEach(t => t.addEventListener('click', () => {
    switchTab(t.dataset.tab);
    if (t.dataset.tab === 'historico') renderHistorico();
  }));

  $('#btn-salvar').addEventListener('click', () => {
    const titulo = $('#f-titulo').value.trim();
    if (!titulo) return;
    $('#btn-salvar').disabled = true;

    const dados = {
      titulo: titulo, tipo: $('#f-tipo').value, col: $('#f-col').value, resp: $('#f-resp').value.trim(),
      prazo: $('#f-prazo').value, obs: $('#f-obs').value.trim(),
      cotacoes: workingCotacoes.map(x => ({ fornecedor: x.fornecedor || '', valor: Number(x.valor) || 0, pagto: x.pagto || '', anexo: x.anexo || null })),
      vencedora: workingVencedora, historico: workingHistorico.slice()
    };

    let method = 'POST';
    let url = API_URL;
    if (editingId) {
      method = 'PUT';
      url = `${API_URL}/${editingId}`;
      const c = cards.find(x => x.id == editingId);
      if (c) detectarMudancas(c, dados).forEach(ev => dados.historico.push({ ts: nowStr(), tipo: ev.tipo, texto: ev.texto }));
    } else {
      dados.historico.push({ ts: nowStr(), tipo: 'criacao', texto: 'Ordem criada' });
    }

    const payload = {
      id: editingId, 
      titulo: dados.titulo, tipo: dados.tipo, status: dados.col, responsavel: dados.resp, prazo: dados.prazo || null, observacoes: dados.obs,
      cotacoes: dados.cotacoes.map((cot, index) => ({ fornecedor: cot.fornecedor, valor: cot.valor, condicao_pagamento: cot.pagto, anexo_nome: cot.anexo ? cot.anexo.name : null, anexo_dados: cot.anexo ? cot.anexo.dataUrl : null, vencedora: index === dados.vencedora })),
      historico: dados.historico.map(h => ({ data_hora: h.ts, tipo: h.tipo, texto: h.texto }))
    };

    saveOrdem(method, url, payload).then(() => {
      loadCards();
      closeModal();
      $('#btn-salvar').disabled = false;
    });
  });

  $('#btn-aprovar').addEventListener('click', () => {
    if (workingVencedora < 0) return;
    $('#f-col').value = 'contratado';
    workingHistorico.push({ ts: nowStr(), tipo: 'aprovacao', texto: `Cotação aprovada — ordem movida para Contratado` });
    $('#btn-salvar').click();
  });

  $('#btn-excluir').addEventListener('click', () => {
    if (!editingId) return;
    if (confirm('Tem certeza que deseja excluir esta ordem?')) {
      deleteOrdem(editingId).then(() => {
        loadCards();
        closeModal();
      });
    }
  });

  // Filtros
  $('#f-busca').addEventListener('input', e => { filters.busca = e.target.value; render(); });
  $$('#chips-tipo .chip').forEach(ch => ch.addEventListener('click', () => { $$('#chips-tipo .chip').forEach(c => c.classList.remove('active')); ch.classList.add('active'); filters.tipo = ch.dataset.tipo; render(); }));
  $('#f-resp-filter').addEventListener('change', e => { filters.resp = e.target.value; render(); });
  $('#f-valor-min').addEventListener('input', e => { filters.valorMin = e.target.value; render(); });
  $('#f-valor-max').addEventListener('input', e => { filters.valorMax = e.target.value; render(); });
  $('#f-anexo').addEventListener('change', e => { filters.anexo = e.target.value; render(); });
  $('#f-prazo-ate').addEventListener('input', e => { filters.prazoAte = e.target.value; render(); });
  $('#btn-mais-filtros').addEventListener('click', () => $('#mais-filtros').classList.toggle('show'));
  $('#btn-limpar').addEventListener('click', () => {
    filters = { busca: '', tipo: '', resp: '', valorMin: '', valorMax: '', anexo: '', prazoAte: '' };
    $('#f-busca').value = ''; $('#f-resp-filter').value = ''; $('#f-valor-min').value = ''; $('#f-valor-max').value = ''; $('#f-anexo').value = ''; $('#f-prazo-ate').value = '';
    $$('#chips-tipo .chip').forEach(c => c.classList.toggle('active', c.dataset.tipo === ''));
    render();
  });
  
  console.log("Kanban inicializado com sucesso.");
};

async function boot() {
  window.initKanban();
  try {
    await waitForAuthToken();   // ← espera o Bubble injetar o JWT
    await loadCards();
  } catch (e) {
    console.error('Falha ao autenticar:', e);
  }
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}