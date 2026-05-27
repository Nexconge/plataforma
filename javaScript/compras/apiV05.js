export const API_URL = "https://backend-plataforma-producao.onrender.com/ordens-compra";

function authHeaders(extra = {}) {
  const token = window.AUTH_TOKEN || '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...extra
  };
}

export function waitForAuthToken(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (window.AUTH_TOKEN && window.AUTH_TOKEN.length > 10) {
      return resolve(window.AUTH_TOKEN);
    }
    const start = Date.now();
    const iv = setInterval(() => {
      if (window.AUTH_TOKEN && window.AUTH_TOKEN.length > 10) {
        clearInterval(iv);
        resolve(window.AUTH_TOKEN);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(iv);
        reject(new Error('Token não foi disponibilizado a tempo'));
      }
    }, 100);
  });
}

async function handle(res) {
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).detail || ''; } catch (_) {}
    throw new Error(`HTTP ${res.status}${detail ? ` - ${detail}` : ''}`);
  }
  return res.json();
}

export async function fetchOrdens() {
  const res = await fetch(API_URL, { headers: authHeaders() });
  return handle(res);
}

export async function saveOrdem(method, url, payload) {
  const res = await fetch(url, {
    method,
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
  return handle(res);
}

export async function deleteOrdem(id) {
  const res = await fetch(`${API_URL}/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return handle(res);
}

// IMPORTANTE: agora envia apenas o evento novo, não o histórico inteiro
export async function updateOrdemStatus(id, novoStatus, novoEvento) {
  const res = await fetch(`${API_URL}/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({
      status: novoStatus,
      novo_evento: {
        data_hora: novoEvento.ts,
        tipo: novoEvento.tipo,
        texto: novoEvento.texto
      }
    })
  });
  return handle(res);
}
