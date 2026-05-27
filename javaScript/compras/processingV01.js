export const MAX_FILE_BYTES = 3 * 1024 * 1024;

export const COL_LABELS = {
  orcamento: 'Em orçamento',
  contratacao: 'Em contratação',
  contratado: 'Contratado'
};

export function emptyCot() {
  return { fornecedor: '', valor: '', pagto: '', anexo: null };
}

export function nowStr() {
  return new Date().toISOString();
}

export function cardSummary(c) {
  const preenchidas = (c.cotacoes || []).filter(x => x && (x.fornecedor || x.valor));
  const valores = preenchidas.map(x => Number(x.valor) || 0).filter(v => v > 0);
  const menor = valores.length ? Math.min.apply(null, valores) : 0;
  return { qtd: preenchidas.length, menor: menor };
}

export function temAnexo(c) {
  return (c.cotacoes || []).some(x => x && x.anexo && x.anexo.dataUrl);
}

export function passaFiltros(c, filters) {
  if (filters.busca) {
    const q = filters.busca.toLowerCase();
    const fornecedores = (c.cotacoes || []).map(x => (x && x.fornecedor) || '').join(' ');
    const hay = (c.titulo + ' ' + (c.resp || '') + ' ' + fornecedores).toLowerCase();
    if (hay.indexOf(q) === -1) return false;
  }
  if (filters.tipo && c.tipo !== filters.tipo) return false;
  if (filters.resp && c.resp !== filters.resp) return false;
  const s = cardSummary(c);
  if (filters.valorMin && s.menor < Number(filters.valorMin)) return false;
  if (filters.valorMax && s.menor > 0 && s.menor > Number(filters.valorMax)) return false;
  if (filters.anexo === 'sim' && !temAnexo(c)) return false;
  if (filters.anexo === 'nao' && temAnexo(c)) return false;
  if (filters.prazoAte && c.prazo && c.prazo > filters.prazoAte) return false;
  return true;
}

export function temFiltroAtivo(filters) {
  return !!(filters.busca || filters.tipo || filters.resp ||
    filters.valorMin || filters.valorMax || filters.anexo || filters.prazoAte);
}

export function detectarMudancas(oldC, newDados) {
  const ev = [];
  if (oldC.titulo !== newDados.titulo) ev.push({ tipo: 'edicao', texto: 'Descrição alterada' });
  if (oldC.col !== newDados.col) ev.push({
    tipo: 'status',
    texto: 'Status alterado de "' + COL_LABELS[oldC.col] + '" para "' + COL_LABELS[newDados.col] + '"'
  });
  if (oldC.resp !== newDados.resp) ev.push({ tipo: 'edicao', texto: 'Responsável alterado' });
  if (oldC.prazo !== newDados.prazo) ev.push({ tipo: 'edicao', texto: 'Prazo alterado' });
  if (oldC.vencedora !== newDados.vencedora) {
    if (newDados.vencedora >= 0) {
      const f = newDados.cotacoes[newDados.vencedora].fornecedor || ('cotação ' + (newDados.vencedora + 1));
      ev.push({
        tipo: 'select',
        texto: 'Cotação ' + (newDados.vencedora + 1) + ' (' + f + ') selecionada como vencedora'
      });
    } else {
      ev.push({ tipo: 'select', texto: 'Seleção de cotação removida' });
    }
  }
  return ev;
}