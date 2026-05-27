export const API_URL = "https://backend-plataforma-producao.onrender.com/ordens-compra/";

export async function fetchOrdens() {
  const res = await fetch(API_URL);
  return await res.json();
}

export async function saveOrdem(method, url, payload) {
  return await fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function deleteOrdem(id) {
  return await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
}

export async function updateOrdemStatus(id, newStatus, historico) {
  return await fetch(`${API_URL}/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus, historico: historico })
  });
}