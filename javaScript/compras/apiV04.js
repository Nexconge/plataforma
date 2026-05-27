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

export async function fetchOrdens() {
  const res = await fetch(API_URL, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function saveOrdem(method, url, payload) {
  return await fetch(url, {
    method,
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
}

export async function deleteOrdem(id) {
  return await fetch(`${API_URL}/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
}

export async function updateOrdemStatus(id, newStatus, historico) {
  return await fetch(`${API_URL}/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status: newStatus, historico })
  });
}