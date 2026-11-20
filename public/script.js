'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  view: 'dashboard',
  users: { page: 1, pages: 1, total: 0, limit: 10, status: 'todos', query: '' },
  contacts: { page: 1, pages: 1, total: 0, limit: 20, query: '' },
  banned: { page: 1, pages: 1, total: 0, limit: 10, query: '' },
  stats: { total: 0, activos: 0, bloqueados: 0, contactos: 0, nuevosHoy: 0 }
};

const viewMeta = {
  dashboard: ['Dashboard', 'Resumen general de usuarios de Telegram'],
  usuarios: ['Usuarios', 'Consulta y filtra los usuarios guardados en MongoDB'],
  contactos: ['Contactos', 'Consulta la base de contactos y elimina registros'],
  baneados: ['Baneados', 'Administra los usuarios bloqueados desde la API de usuarios'],
  importar: ['Importar contactos', 'Agrega contactos manualmente o desde un archivo TXT'],
  vip: ['VIP Telegram', 'Registra enlaces de tu bot y administra membresías sin expulsiones'],
  apis: ['APIs', 'Documentación y probador de endpoints disponibles']
};

const apiDefinitions = [
  { method: 'POST', path: '/api/verificar', description: 'Registra la confirmación de visita de un usuario existente, sin token de Telegram. Dura 24 horas.', body: { telegramId: '123456789' } },
  { method: 'GET', path: '/api/verificar?telegramId=123456789', description: 'Consulta el estado por ID de Telegram, sin token.' },
  { method: 'GET', path: '/api/verificar/registros', description: 'Listado privado para administrador; requiere VERIFICAR_ADMIN_SECRET (opcional).' },
  { method: 'GET', path: '/api/users', description: 'Lista usuarios con paginación y filtros.' },
  { method: 'GET', path: '/api/users?buscar=lenin', description: 'Busca por ID, nombre o username.' },
  { method: 'POST', path: '/api/users', description: 'Registra o actualiza un usuario.', body: { telegramId: 123456789, nombre: 'Lenin', username: 'loschuckys_pe' } },
  { method: 'GET', path: '/api/baneados', description: 'Lista los usuarios baneados usando la colección de usuarios.' },
  { method: 'GET', path: '/api/baneados?telegramId=123456789', description: 'Comprueba si un usuario está baneado.' },
  { method: 'POST', path: '/api/baneados', description: 'Banea un usuario existente.', body: { telegramId: 123456789, motivo: 'Spam', baneadoPor: 'Panel CHUCKY' } },
  { method: 'DELETE', path: '/api/baneados?telegramId=123456789', description: 'Quita el baneo a un usuario.' },
  { method: 'GET', path: '/api/contactos', description: 'Lista contactos con paginación.' },
  { method: 'GET', path: '/api/contactos?buscar=gab_12_11', description: 'Busca por ID, username, nombre o teléfono.' },
  { method: 'POST', path: '/api/contactos', description: 'Guarda o actualiza un contacto y corrige campos invertidos si el patrón es seguro.', body: { telegramId: 1580740128, username: 'gab_12_11', nombre: 'G.', telefono: '51971386003' } },
  { method: 'POST', path: '/api/contactos/corregir', description: 'Vista previa/corrección masiva de ID Telegram y teléfono invertidos.', body: { aplicar: false } },
  { method: 'DELETE', path: '/api/contactos?telegramId=1580740128', description: 'Elimina un contacto por ID Telegram.' },
  { method: 'GET', path: '/api/vip', description: 'Lista membresías VIP con su estado actual.' },
  { method: 'POST', path: '/api/vip', description: 'Registra una membresía VIP con días personalizados o acceso permanente.', body: { telegram_user_id: 123456789, telegram_username: 'cliente123', days: 220, permanent: false } },
  { method: 'GET', path: '/api/vip/123456789', description: 'Consulta la membresía VIP más reciente de un usuario.' },
  { method: 'PATCH', path: '/api/vip/123456789', description: 'Edita o suma días a una membresía VIP.', body: { days: 30, operation: 'add', permanent: false } },
  { method: 'POST', path: '/api/vip/renew', description: 'Renueva una membresía VIP.', body: { telegram_user_id: 123456789, days: 30 } },
  { method: 'POST', path: '/api/vip/expire', description: 'Actualiza estados de membresías vencidas, sin expulsar usuarios.', body: {} },
  { method: 'GET', path: '/api/stats', description: 'Obtiene estadísticas generales.' },
  { method: 'GET', path: '/api/health', description: 'Comprueba el estado de API y MongoDB.' }
];

const TXT_MAX_BYTES = 5 * 1024 * 1024;
const TXT_MAX_RECORDS = 20000;
const TXT_BATCH_SIZE = 500;
let toastTimer;
let usersSearchTimer;
let contactsSearchTimer;
let bannedSearchTimer;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('es-PE');
}

function formatDate(value) {
  // Las fechas de MongoDB se guardan en UTC y siempre se muestran en hora de Perú.
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(parsed);
}

function toast(message, type = 'normal') {
  const element = $('#toast');
  if (!element) return;
  clearTimeout(toastTimer);
  element.textContent = message;
  element.className = `toast show${type === 'error' ? ' error' : ''}`;
  toastTimer = setTimeout(() => element.classList.remove('show'), 2600);
}

function setCurrentDate() {
  const element = $('#currentDate');
  if (!element) return;
  element.textContent = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date());
}

async function requestJSON(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 20000);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      ...options,
      signal: options.signal || controller.signal,
      headers: { Accept: 'application/json', ...(options.headers || {}) }
    });
    const text = await response.text();
    let data = {};
    if (text) {
      try { data = JSON.parse(text); }
      catch { throw new Error(`Respuesta inválida del servidor (${response.status})`); }
    }
    if (!response.ok) throw new Error(data.error || data.message || `Error HTTP ${response.status}`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('La solicitud tardó demasiado en responder');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function userStatusBadge(user) {
  return user.botBloqueado
    ? '<span class="status-badge blocked">Bloqueado</span>'
    : '—';
}

function renderUserRows(users) {
  if (!users.length) return '<tr><td colspan="7" class="empty-cell">No hay usuarios para mostrar.</td></tr>';
  return users.map(user => `
    <tr>
      <td>${escapeHtml(user.telegramId)}</td>
      <td>${escapeHtml(user.nombre || '—')}</td>
      <td>${user.username ? '@' + escapeHtml(user.username.replace(/^@/, '')) : '—'}</td>
      <td>${userStatusBadge(user)}</td>
      <td>${formatDate(user.fechaRegistro)}</td>
      <td>${formatDate(user.ultimaActividad || user.ultimaActualizacion)}</td>
      <td><button class="edit-user-btn" type="button" data-edit-user="${escapeHtml(user.telegramId)}" title="Editar estado" aria-label="Editar usuario">✎</button></td>
    </tr>`).join('');
}

function renderBannedRows(users) {
  if (!users.length) return '<tr><td colspan="6" class="empty-cell">No hay usuarios baneados.</td></tr>';
  return users.map(user => `
    <tr>
      <td>${escapeHtml(user.telegramId)}</td>
      <td>${escapeHtml(user.nombre || '—')}</td>
      <td>${user.username ? '@' + escapeHtml(user.username.replace(/^@/, '')) : '—'}</td>
      <td>${escapeHtml(user.motivoBloqueo || 'Sin motivo')}</td>
      <td>${formatDate(user.fechaBloqueo)}</td>
      <td><button class="edit-user-btn" type="button" data-edit-user="${escapeHtml(user.telegramId)}" title="Editar baneo" aria-label="Editar baneo">✎</button></td>
    </tr>`).join('');
}

function renderContactRows(contacts) {
  if (!contacts.length) return '<tr><td colspan="6" class="empty-cell">No hay contactos para mostrar.</td></tr>';
  return contacts.map(contact => `
    <tr>
      <td>${escapeHtml(contact.telegramId)}</td>
      <td>${contact.username ? '@' + escapeHtml(contact.username.replace(/^@/, '')) : '—'}</td>
      <td>${escapeHtml(contact.nombre || 'Sin nombre')}</td>
      <td>${escapeHtml(contact.telefono || '—')}</td>
      <td>${formatDate(contact.fechaRegistro)}</td>
      <td><button class="delete-btn" type="button" data-delete-contact="${escapeHtml(contact.telegramId)}">Eliminar</button></td>
    </tr>`).join('');
}

function setTableError(bodySelector, message) {
  const body = $(bodySelector);
  if (body) body.innerHTML = `<tr><td colspan="6" class="error-cell">${escapeHtml(message)}</td></tr>`;
}

function pageNumbers(current, pages) {
  const result = [];
  if (pages <= 5) {
    for (let page = 1; page <= pages; page++) result.push(page);
    return result;
  }
  let start = Math.max(1, current - 2);
  let end = Math.min(pages, start + 4);
  start = Math.max(1, end - 4);
  for (let page = start; page <= end; page++) result.push(page);
  return result;
}

function renderPager(kind) {
  const data = state[kind];
  const prefix = kind;
  const first = $(`#${prefix}First`);
  const prev = $(`#${prefix}Prev`);
  const next = $(`#${prefix}Next`);
  const last = $(`#${prefix}Last`);
  const buttons = $(`#${prefix}PageButtons`);
  if (!first || !prev || !next || !last || !buttons) return;

  first.disabled = prev.disabled = data.page <= 1;
  next.disabled = last.disabled = data.page >= data.pages;
  buttons.innerHTML = pageNumbers(data.page, data.pages).map(page =>
    `<button type="button" class="${page === data.page ? 'active' : ''}" data-${prefix}-page="${page}">${page}</button>`
  ).join('');
}

async function loadStats() {
  try {
    const data = await requestJSON('/api/stats');
    state.stats = data;
    $('#totalUsers').textContent = formatNumber(data.total);
    $('#totalContacts').textContent = formatNumber(data.contactos);
    $('#blockedUsers').textContent = formatNumber(data.bloqueados);
    $('#newToday').textContent = formatNumber(data.nuevosHoy);
  } catch (error) {
    toast(`Estadísticas: ${error.message}`, 'error');
  }
}

async function loadDashboardUsers() {
  const body = $('#dashboardUsersBody');
  const summary = $('#dashboardUsersSummary');
  if (!body || !summary) return;
  body.innerHTML = '<tr><td colspan="7" class="loading-cell">Cargando usuarios…</td></tr>';
  try {
    const params = new URLSearchParams({ page: '1', limit: '10', estado: 'todos' });
    const data = await requestJSON(`/api/users?${params}`);
    body.innerHTML = renderUserRows(Array.isArray(data.usuarios) ? data.usuarios : []);
    const visible = Math.min(Number(data.total || 0), 10);
    summary.textContent = `Mostrando ${formatNumber(visible)} de ${formatNumber(data.total)} usuario(s)`;
  } catch (error) {
    setTableError('#dashboardUsersBody', `Error al cargar usuarios: ${error.message}`);
    summary.textContent = 'No se pudieron cargar los usuarios.';
  }
}

async function loadUsers() {
  const dataState = state.users;
  const params = new URLSearchParams({
    page: String(dataState.page), limit: String(dataState.limit), estado: dataState.status, buscar: dataState.query
  });
  $('#usersBody').innerHTML = '<tr><td colspan="7" class="loading-cell">Cargando usuarios…</td></tr>';
  try {
    const data = await requestJSON(`/api/users?${params}`);
    const users = Array.isArray(data.usuarios) ? data.usuarios : [];
    dataState.total = Number(data.total || 0);
    dataState.pages = Math.max(Number(data.pages || 1), 1);
    if (dataState.page > dataState.pages) {
      dataState.page = dataState.pages;
      return loadUsers();
    }
    $('#usersBody').innerHTML = renderUserRows(users);
    $('#usersResultsText').textContent = `${formatNumber(dataState.total)} registro(s) encontrado(s)`;
    const start = dataState.total ? (dataState.page - 1) * dataState.limit + 1 : 0;
    const end = Math.min(dataState.page * dataState.limit, dataState.total);
    $('#usersPageSummary').textContent = `Mostrando ${formatNumber(start)} a ${formatNumber(end)} de ${formatNumber(dataState.total)} resultados`;
    renderPager('users');
  } catch (error) {
    setTableError('#usersBody', `Error al cargar usuarios: ${error.message}`);
    $('#usersResultsText').textContent = 'No se pudieron cargar los datos.';
    $('#usersPageSummary').textContent = 'Error de conexión';
    toast(error.message, 'error');
  }
}

async function loadBanned() {
  const dataState = state.banned;
  const params = new URLSearchParams({ page: String(dataState.page), limit: String(dataState.limit), buscar: dataState.query });
  $('#bannedBody').innerHTML = '<tr><td colspan="6" class="loading-cell">Cargando baneados…</td></tr>';
  try {
    const data = await requestJSON(`/api/baneados?${params}`);
    const users = Array.isArray(data.baneados) ? data.baneados : [];
    dataState.total = Number(data.total || 0);
    dataState.pages = Math.max(Number(data.pages || 1), 1);
    if (dataState.page > dataState.pages) {
      dataState.page = dataState.pages;
      return loadBanned();
    }
    $('#bannedBody').innerHTML = renderBannedRows(users);
    $('#bannedResultsText').textContent = `${formatNumber(dataState.total)} usuario(s) baneado(s)`;
    const start = dataState.total ? (dataState.page - 1) * dataState.limit + 1 : 0;
    const end = Math.min(dataState.page * dataState.limit, dataState.total);
    $('#bannedPageSummary').textContent = `Mostrando ${formatNumber(start)} a ${formatNumber(end)} de ${formatNumber(dataState.total)} resultados`;
    renderPager('banned');
  } catch (error) {
    setTableError('#bannedBody', `Error al cargar baneados: ${error.message}`);
    $('#bannedResultsText').textContent = 'No se pudieron cargar los datos.';
    $('#bannedPageSummary').textContent = 'Error de conexión';
    toast(error.message, 'error');
  }
}

async function loadContacts() {
  const dataState = state.contacts;
  const params = new URLSearchParams({ page: String(dataState.page), limit: String(dataState.limit), buscar: dataState.query });
  $('#contactsBody').innerHTML = '<tr><td colspan="6" class="loading-cell">Cargando contactos…</td></tr>';
  try {
    const data = await requestJSON(`/api/contactos?${params}`);
    const contacts = Array.isArray(data.contactos) ? data.contactos : [];
    dataState.total = Number(data.total || 0);
    dataState.pages = Math.max(Number(data.pages || 1), 1);
    if (dataState.page > dataState.pages) {
      dataState.page = dataState.pages;
      return loadContacts();
    }
    $('#contactsBody').innerHTML = renderContactRows(contacts);
    $('#contactsResultsText').textContent = `${formatNumber(dataState.total)} registro(s) encontrado(s)`;
    const start = dataState.total ? (dataState.page - 1) * dataState.limit + 1 : 0;
    const end = Math.min(dataState.page * dataState.limit, dataState.total);
    $('#contactsPageSummary').textContent = `Mostrando ${formatNumber(start)} a ${formatNumber(end)} de ${formatNumber(dataState.total)} resultados`;
    renderPager('contacts');
  } catch (error) {
    setTableError('#contactsBody', `Error al cargar contactos: ${error.message}`);
    $('#contactsResultsText').textContent = 'No se pudieron cargar los datos.';
    $('#contactsPageSummary').textContent = 'Error de conexión';
    toast(error.message, 'error');
  }
}

async function checkHealth() {
  const chip = $('#apiConnection');
  chip.className = 'connection-chip pending';
  chip.querySelector('span').textContent = 'Comprobando API…';
  try {
    const data = await requestJSON('/api/health', { timeoutMs: 15000 });
    if (data.success && data.mongodb === 'conectada') {
      chip.className = 'connection-chip ok';
      chip.querySelector('span').textContent = 'API y MongoDB conectados';
    } else {
      throw new Error(data.error || 'MongoDB no está conectada');
    }
  } catch (error) {
    chip.className = 'connection-chip error';
    chip.querySelector('span').textContent = 'Sin conexión';
    chip.title = error.message;
  }
}

function showView(name) {
  if (!viewMeta[name]) name = 'dashboard';
  state.view = name;
  $$('.view').forEach(view => view.classList.remove('active-view'));
  $(`#${name}View`).classList.add('active-view');
  $$('.menu-item').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  const [title, subtitle] = viewMeta[name];
  $('#pageTitle').textContent = title;
  $('#pageSubtitle').textContent = subtitle;
  closeSidebar();
  if (name === 'vip') loadVip();
  if (name === 'usuarios') loadUsers();
  if (name === 'contactos') loadContacts();
  if (name === 'baneados') loadBanned();
  if (name === 'dashboard') Promise.allSettled([loadStats(), loadDashboardUsers()]);
}

async function openUserEditor(telegramId) {
  try {
    const data = await requestJSON(`/api/users?buscar=${encodeURIComponent(telegramId)}&page=1&limit=10`);
    const user = (Array.isArray(data.usuarios) ? data.usuarios : []).find(item => String(item.telegramId) === String(telegramId));
    if (!user) throw new Error('Usuario no encontrado');
    $('#banTelegramId').value = user.telegramId;
    $('#banStatus').value = user.botBloqueado ? 'baneado' : 'activo';
    $('#banReason').value = user.motivoBloqueo || '';
    $('#banUserSummary').textContent = `${user.nombre || 'Sin nombre'} · ${user.username ? '@' + user.username.replace(/^@/, '') : 'sin username'} · ID ${user.telegramId}`;
    updateBanReasonVisibility();
    $('#userBanModal').hidden = false;
    document.body.classList.add('modal-open');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function closeUserEditor() {
  $('#userBanModal').hidden = true;
  document.body.classList.remove('modal-open');
}

function updateBanReasonVisibility() {
  const banned = $('#banStatus').value === 'baneado';
  $('#banReasonLabel').classList.toggle('disabled-field', !banned);
  $('#banReason').disabled = !banned;
}

async function saveUserBan(event) {
  event.preventDefault();
  const telegramId = Number($('#banTelegramId').value);
  const banned = $('#banStatus').value === 'baneado';
  const reason = $('#banReason').value.trim();
  const button = $('#saveUserBan');
  button.disabled = true;
  button.textContent = 'Guardando…';
  try {
    if (banned) {
      await requestJSON('/api/baneados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId, motivo: reason, baneadoPor: 'Panel CHUCKY' })
      });
      toast('Usuario baneado correctamente');
    } else {
      await requestJSON(`/api/baneados?telegramId=${encodeURIComponent(telegramId)}`, { method: 'DELETE' });
      toast('Usuario desbaneado correctamente');
    }
    closeUserEditor();
    await Promise.allSettled([loadStats(), loadDashboardUsers()]);
    if (state.view === 'usuarios') await loadUsers();
    if (state.view === 'baneados') await loadBanned();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Guardar cambios';
  }
}

function openSidebar() {
  $('#sidebar').classList.add('open');
  $('#sidebarBackdrop').classList.add('show');
}
function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#sidebarBackdrop').classList.remove('show');
}

function normalizeTxt(content) {
  return String(content || '').replace(/^\uFEFF/, '').replace(/\u0000/g, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).join('\n');
}

function resetTxt({ clearText = false } = {}) {
  $('#contactTxtFile').value = '';
  $('#txtFileInfo').textContent = 'Ningún archivo seleccionado.';
  $('#removeTxtFile').hidden = true;
  if (clearText) $('#contactLines').value = '';
}

function loadTxtFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.txt')) {
    resetTxt();
    setResult('#importResult', 'Selecciona únicamente un archivo .txt.', 'error');
    return toast('Solo se permiten archivos TXT', 'error');
  }
  if (file.size > TXT_MAX_BYTES) {
    resetTxt();
    setResult('#importResult', 'El archivo supera el límite de 5 MB.', 'error');
    return toast('El archivo TXT es demasiado grande', 'error');
  }
  const reader = new FileReader();
  $('#txtFileInfo').textContent = `Leyendo ${file.name}…`;
  reader.onload = () => {
    const content = normalizeTxt(reader.result);
    const count = content ? content.split('\n').length : 0;
    if (!count) {
      resetTxt();
      setResult('#importResult', 'El archivo TXT está vacío.', 'error');
      return;
    }
    if (count > TXT_MAX_RECORDS) {
      resetTxt();
      setResult('#importResult', `El archivo contiene ${formatNumber(count)} líneas; el máximo es ${formatNumber(TXT_MAX_RECORDS)}.`, 'error');
      return;
    }
    $('#contactLines').value = content;
    $('#txtFileInfo').textContent = `${file.name} · ${formatNumber(count)} registro(s)`;
    $('#removeTxtFile').hidden = false;
    setResult('#importResult', `Archivo cargado: ${formatNumber(count)} registro(s).`, 'ok');
  };
  reader.onerror = () => setResult('#importResult', 'No se pudo leer el archivo.', 'error');
  reader.readAsText(file, 'UTF-8');
}

function setResult(selector, message, type = '') {
  const element = $(selector);
  if (!element) return;
  element.textContent = message;
  element.className = `result-box${type ? ' ' + type : ''}`;
}

async function importContacts() {
  const content = normalizeTxt($('#contactLines').value);
  if (!content) return toast('Pega registros o selecciona un TXT', 'error');
  const lines = content.split('\n');
  if (lines.length > TXT_MAX_RECORDS) return toast(`Máximo ${formatNumber(TXT_MAX_RECORDS)} registros`, 'error');

  const button = $('#importContacts');
  button.disabled = true;
  let processed = 0, saved = 0, inserted = 0, updated = 0, duplicates = 0;
  try {
    for (let index = 0; index < lines.length; index += TXT_BATCH_SIZE) {
      const batch = lines.slice(index, index + TXT_BATCH_SIZE);
      button.textContent = `Guardando ${formatNumber(Math.min(index + batch.length, lines.length))} de ${formatNumber(lines.length)}…`;
      setResult('#importResult', `Procesando ${formatNumber(processed)} de ${formatNumber(lines.length)} registros…`);
      const data = await requestJSON('/api/contactos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lineas: batch.join('\n') })
      });
      processed += batch.length;
      saved += Number(data.cantidad || 0);
      inserted += Number(data.insertados || 0);
      updated += Number(data.actualizados || 0);
      duplicates += Number(data.duplicadosEnArchivo || 0);
    }
    const message = `Importación terminada: ${formatNumber(saved)} guardados, ${formatNumber(inserted)} nuevos, ${formatNumber(updated)} actualizados${duplicates ? ` y ${formatNumber(duplicates)} duplicado(s) dentro de los lotes` : ''}.`;
    setResult('#importResult', message, 'ok');
    toast('Importación completada');
    state.contacts.page = 1;
    await loadContacts();
  } catch (error) {
    setResult('#importResult', `La importación se detuvo en ${formatNumber(processed)} de ${formatNumber(lines.length)}: ${error.message}`, 'error');
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Guardar registros';
  }
}

async function addSingleContact(event) {
  event.preventDefault();
  const button = $('#addContactButton');
  const payload = {
    telegramId: $('#newContactTelegramId').value.trim(),
    username: $('#newContactUsername').value.trim(),
    nombre: $('#newContactName').value.trim(),
    telefono: $('#newContactPhone').value.trim()
  };
  button.disabled = true;
  button.textContent = 'Guardando…';
  setResult('#addContactResult', 'Guardando contacto…');
  try {
    const data = await requestJSON('/api/contactos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    $('#addContactForm').reset();
    setResult('#addContactResult', data.message || 'Contacto guardado correctamente.', 'ok');
    toast('Contacto guardado');
    state.contacts.page = 1;
    await loadContacts();
  } catch (error) {
    setResult('#addContactResult', error.message, 'error');
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Agregar contacto';
  }
}

async function deleteContact(telegramId) {
  if (!window.confirm(`¿Eliminar el contacto con ID Telegram ${telegramId}?`)) return;
  try {
    const data = await requestJSON(`/api/contactos?telegramId=${encodeURIComponent(telegramId)}`, { method: 'DELETE' });
    toast(data.message || 'Contacto eliminado');
    await loadContacts();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function fixContactsAutomatically() {
  const button = $('#fixContacts');
  if (!button) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '🔎 Revisando…';

  try {
    // Primero analiza sin modificar la base.
    const preview = await requestJSON('/api/contactos/corregir', {
      method: 'POST',
      timeoutMs: 60000,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aplicar: false })
    });

    if (!preview.corregibles && !preview.conflictos) {
      window.alert(
        `✅ REVISIÓN TERMINADA\n\n` +
        `Revisados: ${formatNumber(preview.revisados)}\n` +
        `Para corregir: 0\n` +
        `Duplicados por resolver: 0\n` +
        `Ambiguos: ${formatNumber(preview.ambiguos)}\n\n` +
        `Todo lo detectable ya está corregido.`
      );
      return;
    }

    const ejemplos = Array.isArray(preview.ejemplos)
      ? preview.ejemplos.slice(0, 5).map((item, index) =>
          `${index + 1}. ${item.antes.telegramId} / ${item.antes.telefono}  →  ${item.despues.telegramId} / ${item.despues.telefono}`
        ).join('\n')
      : '';

    const confirmar = window.confirm(
      `🔧 CORRECCIÓN AUTOMÁTICA\n\n` +
      `Revisados: ${formatNumber(preview.revisados)}\n` +
      `Detectados para corregir: ${formatNumber((preview.corregibles || 0) + (preview.conflictos || 0))}\n` +
      `ID/Teléfono invertidos: ${formatNumber(preview.intercambios || 0)}\n` +
      `Teléfonos para agregar +: ${formatNumber(preview.telefonosFormateados || 0)}\n` +
      `Duplicados para fusionar: ${formatNumber(preview.conflictos)}\n` +
      `Ambiguos (no se tocarán): ${formatNumber(preview.ambiguos)}\n\n` +
      (ejemplos ? `Ejemplos:\n${ejemplos}\n\n` : '') +
      `Regla automática: corto (5-10 dígitos) = ID Telegram; largo (11-15 dígitos) = teléfono. Si están invertidos, los intercambia y agrega +. Los duplicados se consolidan con respaldo antes de limpiar la copia incorrecta.\n\n¿Aplicar las correcciones?`
    );

    if (!confirmar) return;

    button.textContent = '🔧 Corrigiendo…';

    const result = await requestJSON('/api/contactos/corregir', {
      method: 'POST',
      timeoutMs: 120000,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aplicar: true })
    });

    window.alert(
      `✅ CORRECCIÓN TERMINADA\n\n` +
      `Revisados: ${formatNumber(result.revisados)}\n` +
      `Corregidos: ${formatNumber(result.corregidos)}\n` +
      `Duplicados resueltos: ${formatNumber(result.fusionados || 0)}\n` +
      `Duplicados pendientes: ${formatNumber(result.conflictos)}\n` +
      `Ambiguos omitidos: ${formatNumber(result.ambiguos)}`
    );

    toast(result.message || 'Registros corregidos correctamente');
    state.contacts.page = 1;
    await loadContacts();
  } catch (error) {
    window.alert(`❌ No se pudo completar la corrección.\n\n${error.message}`);
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function repairAllContactsDeep() {
  const button = $('#repairAllContacts');
  if (!button) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '🔎 Revisando todo…';

  try {
    const preview = await requestJSON('/api/contactos/corregir', {
      method: 'POST',
      timeoutMs: 90000,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aplicar: false, profundo: true })
    });

    if (!preview.corregibles && !preview.conflictos) {
      window.alert(
        `✅ REVISIÓN PROFUNDA TERMINADA\n\n` +
        `Revisados: ${formatNumber(preview.revisados)}\n` +
        `Para reparar: 0\n` +
        `Duplicados por resolver: 0\n` +
        `Ambiguos: ${formatNumber(preview.ambiguos)}\n\n` +
        `Todo lo detectable ya está corregido.`
      );
      return;
    }

    const ejemplos = Array.isArray(preview.ejemplos)
      ? preview.ejemplos.slice(0, 8).map((item, index) =>
          `${index + 1}. ${item.antes.telegramId} / ${item.antes.telefono}  →  ${item.despues.telegramId} / ${item.despues.telefono}`
        ).join('\n')
      : '';

    const confirmar = window.confirm(
      `⚡ REPARAR TODO - MODO PROFUNDO\n\n` +
      `Revisados: ${formatNumber(preview.revisados)}\n` +
      `Para reparar: ${formatNumber((preview.corregibles || 0) + (preview.conflictos || 0))}\n` +
      `ID/Teléfono invertidos: ${formatNumber(preview.intercambios || 0)}\n` +
      `Teléfonos para agregar +: ${formatNumber(preview.telefonosFormateados || 0)}\n` +
      `Duplicados para fusionar: ${formatNumber(preview.conflictos)}\n` +
      `Ambiguos omitidos: ${formatNumber(preview.ambiguos)}\n\n` +
      (ejemplos ? `Ejemplos:\n${ejemplos}\n\n` : '') +
      `Revisa TODA la base: corto (5-10 dígitos) = ID Telegram; largo (11-15 dígitos) = teléfono. Corrige campos invertidos, agrega + y consolida duplicados guardando respaldo antes de retirar la copia incorrecta.\n\n¿Aplicar la reparación?`
    );

    if (!confirmar) return;

    button.textContent = '⚡ Reparando…';
    const result = await requestJSON('/api/contactos/corregir', {
      method: 'POST',
      timeoutMs: 180000,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aplicar: true, profundo: true })
    });

    window.alert(
      `✅ REPARACIÓN TERMINADA\n\n` +
      `Revisados: ${formatNumber(result.revisados)}\n` +
      `Corregidos: ${formatNumber(result.corregidos)}\n` +
      `ID/Teléfono intercambiados: ${formatNumber(result.intercambios || 0)}\n` +
      `Teléfonos formateados: ${formatNumber(result.telefonosFormateados || 0)}\n` +
      `Duplicados resueltos: ${formatNumber(result.fusionados || 0)}\n` +
      `Duplicados pendientes: ${formatNumber(result.conflictos)}\n` +
      `Ambiguos omitidos: ${formatNumber(result.ambiguos)}`
    );

    toast(result.message || 'Reparación profunda terminada');
    state.contacts.page = 1;
    await loadContacts();
  } catch (error) {
    window.alert(`❌ No se pudo completar la reparación.\n\n${error.message}`);
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function bodyForDefinition(definition) {
  return definition.body ? JSON.stringify(definition.body, null, 2) : '';
}

function selectApiDefinition(index) {
  const definition = apiDefinitions[index];
  if (!definition) return;
  $('#methodSelect').value = definition.method;
  $('#endpointInput').value = definition.path;
  $('#postBody').value = bodyForDefinition(definition);
  updateTesterBodyVisibility();
  $('#apiResponse').textContent = 'Endpoint cargado. Presiona “Ejecutar” para enviar la solicitud.';
  $('#responseStatus').textContent = '—';
}

function renderApiDocs() {
  $('#baseUrl').textContent = location.origin;
  $('#apiRoutes').innerHTML = apiDefinitions.map((definition, index) => `
    <div class="api-route">
      <span class="method-badge ${definition.method.toLowerCase()}">${definition.method}</span>
      <div class="route-info"><code>${escapeHtml(definition.path)}</code><span>${escapeHtml(definition.description)}</span></div>
      <div class="route-actions">
        <button class="btn btn-outline small" type="button" data-load-api="${index}">Cargar</button>
        <button class="btn btn-outline small" type="button" data-copy-api="${index}">Copiar</button>
      </div>
    </div>`).join('');
}

function updateTesterBodyVisibility() {
  const method = $('#methodSelect').value;
  $('#postBody').hidden = method !== 'POST';
}

async function runApi() {
  const method = $('#methodSelect').value;
  const endpoint = $('#endpointInput').value.trim();
  if (!endpoint.startsWith('/api/')) return toast('Usa un endpoint que empiece con /api/', 'error');
  const options = { method, headers: { Accept: 'application/json' } };
  if (method === 'POST') {
    let parsed;
    try { parsed = JSON.parse($('#postBody').value || '{}'); }
    catch { return toast('El cuerpo JSON no es válido', 'error'); }
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(parsed);
  }

  if (method === 'DELETE' && !window.confirm(`¿Ejecutar DELETE ${endpoint}?`)) return;

  $('#sendApi').disabled = true;
  $('#apiResponse').textContent = 'Cargando…';
  $('#responseStatus').textContent = '…';
  try {
    const response = await fetch(endpoint, { ...options, cache: 'no-store' });
    const text = await response.text();
    let pretty = text;
    try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {}
    $('#responseStatus').textContent = `${response.status} ${response.statusText}`;
    $('#responseStatus').style.color = response.ok ? '#43e283' : '#ff8b92';
    $('#apiResponse').textContent = pretty || '(sin contenido)';
  } catch (error) {
    $('#responseStatus').textContent = 'ERROR';
    $('#responseStatus').style.color = '#ff8b92';
    $('#apiResponse').textContent = error.message;
  } finally {
    $('#sendApi').disabled = false;
  }
}

async function copyText(text, successMessage = 'Copiado') {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage);
  } catch {
    toast('No se pudo copiar al portapapeles', 'error');
  }
}

async function refreshCurrentView() {
  $('#pageRefresh').disabled = true;
  $('#refreshAll').disabled = true;
  try {
    await checkHealth();
    if (state.view === 'dashboard') await Promise.allSettled([loadStats(), loadDashboardUsers()]);
    if (state.view === 'usuarios') await loadUsers();
    if (state.view === 'contactos') await loadContacts();
    if (state.view === 'baneados') await loadBanned();
    if (state.view === 'importar') await loadContacts();
  } finally {
    $('#pageRefresh').disabled = false;
    $('#refreshAll').disabled = false;
  }
}

function detectWrongServer() {
  const path = location.pathname.toLowerCase();
  if (path.includes('/public/index.html') || path.includes('/bot-apis-main/')) $('#offlineBanner').hidden = false;
}

function bindEvents() {
  $$('.menu-item').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
  $$('[data-open-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.openView)));
  $('#mobileMenu').addEventListener('click', openSidebar);
  $('#closeSidebar').addEventListener('click', closeSidebar);
  $('#sidebarBackdrop').addEventListener('click', closeSidebar);
  $('#pageRefresh').addEventListener('click', refreshCurrentView);
  $('#refreshAll').addEventListener('click', refreshCurrentView);

  $('#usersStatus').addEventListener('change', event => {
    state.users.status = event.target.value; state.users.page = 1; loadUsers();
  });
  $('#usersSearch').addEventListener('input', event => {
    clearTimeout(usersSearchTimer);
    usersSearchTimer = setTimeout(() => { state.users.query = event.target.value.trim(); state.users.page = 1; loadUsers(); }, 300);
  });
  $('#usersLimit').addEventListener('change', event => {
    state.users.limit = Number(event.target.value); state.users.page = 1; loadUsers();
  });
  $('#usersFirst').addEventListener('click', () => { state.users.page = 1; loadUsers(); });
  $('#usersPrev').addEventListener('click', () => { if (state.users.page > 1) { state.users.page--; loadUsers(); } });
  $('#usersNext').addEventListener('click', () => { if (state.users.page < state.users.pages) { state.users.page++; loadUsers(); } });
  $('#usersLast').addEventListener('click', () => { state.users.page = state.users.pages; loadUsers(); });
  $('#usersPageButtons').addEventListener('click', event => {
    const button = event.target.closest('[data-users-page]');
    if (button) { state.users.page = Number(button.dataset.usersPage); loadUsers(); }
  });

  $('#bannedSearch').addEventListener('input', event => {
    clearTimeout(bannedSearchTimer);
    bannedSearchTimer = setTimeout(() => { state.banned.query = event.target.value.trim(); state.banned.page = 1; loadBanned(); }, 300);
  });
  $('#bannedLimit').addEventListener('change', event => {
    state.banned.limit = Number(event.target.value); state.banned.page = 1; loadBanned();
  });
  $('#bannedFirst').addEventListener('click', () => { state.banned.page = 1; loadBanned(); });
  $('#bannedPrev').addEventListener('click', () => { if (state.banned.page > 1) { state.banned.page--; loadBanned(); } });
  $('#bannedNext').addEventListener('click', () => { if (state.banned.page < state.banned.pages) { state.banned.page++; loadBanned(); } });
  $('#bannedLast').addEventListener('click', () => { state.banned.page = state.banned.pages; loadBanned(); });
  $('#bannedPageButtons').addEventListener('click', event => {
    const button = event.target.closest('[data-banned-page]');
    if (button) { state.banned.page = Number(button.dataset.bannedPage); loadBanned(); }
  });

  document.addEventListener('click', event => {
    const editButton = event.target.closest('[data-edit-user]');
    if (editButton) openUserEditor(editButton.dataset.editUser);
  });
  $('#banStatus').addEventListener('change', updateBanReasonVisibility);
  $('#userBanForm').addEventListener('submit', saveUserBan);
  $('#closeUserBanModal').addEventListener('click', closeUserEditor);
  $('#cancelUserBan').addEventListener('click', closeUserEditor);
  $('#userBanModal').addEventListener('click', event => { if (event.target === $('#userBanModal')) closeUserEditor(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#userBanModal').hidden) closeUserEditor(); });

  $('#fixContacts').addEventListener('click', fixContactsAutomatically);
  $('#repairAllContacts').addEventListener('click', repairAllContactsDeep);

  $('#contactsSearch').addEventListener('input', event => {
    clearTimeout(contactsSearchTimer);
    contactsSearchTimer = setTimeout(() => { state.contacts.query = event.target.value.trim(); state.contacts.page = 1; loadContacts(); }, 300);
  });
  $('#contactsLimit').addEventListener('change', event => {
    state.contacts.limit = Number(event.target.value); state.contacts.page = 1; loadContacts();
  });
  $('#contactsFirst').addEventListener('click', () => { state.contacts.page = 1; loadContacts(); });
  $('#contactsPrev').addEventListener('click', () => { if (state.contacts.page > 1) { state.contacts.page--; loadContacts(); } });
  $('#contactsNext').addEventListener('click', () => { if (state.contacts.page < state.contacts.pages) { state.contacts.page++; loadContacts(); } });
  $('#contactsLast').addEventListener('click', () => { state.contacts.page = state.contacts.pages; loadContacts(); });
  $('#contactsPageButtons').addEventListener('click', event => {
    const button = event.target.closest('[data-contacts-page]');
    if (button) { state.contacts.page = Number(button.dataset.contactsPage); loadContacts(); }
  });
  $('#contactsBody').addEventListener('click', event => {
    const button = event.target.closest('[data-delete-contact]');
    if (button) deleteContact(button.dataset.deleteContact);
  });

  $('#selectTxtFile').addEventListener('click', () => $('#contactTxtFile').click());
  $('#contactTxtFile').addEventListener('change', event => loadTxtFile(event.target.files?.[0]));
  $('#removeTxtFile').addEventListener('click', () => { resetTxt({ clearText: true }); setResult('#importResult', 'Archivo y datos limpiados.'); });
  $('#clearContactLines').addEventListener('click', () => { resetTxt({ clearText: true }); setResult('#importResult', 'Datos limpiados.'); });
  $('#importContacts').addEventListener('click', importContacts);
  $('#addContactForm').addEventListener('submit', addSingleContact);

  $('#apiRoutes').addEventListener('click', event => {
    const loadButton = event.target.closest('[data-load-api]');
    if (loadButton) { selectApiDefinition(Number(loadButton.dataset.loadApi)); showView('apis'); return; }
    const copyButton = event.target.closest('[data-copy-api]');
    if (copyButton) {
      const definition = apiDefinitions[Number(copyButton.dataset.copyApi)];
      if (definition) copyText(location.origin + definition.path, 'URL copiada');
    }
  });
  $('#vipForm').addEventListener('submit', createVip);
  $('#vipRefresh').addEventListener('click', loadVip);
  $('#vipAdd').addEventListener('click', () => openVip());
  $('#vipCancel').addEventListener('click', () => $('#vipDialog').close());
  $('#vipList').addEventListener('click', e => { const btn=e.target.closest('[data-vip-edit]'); if(btn) openVip(vipRows[Number(btn.dataset.vipEdit)]); });
  $('#vipPermanent').addEventListener('change', () => { $('#vipDays').disabled = $('#vipPermanent').checked; $('#vipDays').required = !$('#vipPermanent').checked; });
  $('#methodSelect').addEventListener('change', updateTesterBodyVisibility);
  $('#sendApi').addEventListener('click', runApi);
  $('#logoutAdmin').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST', cache: 'no-store' }).catch(() => {});
    location.replace('/login.html');
  });
  $('#copyResponse').addEventListener('click', () => copyText($('#apiResponse').textContent, 'Respuesta copiada'));
}


let vipRows = [];
let vipEditing = null;
function openVip(m = null) {
  vipEditing = m?._id || null;
  $('#vipDialogTitle').textContent = m ? 'Editar VIP' : 'Agregar VIP';
  $('#vipUserId').value = m?.telegramUserId || '';
  $('#vipUserId').readOnly = Boolean(m);
  $('#vipUsername').value = m?.username || '';
  $('#vipDays').value = m?.days || 7;
  $('#vipPermanent').checked = Boolean(m?.permanent);
  $('#vipDays').disabled = Boolean(m?.permanent);
  $('#vipOperation').value = 'set';
  $('#vipDialog').showModal();
}
async function vipRequest(url, options = {}) {
  return requestJSON(url, options);
}
async function loadVip() {
  const target = $('#vipList'); target.textContent = 'Cargando…';
  try {
    const data = await vipRequest('/api/vip'); vipRows = data.memberships || [];
    target.innerHTML = `<table style="width:100%;border-collapse:collapse;text-align:left;min-width:520px"><thead><tr><th>Usuario</th><th>Días</th><th>Estado</th><th>Vencimiento</th><th>Editar</th></tr></thead><tbody>${vipRows.map((m,i)=>`<tr style="border-top:1px solid #263140"><td style="padding:12px">${escapeHtml(m.telegramUserId || '—')}<div><small>${escapeHtml(m.username || '')}</small></div></td><td>${m.permanent?'∞':Number(m.days)||0}</td><td>${escapeHtml(m.status)}</td><td>${escapeHtml(m.expiresAt?formatDate(m.expiresAt):'—')}</td><td><button type="button" class="btn btn-outline small" data-vip-edit="${i}" aria-label="Editar VIP">✎</button></td></tr>`).join('')}</tbody></table>`;
    if (!vipRows.length) target.textContent='No hay usuarios VIP todavía.';
  } catch(e) { target.textContent=e.message; }
}
async function createVip(event) {
  event.preventDefault(); const result=$('#vipResult');
  const permanent=$('#vipPermanent').checked;
  const payload={telegram_user_id:$('#vipUserId').value.trim(),telegram_username:$('#vipUsername').value.trim(),days:permanent?null:Number($('#vipDays').value),permanent,operation:$('#vipOperation').value};
  try {
    const url=vipEditing?`/api/vip/${encodeURIComponent(payload.telegram_user_id)}`:'/api/vip';
    await vipRequest(url,{method:vipEditing?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    $('#vipDialog').close(); result.textContent='Guardado correctamente.'; await loadVip();
  } catch(e) { result.textContent=e.message; }
}

async function init() {
  detectWrongServer();
  try {
    const response = await fetch('/api/admin/session', { cache: 'no-store' });
    const session = await response.json();
    if (!session.authenticated) { location.replace('/login.html'); return; }
  } catch { location.replace('/login.html'); return; }
  setCurrentDate();
  setInterval(setCurrentDate, 60000);
  renderApiDocs();
  selectApiDefinition(0);
  bindEvents();
  await Promise.allSettled([checkHealth(), loadStats(), loadDashboardUsers()]);
  setInterval(checkHealth, 60000);
}

document.addEventListener('DOMContentLoaded', init);
