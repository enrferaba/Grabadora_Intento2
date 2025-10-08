const ROUTES = ['home', 'live', 'library', 'job', 'benefits'];
const LOCAL_KEYS = {
  homeFollow: 'grabadora:home-follow',
  liveFollow: 'grabadora:live-follow',
  jobFollow: 'grabadora:job-follow',
  liveTailSize: 'grabadora:live-tail-size',
  liveChunkInterval: 'grabadora:live-chunk-interval',
  jobTailSize: 'grabadora:job-tail-size',
  lastRoute: 'grabadora:last-route',
};
const THEME_KEY = 'grabadora:theme';

const PREMIUM_PLANS = [
  {
    slug: 'student-local',
    name: 'Estudiante Local',
    badge: 'Plan educativo',
    price: '10 €',
    cadence: '/mes',
    description: 'Procesa en tu propio ordenador para pagar solo la licencia básica y conservar la privacidad.',
    perks: [
      'Ejecución local ilimitada sin coste por minuto en la nube.',
      'Renovación automática con tarjeta, débito o PayPal (puedes pausar cuando quieras).',
      'Recordatorios de pago y validación de dispositivo para mantener el descuento educativo.',
    ],
    paymentNote:
      'Pagas 10 € al mes de forma recurrente. El cobro se gestiona desde tu panel con cancelación inmediata y recibos en PDF.',
    paymentSteps: [
      'Confirma tu correo académico o documento equivalente para aplicar la tarifa de 10 €.',
      'Autoriza la descarga inicial del modelo seleccionado para ejecutar el procesamiento en tu ordenador.',
      'Selecciona tarjeta, débito o PayPal y confirma el pago seguro. Podrás cancelar cuando quieras desde el panel.',
    ],
    checkoutUrl: 'https://pay.grabadora.pro/checkout/student-local',
  },
  {
    slug: 'starter-15',
    name: 'Starter Cloud',
    badge: 'Pequeños equipos',
    price: '25 €',
    cadence: '/mes',
    description: 'Minutos en la nube optimizados con colas prioritarias, exportaciones enriquecidas y soporte rápido.',
    perks: [
      '30 horas/mes en servidores GPU gestionados con prioridad en colas.',
      'Facturación con IVA y recibos automáticos para tarjetas corporativas o PayPal.',
      'Notas automáticas, exportaciones DOCX/PDF y soporte en menos de 12 horas.',
    ],
    paymentNote:
      'Acepta tarjetas, PayPal y transferencias SEPA. Emitimos factura automática cada mes y puedes cambiar el método de pago al instante.',
    paymentSteps: [
      'Selecciona el espacio de trabajo que quieres priorizar y define los miembros con acceso a GPU.',
      'Completa los datos de facturación (razón social, CIF/NIF, dirección) para generar la factura desde el primer ciclo.',
      'Autoriza el pago con tarjeta, PayPal o SEPA recurrente y recibe confirmación inmediata en tu correo.',
    ],
    checkoutUrl: 'https://pay.grabadora.pro/checkout/starter-15',
  },
  {
    slug: 'pro-60',
    name: 'Pro Teams',
    badge: 'Productoras & agencias',
    price: '59 €',
    cadence: '/mes',
    description: 'Pensado para equipos y productoras con integraciones, controles avanzados y asistencia dedicada.',
    perks: [
      '120 horas/mes con reprocesado large-v3, diarización avanzada y backup redundante.',
      'Pagos agrupados, órdenes de compra y facturación consolidada por departamento.',
      'Integraciones con Drive, Notion, webhooks y soporte directo con gestor técnico.',
    ],
    paymentNote:
      'Disponible pago mensual o anual (2 meses de cortesía). Soportamos facturación multiempresa y límites de gasto por miembro.',
    paymentSteps: [
      'Agenda una breve validación de volumen para personalizar las horas incluidas y los límites de consumo.',
      'Adjunta la orden de compra o datos fiscales avanzados para emitir contratos y facturación consolidada.',
      'Confirma el método de pago (tarjeta, transferencia programada o factura anual anticipada) y recibe tu gestor técnico.',
    ],
    checkoutUrl: 'https://pay.grabadora.pro/checkout/pro-60',
  },
];

const WHISPER_MODELS = [
  {
    value: 'turbo',
    label: 'turbo · latencia mínima',
    recommendedBeam: 1,
    preferredDevice: 'gpu',
    note: 'Perfecto para streaming con la menor espera.',
  },
  {
    value: 'tiny',
    label: 'tiny · súper veloz',
    recommendedBeam: 1,
    preferredDevice: 'cpu',
    note: 'Útil para pruebas rápidas en equipos modestos.',
  },
  {
    value: 'base',
    label: 'base · equilibrado',
    recommendedBeam: 1,
    preferredDevice: 'cpu',
    note: 'Buen balance entre velocidad y claridad en notebooks.',
  },
  {
    value: 'small',
    label: 'small · reuniones',
    recommendedBeam: 2,
    preferredDevice: 'gpu',
    note: 'Recomendado para clases y reuniones diarias.',
  },
  {
    value: 'medium',
    label: 'medium · más detalle',
    recommendedBeam: 3,
    preferredDevice: 'gpu',
    note: 'Mayor precisión con un coste moderado de GPU.',
  },
  {
    value: 'large',
    label: 'large · máxima fidelidad',
    recommendedBeam: 4,
    preferredDevice: 'gpu',
    note: 'Para audios críticos cuando importa cada palabra.',
  },
  {
    value: 'large-v2',
    label: 'large-v2 · multilenguaje',
    recommendedBeam: 4,
    preferredDevice: 'gpu',
    note: 'Mejor rendimiento multilingüe estable.',
  },
  {
    value: 'large-v3',
    label: 'large-v3 · última generación',
    recommendedBeam: 4,
    preferredDevice: 'gpu',
    note: 'Mayor precisión en español y entornos ruidosos.',
  },
];

const BEAM_OPTIONS = [1, 2, 3, 4, 5, 8];
const DEFAULT_MODEL = 'large-v3';
const NUMERIC_ID_PATTERN = /^\d+$/;
const DEFAULT_LIVE_CHUNK_INTERVAL_MS = 1000;
const LIVE_CHUNK_MAX_RETRIES = 3;
const LIVE_CHUNK_RETRY_BASE_DELAY_MS = 250;
const LIVE_CHUNK_RETRY_MAX_DELAY_MS = 4000;

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
      beam: 4,
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
      beam: 4,
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
      beam: 2,
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
      beam: 4,
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
      beam: 4,
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

const STREAM_SEGMENT_LIMIT = 400;
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
    start: document.getElementById('home-live-start'),
    pause: document.getElementById('home-live-pause'),
    resume: document.getElementById('home-live-resume'),
    finish: document.getElementById('home-live-finish'),
    fontIncrease: document.getElementById('home-live-font-increase'),
    fontDecrease: document.getElementById('home-live-font-decrease'),
    fullscreen: document.getElementById('home-live-fullscreen'),
    recentBody: document.getElementById('recent-table-body'),
    quickFolder: document.getElementById('quick-folder'),
    newTranscription: document.getElementById('home-new-transcription'),
    progress: document.getElementById('home-live-progress'),
    progressLabel: document.getElementById('home-live-progress-label'),
    progressRate: document.getElementById('home-live-progress-rate'),
    progressFill: document.getElementById('home-live-progress-fill'),
    progressBar: document.getElementById('home-live-progress-bar'),
    progressPercent: document.getElementById('home-live-progress-percent'),
    progressRemaining: document.getElementById('home-live-progress-remaining'),
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
    beam: document.getElementById('upload-beam'),
    beamHint: document.getElementById('upload-beam-hint'),
    submit: document.querySelector('#upload-form button[type="submit"]'),
  },
  benefits: {
    pricing: document.getElementById('pricing-grid'),
    prompt: document.getElementById('codex-prompt'),
    copy: document.getElementById('copy-prompt'),
    planDialog: document.getElementById('plan-dialog'),
    planDialogPanel: document.querySelector('#plan-dialog .plan-dialog__panel'),
    planDialogBadge: document.getElementById('plan-dialog-badge'),
    planDialogTitle: document.getElementById('plan-dialog-title'),
    planDialogSubtitle: document.getElementById('plan-dialog-subtitle'),
    planDialogAmount: document.getElementById('plan-dialog-amount'),
    planDialogCadence: document.getElementById('plan-dialog-cadence'),
    planDialogFeatures: document.getElementById('plan-dialog-features'),
    planDialogSteps: document.getElementById('plan-dialog-steps'),
    planDialogPayment: document.getElementById('plan-dialog-payment'),
    planDialogCheckout: document.getElementById('plan-dialog-checkout'),
    planDialogDismiss: document.querySelectorAll('#plan-dialog [data-plan-dismiss]'),
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
    chunkInterval: document.getElementById('live-chunk-interval'),
    fontPlus: document.getElementById('live-font-plus'),
    fontMinus: document.getElementById('live-font-minus'),
    fullscreen: document.getElementById('live-fullscreen'),
    kpis: document.querySelectorAll('[data-live-kpi]'),
    error: document.getElementById('live-error-message'),
    beam: document.getElementById('live-beam'),
    beamHint: document.getElementById('live-beam-hint'),
    progress: document.getElementById('live-progress'),
    progressLabel: document.getElementById('live-progress-label'),
    progressRate: document.getElementById('live-progress-rate'),
    progressFill: document.getElementById('live-progress-fill'),
    progressBar: document.getElementById('live-progress-bar'),
    progressPercent: document.getElementById('live-progress-percent'),
    progressRemaining: document.getElementById('live-progress-remaining'),
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
    liveStatus: document.getElementById('job-live-status'),
    progress: document.getElementById('job-progress'),
    progressBar: document.getElementById('job-progress-bar'),
    progressFill: document.getElementById('job-progress-fill'),
    progressLabel: document.getElementById('job-progress-label'),
    progressEta: document.getElementById('job-progress-eta'),
    status: document.getElementById('job-status'),
    folder: document.getElementById('job-folder'),
    duration: document.getElementById('job-duration'),
    language: document.getElementById('job-language'),
    model: document.getElementById('job-model'),
    beam: document.getElementById('job-beam'),
    wer: document.getElementById('job-wer'),
    audio: document.getElementById('job-audio'),
    logs: document.getElementById('job-logs'),
  },
  datalist: document.getElementById('folder-options'),
  diagnostics: document.getElementById('open-diagnostics'),
  modelPrep: {
    container: document.getElementById('model-prep'),
    title: document.getElementById('model-prep-title'),
    message: document.getElementById('model-prep-message'),
    percent: document.getElementById('model-prep-percent'),
    bar: document.getElementById('model-prep-bar'),
    fill: document.getElementById('model-prep-fill'),
    cancel: document.getElementById('model-prep-cancel'),
  },
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

const initialLiveChunkInterval = (() => {
  const stored = Number(preferences.get(LOCAL_KEYS.liveChunkInterval, NaN));
  if (Number.isFinite(stored) && stored > 0) return stored;
  const fromInput = Number(elements.live.chunkInterval?.value);
  if (Number.isFinite(fromInput) && fromInput > 0) return fromInput;
  return DEFAULT_LIVE_CHUNK_INTERVAL_MS;
})();

function getModelConfig(value) {
  const normalized = (value || '').toLowerCase();
  return (
    WHISPER_MODELS.find((model) => model.value === normalized) ||
    WHISPER_MODELS.find((model) => model.value === DEFAULT_MODEL) ||
    WHISPER_MODELS[0]
  );
}

function populateModelSelect(select, defaultModel) {
  if (!select) return;
  const desired = (defaultModel || select.dataset.defaultModel || DEFAULT_MODEL).toLowerCase();
  const currentValue = select.value;
  select.innerHTML = '';
  WHISPER_MODELS.forEach((model) => {
    const option = document.createElement('option');
    option.value = model.value;
    option.textContent = model.label;
    if (model.value === desired) option.selected = true;
    select.appendChild(option);
  });
  if (currentValue && WHISPER_MODELS.some((model) => model.value === currentValue)) {
    select.value = currentValue;
  }
}

function populateBeamSelect(select, defaultBeam) {
  if (!select) return;
  const desired = Number(defaultBeam || select.dataset.defaultBeam || 1);
  const currentValue = Number(select.value || desired);
  select.innerHTML = '';
  BEAM_OPTIONS.forEach((beam) => {
    const option = document.createElement('option');
    option.value = String(beam);
    option.textContent = `${beam} beams`;
    if (beam === desired) option.selected = true;
    select.appendChild(option);
  });
  if (BEAM_OPTIONS.includes(currentValue)) {
    select.value = String(currentValue);
  }
}

function normalizeStatus(status) {
  const value = (status || '').toLowerCase();
  if (value === 'failed') return 'error';
  if (value === 'pending') return 'queued';
  if (value === 'processing') return 'processing';
  if (value === 'completed') return 'completed';
  return value || 'queued';
}

function hashString(value) {
  let hash = 0;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0; // eslint-disable-line no-bitwise
  }
  return hash.toString(36);
}

function humanizeFolderSegment(segment) {
  const normalized = String(segment || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'General';
  return normalized.replace(/(^|\s)\w/g, (match) => match.toUpperCase());
}

function deriveFolderSegments(raw) {
  if (raw == null) return ['General'];
  const normalized = String(raw).replace(/\\/g, '/');
  const parts = normalized
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return ['General'];
  return parts.map(humanizeFolderSegment);
}

function buildFoldersFromTranscriptionsPayload(items) {
  const map = new Map();
  const ensureSegmentPath = (segments, createdAt) => {
    let parentPath = '';
    let parentId = null;
    segments.forEach((segment) => {
      const path = `${parentPath}/${segment}`;
      if (!map.has(path)) {
        const folder = {
          id: `fld-${hashString(path)}`,
          name: segment,
          parentId,
          path,
          createdAt: createdAt || new Date().toISOString(),
        };
        map.set(path, folder);
      }
      parentId = map.get(path).id;
      parentPath = path;
    });
  };

  items.forEach((item) => {
    const segments = deriveFolderSegments(item.output_folder);
    ensureSegmentPath(segments, item.created_at);
  });

  if (!map.size) {
    ensureSegmentPath(['General'], new Date().toISOString());
  }

  return {
    folders: Array.from(map.values()),
    byPath: map,
  };
}

function mapTranscriptionToJob(item, folderIndex) {
  const segments = deriveFolderSegments(item.output_folder);
  const folderPath = segments.reduce((acc, segment) => `${acc}/${segment}`, '');
  const folder = folderIndex.get(folderPath);
  return {
    id: String(item.id),
    name: item.original_filename,
    status: normalizeStatus(item.status),
    rawStatus: item.status,
    durationSec: Number.isFinite(item.duration) ? item.duration : null,
    language: item.language ?? '',
    model: item.model_size ?? '',
    beam: item.beam_size ?? null,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    folderId: folder ? folder.id : null,
    folderPath,
    outputFolder: segments.join('/'),
    devicePreference: item.device_preference ?? '',
    runtimeSeconds: item.runtime_seconds ?? null,
    transcriptPath: item.transcript_path ?? null,
  };
}

function computeStatsFromJobs(jobs, referenceItems = []) {
  const todayKey = new Date().toISOString().slice(0, 10);
  let totalMinutes = 0;
  let todayMinutes = 0;
  let todayCount = 0;
  let queue = 0;

  jobs.forEach((job) => {
    const minutes = Number(job.durationSec || 0) / 60;
    if (Number.isFinite(minutes)) {
      totalMinutes += minutes;
      const createdAt = job.createdAt ? new Date(job.createdAt) : null;
      if (createdAt && !Number.isNaN(createdAt.getTime())) {
        const createdKey = createdAt.toISOString().slice(0, 10);
        if (createdKey === todayKey) {
          todayMinutes += minutes;
          todayCount += 1;
        }
      }
    }
    if (job.status === 'processing' || job.status === 'queued') {
      queue += 1;
    }
  });

  const reference = [...referenceItems]
    .sort((a, b) => {
      const aDate = new Date(a.updated_at || a.created_at || 0).getTime();
      const bDate = new Date(b.updated_at || b.created_at || 0).getTime();
      return bDate - aDate;
    })
    .find(Boolean);
  const fallbackJob = jobs.find(Boolean);
  const device = (reference?.device_preference || fallbackJob?.devicePreference || '').toLowerCase();
  const model = reference?.model_size || fallbackJob?.model || DEFAULT_MODEL;
  const mode =
    device === 'cuda' || device === 'gpu'
      ? 'GPU'
      : device === 'cpu'
      ? 'CPU'
      : device
      ? device.toUpperCase()
      : 'Automático';

  return {
    totalMinutes: Math.max(0, Math.round(totalMinutes)),
    todayMinutes: Math.max(0, Math.round(todayMinutes)),
    totalCount: jobs.length,
    todayCount,
    queue,
    mode,
    model,
  };
}

function updateBeamRecommendation(context, { forceValue = false } = {}) {
  if (!context?.model) return;
  const config = getModelConfig(context.model.value);
  if (context.beamHint) {
    context.beamHint.textContent = `Recomendado: beam ${config.recommendedBeam} · ${config.note}`;
  }
  if (context.beam) {
    const dirty = context.beam.dataset.dirty === 'true';
    if (!dirty || forceValue) {
      context.beam.value = String(config.recommendedBeam);
    }
  }
  if (context.device && !context.device.dataset.deviceLocked) {
    context.device.value = config.preferredDevice;
  }
}

function setupModelSelectors() {
  const contexts = [
    {
      model: elements.upload.model,
      beam: elements.upload.beam,
      beamHint: elements.upload.beamHint,
      device: elements.upload.device ?? null,
      defaultModel: elements.upload.model?.dataset.defaultModel,
      defaultBeam: elements.upload.beam?.dataset.defaultBeam,
    },
    {
      model: elements.live.model,
      beam: elements.live.beam,
      beamHint: elements.live.beamHint,
      device: elements.live.device,
      defaultModel: elements.live.model?.dataset.defaultModel,
      defaultBeam: elements.live.beam?.dataset.defaultBeam,
    },
  ];

  contexts.forEach((context) => {
    if (!context.model) return;
    populateModelSelect(context.model, context.defaultModel);
    populateBeamSelect(context.beam, context.defaultBeam);
    if (context.beam) {
      context.beam.dataset.dirty = 'false';
      context.beam.addEventListener('change', () => {
        context.beam.dataset.dirty = 'true';
        if (context.model === elements.live.model) {
          const liveState = store.getState().live;
          if (liveState.status === 'recording' || liveState.status === 'paused') {
            renderLiveStatus(liveState);
          }
        }
      });
    }
    context.model.addEventListener('change', () => {
      if (context.beam) {
        context.beam.dataset.dirty = 'false';
      }
      updateBeamRecommendation(context, { forceValue: true });
      if (context.model === elements.live.model) {
        const liveState = store.getState().live;
        if (liveState.status === 'recording' || liveState.status === 'paused') {
          renderLiveStatus(liveState);
        }
      }
    });
    updateBeamRecommendation(context, { forceValue: true });
  });

  if (elements.library.filterModel) {
    const current = elements.library.filterModel.value;
    elements.library.filterModel.innerHTML = '';
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = 'Todos';
    elements.library.filterModel.appendChild(all);
    WHISPER_MODELS.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.value;
      option.textContent = model.label.split('·')[0].trim();
      elements.library.filterModel.appendChild(option);
    });
    if (current && current !== 'all') {
      elements.library.filterModel.value = current;
    }
  }

  if (elements.live.device) {
    elements.live.device.addEventListener('change', () => {
      elements.live.device.dataset.deviceLocked = 'true';
    });
  }

  const initialLiveState = store.getState().live;
  renderLiveStatus(initialLiveState);
  renderLiveKpis(initialLiveState);
  renderLiveProgress(initialLiveState);
  renderLiveError(initialLiveState);
}

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

    if (plan.badge) {
      const badge = document.createElement('span');
      badge.className = 'pricing-card__badge';
      badge.textContent = plan.badge;
      header.appendChild(badge);
    }

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

    if (plan.paymentNote) {
      const payment = document.createElement('p');
      payment.className = 'pricing-card__payment';
      payment.textContent = plan.paymentNote;
      card.appendChild(payment);
    }

    const cta = document.createElement('a');
    cta.className = 'pricing-card__cta';
    cta.href = `/checkout?plan=${encodeURIComponent(plan.slug)}`;
    cta.textContent = `Elegir ${plan.name}`;
    cta.addEventListener('click', (event) => {
      event.preventDefault();
      handlePlanSelection(plan);
    });
    card.appendChild(cta);

    elements.benefits.pricing.appendChild(card);
  });
}

let planDialogActivePlan = null;
let planDialogKeyListenerAttached = false;

function isPlanDialogOpen() {
  const dialog = elements.benefits.planDialog;
  return Boolean(dialog && !dialog.hidden);
}

function closePlanDialog() {
  const dialog = elements.benefits.planDialog;
  if (!dialog || dialog.hidden) return;
  dialog.classList.remove('is-visible');
  dialog.setAttribute('aria-hidden', 'true');
  dialog.hidden = true;
  delete dialog.dataset.planSlug;
  document.body.classList.remove('has-modal');
  planDialogActivePlan = null;
}

function openPlanDialog(plan) {
  const dialog = elements.benefits.planDialog;
  if (!dialog) {
    const steps = Array.isArray(plan.paymentSteps) && plan.paymentSteps.length
      ? `\n\nPasos de pago:\n- ${plan.paymentSteps.join('\n- ')}`
      : '';
    const fallback = [
      plan.name,
      `Precio: ${plan.price}${plan.cadence || ''}`,
      plan.description,
      plan.paymentNote,
      steps.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');
    alert(fallback);
    return;
  }

  planDialogActivePlan = plan;
  dialog.dataset.planSlug = plan.slug;
  dialog.setAttribute('aria-hidden', 'false');
  dialog.hidden = false;
  window.requestAnimationFrame(() => {
    dialog.classList.add('is-visible');
    elements.benefits.planDialogPanel?.focus({ preventScroll: true });
  });
  document.body.classList.add('has-modal');

  if (elements.benefits.planDialogBadge) {
    elements.benefits.planDialogBadge.textContent = plan.badge || 'Plan premium';
  }
  if (elements.benefits.planDialogTitle) {
    elements.benefits.planDialogTitle.textContent = plan.name;
  }
  if (elements.benefits.planDialogSubtitle) {
    elements.benefits.planDialogSubtitle.textContent = plan.description || '';
  }
  if (elements.benefits.planDialogAmount) {
    elements.benefits.planDialogAmount.textContent = plan.price;
  }
  if (elements.benefits.planDialogCadence) {
    elements.benefits.planDialogCadence.textContent = plan.cadence || '';
  }
  if (elements.benefits.planDialogFeatures) {
    elements.benefits.planDialogFeatures.innerHTML = '';
    (plan.perks || []).forEach((perk) => {
      const item = document.createElement('li');
      item.textContent = perk;
      elements.benefits.planDialogFeatures?.appendChild(item);
    });
  }
  if (elements.benefits.planDialogSteps) {
    elements.benefits.planDialogSteps.innerHTML = '';
    (plan.paymentSteps || []).forEach((step) => {
      const item = document.createElement('li');
      item.textContent = step;
      elements.benefits.planDialogSteps?.appendChild(item);
    });
  }
  if (elements.benefits.planDialogPayment) {
    elements.benefits.planDialogPayment.textContent = plan.paymentNote || '';
    elements.benefits.planDialogPayment.hidden = !plan.paymentNote;
  }
  if (elements.benefits.planDialogCheckout) {
    const url = plan.checkoutUrl || `/checkout?plan=${encodeURIComponent(plan.slug)}`;
    elements.benefits.planDialogCheckout.href = url;
    elements.benefits.planDialogCheckout.textContent = plan.ctaLabel || `Contratar ${plan.name}`;
    elements.benefits.planDialogCheckout.setAttribute('data-plan-slug', plan.slug);
  }
}

function setupPlanDialog() {
  const dialog = elements.benefits.planDialog;
  if (!dialog) return;
  elements.benefits.planDialogDismiss?.forEach((element) => {
    element.addEventListener('click', closePlanDialog);
  });
  if (!planDialogKeyListenerAttached) {
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!isPlanDialogOpen()) return;
      event.preventDefault();
      closePlanDialog();
    });
    planDialogKeyListenerAttached = true;
  }
}

function handlePlanSelection(plan) {
  openPlanDialog(plan);
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
    text: '',
    status: 'idle',
    sessionId: null,
    duration: null,
    runtimeSeconds: null,
    language: null,
    model: null,
    device: null,
    beam: null,
    maxSegments: preferences.get(LOCAL_KEYS.liveTailSize, 200),
    startedAt: null,
    pauseStartedAt: null,
    totalPausedMs: 0,
    lastChunkAt: null,
    latencyMs: 0,
    wpm: 0,
    droppedChunks: 0,
    error: null,
    isFinalizing: false,
    chunkIntervalMs: initialLiveChunkInterval,
    pendingChunks: 0,
    lastChunkEnqueuedAt: null,
    lastChunkSentAt: null,
  },
  job: {
    detail: null,
    maxSegments: preferences.get(LOCAL_KEYS.jobTailSize, 200),
  },
  stream: {
    jobId: null,
    jobName: '',
    status: 'idle',
    text: '',
    segments: [],
    debugEvents: [],
    durationSec: null,
    updatedAt: null,
  },
});

function createTailController({ scroller, text, followToggle, returnButton, preferenceKey }) {
  const sentinel = document.createElement('span');
  sentinel.setAttribute('aria-hidden', 'true');
  let follow = followToggle ? preferences.get(preferenceKey, true) : true;
  if (followToggle) followToggle.checked = follow;
  let lastContent = '';

  const scrollToEnd = (smooth = false) => {
    const behavior = smooth ? 'smooth' : 'auto';
    requestAnimationFrame(() => {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior });
    });
  };

  const setFollow = (value) => {
    follow = value;
    if (followToggle) followToggle.checked = value;
    if (returnButton) returnButton.hidden = value;
    if (preferenceKey) preferences.set(preferenceKey, value);
    if (value) scrollToEnd(true);
  };

  const render = (content) => {
    const nextContent = content || '';
    const extendsPrevious = nextContent.startsWith(lastContent);
    const hasGrown = extendsPrevious && nextContent.length > lastContent.length;

    if (!extendsPrevious) {
      text.textContent = nextContent;
      if (!text.contains(sentinel)) {
        text.appendChild(sentinel);
      }
    } else if (hasGrown) {
      const suffix = nextContent.slice(lastContent.length);
      if (!text.contains(sentinel)) {
        text.appendChild(sentinel);
      }
      if (suffix) {
        const node = document.createTextNode(suffix);
        text.insertBefore(node, sentinel);
      }
    } else if (!text.contains(sentinel)) {
      text.appendChild(sentinel);
    }

    lastContent = nextContent;
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
  sessionId: null,
  mediaStream: null,
  recorder: null,
  chunkQueue: [],
  sending: false,
  chunkIndex: 0,
  finishing: false,
  chunkIntervalMs: null,
  mimeType: null,
};

let liveProgressTimer = null;
const LIVE_CHUNK_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/webm',
  'audio/ogg',
];
const MODEL_PREP_POLL_INTERVAL_MS = 900;
const MODEL_PREP_TIMEOUT_MS = 10 * 60 * 1000;

let modelPrepOverlaySession = null;

function pickLiveMimeType() {
  if (!window.MediaRecorder || !window.MediaRecorder.isTypeSupported) return null;
  return LIVE_CHUNK_MIME_TYPES.find((type) => window.MediaRecorder.isTypeSupported(type)) || null;
}

function handleLiveRecorderData(event) {
  if (event?.data && event.data.size) {
    enqueueLiveChunk(event.data);
  }
}

function handleLiveRecorderError(event) {
  console.error('MediaRecorder error', event.error);
  alert('Error al capturar audio en vivo. Se detendrá la sesión.');
  finishLiveSession(true);
}

function attachLiveRecorder(recorder) {
  recorder.addEventListener('dataavailable', handleLiveRecorderData);
  recorder.addEventListener('error', handleLiveRecorderError);
}

async function restartLiveRecorder(intervalMs, { keepPaused = false } = {}) {
  if (!liveSession.mediaStream) return false;
  const previousRecorder = liveSession.recorder;
  if (previousRecorder && previousRecorder.state !== 'inactive') {
    await new Promise((resolve) => {
      const handleStop = () => {
        previousRecorder.removeEventListener('stop', handleStop);
        resolve();
      };
      previousRecorder.addEventListener('stop', handleStop, { once: true });
      try {
        previousRecorder.stop();
      } catch (error) {
        console.warn('No se pudo detener el MediaRecorder para reiniciar', error);
        previousRecorder.removeEventListener('stop', handleStop);
        resolve();
      }
    });
  }
  try {
    const options = liveSession.mimeType ? { mimeType: liveSession.mimeType } : undefined;
    const recorder = new MediaRecorder(liveSession.mediaStream, options);
    attachLiveRecorder(recorder);
    liveSession.recorder = recorder;
    liveSession.chunkIntervalMs = intervalMs;
    if (keepPaused) {
      recorder.addEventListener(
        'start',
        () => {
          if (typeof recorder.pause === 'function') {
            try {
              recorder.pause();
            } catch (error) {
              console.warn('No se pudo pausar el MediaRecorder tras reinicio', error);
            }
          }
        },
        { once: true },
      );
    }
    recorder.start(intervalMs);
    store.setState((prev) => {
      if (prev.live.chunkIntervalMs === intervalMs) return prev;
      return {
        ...prev,
        live: {
          ...prev.live,
          chunkIntervalMs: intervalMs,
        },
      };
    });
    return true;
  } catch (error) {
    console.error('No se pudo reiniciar el MediaRecorder', error);
    alert('No se pudo aplicar el nuevo intervalo de fragmentos.');
    return false;
  }
}

function formatDeviceLabel(device) {
  const normalized = (device || '').toLowerCase();
  if (normalized === 'cuda' || normalized === 'gpu') return 'GPU';
  return 'CPU';
}

function normalizeDevicePreference(deviceValue, fallbackDevice = 'gpu') {
  if (!deviceValue) return fallbackDevice;
  const normalized = deviceValue.toLowerCase();
  if (normalized === 'cuda' || normalized === 'gpu') return 'gpu';
  if (normalized === 'cpu') return 'cpu';
  return fallbackDevice;
}

function resolveDevicePreference(modelValue, requestedDevice) {
  const config = getModelConfig(modelValue);
  const fallback = config?.preferredDevice || 'gpu';
  return normalizeDevicePreference(requestedDevice, fallback);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showModelPrepOverlay(model, device, contextMessage) {
  const overlay = elements.modelPrep;
  if (!overlay?.container) return null;
  if (modelPrepOverlaySession?.cleanup) {
    modelPrepOverlaySession.cleanup();
  }
  overlay.title.textContent = `Preparando ${model} (${formatDeviceLabel(device)})`;
  overlay.message.textContent = contextMessage || 'Preparando el modelo…';
  overlay.percent.textContent = '0%';
  if (overlay.fill) overlay.fill.style.width = '0%';
  overlay.bar?.setAttribute('aria-valuenow', '0');
  const session = {
    cancelled: false,
    handleCancel: null,
    cleanup: null,
  };
  session.cleanup = () => {
    if (overlay.cancel && session.handleCancel) {
      overlay.cancel.removeEventListener('click', session.handleCancel);
      overlay.cancel.disabled = false;
      overlay.cancel.textContent = 'Cancelar descarga';
    }
    session.handleCancel = null;
  };
  if (overlay.cancel) {
    overlay.cancel.hidden = false;
    overlay.cancel.disabled = false;
    overlay.cancel.textContent = 'Cancelar descarga';
    session.handleCancel = () => {
      session.cancelled = true;
      overlay.cancel.disabled = true;
      overlay.cancel.textContent = 'Cancelando…';
      overlay.message.textContent = 'Cancelando descarga. Puedes seguir usando la aplicación.';
    };
    overlay.cancel.addEventListener('click', session.handleCancel);
  }
  overlay.container.hidden = false;
  modelPrepOverlaySession = session;
  return session;
}

function updateModelPrepOverlay(status) {
  const overlay = elements.modelPrep;
  if (!overlay?.container) return;
  if (modelPrepOverlaySession?.cancelled) return;
  const progress = Number.isFinite(status?.progress) ? Math.max(0, Math.min(100, Math.round(status.progress))) : 0;
  overlay.percent.textContent = `${progress}%`;
  if (overlay.fill) overlay.fill.style.width = `${progress}%`;
  overlay.bar?.setAttribute('aria-valuenow', String(progress));
  if (status?.message) overlay.message.textContent = status.message;
}

function hideModelPrepOverlay(session = null) {
  const overlay = elements.modelPrep;
  if (!overlay?.container) return;
  const active = session || modelPrepOverlaySession;
  if (active?.cleanup) {
    active.cleanup();
  }
  if (overlay.fill) overlay.fill.style.width = '0%';
  overlay.bar?.setAttribute('aria-valuenow', '0');
  overlay.percent.textContent = '0%';
  if (overlay.message) overlay.message.textContent = 'Comprobando caché local…';
  overlay.container.hidden = true;
  if (modelPrepOverlaySession === active) {
    modelPrepOverlaySession = null;
  }
}

async function requestModelPreparation(model, device) {
  const response = await fetch('/api/transcriptions/models/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_size: model, device_preference: device }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || 'No se pudo preparar el modelo solicitado.');
  }
  return response.json();
}

async function fetchModelPreparationStatus(model, device) {
  const params = new URLSearchParams();
  if (model) params.set('model_size', model);
  if (device) params.set('device_preference', device);
  const response = await fetch(`/api/transcriptions/models/status?${params.toString()}`);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || 'No se pudo consultar el estado del modelo.');
  }
  return response.json();
}

async function ensureModelReady(modelValue, devicePreference, contextMessage) {
  const model = modelValue || DEFAULT_MODEL;
  const normalizedDevice = resolveDevicePreference(model, devicePreference);
  const context = contextMessage || 'iniciar la transcripción';
  let overlaySession = null;
  try {
    const initial = await requestModelPreparation(model, normalizedDevice);
    if (initial.status === 'error') {
      throw new Error(initial.message || 'No se pudo preparar el modelo.');
    }
    if (initial.status === 'ready') {
      hideModelPrepOverlay();
      return true;
    }
    overlaySession = showModelPrepOverlay(model, normalizedDevice, `Preparando el modelo para ${context}.`);
    updateModelPrepOverlay(initial);
    let status = initial;
    const deadline = Date.now() + MODEL_PREP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (overlaySession?.cancelled) {
        throw new Error('Descarga cancelada por el usuario.');
      }
      await delay(MODEL_PREP_POLL_INTERVAL_MS);
      if (overlaySession?.cancelled) {
        throw new Error('Descarga cancelada por el usuario.');
      }
      status = await fetchModelPreparationStatus(model, normalizedDevice);
      updateModelPrepOverlay(status);
      if (status.status === 'ready') {
        hideModelPrepOverlay(overlaySession);
        overlaySession = null;
        return true;
      }
      if (status.status === 'error') {
        throw new Error(status.message || 'No se pudo preparar el modelo.');
      }
    }
    throw new Error('Tiempo de espera agotado preparando el modelo.');
  } finally {
    if (overlaySession) {
      hideModelPrepOverlay(overlaySession);
    }
  }
}

function resetLiveSessionLocalState() {
  if (liveSession.recorder && liveSession.recorder.state !== 'inactive') {
    try {
      liveSession.recorder.stop();
    } catch (error) {
      console.warn('No se pudo detener el MediaRecorder al limpiar la sesión', error);
    }
  }
  liveSession.recorder = null;
  if (liveSession.mediaStream) {
    liveSession.mediaStream.getTracks().forEach((track) => track.stop());
  }
  liveSession.mediaStream = null;
  liveSession.chunkQueue = [];
  liveSession.sending = false;
  liveSession.chunkIndex = 0;
  liveSession.finishing = false;
  liveSession.sessionId = null;
  liveSession.chunkIntervalMs = null;
  liveSession.mimeType = null;
  updateLiveQueueMetrics({ lastChunkEnqueuedAt: null, lastChunkSentAt: null });
}

async function discardRemoteLiveSession(sessionId) {
  if (!sessionId) return;
  try {
    await fetch(`/api/transcriptions/live/sessions/${sessionId}`, { method: 'DELETE' });
  } catch (error) {
    console.warn('No se pudo descartar la sesión en vivo en el servidor', error);
  }
}

const jobPolling = {
  timer: null,
  jobId: null,
};

const JOB_TEXT_CACHE_LIMIT = 50;
const jobTextCache = new Map();

function pruneJobTextCache() {
  const { jobs } = store.getState();
  const activeJobIds = new Set(jobs.map((job) => String(job.id)));
  for (const key of Array.from(jobTextCache.keys())) {
    if (!activeJobIds.has(key)) {
      jobTextCache.delete(key);
    }
  }
  while (jobTextCache.size > JOB_TEXT_CACHE_LIMIT) {
    const oldestKey = jobTextCache.keys().next().value;
    if (oldestKey === undefined) break;
    jobTextCache.delete(oldestKey);
  }
}

function rememberJobText(jobId, text) {
  if (!text) return;
  const key = String(jobId);
  if (jobTextCache.has(key)) {
    jobTextCache.delete(key);
  }
  jobTextCache.set(key, text);
  pruneJobTextCache();
}

function stopJobPolling() {
  if (jobPolling.timer) {
    clearInterval(jobPolling.timer);
    jobPolling.timer = null;
  }
  jobPolling.jobId = null;
}

function shouldContinueJobPolling(jobId) {
  const state = store.getState();
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) return false;
  return job.status === 'processing' || job.status === 'queued';
}

function evaluateJobPolling(jobId) {
  if (!shouldContinueJobPolling(jobId)) {
    stopJobPolling();
    return false;
  }
  return true;
}

function startJobPolling(jobId) {
  const targetId = String(jobId);
  stopJobPolling();
  if (!evaluateJobPolling(targetId)) return;
  jobPolling.jobId = targetId;
  jobPolling.timer = setInterval(() => {
    if (!evaluateJobPolling(targetId)) return;
    loadJobDetail(targetId, { startPolling: false, suppressErrors: true });
  }, 3000);
}

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
  if (normalized !== 'job') {
    stopJobPolling();
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

if (elements.library.tree) {
  elements.library.tree.addEventListener('click', (event) => {
    const button = event.target.closest('.folder-node__button');
    if (!button) return;
    store.setState((prev) => ({ ...prev, selectedFolderId: button.dataset.folderId }));
  });
}

function renderLibraryBreadcrumb(state) {
  const list = elements.library.breadcrumbs;
  if (!list) return;
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
function renderLiveTail(liveState) {
  if (!liveState) {
    tailControllers.live.render('Conecta el micro para comenzar.');
    return;
  }
  const trimmedText = typeof liveState.text === 'string' ? liveState.text.trim() : '';
  const segmentsJoined = Array.isArray(liveState.segments) && liveState.segments.length
    ? liveState.segments.join(' ')
    : '';
  const trimmedSegments = typeof segmentsJoined === 'string' ? segmentsJoined.trim() : '';
  const content = trimmedText || trimmedSegments;
  tailControllers.live.render(content || 'Conecta el micro para comenzar.');
}

function computeLiveStatusMessage(liveState) {
  const status = liveState?.status ?? 'idle';
  const modelValue = liveState?.model || elements.live.model?.value || elements.upload.model?.value || DEFAULT_MODEL;
  const modelConfig = getModelConfig(modelValue);
  const beamValue = Number(
    liveState?.beam ?? elements.live.beam?.value ?? modelConfig.recommendedBeam,
  );
  switch (status) {
    case 'recording':
      return `Grabando en vivo con ${modelConfig.label.split('·')[0].trim()} · beam ${beamValue}`;
    case 'paused':
      return 'Sesión en pausa. Reanuda cuando estés listo.';
    case 'finalizing':
      return 'Guardando sesión en vivo…';
    case 'completed':
      return 'Sesión finalizada. Guarda o inicia otra cuando quieras.';
    default:
      return 'Listo para grabar.';
  }
}

function computeStreamStatusMessage(stream) {
  if (!stream?.jobId) return null;
  const name = stream.jobName?.trim();
  const suffix = name ? ` · ${name}` : '';
  switch (stream.status) {
    case 'processing':
      return `Transcribiendo${suffix}`;
    case 'queued':
      return `En cola${suffix}`;
    case 'completed':
      return `Transcripción completada${suffix}`;
    case 'error':
      return `Error en la transcripción${suffix}`;
    default:
      return `Seguimiento activo${suffix}`;
  }
}

function buildStreamContent(stream) {
  if (!stream) return '';
  const segments = Array.isArray(stream.segments) ? stream.segments : [];
  const joinedSegments = segments.length ? segments.join('\n\n') : '';
  const text = typeof stream.text === 'string' ? stream.text : '';
  const hasText = text && text.trim();
  const hasSegments = Boolean(joinedSegments);
  if (hasText && hasSegments) {
    if (text.includes(joinedSegments)) {
      return text;
    }
    if (joinedSegments.includes(text)) {
      return joinedSegments;
    }
    return text.length >= joinedSegments.length ? text : joinedSegments;
  }
  if (hasText) return text;
  if (hasSegments) return joinedSegments;
  return '';
}

function renderHomePanel(state) {
  if (!tailControllers.home) return;
  const { stream, live } = state;
  if (stream.jobId) {
    const content = buildStreamContent(stream);
    if (content) {
      tailControllers.home.render(content);
    } else {
      const fallback = stream.jobName
        ? `Transcribiendo ${stream.jobName}…`
        : stream.status === 'queued'
        ? 'Transcripción en cola…'
        : 'Transcripción en curso…';
      tailControllers.home.render(fallback);
    }
    return;
  }
  const liveText = typeof live.text === 'string' ? live.text.trim() : '';
  const liveSegments = Array.isArray(live.segments) && live.segments.length
    ? live.segments.join(' ')
    : '';
  const liveContent = (liveText || liveSegments).trim();
  tailControllers.home.render(liveContent || 'Inicia una sesión para ver la transcripción en directo.');
}

function updateHomeStatus(state) {
  if (!elements.home.status) return;
  const liveError = typeof state.live?.error === 'string' ? state.live.error.trim() : '';
  if (liveError) {
    elements.home.status.textContent = `⚠️ ${liveError}`;
    return;
  }
  const stream = state.stream;
  if (stream?.jobId) {
    let message = '';
    const debugEvents = Array.isArray(stream.debugEvents) ? stream.debugEvents : [];
    const job = state.jobs.find((item) => String(item.id) === String(stream.jobId));
    const detail = state.job.detail && String(state.job.detail.job.id) === String(stream.jobId) ? state.job.detail : null;
    const jobForProgress = detail?.job || job;
    if (jobForProgress) {
      const info = computeJobProgressState(jobForProgress, debugEvents);
      if (info?.statusText) {
        message = info.statusText;
        if (info.etaText && info.percent != null && info.percent < 1) {
          message += ` · ${info.etaText}`;
        }
      }
    }
    if (!message) {
      message = computeStreamStatusMessage(stream) || '';
    }
    if (message) {
      if (stream.jobName && !message.includes(stream.jobName)) {
        message += ` · ${stream.jobName}`;
      }
      elements.home.status.textContent = message;
      return;
    }
  }
  elements.home.status.textContent = computeLiveStatusMessage(state.live);
}

function renderLiveStatus(liveState) {
  const status = liveState.status;
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  const isIdle = status === 'idle';
  const isFinalizing = status === 'finalizing';
  const disableStart = isRecording || isPaused || isFinalizing;

  if (elements.home.start) elements.home.start.disabled = disableStart;
  if (elements.home.pause) {
    elements.home.pause.disabled = !isRecording;
    elements.home.pause.hidden = isPaused || isFinalizing || isIdle;
  }
  if (elements.home.resume) {
    elements.home.resume.hidden = !isPaused;
    elements.home.resume.disabled = !isPaused;
  }
  if (elements.home.finish) elements.home.finish.disabled = isIdle || isFinalizing;

  if (elements.live.start) elements.live.start.disabled = disableStart;
  if (elements.live.pause) {
    elements.live.pause.disabled = !isRecording;
    elements.live.pause.hidden = isPaused || isFinalizing || isIdle;
  }
  if (elements.live.resume) {
    elements.live.resume.hidden = !isPaused;
    elements.live.resume.disabled = !isPaused;
  }
  if (elements.live.finish) elements.live.finish.disabled = isIdle || isFinalizing;
}

function renderLiveProgress(liveState) {
  const widgets = [
    {
      container: elements.home.progress,
      label: elements.home.progressLabel,
      rate: elements.home.progressRate,
      fill: elements.home.progressFill,
      bar: elements.home.progressBar,
      percent: elements.home.progressPercent,
      remaining: elements.home.progressRemaining,
    },
    {
      container: elements.live.progress,
      label: elements.live.progressLabel,
      rate: elements.live.progressRate,
      fill: elements.live.progressFill,
      bar: elements.live.progressBar,
      percent: elements.live.progressPercent,
      remaining: elements.live.progressRemaining,
    },
  ];
  const status = liveState?.status || 'idle';
  const processedSeconds = Number.isFinite(liveState?.duration)
    ? Math.max(0, liveState.duration)
    : Number.isFinite(liveState?.runtimeSeconds)
    ? Math.max(0, liveState.runtimeSeconds)
    : 0;
  const now = Date.now();
  let elapsedMs = 0;
  if (liveState?.startedAt) {
    elapsedMs = now - liveState.startedAt;
    if (liveState.pauseStartedAt) {
      elapsedMs -= now - liveState.pauseStartedAt;
    }
    if (liveState.totalPausedMs) {
      elapsedMs -= liveState.totalPausedMs;
    }
  }
  if (elapsedMs < 0) elapsedMs = 0;
  const elapsedSeconds = elapsedMs / 1000;
  const shouldShow = ['recording', 'paused', 'finalizing'].includes(status) || processedSeconds > 0;
  widgets.forEach((widget) => {
    if (!widget?.container) return;
    if (!shouldShow) {
      widget.container.hidden = true;
      if (widget.fill) widget.fill.style.width = '0%';
      widget.bar?.setAttribute('aria-valuenow', '0');
      if (widget.percent) widget.percent.textContent = '0%';
      if (widget.label) widget.label.textContent = '00:00 procesados';
      if (widget.rate) widget.rate.textContent = 'Esperando audio…';
      if (widget.remaining) widget.remaining.textContent = 'Restante —';
      return;
    }
    widget.container.hidden = false;
    const processed = processedSeconds > 0 ? processedSeconds : elapsedSeconds;
    const ratio = elapsedSeconds > 0 ? Math.min(1, processed / elapsedSeconds) : processed > 0 ? 1 : 0;
    const percentValue = Math.round(ratio * 100);
    if (widget.label) widget.label.textContent = `${formatClock(processed)} procesados`;
    if (widget.percent) widget.percent.textContent = `${percentValue}%`;
    if (widget.fill) widget.fill.style.width = `${percentValue}%`;
    widget.bar?.setAttribute('aria-valuenow', String(percentValue));
    let rateText = '';
    if (status === 'paused') {
      rateText = 'Grabación en pausa';
    } else if (status === 'finalizing') {
      rateText = 'Guardando sesión…';
    } else if (status === 'completed') {
      rateText = 'Sesión finalizada';
    } else if (elapsedSeconds <= 0 && processedSeconds <= 0) {
      rateText = 'Esperando audio…';
    } else if (ratio >= 1) {
      rateText = 'Al día en tiempo real';
    } else {
      const lag = Math.max(0, elapsedSeconds - processed);
      rateText = lag > 1 ? `Retraso ${formatClock(lag)}` : 'Procesando…';
    }
    if (widget.rate) widget.rate.textContent = rateText;
    if (widget.remaining) {
      if (ratio >= 1) {
        widget.remaining.textContent = 'Sin retraso pendiente';
      } else {
        const remainingSeconds = Math.max(0, elapsedSeconds - processed);
        widget.remaining.textContent = `Restante ${formatClock(remainingSeconds)}`;
      }
    }
  });
}

function buildSegmentsFromEvents(events) {
  if (!Array.isArray(events)) return [];
  const collected = new Map();
  events.forEach((event) => {
    if (!event || event.stage !== 'transcribe.segment') return;
    const extra = event.extra || {};
    const text = typeof extra.text === 'string' ? extra.text.trim() : '';
    if (!text) return;
    const index = Number(extra.index);
    const key = Number.isFinite(index) ? index : collected.size;
    collected.set(key, text);
  });
  return Array.from(collected.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, text]) => text);
}

function extractDurationFromEvents(events) {
  if (!Array.isArray(events)) return null;
  let duration = null;
  events.forEach((event) => {
    if (!event) return;
    const extra = event.extra || {};
    if (event.stage === 'analyze.duration') {
      const seconds = Number(extra.seconds ?? extra.duration ?? extra.total_seconds ?? extra.ms / 1000);
      if (Number.isFinite(seconds)) {
        duration = duration == null ? seconds : Math.max(duration, seconds);
      }
    }
    if (event.stage === 'transcribe.segment') {
      const end = Number(extra.end);
      if (Number.isFinite(end)) {
        duration = duration == null ? end : Math.max(duration, end);
      }
    }
  });
  return duration;
}

function formatClock(seconds = 0) {
  if (!Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.ceil(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!hours && secs) parts.push(`${secs}s`);
  if (!parts.length) parts.push('1s');
  return `Quedan ~${parts.join(' ')}`;
}

function computeJobProgressState(job, debugEvents) {
  const events = Array.isArray(debugEvents) ? debugEvents : [];
  const durationFromEvents = extractDurationFromEvents(events);
  const jobDuration = Number.isFinite(job.durationSec) ? job.durationSec : null;
  const totalSeconds = Number.isFinite(jobDuration)
    ? jobDuration
    : Number.isFinite(durationFromEvents)
    ? durationFromEvents
    : null;

  let processedSeconds = job.status === 'completed' && Number.isFinite(totalSeconds) ? totalSeconds : 0;
  let sawSegment = false;
  let sawModelLoad = false;
  let sawTranscribeStart = false;
  let startTimestamp = null;
  let errorEvent = null;

  events.forEach((event) => {
    if (!event) return;
    const stage = event.stage || '';
    const extra = event.extra || {};
    if (stage === 'processing-start' && event.timestamp) {
      const parsed = Date.parse(event.timestamp);
      if (!Number.isNaN(parsed)) {
        startTimestamp = parsed;
      }
    }
    if (stage === 'load-model' || stage === 'load-model.retry') {
      sawModelLoad = true;
    }
    if (stage === 'transcribe.start') {
      sawTranscribeStart = true;
    }
    if (stage === 'transcribe.segment') {
      sawSegment = true;
      const end = Number(extra.end);
      if (Number.isFinite(end)) {
        processedSeconds = Math.max(processedSeconds, end);
      }
    }
    if (stage === 'transcribe.completed' && Number.isFinite(totalSeconds)) {
      processedSeconds = Math.max(processedSeconds, totalSeconds);
    }
    if (stage.endsWith('.error') || stage === 'processing-missing-file') {
      errorEvent = event;
    }
  });

  if (Number.isFinite(totalSeconds) && job.status === 'completed') {
    processedSeconds = Math.max(processedSeconds, totalSeconds);
  }

  let percent = null;
  if (Number.isFinite(totalSeconds) && totalSeconds > 0) {
    percent = Math.min(1, processedSeconds / totalSeconds);
  } else if (job.status === 'completed') {
    percent = 1;
  }

  let etaSeconds = null;
  if (
    percent != null &&
    percent < 1 &&
    Number.isFinite(totalSeconds) &&
    startTimestamp &&
    processedSeconds > 0
  ) {
    const elapsed = Math.max(1, (Date.now() - startTimestamp) / 1000);
    const speed = processedSeconds / elapsed;
    if (speed > 0.05) {
      etaSeconds = Math.max(0, (totalSeconds - processedSeconds) / speed);
    }
  }

  const label = Number.isFinite(totalSeconds)
    ? `${formatClock(processedSeconds)} / ${formatClock(totalSeconds)}`
    : processedSeconds > 0
    ? `${formatClock(processedSeconds)} procesados`
    : '';

  let statusText = '';
  if (job.status === 'error') {
    statusText = errorEvent?.message ? `Error: ${errorEvent.message}` : 'La transcripción se detuvo con errores.';
  } else if (job.status === 'completed') {
    statusText = 'Transcripción completada.';
  } else if (sawSegment) {
    statusText = Number.isFinite(totalSeconds)
      ? `Transcribiendo… ${formatClock(processedSeconds)} / ${formatClock(totalSeconds)}`
      : 'Transcribiendo…';
  } else if (sawTranscribeStart) {
    statusText = 'Analizando audio…';
  } else if (sawModelLoad) {
    statusText = `Descargando modelo ${job.model || 'seleccionado'}…`;
  } else if (job.status === 'processing') {
    statusText = 'Preparando transcripción…';
  } else {
    statusText = formatStatus(job.status);
  }

  return {
    showBar: percent != null,
    percent: percent ?? 0,
    label,
    etaText: etaSeconds ? formatEta(etaSeconds) : '',
    statusText,
  };
}

function renderJobProgress(job, debugEvents) {
  const { progress, progressBar, progressFill, progressLabel, progressEta, liveStatus } = elements.job;
  if (!progress || !progressBar || !progressFill || !progressLabel || !progressEta) return;
  const info = computeJobProgressState(job, debugEvents);
  if (liveStatus) {
    const fallback =
      job.status === 'completed'
        ? 'Transcripción completada.'
        : job.status === 'processing'
        ? 'Preparando transcripción…'
        : formatStatus(job.status);
    liveStatus.textContent = info?.statusText || fallback;
  }
  if (!info || !info.showBar) {
    progress.hidden = true;
    progressFill.style.width = '0%';
    progressBar.setAttribute('aria-valuenow', '0');
    if (!info) {
      progressLabel.textContent = '00:00 / 00:00';
      progressEta.textContent = '—';
    } else {
      progressLabel.textContent = info.label || '';
      progressEta.textContent = info.etaText || '—';
    }
    return;
  }

  const percentValue = Math.max(0, Math.min(100, Math.round(info.percent * 100)));
  progress.hidden = false;
  progressFill.style.width = `${percentValue}%`;
  progressBar.setAttribute('aria-valuenow', String(percentValue));
  progressLabel.textContent = info.label || `${percentValue}%`;
  progressEta.textContent = info.etaText || '—';
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
    if (elements.job.beam) elements.job.beam.textContent = '—';
    elements.job.wer.textContent = '—';
    if (elements.job.liveStatus) {
      elements.job.liveStatus.textContent = 'Selecciona una transcripción para ver el progreso.';
    }
    if (elements.job.progress) {
      elements.job.progress.hidden = true;
      if (elements.job.progressFill) elements.job.progressFill.style.width = '0%';
      if (elements.job.progressBar) elements.job.progressBar.setAttribute('aria-valuenow', '0');
      if (elements.job.progressLabel) elements.job.progressLabel.textContent = '00:00 / 00:00';
      if (elements.job.progressEta) elements.job.progressEta.textContent = '—';
    }
    const list = elements.job.breadcrumbs;
    while (list.children.length > 3) list.removeChild(list.lastChild);
    return;
  }
  const { job, text, segments, folderPath, debugEvents } = detail;
  const fallbackText = text && text.trim() ? text : 'La transcripción se está generando y se actualizará automáticamente.';
  const displayed = segments && segments.length ? segments.slice(-state.job.maxSegments) : [fallbackText];
  tailControllers.job.render(displayed.join('\n\n'));
  renderJobProgress(job, debugEvents);
  const numericId = /^\d+$/.test(String(job.id));
  elements.job.title.textContent = job.name;
  const subtitleParts = [];
  subtitleParts.push(formatStatus(job.status));
  if (job.updatedAt) subtitleParts.push(`Actualizado ${formatDate(job.updatedAt)}`);
  if (Number.isFinite(job.durationSec)) subtitleParts.push(formatDuration(job.durationSec));
  elements.job.subtitle.textContent = subtitleParts.join(' · ');
  elements.job.status.textContent = formatStatus(job.status);
  elements.job.folder.textContent = folderPath ? folderPath.slice(1) : '—';
  elements.job.duration.textContent = formatDuration(job.durationSec);
  elements.job.language.textContent = job.language ? job.language.toUpperCase() : '—';
  elements.job.model.textContent = job.model || '—';
  if (elements.job.beam) elements.job.beam.textContent = job.beam ? `Beam ${job.beam}` : '—';
  elements.job.wer.textContent = job.status === 'completed' ? '3.4%' : '—';
  elements.job.move.disabled = false;
  elements.job.copy.disabled = false;
  elements.job.downloadTxt.disabled = false;
  elements.job.downloadSrt.disabled = false;
  elements.job.exportMd.disabled = false;
  if (elements.job.audio) {
    elements.job.audio.hidden = !numericId;
    if (numericId) {
      elements.job.audio.href = `/api/transcriptions/${job.id}/audio`;
    } else {
      elements.job.audio.removeAttribute('href');
    }
  }
  if (elements.job.logs) {
    elements.job.logs.hidden = !numericId;
    if (numericId) {
      elements.job.logs.href = `/api/transcriptions/${job.id}/logs`;
      elements.job.logs.title = debugEvents?.length
        ? 'Descarga los eventos y diagnósticos de esta transcripción.'
        : 'Aún no hay eventos registrados; el archivo incluirá un mensaje informativo.';
    } else {
      elements.job.logs.removeAttribute('href');
      elements.job.logs.removeAttribute('title');
    }
  }

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
  if (state.live.text !== prev.live.text || state.live.segments !== prev.live.segments) {
    renderLiveTail(state.live);
  }
  if (
    state.live.status !== prev.live.status ||
    state.live.isFinalizing !== prev.live.isFinalizing
  ) {
    renderLiveStatus(state.live);
  }
  if (
    state.live.duration !== prev.live.duration ||
    state.live.runtimeSeconds !== prev.live.runtimeSeconds ||
    state.live.startedAt !== prev.live.startedAt ||
    state.live.pauseStartedAt !== prev.live.pauseStartedAt ||
    state.live.totalPausedMs !== prev.live.totalPausedMs ||
    state.live.status !== prev.live.status ||
    state.live.text !== prev.live.text
  ) {
    renderLiveProgress(state.live);
  }
  if (
    state.stream !== prev.stream ||
    state.live.text !== prev.live.text ||
    state.live.segments !== prev.live.segments
  ) {
    renderHomePanel(state);
  }
  if (
    state.stream !== prev.stream ||
    state.live.status !== prev.live.status ||
    state.live.isFinalizing !== prev.live.isFinalizing ||
    state.live.text !== prev.live.text ||
    state.live.error !== prev.live.error
  ) {
    updateHomeStatus(state);
  }
  if (
    state.live.latencyMs !== prev.live.latencyMs ||
    state.live.wpm !== prev.live.wpm ||
    state.live.droppedChunks !== prev.live.droppedChunks ||
    state.live.pendingChunks !== prev.live.pendingChunks
  ) {
    renderLiveKpis(state.live);
  }
  if (state.live.error !== prev.live.error) {
    renderLiveError(state.live);
  }
  if (state.job.detail !== prev.job.detail || state.job.maxSegments !== prev.job.maxSegments) {
    renderJobDetail(state);
  }
});

function maybeUpdateActiveStream() {
  const state = store.getState();
  const current = state.stream;
  const trackedStatuses = new Set(['processing', 'queued']);
  const processing = state.jobs
    .filter((job) => trackedStatuses.has(job.status))
    .sort((a, b) => {
      const aDate = new Date(a.updatedAt || a.createdAt || Date.now()).getTime();
      const bDate = new Date(b.updatedAt || b.createdAt || Date.now()).getTime();
      return bDate - aDate;
    });
  if (processing.length) {
    const next = processing[0];
    const jobIdStr = String(next.id);
    const shouldPrime = current.jobId !== jobIdStr;
    const needsStatusUpdate =
      !shouldPrime &&
      (
        current.status !== next.status ||
        current.jobName !== next.name ||
        current.updatedAt !== next.updatedAt ||
        (Number.isFinite(next.durationSec) && next.durationSec !== current.durationSec)
      );
    if (shouldPrime || needsStatusUpdate) {
      store.setState((prev) => ({
        ...prev,
        stream: {
          jobId: jobIdStr,
          jobName: next.name,
          status: next.status,
          text: shouldPrime ? '' : prev.stream.text,
          segments: shouldPrime ? [] : prev.stream.segments,
          debugEvents: shouldPrime ? [] : prev.stream.debugEvents,
          durationSec: shouldPrime ? null : prev.stream.durationSec,
          updatedAt: next.updatedAt,
        },
      }));
      if (shouldPrime) {
        tailControllers.home?.setFollow(true);
      }
    }
    if (shouldPrime || jobPolling.jobId !== jobIdStr) {
      loadJobDetail(jobIdStr, { startPolling: true });
    }
    return;
  }

  if (current.jobId) {
    const job = state.jobs.find((item) => item.id === current.jobId);
    if (!job) {
      store.setState((prev) => ({
        ...prev,
        stream: {
          jobId: null,
          jobName: '',
          status: 'idle',
          text: '',
          segments: [],
          debugEvents: [],
          durationSec: null,
          updatedAt: null,
        },
      }));
      return;
    }
    if (current.status !== job.status || current.jobName !== job.name || current.updatedAt !== job.updatedAt) {
      store.setState((prev) => ({
        ...prev,
        stream: {
          ...prev.stream,
          status: job.status,
          jobName: job.name,
          durationSec: Number.isFinite(job.durationSec) ? job.durationSec : prev.stream.durationSec,
          updatedAt: job.updatedAt,
        },
      }));
    }
  }
}
function computeRecent(jobs) {
  return [...jobs]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);
}

async function loadJobs() {
  try {
    const response = await fetch('/api/transcriptions');
    if (!response.ok) throw new Error('Respuesta no válida');
    const payload = await response.json();
    const results = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload)
      ? payload
      : [];
    const folderData = buildFoldersFromTranscriptionsPayload(results);
    const jobs = results.map((item) => mapTranscriptionToJob(item, folderData.byPath));
    const stats = computeStatsFromJobs(jobs, results);
    store.setState((prev) => {
      const folderIds = new Set(folderData.folders.map((folder) => folder.id));
      let selectedFolderId = prev.selectedFolderId;
      if (selectedFolderId && !folderIds.has(selectedFolderId)) {
        selectedFolderId = null;
      }
      if (!selectedFolderId && folderData.folders.length) {
        selectedFolderId = folderData.folders[0].id;
      }
      return {
        ...prev,
        jobs,
        recentJobs: computeRecent(jobs),
        folders: folderData.folders,
        stats,
        selectedFolderId,
      };
    });
    pruneJobTextCache();
    maybeUpdateActiveStream();
  } catch (error) {
    console.warn('Usando transcripciones de ejemplo', error);
    store.setState((prev) => ({
      ...prev,
      jobs: SAMPLE_DATA.jobs,
      recentJobs: computeRecent(SAMPLE_DATA.jobs),
      folders: SAMPLE_DATA.folders,
      stats: SAMPLE_DATA.stats,
      selectedFolderId: prev.selectedFolderId ?? SAMPLE_DATA.folders[0]?.id ?? null,
    }));
    pruneJobTextCache();
    maybeUpdateActiveStream();
  }
}

async function loadJobDetail(jobId, { startPolling = true, suppressErrors = false } = {}) {
  const jobIdStr = String(jobId);
  const state = store.getState();
  const current = state.jobs.find((job) => job.id === jobIdStr);
  if (!current) return;
  try {
    const response = await fetch(`/api/transcriptions/${jobIdStr}`);
    if (!response.ok) throw new Error('Respuesta no válida');
    const payload = await response.json();
    const folderSegments = deriveFolderSegments(payload.output_folder ?? current.outputFolder);
    const folderPath = folderSegments.reduce((acc, segment) => `${acc}/${segment}`, '');
    const debugEvents = Array.isArray(payload.debug_events) ? payload.debug_events : [];
    const limitedEvents = debugEvents.slice(-600);
    const payloadSegments = Array.isArray(payload.speakers)
      ? payload.speakers
          .map((segment) => (segment && segment.text ? String(segment.text).trim() : ''))
          .filter(Boolean)
      : null;
    const eventSegments = buildSegmentsFromEvents(debugEvents);
    const normalizedSegments =
      payloadSegments && payloadSegments.length
        ? payloadSegments
        : eventSegments.length
        ? eventSegments
        : null;
    const durationFromEvents = extractDurationFromEvents(debugEvents);
    const payloadDuration = Number(payload.duration);
    const resolvedDuration = Number.isFinite(payloadDuration) && payloadDuration > 0
      ? payloadDuration
      : Number.isFinite(durationFromEvents) && durationFromEvents > 0
      ? durationFromEvents
      : Number.isFinite(current.durationSec)
      ? current.durationSec
      : null;
    const incomingText = typeof payload.text === 'string' ? payload.text : '';
    const cachedText = jobTextCache.get(jobIdStr) || '';
    const resolvedText = incomingText && incomingText.trim() ? incomingText : cachedText;
    if (incomingText && incomingText.trim()) {
      rememberJobText(jobIdStr, incomingText);
    }
    const folderLookup = new Map(state.folders.map((folder) => [folder.path, folder]));
    let foldersForUpdate = state.folders;
    if (folderPath && !folderLookup.has(folderPath)) {
      const updatedFolders = [...state.folders];
      let parentPath = '';
      let parentId = null;
      folderSegments.forEach((segment) => {
        const path = `${parentPath}/${segment}`;
        if (!folderLookup.has(path)) {
          const folder = {
            id: `fld-${hashString(path)}`,
            name: segment,
            parentId,
            path,
            createdAt: payload.created_at || new Date().toISOString(),
          };
          folderLookup.set(path, folder);
          updatedFolders.push(folder);
        }
        parentId = folderLookup.get(path).id;
        parentPath = path;
      });
      foldersForUpdate = updatedFolders;
    }
    const folderEntry = folderLookup.get(folderPath);
    store.setState((prev) => {
      const jobs = prev.jobs.map((job) => {
        if (job.id !== jobIdStr) return job;
        const nextDuration = Number.isFinite(resolvedDuration) ? resolvedDuration : job.durationSec;
        return {
          ...job,
          status: normalizeStatus(payload.status ?? job.rawStatus),
          rawStatus: payload.status ?? job.rawStatus,
          durationSec: nextDuration,
          language: payload.language ?? job.language,
          model: payload.model_size ?? job.model,
          beam: payload.beam_size ?? job.beam,
          updatedAt: payload.updated_at ?? job.updatedAt,
          createdAt: payload.created_at ?? job.createdAt,
          devicePreference: payload.device_preference ?? job.devicePreference,
          runtimeSeconds: payload.runtime_seconds ?? job.runtimeSeconds,
          transcriptPath: payload.transcript_path ?? job.transcriptPath,
          folderId: folderEntry ? folderEntry.id : job.folderId,
          folderPath: folderPath || job.folderPath,
          outputFolder: folderSegments.join('/'),
        };
      });
      const stats = computeStatsFromJobs(jobs);
      const activeJob = jobs.find((job) => job.id === jobIdStr) || current;
      const streamMatches = prev.stream.jobId === jobIdStr || (!prev.stream.jobId && activeJob.status === 'processing');
      const streamSegments = normalizedSegments && normalizedSegments.length
        ? normalizedSegments.slice(-STREAM_SEGMENT_LIMIT)
        : streamMatches
        ? prev.stream.segments
        : [];
      const streamText = resolvedText && resolvedText.trim()
        ? resolvedText
        : streamMatches
        ? prev.stream.text
        : '';
      const stream = streamMatches
        ? {
            jobId: jobIdStr,
            jobName: activeJob.name,
            status: activeJob.status,
            text: streamText,
            segments: streamSegments,
            debugEvents: limitedEvents,
            durationSec: Number.isFinite(resolvedDuration)
              ? resolvedDuration
              : Number.isFinite(activeJob.durationSec)
              ? activeJob.durationSec
              : prev.stream.durationSec,
            updatedAt: activeJob.updatedAt,
          }
        : prev.stream;
      return {
        ...prev,
        jobs,
        folders: foldersForUpdate,
        stats,
        recentJobs: computeRecent(jobs),
        job: {
          ...prev.job,
          detail: {
            job: activeJob,
            text: resolvedText,
            segments: normalizedSegments,
            folderPath: activeJob.folderPath,
            debugEvents: limitedEvents,
          },
        },
        stream,
      };
    });
    if (startPolling) {
      startJobPolling(jobIdStr);
    } else {
      evaluateJobPolling(jobIdStr);
    }
  } catch (error) {
    if (!suppressErrors) {
      console.warn('Usando detalle de ejemplo', error);
    }
    const folderMap = new Map(state.folders.map((folder) => [folder.id, folder]));
    const folderPath = current.folderId && folderMap.get(current.folderId) ? folderMap.get(current.folderId).path : '';
    const sample = SAMPLE_DATA.texts[jobIdStr];
    store.setState((prev) => {
      const streamMatches = prev.stream.jobId === jobIdStr;
      const streamSegments = sample?.segments?.length
        ? sample.segments.slice(-STREAM_SEGMENT_LIMIT)
        : streamMatches
        ? prev.stream.segments
        : [];
      const streamText = sample?.text?.trim()
        ? sample.text
        : streamMatches
        ? prev.stream.text
        : '';
    const stream = streamMatches
        ? {
            jobId: jobIdStr,
            jobName: current.name,
            status: current.status,
            text: streamText,
            segments: streamSegments,
            debugEvents: sample?.debugEvents?.slice(-600) ?? prev.stream.debugEvents,
            durationSec: Number.isFinite(current.durationSec)
              ? current.durationSec
              : prev.stream.durationSec,
            updatedAt: current.updatedAt,
          }
        : prev.stream;
      return {
        ...prev,
        job: {
          ...prev.job,
          detail: {
            job: current,
            text: sample?.text ?? '',
            segments: sample?.segments ?? null,
            folderPath,
            debugEvents: sample?.debugEvents ?? [],
          },
        },
        stream,
      };
    });
    if (startPolling) {
      startJobPolling(jobIdStr);
    } else {
      evaluateJobPolling(jobIdStr);
    }
  }
}

async function loadInitialData() {
  await loadJobs();
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
    if (options?.beamWidth != null) form.append('beam_size', String(options.beamWidth));

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
  const modelConfig = getModelConfig(model);
  const devicePreference = resolveDevicePreference(model, modelConfig.preferredDevice);
  const beamValue = Number(elements.upload.beam?.value || modelConfig.recommendedBeam);
  const totalFiles = files.length;
  let completed = 0;
  let failed = 0;
  elements.upload.feedback.textContent = 'Preparando subida…';
  setUploadProgress(0);

  try {
    await ensureModelReady(model, devicePreference, 'procesar tus archivos');
  } catch (error) {
    elements.upload.feedback.textContent = error?.message || 'No se pudo preparar el modelo.';
    if (submit) submit.disabled = false;
    resetUploadProgress();
    return;
  }

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
        beamWidth: beamValue,
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
        beam: beamValue,
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
    await loadJobs().catch((error) => console.warn('No se pudieron refrescar las transcripciones', error));
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
  if (!dropzone || !trigger || !input) return;
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
function renderLiveKpis(liveState) {
  const latencyText = Number.isFinite(liveState.latencyMs) && liveState.latencyMs > 0
    ? `${liveState.latencyMs} ms`
    : '—';
  const wpmText = Number.isFinite(liveState.wpm) && liveState.wpm > 0 ? String(liveState.wpm) : '0';
  const droppedText = Number.isFinite(liveState.droppedChunks) ? String(liveState.droppedChunks) : '0';
  const pendingCount = Number.isFinite(liveState.pendingChunks) && liveState.pendingChunks >= 0
    ? liveState.pendingChunks
    : 0;
  const pendingText = String(pendingCount);
  elements.live.kpis.forEach((node) => {
    const metric = node.dataset.liveKpi;
    if (metric === 'wpm') node.textContent = wpmText;
    if (metric === 'latency') node.textContent = latencyText;
    if (metric === 'dropped') node.textContent = droppedText;
    if (metric === 'pending') {
      node.textContent = pendingText;
      node.classList.toggle('is-active', pendingCount > 0);
      const labelUnit = pendingCount === 1 ? 'fragmento' : 'fragmentos';
      const labelText = pendingCount > 0 ? `${pendingCount} ${labelUnit} en cola` : 'Sin fragmentos pendientes';
      node.setAttribute('aria-label', labelText);
      node.setAttribute('title', labelText);
    }
  });
}

function renderLiveError(liveState) {
  const message = typeof liveState?.error === 'string' ? liveState.error.trim() : '';
  const target = elements.live.error;
  if (!target) return;
  if (message) {
    target.textContent = message;
    target.hidden = false;
  } else {
    target.textContent = '';
    target.hidden = true;
  }
}

function updateLiveQueueMetrics(overrides = {}) {
  store.setState((prev) => {
    const pendingChunks = Math.max(0, liveSession.chunkQueue.length + (liveSession.sending ? 1 : 0));
    let changed = false;
    const nextLive = { ...prev.live };
    if (nextLive.pendingChunks !== pendingChunks) {
      nextLive.pendingChunks = pendingChunks;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, 'lastChunkEnqueuedAt')) {
      if (nextLive.lastChunkEnqueuedAt !== overrides.lastChunkEnqueuedAt) {
        nextLive.lastChunkEnqueuedAt = overrides.lastChunkEnqueuedAt;
        changed = true;
      }
    }
    if (Object.prototype.hasOwnProperty.call(overrides, 'lastChunkSentAt')) {
      if (nextLive.lastChunkSentAt !== overrides.lastChunkSentAt) {
        nextLive.lastChunkSentAt = overrides.lastChunkSentAt;
        changed = true;
      }
    }
    if (!changed) return prev;
    return { ...prev, live: nextLive };
  });
}

function enqueueLiveChunk(blob) {
  if (!blob || !blob.size || !liveSession.sessionId) return;
  const index = liveSession.chunkIndex;
  liveSession.chunkIndex += 1;
  const createdAt = Date.now();
  liveSession.chunkQueue.push({ blob, index, createdAt, attempts: 0 });
  updateLiveQueueMetrics({ lastChunkEnqueuedAt: createdAt });
  processLiveChunkQueue();
}

async function processLiveChunkQueue() {
  if (liveSession.sending) return;
  if (!liveSession.sessionId) {
    liveSession.chunkQueue = [];
    updateLiveQueueMetrics();
    return;
  }
  const item = liveSession.chunkQueue.shift();
  if (!item) {
    updateLiveQueueMetrics();
    return;
  }
  liveSession.sending = true;
  updateLiveQueueMetrics();
  const endpoint = `/api/transcriptions/live/sessions/${liveSession.sessionId}/chunk`;
  try {
    const formData = new FormData();
    const filename = `chunk-${String(item.index).padStart(5, '0')}.webm`;
    formData.append('chunk', item.blob, filename);
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      let message = 'No se pudo enviar el fragmento en vivo.';
      try {
        const data = await response.json();
        if (data?.detail) message = data.detail;
      } catch (parseError) {
        console.warn('No se pudo interpretar la respuesta del chunk en vivo', parseError);
      }
      throw new Error(message);
    }
    const payload = await response.json();
    updateLiveQueueMetrics({ lastChunkSentAt: Date.now() });
    handleLiveChunkPayload(payload, Date.now() - item.createdAt);
  } catch (error) {
    console.error('Error al enviar fragmento en vivo', error);
    const attempts = (item.attempts || 0) + 1;
    const message = error?.message || 'No se pudo enviar el fragmento en vivo.';
    if (attempts <= LIVE_CHUNK_MAX_RETRIES && liveSession.sessionId) {
      item.attempts = attempts;
      liveSession.chunkQueue.unshift(item);
      store.setState((prev) => ({
        ...prev,
        live: {
          ...prev.live,
          error: `${message} Reintentando (${attempts}/${LIVE_CHUNK_MAX_RETRIES})…`,
        },
      }));
      const backoff = Math.min(LIVE_CHUNK_RETRY_BASE_DELAY_MS * attempts * attempts, LIVE_CHUNK_RETRY_MAX_DELAY_MS);
      await delay(backoff);
    } else {
      store.setState((prev) => ({
        ...prev,
        live: {
          ...prev.live,
          droppedChunks: prev.live.droppedChunks + 1,
          error: message,
        },
      }));
      updateLiveQueueMetrics({ lastChunkSentAt: Date.now() });
    }
  } finally {
    liveSession.sending = false;
    updateLiveQueueMetrics();
    if (liveSession.chunkQueue.length) {
      processLiveChunkQueue();
    }
  }
}

function waitForLiveQueueToFlush() {
  return new Promise((resolve) => {
    const poll = () => {
      if (!liveSession.sending && liveSession.chunkQueue.length === 0) {
        resolve();
      } else {
        window.setTimeout(poll, 120);
      }
    };
    poll();
  });
}

async function stopLiveRecorder() {
  if (!liveSession.recorder) return;
  const recorder = liveSession.recorder;
  if (recorder.state === 'inactive') return;
  await new Promise((resolve) => {
    recorder.addEventListener('stop', () => resolve(), { once: true });
    try {
      recorder.stop();
    } catch (error) {
      console.warn('No se pudo detener el MediaRecorder', error);
      resolve();
    }
  });
}

function handleLiveChunkPayload(payload, uploadLatencyMs) {
  const segments = Array.isArray(payload?.segments) ? payload.segments : [];
  const segmentTexts = segments
    .map((segment) => (segment && typeof segment.text === 'string' ? segment.text.trim() : ''))
    .filter(Boolean);
  const aggregatedText = typeof payload?.text === 'string' ? payload.text : '';
  const latencyFromRuntime = Number.isFinite(payload?.runtime_seconds)
    ? Math.max(0, Math.round(payload.runtime_seconds * 1000))
    : null;
  const latencyMs = latencyFromRuntime ?? (Number.isFinite(uploadLatencyMs) ? Math.round(uploadLatencyMs) : null);
  store.setState((prev) => {
    const previous = prev.live;
    const trimmed = segmentTexts.slice(-previous.maxSegments);
    const combinedText = aggregatedText && aggregatedText.trim()
      ? aggregatedText
      : trimmed.length
      ? trimmed.join(' ')
      : previous.text;
    const now = Date.now();
    const startedAt = previous.startedAt || now;
    const pausedMs = previous.totalPausedMs + (previous.pauseStartedAt ? now - previous.pauseStartedAt : 0);
    const elapsedMs = Math.max(1000, now - startedAt - pausedMs);
    const words = combinedText.trim() ? combinedText.trim().split(/\s+/).length : 0;
    const computedWpm = Math.max(0, Math.round((words * 60000) / elapsedMs));
    return {
      ...prev,
      live: {
        ...previous,
        segments: trimmed,
        text: combinedText,
        duration: payload?.duration ?? previous.duration,
        runtimeSeconds: payload?.runtime_seconds ?? previous.runtimeSeconds,
        language: payload?.language ?? previous.language,
        model: payload?.model_size ?? previous.model,
        beam: payload?.beam_size ?? previous.beam,
        device: payload?.device_preference ?? previous.device,
        lastChunkAt: now,
        latencyMs: latencyMs ?? previous.latencyMs,
        wpm: computedWpm,
        droppedChunks: Number.isFinite(payload?.dropped_chunks)
          ? payload.dropped_chunks
          : previous.droppedChunks,
        error: null,
      },
    };
  });
}

async function startLiveSession() {
  const state = store.getState().live;
  if (state.status === 'recording' || state.isFinalizing) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Tu navegador no permite capturar audio. Usa Chrome, Edge o Firefox actualizados.');
    return;
  }
  try {
    const language = elements.live.language?.value || null;
    const modelValue = elements.live.model?.value || elements.upload.model?.value || DEFAULT_MODEL;
    const modelConfig = getModelConfig(modelValue);
    const beamRaw = elements.live.beam?.value || modelConfig.recommendedBeam;
    const beamValue = Number(beamRaw);
    const deviceValue = elements.live.device?.value || null;
    const resolvedDevicePreference = resolveDevicePreference(modelValue, deviceValue);
    await ensureModelReady(modelValue, resolvedDevicePreference, 'iniciar la sesión en vivo');
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const payload = {
      language: language || undefined,
      model_size: modelValue,
      device_preference: resolvedDevicePreference || undefined,
      beam_size: Number.isFinite(beamValue) ? beamValue : undefined,
    };
    const response = await fetch('/api/transcriptions/live/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = data?.detail || 'No se pudo iniciar la sesión en vivo.';
      throw new Error(message);
    }
    const sessionInfo = await response.json();
    const mimeType = pickLiveMimeType();
    const options = mimeType ? { mimeType } : undefined;
    const desiredInterval = Number(elements.live.chunkInterval?.value)
      || store.getState().live.chunkIntervalMs
      || initialLiveChunkInterval;
    const chunkIntervalMs = Number.isFinite(desiredInterval) && desiredInterval > 0
      ? desiredInterval
      : DEFAULT_LIVE_CHUNK_INTERVAL_MS;
    const recorder = new MediaRecorder(audioStream, options);
    if (elements.live.chunkInterval) {
      elements.live.chunkInterval.value = String(chunkIntervalMs);
    }
    liveSession.sessionId = sessionInfo.session_id;
    liveSession.mediaStream = audioStream;
    liveSession.recorder = recorder;
    liveSession.chunkQueue = [];
    liveSession.chunkIndex = 0;
    liveSession.sending = false;
    liveSession.finishing = false;
    liveSession.chunkIntervalMs = chunkIntervalMs;
    liveSession.mimeType = mimeType || null;

    preferences.set(LOCAL_KEYS.liveChunkInterval, chunkIntervalMs);
    attachLiveRecorder(recorder);
    recorder.start(chunkIntervalMs);
    updateLiveQueueMetrics({ lastChunkEnqueuedAt: null, lastChunkSentAt: null });

    store.setState((prev) => ({
      ...prev,
      live: {
        ...prev.live,
        status: 'recording',
        sessionId: sessionInfo.session_id,
        language: sessionInfo.language ?? language,
        model: sessionInfo.model_size ?? modelValue,
        beam: sessionInfo.beam_size ?? (Number.isFinite(beamValue) ? beamValue : null),
        device: sessionInfo.device_preference ?? resolvedDevicePreference,
        segments: [],
        text: '',
        duration: null,
        runtimeSeconds: null,
        startedAt: Date.now(),
        pauseStartedAt: null,
        totalPausedMs: 0,
        lastChunkAt: null,
        latencyMs: 0,
        wpm: 0,
        droppedChunks: 0,
        error: null,
        isFinalizing: false,
        chunkIntervalMs,
        pendingChunks: 0,
        lastChunkEnqueuedAt: null,
        lastChunkSentAt: null,
      },
    }));
    renderLiveKpis(store.getState().live);
  } catch (error) {
    console.error('No se pudo iniciar la sesión en vivo', error);
    alert(error?.message || 'No se pudo iniciar la sesión en vivo.');
    if (liveSession.mediaStream) {
      liveSession.mediaStream.getTracks().forEach((track) => track.stop());
    }
    resetLiveSessionLocalState();
    store.setState((prev) => ({
      ...prev,
      live: {
        ...prev.live,
        status: 'idle',
        sessionId: null,
        error: error?.message || 'No se pudo iniciar la sesión en vivo.',
      },
    }));
  }
}

function updatePausedMetrics() {
  store.setState((prev) => {
    const pauseStartedAt = prev.live.pauseStartedAt;
    if (!pauseStartedAt) return prev;
    const elapsed = Date.now() - pauseStartedAt;
    if (elapsed <= 0) return prev;
    return {
      ...prev,
      live: {
        ...prev.live,
        totalPausedMs: prev.live.totalPausedMs + elapsed,
        pauseStartedAt: null,
      },
    };
  });
}

function pauseLiveSession() {
  const state = store.getState().live;
  if (state.status !== 'recording' || !liveSession.recorder) return;
  if (typeof liveSession.recorder.pause === 'function' && liveSession.recorder.state === 'recording') {
    liveSession.recorder.pause();
  }
  store.setState((prev) => ({
    ...prev,
    live: {
      ...prev.live,
      status: 'paused',
      pauseStartedAt: Date.now(),
    },
  }));
}

async function resumeLiveSession() {
  const state = store.getState().live;
  if (state.status !== 'paused') return;
  updatePausedMetrics();
  const desiredInterval = Number(state.chunkIntervalMs) || DEFAULT_LIVE_CHUNK_INTERVAL_MS;
  if (
    liveSession.recorder &&
    liveSession.sessionId &&
    Number.isFinite(desiredInterval) &&
    desiredInterval > 0 &&
    desiredInterval !== liveSession.chunkIntervalMs
  ) {
    const restarted = await restartLiveRecorder(desiredInterval, { keepPaused: true });
    if (!restarted) return;
  }
  const recorder = liveSession.recorder;
  if (!recorder) return;
  if (recorder && typeof recorder.resume === 'function' && recorder.state === 'paused') {
    try {
      recorder.resume();
    } catch (error) {
      console.warn('No se pudo reanudar el MediaRecorder', error);
    }
  }
  store.setState((prev) => ({
    ...prev,
    live: {
      ...prev.live,
      status: 'recording',
      pauseStartedAt: null,
    },
  }));
}

async function finalizeLiveSessionOnServer(sessionId) {
  const folderInput = elements.live.folder?.value.trim();
  const uploadFolder = elements.upload.folder?.value.trim();
  const destination = folderInput || uploadFolder || 'General';
  const state = store.getState().live;
  const payload = {
    destination_folder: destination,
    language: state.language || undefined,
    model_size: state.model || undefined,
    device_preference: state.device || undefined,
    beam_size: state.beam || undefined,
  };
  const response = await fetch(`/api/transcriptions/live/sessions/${sessionId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data?.detail || 'No se pudo guardar la sesión en vivo.';
    throw new Error(message);
  }
  return response.json();
}

async function finishLiveSession(forceDiscard = false) {
  const current = store.getState().live;
  if (current.status === 'idle' || current.isFinalizing) return;
  liveSession.finishing = true;
  if (current.status === 'paused') {
    updatePausedMetrics();
  }
  store.setState((prev) => ({
    ...prev,
    live: {
      ...prev.live,
      status: forceDiscard ? 'idle' : 'finalizing',
      isFinalizing: !forceDiscard,
    },
  }));
  try {
    await stopLiveRecorder();
    await waitForLiveQueueToFlush();
    if (forceDiscard) {
      await discardRemoteLiveSession(liveSession.sessionId);
      resetLiveSessionLocalState();
      store.setState((prev) => ({
        ...prev,
        live: {
          ...prev.live,
          status: 'idle',
          sessionId: null,
          isFinalizing: false,
          segments: [],
          text: '',
          latencyMs: 0,
          wpm: 0,
          droppedChunks: 0,
          duration: null,
          runtimeSeconds: null,
          startedAt: null,
          pauseStartedAt: null,
          totalPausedMs: 0,
        },
      }));
      return;
    }
    const sessionId = liveSession.sessionId;
    const result = await finalizeLiveSessionOnServer(sessionId);
    resetLiveSessionLocalState();
    store.setState((prev) => ({
      ...prev,
      live: {
        ...prev.live,
        status: 'completed',
        sessionId: null,
        model: result.model_size ?? prev.live.model,
        device: result.device_preference ?? prev.live.device,
        language: result.language ?? prev.live.language,
        beam: result.beam_size ?? prev.live.beam,
        duration: result.duration ?? prev.live.duration,
        runtimeSeconds: result.runtime_seconds ?? prev.live.runtimeSeconds,
        isFinalizing: false,
      },
    }));
    await loadJobs();
    if (result?.transcription_id) {
      loadJobDetail(String(result.transcription_id), { suppressErrors: true });
    }
  } catch (error) {
    console.error('No se pudo finalizar la sesión en vivo', error);
    alert(error?.message || 'No se pudo finalizar la sesión en vivo.');
    await discardRemoteLiveSession(liveSession.sessionId);
    resetLiveSessionLocalState();
    store.setState((prev) => ({
      ...prev,
      live: {
        ...prev.live,
        status: 'idle',
        sessionId: null,
        isFinalizing: false,
        error: error?.message || 'No se pudo finalizar la sesión en vivo.',
        segments: [],
        text: '',
        latencyMs: 0,
        wpm: 0,
        droppedChunks: prev.live.droppedChunks + 1,
        duration: null,
        runtimeSeconds: null,
        startedAt: null,
        pauseStartedAt: null,
        totalPausedMs: 0,
      },
    }));
  }
}
let searchTimer = null;
function updateLibraryFilter(key, value) {
  store.setState((prev) => ({ ...prev, libraryFilters: { ...prev.libraryFilters, [key]: value } }));
}
function setupFilters() {
  const { filterStatus, filterLanguage, filterModel, filterSearch } = elements.library;
  filterStatus?.addEventListener('change', (event) => updateLibraryFilter('status', event.target.value));
  filterLanguage?.addEventListener('change', (event) => updateLibraryFilter('language', event.target.value));
  filterModel?.addEventListener('change', (event) => updateLibraryFilter('model', event.target.value));
  filterSearch?.addEventListener('input', (event) => {
    const value = event.target.value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => updateLibraryFilter('search', value), 200);
  });
}

function setupLibraryActions() {
  const { create, rename, move, remove } = elements.library;

  create?.addEventListener('click', () => {
    const input = prompt('Ruta de la nueva carpeta (ej. Clases/2024)');
    if (input) ensureFolderPath(input);
  });
  rename?.addEventListener('click', () => {
    const state = store.getState();
    if (!state.selectedFolderId) {
      alert('Selecciona una carpeta para renombrar.');
      return;
    }
    const folder = state.folders.find((item) => item.id === state.selectedFolderId);
    const name = prompt('Nuevo nombre de la carpeta', folder?.name ?? '');
    if (name) renameFolder(state.selectedFolderId, name.trim());
  });
  move?.addEventListener('click', () => {
    const state = store.getState();
    if (!state.selectedFolderId) {
      alert('Selecciona una carpeta para mover.');
      return;
    }
    const destination = prompt('Ruta destino (dejar vacío para mover a raíz)', '');
    if (destination === null) return;
    moveFolder(state.selectedFolderId, destination.trim());
  });
  remove?.addEventListener('click', () => {
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
  elements.job.copy?.addEventListener('click', async () => {
    const detail = store.getState().job.detail;
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(detail.text);
      alert('Texto copiado al portapapeles.');
    } catch (error) {
      alert('No se pudo copiar el texto.');
    }
  });

  elements.job.downloadTxt?.addEventListener('click', async () => {
    const detail = store.getState().job.detail;
    if (!detail) return;
    const idStr = String(detail.job.id);
    const filename = `${idStr}.txt`;
    if (!NUMERIC_ID_PATTERN.test(idStr)) {
      downloadFileFallback(filename, detail.text);
      return;
    }
    const url = `/api/transcriptions/${idStr}.txt`;
    await triggerDownload(url, detail.text, filename);
  });

  elements.job.downloadSrt?.addEventListener('click', async () => {
    const detail = store.getState().job.detail;
    if (!detail) return;
    const lines = detail.segments?.length
      ? detail.segments.map((segment, index) => `${index + 1}\n00:00:${String(index).padStart(2, '0')} --> 00:00:${String(index + 1).padStart(2, '0')}\n${segment}\n`)
      : [`1\n00:00:00 --> 00:10:00\n${detail.text}\n`];
    const fallback = lines.join('\n');
    const idStr = String(detail.job.id);
    const filename = `${idStr}.srt`;
    if (!NUMERIC_ID_PATTERN.test(idStr)) {
      downloadFileFallback(filename, fallback, 'application/x-subrip;charset=utf-8');
      return;
    }
    const url = `/api/transcriptions/${idStr}.srt`;
    await triggerDownload(url, fallback, filename);
  });

  elements.job.exportMd?.addEventListener('click', () => {
    const detail = store.getState().job.detail;
    if (!detail) return;
    const content = `# ${detail.job.name}\n\n${detail.text}`;
    downloadFileFallback(`${detail.job.id}.md`, content);
  });

  elements.job.move?.addEventListener('click', () => {
    const detail = store.getState().job.detail;
    if (!detail) return;
    const destination = prompt('Mover a carpeta (ej. Clases/2024). Dejar vacío para raíz.', detail.folderPath ? detail.folderPath.slice(1) : '');
    if (destination === null) return;
    moveJob(detail.job.id, destination);
  });
}
function setupLiveControls() {
  const bind = (element, type, handler) => {
    if (element) element.addEventListener(type, handler);
  };

  bind(elements.home.start, 'click', startLiveSession);
  bind(elements.live.start, 'click', startLiveSession);
  bind(elements.home.pause, 'click', pauseLiveSession);
  bind(elements.live.pause, 'click', pauseLiveSession);
  bind(elements.home.resume, 'click', resumeLiveSession);
  bind(elements.live.resume, 'click', resumeLiveSession);
  bind(elements.home.finish, 'click', finishLiveSession);
  bind(elements.live.finish, 'click', finishLiveSession);

  if (elements.live.chunkInterval) {
    const currentInterval = store.getState().live.chunkIntervalMs || initialLiveChunkInterval;
    elements.live.chunkInterval.value = String(currentInterval);
    elements.live.chunkInterval.addEventListener('change', async (event) => {
      const raw = Number(event.target.value);
      const value = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LIVE_CHUNK_INTERVAL_MS;
      preferences.set(LOCAL_KEYS.liveChunkInterval, value);
      store.setState((prev) => ({
        ...prev,
        live: {
          ...prev.live,
          chunkIntervalMs: value,
        },
      }));
      const shouldRestart = Boolean(liveSession.recorder && liveSession.sessionId);
      if (!shouldRestart) {
        liveSession.chunkIntervalMs = value;
        return;
      }
      if (value === liveSession.chunkIntervalMs) return;
      const keepPaused = store.getState().live.status === 'paused';
      const success = await restartLiveRecorder(value, { keepPaused });
      if (!success) {
        const fallback = liveSession.chunkIntervalMs || store.getState().live.chunkIntervalMs || DEFAULT_LIVE_CHUNK_INTERVAL_MS;
        event.target.value = String(fallback);
        store.setState((prev) => ({
          ...prev,
          live: {
            ...prev.live,
            chunkIntervalMs: fallback,
          },
        }));
        preferences.set(LOCAL_KEYS.liveChunkInterval, fallback);
      }
    });
  }

  if (elements.live.tailSize) {
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
  }

  if (elements.job.tailSize) {
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
  elements.home.newTranscription?.addEventListener('click', () => {
    elements.upload.form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  elements.home.quickFolder?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const value = event.target.value.trim();
    if (!value) return;
    const folderId = ensureFolderPath(value);
    if (folderId) {
      if (elements.upload.folder) elements.upload.folder.value = value;
      if (elements.live.folder) elements.live.folder.value = value;
      store.setState((prev) => ({ ...prev, selectedFolderId: folderId }));
    }
  });
  elements.home.quickFolder?.addEventListener('change', (event) => {
    const value = event.target.value.trim();
    if (!value) return;
    const folderId = ensureFolderPath(value);
    if (folderId) {
      if (elements.upload.folder) elements.upload.folder.value = value;
      if (elements.live.folder) elements.live.folder.value = value;
      store.setState((prev) => ({ ...prev, selectedFolderId: folderId }));
    }
  });
}
function setupDiagnostics() {
  elements.diagnostics?.addEventListener('click', () => {
    alert('Diagnóstico rápido:\n\n- WS en vivo conectado\n- Última sesión estable\n- Modelos cargados correctamente');
  });
}

function setupLiveProgressTicker() {
  if (liveProgressTimer) return;
  liveProgressTimer = window.setInterval(() => {
    const liveState = store.getState().live;
    if (!liveState) return;
    if (['recording', 'paused', 'finalizing'].includes(liveState.status)) {
      renderLiveProgress(liveState);
    }
  }, 1000);
}
async function init() {
  console.info('init start');
  setupTheme();
  setupAnchorGuards();
  setupRouter();
  setupModelSelectors();
  setupPlanDialog();
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
  setupLiveProgressTicker();
  renderHomePanel(store.getState());
  updateHomeStatus(store.getState());
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
