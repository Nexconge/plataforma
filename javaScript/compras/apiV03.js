export const API_URL = "https://backend-plataforma-producao.onrender.com/ordens-compra";

function authHeaders(extra = {}) {
  const token = window.AUTH_TOKEN || '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...extra
  };
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