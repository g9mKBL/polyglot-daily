import { api } from '../api.js';
import {
  escapeHtml,
  formatBilingual,
  langShort,
  renderRubyText,
  stripRubyBrackets
} from '../ruby.js';
import { getState, notify, setState } from '../state.js';
import { speakText, stopSpeaking } from '../tts.js';

export async function renderReviewView(container, { initialTab = 'srs', navigate }) {
  stopSpeaking();
  let activeTab = initialTab || 'srs';
  let filterLang = '';
  let reviewMode = 'due';
  let srsData = { dueCount: 0, totalCount: 0, cards: [] };
  let mistakesData = { count: 0, mistakes: [] };
  let cardIndex = 0;
  let cardFlipped = false;
  let ttsFallbackVisible = false;
  let mistakePracticeAnswers = {}; // { [questionId]: number | number[] }
  let mistakeChecked = {}; // { [questionId]: boolean }

  async function loadData() {
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Đang tải danh sách ôn tập… / Loading review…</p></div>`;
    try {
      const [srsRes, mistakesRes] = await Promise.all([
        api.getVocabReview({
          language: filterLang || undefined,
          mode: reviewMode,
          limit: 30
        }),
        api.getMistakes(filterLang || undefined)
      ]);
      srsData = srsRes || { dueCount: 0, totalCount: 0, cards: [] };
      mistakesData = mistakesRes || { count: 0, mistakes: [] };
      cardIndex = 0;
      cardFlipped = false;
      render();
    } catch (err) {
      container.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
    }
  }

  function speakCardText(text, lang, el = null) {
    speakText(stripRubyBrackets(text), lang, {
      rate: getState().studyPrefs.ttsSpeed || 1.0,
      onFallback: () => {
        ttsFallbackVisible = true;
        const badge = container.querySelector('[data-testid="review-tts-fallback"]');
        if (badge) badge.hidden = false;
        if (el) {
          el.classList.add('tts-highlight');
          setTimeout(() => el.classList.remove('tts-highlight'), 1100);
        }
      }
    });
  }

  function render() {
    const cards = srsData.cards || [];
    const currentCard = cards[cardIndex] || null;
    const mistakes = mistakesData.mistakes || [];

    container.innerHTML = `
      <div class="stack" data-testid="review-view">
        <div class="page-header">
          <div>
            <h1>Ôn tập SRS &amp; Ngân hàng câu sai / Review &amp; Mistakes</h1>
            <p class="muted" style="margin:4px 0 0">
              Ôn lại từ vựng đến hạn theo thuật toán lặp lại ngắt quãng và luyện tập các câu từng làm sai.
            </p>
          </div>
          <div class="row">
            <select id="review-lang-filter" class="select" style="width:auto" data-testid="review-lang-filter">
              <option value="" ${filterLang === '' ? 'selected' : ''}>Tất cả ngôn ngữ / All</option>
              <option value="en" ${filterLang === 'en' ? 'selected' : ''}>Tiếng Anh (EN)</option>
              <option value="zh" ${filterLang === 'zh' ? 'selected' : ''}>Tiếng Trung (ZH)</option>
              <option value="ja" ${filterLang === 'ja' ? 'selected' : ''}>Tiếng Nhật (JA)</option>
            </select>
            <span class="badge badge-warning" data-testid="review-tts-fallback" ${ttsFallbackVisible ? '' : 'hidden'}>
              Voice pack unavailable — using phonetic guide
            </span>
          </div>
        </div>

        <div class="tabs" role="tablist">
          <button type="button" class="tab-btn ${activeTab === 'srs' ? 'is-active' : ''}" data-review-tab="srs" data-testid="review-tab-srs">
            Thẻ SRS / Flashcards (${srsData.dueCount || 0} đến hạn)
          </button>
          <button type="button" class="tab-btn ${activeTab === 'mistakes' ? 'is-active' : ''}" data-review-tab="mistakes" data-testid="review-tab-mistakes">
            Ngân hàng câu sai / Mistake Bank (${mistakesData.count || 0})
          </button>
        </div>

        ${activeTab === 'srs' ? renderSrsTab(cards, currentCard) : renderMistakesTab(mistakes)}
      </div>
    `;

    bindEvents(cards, currentCard, mistakes);
  }

  function renderSrsTab(cards, currentCard) {
    return `
      <div class="card stack" data-testid="srs-panel">
        <div class="row-between">
          <div class="row">
            <span class="badge badge-primary">Đến hạn: ${srsData.dueCount || 0}</span>
            <span class="badge">Tổng từ: ${srsData.totalCount || 0}</span>
            ${cards.length ? `<span class="subtle">Thẻ ${cardIndex + 1} / ${cards.length}</span>` : ''}
          </div>
          <div class="row">
            <button type="button" class="btn btn-sm ${reviewMode === 'due' ? 'btn-primary' : ''}" data-srs-mode="due" data-testid="srs-mode-due">
              Chỉ từ đến hạn / Due Only
            </button>
            <button type="button" class="btn btn-sm ${reviewMode === 'all' ? 'btn-primary' : ''}" data-srs-mode="all" data-testid="srs-mode-all">
              Tất cả từ / Practice All
            </button>
          </div>
        </div>

        ${
          !currentCard
            ? `
          <div class="card-subtle stack-sm" style="text-align:center;padding:28px" data-testid="srs-empty-state">
            <strong>🎉 Không còn thẻ nào đến hạn ôn tập!</strong>
            <p class="subtle" style="margin:0">
              Hoàn thành thêm bài học để đưa từ vựng mới vào hàng đợi SRS, hoặc chuyển sang chế độ "Tất cả từ" để ôn tự do.
            </p>
            <div class="row" style="justify-content:center">
              <button type="button" class="btn btn-primary btn-sm" id="btn-srs-switch-all">Ôn tất cả từ / Practice All</button>
              <button type="button" class="btn btn-sm" id="btn-srs-go-catalog">Mở khóa học →</button>
            </div>
          </div>
        `
            : `
          <div class="flashcard-wrap">
            <div class="flashcard ${cardFlipped ? 'is-flipped' : ''}" id="srs-card-box" tabindex="0" role="button" data-testid="srs-flashcard">
              <div class="row-between">
                <div class="row">
                  <span class="badge badge-${escapeHtml(currentCard.language)}">${langShort(currentCard.language)} · ${escapeHtml(currentCard.levelCode || '')}</span>
                  <span class="badge">SRS Lv.${currentCard.srs?.masteryLevel ?? 0}</span>
                </div>
                <button type="button" class="btn btn-sm btn-tts" id="btn-srs-speak" data-testid="srs-tts-btn">🔊 Phát âm</button>
              </div>

              ${
                !cardFlipped
                  ? `
                <div class="stack-sm" style="align-items:center;text-align:center;margin:16px 0">
                  <div class="flashcard-term cjk-text">${renderRubyText(currentCard.rubyText, currentCard.term, true)}</div>
                  <div id="srs-ph" class="phonetic-box">${escapeHtml([currentCard.reading, currentCard.romaji].filter(Boolean).join(' · '))}</div>
                  <span class="subtle">Nhấn vào thẻ để lật xem nghĩa và đánh giá</span>
                </div>
              `
                  : `
                <div class="stack-sm" style="margin:6px 0">
                  <div style="text-align:center">
                    <strong class="cjk-text" style="font-size:1.4rem">${escapeHtml(currentCard.term)}</strong>
                    <div id="srs-ph" class="subtle">${escapeHtml([currentCard.reading, currentCard.romaji].filter(Boolean).join(' · '))}</div>
                    <div style="font-size:1.15rem;margin-top:6px"><strong>${formatBilingual(currentCard.meaning)}</strong></div>
                  </div>
                  ${
                    currentCard.example
                      ? `
                    <div class="card-subtle stack-sm" style="gap:4px">
                      <div class="cjk-text">${renderRubyText(currentCard.example.rubyText, currentCard.example.text, true)}</div>
                      <div class="subtle">${escapeHtml(currentCard.example.reading || '')}</div>
                      <div class="subtle">${formatBilingual(currentCard.example.meaning)}</div>
                    </div>
                  `
                      : ''
                  }
                </div>
              `
              }

              <div class="row-between" onclick="event.stopPropagation()">
                <button type="button" class="btn btn-sm" id="btn-srs-prev" ${cardIndex === 0 ? 'disabled' : ''}>← Trước</button>
                <button type="button" class="btn btn-sm" id="btn-srs-flip" data-testid="srs-flip-btn">🔄 Lật thẻ</button>
                <button type="button" class="btn btn-sm" id="btn-srs-next" ${cardIndex >= cards.length - 1 ? 'disabled' : ''}>Bỏ qua →</button>
              </div>
            </div>
          </div>

          <div class="row" style="justify-content:center" data-testid="srs-rating-buttons">
            <button type="button" class="btn btn-danger" data-srs-rate="again" data-testid="srs-rate-again">Chưa nhớ · Again</button>
            <button type="button" class="btn" data-srs-rate="hard" data-testid="srs-rate-hard">Khó · Hard</button>
            <button type="button" class="btn btn-primary" data-srs-rate="good" data-testid="srs-rate-good">Nhớ · Good</button>
            <button type="button" class="btn btn-success" data-srs-rate="easy" data-testid="srs-rate-easy">Dễ · Easy</button>
          </div>
        `
        }
      </div>
    `;
  }

  function renderMistakesTab(mistakes) {
    if (mistakes.length === 0) {
      return `
        <div class="card stack-sm" style="text-align:center;padding:28px" data-testid="mistakes-empty-state">
          <strong>🎉 Ngân hàng câu sai đang trống!</strong>
          <p class="subtle" style="margin:0">Bạn chưa có câu hỏi nào cần ôn lại, hoặc đã sửa đúng hết rồi.</p>
        </div>
      `;
    }

    return `
      <div class="stack" data-testid="mistakes-list">
        ${mistakes
          .map((m) => {
            const q = m.question;
            const checked = Boolean(mistakeChecked[m.questionId]);
            return `
            <article class="card stack-sm" data-testid="mistake-item-${escapeHtml(m.questionId)}">
              <div class="row-between">
                <div class="row">
                  <span class="badge badge-${escapeHtml(m.language)}">${langShort(m.language)}</span>
                  <strong class="mono">${escapeHtml(m.lessonId)}</strong>
                  <span class="badge badge-warning">Sai ${m.wrongCount} lần</span>
                </div>
                <button type="button" class="btn btn-sm btn-primary" data-open-mistake-lesson="${escapeHtml(m.lessonId)}" data-testid="mistake-open-lesson-${escapeHtml(m.lessonId)}">
                  Ôn trong bài học &amp; Xóa lỗi →
                </button>
              </div>
              <div class="subtle">${formatBilingual(m.lessonTitle)}</div>
              ${
                q
                  ? `
                <div style="font-weight:600">${formatBilingual(q.prompt)}</div>
                ${q.targetText ? `<div class="card-subtle cjk-text" style="font-weight:700">${escapeHtml(q.targetText)}</div>` : ''}
                ${
                  q.type === 'sentence_order'
                    ? `
                  <div class="subtle">Nghĩa: ${formatBilingual(q.targetMeaning)}</div>
                  <div class="row">
                    <button type="button" class="btn btn-sm" data-check-mistake="${escapeHtml(m.questionId)}">
                      ${checked ? 'Ẩn đáp án' : 'Xem đáp án đúng'}
                    </button>
                  </div>
                  ${
                    checked
                      ? `<div class="card-subtle"><strong>Đáp án:</strong> <span class="cjk-text">${escapeHtml(q.correctSentence)}</span><br><span class="subtle">💡 ${formatBilingual(q.explanation)}</span></div>`
                      : ''
                  }
                `
                    : `
                  <div class="grid-2">
                    ${(q.options || [])
                      .map((opt, idx) => {
                        const sel = mistakePracticeAnswers[m.questionId] === idx;
                        let cls = '';
                        if (checked) {
                          if (idx === q.correctIndex) cls = 'is-correct';
                          else if (sel) cls = 'is-wrong';
                        } else if (sel) {
                          cls = 'is-selected';
                        }
                        return `
                        <button type="button" class="quiz-option cjk-text ${cls}" data-mistake-q="${escapeHtml(m.questionId)}" data-mistake-opt="${idx}">
                          ${escapeHtml(opt)}
                        </button>
                      `;
                      })
                      .join('')}
                  </div>
                  <div class="row">
                    <button type="button" class="btn btn-sm" data-check-mistake="${escapeHtml(m.questionId)}">
                      Kiểm tra tự luyện / Self-Check
                    </button>
                  </div>
                  ${
                    checked && q.explanation
                      ? `<div class="card-subtle subtle">💡 ${formatBilingual(q.explanation)}</div>`
                      : ''
                  }
                `
                }
              `
                  : '<p class="subtle">Câu hỏi không khả dụng.</p>'
              }
            </article>
          `;
          })
          .join('')}
      </div>
    `;
  }

  function bindEvents(cards, currentCard) {
    container.querySelector('#review-lang-filter')?.addEventListener('change', (e) => {
      filterLang = e.target.value;
      loadData();
    });

    container.querySelectorAll('[data-review-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-review-tab');
        render();
      });
    });

    container.querySelectorAll('[data-srs-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        reviewMode = btn.getAttribute('data-srs-mode');
        loadData();
      });
    });

    container.querySelector('#btn-srs-switch-all')?.addEventListener('click', () => {
      reviewMode = 'all';
      loadData();
    });

    container.querySelector('#btn-srs-go-catalog')?.addEventListener('click', () => {
      navigate('catalog');
    });

    container.querySelector('#srs-card-box')?.addEventListener('click', () => {
      cardFlipped = !cardFlipped;
      render();
    });

    container.querySelector('#btn-srs-flip')?.addEventListener('click', (e) => {
      e.stopPropagation();
      cardFlipped = !cardFlipped;
      render();
    });

    container.querySelector('#btn-srs-speak')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentCard) {
        speakCardText(currentCard.term, currentCard.language, container.querySelector('#srs-ph'));
      }
    });

    container.querySelector('#btn-srs-prev')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (cardIndex > 0) {
        cardIndex -= 1;
        cardFlipped = false;
        render();
      }
    });

    container.querySelector('#btn-srs-next')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (cardIndex < cards.length - 1) {
        cardIndex += 1;
        cardFlipped = false;
        render();
      }
    });

    container.querySelectorAll('[data-srs-rate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!currentCard) return;
        const rating = btn.getAttribute('data-srs-rate');
        try {
          const res = await api.reviewVocab(currentCard.id, rating);
          setState({ stats: res.stats, todayXp: res.todayXp });
          notify(`Đã ôn thẻ (${rating}): +${res.xpAwarded} XP`, 'success');

          if (reviewMode === 'due') {
            if (rating === 'again') {
              // Move card to end of active queue so learner sees it again
              const [moved] = cards.splice(cardIndex, 1);
              cards.push(moved);
            } else {
              cards.splice(cardIndex, 1);
              srsData.dueCount = Math.max(0, (srsData.dueCount || 1) - 1);
            }
            if (cardIndex >= cards.length) cardIndex = 0;
          } else {
            cardIndex = cardIndex < cards.length - 1 ? cardIndex + 1 : 0;
          }
          cardFlipped = false;
          render();
        } catch (err) {
          notify(err.message || 'Lỗi lưu ôn tập SRS', 'error');
        }
      });
    });

    // Mistake Bank events
    container.querySelectorAll('[data-mistake-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qId = btn.getAttribute('data-mistake-q');
        const optIdx = Number(btn.getAttribute('data-mistake-opt'));
        mistakePracticeAnswers[qId] = optIdx;
        render();
      });
    });

    container.querySelectorAll('[data-check-mistake]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qId = btn.getAttribute('data-check-mistake');
        mistakeChecked[qId] = !mistakeChecked[qId];
        render();
      });
    });

    container.querySelectorAll('[data-open-mistake-lesson]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lessonId = btn.getAttribute('data-open-mistake-lesson');
        navigate('lesson', { lessonId, lessonTab: 'practice' });
      });
    });
  }

  await loadData();
}
