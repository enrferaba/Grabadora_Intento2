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
const homeLiveOutput = document.querySelector('#home-live-output');
const livePreviewTargets = [liveOutput, homeLiveOutput].filter(Boolean);
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

const AUTO_SCROLL_THRESHOLD = 160;

let searchTimer;
let pollingTimeout = null;
let currentQuery = '';
let premiumOnly = false;
let selectedTranscriptionId = null;
let refreshInFlight = null;
let lastResultsSignature = '';
let lastPendingCount = 0;
let refreshQueuedWhileHidden = false;
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
let currentLiveText = '';
const destinationInput = document.querySelector('#destination-folder');
let cachedPlans = [];
const studentPreviewBody = document.querySelector('#student-preview-body');
const studentFollowToggle = document.querySelector('#student-follow');
const openStudentBtn = document.querySelector('#open-student-web');
const folderGroupsContainer = document.querySelector('#folder-groups');
const folderCategoryFilter = document.querySelector('#folder-category');
const folderStatusFilter = document.querySelector('#folder-status');
const folderTopicFilter = document.querySelector('#folder-topic');
const folderSearchInput = document.querySelector('#folder-search');
const folderResetButton = document.querySelector('#folder-reset');
const systemAlerts = document.querySelector('#system-alerts');
const destinationOptionsList = document.querySelector('#destination-folder-options');
const destinationSavedHint = document.querySelector('#destination-saved-hint');
const liveLanguageSelect = document.querySelector('#live-language');
const liveModelSelect = document.querySelector('#live-model');
const liveDeviceSelect = document.querySelector('#live-device');
const liveFolderInput = document.querySelector('#live-folder');
const liveSubjectInput = document.querySelector('#live-subject');
const liveStartButton = document.querySelector('#live-start');
const liveStopButton = document.querySelector('#live-stop');
const liveResetButton = document.querySelector('#live-reset');
const liveStreamStatus = document.querySelector('#live-stream-status');
const liveStreamOutput = document.querySelector('#live-stream-output');
const homePendingList = document.querySelector('#home-pending-list');
const homePendingEmpty = document.querySelector('#home-pending-empty');
const homePendingCount = document.querySelector('#home-pending-count');
const homeFolderSummary = document.querySelector('#home-folder-summary');
const homeRecentList = document.querySelector('#home-recent-list');
const sectionToggles = document.querySelectorAll('[data-section-toggle]');
const sectionPanels = document.querySelectorAll('[data-section]');
const sectionJumpButtons = document.querySelectorAll('[data-section-jump]');

const typingQueue = [];
let typingInProgress = false;
let cachedResults = [];
let cachedFolderGroups = [];
const folderFilters = {
  category: 'all',
  status: 'all',
  topic: 'all',
  search: '',
};
const DESTINATION_STORAGE_KEY = 'grabadora:last-destination-folder';
const LAST_SECTION_STORAGE_KEY = 'grabadora:last-section';
const LIVE_CHUNK_INTERVAL = 4000;

let liveSessionId = null;
let liveMediaStream = null;
let liveRecorder = null;
let liveChunkChain = Promise.resolve();
let liveSessionActive = false;
let destinationHintTimeout = null;

const FOLDER_TAG_LABELS = {
  temario: 'Temario',
  tema: 'Tema',
  practicas: 'Prácticas',
  ejercicios: 'Ejercicios',
  teoria: 'Teoría',
};

const SEVERITY_RANK = {
  info: 0,
  warning: 1,
  error: 2,
};

function cancelTyping(container) {
  if (!container) return;
  container.dataset.typingToken = '';
  for (let idx = typingQueue.length - 1; idx >= 0; idx -= 1) {
    if (typingQueue[idx].container === container) {
      typingQueue.splice(idx, 1);
    }
  }
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

function computeResultsSignature(results) {
  if (!Array.isArray(results) || !results.length) {
    return 'empty';
  }
  return results
    .map((item) => {
      const updatedAt = item.updated_at || item.created_at || '';
      const latestEvent = Array.isArray(item.debug_events) && item.debug_events.length
        ? item.debug_events[item.debug_events.length - 1]?.timestamp || item.debug_events.length
        : 'no-events';
      return `${item.id}:${item.status}:${updatedAt}:${(item.text || '').length}:${latestEvent}`;
    })
    .join('|');
}

function safeLocalStorageGet(key) {
  try {
    return window.localStorage?.getItem(key) ?? '';
  } catch (error) {
    console.warn('No se pudo leer localStorage:', error);
    return '';
  }
}

function safeLocalStorageSet(key, value) {
  try {
    if (value) {
      window.localStorage?.setItem(key, value);
    } else {
      window.localStorage?.removeItem(key);
    }
  } catch (error) {
    console.warn('No se pudo escribir en localStorage:', error);
  }
}

function setActiveSection(targetSection, options = {}) {
  if (!sectionPanels?.length) return;
  const fallback = options.fallback || 'home';
  const available = Array.from(sectionPanels, (panel) => panel.dataset.section).filter(Boolean);
  const desired = available.includes(targetSection) ? targetSection : available.includes(fallback) ? fallback : available[0];
  if (!desired) {
    return;
  }
  sectionPanels.forEach((panel) => {
    const active = panel.dataset.section === desired;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });
  if (sectionToggles?.length) {
    sectionToggles.forEach((toggle) => {
      const active = toggle.dataset.sectionToggle === desired;
      toggle.classList.toggle('is-active', active);
      if (active) {
        toggle.setAttribute('aria-current', 'page');
      } else {
        toggle.removeAttribute('aria-current');
      }
    });
  }
  if (!options?.skipPersist) {
    safeLocalStorageSet(LAST_SECTION_STORAGE_KEY, desired);
  }
}

function hideDestinationSavedHint() {
  if (!destinationSavedHint) return;
  destinationSavedHint.hidden = true;
  if (destinationHintTimeout) {
    window.clearTimeout(destinationHintTimeout);
    destinationHintTimeout = null;
  }
}

function persistDestinationFolder(value) {
  const trimmed = (value || '').trim();
  safeLocalStorageSet(DESTINATION_STORAGE_KEY, trimmed);
  if (!destinationSavedHint) {
    return;
  }
  if (!trimmed) {
    hideDestinationSavedHint();
    return;
  }
  destinationSavedHint.hidden = false;
  if (destinationHintTimeout) {
    window.clearTimeout(destinationHintTimeout);
  }
  destinationHintTimeout = window.setTimeout(() => {
    hideDestinationSavedHint();
  }, 1600);
}

function getStoredDestinationFolder() {
  return safeLocalStorageGet(DESTINATION_STORAGE_KEY) || '';
}

function updateDestinationOptions(items) {
  if (!destinationOptionsList) return;
  const folders = new Set();
  const stored = getStoredDestinationFolder();
  if (stored) {
    folders.add(stored);
  }
  if (Array.isArray(items)) {
    for (const entry of items) {
      const folderName = (entry?.output_folder || entry?.destination_folder || '').trim();
      if (folderName) {
        folders.add(folderName);
      }
    }
  }
  destinationOptionsList.innerHTML = '';
  Array.from(folders)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .forEach((folder) => {
      const option = document.createElement('option');
      option.value = folder;
      destinationOptionsList.appendChild(option);
    });
}

function handleDestinationInputChange(event) {
  const value = event?.target?.value ?? destinationInput?.value ?? '';
  persistDestinationFolder(value);
  if (liveFolderInput && !liveFolderInput.value) {
    liveFolderInput.value = value;
  }
}

function handleLiveFolderChange(event) {
  const value = event?.target?.value ?? liveFolderInput?.value ?? '';
  persistDestinationFolder(value);
  if (destinationInput && !destinationInput.value) {
    destinationInput.value = value;
  }
}

function splitIntoParagraphs(text) {
  return (text ?? '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function ensureParagraph(container, index) {
  let node = container.children[index];
  if (!node || node.tagName !== 'P') {
    const paragraph = document.createElement('p');
    paragraph.dataset.typing = 'false';
    if (node) {
      container.insertBefore(paragraph, node);
    } else {
      container.appendChild(paragraph);
    }
    node = paragraph;
  }
  return node;
}

function trimParagraphNodes(container, desiredLength) {
  if (!container) return;
  while (container.children.length > desiredLength) {
    container.removeChild(container.lastElementChild);
  }
}

function resetStreamingContainer(container, placeholder) {
  if (!container) return;
  ensureAutoScrollTracking(container);
  cancelTyping(container);
  container.dataset.fullText = '';
  container.dataset.paragraphs = JSON.stringify([]);
  container.dataset.typing = 'false';
  container.dataset.typingToken = '';
  container.replaceChildren();
  container.dataset.autoScroll = 'true';
  if (placeholder) {
    const placeholderNode = document.createElement('p');
    placeholderNode.classList.add('placeholder');
    placeholderNode.textContent = placeholder;
    container.appendChild(placeholderNode);
  }
}

function getAutoScrollThreshold(container) {
  const parsed = Number(container?.dataset?.autoScrollThreshold);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : AUTO_SCROLL_THRESHOLD;
}

function distanceFromScrollEnd(container) {
  if (!container) return Number.POSITIVE_INFINITY;
  return container.scrollHeight - (container.scrollTop + container.clientHeight);
}

function isContainerNearBottom(container) {
  return distanceFromScrollEnd(container) <= getAutoScrollThreshold(container);
}

function updateAutoScrollFlag(container) {
  if (!container) return;
  container.dataset.autoScroll = isContainerNearBottom(container) ? 'true' : 'false';
}

function ensureAutoScrollTracking(container) {
  if (!container || container.dataset.autoScrollTracking === 'true') return;
  const handleScroll = () => {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => updateAutoScrollFlag(container));
    } else {
      updateAutoScrollFlag(container);
    }
  };
  container.dataset.autoScrollTracking = 'true';
  if (!container.dataset.autoScroll) {
    container.dataset.autoScroll = 'true';
  }
  container.addEventListener('scroll', handleScroll, { passive: true });
  updateAutoScrollFlag(container);
}

livePreviewTargets.forEach((output) => ensureAutoScrollTracking(output));
ensureAutoScrollTracking(studentPreviewBody);
ensureAutoScrollTracking(modalText);
ensureAutoScrollTracking(liveStreamOutput);

function scrollContainerToEnd(container) {
  if (!container) return;
  ensureAutoScrollTracking(container);
  if (container.dataset.autoScroll === 'false') return;
  const performScroll = () => {
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    } else {
      container.scrollTop = container.scrollHeight;
    }
    updateAutoScrollFlag(container);
  };
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(performScroll);
  } else {
    performScroll();
  }
}

function computeTypingSpeed(item, text) {
  const charCount = Math.max(1, (text ?? '').length);
  const runtime = Number(item?.runtime_seconds ?? 0);
  const duration = Number(item?.duration ?? 0);
  let reference = Number.isFinite(runtime) && runtime > 0 ? runtime : duration;
  if (!Number.isFinite(reference) || reference <= 0) {
    reference = Math.max(charCount / 18, 6);
  }
  let cps = charCount / Math.max(reference, 1);
  const model = (item?.model_size || '').toLowerCase();
  if (model.includes('large')) cps *= 0.82;
  if (model.includes('medium')) cps *= 0.94;
  if (model.includes('small')) cps *= 1.08;
  if (model.includes('tiny')) cps *= 1.18;
  const device = (item?.device_preference || '').toLowerCase();
  if (device === 'cpu') cps *= 0.85;
  if (device === 'gpu' || device === 'cuda') cps *= 1.05;
  if (item?.status === 'processing') {
    cps *= 0.92;
  }
  if (!Number.isFinite(cps) || cps <= 0) {
    cps = 48;
  }
  return Math.max(8, cps * 1.12);
}

function playTypewriterJob({ container, text, speedHint, placeholder, autoScroll = true, token }) {
  return new Promise((resolve) => {
    if (!container) {
      resolve();
      return;
    }
    const sanitized = (text ?? '').trim();
    const fullPlaceholder = placeholder || 'Transcripción no disponible aún.';
    if (!sanitized) {
      resetStreamingContainer(container, fullPlaceholder);
      resolve();
      return;
    }

    const targetParagraphs = splitIntoParagraphs(sanitized);
    const previousFull = container.dataset.fullText || '';
    const shouldReset = !previousFull || !sanitized.startsWith(previousFull);
    if (shouldReset) {
      container.replaceChildren();
      container.dataset.paragraphs = JSON.stringify([]);
    }

    const previousParagraphs = JSON.parse(container.dataset.paragraphs || '[]');
    trimParagraphNodes(container, targetParagraphs.length);

    const animations = [];
    targetParagraphs.forEach((paragraphText, index) => {
      const paragraphElement = ensureParagraph(container, index);
      const previousText = shouldReset ? '' : previousParagraphs[index] ?? paragraphElement.textContent ?? '';
      if (!paragraphText) {
        paragraphElement.textContent = '';
        paragraphElement.dataset.typing = 'false';
        return;
      }

      if (shouldReset || !paragraphText.startsWith(previousText)) {
        paragraphElement.textContent = '';
        animations.push({ element: paragraphElement, base: '', addition: paragraphText });
      } else if (paragraphText.length > previousText.length) {
        paragraphElement.textContent = previousText;
        animations.push({
          element: paragraphElement,
          base: previousText,
          addition: paragraphText.slice(previousText.length),
        });
      } else {
        paragraphElement.textContent = paragraphText;
        paragraphElement.dataset.typing = 'false';
      }
    });

    const finalize = () => {
      container.dataset.fullText = sanitized;
      container.dataset.paragraphs = JSON.stringify(targetParagraphs);
      container.dataset.typing = 'false';
      if (autoScroll) {
        scrollContainerToEnd(container);
      }
      resolve();
    };

    if (!animations.length) {
      finalize();
      return;
    }

    const normalizedSpeed = Math.max(12, speedHint || 48);
    const charDelay = Math.max(1, 1000 / normalizedSpeed);
    let animationIndex = 0;

    const runNext = () => {
      if (animationIndex >= animations.length) {
        finalize();
        return;
      }
      const { element, base, addition } = animations[animationIndex];
      let currentIndex = 0;
      let currentText = base;
      element.dataset.typing = 'true';

      const step = () => {
        if (container.dataset.typingToken !== token) {
          element.dataset.typing = 'false';
          finalize();
          return;
        }
        if (currentIndex >= addition.length) {
          element.dataset.typing = 'false';
          animationIndex += 1;
          runNext();
          return;
        }
        currentText += addition[currentIndex];
        element.textContent = currentText;
        if (autoScroll) {
          scrollContainerToEnd(container);
        }
        currentIndex += 1;
        window.setTimeout(step, charDelay);
      };

      step();
    };

    container.dataset.typing = 'true';
    runNext();
  });
}

function processTypingQueue() {
  if (!typingQueue.length) {
    typingInProgress = false;
    return;
  }
  typingInProgress = true;
  const job = typingQueue.shift();
  playTypewriterJob(job).then(() => {
    processTypingQueue();
  });
}

function enqueueTypewriter(container, text, speedHint, options = {}) {
  if (!container) return;
  for (let idx = typingQueue.length - 1; idx >= 0; idx -= 1) {
    if (typingQueue[idx].container === container) {
      typingQueue.splice(idx, 1);
    }
  }
  const token = `${Date.now()}-${Math.random()}`;
  container.dataset.typingToken = token;
  typingQueue.push({
    container,
    text,
    speedHint,
    placeholder: options.placeholder,
    autoScroll: options.autoScroll !== false,
    token,
  });
  if (!typingInProgress) {
    processTypingQueue();
  }
}

function renderTranscript(element, text, { placeholder = 'Transcripción no disponible aún.' } = {}) {
  if (!element) return;
  ensureAutoScrollTracking(element);
  const safeText = (text ?? '').trim();
  element.dataset.typing = 'false';
  element.dataset.typingToken = '';

  if (element.tagName === 'PRE') {
    element.textContent = safeText || placeholder;
    return;
  }

  if (!safeText) {
    element.textContent = placeholder;
    return;
  }

  const chunks = splitIntoParagraphs(safeText);

  if (!chunks.length) {
    element.textContent = placeholder;
    return;
  }

  element.replaceChildren();
  for (const chunk of chunks) {
    const paragraph = document.createElement('p');
    paragraph.textContent = chunk;
    element.appendChild(paragraph);
  }
}

function renderStreamingView(container, item, options = {}) {
  if (!container) return;
  ensureAutoScrollTracking(container);
  const placeholder = options.placeholder ?? 'Transcripción no disponible aún.';
  const status = item?.status ?? 'completed';
  const text = (item?.text ?? '').trim();
  container.dataset.stream = status === 'processing' ? 'true' : 'false';

  if (!text) {
    cancelTyping(container);
    resetStreamingContainer(container, placeholder);
    return;
  }

  if (status !== 'processing') {
    cancelTyping(container);
    renderTranscript(container, text, { placeholder });
    if (options.autoScroll !== false) {
      scrollContainerToEnd(container);
    }
    return;
  }

  const speedMultiplier = options.speedMultiplier ?? 1;
  const speedHint = computeTypingSpeed(item, text) * speedMultiplier;
  enqueueTypewriter(container, text, speedHint, {
    placeholder,
    autoScroll: options.autoScroll !== false,
  });
}

function renderModalText(text) {
  const placeholder = 'Transcripción no disponible aún.';
  renderTranscript(modalText, text, { placeholder });
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
  if (!isoString) {
    return 'Sin fecha';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }
  return date.toLocaleString();
}

function formatShortDate(isoString) {
  if (!isoString) {
    return 'Sin fecha';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }
  return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
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

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'N/A';
  }
  if (seconds < 90) {
    return `${seconds.toFixed(1)} s`;
  }
  return `${(seconds / 60).toFixed(1)} min`;
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

function determineTranscriptionSeverity(item) {
  if (!item) return 'info';
  if (item.status === 'failed' || item.error_message) {
    return 'error';
  }
  let severity = 'info';
  const events = Array.isArray(item?.debug_events) ? item.debug_events : [];
  for (const event of events) {
    const level = (event.level || '').toLowerCase();
    if (level === 'error') {
      return 'error';
    }
    if (level === 'warning') {
      severity = 'warning';
    }
  }
  return severity;
}

function renderDebugEvents(container, events) {
  if (!container) return;
  const list = container.querySelector('ul');
  if (!list) return;
  const safeEvents = Array.isArray(events) ? events.slice(-6) : [];
  list.innerHTML = '';
  if (!safeEvents.length) {
    container.hidden = true;
    return;
  }
  for (const event of safeEvents) {
    const item = document.createElement('li');
    const level = (event.level || '').toLowerCase();
    if (level) {
      item.dataset.level = level;
    }
    const meta = document.createElement('span');
    meta.className = 'debug-event__meta';
    const stage = event.stage ? event.stage.toUpperCase() : 'SIN ETAPA';
    meta.textContent = `${formatShortDate(event.timestamp)} • ${stage}`;
    item.appendChild(meta);
    const message = document.createElement('span');
    message.className = 'debug-event__message';
    message.textContent = event.message || 'Evento sin mensaje';
    item.appendChild(message);
    const extraEntries = event.extra && typeof event.extra === 'object'
      ? Object.entries(event.extra)
          .filter(([key, value]) => value !== null && value !== undefined && value !== '')
          .map(([key, value]) => `${key}: ${value}`)
      : [];
    if (extraEntries.length) {
      const extra = document.createElement('span');
      extra.className = 'debug-event__extra';
      extra.textContent = extraEntries.join(' • ');
      item.appendChild(extra);
    }
    list.appendChild(item);
  }
  container.hidden = false;
}

function deriveFolderMetadata(item) {
  const tags = new Set();
  const topicNumbers = new Set();
  const base = `${item?.output_folder ?? ''} ${item?.subject ?? ''} ${item?.original_filename ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (!base.trim()) {
    return { tags, topicNumbers };
  }
  if (base.includes('temario')) {
    tags.add('temario');
  }
  if (base.includes('practica') || base.includes('practicas')) {
    tags.add('practicas');
  }
  if (base.includes('ejercicio') || base.includes('ejercicios')) {
    tags.add('ejercicios');
  }
  if (base.includes('teoria')) {
    tags.add('teoria');
  }
  const topicRegex = /tema[\s._-]*(\d+)/gi;
  let matched = false;
  let match;
  while ((match = topicRegex.exec(base))) {
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value)) {
      topicNumbers.add(value);
      matched = true;
    }
  }
  if (base.includes('tema') || matched) {
    tags.add('tema');
  }
  return { tags, topicNumbers };
}

function buildFolderGroups(items) {
  const results = Array.isArray(items) ? items : [];
  const groups = new Map();
  for (const item of results) {
    const folderNameRaw = item?.output_folder || item?.destination_folder || 'Sin carpeta';
    const folderName = (folderNameRaw || '').trim() || 'Sin carpeta';
    const key = folderName.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, {
        name: folderName,
        items: [],
        latestDate: null,
        latestISO: null,
        tags: new Set(),
        topicNumbers: new Set(),
        subjects: new Set(),
        severity: 'info',
      });
    }
    const group = groups.get(key);
    group.items.push(item);
    if (item?.subject) {
      group.subjects.add(item.subject);
    }
    const isoDate = item?.updated_at || item?.created_at;
    const timestamp = isoDate ? Date.parse(isoDate) : Number.NaN;
    if (!Number.isNaN(timestamp)) {
      if (!group.latestDate || timestamp > group.latestDate) {
        group.latestDate = timestamp;
        group.latestISO = isoDate;
      }
    }
    const meta = deriveFolderMetadata(item);
    meta.tags.forEach((tag) => group.tags.add(tag));
    meta.topicNumbers.forEach((num) => group.topicNumbers.add(num));
    const severity = determineTranscriptionSeverity(item);
    if (SEVERITY_RANK[severity] > SEVERITY_RANK[group.severity]) {
      group.severity = severity;
    }
  }
  const ordered = Array.from(groups.values());
  ordered.sort((a, b) => (b.latestDate || 0) - (a.latestDate || 0));
  return ordered;
}

function updateFolderTopicOptions(groups) {
  if (!folderTopicFilter) return;
  const previous = folderTopicFilter.value || 'all';
  const topics = new Set();
  groups.forEach((group) => {
    group.topicNumbers.forEach((num) => {
      if (Number.isFinite(num)) {
        topics.add(num);
      }
    });
  });
  const sortedTopics = Array.from(topics).sort((a, b) => a - b);
  folderTopicFilter.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = 'all';
  defaultOption.textContent = 'Todos';
  folderTopicFilter.appendChild(defaultOption);
  sortedTopics.forEach((topic) => {
    const option = document.createElement('option');
    option.value = String(topic);
    option.textContent = `Tema ${topic}`;
    folderTopicFilter.appendChild(option);
  });
  if (previous !== 'all' && sortedTopics.includes(Number(previous))) {
    folderTopicFilter.value = previous;
    folderFilters.topic = previous;
  } else {
    folderTopicFilter.value = 'all';
    folderFilters.topic = 'all';
  }
}

function filterFolderGroups(groups) {
  const searchTerm = folderFilters.search;
  return groups.filter((group) => {
    if (folderFilters.status !== 'all') {
      const hasMatch = group.items.some((item) => matchesFolderStatus(item, folderFilters.status));
      if (!hasMatch) {
        return false;
      }
    }
    if (folderFilters.category !== 'all') {
      if (
        folderFilters.category === 'tema' &&
        !group.tags.has('tema') &&
        group.topicNumbers.size === 0
      ) {
        return false;
      }
      if (
        folderFilters.category !== 'tema' &&
        !group.tags.has(folderFilters.category)
      ) {
        return false;
      }
    }
    if (folderFilters.topic !== 'all') {
      const topicNumber = Number(folderFilters.topic);
      if (!group.topicNumbers.has(topicNumber)) {
        return false;
      }
    }
    if (searchTerm) {
      const haystack = [
        group.name,
        ...group.subjects,
        ...Array.from(group.tags).map((tag) => FOLDER_TAG_LABELS[tag] || tag),
        ...Array.from(group.topicNumbers).map((num) => `tema ${num}`),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(searchTerm)) {
        return false;
      }
    }
    return true;
  });
}

function matchesFolderStatus(item, filterValue) {
  if (!item) return false;
  const status = (item.status || '').toLowerCase();
  switch (filterValue) {
    case 'in-progress':
      return status === 'pending' || status === 'processing';
    case 'completed':
      return status === 'completed';
    case 'failed':
      return status === 'failed';
    case 'premium':
      return Boolean(item.premium_enabled);
    default:
      return true;
  }
}

function createFolderGroupNode(group) {
  const article = document.createElement('article');
  article.className = 'folder-group';
  article.dataset.severity = group.severity || 'info';
  const header = document.createElement('div');
  header.className = 'folder-group__header';
  const title = document.createElement('h3');
  title.textContent = group.name;
  header.appendChild(title);
  const count = document.createElement('span');
  count.className = 'folder-group__count';
  count.textContent = `${group.items.length} archivo${group.items.length === 1 ? '' : 's'}`;
  header.appendChild(count);
  article.appendChild(header);

  const meta = document.createElement('p');
  meta.className = 'folder-group__meta';
  const subjectsLabel = group.subjects.size
    ? ` • Materias: ${Array.from(group.subjects).join(', ')}`
    : '';
  meta.textContent = `Última actualización: ${formatShortDate(group.latestISO)}${subjectsLabel}`;
  article.appendChild(meta);

  const tagLabels = [
    ...Array.from(group.tags).map((tag) => FOLDER_TAG_LABELS[tag] || tag),
    ...Array.from(group.topicNumbers)
      .sort((a, b) => a - b)
      .map((num) => `Tema ${num}`),
  ];
  if (tagLabels.length) {
    const tagList = document.createElement('div');
    tagList.className = 'folder-group__tags';
    tagLabels.forEach((label) => {
      const badge = document.createElement('span');
      badge.className = 'folder-group__tag';
      badge.textContent = label;
      tagList.appendChild(badge);
    });
    article.appendChild(tagList);
  }

  const list = document.createElement('ul');
  list.className = 'folder-group__list';
  const sortedItems = [...group.items].sort((a, b) => {
    const aDate = Date.parse(a?.updated_at || a?.created_at || 0) || 0;
    const bDate = Date.parse(b?.updated_at || b?.created_at || 0) || 0;
    return bDate - aDate;
  });
  sortedItems.slice(0, 4).forEach((item) => {
    const listItem = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'folder-group__item';
    button.setAttribute('data-folder-transcription', item.id);

    const titleSpan = document.createElement('span');
    titleSpan.className = 'folder-group__item-title';
    titleSpan.textContent = item.original_filename;
    button.appendChild(titleSpan);

    const metaRow = document.createElement('div');
    metaRow.className = 'folder-group__item-meta';
    const dateInfo = document.createElement('span');
    dateInfo.textContent = formatShortDate(item.updated_at || item.created_at);
    metaRow.appendChild(dateInfo);

    const status = document.createElement('span');
    status.className = 'folder-group__status';
    status.dataset.status = item.status;
    status.textContent = formatStatus(item.status);
    metaRow.appendChild(status);

    if (item.model_size) {
      const modelInfo = document.createElement('span');
      modelInfo.textContent = item.model_size;
      metaRow.appendChild(modelInfo);
    }

    button.appendChild(metaRow);

    const severity = determineTranscriptionSeverity(item);
    if (severity !== 'info') {
      const severityBadge = document.createElement('span');
      severityBadge.className = 'folder-group__tag';
      severityBadge.textContent = severity === 'warning' ? 'Advertencia' : 'Error';
      button.appendChild(severityBadge);
    }

    listItem.appendChild(button);
    list.appendChild(listItem);
  });
  article.appendChild(list);

  if (group.items.length > 4) {
    const extra = document.createElement('p');
    extra.className = 'folder-group__meta';
    extra.textContent = `… y ${group.items.length - 4} elemento(s) más en esta carpeta.`;
    article.appendChild(extra);
  }

  return article;
}

function renderHomeFolderSummary(groups) {
  if (!homeFolderSummary) return;
  homeFolderSummary.innerHTML = '';
  const summary = Array.isArray(groups) ? groups.slice(0, 4) : [];
  if (!summary.length) {
    const empty = document.createElement('p');
    empty.className = 'home-folder-summary__empty';
    empty.textContent = 'Sube tu primer archivo para crear una carpeta y verla aquí.';
    homeFolderSummary.appendChild(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'home-folder-summary__list';

  summary.forEach((group) => {
    const item = document.createElement('li');
    item.className = 'home-folder-summary__item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'home-folder-summary__button';
    button.setAttribute('data-folder-jump', group.name);

    const title = document.createElement('span');
    title.className = 'home-folder-summary__name';
    title.textContent = group.name;
    button.appendChild(title);

    const itemsCount = Array.isArray(group.items) ? group.items.length : 0;
    const countLabel = itemsCount === 1 ? '1 archivo' : `${itemsCount} archivos`;
    const updatedLabel = group.latestISO ? formatDate(group.latestISO) : 'Sin fecha';
    const meta = document.createElement('span');
    meta.className = 'home-folder-summary__meta';
    meta.textContent = `${countLabel} • ${updatedLabel}`;
    button.appendChild(meta);

    const tags = Array.from(group.tags ?? []).map((tag) => FOLDER_TAG_LABELS[tag] ?? tag);
    if (tags.length) {
      const tagsEl = document.createElement('span');
      tagsEl.className = 'home-folder-summary__tags';
      tagsEl.textContent = tags.join(' · ');
      button.appendChild(tagsEl);
    }

    const subjects = Array.from(group.subjects ?? []);
    if (subjects.length) {
      const subjectsEl = document.createElement('span');
      subjectsEl.className = 'home-folder-summary__subjects';
      const label = subjects.slice(0, 2).join(' • ');
      subjectsEl.textContent = label;
      button.appendChild(subjectsEl);
    }

    if (group.severity && group.severity !== 'info') {
      const badge = document.createElement('span');
      badge.className = `home-folder-summary__badge is-${group.severity}`;
      badge.textContent = group.severity === 'warning' ? 'Advertencias' : 'Error';
      button.appendChild(badge);
    }

    item.appendChild(button);
    list.appendChild(item);
  });

  homeFolderSummary.appendChild(list);
}

function applyFolderFilters() {
  if (!folderGroupsContainer) return;
  folderGroupsContainer.innerHTML = '';
  if (!cachedFolderGroups.length) {
    const empty = document.createElement('p');
    empty.className = 'folder-group__empty';
    empty.textContent = 'Todavía no hay carpetas registradas.';
    folderGroupsContainer.appendChild(empty);
    return;
  }
  const filtered = filterFolderGroups(cachedFolderGroups);
  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'folder-group__empty';
    empty.textContent = 'No hay carpetas que coincidan con los filtros.';
    folderGroupsContainer.appendChild(empty);
    return;
  }
  for (const group of filtered) {
    folderGroupsContainer.appendChild(createFolderGroupNode(group));
  }
}

function renderFolderLibrary(items) {
  if (!folderGroupsContainer) return;
  cachedFolderGroups = buildFolderGroups(items);
  updateFolderTopicOptions(cachedFolderGroups);
  updateDestinationOptions(items);
  renderHomeFolderSummary(cachedFolderGroups);
  applyFolderFilters();
}

function updateSystemAlerts(items) {
  if (!systemAlerts) return;
  const results = Array.isArray(items) ? items : [];
  const messages = new Set();
  for (const item of results) {
    const events = Array.isArray(item?.debug_events) ? item.debug_events : [];
    for (const event of events) {
      const message = (event.message || '').toLowerCase();
      const stage = (event.stage || '').toLowerCase();
      const extra = event?.extra || {};
      if (!message) continue;
      if (message.includes('whisperx no disponible')) {
        messages.add(
          'WhisperX requiere autenticación en HuggingFace. Configura la variable HUGGINGFACE_TOKEN para habilitar la diarización avanzada.',
        );
      }
      if (message.includes('faster-whisper de respaldo')) {
        messages.add(
          'Se activó el modelo de respaldo en CPU. Verifica CUDA o tu GPU para mantener el rendimiento.',
        );
      }
      if (stage === 'device.unavailable' || stage === 'device.fallback') {
        messages.add(
          'CUDA no está disponible en este momento. Comprueba que PyTorch detecte la GPU con `python -c "import torch; print(torch.cuda.is_available())"` y revisa tus drivers o WHISPER_FORCE_CUDA.',
        );
      }
      if (stage === 'device.cuda-error') {
        const details = String(extra?.error ?? '').slice(0, 160) || 'consulta los registros del servidor.';
        messages.add(
          `CUDA devolvió un error al inicializar (${details}). Verifica controladores, versión de PyTorch y reinicia el servicio si es necesario.`,
        );
      }
      if (stage === 'load-model.failed') {
        messages.add(
          'Ninguna configuración de faster-whisper pudo cargarse. Limpia la caché de modelos en data/models o reinstala dependencias para restaurar el servicio.',
        );
      }
    }
  }
  if (!messages.size) {
    systemAlerts.hidden = true;
    systemAlerts.innerHTML = '';
    return;
  }
  systemAlerts.innerHTML = `
    <p>Advertencias detectadas</p>
    <ul>${Array.from(messages)
      .map((text) => `<li>${text}</li>`)
      .join('')}</ul>
  `;
  systemAlerts.hidden = false;
}

function renderHomePendingList(items) {
  if (!homePendingList || !homePendingEmpty) return;
  const pendingItems = (Array.isArray(items) ? items : []).filter(
    (item) => item.status === 'processing',
  );

  if (homePendingCount) {
    if (pendingItems.length) {
      const label =
        pendingItems.length === 1
          ? '1 transcripción en curso'
          : `${pendingItems.length} transcripciones en curso`;
      homePendingCount.textContent = label;
      homePendingCount.dataset.state = 'active';
    } else {
      homePendingCount.textContent = 'Sin tareas en curso';
      homePendingCount.dataset.state = 'empty';
    }
  }

  if (!pendingItems.length) {
    homePendingList.hidden = true;
    homePendingList.innerHTML = '';
    homePendingEmpty.hidden = false;
    return;
  }

  homePendingEmpty.hidden = true;
  homePendingList.hidden = false;
  homePendingList.innerHTML = '';

  pendingItems.slice(0, 4).forEach((item) => {
    const li = document.createElement('li');
    li.className = 'home-pending-item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'home-pending-item__button';
    button.setAttribute('data-pending-id', item.id);

    const content = document.createElement('div');
    content.className = 'home-pending-item__content';

    const title = document.createElement('span');
    title.className = 'home-pending-item__title';
    title.textContent = item.original_filename || 'Transcripción en curso';
    content.appendChild(title);

    const folderLabel = item.output_folder || item.destination_folder || 'Sin carpeta';
    const modelLabel = item.model_size || 'Modelo automático';
    const deviceHint = (item.device_preference || '').trim().toUpperCase();
    const deviceLabel = deviceHint || 'AUTO';
    const contentMeta = document.createElement('span');
    contentMeta.className = 'home-pending-item__meta';
    contentMeta.textContent = `${folderLabel} • ${modelLabel} • ${deviceLabel}`;
    content.appendChild(contentMeta);

    button.appendChild(content);

    const statusWrapper = document.createElement('div');
    statusWrapper.className = 'home-pending-item__status';

    const statusBadge = document.createElement('span');
    statusBadge.className = 'home-pending-item__badge';
    statusBadge.dataset.status = item.status;
    statusBadge.textContent = formatStatus(item.status);
    statusWrapper.appendChild(statusBadge);

    const detailParts = [];
    const runtimeSeconds = Number(item.runtime_seconds ?? 0);
    if (runtimeSeconds > 0) {
      detailParts.push(`Tiempo transcurrido: ${formatDuration(runtimeSeconds)}`);
    }
    const updatedLabel = formatShortDate(item.updated_at || item.created_at);
    if (updatedLabel) {
      detailParts.push(`Actualizado: ${updatedLabel}`);
    }
    const lastEvent = Array.isArray(item.debug_events)
      ? item.debug_events[item.debug_events.length - 1]
      : null;
    const stageParts = (lastEvent?.stage || '')
      .split(/[.\s_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
    const stage = stageParts.join(' ');
    if (stage) {
      detailParts.push(stage);
    }

    if (detailParts.length) {
      const details = document.createElement('span');
      details.className = 'home-pending-item__details';
      details.textContent = detailParts.join(' • ');
      statusWrapper.appendChild(details);
    }

    button.appendChild(statusWrapper);
    li.appendChild(button);
    homePendingList.appendChild(li);
  });
}

function renderHomeRecentList(items) {
  if (!homeRecentList) return;
  homeRecentList.innerHTML = '';
  const results = Array.isArray(items) ? [...items] : [];
  if (!results.length) {
    const empty = document.createElement('p');
    empty.className = 'home-recent-list__empty';
    empty.textContent = 'Tus últimas transcripciones aparecerán aquí en cuanto subas audio.';
    homeRecentList.appendChild(empty);
    return;
  }

  results.sort((a, b) => {
    const aDate = Date.parse(a?.updated_at || a?.created_at || 0) || 0;
    const bDate = Date.parse(b?.updated_at || b?.created_at || 0) || 0;
    return bDate - aDate;
  });

  const list = document.createElement('ul');
  list.className = 'home-recent-list__list';

  results.slice(0, 4).forEach((item) => {
    const li = document.createElement('li');
    li.className = 'home-recent-list__item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'home-recent-list__button';
    button.setAttribute('data-recent-id', item.id);

    const title = document.createElement('span');
    title.className = 'home-recent-list__title';
    title.textContent = item.original_filename;
    button.appendChild(title);

    const folderLabel = item.output_folder || item.destination_folder || 'Sin carpeta';
    const folder = document.createElement('span');
    folder.className = 'home-recent-list__folder';
    folder.textContent = folderLabel;
    button.appendChild(folder);

    const meta = document.createElement('span');
    meta.className = 'home-recent-list__meta';
    const statusLabel = formatStatus(item.status);
    const dateLabel = formatDate(item.updated_at || item.created_at);
    meta.textContent = `${statusLabel} • ${dateLabel}`;
    button.appendChild(meta);

    const preview = (item.text || '').trim();
    if (preview) {
      const excerpt = document.createElement('span');
      excerpt.className = 'home-recent-list__excerpt';
      excerpt.textContent = preview.slice(0, 120);
      button.appendChild(excerpt);
    }

    li.appendChild(button);
    list.appendChild(li);
  });

  homeRecentList.appendChild(list);
}

function renderTranscriptions(items) {
  if (!transcriptionList) return;
  if (!template || !('content' in template)) {
    console.warn('Plantilla de transcripción no disponible.');
    return;
  }
  transcriptionList.innerHTML = '';
  const results = Array.isArray(items) ? items : [];
  renderHomePendingList(results);
  renderHomeRecentList(results);
  renderFolderLibrary(results);
  updateSystemAlerts(results);
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
      card.dataset.severity = determineTranscriptionSeverity(item);
      card.dataset.transcriptionId = item.id;
    }
    node.querySelector('.transcription-title').textContent = item.original_filename;
    const statusBadge = node.querySelector('.status');
    if (statusBadge) {
      statusBadge.textContent = formatStatus(item.status);
      statusBadge.dataset.status = item.status;
    }
    const folderLabel = item.output_folder ?? item.destination_folder ?? '—';
    const durationLabel = formatDuration(Number(item.duration ?? 0));
    const runtimeLabel = formatDuration(Number(item.runtime_seconds ?? 0));
    const modelLabel = item.model_size ?? 'automático';
    const deviceLabel = item.device_preference ?? 'auto';
    const metaParts = [
      `Carpeta: ${folderLabel}`,
      `Modelo: ${modelLabel}`,
      `Dispositivo: ${deviceLabel}`,
      `Duración: ${durationLabel}`,
      `Ejecución: ${runtimeLabel}`,
      `Estado: ${item.status}`,
      `Creado: ${formatDate(item.created_at)}`,
    ];
    node.querySelector('.meta').textContent = metaParts.join(' • ');
    const preview = (item.text ?? '').trim();
    node.querySelector('.excerpt').textContent = preview ? preview.slice(0, 220) : 'Transcripción no disponible aún.';
    const cardProgress = node.querySelector('.card-progress');
    toggleCardProgress(item.id, item.status === 'processing', cardProgress);
    const downloadLink = node.querySelector('.download');
    const canDownload = item.status === 'completed';
    if (canDownload) {
      downloadLink.href = `${API_BASE}/${item.id}/download`;
      downloadLink.classList.remove('disabled');
      downloadLink.removeAttribute('aria-disabled');
      downloadLink.removeAttribute('data-disabled');
      downloadLink.title = 'Descargar TXT';
    } else {
      downloadLink.removeAttribute('href');
      downloadLink.classList.add('disabled');
      downloadLink.setAttribute('aria-disabled', 'true');
      downloadLink.dataset.disabled = 'true';
      downloadLink.title = 'Disponible cuando finalice la transcripción';
    }

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
    renderDebugEvents(node.querySelector('.debug-events'), item.debug_events);

    transcriptionList.appendChild(node);
  }
}

async function refreshTranscriptions(options = {}) {
  const { force = false } = options;
  if (document.hidden && !force) {
    refreshQueuedWhileHidden = true;
    return null;
  }
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const task = (async () => {
    try {
      const url = new URL(API_BASE, window.location.origin);
      if (currentQuery) {
        url.searchParams.set('q', currentQuery);
      }
      if (premiumOnly) {
        url.searchParams.set('premium_only', 'true');
      }

      const data = await fetchJSON(url);
      const results = Array.isArray(data?.results) ? data.results : [];
      cachedResults = results;
      const signature = computeResultsSignature(results);
      const changed = force || signature !== lastResultsSignature;
      lastResultsSignature = signature;

      if (changed) {
        renderTranscriptions(results);
      }
      updateMetrics(results);
      updateLivePreview(results);

      const pendingItems = results.filter((item) => item.status === 'processing');
      lastPendingCount = pendingItems.length;
      if (pendingItems.length) {
        if (document.hidden) {
          refreshQueuedWhileHidden = true;
          stopPolling();
        } else {
          const interval = computePollingInterval(pendingItems);
          scheduleNextPoll(interval);
        }
      } else {
        stopPolling();
        completeUploadProgress(true);
      }

      refreshQueuedWhileHidden = false;
      return data;
    } finally {
      refreshInFlight = null;
    }
  })();

  refreshInFlight = task;
  return task;
}

function computePollingInterval(pendingItems) {
  if (!Array.isArray(pendingItems) || !pendingItems.length) {
    return 2400;
  }
  let multiplier = 1;
  const modelHints = pendingItems.map((item) => (item.model_size || modelSelect?.value || '').toLowerCase());
  if (modelHints.some((model) => model.includes('large'))) {
    multiplier = Math.max(multiplier, 1.65);
  } else if (modelHints.some((model) => model.includes('medium'))) {
    multiplier = Math.max(multiplier, 1.35);
  } else if (modelHints.some((model) => model.includes('small'))) {
    multiplier = Math.max(multiplier, 1.1);
  }

  if (pendingItems.some((item) => (item.device_preference || '').toLowerCase() === 'cpu')) {
    multiplier += 0.25;
  }

  const longestText = Math.max(
    0,
    ...pendingItems.map((item) => ((item.text ?? '').length || 0)),
  );
  if (longestText > 4000) {
    multiplier += 0.6;
  } else if (longestText > 1800) {
    multiplier += 0.35;
  }

  const observedRuntime = Math.max(
    0,
    ...pendingItems.map((item) => Number(item.runtime_seconds ?? 0) || 0),
  );
  if (observedRuntime > 0) {
    multiplier = Math.max(multiplier, Math.min(observedRuntime / 4, 2.4));
  }

  return Math.max(1600, Math.min(2400 * multiplier, 6500));
}

function scheduleNextPoll(delay) {
  stopPolling();
  const interval = Math.max(1200, Math.min(delay || 2400, 7000));
  if (document.hidden) {
    refreshQueuedWhileHidden = true;
    return;
  }
  pollingTimeout = window.setTimeout(() => {
    refreshTranscriptions().catch(() => stopPolling());
  }, interval);
}

function stopPolling() {
  if (pollingTimeout) {
    clearTimeout(pollingTimeout);
    pollingTimeout = null;
  }
}

async function deleteTranscription(id) {
  if (!confirm('¿Eliminar esta transcripción?')) return;
  try {
    await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    await refreshTranscriptions({ force: true });
  } catch (error) {
    alert(`No se pudo eliminar: ${error.message}`);
  }
}

function handleSearch(event) {
  clearTimeout(searchTimer);
  currentQuery = event.target.value.trim();
  searchTimer = setTimeout(() => {
    refreshTranscriptions({ force: true }).catch((error) => {
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
  cachedPlans = safePlans;
  if (!safePlans.length) {
    plansContainer.innerHTML = '<p>No hay planes disponibles actualmente.</p>';
    return;
  }

  for (const plan of safePlans) {
    const card = document.createElement('article');
    card.className = 'plan-card';
    const perks = (plan.perks ?? []).map((perk) => `<li>${perk}</li>`).join('');
    const priceEuros = (plan.price_cents ?? 0) / 100;
    const isStudentPlan = plan.price_cents === 0;
    const priceLabel = isStudentPlan
      ? 'Gratis • con anuncios y ejecución local'
      : `€${priceEuros.toFixed(2)} ${plan.currency ?? 'EUR'}`;
    const actionButton = isStudentPlan
      ? `<button type="button" class="ghost" data-student="true" data-plan="${plan.slug}">Configurar plan estudiante</button>`
      : `<button type="button" class="primary" data-plan="${plan.slug}">Activar premium</button>`;
    card.innerHTML = `
      <h3>${plan.name}</h3>
      <p class="plan-meta">${plan.description ?? 'Notas premium, resúmenes y recordatorios inteligentes incluidos.'}</p>
      <p class="plan-minutes">Cobertura recomendada: hasta ${plan.max_minutes} minutos por archivo.</p>
      <p class="plan-price">${priceLabel}</p>
      <ul class="plan-perks">${perks}</ul>
      <div class="plan-actions">
        ${actionButton}
      </div>
    `;
    if (isStudentPlan) {
      card.dataset.planType = 'student';
    }
    plansContainer.appendChild(card);
  }
}

function showStudentPlanInstructions(plan) {
  if (!checkoutStatus) return;
  const perks = (plan?.perks ?? []).map((perk) => `<li>${perk}</li>`).join('');
  const folder = destinationInput?.value?.trim() || plan?.slug || 'tu-carpeta';
  checkoutStatus.innerHTML = `
    <p><strong>${plan?.name ?? 'Plan estudiante'}</strong> listo para usar.</p>
    <p>${plan?.description ?? 'Ejecuta Whisper localmente con anuncios suaves.'}</p>
    <ol class="student-steps">
      <li>Descarga y ejecuta el cliente local <code>whisperx-local</code> en tu ordenador.</li>
      <li>Usa la carpeta <code>${folder}</code> como destino para sincronizar tus TXT.</li>
      <li>Mantén esta pestaña abierta para recibir anuncios y actualizaciones en vivo.</li>
    </ol>
    <p>Beneficios incluidos:</p>
    <ul class="student-perks">${perks}</ul>
  `;
  checkoutStatus.classList.add('success');
}

function supportsLiveStreaming() {
  return Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
}

function setLiveStreamStatus(message, variant = 'info') {
  if (!liveStreamStatus) return;
  liveStreamStatus.textContent = message;
  liveStreamStatus.dataset.state = variant === 'error' ? 'error' : 'info';
}

function resetLiveStreamUI(options = {}) {
  if (!liveStreamOutput) return;
  const placeholder = options.placeholder || 'Tu texto aparecerá aquí cuando empieces a hablar.';
  resetStreamingContainer(liveStreamOutput, placeholder);
  liveStreamOutput.dataset.stream = 'false';
}

function updateLiveControls() {
  const supported = supportsLiveStreaming();
  if (liveStartButton) {
    liveStartButton.disabled = !supported || liveSessionActive;
  }
  if (liveStopButton) {
    liveStopButton.disabled = !liveSessionActive;
  }
  if (liveResetButton) {
    liveResetButton.disabled = !liveSessionId;
  }
  if (!supported) {
    setLiveStreamStatus(
      'Tu navegador no permite grabación en vivo. Usa Chrome, Edge o un navegador compatible para habilitarlo.',
      'error',
    );
  }
}

function buildLiveSessionPayload() {
  const language = liveLanguageSelect?.value?.trim();
  const model = liveModelSelect?.value?.trim();
  const device = liveDeviceSelect?.value?.trim();
  return {
    language: language || null,
    model_size: model || null,
    device_preference: device || null,
  };
}

function applyLiveResult(result, options = {}) {
  if (!liveStreamOutput) return;
  const final = options.final === true;
  const item = {
    text: result?.text ?? '',
    status: final ? 'completed' : 'processing',
    model_size: result?.model_size || liveModelSelect?.value || '',
    device_preference: result?.device_preference || liveDeviceSelect?.value || '',
    duration: result?.duration,
    runtime_seconds: result?.runtime_seconds,
  };
  renderStreamingView(liveStreamOutput, item, {
    placeholder: 'Esperando audio en vivo…',
  });
  liveStreamOutput.dataset.stream = final ? 'false' : 'true';
  if (final) {
    scrollContainerToEnd(liveStreamOutput);
  }
}

async function sendLiveChunk(blob) {
  if (!liveSessionId || !blob || !blob.size) {
    return;
  }
  const formData = new FormData();
  const extension = blob.type && blob.type.includes('wav') ? '.wav' : '.webm';
  formData.append('chunk', blob, `chunk-${Date.now()}${extension}`);
  const response = await fetchJSON(`${API_BASE}/live/sessions/${liveSessionId}/chunk`, {
    method: 'POST',
    body: formData,
  });
  applyLiveResult(response);
  const chunkCount = Number(response?.chunk_count ?? 0);
  setLiveStreamStatus(
    chunkCount > 0
      ? `Transcribiendo en vivo (${chunkCount} fragmento${chunkCount === 1 ? '' : 's'})…`
      : 'Transcribiendo en vivo…',
  );
}

function enqueueLiveChunk(blob) {
  if (!blob || !blob.size || !liveSessionId) return;
  liveChunkChain = liveChunkChain
    .then(() => sendLiveChunk(blob))
    .catch((error) => {
      console.error('Fallo al procesar fragmento en vivo:', error);
      setLiveStreamStatus(`Error al procesar el audio: ${error.message}`, 'error');
      liveSessionActive = false;
      throw error;
    });
  return liveChunkChain;
}

async function startLiveSession() {
  if (liveSessionActive || !supportsLiveStreaming()) {
    updateLiveControls();
    return;
  }
  try {
    setLiveStreamStatus('Creando sesión en vivo…');
    const payload = buildLiveSessionPayload();
    const session = await fetchJSON(`${API_BASE}/live/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    liveSessionId = session?.session_id;
    if (!liveSessionId) {
      throw new Error('No se pudo iniciar la sesión en vivo');
    }
    const folder = liveFolderInput?.value?.trim();
    if (folder) {
      persistDestinationFolder(folder);
    }
    liveSessionActive = true;
    liveChunkChain = Promise.resolve();
    liveMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferredMime =
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : undefined;
    liveRecorder = preferredMime
      ? new MediaRecorder(liveMediaStream, { mimeType: preferredMime })
      : new MediaRecorder(liveMediaStream);
    liveRecorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size) {
        enqueueLiveChunk(event.data);
      }
    });
    liveRecorder.addEventListener('stop', () => {
      if (liveMediaStream) {
        liveMediaStream.getTracks().forEach((track) => track.stop());
        liveMediaStream = null;
      }
    });
    liveRecorder.addEventListener('error', (event) => {
      const message = event?.error?.message || 'Error desconocido del grabador';
      setLiveStreamStatus(`La grabación en vivo falló: ${message}`, 'error');
      liveSessionActive = false;
      if (liveRecorder && liveRecorder.state !== 'inactive') {
        liveRecorder.stop();
      }
    });
    resetLiveStreamUI({ placeholder: 'Escuchando… di algo para comenzar.' });
    liveRecorder.start(LIVE_CHUNK_INTERVAL);
    setLiveStreamStatus('Grabando… habla cerca del micrófono para recibir texto.');
  } catch (error) {
    console.error('No se pudo iniciar la sesión en vivo:', error);
    liveSessionId = null;
    liveSessionActive = false;
    setLiveStreamStatus(`No se pudo iniciar la sesión en vivo: ${error.message}`, 'error');
    if (liveMediaStream) {
      liveMediaStream.getTracks().forEach((track) => track.stop());
      liveMediaStream = null;
    }
    if (liveRecorder && liveRecorder.state !== 'inactive') {
      liveRecorder.stop();
    }
  } finally {
    updateLiveControls();
  }
}

async function finalizeLiveSession() {
  if (!liveSessionId) return;
  const folder = liveFolderInput?.value?.trim();
  if (folder) {
    persistDestinationFolder(folder);
  }
  try {
    const payload = {
      destination_folder: folder || getStoredDestinationFolder() || undefined,
      subject: liveSubjectInput?.value?.trim() || undefined,
      language: liveLanguageSelect?.value?.trim() || undefined,
      model_size: liveModelSelect?.value?.trim() || undefined,
      device_preference: liveDeviceSelect?.value?.trim() || undefined,
    };
    const result = await fetchJSON(`${API_BASE}/live/sessions/${liveSessionId}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    applyLiveResult(result, { final: true });
    setLiveStreamStatus('Sesión guardada correctamente.');
    liveSessionId = null;
    liveSessionActive = false;
    liveChunkChain = Promise.resolve();
    liveRecorder = null;
    if (liveSubjectInput) {
      liveSubjectInput.value = '';
    }
    await refreshTranscriptions({ force: true });
  } catch (error) {
    console.error('No se pudo finalizar la sesión en vivo:', error);
    setLiveStreamStatus(`No se pudo guardar la sesión: ${error.message}`, 'error');
    liveSessionActive = false;
    throw error;
  } finally {
    updateLiveControls();
  }
}

async function stopLiveSession() {
  if (!liveSessionId) {
    return;
  }
  setLiveStreamStatus('Deteniendo y guardando la sesión en vivo…');
  if (liveRecorder && liveRecorder.state !== 'inactive') {
    liveRecorder.stop();
  }
  if (liveMediaStream) {
    liveMediaStream.getTracks().forEach((track) => track.stop());
    liveMediaStream = null;
  }
  try {
    await liveChunkChain.catch(() => {});
    await finalizeLiveSession();
  } catch (error) {
    // El mensaje ya se registró en finalizeLiveSession
  } finally {
    updateLiveControls();
  }
}

async function discardLiveSession() {
  if (!liveSessionId) {
    resetLiveStreamUI();
    setLiveStreamStatus('Sesión descartada. Lista para empezar de nuevo.');
    updateLiveControls();
    return;
  }
  if (liveRecorder && liveRecorder.state !== 'inactive') {
    liveRecorder.stop();
  }
  if (liveMediaStream) {
    liveMediaStream.getTracks().forEach((track) => track.stop());
    liveMediaStream = null;
  }
  try {
    await liveChunkChain.catch(() => {});
  } catch (error) {
    console.warn('Error al esperar la cola de fragmentos en vivo:', error);
  }
  try {
    await fetchJSON(`${API_BASE}/live/sessions/${liveSessionId}`, {
      method: 'DELETE',
    });
  } catch (error) {
    console.warn('No se pudo descartar la sesión en vivo en el servidor:', error);
  } finally {
    liveSessionId = null;
    liveSessionActive = false;
    liveChunkChain = Promise.resolve();
    liveRecorder = null;
    resetLiveStreamUI();
    setLiveStreamStatus('Sesión descartada. Lista para empezar de nuevo.');
    updateLiveControls();
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
    await refreshTranscriptions({ force: true });
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
  const modelSize = uploadForm.querySelector('#model-size')?.value?.trim();
  const devicePreference = uploadForm.querySelector('#device-preference')?.value?.trim();
  const destinationFolder = destinationInput?.value?.trim();

  if (!destinationFolder) {
    uploadStatus.textContent = 'Indica una carpeta de destino para guardar el TXT.';
    uploadStatus.classList.add('error');
    return;
  }

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
  formData.append('destination_folder', destinationFolder);
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
    persistDestinationFolder(destinationFolder);
    const preservedModel = modelSelect?.value;
    const preservedDevice = deviceSelect?.value;
    const preservedLanguage = languageSelect?.value;
    uploadForm.reset();
    if (modelSelect) {
      modelSelect.value = preservedModel || modelSelect.dataset.default || modelSelect.value;
    }
    if (deviceSelect) {
      deviceSelect.value = preservedDevice || deviceSelect.dataset.default || deviceSelect.value;
    }
    if (languageSelect) {
      const fallbackLanguage = languageSelect.querySelector('option[selected]')?.value ?? '';
      languageSelect.value = preservedLanguage || fallbackLanguage;
    }
    if (destinationInput) {
      destinationInput.value = destinationFolder;
    }
    if (liveFolderInput && !liveFolderInput.value) {
      liveFolderInput.value = destinationFolder;
    }
    updateFilePreview();
    await refreshTranscriptions({ force: true });
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
const lastDestinationFolder = getStoredDestinationFolder();
if (lastDestinationFolder) {
  if (destinationInput) {
    destinationInput.value = lastDestinationFolder;
  }
  if (liveFolderInput && !liveFolderInput.value) {
    liveFolderInput.value = lastDestinationFolder;
  }
}
updateDestinationOptions([]);
resetLiveStreamUI();
setLiveStreamStatus('Tu texto aparecerá aquí cuando empieces a hablar.');
updateLiveControls();
liveStartButton?.addEventListener('click', startLiveSession);
liveStopButton?.addEventListener('click', stopLiveSession);
liveResetButton?.addEventListener('click', discardLiveSession);
destinationInput?.addEventListener('change', handleDestinationInputChange);
destinationInput?.addEventListener('blur', handleDestinationInputChange);
liveFolderInput?.addEventListener('change', handleLiveFolderChange);
liveFolderInput?.addEventListener('blur', handleLiveFolderChange);
searchInput?.addEventListener('input', handleSearch);
filterPremium?.addEventListener('change', (event) => {
  premiumOnly = event.target.checked;
  refreshTranscriptions({ force: true });
});
folderCategoryFilter?.addEventListener('change', (event) => {
  folderFilters.category = event.target.value;
  applyFolderFilters();
});
folderStatusFilter?.addEventListener('change', (event) => {
  folderFilters.status = event.target.value;
  applyFolderFilters();
});
folderTopicFilter?.addEventListener('change', (event) => {
  folderFilters.topic = event.target.value;
  applyFolderFilters();
});
folderSearchInput?.addEventListener('input', (event) => {
  folderFilters.search = event.target.value.trim().toLowerCase();
  applyFolderFilters();
});
folderResetButton?.addEventListener('click', () => {
  folderFilters.category = 'all';
  folderFilters.status = 'all';
  folderFilters.topic = 'all';
  folderFilters.search = '';
  if (folderCategoryFilter) folderCategoryFilter.value = 'all';
  if (folderStatusFilter) folderStatusFilter.value = 'all';
  if (folderTopicFilter) folderTopicFilter.value = 'all';
  if (folderSearchInput) folderSearchInput.value = '';
  applyFolderFilters();
});
modalClose?.addEventListener('click', () => (modal.hidden = true));
modal?.addEventListener('click', (event) => {
  if (event.target === modal) modal.hidden = true;
});
refreshPlansBtn?.addEventListener('click', loadPlans);
plansContainer?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-plan]');
  if (!button) return;
  const slug = button.getAttribute('data-plan');
  if (!slug) return;
  if (button.hasAttribute('data-student')) {
    const plan = cachedPlans.find((item) => item.slug === slug);
    showStudentPlanInstructions(plan);
    return;
  }
  createCheckout(slug);
});

folderGroupsContainer?.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-folder-transcription]');
  if (!trigger) return;
  const id = Number(trigger.getAttribute('data-folder-transcription'));
  if (!Number.isFinite(id)) return;
  selectedTranscriptionId = id;
  if (livePreviewTargets.length) {
    livePreviewTargets.forEach((output) => {
      output.dataset.autoScroll = 'true';
    });
  }
  updateLivePreview(cachedResults);
  livePreviewTargets.forEach((output) => scrollContainerToEnd(output));
});

homePendingList?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-pending-id]');
  if (!button) return;
  const id = Number(button.getAttribute('data-pending-id'));
  if (!Number.isFinite(id)) return;
  selectedTranscriptionId = id;
  updateLivePreview(cachedResults);
  openModal(id);
});

homeFolderSummary?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-folder-jump]');
  if (!button) return;
  const folder = button.getAttribute('data-folder-jump');
  if (!folder) return;
  folderFilters.search = folder.toLowerCase();
  if (folderSearchInput) {
    folderSearchInput.value = folder;
  }
  applyFolderFilters();
  setActiveSection('library', { fallback: 'home' });
  window.requestAnimationFrame(() => {
    folderGroupsContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

homeRecentList?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-recent-id]');
  if (!button) return;
  const id = Number(button.getAttribute('data-recent-id'));
  if (!Number.isFinite(id)) return;
  selectedTranscriptionId = id;
  updateLivePreview(cachedResults);
  openModal(id);
});

renderHomePendingList([]);
renderHomeFolderSummary([]);
renderHomeRecentList([]);

if (folderGroupsContainer) {
  applyFolderFilters();
}

if (sectionToggles?.length) {
  sectionToggles.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.sectionToggle;
      setActiveSection(target, { fallback: 'home' });
    });
  });
}

if (sectionJumpButtons?.length) {
  sectionJumpButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.sectionJump;
      setActiveSection(target, { fallback: 'home' });
    });
  });
}

const savedSection = safeLocalStorageGet(LAST_SECTION_STORAGE_KEY);
setActiveSection(savedSection || 'home', { fallback: 'home', skipPersist: true });

document.addEventListener('DOMContentLoaded', () => {
  resetCopyFeedback();
  refreshTranscriptions({ force: true });
  loadPlans();
  updateMetrics([]);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling();
    return;
  }
  if (refreshQueuedWhileHidden || lastPendingCount > 0) {
    refreshQueuedWhileHidden = false;
    refreshTranscriptions({ force: true }).catch(() => {});
  }
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

function updateStudentPreview(item) {
  if (!studentPreviewBody) return;
  const followEnabled = !studentFollowToggle || studentFollowToggle.checked;
  const placeholder = 'Se vinculará automáticamente a la transcripción que esté en proceso.';
  if (!item) {
    if (followEnabled) {
      resetStreamingContainer(studentPreviewBody, placeholder);
      studentPreviewBody.dataset.stream = 'false';
    }
    return;
  }
  if (!followEnabled) {
    return;
  }
  renderStreamingView(studentPreviewBody, item, {
    placeholder,
    speedMultiplier: 0.72,
  });
}

function updateLivePreview(results) {
  if (!livePreviewTargets.length) return;
  const safeResults = Array.isArray(results) ? results : [];
  const renderToTargets = (item, options = {}) => {
    livePreviewTargets.forEach((output) => {
      renderStreamingView(output, item, options);
    });
  };
  const resetTargets = (message) => {
    livePreviewTargets.forEach((output) => {
      resetStreamingContainer(output, message);
      output.dataset.stream = 'false';
    });
  };

  if (selectedTranscriptionId) {
    const selected = safeResults.find((item) => item.id === selectedTranscriptionId);
    if (selected) {
      const text = selected.text ?? '';
      if (selected.id !== currentLiveTranscriptionId || text !== currentLiveText) {
        currentLiveTranscriptionId = selected.id;
        currentLiveText = text;
        renderToTargets(selected, {
          placeholder: 'Procesando y transcribiendo en vivo…',
        });
        updateStudentPreview(selected);
      }
    } else {
      updateStudentPreview(null);
    }
    return;
  }

  const active =
    safeResults.find((item) => item.status === 'processing' && item.text) ||
    safeResults.find((item) => item.status === 'completed' && item.text);
  if (active) {
    const text = active.text ?? '';
    if (active.id !== currentLiveTranscriptionId || text !== currentLiveText) {
      currentLiveTranscriptionId = active.id;
      currentLiveText = text;
      renderToTargets(active, {
        placeholder: 'Procesando y transcribiendo en vivo…',
      });
      updateStudentPreview(active);
    }
    return;
  }

  currentLiveTranscriptionId = null;
  currentLiveText = '';
  resetTargets('Selecciona cualquier transcripción para previsualizarla aquí.');
  updateStudentPreview(null);
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
    renderModalText(data.text ?? 'Transcripción no disponible aún.');
    resetCopyFeedback();
  } catch (error) {
    modal.hidden = false;
    const message = `No se pudo obtener la transcripción: ${error.message}`;
    modalText.textContent = message;
    if (livePreviewTargets.length) {
      livePreviewTargets.forEach((output) => {
        renderStreamingView(
          output,
          { text: message, status: 'completed' },
          { autoScroll: false },
        );
      });
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

openStudentBtn?.addEventListener('click', () => {
  window.open('student.html', 'student-mode');
});

studentFollowToggle?.addEventListener('change', () => {
  if (studentFollowToggle.checked) {
    refreshTranscriptions({ force: true }).catch(() => {});
  } else if (studentPreviewBody) {
    studentPreviewBody.dataset.stream = 'false';
  }
});
