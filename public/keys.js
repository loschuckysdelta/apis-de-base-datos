'use strict';
const el = id => document.getElementById(id);
const STORAGE_LAST = 'loschuckys_keys_last_v1';

function showCode(result) {
  const root = el('generatedResult');
  root.classList.remove('error');
  root.replaceChildren();
  const code = document.createElement('span');
  code.className = 'code';
  code.textContent = result.key;
  const status = document.createElement('span');
  status.className = 'pill';
  status.textContent = result.estado || 'Código generado';
  root.append(code, status);
}

async function postJSON(url, data, extraHeaders = {}) {
  const response = await fetch(url, {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || `Error HTTP ${response.status}`);
  return result;
}

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_LAST) || 'null');
  if (saved && /^\d{6}$/.test(saved.key)) showCode(saved);
} catch { el('generatedResult').textContent = 'No se pudo acceder a la caché de este navegador.'; }

el('generateForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = el('generateBtn'); button.disabled = true;
  el('generatedResult').textContent = 'Consultando MongoDB…';
  try {
    const data = await postJSON('/api/keys/generar', {});
    showCode(data);
    localStorage.setItem(STORAGE_LAST, JSON.stringify(data));
    el('redeemKey').value = data.key;
  } catch (error) {
    el('generatedResult').textContent = error.message;
    el('generatedResult').classList.add('error');
  } finally { button.disabled = false; }
});

el('redeemForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = el('redeemBtn'); button.disabled = true;
  el('redeemResult').textContent = 'Comprobando código…';
  try {
    const usuarioId = el('userId').value.trim();
    const data = await postJSON('/api/keys/canjear', {
      key: el('redeemKey').value.trim(),
      ...(usuarioId ? { usuarioId } : {})
    });
    el('redeemResult').textContent = `${data.message} · ${new Date(data.redeemedAt).toLocaleString('es-PE')}`;
    el('redeemResult').classList.remove('error');
    const previous = JSON.parse(localStorage.getItem(STORAGE_LAST) || 'null');
    if (previous?.key === el('redeemKey').value.trim()) {
      previous.estado = 'canjeada';
      localStorage.setItem(STORAGE_LAST, JSON.stringify(previous));
      showCode(previous);
    }
  } catch (error) {
    el('redeemResult').textContent = error.message;
    el('redeemResult').classList.add('error');
  } finally { button.disabled = false; }
});
