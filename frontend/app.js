const API_BASE = '/api/transcriptions';

const uploadForm = document.querySelector('#upload-form');
const uploadStatus = document.querySelector('#upload-status');
const transcriptionList = document.querySelector('#transcription-list');
const searchInput = document.querySelector('#search');
const modal = document.querySelector('#modal');
const modalText = document.querySelector('#modal-text');
const modalClose = document.querySelector('#modal-close');
const template = document.querySelector('#transcription-template');

let searchTimer;

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || response.statusText);
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

    const viewButton = node.querySelector('.view');
    viewButton.addEventListener('click', () => openModal(item.id));

    const deleteButton = node.querySelector('.delete');
    deleteButton.dataset.id = item.id;
    deleteButton.addEventListener('click', () => deleteTranscription(item.id));

    renderSpeakers(node.querySelector('.speakers'), item.speakers);

    transcriptionList.appendChild(node);
  });
}

async function refreshTranscriptions(query = '') {
  const url = new URL(API_BASE, window.location.origin);
  if (query) {
    url.searchParams.set('q', query);
  }
  const data = await fetchJSON(url);
  renderTranscriptions(data);
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
    refreshTranscriptions(searchInput.value);
  } catch (error) {
    alert(`No se pudo eliminar: ${error.message}`);
  }
}

function handleSearch(event) {
  clearTimeout(searchTimer);
  const query = event.target.value.trim();
  searchTimer = setTimeout(() => refreshTranscriptions(query), 300);
}

uploadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(uploadForm);
  uploadStatus.textContent = 'Subiendo archivo...';

  try {
    await fetchJSON(API_BASE, {
      method: 'POST',
      body: formData,
    });
    uploadStatus.textContent = 'Archivo recibido. Procesando transcripción...';
    uploadForm.reset();
    refreshTranscriptions();
  } catch (error) {
    uploadStatus.textContent = `Error: ${error.message}`;
  }
});

searchInput?.addEventListener('input', handleSearch);
modalClose?.addEventListener('click', () => (modal.hidden = true));
modal?.addEventListener('click', (event) => {
  if (event.target === modal) modal.hidden = true;
});

document.addEventListener('DOMContentLoaded', () => {
  refreshTranscriptions();
});
