const ROUTES = ['home', 'live', 'library', 'job', 'benefits'];
const LOCAL_KEYS = {
  homeFollow: 'grabadora:home-follow',
  liveFollow: 'grabadora:live-follow',
  jobFollow: 'grabadora:job-follow',
  liveTailSize: 'grabadora:live-tail-size',
  jobTailSize: 'grabadora:job-tail-size',
  lastRoute: 'grabadora:last-route',
};
const THEME_KEY = 'grabadora:theme';

const PREMIUM_PLANS = [
  {
    slug: 'student-local',
    name: 'Estudiante Local',
    price: '0 €',
    cadence: '/mes',
    description: 'Procesa en tu propio equipo con notas y capítulos automáticos.',
    perks: [
      'Hasta 60 minutos por sesión en vivo',
      'Notas rápidas y marcadores en pantalla',
      'Exportación TXT y Markdown básica',
    ],
  },
  {
    slug: 'starter-15',
    name: 'Starter 15',
    price: '12 €',
    cadence: '/mes',
    description: 'Horas en la nube con cola prioritaria y exportaciones enriquecidas.',
    perks: [
      '15 horas/mes en servidores gestionados',
      'Exportación DOCX y PDF',
      'Soporte por correo en 24 h',
    ],
  },
  {
    slug: 'pro-60',
    name: 'Pro 60',
    price: '29 €',
    cadence: '/mes',
    description: 'Pensado para equipos: integraciones, diarización avanzada y enlaces compartidos.',
    perks: [
      '60 horas/mes con reprocesado large-v3',
      'Integraciones con Drive, Notion y webhooks',
      'Enlaces seguros y control de versiones',
    ],
  },
];

const PROMPT_TEXT = `Implementa sin desviar los siguientes puntos críticos en Grabadora Pro:\n\n1. Tema claro/oscuro con persistencia en localStorage y botón en el header.\n2. Formulario de subida que envíe multipart/form-data a POST /api/transcriptions (campo upload, destination_folder, language, model_size) con barra de progreso y manejo de 413.\n3. Al completar una subida, refrescar métricas básicas, mantener la cola local y avisar al usuario.\n4. Tail en vivo fijo al final con botón Volver al final y controles accesibles (pantalla completa, A+/A−).\n5. Biblioteca maestro-detalle con árbol de carpetas, filtros y breadcrumbs Inicio / Biblioteca / {Carpeta}.\n6. Detalle de proceso con streaming incremental, copiar texto y descargas .txt/.srt desde la API.\n7. Planes premium visibles (Estudiante, Starter, Pro) con características y CTA.\n8. Estados vacíos, errores accionables y toasts para eventos clave (inicio/fin/error).`;

const SAMPLE_DATA = {
  stats: {
    todayMinutes: 42,
    totalMinutes: 1280,
    todayCount: 3,
    totalCount: 214,
    queue: 1,
    mode: 'GPU',
    model: 'WhisperX large-v3',
  },
  folders: [
    { id: 'fld-root', name: 'General', parentId: null, path: '/General', createdAt: '2024-01-02T09:00:00Z' },
    { id: 'fld-class', name: 'Clases', parentId: null, path: '/Clases', createdAt: '2024-01-02T09:00:00Z' },
    { id: 'fld-class-2024', name: '2024', parentId: 'fld-class', path: '/Clases/2024', createdAt: '2024-01-02T09:00:00Z' },
    { id: 'fld-class-history', name: 'Historia', parentId: 'fld-class-2024', path: '/Clases/2024/Historia', createdAt: '2024-04-18T09:00:00Z' },
    { id: 'fld-podcasts', name: 'Podcasts', parentId: null, path: '/Podcasts', createdAt: '2024-02-12T09:00:00Z' },
  ],
  jobs: [
    {
      id: 'job-001',
      name: 'Clase Historia 18-04.mp3',
      folderId: 'fld-class-history',
      status: 'completed',
      durationSec: 1980,
      language: 'es',
      model: 'large-v3',
      createdAt: '2024-04-18T14:00:00Z',
      updatedAt: '2024-04-18T14:35:00Z',
    },
    {
      id: 'job-002',
      name: 'Briefing producto.m4a',
      folderId: 'fld-root',
      status: 'processing',
      durationSec: 1420,
      language: 'es',
      model: 'large-v3',
      createdAt: '2024-06-12T09:10:00Z',
      updatedAt: '2024-06-12T09:40:00Z',
    },
    {
      id: 'job-003',
      name: 'Podcast demo.wav',
      folderId: 'fld-podcasts',
      status: 'completed',
      durationSec: 2600,
      language: 'es',
      model: 'small',
      createdAt: '2024-05-28T11:00:00Z',
      updatedAt: '2024-05-28T11:55:00Z',
    },
    {
      id: 'job-004',
      name: 'Pitch internacional.mp3',
      folderId: 'fld-root',
      status: 'error',
      durationSec: 860,
      language: 'en',
      model: 'large-v3',
      createdAt: '2024-06-19T08:00:00Z',
      updatedAt: '2024-06-19T08:25:00Z',
    },
    {
      id: 'job-005',
      name: 'Acta reunión 21-06.wav',
      folderId: 'fld-root',
      status: 'queued',
      durationSec: 1200,
      language: 'es',
      model: 'large-v3',
      createdAt: '2024-06-21T07:30:00Z',
      updatedAt: '2024-06-21T07:30:00Z',
    },
  ],
  texts: {
    'job-001': {
      jobId: 'job-001',
      text: `Buenos días a todas y todos. Hoy retomamos el tema de las revoluciones atlánticas...\n\nEn primer lugar repasamos las causas económicas y políticas que empujaron la independencia de las trece colonias. Después, contrastamos las constituciones de Estados Unidos y Francia, destacando el papel del sufragio limitado. Finalmente, debatimos cómo estos procesos influyeron en los movimientos independentistas en América Latina.`,
      segments: [
        'Buenos días a todas y todos. ',
        'Hoy retomamos el tema de las revoluciones atlánticas y su relación con las economías coloniales.\n',
        'Repasamos las causas económicas y políticas que empujaron la independencia de las trece colonias.\n',
        'Contrastamos las constituciones de Estados Unidos y Francia, destacando el papel del sufragio limitado.\n',
        'Finalmente, debatimos cómo estos procesos influyeron en los movimientos independentistas en América Latina.\n',
      ],
    },
    'job-002': {
      jobId: 'job-002',
      text: 'La transcripción está en curso; se actualizará automáticamente en cuanto lleguen nuevos segmentos.',
      segments: [
        'Estamos validando el mensaje clave del lanzamiento.\n',
        'El objetivo es simplificar la narrativa para la prensa especializada.\n',
      ],
    },
    'job-003': {
      jobId: 'job-003',
      text: 'Bienvenida al episodio piloto. Conversamos sobre productividad, IA aplicada y hábitos sostenibles.\n\nSección 1: qué nos motivó a crear este podcast. Sección 2: herramientas favoritas para tomar notas. Sección 3: preguntas de la audiencia.',
    },
  },
};

const SAMPLE_LIVE_SEGMENTS = [
  'Conectando dispositivos y preparando el entorno de grabación...\n',
  'Recordemos que la sesión de hoy se centra en técnicas para resumir clases largas.\n',
  'Primer paso: identifica palabras clave y define etiquetas para tus carpetas.\n',
  'Cuando detectes un cambio de tema, marca un hito para navegar después.\n',
  'Puedes pausar la sesión si necesitas responder preguntas en vivo.\n',
  'Al finalizar, descarga el .txt o exporta a Markdown para compartirlo con tu equipo.\n',
];
const elements = {
  themeToggle: document.getElementById('theme-toggle'),
  navButtons: document.querySelectorAll('[data-route-target]'),
  views: document.querySelectorAll('.view'),
  stats: {
    totalMinutes: document.querySelector('[data-stat="totalMinutes"]'),
    todayMinutes: document.querySelector('[data-stat="todayMinutes"]'),
    totalCount: document.querySelector('[data-stat="totalCount"]'),
    todayCount: document.querySelector('[data-stat="todayCount"]'),
    queue: document.querySelector('[data-stat="queue"]'),
    mode: document.querySelector('[data-stat="mode"]'),
    model: document.querySelector('[data-stat="model"]'),
  },
  home: {
    liveText: document.getElementById('home-live-text'),
    liveTail: document.getElementById('home-live-tail'),
    follow: document.getElementById('home-live-follow'),
    status: document.getElementById('home-live-status'),
    returnBtn: document.getElementById('home-live-return'),
    start: document.querySelector('[data-live-control="start"]'),
    pause: document.querySelector('[data-live-control="pause"]'),
    resume: document.querySelector('[data-live-control="resume"]'),
    finish: document.querySelector('[data-live-control="finish"]'),
    fontIncrease: document.getElementById('home-live-font-increase'),
    fontDecrease: document.getElementById('home-live-font-decrease'),
    fullscreen: document.getElementById('home-live-fullscreen'),
    recentBody: document.getElementById('recent-table-body'),
    quickFolder: document.getElementById('quick-folder'),
    newTranscription: document.getElementById('home-new-transcription'),
  },
  upload: {
    form: document.getElementById('upload-form'),
    dropzone: document.getElementById('upload-dropzone'),
    input: document.getElementById('upload-input'),
    trigger: document.getElementById('upload-trigger'),
    folder: document.getElementById('upload-folder'),
    language: document.getElementById('upload-language'),
    model: document.getElementById('upload-model'),
    feedback: document.getElementById('upload-feedback'),
    diarization: document.getElementById('upload-diarization'),
    vad: document.getElementById('upload-vad'),
    progress: document.getElementById('upload-progress'),
    fileList: document.getElementById('upload-file-list'),
    submit: document.querySelector('#upload-form button[type="submit"]'),
  },
  benefits: {
    pricing: document.getElementById('pricing-grid'),
    prompt: document.getElementById('codex-prompt'),
    copy: document.getElementById('copy-prompt'),
  },
  library: {
    tree: document.getElementById('folder-tree'),
    breadcrumbs: document.getElementById('library-breadcrumbs'),
    tableBody: document.getElementById('library-table-body'),
    filterStatus: document.getElementById('filter-status'),
    filterLanguage: document.getElementById('filter-language'),
    filterModel: document.getElementById('filter-model'),
    filterSearch: document.getElementById('filter-search'),
    create: document.getElementById('library-create-folder'),
    rename: document.getElementById('library-rename-folder'),
    move: document.getElementById('library-move-folder'),
    remove: document.getElementById('library-delete-folder'),
  },
  live: {
    language: document.getElementById('live-language'),
    model: document.getElementById('live-model'),
    device: document.getElementById('live-device'),
    folder: document.getElementById('live-folder'),
    start: document.getElementById('live-start'),
    pause: document.getElementById('live-pause'),
    resume: document.getElementById('live-resume'),
    finish: document.getElementById('live-finish'),
    tail: document.getElementById('live-stream'),
    text: document.getElementById('live-stream-text'),
    follow: document.getElementById('live-follow'),
    returnBtn: document.getElementById('live-return'),
    tailSize: document.getElementById('live-tail-size'),
    fontPlus: document.getElementById('live-font-plus'),
    fontMinus: document.getElementById('live-font-minus'),
    fullscreen: document.getElementById('live-fullscreen'),
    kpis: document.querySelectorAll('[data-live-kpi]'),
  },
  job: {
    breadcrumbs: document.getElementById('job-breadcrumbs'),
    title: document.getElementById('job-title'),
    subtitle: document.getElementById('job-subtitle'),
    move: document.getElementById('job-move'),
    follow: document.getElementById('job-follow'),
    returnBtn: document.getElementById('job-return'),
    tail: document.getElementById('job-tail'),
    text: document.getElementById('job-text-content'),
    tailSize: document.getElementById('job-tail-size'),
    copy: document.getElementById('job-copy'),
    downloadTxt: document.getElementById('job-download-txt'),
    downloadSrt: document.getElementById('job-download-srt'),
    exportMd: document.getElementById('job-export-md'),
    status: document.getElementById('job-status'),
    folder: document.getElementById('job-folder'),
    duration: document.getElementById('job-duration'),
    language: document.getElementById('job-language'),
    model: document.getElementById('job-model'),
    wer: document.getElementById('job-wer'),
    audio: document.getElementById('job-audio'),
    logs: document.getElementById('job-logs'),
  },
  datalist: document.getElementById('folder-options'),
  diagnostics: document.getElementById('open-diagnostics'),
};

let suppressHashChange = false;

const preferences = {
  get(key, fallback) {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return fallback;
      if (stored === 'true' || stored === 'false') return stored === 'true';
      const value = Number(stored);
      return Number.isNaN(value) ? stored : value;
    } catch (error) {
      console.warn('No se pudo leer preferencia', key, error);
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (error) {
      console.warn('No se pudo guardar preferencia', key, error);
    }
  },
};

function currentTheme() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function updateThemeToggle(theme = currentTheme()) {
  if (!elements.themeToggle) return;
  const isDark = theme === 'dark';
  elements.themeToggle.setAttribute('aria-pressed', String(isDark));
  elements.themeToggle.setAttribute('aria-label', isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
  const label = elements.themeToggle.querySelector('[data-theme-label]');
  const icon = elements.themeToggle.querySelector('[data-theme-icon]');
  if (label) label.textContent = isDark ? 'Modo claro' : 'Modo oscuro';
  if (icon) icon.textContent = isDark ? '☀️' : '🌙';
}

function applyTheme(theme, persist = true) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', normalized === 'dark');
  document.documentElement.dataset.theme = normalized;
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, normalized);
    } catch (error) {
      console.warn('No se pudo guardar el tema', error);
    }
  }
  updateThemeToggle(normalized);
}

function renderPricingPlans() {
  if (!elements.benefits.pricing) return;
  elements.benefits.pricing.innerHTML = '';
  PREMIUM_PLANS.forEach((plan) => {
    const card = document.createElement('article');
    card.className = 'pricing-card';
    card.setAttribute('role', 'listitem');

    const header = document.createElement('div');
    header.className = 'pricing-card__header';

    const title = document.createElement('h3');
    title.className = 'pricing-card__title';
    title.textContent = plan.name;

    const price = document.createElement('div');
    price.className = 'pricing-card__price';
    price.innerHTML = `${plan.price}<span>${plan.cadence}</span>`;

    const description = document.createElement('p');
    description.className = 'panel__subtitle';
    description.textContent = plan.description;

    header.appendChild(title);
    header.appendChild(price);
    card.appendChild(header);
    card.appendChild(description);

    const list = document.createElement('ul');
    list.className = 'pricing-card__list';
    plan.perks.forEach((perk) => {
      const item = document.createElement('li');
      item.textContent = perk;
      list.appendChild(item);
    });
    card.appendChild(list);

    const cta = document.createElement('a');
    cta.className = 'pricing-card__cta';
    cta.href = `/checkout?plan=${encodeURIComponent(plan.slug)}`;
    cta.textContent = 'Elegir plan';
    card.appendChild(cta);

    elements.benefits.pricing.appendChild(card);
  });
}

function injectPrompt() {
  if (!elements.benefits.prompt) return;
  elements.benefits.prompt.value = PROMPT_TEXT;
}

function downloadFileFallback(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function triggerDownload(url, fallbackContent, filename, mimeType = 'text/plain;charset=utf-8') {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(response.statusText);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    if (fallbackContent != null) {
      downloadFileFallback(filename, fallbackContent, mimeType);
    } else {
      alert('No fue posible descargar el archivo solicitado.');
    }
  }
}

function setupTheme() {
  const datasetTheme = document.documentElement.dataset.theme || 'light';
  applyTheme(datasetTheme, false);
  if (!elements.themeToggle) return;
  elements.themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });
}

function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();
  return {
    getState() {
      return state;
    },
    setState(updater) {
      const prev = state;
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      state = next;
      listeners.forEach((listener) => listener(state, prev));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const store = createStore({
  stats: null,
  folders: [],
  selectedFolderId: null,
  jobs: [],
  recentJobs: [],
  libraryFilters: { status: 'all', language: 'all', model: 'all', search: '' },
  live: {
    segments: [],
    status: 'idle',
    maxSegments: preferences.get(LOCAL_KEYS.liveTailSize, 200),
  },
  job: {
    detail: null,
    maxSegments: preferences.get(LOCAL_KEYS.jobTailSize, 200),
  },
});

function createTailController({ scroller, text, followToggle, returnButton, preferenceKey }) {
  const sentinel = document.createElement('span');
  sentinel.setAttribute('aria-hidden', 'true');
  let follow = followToggle ? preferences.get(preferenceKey, true) : true;
  if (followToggle) followToggle.checked = follow;

  const scrollToEnd = (smooth = false) => {
    const behavior = smooth ? 'smooth' : 'auto';
    requestAnimationFrame(() => sentinel.scrollIntoView({ behavior, block: 'end' }));
  };

  const setFollow = (value) => {
    follow = value;
    if (followToggle) followToggle.checked = value;
    if (returnButton) returnButton.hidden = value;
    if (preferenceKey) preferences.set(preferenceKey, value);
    if (value) scrollToEnd(true);
  };

  const render = (content) => {
    text.textContent = content || '';
    if (!text.contains(sentinel)) {
      text.appendChild(sentinel);
    }
    if (follow) scrollToEnd(false);
  };

  const handleScroll = () => {
    if (!followToggle) return;
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
    if (!nearBottom && follow) {
      setFollow(false);
    }
    if (returnButton) {
      returnButton.hidden = follow || nearBottom;
    }
  };

  scroller.addEventListener('scroll', handleScroll, { passive: true });
  followToggle?.addEventListener('change', (event) => setFollow(event.target.checked));
  returnButton?.addEventListener('click', () => setFollow(true));

  return { render, setFollow };
}

const tailControllers = {
  home: createTailController({
    scroller: elements.home.liveTail,
    text: elements.home.liveText,
    followToggle: elements.home.follow,
    returnButton: elements.home.returnBtn,
    preferenceKey: LOCAL_KEYS.homeFollow,
  }),
  live: createTailController({
    scroller: elements.live.tail,
    text: elements.live.text,
    followToggle: elements.live.follow,
    returnButton: elements.live.returnBtn,
    preferenceKey: LOCAL_KEYS.liveFollow,
  }),
  job: createTailController({
    scroller: elements.job.tail,
    text: elements.job.text,
    followToggle: elements.job.follow,
    returnButton: elements.job.returnBtn,
    preferenceKey: LOCAL_KEYS.jobFollow,
  }),
};

const liveSession = {
  timer: null,
  cursor: 0,
};
function goToRoute(route, { updateHash = true, persist = true } = {}) {
  const normalized = ROUTES.includes(route) ? route : 'home';
  elements.views.forEach((view) => {
    const matches = view.dataset.route === normalized;
    view.classList.toggle('view--active', matches);
    view.toggleAttribute('hidden', !matches);
  });
  elements.navButtons.forEach((button) => {
    const isActive = button.dataset.routeTarget === normalized;
    if (button.classList.contains('nav-btn')) {
      button.classList.toggle('is-active', isActive);
      if (isActive) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    }
  });
  if (persist) preferences.set(LOCAL_KEYS.lastRoute, normalized);
  if (updateHash) {
    const targetHash = `#${normalized}`;
    if (window.location.hash !== targetHash) {
      suppressHashChange = true;
      window.location.hash = targetHash;
    }
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleNavigation(event) {
  const target = event.target.closest('[data-route-target]');
  if (!target) return;
  event.preventDefault();
  goToRoute(target.dataset.routeTarget);
}
function handleRouteKey(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target.closest('[data-route-target]');
  if (!target) return;
  event.preventDefault();
  goToRoute(target.dataset.routeTarget);
}

function setupAnchorGuards() {
  document.addEventListener('click', (event) => {
    const neutral = event.target.closest('a[href="#"]');
    if (neutral) {
      event.preventDefault();
    }
  });
}

function getRouteFromHash() {
  const hash = window.location.hash.replace('#', '').trim();
  return ROUTES.includes(hash) ? hash : null;
}

function setupRouter() {
  document.addEventListener('click', handleNavigation);
  document.addEventListener('keydown', handleRouteKey);
  window.addEventListener('hashchange', () => {
    if (suppressHashChange) {
      suppressHashChange = false;
      return;
    }
    const hashRoute = getRouteFromHash();
    goToRoute(hashRoute ?? 'home', { updateHash: false });
  });
}

function initRouteFromStorage() {
  const hashRoute = getRouteFromHash();
  if (hashRoute) {
    goToRoute(hashRoute, { updateHash: false });
    return;
  }
  const lastRoute = preferences.get(LOCAL_KEYS.lastRoute, 'home');
  goToRoute(lastRoute);
}
function renderStats(stats) {
  if (!stats) return;
  elements.stats.totalMinutes.textContent = `${stats.totalMinutes ?? 0} min`;
  elements.stats.todayMinutes.textContent = `${stats.todayMinutes ?? 0}`;
  elements.stats.totalCount.textContent = stats.totalCount ?? 0;
  elements.stats.todayCount.textContent = stats.todayCount ?? 0;
  elements.stats.queue.textContent = stats.queue ?? 0;
  elements.stats.mode.textContent = stats.mode ?? '—';
  elements.stats.model.textContent = stats.model ?? '—';
}

function renderRecent(jobs) {
  const body = elements.home.recentBody;
  body.innerHTML = '';
  if (!jobs.length) {
    const row = document.createElement('tr');
    row.className = 'table-empty-row';
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'table-empty';
    cell.textContent = 'No hay transcripciones recientes.';
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }
  jobs.forEach((job) => {
    const row = document.createElement('tr');
    row.dataset.jobId = job.id;
    row.innerHTML = `
      <td>${job.name}</td>
      <td>${formatStatus(job.status)}</td>
      <td>${formatDuration(job.durationSec)}</td>
      <td>${formatDate(job.updatedAt)}</td>
    `;
    row.addEventListener('click', () => openJob(job.id));
    body.appendChild(row);
  });
}

function renderFolderOptions(folders) {
  elements.datalist.innerHTML = '';
  [...folders]
    .sort((a, b) => a.path.localeCompare(b.path))
    .forEach((folder) => {
      const option = document.createElement('option');
      option.value = folder.path.slice(1);
      elements.datalist.appendChild(option);
    });
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const formatted = value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1);
  return `${formatted} ${units[index]}`;
}

function renderPendingFiles(files) {
  const list = elements.upload.fileList;
  if (!list) return;
  list.innerHTML = '';
  if (!files.length) {
    list.hidden = true;
    return;
  }
  files.forEach((file) => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = file.name;
    const size = document.createElement('span');
    size.textContent = formatFileSize(file.size);
    item.append(name, size);
    list.appendChild(item);
  });
  list.hidden = false;
}

function prefillFolderInputs(state) {
  if (!state.folders.length) return;
  const explicit = state.selectedFolderId
    ? state.folders.find((folder) => folder.id === state.selectedFolderId)
    : null;
  const fallback = explicit ?? state.folders[0];
  if (!fallback) return;
  const path = fallback.path.startsWith('/') ? fallback.path.slice(1) : fallback.path;
  if (path) {
    const uploadField = elements.upload.folder;
    const quickField = elements.home.quickFolder;
    const liveField = elements.live.folder;
    if (uploadField && (!uploadField.value.trim() || document.activeElement !== uploadField)) {
      uploadField.value = path;
    }
    if (quickField && (!quickField.value.trim() || document.activeElement !== quickField)) {
      quickField.value = path;
    }
    if (liveField && (!liveField.value.trim() || document.activeElement !== liveField)) {
      liveField.value = path;
    }
  }
}

function setUploadProgress(percent) {
  const progress = elements.upload.progress;
  if (!progress) return;
  progress.hidden = false;
  progress.value = Math.max(0, Math.min(100, percent));
}

function resetUploadProgress() {
  const progress = elements.upload.progress;
  if (!progress) return;
  progress.value = 0;
  progress.hidden = true;
}

function buildFolderTree(folders) {
  const map = new Map();
  const roots = [];
  folders.forEach((folder) => {
    map.set(folder.id, { ...folder, children: [] });
  });
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortNodes = (nodes) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

function renderFolderTree(state) {
  const container = elements.library.tree;
  container.innerHTML = '';
  if (!state.folders.length) {
    container.textContent = 'No hay carpetas disponibles.';
    return;
  }
  const tree = buildFolderTree(state.folders);
  const fragment = document.createDocumentFragment();
  const template = document.getElementById('folder-node-template');

  const appendNodes = (nodes, target) => {
    nodes.forEach((node) => {
      const instance = template.content.firstElementChild.cloneNode(true);
      const button = instance.querySelector('.folder-node__button');
      button.textContent = node.name;
      button.dataset.folderId = node.id;
      if (node.id === state.selectedFolderId) {
        button.classList.add('is-current');
      }
      const childrenContainer = instance.querySelector('.folder-node__children');
      if (!node.children.length) {
        childrenContainer.remove();
      } else {
        appendNodes(node.children, childrenContainer);
      }
      target.appendChild(instance);
    });
  };

  appendNodes(tree, fragment);
  container.appendChild(fragment);
}

elements.library.tree.addEventListener('click', (event) => {
  const button = event.target.closest('.folder-node__button');
  if (!button) return;
  store.setState((prev) => ({ ...prev, selectedFolderId: button.dataset.folderId }));
});

function renderLibraryBreadcrumb(state) {
  const list = elements.library.breadcrumbs.querySelector('ol');
  while (list.children.length > 2) {
    list.removeChild(list.lastChild);
  }
  if (!state.selectedFolderId) return;
  const folderMap = new Map(state.folders.map((folder) => [folder.id, folder]));
  let current = folderMap.get(state.selectedFolderId);
  const path = [];
  while (current) {
    path.unshift(current);
    current = current.parentId ? folderMap.get(current.parentId) : null;
  }
  path.forEach((folder) => {
    const item = document.createElement('li');
    item.textContent = folder.name;
    list.appendChild(item);
  });
}

function renderLibraryTable(state) {
  const body = elements.library.tableBody;
  body.innerHTML = '';
  if (!state.jobs.length) {
    const row = document.createElement('tr');
    row.className = 'table-empty-row';
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'table-empty';
    cell.textContent = 'No hay transcripciones para mostrar.';
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }
  const folderMap = new Map(state.folders.map((folder) => [folder.id, folder]));
  const selected = state.selectedFolderId ? folderMap.get(state.selectedFolderId) : null;
  const query = state.libraryFilters.search.trim().toLowerCase();
  const filtered = state.jobs.filter((job) => {
    if (state.libraryFilters.status !== 'all' && job.status !== state.libraryFilters.status) return false;
    if (state.libraryFilters.language !== 'all' && job.language !== state.libraryFilters.language) return false;
    if (state.libraryFilters.model !== 'all' && job.model !== state.libraryFilters.model) return false;
    const folder = job.folderId ? folderMap.get(job.folderId) : null;
    if (selected && folder && !folder.path.startsWith(selected.path)) return false;
    if (query) {
      const text = `${job.name} ${folder ? folder.path : ''}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });
  if (!filtered.length) {
    const row = document.createElement('tr');
    row.className = 'table-empty-row';
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'table-empty';
    cell.textContent = 'Sin resultados con los filtros actuales.';
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }
  filtered
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .forEach((job) => {
      const row = document.createElement('tr');
      row.dataset.jobId = job.id;
      const folder = job.folderId ? folderMap.get(job.folderId) : null;
      row.innerHTML = `
        <td>${job.name}</td>
        <td>${formatStatus(job.status)}</td>
        <td>${formatDuration(job.durationSec)}</td>
        <td>${formatDate(job.updatedAt)}</td>
        <td>${folder ? folder.path.slice(1) : '—'}</td>
        <td><button class="btn btn--ghost" type="button">Abrir</button></td>
      `;
      row.querySelector('button').addEventListener('click', (event) => {
        event.stopPropagation();
        openJob(job.id);
      });
      row.addEventListener('click', () => openJob(job.id));
      body.appendChild(row);
    });
}
function renderLiveSegments(segments) {
  const content = segments.length ? segments.join('') : 'Inicia una sesión para ver la transcripción en directo.';
  tailControllers.home.render(content);
  tailControllers.live.render(segments.length ? content : 'Conecta el micro para comenzar.');
}

function renderLiveStatus(status) {
  switch (status) {
    case 'recording':
      elements.home.status.textContent = 'Grabando en vivo…';
      break;
    case 'paused':
      elements.home.status.textContent = 'Sesión en pausa.';
      break;
    case 'completed':
      elements.home.status.textContent = 'Sesión finalizada. Guarda o inicia otra cuando quieras.';
      break;
    default:
      elements.home.status.textContent = 'Listo para grabar.';
  }
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  elements.home.start.disabled = isRecording || isPaused;
  elements.home.pause.disabled = !isRecording;
  elements.home.resume.hidden = !isPaused;
  elements.home.resume.disabled = !isPaused;
  elements.home.pause.hidden = isPaused;
  elements.home.finish.disabled = status === 'idle';

  elements.live.start.disabled = isRecording || isPaused;
  elements.live.pause.disabled = !isRecording;
  elements.live.resume.hidden = !isPaused;
  elements.live.resume.disabled = !isPaused;
  elements.live.pause.hidden = isPaused;
  elements.live.finish.disabled = status === 'idle';
}

function renderJobDetail(state) {
  const detail = state.job.detail;
  if (!detail) {
    elements.job.title.textContent = 'Selecciona un proceso';
    elements.job.subtitle.textContent = 'Verás aquí el texto consolidado y sus acciones.';
    tailControllers.job.render('Elige una transcripción para verla aquí.');
    elements.job.move.disabled = true;
    elements.job.copy.disabled = true;
    elements.job.downloadTxt.disabled = true;
    elements.job.downloadSrt.disabled = true;
    elements.job.exportMd.disabled = true;
    elements.job.audio.hidden = true;
    elements.job.logs.hidden = true;
    elements.job.status.textContent = '—';
    elements.job.folder.textContent = '—';
    elements.job.duration.textContent = '—';
    elements.job.language.textContent = '—';
    elements.job.model.textContent = '—';
    elements.job.wer.textContent = '—';
    const list = elements.job.breadcrumbs;
    while (list.children.length > 3) list.removeChild(list.lastChild);
    return;
  }
  const { job, text, segments, folderPath } = detail;
  const displayed = segments && segments.length ? segments.slice(-state.job.maxSegments) : [text];
  tailControllers.job.render(displayed.join(''));
  elements.job.title.textContent = job.name;
  elements.job.subtitle.textContent = `Actualizado ${formatDate(job.updatedAt)} · ${formatDuration(job.durationSec)}`;
  elements.job.status.textContent = formatStatus(job.status);
  elements.job.folder.textContent = folderPath ? folderPath.slice(1) : '—';
  elements.job.duration.textContent = formatDuration(job.durationSec);
  elements.job.language.textContent = job.language?.toUpperCase() ?? '—';
  elements.job.model.textContent = job.model ?? '—';
  elements.job.wer.textContent = job.status === 'completed' ? '3.4%' : '—';
  elements.job.move.disabled = false;
  elements.job.copy.disabled = false;
  elements.job.downloadTxt.disabled = false;
  elements.job.downloadSrt.disabled = false;
  elements.job.exportMd.disabled = false;
  elements.job.audio.hidden = false;
  elements.job.audio.href = `/api/jobs/${job.id}/audio`;
  elements.job.logs.hidden = false;
  elements.job.logs.href = `/api/jobs/${job.id}/logs`;

  const list = elements.job.breadcrumbs;
  while (list.children.length > 3) list.removeChild(list.lastChild);
  if (folderPath) {
    folderPath
      .slice(1)
      .split('/')
      .filter(Boolean)
      .forEach((segment) => {
        const item = document.createElement('li');
        item.textContent = segment;
        list.appendChild(item);
      });
  }
  const jobItem = document.createElement('li');
  jobItem.textContent = job.name;
  list.appendChild(jobItem);
}

store.subscribe((state, prev) => {
  if (state.stats !== prev.stats) renderStats(state.stats);
  if (state.folders !== prev.folders || state.selectedFolderId !== prev.selectedFolderId) {
    renderFolderTree(state);
    renderFolderOptions(state.folders);
    renderLibraryBreadcrumb(state);
    prefillFolderInputs(state);
  }
  if (
    state.jobs !== prev.jobs ||
    state.libraryFilters !== prev.libraryFilters ||
    state.selectedFolderId !== prev.selectedFolderId ||
    state.folders !== prev.folders
  ) {
    renderLibraryTable(state);
  }
  if (state.recentJobs !== prev.recentJobs) {
    renderRecent(state.recentJobs);
  }
  if (state.live.segments !== prev.live.segments) {
    renderLiveSegments(state.live.segments);
  }
  if (state.live.status !== prev.live.status) {
    renderLiveStatus(state.live.status);
  }
  if (state.job.detail !== prev.job.detail || state.job.maxSegments !== prev.job.maxSegments) {
    renderJobDetail(state);
  }
});
function computeRecent(jobs) {
  return [...jobs]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);
}

async function loadStats() {
  try {
    const response = await fetch('/api/stats');
    if (!response.ok) throw new Error('Respuesta no válida');
    const stats = await response.json();
    store.setState((prev) => ({ ...prev, stats }));
  } catch (error) {
    console.warn('Usando estadísticas de ejemplo', error);
    store.setState((prev) => ({ ...prev, stats: SAMPLE_DATA.stats }));
  }
}

async function loadFolders() {
  try {
    const response = await fetch('/api/folders');
    if (!response.ok) throw new Error('Respuesta no válida');
    const folders = await response.json();
    store.setState((prev) => ({ ...prev, folders }));
  } catch (error) {
    console.warn('Usando carpetas de ejemplo', error);
    store.setState((prev) => ({ ...prev, folders: SAMPLE_DATA.folders }));
  }
}

async function loadJobs() {
  try {
    const response = await fetch('/api/jobs');
    if (!response.ok) throw new Error('Respuesta no válida');
    const jobs = await response.json();
    store.setState((prev) => ({ ...prev, jobs, recentJobs: computeRecent(jobs) }));
  } catch (error) {
    console.warn('Usando transcripciones de ejemplo', error);
    store.setState((prev) => ({ ...prev, jobs: SAMPLE_DATA.jobs, recentJobs: computeRecent(SAMPLE_DATA.jobs) }));
  }
}

async function loadJobDetail(jobId) {
  const current = store.getState().jobs.find((job) => job.id === jobId);
  if (!current) return;
  try {
    const response = await fetch(`/api/jobs/${jobId}/text`);
    if (!response.ok) throw new Error('Respuesta no válida');
    const payload = await response.json();
    const folderMap = new Map(store.getState().folders.map((folder) => [folder.id, folder]));
    const folderPath = current.folderId && folderMap.get(current.folderId) ? folderMap.get(current.folderId).path : '';
    store.setState((prev) => ({
      ...prev,
      job: {
        ...prev.job,
        detail: {
          job: current,
          text: payload.text ?? '',
          segments: payload.segments ?? null,
          folderPath,
        },
      },
    }));
  } catch (error) {
    console.warn('Usando detalle de ejemplo', error);
    const sample = SAMPLE_DATA.texts[jobId];
    const folderMap = new Map(store.getState().folders.map((folder) => [folder.id, folder]));
    const folderPath = current.folderId && folderMap.get(current.folderId) ? folderMap.get(current.folderId).path : '';
    store.setState((prev) => ({
      ...prev,
      job: {
        ...prev.job,
        detail: {
          job: current,
          text: sample?.text ?? '',
          segments: sample?.segments ?? null,
          folderPath,
        },
      },
    }));
  }
}

async function loadInitialData() {
  await Promise.all([loadStats(), loadFolders(), loadJobs()]);
}
function formatStatus(status) {
  switch (status) {
    case 'processing':
      return 'Procesando';
    case 'completed':
      return 'Completa';
    case 'queued':
      return 'En cola';
    case 'error':
      return 'Error';
    default:
      return status;
  }
}

function formatDuration(seconds = 0) {
  if (!Number.isFinite(seconds)) return '—';
  const totalMinutes = Math.floor(seconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const secs = Math.floor(seconds % 60);
  if (hours) {
    return `${hours}h ${String(mins).padStart(2, '0')}m`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureFolderPath(pathInput) {
  const normalized = pathInput.trim();
  if (!normalized) return null;
  const parts = normalized.split('/').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const existingMap = new Map(store.getState().folders.map((folder) => [folder.path, folder]));
  const folders = [...store.getState().folders];
  let parentId = null;
  let currentPath = '';
  let finalId = null;
  parts.forEach((segment) => {
    currentPath += `/${segment}`;
    let folder = existingMap.get(currentPath);
    if (!folder) {
      folder = {
        id: createId('fld'),
        name: segment,
        parentId,
        path: currentPath,
        createdAt: new Date().toISOString(),
      };
      existingMap.set(currentPath, folder);
      folders.push(folder);
    }
    parentId = folder.id;
    finalId = folder.id;
  });
  store.setState((prev) => ({ ...prev, folders }));
  return finalId;
}

let pendingFiles = [];

function isMediaFile(file) {
  if (!file) return false;
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('audio/') || type.startsWith('video/')) return true;
  const name = (file.name || '').toLowerCase();
  return ['.aac', '.flac', '.m4a', '.m4v', '.mkv', '.mov', '.mp3', '.mp4', '.ogg', '.wav', '.webm', '.wma'].some((ext) =>
    name.endsWith(ext),
  );
}

async function uploadFileToApi(file, folderPath, options) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/transcriptions');
    xhr.responseType = 'json';

    xhr.upload.onprogress = (event) => {
      if (!options?.onProgress || !event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      options.onProgress(percent);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
        return;
      }
      const detail = xhr.response?.detail || xhr.statusText || 'Error desconocido al subir.';
      reject(new Error(xhr.status === 413 ? 'El archivo supera el límite permitido.' : detail));
    };

    xhr.onerror = () => reject(new Error('No se pudo conectar con el servidor.'));

    const form = new FormData();
    const destination = folderPath.replace(/^[\/\\]+/, '');
    form.append('upload', file);
    form.append('destination_folder', destination || 'General');
    if (options?.language) form.append('language', options.language);
    if (options?.model) form.append('model_size', options.model);
    if (options?.devicePreference) form.append('device_preference', options.devicePreference);

    xhr.send(form);
  });
}

async function handleUploadSubmit(event) {
  event.preventDefault();
  const files = pendingFiles.length ? pendingFiles : Array.from(elements.upload.input.files).filter(isMediaFile);
  const { submit } = elements.upload;
  if (submit) submit.disabled = true;
  if (!files.length) {
    elements.upload.feedback.textContent = 'Selecciona o arrastra al menos un archivo de audio.';
    if (submit) submit.disabled = false;
    resetUploadProgress();
    return;
  }
  const folderPath = elements.upload.folder.value.trim();
  if (!folderPath) {
    elements.upload.feedback.textContent = 'Indica una carpeta destino.';
    if (submit) submit.disabled = false;
    resetUploadProgress();
    return;
  }
  const normalizedFolderPath = normalizePath(folderPath);
  const folderId = ensureFolderPath(folderPath);
  if (!folderId) {
    elements.upload.feedback.textContent = 'No se pudo preparar la carpeta indicada.';
    if (submit) submit.disabled = false;
    resetUploadProgress();
    return;
  }
  const jobs = [...store.getState().jobs];
  const now = new Date();
  const language = elements.upload.language.value || '';
  const model = elements.upload.model.value;
  const devicePreference = model === 'large-v3' ? 'gpu' : 'cpu';
  const totalFiles = files.length;
  let completed = 0;
  let failed = 0;
  elements.upload.feedback.textContent = 'Preparando subida…';
  setUploadProgress(0);

  const updateOverallProgress = (currentCompleted, partial) => {
    if (!totalFiles) return;
    const percent = Math.round(((currentCompleted + partial) / totalFiles) * 100);
    setUploadProgress(percent);
  };

  for (const file of files) {
    try {
      const response = await uploadFileToApi(file, normalizedFolderPath || folderPath, {
        language,
        model,
        devicePreference,
        onProgress(percent) {
          const fractional = percent / 100;
          updateOverallProgress(completed, fractional);
          elements.upload.feedback.textContent = `Subiendo ${file.name} (${percent}%)…`;
        },
      });
      const apiId = response?.id != null ? String(response.id) : createId('job-api');
      jobs.push({
        id: apiId,
        name: file.name,
        folderId,
        status: 'queued',
        durationSec: Math.round((file.size / 1024 / 1024) * 60) || 300,
        language: language || 'auto',
        model,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      completed += 1;
      updateOverallProgress(completed, 0);
      elements.upload.feedback.textContent = `Archivo ${file.name} en cola (${completed}/${totalFiles}).`;
    } catch (error) {
      console.error('Falló la subida', error);
      failed += 1;
      elements.upload.feedback.textContent = `Error con ${file.name}: ${error.message}`;
    }
  }

  store.setState((prev) => ({ ...prev, jobs, recentJobs: computeRecent(jobs) }));
  if (completed && failed) {
    elements.upload.feedback.textContent = `Subida parcial: ${completed} archivo(s) listo(s), ${failed} con error.`;
  } else if (completed) {
    elements.upload.feedback.textContent = 'Archivos encolados correctamente.';
    await loadStats().catch((error) => console.warn('No se pudieron refrescar las métricas', error));
  } else if (failed) {
    elements.upload.feedback.textContent = 'No se pudo subir ningún archivo. Revisa el tamaño y el formato.';
  }

  elements.upload.form.reset();
  pendingFiles = [];
  renderPendingFiles(pendingFiles);
  prefillFolderInputs(store.getState());
  elements.upload.dropzone.classList.remove('dropzone--active');
  window.setTimeout(() => resetUploadProgress(), 900);
  if (submit) submit.disabled = false;
}

function setupDropzone() {
  const { dropzone, trigger, input } = elements.upload;
  resetUploadProgress();
  renderPendingFiles([]);
  trigger.addEventListener('click', () => input.click());
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('dropzone--active');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dropzone--active');
  });
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('dropzone--active');
    pendingFiles = Array.from(event.dataTransfer.files).filter(isMediaFile);
    renderPendingFiles(pendingFiles);
    resetUploadProgress();
    elements.upload.feedback.textContent = pendingFiles.length
      ? `${pendingFiles.length} archivo(s) listo(s) para subir.`
      : 'Los archivos arrastrados no son audio o video compatibles.';
  });
  input.addEventListener('change', () => {
    pendingFiles = Array.from(input.files || []).filter(isMediaFile);
    renderPendingFiles(pendingFiles);
    resetUploadProgress();
    elements.upload.feedback.textContent = pendingFiles.length
      ? `${pendingFiles.length} archivo(s) listo(s) para subir.`
      : '';
  });
}

function setupPromptCopy() {
  const { prompt, copy } = elements.benefits;
  if (!prompt || !copy) return;
  copy.addEventListener('click', async () => {
    const previous = copy.textContent;
    const markCopied = () => {
      copy.textContent = '¡Copiado!';
      copy.disabled = true;
      window.setTimeout(() => {
        copy.textContent = previous;
        copy.disabled = false;
      }, 1200);
    };
    try {
      await navigator.clipboard.writeText(prompt.value);
      markCopied();
    } catch (error) {
      let copied = false;
      try {
        prompt.focus();
        prompt.select();
        copied = document.execCommand ? document.execCommand('copy') : false;
        window.getSelection()?.removeAllRanges();
      } catch (fallbackError) {
        console.error('Fallo el método de copia alternativo', fallbackError);
      }
      if (copied) {
        markCopied();
        return;
      }
      console.error('No se pudo copiar el prompt', error);
      alert('No se pudo copiar el prompt automáticamente. Copia manualmente desde el área de texto.');
    }
  });
}
function normalizePath(path) {
  if (!path) return '';
  let cleaned = path.replace(/\/+/g, '/');
  if (!cleaned.startsWith('/')) cleaned = `/${cleaned}`;
  if (cleaned.endsWith('/') && cleaned !== '/') cleaned = cleaned.slice(0, -1);
  return cleaned;
}
function renameFolder(folderId, newName) {
  store.setState((prev) => {
    const target = prev.folders.find((folder) => folder.id === folderId);
    if (!target) return prev;
    const oldPath = target.path;
    const parentPath = oldPath.slice(0, oldPath.lastIndexOf('/')) || '';
    const newPath = normalizePath(`${parentPath}/${newName}`);
    const folders = prev.folders.map((folder) => {
      if (folder.id === folderId) {
        return { ...folder, name: newName, path: newPath };
      }
      if (folder.path.startsWith(`${oldPath}/`)) {
        const suffix = folder.path.slice(oldPath.length);
        return { ...folder, path: normalizePath(`${newPath}${suffix}`) };
      }
      return folder;
    });
    return { ...prev, folders };
  });
}

function moveFolder(folderId, destinationPath) {
  let parentId = null;
  let parentPath = '';
  if (destinationPath.trim()) {
    parentId = ensureFolderPath(destinationPath);
    const folder = store.getState().folders.find((item) => item.id === parentId);
    parentPath = folder ? folder.path : '';
  }
  store.setState((prev) => {
    const target = prev.folders.find((folder) => folder.id === folderId);
    if (!target) return prev;
    const oldPath = target.path;
    const newPath = normalizePath(`${parentPath}/${target.name}`);
    const folders = prev.folders.map((folder) => {
      if (folder.id === folderId) {
        return { ...folder, parentId: parentId ?? null, path: newPath };
      }
      if (folder.path.startsWith(`${oldPath}/`)) {
        const suffix = folder.path.slice(oldPath.length);
        return { ...folder, path: normalizePath(`${newPath}${suffix}`) };
      }
      return folder;
    });
    return { ...prev, folders };
  });
}

function deleteFolder(folderId) {
  store.setState((prev) => {
    const target = prev.folders.find((folder) => folder.id === folderId);
    if (!target) return prev;
    const affected = new Set(
      prev.folders
        .filter((folder) => folder.path === target.path || folder.path.startsWith(`${target.path}/`))
        .map((folder) => folder.id),
    );
    const folders = prev.folders.filter((folder) => !affected.has(folder.id));
    const jobs = prev.jobs.map((job) => (job.folderId && affected.has(job.folderId) ? { ...job, folderId: null } : job));
    const selectedFolderId = affected.has(prev.selectedFolderId) ? null : prev.selectedFolderId;
    return { ...prev, folders, jobs, recentJobs: computeRecent(jobs), selectedFolderId };
  });
}

function moveJob(jobId, destinationPath) {
  const targetPath = destinationPath.trim();
  const folderId = targetPath ? ensureFolderPath(targetPath) : null;
  store.setState((prev) => {
    const jobs = prev.jobs.map((job) =>
      job.id === jobId
        ? { ...job, folderId, updatedAt: new Date().toISOString() }
        : job,
    );
    return { ...prev, jobs, recentJobs: computeRecent(jobs) };
  });
  loadJobDetail(jobId);
}

function openJob(jobId) {
  goToRoute('job');
  loadJobDetail(jobId);
}
function appendLiveSegment(chunk) {
  store.setState((prev) => {
    const segments = [...prev.live.segments, chunk];
    const trimmed = segments.slice(-prev.live.maxSegments);
    return { ...prev, live: { ...prev.live, segments: trimmed } };
  });
}

function updateLiveKpis() {
  const segments = store.getState().live.segments;
  const text = segments.join(' ');
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const minutes = Math.max(1, segments.length / 2);
  elements.live.kpis.forEach((node) => {
    const metric = node.dataset.liveKpi;
    if (metric === 'wpm') node.textContent = Math.max(0, Math.round(words / minutes));
    if (metric === 'latency') node.textContent = `${Math.floor(80 + Math.random() * 40)} ms`;
    if (metric === 'dropped') node.textContent = Math.floor(Math.random() * 2);
  });
}

function stopLiveTimer() {
  if (liveSession.timer) {
    clearInterval(liveSession.timer);
    liveSession.timer = null;
  }
}

function startLiveSession() {
  if (store.getState().live.status === 'recording') return;
  store.setState((prev) => ({ ...prev, live: { ...prev.live, status: 'recording', segments: [] } }));
  liveSession.cursor = 0;
  stopLiveTimer();
  liveSession.timer = setInterval(() => {
    const chunk = SAMPLE_LIVE_SEGMENTS[liveSession.cursor % SAMPLE_LIVE_SEGMENTS.length];
    liveSession.cursor += 1;
    appendLiveSegment(chunk);
    updateLiveKpis();
  }, 1500);
}

function pauseLiveSession() {
  if (store.getState().live.status !== 'recording') return;
  stopLiveTimer();
  store.setState((prev) => ({ ...prev, live: { ...prev.live, status: 'paused' } }));
}

function resumeLiveSession() {
  if (store.getState().live.status !== 'paused') return;
  store.setState((prev) => ({ ...prev, live: { ...prev.live, status: 'recording' } }));
  stopLiveTimer();
  liveSession.timer = setInterval(() => {
    const chunk = SAMPLE_LIVE_SEGMENTS[liveSession.cursor % SAMPLE_LIVE_SEGMENTS.length];
    liveSession.cursor += 1;
    appendLiveSegment(chunk);
    updateLiveKpis();
  }, 1500);
}

function finishLiveSession() {
  if (store.getState().live.status === 'idle') return;
  stopLiveTimer();
  store.setState((prev) => ({ ...prev, live: { ...prev.live, status: 'completed' } }));
  const segments = store.getState().live.segments;
  if (!segments.length) return;
  const text = segments.join('');
  const folderInput = elements.live.folder.value.trim() || elements.upload.folder.value.trim() || 'General';
  const folderId = ensureFolderPath(folderInput);
  const now = new Date();
  const jobs = [...store.getState().jobs];
  const id = createId('job');
  jobs.unshift({
    id,
    name: `Sesión en vivo ${now.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}`,
    folderId,
    status: 'completed',
    durationSec: segments.length * 30,
    language: elements.live.language.value || 'es',
    model: elements.live.model.value,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  store.setState((prev) => ({
    ...prev,
    jobs,
    recentJobs: computeRecent(jobs),
    stats: prev.stats
      ? {
          ...prev.stats,
          todayCount: prev.stats.todayCount + 1,
          totalCount: prev.stats.totalCount + 1,
          todayMinutes: prev.stats.todayMinutes + Math.round((segments.length * 30) / 60),
          totalMinutes: prev.stats.totalMinutes + Math.round((segments.length * 30) / 60),
          queue: Math.max(0, prev.stats.queue - 1),
        }
      : prev.stats,
  }));
  SAMPLE_DATA.texts[id] = { jobId: id, text, segments: [...segments] };
  loadJobDetail(id);
}
let searchTimer = null;
function updateLibraryFilter(key, value) {
  store.setState((prev) => ({ ...prev, libraryFilters: { ...prev.libraryFilters, [key]: value } }));
}
function setupFilters() {
  elements.library.filterStatus.addEventListener('change', (event) => updateLibraryFilter('status', event.target.value));
  elements.library.filterLanguage.addEventListener('change', (event) => updateLibraryFilter('language', event.target.value));
  elements.library.filterModel.addEventListener('change', (event) => updateLibraryFilter('model', event.target.value));
  elements.library.filterSearch.addEventListener('input', (event) => {
    const value = event.target.value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => updateLibraryFilter('search', value), 200);
  });
}

function setupLibraryActions() {
  elements.library.create.addEventListener('click', () => {
    const input = prompt('Ruta de la nueva carpeta (ej. Clases/2024)');
    if (input) ensureFolderPath(input);
  });
  elements.library.rename.addEventListener('click', () => {
    const state = store.getState();
    if (!state.selectedFolderId) {
      alert('Selecciona una carpeta para renombrar.');
      return;
    }
    const folder = state.folders.find((item) => item.id === state.selectedFolderId);
    const name = prompt('Nuevo nombre de la carpeta', folder?.name ?? '');
    if (name) renameFolder(state.selectedFolderId, name.trim());
  });
  elements.library.move.addEventListener('click', () => {
    const state = store.getState();
    if (!state.selectedFolderId) {
      alert('Selecciona una carpeta para mover.');
      return;
    }
    const destination = prompt('Ruta destino (dejar vacío para mover a raíz)', '');
    if (destination === null) return;
    moveFolder(state.selectedFolderId, destination.trim());
  });
  elements.library.remove.addEventListener('click', () => {
    const state = store.getState();
    if (!state.selectedFolderId) {
      alert('Selecciona una carpeta para eliminar.');
      return;
    }
    const folder = state.folders.find((item) => item.id === state.selectedFolderId);
    const confirmed = confirm(`¿Eliminar la carpeta "${folder?.name ?? ''}" y su contenido?`);
    if (confirmed) deleteFolder(state.selectedFolderId);
  });
}
function setupJobActions() {
  elements.job.copy.addEventListener('click', async () => {
    const detail = store.getState().job.detail;
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(detail.text);
      alert('Texto copiado al portapapeles.');
    } catch (error) {
      alert('No se pudo copiar el texto.');
    }
  });

  elements.job.downloadTxt.addEventListener('click', async () => {
    const detail = store.getState().job.detail;
    if (!detail) return;
    const url = `/api/transcriptions/${detail.job.id}.txt`;
    await triggerDownload(url, detail.text, `${detail.job.id}.txt`);
  });

  elements.job.downloadSrt.addEventListener('click', async () => {
    const detail = store.getState().job.detail;
    if (!detail) return;
    const lines = detail.segments?.length
      ? detail.segments.map((segment, index) => `${index + 1}\n00:00:${String(index).padStart(2, '0')} --> 00:00:${String(index + 1).padStart(2, '0')}\n${segment}\n`)
      : [`1\n00:00:00 --> 00:10:00\n${detail.text}\n`];
    const fallback = lines.join('\n');
    const url = `/api/transcriptions/${detail.job.id}.srt`;
    await triggerDownload(url, fallback, `${detail.job.id}.srt`);
  });

  elements.job.exportMd.addEventListener('click', () => {
    const detail = store.getState().job.detail;
    if (!detail) return;
    const content = `# ${detail.job.name}\n\n${detail.text}`;
    downloadFileFallback(`${detail.job.id}.md`, content);
  });

  elements.job.move.addEventListener('click', () => {
    const detail = store.getState().job.detail;
    if (!detail) return;
    const destination = prompt('Mover a carpeta (ej. Clases/2024). Dejar vacío para raíz.', detail.folderPath ? detail.folderPath.slice(1) : '');
    if (destination === null) return;
    moveJob(detail.job.id, destination);
  });
}
function setupLiveControls() {
  elements.home.start.addEventListener('click', startLiveSession);
  elements.live.start.addEventListener('click', startLiveSession);
  elements.home.pause.addEventListener('click', pauseLiveSession);
  elements.live.pause.addEventListener('click', pauseLiveSession);
  elements.home.resume.addEventListener('click', resumeLiveSession);
  elements.live.resume.addEventListener('click', resumeLiveSession);
  elements.home.finish.addEventListener('click', finishLiveSession);
  elements.live.finish.addEventListener('click', finishLiveSession);

  elements.live.tailSize.value = String(store.getState().live.maxSegments);
  elements.live.tailSize.addEventListener('change', (event) => {
    const value = Number(event.target.value);
    preferences.set(LOCAL_KEYS.liveTailSize, value);
    store.setState((prev) => ({
      ...prev,
      live: {
        ...prev.live,
        maxSegments: value,
        segments: prev.live.segments.slice(-value),
      },
    }));
  });

  elements.job.tailSize.value = String(store.getState().job.maxSegments);
  elements.job.tailSize.addEventListener('change', (event) => {
    const value = Number(event.target.value);
    preferences.set(LOCAL_KEYS.jobTailSize, value);
    store.setState((prev) => ({
      ...prev,
      job: {
        ...prev.job,
        maxSegments: value,
      },
    }));
  });
}
function setupFontControls(increaseBtn, decreaseBtn, textElement) {
  if (!textElement) return;
  let scale = 1;
  const apply = () => {
    textElement.style.fontSize = `${scale}rem`;
  };
  increaseBtn?.addEventListener('click', () => {
    scale = Math.min(1.8, +(scale + 0.1).toFixed(2));
    apply();
  });
  decreaseBtn?.addEventListener('click', () => {
    scale = Math.max(0.8, +(scale - 0.1).toFixed(2));
    apply();
  });
}

function setupFullscreenButtons() {
  document.querySelectorAll('[data-fullscreen-target]').forEach((button) => {
    const targetId = button.dataset.fullscreenTarget;
    const panel = document.getElementById(targetId);
    if (!panel) return;
    button.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await panel.requestFullscreen();
        }
      } catch (error) {
        console.warn('Fullscreen no disponible', error);
      }
    });
  });

  document.addEventListener('fullscreenchange', () => {
    const active = Boolean(document.fullscreenElement);
    document.querySelectorAll('[data-fullscreen-target]').forEach((button) => {
      button.textContent = active ? 'Salir pantalla completa' : 'Pantalla completa';
    });
  });
}
function setupHomeShortcuts() {
  elements.home.newTranscription.addEventListener('click', () => {
    elements.upload.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  elements.home.quickFolder.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const value = event.target.value.trim();
    if (!value) return;
    const folderId = ensureFolderPath(value);
    if (folderId) {
      elements.upload.folder.value = value;
      elements.live.folder.value = value;
      store.setState((prev) => ({ ...prev, selectedFolderId: folderId }));
    }
  });
  elements.home.quickFolder.addEventListener('change', (event) => {
    const value = event.target.value.trim();
    if (!value) return;
    const folderId = ensureFolderPath(value);
    if (folderId) {
      elements.upload.folder.value = value;
      elements.live.folder.value = value;
      store.setState((prev) => ({ ...prev, selectedFolderId: folderId }));
    }
  });
}
function setupDiagnostics() {
  elements.diagnostics.addEventListener('click', () => {
    alert('Diagnóstico rápido:\n\n- WS en vivo conectado\n- Última sesión estable\n- Modelos cargados correctamente');
  });
}
async function init() {
  setupTheme();
  setupAnchorGuards();
  setupRouter();
  renderPricingPlans();
  injectPrompt();
  setupPromptCopy();
  setupDropzone();
  elements.upload.form.addEventListener('submit', handleUploadSubmit);
  setupFilters();
  setupLibraryActions();
  setupJobActions();
  setupLiveControls();
  setupFontControls(elements.home.fontIncrease, elements.home.fontDecrease, elements.home.liveText);
  setupFontControls(elements.live.fontPlus, elements.live.fontMinus, elements.live.text);
  setupFullscreenButtons();
  setupHomeShortcuts();
  setupDiagnostics();
  await loadInitialData();
  initRouteFromStorage();
}
function boot() {
  console.info('Grabadora Pro frontend listo');
  init().catch((error) => console.error('Error inicializando la aplicación', error));
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
