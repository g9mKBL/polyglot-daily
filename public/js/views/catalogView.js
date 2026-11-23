import { api } from '../api.js';
import { escapeHtml, formatBilingual, langShort } from '../ruby.js';
import { getState, setState } from '../state.js';

export async function renderCatalogView(container, { navigate }) {
  let activeLang = getState().activeCatalogLanguage || 'en';

  async function loadAndRender() {
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Đang tải lộ trình học… / Loading courses…</p></div>`;

    let data;
    try {
      data = await api.getCourses(activeLang);
    } catch (err) {
      container.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
      return;
    }

    const catalog = data?.catalog || { languages: [] };
    const levels = (data?.levels || []).slice().sort((a, b) => a.order - b.order);
    const langMeta = (catalog.languages || []).find((l) => l.id === activeLang);

    const totalLessons = levels.reduce((acc, l) => acc + (l.totalLessons || 0), 0);
    const completedLessons = levels.reduce(
      (acc, l) => acc + (l.completedLessons || 0),
      0
    );

    container.innerHTML = `
      <div class="stack" data-testid="catalog-view">
        <div class="page-header">
          <div>
            <h1>Lộ trình Đa Ngôn Ngữ / Course Catalog</h1>
            <p class="muted" style="margin:4px 0 0">
              Chọn ngôn ngữ và học theo lộ trình gợi ý hoặc nhảy tự do (Free Jump) đến bất kỳ cấp độ nào.
            </p>
          </div>
          <div class="badge badge-primary">
            Hoàn thành: ${completedLessons} / ${totalLessons} bài học
          </div>
        </div>

        <div class="tabs" role="tablist" aria-label="Language Tabs">
          ${['en', 'zh', 'ja']
            .map((lang) => {
              const info = (catalog.languages || []).find((l) => l.id === lang);
              const label =
                lang === 'en'
                  ? 'English · CEFR A1–C2'
                  : lang === 'zh'
                    ? '中文 · HSK 1–6'
                    : '日本語 · JLPT N5–N1';
              return `
              <button type="button"
                role="tab"
                aria-selected="${activeLang === lang ? 'true' : 'false'}"
                class="tab-btn ${activeLang === lang ? 'is-active' : ''}"
                data-catalog-lang="${lang}"
                data-testid="catalog-lang-tab-${lang}">
                ${escapeHtml(info?.name?.vi || langShort(lang))} (${label})
              </button>
            `;
            })
            .join('')}
        </div>

        ${
          langMeta
            ? `
          <div class="card row-between">
            <div>
              <span class="badge badge-${escapeHtml(activeLang)}">${escapeHtml(langMeta.levelSystem)}</span>
              <strong style="margin-left:6px">${escapeHtml(langMeta.name?.native || '')}</strong>
              <span class="muted"> · ${escapeHtml(langMeta.name?.vi || '')} / ${escapeHtml(langMeta.name?.en || '')}</span>
            </div>
            <span class="subtle">TTS Locale: <code class="mono">${escapeHtml(langMeta.ttsLocale || '')}</code> · Free Jump Enabled</span>
          </div>
        `
            : ''
        }

        ${
          levels.length === 0
            ? '<div class="card"><p class="muted">Chưa có dữ liệu cấp độ cho ngôn ngữ này.</p></div>'
            : `
          <div class="stack">
            ${levels
              .map((lvl) => {
                const pct = lvl.totalLessons
                  ? Math.round((lvl.completedLessons / lvl.totalLessons) * 100)
                  : 0;
                return `
                <article class="card level-card ${lvl.recommendedNext ? 'is-recommended' : ''}" data-testid="level-card-${escapeHtml(lvl.levelId)}">
                  <div class="row-between">
                    <div class="stack-sm" style="gap:4px">
                      <div class="row">
                        <span class="badge badge-${escapeHtml(lvl.language)}">${escapeHtml(lvl.code)}</span>
                        ${
                          lvl.recommendedNext
                            ? `<span class="badge badge-primary" data-testid="recommended-badge-${escapeHtml(lvl.levelId)}">★ Gợi ý tiếp theo / Recommended Next</span>`
                            : ''
                        }
                        ${
                          lvl.completedLessons === lvl.totalLessons && lvl.totalLessons > 0
                            ? `<span class="badge badge-success">✓ Đã hoàn thành cấp độ</span>`
                            : ''
                        }
                        <span class="subtle">~${lvl.estimatedMinutes || 30} phút</span>
                      </div>
                      <h2 style="margin:2px 0 0;font-size:1.15rem">${formatBilingual(lvl.title)}</h2>
                      <p class="subtle" style="margin:0">${formatBilingual(lvl.subtitle)}</p>
                    </div>
                    <div style="min-width:150px">
                      <div class="row-between subtle" style="margin-bottom:4px">
                        <span>Tiến độ</span>
                        <strong>${lvl.completedLessons}/${lvl.totalLessons} (${pct}%)</strong>
                      </div>
                      <div class="progress-track">
                        <div class="progress-fill ${pct === 100 ? 'is-success' : ''}" style="width:${pct}%"></div>
                      </div>
                    </div>
                  </div>

                  <div class="lesson-list">
                    ${(lvl.lessons || [])
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((lsn) => {
                        const st = lsn.progress?.status || 'not_started';
                        const isDone = st === 'completed';
                        return `
                        <div class="lesson-tile ${isDone ? 'is-completed' : ''}" data-testid="lesson-card-${escapeHtml(lsn.id)}">
                          <div class="stack-sm" style="gap:5px">
                            <div class="row-between">
                              <span class="badge">Bài ${lsn.order}</span>
                              ${
                                isDone
                                  ? `<span class="badge badge-success">✓ ${lsn.progress.bestScore}%</span>`
                                  : st === 'in_progress'
                                    ? `<span class="badge badge-warning">Đang học (${lsn.progress.bestScore}%)</span>`
                                    : `<span class="badge">+${lsn.xpReward || 50} XP</span>`
                              }
                            </div>
                            <strong class="cjk-text">${escapeHtml(lsn.title?.native || lsn.id)}</strong>
                            <div class="subtle">${formatBilingual(lsn.title)}</div>
                            <div class="subtle">
                              ${lsn.vocabCount} từ vựng · ${lsn.grammarCount} ngữ pháp · ${lsn.quizCount} quiz
                            </div>
                          </div>
                          <button type="button"
                            class="btn btn-sm ${isDone ? '' : 'btn-primary'}"
                            data-open-lesson="${escapeHtml(lsn.id)}"
                            data-testid="open-lesson-${escapeHtml(lsn.id)}">
                            ${isDone ? 'Ôn lại / Review' : 'Học ngay / Study'} →
                          </button>
                        </div>
                      `;
                      })
                      .join('')}
                  </div>
                </article>
              `;
              })
              .join('')}
          </div>
        `
        }
      </div>
    `;

    container.querySelectorAll('[data-catalog-lang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeLang = btn.getAttribute('data-catalog-lang');
        setState({ activeCatalogLanguage: activeLang });
        loadAndRender();
      });
    });

    container.querySelectorAll('[data-open-lesson]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lessonId = btn.getAttribute('data-open-lesson');
        navigate('lesson', { lessonId, lessonTab: 'vocab' });
      });
    });
  }

  await loadAndRender();
}
