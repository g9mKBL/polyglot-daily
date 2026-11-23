import { api } from './api.js';
import { escapeHtml, langShort } from './ruby.js';
import { getState, notify, setState, subscribe } from './state.js';
import { stopSpeaking } from './tts.js';
import { renderAuthView } from './views/authView.js';
import { renderCatalogView } from './views/catalogView.js';
import { renderDashboardView } from './views/dashboardView.js';
import { renderLessonView } from './views/lessonView.js';
import { renderReviewView } from './views/reviewView.js';
import { renderSocialView } from './views/socialView.js';

const headerEl = document.getElementById('app-header');
const viewRoot = document.getElementById('view-root');
const streakValEl = document.getElementById('header-streak-val');
const xpValEl = document.getElementById('header-xp-val');
const userChipEl = document.getElementById('header-user-chip');
const reviewBadgeEl = document.getElementById('nav-review-badge');
const logoutBtn = document.getElementById('btn-logout');

function syncHeader(state) {
  const { user, stats, summary, route } = state;
  if (!user) {
    headerEl.hidden = true;
    return;
  }

  headerEl.hidden = false;
  streakValEl.textContent = String(stats?.currentStreak ?? 0);
  xpValEl.textContent = String(stats?.totalXp ?? 0);

  const initial = escapeHtml((user.displayName || user.username || '?').slice(0, 1).toUpperCase());
  userChipEl.innerHTML = `
    <span class="avatar" style="background:${escapeHtml(user.avatarColor || '#2563eb')}">${initial}</span>
    <span>${escapeHtml(user.displayName)} <span class="badge badge-${escapeHtml(user.activeLanguage)}">${langShort(user.activeLanguage)}</span></span>
  `;

  const duePlusMistakes =
    (summary?.dueVocabCount || 0) + (summary?.mistakesCount || 0);
  if (duePlusMistakes > 0) {
    reviewBadgeEl.hidden = false;
    reviewBadgeEl.textContent = String(duePlusMistakes);
  } else {
    reviewBadgeEl.hidden = true;
  }

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    const target = btn.getAttribute('data-nav');
    const active =
      route === target || (route === 'lesson' && target === 'catalog');
    btn.classList.toggle('is-active', active);
  });
}

function buildHash(route, params = {}) {
  if (route === 'lesson' && params.lessonId) {
    const tab = params.lessonTab ? `?tab=${encodeURIComponent(params.lessonTab)}` : '';
    return `#/lesson/${encodeURIComponent(params.lessonId)}${tab}`;
  }
  if (route === 'review' && params.reviewTab) {
    return `#/review?tab=${encodeURIComponent(params.reviewTab)}`;
  }
  if (route === 'social' && params.socialTab) {
    return `#/social?tab=${encodeURIComponent(params.socialTab)}`;
  }
  return `#/${route}`;
}

function parseHash() {
  const raw = window.location.hash || '';
  const cleaned = raw.replace(/^#\/?/, '');
  const [pathPart, queryPart] = cleaned.split('?');
  const segments = (pathPart || '').split('/').filter(Boolean);
  const qs = new URLSearchParams(queryPart || '');

  const head = segments[0] || '';
  if (head === 'lesson' && segments[1]) {
    return {
      route: 'lesson',
      params: {
        lessonId: decodeURIComponent(segments[1]),
        lessonTab: qs.get('tab') || 'vocab'
      }
    };
  }
  if (['dashboard', 'catalog', 'review', 'social'].includes(head)) {
    return {
      route: head,
      params: {
        reviewTab: qs.get('tab') || 'srs',
        socialTab: qs.get('tab') || 'friends'
      }
    };
  }
  return { route: 'dashboard', params: {} };
}

let renderSeq = 0;

async function renderCurrentRoute() {
  const seq = ++renderSeq;
  stopSpeaking();
  const state = getState();

  if (!state.user) {
    setState({ route: 'auth', routeParams: {} });
    await renderAuthView(viewRoot, {
      onAuthenticated: () => {
        navigate('dashboard');
      }
    });
    return;
  }

  const { route, routeParams: params } = state;
  if (seq !== renderSeq) return;

  if (route === 'catalog') {
    await renderCatalogView(viewRoot, { navigate });
  } else if (route === 'lesson' && params.lessonId) {
    await renderLessonView(viewRoot, {
      lessonId: params.lessonId,
      initialTab: params.lessonTab || 'vocab',
      navigate
    });
  } else if (route === 'review') {
    await renderReviewView(viewRoot, {
      initialTab: params.reviewTab || 'srs',
      navigate
    });
  } else if (route === 'social') {
    await renderSocialView(viewRoot, {
      initialTab: params.socialTab || 'friends',
      navigate
    });
  } else {
    await renderDashboardView(viewRoot, { navigate });
  }
}

export function navigate(route, params = {}) {
  const nextHash = buildHash(route, params);
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
  setState({ route, routeParams: params });
  renderCurrentRoute();
}

document.querySelectorAll('[data-nav]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-nav');
    navigate(target);
  });
});

logoutBtn?.addEventListener('click', async () => {
  stopSpeaking();
  try {
    await api.logout();
  } catch {
    // Ignore logout network error
  }
  setState({
    user: null,
    stats: null,
    todayXp: 0,
    summary: null,
    route: 'auth',
    routeParams: {}
  });
  window.location.hash = '#/auth';
  notify('Đã đăng xuất', 'info');
  renderCurrentRoute();
});

window.addEventListener('hashchange', () => {
  if (!getState().user) return;
  const parsed = parseHash();
  setState({ route: parsed.route, routeParams: parsed.params });
  renderCurrentRoute();
});

subscribe(syncHeader);

async function bootstrap() {
  try {
    const me = await api.getMe();
    const parsed = parseHash();
    setState({
      user: me.user,
      stats: me.stats,
      todayXp: me.todayXp,
      activeCatalogLanguage: me.user.activeLanguage || 'en',
      route: parsed.route,
      routeParams: parsed.params
    });
  } catch {
    setState({ user: null, route: 'auth', routeParams: {} });
  }
  syncHeader(getState());
  await renderCurrentRoute();
}

bootstrap();
