const API_BASE = '/api/transcriptions';

const streamContainer = document.querySelector('#student-stream');
const refreshButton = document.querySelector('#student-refresh');
const autoToggle = document.querySelector('#student-auto');

let autoTimer = null;
let currentId = null;
let currentText = '';

const AD_MESSAGES = [
  '🎓 Consejo patrocinado: repasa tus apuntes con resaltadores ecológicos de GreenNote.',
  '📚 Oferta: 10% de descuento en cuadernos inteligentes para universidades asociadas.',
  '⌛ Tip: alterna entre modelos large y medium según la duración para optimizar tu CPU.',
];

function splitParagraphs(text) {
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

function trimParagraphs(container, desiredLength) {
  while (container.children.length > desiredLength) {
    container.removeChild(container.lastElementChild);
  }
}

function resetContainer(message) {
  if (!streamContainer) return;
  streamContainer.dataset.fullText = '';
  streamContainer.dataset.paragraphs = JSON.stringify([]);
  streamContainer.innerHTML = '';
  const placeholder = document.createElement('p');
  placeholder.classList.add('placeholder');
  placeholder.textContent = message;
  streamContainer.appendChild(placeholder);
}

function scrollToEnd(index) {
  if (!streamContainer || index % 4 !== 0) return;
  if (typeof streamContainer.scrollTo === 'function') {
    streamContainer.scrollTo({ top: streamContainer.scrollHeight, behavior: 'smooth' });
  } else {
    streamContainer.scrollTop = streamContainer.scrollHeight;
  }
}

function computeSpeed(item, text) {
  const charCount = Math.max(1, (text ?? '').length);
  const runtime = Number(item?.runtime_seconds ?? 0);
  const duration = Number(item?.duration ?? 0);
  let reference = runtime > 0 ? runtime : duration;
  if (!Number.isFinite(reference) || reference <= 0) {
    reference = Math.max(charCount / 16, 6);
  }
  let cps = charCount / Math.max(reference, 1);
  if ((item?.model_size || '').toLowerCase().includes('large')) {
    cps *= 0.78;
  }
  if ((item?.device_preference || '').toLowerCase() === 'cpu') {
    cps *= 0.82;
  }
  if (item?.status === 'processing') {
    cps *= 0.9;
  }
  if (!Number.isFinite(cps) || cps <= 0) {
    cps = 42;
  }
  return Math.max(20, Math.min(140, cps * 1.08));
}

function typewriteText(container, item, text) {
  return new Promise((resolve) => {
    const sanitized = (text ?? '').trim();
    if (!sanitized) {
      resolve();
      return;
    }
    const paragraphs = splitParagraphs(sanitized);
    const previousFull = container.dataset.fullText || '';
    const shouldReset = !previousFull || !sanitized.startsWith(previousFull);
    if (shouldReset) {
      container.replaceChildren();
      container.dataset.paragraphs = JSON.stringify([]);
    }
    const previousParagraphs = JSON.parse(container.dataset.paragraphs || '[]');
    trimParagraphs(container, paragraphs.length);
    const animations = [];
    paragraphs.forEach((paragraphText, index) => {
      const paragraph = ensureParagraph(container, index);
      const previous = shouldReset ? '' : previousParagraphs[index] ?? paragraph.textContent ?? '';
      if (!paragraphText) {
        paragraph.textContent = '';
        paragraph.dataset.typing = 'false';
        return;
      }
      if (shouldReset || !paragraphText.startsWith(previous)) {
        paragraph.textContent = '';
        animations.push({ element: paragraph, base: '', addition: paragraphText });
      } else if (paragraphText.length > previous.length) {
        paragraph.textContent = previous;
        animations.push({
          element: paragraph,
          base: previous,
          addition: paragraphText.slice(previous.length),
        });
      } else {
        paragraph.textContent = paragraphText;
        paragraph.dataset.typing = 'false';
      }
    });

    const finalize = () => {
      container.dataset.fullText = sanitized;
      container.dataset.paragraphs = JSON.stringify(paragraphs);
      resolve();
    };

    if (!animations.length) {
      finalize();
      return;
    }

    const speed = computeSpeed(item, sanitized);
    const charDelay = Math.max(20, 1000 / speed);
    let animationIndex = 0;

    const playNext = () => {
      if (animationIndex >= animations.length) {
        finalize();
        return;
      }
      const { element, base, addition } = animations[animationIndex];
      let pointer = 0;
      let current = base;
      element.dataset.typing = 'true';

      const step = () => {
        if (pointer >= addition.length) {
          element.dataset.typing = 'false';
          animationIndex += 1;
          playNext();
          return;
        }
        current += addition[pointer];
        element.textContent = current;
        scrollToEnd(pointer + 1);
        pointer += 1;
        window.setTimeout(step, charDelay);
      };

      step();
    };

    playNext();
  });
}

function displayAd() {
  if (!streamContainer) return;
  const existing = streamContainer.querySelector('.ad-slot');
  if (existing) {
    existing.remove();
  }
  const ad = document.createElement('p');
  ad.className = 'ad-slot';
  ad.textContent = AD_MESSAGES[Math.floor(Math.random() * AD_MESSAGES.length)];
  streamContainer.appendChild(ad);
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

function selectTranscription(results) {
  const ordered = Array.isArray(results) ? results : [];
  return (
    ordered.find((item) => item.status === 'processing' && item.text) ||
    ordered.find((item) => item.status === 'completed' && item.text) ||
    null
  );
}

async function loadLatest() {
  if (!streamContainer) return;
  try {
    const data = await fetchJSON(new URL(API_BASE, window.location.origin));
    const results = Array.isArray(data?.results) ? data.results : [];
    const target = selectTranscription(results);
    if (!target) {
      currentId = null;
      currentText = '';
      resetContainer('Aún no hay transcripciones activas en tu cuenta.');
      scheduleAutoRefresh('idle');
      return;
    }
    const text = target.text ?? '';
    if (target.id !== currentId || text !== currentText) {
      currentId = target.id;
      currentText = text;
      await typewriteText(streamContainer, target, text);
      displayAd();
    }
    scheduleAutoRefresh(target.status);
  } catch (error) {
    resetContainer(`No se pudo sincronizar: ${error.message}`);
    scheduleAutoRefresh('error');
  }
}

function scheduleAutoRefresh(status) {
  if (autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }
  if (!autoToggle?.checked) {
    return;
  }
  const delay = status === 'processing' ? 4500 : status === 'error' ? 8000 : 6000;
  autoTimer = window.setTimeout(loadLatest, delay);
}

refreshButton?.addEventListener('click', () => {
  loadLatest();
});

autoToggle?.addEventListener('change', () => {
  if (autoToggle.checked) {
    loadLatest();
  } else if (autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }
});

resetContainer('Pulsa «Actualizar ahora» o deja activada la recarga automática para vincular la transcripción en curso.');
loadLatest();
