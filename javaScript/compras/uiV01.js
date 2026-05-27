export function $(sel) { return document.querySelector(sel); }
export function $$(sel) { return document.querySelectorAll(sel); }

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function fmtBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 2
  });
}

export function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

export function switchTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $('#tab-detalhes').style.display = name === 'detalhes' ? 'block' : 'none';
  $('#tab-historico').classList.toggle('show', name === 'historico');
  $('#tab-historico').style.display = name === 'historico' ? 'block' : 'none';
}

export function updateAprovarButton(workingVencedora) {
  const btn = $('#btn-aprovar');
  const colAtual = $('#f-col').value;
  if (workingVencedora >= 0 && colAtual !== 'contratado') {
    btn.classList.add('show');
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i> Aprovar cotação';
  } else if (workingVencedora >= 0 && colAtual === 'contratado') {
    btn.classList.add('show');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i> Já contratado';
  } else {
    btn.classList.remove('show');
  }
}