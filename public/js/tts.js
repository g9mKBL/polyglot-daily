const LOCALE_MAP = {
  en: 'en-US',
  zh: 'zh-CN',
  ja: 'ja-JP'
};

let cachedVoices = [];
let listenersBound = false;
let activeSequenceId = 0;

function refreshVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    cachedVoices = [];
    return;
  }
  try {
    cachedVoices = window.speechSynthesis.getVoices() || [];
  } catch {
    cachedVoices = [];
  }
}

function ensureVoiceListeners() {
  if (listenersBound || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }
  listenersBound = true;
  refreshVoices();
  try {
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    } else {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }
  } catch {
    // Non-blocking fallback
  }
}

function findMatchingVoice(locale) {
  refreshVoices();
  if (!cachedVoices.length) return null;
  const lower = locale.toLowerCase();
  const prefix = lower.split('-')[0];
  return (
    cachedVoices.find((v) => String(v.lang || '').toLowerCase() === lower) ||
    cachedVoices.find((v) =>
      String(v.lang || '').toLowerCase().startsWith(prefix)
    ) ||
    null
  );
}

export function isTtsSupported() {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

export function stopSpeaking() {
  activeSequenceId += 1;
  if (!isTtsSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignore browser speech errors
  }
}

export function speakText(text, language = 'en', options = {}) {
  const { rate = 1.0, onEnd = null, onFallback = null } = options;
  ensureVoiceListeners();

  const cleanText = String(text ?? '').trim();
  if (!cleanText) {
    if (onEnd) onEnd();
    return false;
  }

  if (!isTtsSupported()) {
    if (onFallback) onFallback('unsupported');
    if (onEnd) onEnd();
    return false;
  }

  const locale = LOCALE_MAP[language] || 'en-US';
  const voice = findMatchingVoice(locale);

  // If voices are enumerated and none match the target locale, use graceful phonetic fallback
  if (cachedVoices.length > 0 && !voice) {
    if (onFallback) onFallback('no-voice');
    if (onEnd) onEnd();
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(cleanText);
    utterance.lang = locale;
    utterance.rate = Number(rate) || 1.0;
    if (voice) utterance.voice = voice;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (onEnd) onEnd();
    };

    utterance.onend = finish;
    utterance.onerror = () => {
      if (onFallback) onFallback('speech-error');
      finish();
    };

    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    if (onFallback) onFallback('speech-exception');
    if (onEnd) onEnd();
    return false;
  }
}

export function speakDialogueSequence(lines, language = 'en', options = {}) {
  const {
    rate = 1.0,
    onLineStart = null,
    onDone = null,
    onFallback = null
  } = options;

  stopSpeaking();
  const seqId = activeSequenceId;

  if (!Array.isArray(lines) || lines.length === 0) {
    if (onDone) onDone();
    return () => {};
  }

  let idx = 0;

  function playNext() {
    if (seqId !== activeSequenceId) return;
    if (idx >= lines.length) {
      if (onDone) onDone();
      return;
    }

    const currentIdx = idx;
    const line = lines[currentIdx];
    idx += 1;
    if (onLineStart) onLineStart(currentIdx);

    const spoke = speakText(line.text, language, {
      rate,
      onFallback: (reason) => {
        if (onFallback) onFallback(reason, currentIdx);
      },
      onEnd: () => {
        if (seqId !== activeSequenceId) return;
        // Brief pause when fallback is used so highlights remain visible sequentially
        setTimeout(playNext, 350);
      }
    });

    if (!spoke && seqId === activeSequenceId) {
      // speakText already invoked onEnd synchronously via finish or fallback; wait handled above
    }
  }

  playNext();

  return () => {
    if (seqId === activeSequenceId) {
      stopSpeaking();
      if (onDone) onDone();
    }
  };
}
