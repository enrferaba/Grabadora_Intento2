const API_BASE = '/api/transcriptions';
const PAYMENTS_BASE = '/api/payments';

const uploadForm = document.querySelector('#upload-form');
const uploadStatus = document.querySelector('#upload-status');
const transcriptionList = document.querySelector('#transcription-list');
const searchInput = document.querySelector('#search');
const filterPremium = document.querySelector('#filter-premium');
const modal = document.querySelector('#modal');
const modalText = document.querySelector('#modal-text');
const modalClose = document.querySelector('#modal-close');
const template = document.querySelector('#transcription-template');
const fileInput = document.querySelector('#audio-file');
const filePreview = document.querySelector('#file-preview');
const plansContainer = document.querySelector('#plans');
const checkoutStatus = document.querySelector('#checkout-status');
const refreshPlansBtn = document.querySelector('#refresh-plans');

let searchTimer;
let pollingHandle = null;
let currentQuery = '';
let premiumOnly = false;
let selectedTranscriptionId = null;

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || response.statusText);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function formatStatus(status) {
  switch (status) {
    case 'completed':
      return 'Completado ✅';
    case 'processing':
      return 'Procesando ⏳';
    case 'failed':
      return 'Falló ❌';
    default:
      return 'Pendiente';
  }
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(1)} ${units[idx]}`;
}

function formatCurrency(cents, currency = 'EUR') {
  const amount = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount);
  } catch (error) {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function renderSpeakers(container, speakers = []) {
  const list = container.querySelector('ul');
  list.innerHTML = '';
  speakers.forEach((segment) => {
    const item = document.createElement('li');
    const start = segment.start?.toFixed(2) ?? '0.00';
    const end = segment.end?.toFixed(2) ?? '0.00';
    item.textContent = `[${start}s - ${end}s] ${segment.speaker}: ${segment.text}`;
    list.appendChild(item);
  });
  container.hidden = speakers.length === 0;
}

function renderTranscriptions(data) {
  transcriptionList.innerHTML = '';
  if (!data.total) {
    transcriptionList.innerHTML = '<p>No se encontraron transcripciones.</p>';
    return;
  }

  data.results.forEach((item) => {
    const node = template.content.cloneNode(true);
    node.querySelector('.transcription-title').textContent = item.original_filename;
    node.querySelector('.status').textContent = formatStatus(item.status);
    node.querySelector('.meta').textContent = `Asignatura: ${item.subject ?? '—'} • Estado: ${item.status} • Creado: ${formatDate(item.created_at)}`;
    node.querySelector('.excerpt').textContent = item.text?.slice(0, 220) ?? 'Transcripción no disponible aún.';
    node.querySelector('.download').href = `${API_BASE}/${item.id}/download`;

    const premiumContainer = node.querySelector('.premium');
    const premiumNotes = node.querySelector('.premium-notes');
    if (item.premium_enabled) {
      premiumContainer.hidden = false;
      premiumNotes.textContent = item.premium_notes ?? 'Notas premium activas.';
    }

    const viewButton = node.querySelector('.view');
    viewButton.addEventListener('click', () => openModal(item.id));

    const deleteButton = node.querySelector('.delete');
    deleteButton.dataset.id = item.id;
    deleteButton.addEventListener('click', () => deleteTranscription(item.id));

    const checkoutButton = node.querySelector('.checkout');
    checkoutButton.addEventListener('click', () => {
      selectedTranscriptionId = item.id;
      checkoutStatus.textContent = `Transcripción seleccionada: ${item.original_filename}. Ahora elige un plan.`;
      checkoutStatus.classList.remove('success');
    });

    renderSpeakers(node.querySelector('.speakers'), item.speakers);

    transcriptionList.appendChild(node);
  });
}

async function refreshTranscriptions() {
  const url = new URL(API_BASE, window.location.origin);
  if (currentQuery) {
    url.searchParams.set('q', currentQuery);
  }
  if (premiumOnly) {
    url.searchParams.set('premium_only', 'true');
  }
  const data = await fetchJSON(url);
  renderTranscriptions(data);
  const pending = data.results.some((item) => item.status === 'processing');
  if (pending && !pollingHandle) {
    startPolling();
  }
  if (!pending && pollingHandle) {
    stopPolling();
  }
  return data;
}

function startPolling() {
  stopPolling();
  pollingHandle = setInterval(() => {
    refreshTranscriptions().catch(() => stopPolling());
  }, 5000);
}

function stopPolling() {
  if (pollingHandle) {
    clearInterval(pollingHandle);
    pollingHandle = null;
  }
}

async function openModal(id) {
  try {
    const data = await fetchJSON(`${API_BASE}/${id}`);
    modalText.textContent = data.text ?? 'Transcripción no disponible aún.';
    modal.hidden = false;
  } catch (error) {
    alert(`No se pudo obtener la transcripción: ${error.message}`);
  }
}

async function deleteTranscription(id) {
  if (!confirm('¿Eliminar esta transcripción?')) return;
  try {
    await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    await refreshTranscriptions();
  } catch (error) {
    alert(`No se pudo eliminar: ${error.message}`);
  }
}

function handleSearch(event) {
  clearTimeout(searchTimer);
  currentQuery = event.target.value.trim();
  searchTimer = setTimeout(() => {
    refreshTranscriptions().catch((error) => {
      uploadStatus.textContent = `Error al buscar: ${error.message}`;
    });
  }, 300);
}

function updateFilePreview() {
  const files = Array.from(fileInput?.files ?? []);
  if (!files.length) {
    filePreview.hidden = true;
    filePreview.innerHTML = '';
    return;
  }
  filePreview.hidden = false;
  filePreview.innerHTML = '';
  files.forEach((file) => {
    const row = document.createElement('span');
    row.textContent = `${file.name} • ${formatBytes(file.size)}`;
    filePreview.appendChild(row);
  });
}

async function loadPlans() {
  try {
    const plans = await fetchJSON(`${PAYMENTS_BASE}/plans`);
    renderPlans(plans);
  } catch (error) {
    checkoutStatus.textContent = `No se pudieron cargar los planes: ${error.message}`;
    checkoutStatus.classList.remove('success');
  }
}

function renderPlans(plans = []) {
  plansContainer.innerHTML = '';
  if (!plans.length) {
    plansContainer.innerHTML = '<p>No hay planes disponibles actualmente.</p>';
    return;
  }

  plans.forEach((plan) => {
    const card = document.createElement('article');
    card.className = 'plan-card';
    card.innerHTML = `
      <h3>${plan.name}</h3>
      <div class="plan-price">${formatCurrency(plan.price_cents, plan.currency)}</div>
      <p class="plan-meta">Hasta ${plan.max_minutes} minutos por archivo.</p>
      <ul class="plan-perks">${(plan.perks ?? []).map((perk) => `<li>${perk}</li>`).join('')}</ul>
      <div class="plan-actions">
        <button type="button" class="primary" data-plan="${plan.slug}">Comprar</button>
      </div>
    `;
    plansContainer.appendChild(card);
  });
}

async function createCheckout(planSlug) {
  if (!selectedTranscriptionId) {
    checkoutStatus.textContent = 'Selecciona primero una transcripción en la lista.';
    checkoutStatus.classList.remove('success');
    return;
  }

  try {
    const payload = await fetchJSON(`${PAYMENTS_BASE}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tier_slug: planSlug,
        transcription_id: selectedTranscriptionId,
        customer_email: 'demo@grabadora.pro',
      }),
    });

    checkoutStatus.innerHTML = `Checkout creado. Enlace de pago: <a href="${payload.payment_url}" target="_blank" rel="noopener">${payload.payment_url}</a>`;
    checkoutStatus.classList.remove('success');

    const confirmation = await fetchJSON(`${PAYMENTS_BASE}/${payload.id}/confirm`, { method: 'POST' });
    checkoutStatus.textContent = `Compra confirmada. ¡Notas premium desbloqueadas! (#${confirmation.id})`;
    checkoutStatus.classList.add('success');
    await refreshTranscriptions();
  } catch (error) {
    checkoutStatus.textContent = `No se pudo completar la compra: ${error.message}`;
    checkoutStatus.classList.remove('success');
  }
}

uploadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const files = Array.from(fileInput?.files ?? []);
  if (!files.length) {
    uploadStatus.textContent = 'Selecciona al menos un archivo.';
    return;
  }

  const language = uploadForm.querySelector('#language')?.value?.trim();
  const subject = uploadForm.querySelector('#subject')?.value?.trim();
  const priceCents = uploadForm.querySelector('#price')?.value?.trim();
  const currency = uploadForm.querySelector('#currency')?.value?.trim();

  const endpoint = files.length > 1 ? `${API_BASE}/batch` : API_BASE;
  const formData = new FormData();
  if (files.length > 1) {
    files.forEach((file) => formData.append('uploads', file));
  } else {
    formData.append('upload', files[0]);
  }
  if (language) formData.append('language', language);
  if (subject) formData.append('subject', subject);
  if (priceCents) formData.append('price_cents', priceCents);
  if (currency) formData.append('currency', currency);

  uploadStatus.textContent = files.length > 1 ? `Subiendo ${files.length} archivos...` : 'Subiendo archivo...';

  try {
    const response = await fetchJSON(endpoint, {
      method: 'POST',
      body: formData,
    });
    const queuedCount = Array.isArray(response?.items) ? response.items.length : 1;
    uploadStatus.textContent = `${queuedCount} archivo(s) en cola. Procesando transcripciones...`;
    uploadStatus.classList.remove('error');
    uploadForm.reset();
    updateFilePreview();
    await refreshTranscriptions();
    startPolling();
  } catch (error) {
    uploadStatus.textContent = `Error: ${error.message}`;
    uploadStatus.classList.add('error');
  }
});

fileInput?.addEventListener('change', updateFilePreview);
searchInput?.addEventListener('input', handleSearch);
filterPremium?.addEventListener('change', (event) => {
  premiumOnly = event.target.checked;
  refreshTranscriptions();
});
modalClose?.addEventListener('click', () => (modal.hidden = true));
modal?.addEventListener('click', (event) => {
  if (event.target === modal) modal.hidden = true;
});
refreshPlansBtn?.addEventListener('click', loadPlans);
plansContainer?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-plan]');
  if (!button) return;
  const slug = button.getAttribute('data-plan');
  createCheckout(slug);
});

document.addEventListener('DOMContentLoaded', () => {
  refreshTranscriptions();
  loadPlans();
});
