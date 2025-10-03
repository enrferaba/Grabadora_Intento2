const API_BASE = '/api/transcriptions';
const PAYMENTS_BASE = '/api/payments';
const AUTH_BASE = '/api/auth';

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
const fileTrigger = document.querySelector('.file-trigger');
const filePreview = document.querySelector('#file-preview');
const fileError = document.querySelector('#file-error');
const plansContainer = document.querySelector('#plans');
const checkoutStatus = document.querySelector('#checkout-status');
const refreshPlansBtn = document.querySelector('#refresh-plans');
const googleLoginBtn = document.querySelector('#google-login');
const languageSelect = document.querySelector('#language');
const modelSelect = document.querySelector('#model-size');
const deviceSelect = document.querySelector('#device-preference');
const liveOutput = document.querySelector('#live-output');
const copyTranscriptBtn = document.querySelector('#copy-transcript');
const metricTotal = document.querySelector('[data-metric="total"]');
const metricCompleted = document.querySelector('[data-metric="completed"]');
const metricProcessing = document.querySelector('[data-metric="processing"]');
const metricPremium = document.querySelector('[data-metric="premium"]');
const metricMinutes = document.querySelector('[data-metric="minutes"]');
const uploadProgress = document.querySelector('#upload-progress');

const MEDIA_PREFIXES = ['audio/', 'video/'];
const MEDIA_EXTENSIONS = [
  '.aac',
  '.flac',
  '.m4a',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp3',
  '.mp4',
  '.ogg',
  '.wav',
  '.webm',
  '.wma',
];

let searchTimer;
let pollingHandle = null;
let currentQuery = '';
let premiumOnly = false;
let selectedTranscriptionId = null;
const typewriterControllers = new Map();
const progressControllers = new Map();
const metricSnapshot = {
  total: 0,
  completed: 0,
  processing: 0,
  premium: 0,
  minutes: 0,
};
let uploadProgressTimer = null;
let uploadProgressValue = 0;
let currentLiveTranscriptionId = null;

function typewriterEffect(element, text, speed = 18) {
  if (!element) return;
  const controller = typewriterControllers.get(element);
  if (controller?.cancel) {
    controller.cancel();
  }

  const finalText = text ?? '';
  if (!finalText) {
    element.textContent = '';
    element.dataset.typing = 'false';
    typewriterControllers.set(element, null);
    return;
  }

  let index = 0;
  let timeoutId;
  let cancelled = false;
  element.textContent = '';
  element.dataset.typing = 'true';

  const tick = () => {
    if (cancelled) return;
    element.textContent += finalText[index];
    index += 1;
    if (index < finalText.length) {
      timeoutId = setTimeout(tick, speed);
    } else {
      element.dataset.typing = 'false';
    }
  };

  tick();

  typewriterControllers.set(element, {
    cancel() {
      cancelled = true;
      clearTimeout(timeoutId);
      element.dataset.typing = 'false';
    },
  });
}

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

function showUploadProgress() {
  if (!uploadProgress) return;
  uploadProgress.hidden = false;
  uploadProgress.dataset.active = 'true';
  const bar = uploadProgress.querySelector('.progress-bar');
  if (!bar) return;
  if (uploadProgressTimer) {
    clearInterval(uploadProgressTimer);
  }
  uploadProgressValue = 0;
  bar.style.width = '0%';
  uploadProgressTimer = setInterval(() => {
    uploadProgressValue = Math.min(uploadProgressValue + Math.random() * 12, 92);
    bar.style.width = `${uploadProgressValue.toFixed(1)}%`;
  }, 420);
}

function hideUploadProgress() {
  if (!uploadProgress) return;
  if (uploadProgressTimer) {
    clearInterval(uploadProgressTimer);
    uploadProgressTimer = null;
  }
  uploadProgress.hidden = true;
  uploadProgress.dataset.active = 'false';
  const bar = uploadProgress.querySelector('.progress-bar');
  if (bar) {
    bar.style.width = '0%';
  }
}

function completeUploadProgress(success = true) {
  if (!uploadProgress) return;
  const bar = uploadProgress.querySelector('.progress-bar');
  if (bar) {
    bar.style.width = success ? '100%' : '0%';
  }
  setTimeout(() => hideUploadProgress(), success ? 600 : 0);
}

function toggleCardProgress(id, isProcessing, element) {
  const controller = progressControllers.get(id);
  if (controller) {
    controller();
    progressControllers.delete(id);
  }
  if (!isProcessing || !element) {
    if (element) element.hidden = true;
    return;
  }

  element.hidden = false;
  element.dataset.active = 'true';
  const bar = element.querySelector('.progress-bar');
  if (!bar) return;

  let width = 0;
  bar.style.width = '0%';

  const tick = () => {
    width = (width + Math.random() * 18) % 100;
    bar.style.width = `${Math.max(width, 10).toFixed(1)}%`;
  };

  const interval = setInterval(tick, 650);
  progressControllers.set(id, () => {
    clearInterval(interval);
    bar.style.width = '100%';
    setTimeout(() => {
      bar.style.width = '0%';
      element.dataset.active = 'false';
    }, 400);
  });
}

function renderSpeakers(container, speakers) {
  if (!container) return;
  const list = container.querySelector('ul');
  if (!list) return;
  list.innerHTML = '';
  const safeSegments = Array.isArray(speakers) ? speakers : [];
  for (const segment of safeSegments) {
    const item = document.createElement('li');
    const start = segment.start?.toFixed(2) ?? '0.00';
    const end = segment.end?.toFixed(2) ?? '0.00';
    item.textContent = `[${start}s - ${end}s] ${segment.speaker}: ${segment.text}`;
    list.appendChild(item);
  }
  container.hidden = safeSegments.length === 0;
}

function renderTranscriptions(items) {
  if (!transcriptionList) return;
  if (!template || !('content' in template)) {
    console.warn('Plantilla de transcripción no disponible.');
    return;
  }
  transcriptionList.innerHTML = '';
  const results = Array.isArray(items) ? items : [];
  if (!results.length) {
    transcriptionList.innerHTML = '<p>No se encontraron transcripciones.</p>';
    return;
  }

  for (const [index, item] of results.entries()) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.transcription');
    if (card) {
      card.style.setProperty('--card-delay', `${index * 60}ms`);
      card.dataset.status = item.status;
    }
    node.querySelector('.transcription-title').textContent = item.original_filename;
    const statusBadge = node.querySelector('.status');
    if (statusBadge) {
      statusBadge.textContent = formatStatus(item.status);
      statusBadge.dataset.status = item.status;
    }
    node.querySelector('.meta').textContent = `Asignatura: ${item.subject ?? '—'} • Estado: ${item.status} • Creado: ${formatDate(item.created_at)}`;
    node.querySelector('.excerpt').textContent = item.text?.slice(0, 220) ?? 'Transcripción no disponible aún.';
    const cardProgress = node.querySelector('.card-progress');
    toggleCardProgress(item.id, item.status === 'processing', cardProgress);
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
    checkoutButton.textContent = 'Activar premium';
    checkoutButton.addEventListener('click', () => {
      selectedTranscriptionId = item.id;
      checkoutStatus.textContent = `Transcripción seleccionada: ${item.original_filename}. Ahora elige un plan.`;
      checkoutStatus.classList.remove('success');
    });

    renderSpeakers(node.querySelector('.speakers'), item.speakers);

    transcriptionList.appendChild(node);
  }
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
  const results = Array.isArray(data?.results) ? data.results : [];
  renderTranscriptions(results);
  updateMetrics(results);
  const pending = results.some((item) => item.status === 'processing');
  if (pending && !pollingHandle) {
    startPolling();
  }
  if (!pending && pollingHandle) {
    stopPolling();
  }
  if (!pending) {
    completeUploadProgress(true);
  }
  updateLivePreview(results);
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

function isSupportedMediaFile(file) {
  if (!file) return false;
  const type = (file.type || '').toLowerCase();
  if (MEDIA_PREFIXES.some((prefix) => type.startsWith(prefix))) {
    return true;
  }
  const name = (file.name || '').toLowerCase();
  return MEDIA_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function updateFilePreview() {
  const files = Array.from(fileInput?.files ?? []);
  if (!files.length) {
    filePreview.hidden = true;
    filePreview.innerHTML = '';
    if (fileError) {
      fileError.hidden = true;
      fileError.textContent = '';
    }
    return;
  }

  const invalid = files.filter((file) => !isSupportedMediaFile(file));
  if (invalid.length) {
    if (fileError) {
      const names = invalid.map((file) => file.name).join(', ');
      fileError.textContent = `Los siguientes archivos no son audio/video válidos: ${names}`;
      fileError.hidden = false;
    }
    if (fileInput) {
      fileInput.value = '';
    }
    filePreview.hidden = true;
    filePreview.innerHTML = '';
    return;
  }

  if (fileError) {
    fileError.hidden = true;
    fileError.textContent = '';
  }

  filePreview.hidden = false;
  filePreview.innerHTML = '';
  for (const file of files) {
    const row = document.createElement('span');
    row.textContent = `${file.name} • ${formatBytes(file.size)}`;
    filePreview.appendChild(row);
  }
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
  if (!plansContainer) return;
  plansContainer.innerHTML = '';
  const safePlans = Array.isArray(plans) ? plans : [];
  if (!safePlans.length) {
    plansContainer.innerHTML = '<p>No hay planes disponibles actualmente.</p>';
    return;
  }

  for (const plan of safePlans) {
    const card = document.createElement('article');
    card.className = 'plan-card';
    const perks = (plan.perks ?? []).map((perk) => `<li>${perk}</li>`).join('');
    card.innerHTML = `
      <h3>${plan.name}</h3>
      <p class="plan-meta">${plan.description ?? 'Notas premium, resúmenes y recordatorios inteligentes incluidos.'}</p>
      <p class="plan-minutes">Cobertura recomendada: hasta ${plan.max_minutes} minutos por archivo.</p>
      <ul class="plan-perks">${perks}</ul>
      <div class="plan-actions">
        <button type="button" class="primary" data-plan="${plan.slug}">Activar premium</button>
      </div>
    `;
    plansContainer.appendChild(card);
  }
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

    checkoutStatus.innerHTML = `Checkout creado. Completa el pago aquí: <a href="${payload.payment_url}" target="_blank" rel="noopener">${payload.payment_url}</a>`;
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

  if (files.some((file) => !isSupportedMediaFile(file))) {
    uploadStatus.textContent = 'Solo se permiten archivos de audio o video.';
    uploadStatus.classList.add('error');
    updateFilePreview();
    return;
  }

  const language = uploadForm.querySelector('#language')?.value?.trim();
  const subject = uploadForm.querySelector('#subject')?.value?.trim();
  const modelSize = uploadForm.querySelector('#model-size')?.value?.trim();
  const devicePreference = uploadForm.querySelector('#device-preference')?.value?.trim();

  const endpoint = files.length > 1 ? `${API_BASE}/batch` : API_BASE;
  const formData = new FormData();
  if (files.length > 1) {
    for (const file of files) {
      formData.append('uploads', file);
    }
  } else {
    formData.append('upload', files[0]);
  }
  if (language) formData.append('language', language);
  if (subject) formData.append('subject', subject);
  if (modelSize) formData.append('model_size', modelSize);
  if (devicePreference) formData.append('device_preference', devicePreference);

  uploadStatus.textContent = files.length > 1 ? `Subiendo ${files.length} archivos...` : 'Subiendo archivo...';
  uploadStatus.classList.remove('error');
  showUploadProgress();

  try {
    const response = await fetchJSON(endpoint, {
      method: 'POST',
      body: formData,
    });
    const queuedCount = Array.isArray(response?.items) ? response.items.length : 1;
    uploadStatus.textContent = `${queuedCount} archivo(s) en cola. Procesando transcripciones...`;
    uploadStatus.classList.remove('error');
    uploadForm.reset();
    if (modelSelect && modelSelect.dataset.default) {
      modelSelect.value = modelSelect.dataset.default;
    }
    if (deviceSelect && deviceSelect.dataset.default) {
      deviceSelect.value = deviceSelect.dataset.default;
    }
    if (languageSelect) {
      languageSelect.value = languageSelect.querySelector('option[selected]')?.value ?? '';
    }
    updateFilePreview();
    await refreshTranscriptions();
  } catch (error) {
    uploadStatus.textContent = `Error al subir: ${error.message}`;
    uploadStatus.classList.add('error');
    completeUploadProgress(false);
  }
});

fileTrigger?.addEventListener('click', (event) => {
  event.preventDefault();
  fileInput?.click();
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
  resetCopyFeedback();
  refreshTranscriptions();
  loadPlans();
  updateMetrics([]);
});

googleLoginBtn?.addEventListener('click', async () => {
  googleLoginBtn.disabled = true;
  try {
    const data = await fetchJSON(`${AUTH_BASE}/google/login`);
    if (data?.authorization_url) {
      window.location.href = data.authorization_url;
    }
  } catch (error) {
    alert(`Configura las variables de entorno de Google en el servidor para continuar. Detalle: ${error.message}`);
  } finally {
    googleLoginBtn.disabled = false;
  }
});

function animateMetric(element) {
  if (!element) return;
  element.classList.remove('metric-pulse');
  void element.offsetWidth;
  element.classList.add('metric-pulse');
}

function updateMetricValue(element, key, value, formatter = (val) => val) {
  if (!element) return;
  const previous = metricSnapshot[key];
  if (previous === value) return;
  metricSnapshot[key] = value;
  element.textContent = formatter(value);
  animateMetric(element);
}

function updateMetrics(items) {
  if (!metricTotal && !metricCompleted && !metricProcessing && !metricPremium && !metricMinutes) {
    return;
  }
  const safeItems = Array.isArray(items) ? items : [];
  const total = safeItems.length;
  const completed = safeItems.filter((item) => item.status === 'completed').length;
  const processing = safeItems.filter((item) => item.status === 'processing').length;
  const premium = safeItems.filter((item) => item.premium_enabled).length;
  const minutes = safeItems.reduce((acc, item) => acc + ((item.duration ?? 0) / 60), 0);

  updateMetricValue(metricTotal, 'total', total);
  updateMetricValue(metricCompleted, 'completed', completed);
  updateMetricValue(metricProcessing, 'processing', processing);
  updateMetricValue(metricPremium, 'premium', premium);
  updateMetricValue(metricMinutes, 'minutes', minutes, (val) => `${val.toFixed(1)} min`);
}

function showTypewriterText(text) {
  const safeText = text && text.trim() ? text : 'Transcripción no disponible aún.';
  typewriterEffect(modalText, safeText);
  typewriterEffect(liveOutput, safeText);
}

function updateLivePreview(results) {
  if (!liveOutput) return;
  const safeResults = Array.isArray(results) ? results : [];
  if (selectedTranscriptionId) {
    const selected = safeResults.find((item) => item.id === selectedTranscriptionId);
    if (selected?.text && selected.id !== currentLiveTranscriptionId) {
      currentLiveTranscriptionId = selected.id;
      showTypewriterText(selected.text);
    }
    return;
  }
  const active =
    safeResults.find((item) => item.status === 'processing' && item.text) ||
    safeResults.find((item) => item.status === 'completed' && item.text);
  if (active && active.text && active.id !== currentLiveTranscriptionId) {
    currentLiveTranscriptionId = active.id;
    showTypewriterText(active.text);
  }
}

function resetCopyFeedback() {
  if (!copyTranscriptBtn) return;
  copyTranscriptBtn.disabled = false;
  copyTranscriptBtn.classList.remove('success');
  copyTranscriptBtn.classList.remove('error');
  copyTranscriptBtn.textContent = 'Copiar al portapapeles';
}

async function openModal(id) {
  try {
    const data = await fetchJSON(`${API_BASE}/${id}`);
    modal.hidden = false;
    showTypewriterText(data.text ?? 'Transcripción no disponible aún.');
    resetCopyFeedback();
  } catch (error) {
    modal.hidden = false;
    const message = `No se pudo obtener la transcripción: ${error.message}`;
    modalText.textContent = message;
    if (liveOutput) {
      liveOutput.textContent = message;
      liveOutput.dataset.typing = 'false';
    }
    resetCopyFeedback();
  }
}

fileTrigger?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput?.click();
  }
});

copyTranscriptBtn?.addEventListener('click', async () => {
  if (!modalText) return;
  const text = modalText.textContent ?? '';
  if (!text.trim()) {
    copyTranscriptBtn.textContent = 'Nada que copiar';
    copyTranscriptBtn.classList.add('error');
    setTimeout(resetCopyFeedback, 1600);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    copyTranscriptBtn.textContent = '¡Copiado!';
    copyTranscriptBtn.classList.remove('error');
    copyTranscriptBtn.classList.add('success');
  } catch (error) {
    copyTranscriptBtn.textContent = 'No se pudo copiar';
    copyTranscriptBtn.classList.remove('success');
    copyTranscriptBtn.classList.add('error');
  } finally {
    copyTranscriptBtn.disabled = true;
    setTimeout(resetCopyFeedback, 2000);
  }
});
