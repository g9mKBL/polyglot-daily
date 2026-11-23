const PREFS_KEY = 'polyglot_study_prefs_v1';

function loadPrefs() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        showPhonetics: parsed.showPhonetics !== false,
        showTranslations: parsed.showTranslations !== false,
        ttsSpeed: parsed.ttsSpeed === 0.75 ? 0.75 : 1.0
      };
    }
  } catch {
    // Ignore storage errors
  }
  return {
    showPhonetics: true,
    showTranslations: true,
    ttsSpeed: 1.0
  };
}

function savePrefs(prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}

const initialState = {
  user: null,
  stats: null,
  todayXp: 0,
  summary: null,
  route: 'auth',
  routeParams: {},
  activeCatalogLanguage: 'en',
  studyPrefs: loadPrefs(),
  ttsFallback: false
};

const state = { ...initialState };
const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (err) {
      console.error('[state listener]', err);
    }
  }
}

export function updateStudyPrefs(patch) {
  const next = { ...state.studyPrefs, ...patch };
  savePrefs(next);
  setState({ studyPrefs: next });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type === 'success' ? 'is-success' : type === 'error' ? 'is-error' : ''}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3400);
}
