import { api } from '../api.js';
import {
  escapeHtml,
  formatBilingual,
  renderRubyText,
  stripRubyBrackets
} from '../ruby.js';
import { getState, notify, setState, updateStudyPrefs } from '../state.js';
import { speakDialogueSequence, speakText, stopSpeaking } from '../tts.js';

export async function renderLessonView(container, { lessonId, initialTab = 'vocab', navigate }) {
  stopSpeaking();
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Đang tải bài học… / Loading lesson…</p></div>`;

  let payload;
  let userGroups = [];
  try {
    const [lessonRes, groupsRes] = await Promise.all([
      api.getLesson(lessonId),
      api.getGroups().catch(() => ({ groups: [] }))
    ]);
    payload = lessonRes;
    userGroups = groupsRes?.groups || [];
  } catch (err) {
    container.innerHTML = `
      <div class="stack">
        <div class="error-banner">${escapeHtml(err.message)}</div>
        <button type="button" class="btn" id="btn-back-err">← Quay lại khóa học</button>
      </div>
    `;
    container.querySelector('#btn-back-err')?.addEventListener('click', () => navigate('catalog'));
    return;
  }

  const { lesson, level } = payload;
  let progress = payload.progress || {};
  const vocabSrs = payload.vocabSrs || {};
  const lang = level?.language || lessonId.split('-')[0] || 'en';

  let activeTab = initialTab || 'vocab';
  let ttsFallbackVisible = false;
  let activeDialogueIdx = -1;
  let isPlayingDialogue = false;

  // Flashcard deck state
  let deckIdx = 0;
  let cardFlipped = false;
  const vocabList = Array.isArray(lesson.vocabulary) ? lesson.vocabulary : [];

  // Dynamic 4-pair Vocab Match state
  let matchRound = createMatchRound(vocabList);
  let selectedTermId = null;
  let wrongPairIds = null;

  // Quiz state
  const quizzes = Array.isArray(lesson.quizzes) ? lesson.quizzes : [];
  let quizAnswers = {}; // { [qId]: number (for MCQ) | number[] (token indices for sentence_order) }
  let quizResult = null;
  let retryQuestionIds = null; // null = full quiz, Set<string> = retry missed only
  let isSubmittingQuiz = false;
  let shareChoice = getState().user?.autoShareMilestones ? 'auto' : 'none';

  function createMatchRound(items) {
    const shuffled = items.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(4, items.length));
    const rightOptions = shuffled.slice().sort(() => Math.random() - 0.5);
    return {
      left: shuffled,
      right: rightOptions,
      matchedIds: new Set()
    };
  }

  function triggerSpeak(text, highlightTargetEl = null) {
    const speed = getState().studyPrefs.ttsSpeed || 1.0;
    const clean = stripRubyBrackets(text);
    speakText(clean, lang, {
      rate: speed,
      onFallback: () => {
        if (!ttsFallbackVisible) {
          ttsFallbackVisible = true;
          const badge = container.querySelector('[data-testid="tts-fallback-badge"]');
          if (badge) badge.hidden = false;
        }
        if (highlightTargetEl) {
          highlightTargetEl.classList.add('tts-highlight');
          setTimeout(() => highlightTargetEl.classList.remove('tts-highlight'), 1100);
        }
      }
    });
  }

  function render() {
    const prefs = getState().studyPrefs;
    const workspaceClasses = [
      'stack',
      prefs.showPhonetics ? '' : 'hide-phonetics',
      prefs.showTranslations ? '' : 'hide-translations'
    ]
      .filter(Boolean)
      .join(' ');

    container.innerHTML = `
      <div class="${workspaceClasses}" data-testid="lesson-view">
        <div class="card stack-sm">
          <div class="row-between">
            <div class="row">
              <button type="button" class="btn btn-sm" id="btn-lesson-back" data-testid="lesson-back-btn">
                ← Lộ trình / Catalog
              </button>
              <span class="badge badge-${escapeHtml(lang)}">${escapeHtml(level?.code || lang.toUpperCase())} · Bài ${lesson.order}</span>
              ${
                progress.status === 'completed'
                  ? `<span class="badge badge-success">✓ Đã hoàn thành · Best ${progress.bestScore}%</span>`
                  : `<span class="badge">+${lesson.xpReward || 50} XP</span>`
              }
            </div>
            <div class="subtle">Chủ đề: ${escapeHtml(lesson.topic || '')}</div>
          </div>

          <h1 class="cjk-text" style="margin:4px 0 0;font-size:1.5rem">${escapeHtml(lesson.title?.native || lesson.id)}</h1>
          <div class="muted translation-text">${formatBilingual(lesson.title)} — ${formatBilingual(lesson.summary)}</div>

          <div class="row-between" style="padding-top:8px;border-top:1px solid var(--border)" data-testid="lesson-toggles">
            <div class="row">
              <button type="button" class="btn btn-sm ${prefs.showPhonetics ? 'btn-primary' : ''}" id="btn-toggle-phonetics" data-testid="toggle-phonetics">
                Phiên âm / Furigana / Pinyin: <strong>${prefs.showPhonetics ? 'ON' : 'OFF'}</strong>
              </button>
              <button type="button" class="btn btn-sm ${prefs.showTranslations ? 'btn-primary' : ''}" id="btn-toggle-translations" data-testid="toggle-translations">
                Dịch nghĩa / Translations: <strong>${prefs.showTranslations ? 'ON' : 'OFF'}</strong>
              </button>
              <button type="button" class="btn btn-sm" id="btn-toggle-speed" data-testid="toggle-tts-speed">
                Tốc độ đọc / Speed: <strong>${prefs.ttsSpeed}x</strong>
              </button>
            </div>
            <span class="badge badge-warning" data-testid="tts-fallback-badge" ${ttsFallbackVisible ? '' : 'hidden'}>
              Voice pack unavailable — using phonetic guide
            </span>
          </div>
        </div>

        <div class="tabs" role="tablist" aria-label="Lesson Activities">
          <button type="button" class="tab-btn ${activeTab === 'vocab' ? 'is-active' : ''}" data-lesson-tab="vocab" data-testid="lesson-tab-vocab">
            1. Từ vựng / Vocabulary (${vocabList.length})
          </button>
          <button type="button" class="tab-btn ${activeTab === 'grammar' ? 'is-active' : ''}" data-lesson-tab="grammar" data-testid="lesson-tab-grammar">
            2. Ngữ pháp / Grammar (${(lesson.grammar || []).length})
          </button>
          <button type="button" class="tab-btn ${activeTab === 'dialogue' ? 'is-active' : ''}" data-lesson-tab="dialogue" data-testid="lesson-tab-dialogue">
            3. Hội thoại &amp; Đọc / Dialogue
          </button>
          <button type="button" class="tab-btn ${activeTab === 'practice' ? 'is-active' : ''}" data-lesson-tab="practice" data-testid="lesson-tab-practice">
            4. Luyện tập &amp; Quiz / Practice
          </button>
        </div>

        <div id="lesson-tab-content">
          ${
            activeTab === 'vocab'
              ? renderVocabTab(prefs)
              : activeTab === 'grammar'
                ? renderGrammarTab(prefs)
                : activeTab === 'dialogue'
                  ? renderDialogueTab(prefs)
                  : renderPracticeTab(prefs)
          }
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderVocabTab(prefs) {
    return `
      <div class="grid-2" data-testid="lesson-vocab-panel">
        ${vocabList
          .map((v) => {
            const srs = vocabSrs[v.id];
            const phoneticText = [v.reading, v.romaji].filter(Boolean).join(' · ');
            return `
            <article class="card stack-sm" data-testid="vocab-card-${escapeHtml(v.id)}">
              <div class="row-between">
                <span class="badge">${escapeHtml(v.partOfSpeech || 'word')}</span>
                <div class="row">
                  ${srs ? `<span class="badge badge-primary">SRS Lv.${srs.masteryLevel}</span>` : ''}
                  <button type="button" class="btn btn-sm btn-tts" data-speak-text="${escapeHtml(v.term)}" data-highlight-id="ph-${escapeHtml(v.id)}" data-testid="vocab-tts-${escapeHtml(v.id)}">
                    🔊 Nghe
                  </button>
                </div>
              </div>

              <div class="vocab-term cjk-text">${renderRubyText(v.rubyText, v.term, prefs.showPhonetics)}</div>
              <div id="ph-${escapeHtml(v.id)}" class="phonetic-box phonetic-text">${escapeHtml(phoneticText)}</div>
              <div class="translation-text"><strong>${formatBilingual(v.meaning)}</strong></div>

              ${
                v.example
                  ? `
                <div class="card-subtle stack-sm" style="gap:4px">
                  <div class="row-between">
                    <span class="subtle">Ví dụ / Example</span>
                    <button type="button" class="btn btn-sm btn-ghost" data-speak-text="${escapeHtml(v.example.text)}" data-highlight-id="exph-${escapeHtml(v.id)}" data-testid="vocab-example-tts-${escapeHtml(v.id)}">
                      🔊
                    </button>
                  </div>
                  <div class="cjk-text">${renderRubyText(v.example.rubyText, v.example.text, prefs.showPhonetics)}</div>
                  <div id="exph-${escapeHtml(v.id)}" class="subtle phonetic-text">${escapeHtml(v.example.reading || '')}</div>
                  <div class="subtle translation-text">${formatBilingual(v.example.meaning)}</div>
                </div>
              `
                  : ''
              }

              ${
                v.note
                  ? `<div class="subtle translation-text">💡 ${formatBilingual(v.note)}</div>`
                  : ''
              }
            </article>
          `;
          })
          .join('')}
      </div>
    `;
  }

  function renderGrammarTab(prefs) {
    const grammarList = Array.isArray(lesson.grammar) ? lesson.grammar : [];
    return `
      <div class="stack" data-testid="lesson-grammar-panel">
        ${grammarList
          .map(
            (g) => `
          <article class="card stack-sm" data-testid="grammar-card-${escapeHtml(g.id)}">
            <div class="row-between">
              <span class="badge badge-${escapeHtml(lang)}">${escapeHtml(g.pattern)}</span>
              <span class="subtle">${formatBilingual(g.title)}</span>
            </div>
            <div class="card-subtle mono" style="font-weight:700">${escapeHtml(g.structure)}</div>
            <div class="translation-text">${formatBilingual(g.explanation)}</div>
            ${
              g.usageNote
                ? `<div class="card-subtle translation-text"><strong>Lưu ý sử dụng / Usage:</strong> ${formatBilingual(g.usageNote)}</div>`
                : ''
            }
            <div class="stack-sm">
              <strong style="font-size:0.9rem">Ví dụ minh họa / Examples:</strong>
              ${(g.examples || [])
                .map(
                  (ex, idx) => `
                <div class="card-subtle row-between">
                  <div>
                    <div class="cjk-text" style="font-weight:600">${renderRubyText(ex.rubyText, ex.text, prefs.showPhonetics)}</div>
                    <div id="gph-${escapeHtml(g.id)}-${idx}" class="subtle phonetic-text">${escapeHtml(ex.reading || '')}</div>
                    <div class="subtle translation-text">${formatBilingual(ex.meaning)}</div>
                  </div>
                  <button type="button" class="btn btn-sm btn-tts" data-speak-text="${escapeHtml(ex.text)}" data-highlight-id="gph-${escapeHtml(g.id)}-${idx}">🔊</button>
                </div>
              `
                )
                .join('')}
            </div>
          </article>
        `
          )
          .join('')}
      </div>
    `;
  }

  function renderDialogueTab(prefs) {
    const dlg = lesson.dialogue;
    if (!dlg) return '<div class="card"><p class="muted">Không có hội thoại cho bài học này.</p></div>';
    const lines = Array.isArray(dlg.lines) ? dlg.lines : [];

    return `
      <div class="card stack" data-testid="lesson-dialogue-panel">
        <div class="row-between">
          <div>
            <span class="badge badge-primary">${dlg.mode === 'reading' ? 'Bài đọc / Reading' : 'Hội thoại / Dialogue'}</span>
            <h2 style="margin:6px 0 2px;font-size:1.2rem">${formatBilingual(dlg.title)}</h2>
            <p class="subtle translation-text" style="margin:0">${formatBilingual(dlg.context)}</p>
          </div>
          <div class="row">
            <button type="button" class="btn btn-primary btn-sm" id="btn-dialogue-play-all" ${isPlayingDialogue ? 'disabled' : ''} data-testid="dialogue-play-all">
              ▶ Nghe toàn bộ / Play Full
            </button>
            <button type="button" class="btn btn-sm" id="btn-dialogue-stop" ${isPlayingDialogue ? '' : 'hidden'} data-testid="dialogue-stop">
              ⏹ Dừng / Stop
            </button>
          </div>
        </div>

        <div class="stack-sm">
          ${lines
            .map(
              (line, idx) => `
            <div class="dialogue-line ${activeDialogueIdx === idx ? 'is-speaking' : ''}" data-dialogue-idx="${idx}" data-testid="dialogue-line-${idx}">
              <div class="row-between">
                <strong>${escapeHtml(line.speaker)}</strong>
                <button type="button" class="btn btn-sm btn-tts" data-speak-text="${escapeHtml(line.text)}" data-highlight-id="dph-${idx}" data-testid="dialogue-line-tts-${idx}">
                  🔊 Nghe câu
                </button>
              </div>
              <div class="cjk-text" style="font-size:1.15rem;margin-top:4px">${renderRubyText(line.rubyText, line.text, prefs.showPhonetics)}</div>
              <div id="dph-${idx}" class="subtle phonetic-text" style="margin-top:2px">${escapeHtml(line.reading || '')}</div>
              <div class="muted translation-text" style="margin-top:4px">${formatBilingual(line.meaning)}</div>
            </div>
          `
            )
            .join('')}
        </div>

        ${
          dlg.culturalNote
            ? `
          <div class="card-subtle translation-text">
            <strong>🌏 Ghi chú văn hóa / Cultural Note:</strong> ${formatBilingual(dlg.culturalNote)}
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  function renderPracticeTab(prefs) {
    const currentCard = vocabList[deckIdx] || null;
    const allMatched = matchRound.left.length > 0 && matchRound.matchedIds.size === matchRound.left.length;
    const questionsToRender = retryQuestionIds
      ? quizzes.filter((q) => retryQuestionIds.has(q.id))
      : quizzes;

    return `
      <div class="stack" data-testid="lesson-practice-panel">
        <!-- 1. Interactive Flashcard Flip Deck -->
        <section class="card stack-sm" data-testid="lesson-flashcards">
          <div class="row-between">
            <h2 class="section-title" style="margin:0">Thẻ ghi nhớ / Flashcard Deck (${vocabList.length ? deckIdx + 1 : 0}/${vocabList.length})</h2>
            <span class="subtle">Phím tắt: <kbd>Space</kbd> lật thẻ · <kbd>R</kbd> phát âm</span>
          </div>

          ${
            currentCard
              ? `
            <div class="flashcard-wrap">
              <div class="flashcard ${cardFlipped ? 'is-flipped' : ''}" id="lesson-flashcard-box" tabindex="0" role="button" aria-label="Flip flashcard" data-testid="flashcard-card">
                <div class="row-between">
                  <span class="badge">${escapeHtml(currentCard.partOfSpeech || 'vocab')}</span>
                  <button type="button" class="btn btn-sm btn-tts" id="btn-fc-speak" data-testid="flashcard-tts">🔊 Phát âm (R)</button>
                </div>

                ${
                  !cardFlipped
                    ? `
                  <div class="stack-sm" style="align-items:center;text-align:center;margin:14px 0">
                    <div class="flashcard-term cjk-text">${renderRubyText(currentCard.rubyText, currentCard.term, prefs.showPhonetics)}</div>
                    <div id="fc-ph" class="phonetic-box phonetic-text">${escapeHtml([currentCard.reading, currentCard.romaji].filter(Boolean).join(' · '))}</div>
                    <span class="subtle">Nhấn vào thẻ hoặc Space để xem nghĩa</span>
                  </div>
                `
                    : `
                  <div class="stack-sm" style="margin:6px 0">
                    <div style="text-align:center">
                      <strong class="cjk-text" style="font-size:1.35rem">${escapeHtml(currentCard.term)}</strong>
                      <div id="fc-ph" class="subtle phonetic-text">${escapeHtml([currentCard.reading, currentCard.romaji].filter(Boolean).join(' · '))}</div>
                      <div style="font-size:1.1rem;margin-top:6px"><strong>${formatBilingual(currentCard.meaning)}</strong></div>
                    </div>
                    ${
                      currentCard.example
                        ? `
                      <div class="card-subtle stack-sm" style="gap:3px">
                        <div class="cjk-text">${renderRubyText(currentCard.example.rubyText, currentCard.example.text, prefs.showPhonetics)}</div>
                        <div class="subtle phonetic-text">${escapeHtml(currentCard.example.reading || '')}</div>
                        <div class="subtle">${formatBilingual(currentCard.example.meaning)}</div>
                      </div>
                    `
                        : ''
                    }
                  </div>
                `
                }

                <div class="row-between" onclick="event.stopPropagation()">
                  <button type="button" class="btn btn-sm" id="btn-fc-prev" ${deckIdx === 0 ? 'disabled' : ''}>← Trước</button>
                  <button type="button" class="btn btn-sm" id="btn-fc-flip" data-testid="flashcard-flip-btn">🔄 Lật thẻ</button>
                  <button type="button" class="btn btn-sm" id="btn-fc-next" ${deckIdx >= vocabList.length - 1 ? 'disabled' : ''}>Tiếp →</button>
                </div>
              </div>
            </div>

            <div class="row" style="justify-content:center" data-testid="flashcard-srs-actions">
              <span class="subtle">Đánh giá SRS nhanh:</span>
              <button type="button" class="btn btn-sm btn-danger" data-fc-rate="again" data-testid="fc-rate-again">Chưa nhớ (Again)</button>
              <button type="button" class="btn btn-sm" data-fc-rate="hard" data-testid="fc-rate-hard">Hơi khó (Hard)</button>
              <button type="button" class="btn btn-sm btn-primary" data-fc-rate="good" data-testid="fc-rate-good">Nhớ tốt (Good)</button>
              <button type="button" class="btn btn-sm btn-success" data-fc-rate="easy" data-testid="fc-rate-easy">Rất dễ (Easy)</button>
            </div>
          `
              : '<p class="muted">Không có thẻ từ vựng.</p>'
          }
        </section>

        <!-- 2. Dynamic 4-Pair Vocab Match Mini-Round -->
        <section class="card stack-sm" data-testid="vocab-match-game">
          <div class="row-between">
            <div>
              <h2 class="section-title" style="margin:0">Ghép cặp từ vựng / 4-Pair Vocab Match</h2>
              <span class="subtle">Chọn 1 từ bên trái rồi ghép với nghĩa đúng bên phải (${matchRound.matchedIds.size}/${matchRound.left.length})</span>
            </div>
            <button type="button" class="btn btn-sm" id="btn-match-shuffle" data-testid="match-shuffle-btn">🔀 Vòng mới / New Round</button>
          </div>

          ${
            allMatched
              ? `<div class="badge badge-success" style="padding:10px 14px;font-size:0.95rem">🎉 Tuyệt vời! Bạn đã ghép đúng tất cả ${matchRound.left.length} cặp từ!</div>`
              : `
            <div class="match-grid">
              <div class="match-col">
                ${matchRound.left
                  .map((v) => {
                    const isMatched = matchRound.matchedIds.has(v.id);
                    const isSel = selectedTermId === v.id;
                    const isWrong = wrongPairIds && wrongPairIds.termId === v.id;
                    return `
                    <button type="button"
                      class="match-btn cjk-text ${isMatched ? 'is-matched' : ''} ${isSel ? 'is-selected' : ''} ${isWrong ? 'is-wrong' : ''}"
                      data-match-term="${escapeHtml(v.id)}"
                      ${isMatched ? 'disabled' : ''}>
                      ${escapeHtml(v.term)}
                      <span class="subtle phonetic-text" style="font-weight:400;margin-left:6px">${escapeHtml(v.reading || '')}</span>
                    </button>
                  `;
                  })
                  .join('')}
              </div>
              <div class="match-col">
                ${matchRound.right
                  .map((v) => {
                    const isMatched = matchRound.matchedIds.has(v.id);
                    const isWrong = wrongPairIds && wrongPairIds.meaningId === v.id;
                    return `
                    <button type="button"
                      class="match-btn ${isMatched ? 'is-matched' : ''} ${isWrong ? 'is-wrong' : ''}"
                      data-match-meaning="${escapeHtml(v.id)}"
                      ${isMatched ? 'disabled' : ''}>
                      ${formatBilingual(v.meaning)}
                    </button>
                  `;
                  })
                  .join('')}
              </div>
            </div>
          `
          }
        </section>

        <!-- 3. 4-Mode Quiz -->
        <section class="card stack" data-testid="lesson-quiz-section">
          <div class="row-between">
            <div>
              <h2 class="section-title" style="margin:0">
                ${retryQuestionIds ? 'Làm lại câu sai / Retry Mistakes' : `Bài kiểm tra kiến thức / Lesson Quiz (${quizzes.length} câu)`}
              </h2>
              <span class="subtle">Đạt từ 70% trở lên để hoàn thành bài học và nhận XP.</span>
            </div>
            ${
              retryQuestionIds
                ? `<button type="button" class="btn btn-sm" id="btn-show-full-quiz">Hiện toàn bộ quiz</button>`
                : ''
            }
          </div>

          <div class="stack">
            ${questionsToRender
              .map((q, qIdx) => {
                const graded = quizResult?.grading?.results?.find((r) => r.questionId === q.id);
                return renderQuizQuestion(q, qIdx, prefs, graded);
              })
              .join('')}
          </div>

          <div class="row-between" style="padding-top:8px;border-top:1px solid var(--border)">
            <div class="row">
              <label for="quiz-share-select" class="subtle">Chia sẻ khi đạt:</label>
              <select id="quiz-share-select" class="select" style="width:auto" data-testid="quiz-share-select">
                <option value="auto" ${shareChoice === 'auto' ? 'selected' : ''}>Tự động theo cài đặt / Auto</option>
                <option value="friends" ${shareChoice === 'friends' ? 'selected' : ''}>Chia sẻ lên bảng tin bạn bè</option>
                ${userGroups
                  .map(
                    (g) =>
                      `<option value="group:${g.id}" ${shareChoice === `group:${g.id}` ? 'selected' : ''}>Nhóm: ${escapeHtml(g.name)}</option>`
                  )
                  .join('')}
                <option value="none" ${shareChoice === 'none' ? 'selected' : ''}>Không chia sẻ / Private</option>
              </select>
            </div>

            <button type="button" class="btn btn-primary" id="btn-submit-quiz" ${isSubmittingQuiz ? 'disabled' : ''} data-testid="quiz-submit-btn">
              ${isSubmittingQuiz ? 'Đang chấm điểm…' : 'Nộp bài &amp; Chấm điểm / Submit Quiz'}
            </button>
          </div>

          ${quizResult ? renderQuizResultPanel(quizResult) : ''}
        </section>
      </div>
    `;
  }

  function renderQuizQuestion(q, idx, prefs, graded) {
    const typeLabel =
      q.type === 'sentence_order'
        ? 'Sắp xếp câu / Sentence Order'
        : q.type === 'fill_blank'
          ? 'Điền chỗ trống / Fill in Blank'
          : q.type === 'reading_match'
            ? 'Đọc &amp; Chọn / Reading Match'
            : 'Trắc nghiệm / Multiple Choice';

    let bodyHtml = '';

    if (q.type === 'sentence_order') {
      const selectedIndices = Array.isArray(quizAnswers[q.id]) ? quizAnswers[q.id] : [];
      const usedSet = new Set(selectedIndices);
      const tokens = Array.isArray(q.tokens) ? q.tokens : [];

      bodyHtml = `
        <div class="subtle">Nghĩa câu cần ghép: <strong>${formatBilingual(q.targetMeaning)}</strong></div>
        <div class="stack-sm">
          <div class="row-between">
            <span class="subtle">Câu của bạn / Your sentence:</span>
            <button type="button" class="btn btn-sm btn-ghost" data-clear-order="${escapeHtml(q.id)}">Xóa chọn</button>
          </div>
          <div class="chip-zone" data-testid="quiz-order-answer-${escapeHtml(q.id)}">
            ${
              selectedIndices.length === 0
                ? `<span class="subtle">Nhấn vào các mảnh từ bên dưới theo đúng thứ tự…</span>`
                : selectedIndices
                    .map(
                      (tokIdx, pos) => `
                    <button type="button" class="word-chip is-placed cjk-text" data-remove-order-q="${escapeHtml(q.id)}" data-remove-order-pos="${pos}">
                      ${escapeHtml(tokens[tokIdx])} ✕
                    </button>
                  `
                    )
                    .join('')
            }
          </div>
          <div class="row" data-testid="quiz-order-bank-${escapeHtml(q.id)}">
            ${tokens
              .map((tok, tokIdx) => {
                if (usedSet.has(tokIdx)) return '';
                return `
                  <button type="button" class="word-chip cjk-text" data-add-order-q="${escapeHtml(q.id)}" data-add-order-idx="${tokIdx}" data-testid="quiz-order-chip-${escapeHtml(q.id)}-${tokIdx}">
                    ${escapeHtml(tok)}
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    } else {
      const selectedIdx = quizAnswers[q.id];
      const options = Array.isArray(q.options) ? q.options : [];
      bodyHtml = `
        ${
          q.targetText
            ? `
          <div class="card-subtle row-between">
            <div>
              <div class="cjk-text" style="font-size:1.2rem;font-weight:700">${escapeHtml(q.targetText)}</div>
              ${
                q.targetReading
                  ? `<div class="subtle phonetic-text">${escapeHtml(q.targetReading)}</div>`
                  : ''
              }
            </div>
            ${
              q.ttsText || q.targetText
                ? `<button type="button" class="btn btn-sm btn-tts" data-speak-text="${escapeHtml(q.ttsText || q.targetText)}">🔊</button>`
                : ''
            }
          </div>
        `
            : ''
        }
        <div class="grid-2">
          ${options
            .map((opt, optIdx) => {
              const isSelected = selectedIdx === optIdx;
              let statusCls = '';
              if (graded) {
                if (optIdx === graded.correctIndex) statusCls = 'is-correct';
                else if (isSelected && !graded.isCorrect) statusCls = 'is-wrong';
              } else if (isSelected) {
                statusCls = 'is-selected';
              }
              return `
              <button type="button"
                class="quiz-option cjk-text ${statusCls}"
                data-quiz-q="${escapeHtml(q.id)}"
                data-quiz-opt="${optIdx}"
                data-testid="quiz-option-${escapeHtml(q.id)}-${optIdx}">
                ${escapeHtml(opt)}
              </button>
            `;
            })
            .join('')}
        </div>
      `;
    }

    return `
      <div class="card-subtle stack-sm" data-testid="quiz-question-${escapeHtml(q.id)}">
        <div class="row-between">
          <span class="badge">Câu ${idx + 1} · ${typeLabel}</span>
          ${
            graded
              ? graded.isCorrect
                ? `<span class="badge badge-success">✓ Đúng / Correct</span>`
                : `<span class="badge badge-warning">✕ Chưa đúng / Incorrect</span>`
              : ''
          }
        </div>
        <div style="font-weight:600">${formatBilingual(q.prompt)}</div>
        ${bodyHtml}
        ${
          graded
            ? `
          <div class="card" style="padding:10px 12px;border-color:${graded.isCorrect ? '#a7f3d0' : '#fecaca'}">
            ${
              !graded.isCorrect
                ? `<div class="subtle"><strong>Đáp án đúng / Answer:</strong> <span class="cjk-text">${escapeHtml(graded.correctSentence || (Array.isArray(graded.correctAnswer) ? graded.correctAnswer.join(' ') : graded.correctAnswer || ''))}</span></div>`
                : ''
            }
            ${graded.explanation ? `<div class="subtle">💡 ${formatBilingual(graded.explanation)}</div>` : ''}
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  function renderQuizResultPanel(res) {
    const failedCount = (res.grading?.results || []).filter((r) => !r.isCorrect).length;
    return `
      <div class="card stack-sm" style="border-width:2px;border-color:${res.passed ? 'var(--success)' : 'var(--warning)'}" data-testid="quiz-result-panel">
        <div class="row-between">
          <h3 style="margin:0;font-size:1.2rem">
            ${res.passed ? '🎉 Chúc mừng! Bạn đã đạt bài học!' : '💪 Cố lên! Bạn cần đạt ≥ 70% để hoàn thành bài.'}
          </h3>
          <span class="badge ${res.passed ? 'badge-success' : 'badge-warning'}" style="font-size:0.95rem">
            ${res.grading.score}% (${res.grading.correctCount}/${res.grading.totalQuestions})
          </span>
        </div>

        <div class="row">
          <span class="badge badge-primary">Nhận thưởng: +${res.xpAwarded} XP</span>
          ${res.isFirstCompletion ? '<span class="badge badge-success">+20 XP Hoàn thành lần đầu!</span>' : ''}
          ${res.autoSharedPost ? '<span class="badge badge-primary">📢 Đã chia sẻ thành tích lên bảng tin!</span>' : ''}
        </div>

        <div class="row">
          ${
            failedCount > 0
              ? `<button type="button" class="btn btn-primary btn-sm" id="btn-retry-mistakes" data-testid="quiz-retry-mistakes-btn">Làm lại ${failedCount} câu sai / Retry Mistakes</button>`
              : ''
          }
          <button type="button" class="btn btn-sm" id="btn-retake-full" data-testid="quiz-retake-btn">Làm lại toàn bộ / Retake Full Quiz</button>
          <button type="button" class="btn btn-sm" id="btn-result-catalog">← Về danh sách bài học</button>
        </div>
      </div>
    `;
  }

  function bindEvents() {
    container.querySelector('#btn-lesson-back')?.addEventListener('click', () => {
      stopSpeaking();
      navigate('catalog');
    });

    container.querySelector('#btn-toggle-phonetics')?.addEventListener('click', () => {
      updateStudyPrefs({ showPhonetics: !getState().studyPrefs.showPhonetics });
      render();
    });

    container.querySelector('#btn-toggle-translations')?.addEventListener('click', () => {
      updateStudyPrefs({ showTranslations: !getState().studyPrefs.showTranslations });
      render();
    });

    container.querySelector('#btn-toggle-speed')?.addEventListener('click', () => {
      const next = getState().studyPrefs.ttsSpeed === 0.75 ? 1.0 : 0.75;
      updateStudyPrefs({ ttsSpeed: next });
      render();
    });

    container.querySelectorAll('[data-lesson-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        stopSpeaking();
        isPlayingDialogue = false;
        activeDialogueIdx = -1;
        activeTab = btn.getAttribute('data-lesson-tab');
        render();
      });
    });

    container.querySelectorAll('[data-speak-text]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = btn.getAttribute('data-speak-text');
        const hiId = btn.getAttribute('data-highlight-id');
        const hiEl = hiId ? container.querySelector(`#${CSS.escape(hiId)}`) : null;
        triggerSpeak(text, hiEl);
      });
    });

    // Dialogue sequential TTS
    container.querySelector('#btn-dialogue-play-all')?.addEventListener('click', () => {
      const lines = lesson.dialogue?.lines || [];
      if (!lines.length) return;
      isPlayingDialogue = true;
      activeDialogueIdx = 0;
      render();
      speakDialogueSequence(lines, lang, {
        rate: getState().studyPrefs.ttsSpeed || 1.0,
        onLineStart: (idx) => {
          activeDialogueIdx = idx;
          container.querySelectorAll('[data-dialogue-idx]').forEach((el) => {
            el.classList.toggle('is-speaking', Number(el.getAttribute('data-dialogue-idx')) === idx);
          });
        },
        onFallback: () => {
          ttsFallbackVisible = true;
          const badge = container.querySelector('[data-testid="tts-fallback-badge"]');
          if (badge) badge.hidden = false;
        },
        onDone: () => {
          isPlayingDialogue = false;
          activeDialogueIdx = -1;
          render();
        }
      });
    });

    container.querySelector('#btn-dialogue-stop')?.addEventListener('click', () => {
      stopSpeaking();
      isPlayingDialogue = false;
      activeDialogueIdx = -1;
      render();
    });

    // Flashcard events
    const fcBox = container.querySelector('#lesson-flashcard-box');
    fcBox?.addEventListener('click', () => {
      cardFlipped = !cardFlipped;
      render();
    });

    fcBox?.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        cardFlipped = !cardFlipped;
        render();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        const card = vocabList[deckIdx];
        if (card) triggerSpeak(card.term, container.querySelector('#fc-ph'));
      }
    });

    container.querySelector('#btn-fc-flip')?.addEventListener('click', (e) => {
      e.stopPropagation();
      cardFlipped = !cardFlipped;
      render();
    });

    container.querySelector('#btn-fc-speak')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = vocabList[deckIdx];
      if (card) triggerSpeak(card.term, container.querySelector('#fc-ph'));
    });

    container.querySelector('#btn-fc-prev')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (deckIdx > 0) {
        deckIdx -= 1;
        cardFlipped = false;
        render();
      }
    });

    container.querySelector('#btn-fc-next')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (deckIdx < vocabList.length - 1) {
        deckIdx += 1;
        cardFlipped = false;
        render();
      }
    });

    container.querySelectorAll('[data-fc-rate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = vocabList[deckIdx];
        if (!card) return;
        const rating = btn.getAttribute('data-fc-rate');
        try {
          const res = await api.reviewVocab(card.id, rating);
          vocabSrs[card.id] = res.srs;
          setState({ stats: res.stats, todayXp: res.todayXp });
          notify(`Đã lưu SRS (${rating}): +${res.xpAwarded} XP`, 'success');
          if (deckIdx < vocabList.length - 1) {
            deckIdx += 1;
          }
          cardFlipped = false;
          render();
        } catch (err) {
          notify(err.message || 'Không thể lưu đánh giá', 'error');
        }
      });
    });

    // Vocab match mini-round
    container.querySelector('#btn-match-shuffle')?.addEventListener('click', () => {
      matchRound = createMatchRound(vocabList);
      selectedTermId = null;
      wrongPairIds = null;
      render();
    });

    container.querySelectorAll('[data-match-term]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedTermId = btn.getAttribute('data-match-term');
        wrongPairIds = null;
        render();
      });
    });

    container.querySelectorAll('[data-match-meaning]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!selectedTermId) return;
        const meaningId = btn.getAttribute('data-match-meaning');
        if (selectedTermId === meaningId) {
          matchRound.matchedIds.add(selectedTermId);
          const matchedItem = matchRound.left.find((v) => v.id === selectedTermId);
          if (matchedItem) triggerSpeak(matchedItem.term);
          selectedTermId = null;
          wrongPairIds = null;
          render();
        } else {
          wrongPairIds = { termId: selectedTermId, meaningId };
          selectedTermId = null;
          render();
          setTimeout(() => {
            wrongPairIds = null;
            render();
          }, 550);
        }
      });
    });

    // Quiz MCQ & sentence order
    container.querySelectorAll('[data-quiz-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qId = btn.getAttribute('data-quiz-q');
        const optIdx = Number(btn.getAttribute('data-quiz-opt'));
        quizAnswers[qId] = optIdx;
        render();
      });
    });

    container.querySelectorAll('[data-add-order-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qId = btn.getAttribute('data-add-order-q');
        const tokIdx = Number(btn.getAttribute('data-add-order-idx'));
        const cur = Array.isArray(quizAnswers[qId]) ? quizAnswers[qId].slice() : [];
        if (!cur.includes(tokIdx)) {
          cur.push(tokIdx);
          quizAnswers[qId] = cur;
          render();
        }
      });
    });

    container.querySelectorAll('[data-remove-order-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qId = btn.getAttribute('data-remove-order-q');
        const pos = Number(btn.getAttribute('data-remove-order-pos'));
        const cur = Array.isArray(quizAnswers[qId]) ? quizAnswers[qId].slice() : [];
        cur.splice(pos, 1);
        quizAnswers[qId] = cur;
        render();
      });
    });

    container.querySelectorAll('[data-clear-order]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qId = btn.getAttribute('data-clear-order');
        quizAnswers[qId] = [];
        render();
      });
    });

    container.querySelector('#quiz-share-select')?.addEventListener('change', (e) => {
      shareChoice = e.target.value;
    });

    container.querySelector('#btn-submit-quiz')?.addEventListener('click', async () => {
      const formattedAnswers = {};
      for (const q of quizzes) {
        if (q.type === 'sentence_order') {
          const indices = Array.isArray(quizAnswers[q.id]) ? quizAnswers[q.id] : [];
          formattedAnswers[q.id] = indices.map((i) => q.tokens[i]);
        } else {
          formattedAnswers[q.id] = quizAnswers[q.id] !== undefined ? quizAnswers[q.id] : null;
        }
      }

      const payloadBody = { answers: formattedAnswers };
      if (shareChoice === 'none') {
        payloadBody.shareToFeed = false;
      } else if (shareChoice === 'friends') {
        payloadBody.shareToFeed = true;
      } else if (shareChoice.startsWith('group:')) {
        payloadBody.shareToFeed = true;
        payloadBody.shareGroupId = Number(shareChoice.split(':')[1]);
      }

      isSubmittingQuiz = true;
      render();
      try {
        const res = await api.completeLesson(lesson.id, payloadBody);
        quizResult = res;
        retryQuestionIds = null;
        if (res.passed) {
          progress = {
            ...progress,
            status: 'completed',
            bestScore: Math.max(progress.bestScore || 0, res.grading.score)
          };
        }
        setState({ stats: res.stats, todayXp: res.todayXp });
        notify(
          res.passed
            ? `Đạt ${res.grading.score}% (+${res.xpAwarded} XP)!`
            : `Đạt ${res.grading.score}% — thử sửa lại các câu sai nhé!`,
          res.passed ? 'success' : 'info'
        );
      } catch (err) {
        notify(err.message || 'Không thể nộp bài', 'error');
      } finally {
        isSubmittingQuiz = false;
        render();
      }
    });

    container.querySelector('#btn-retry-mistakes')?.addEventListener('click', () => {
      const missed = (quizResult?.grading?.results || [])
        .filter((r) => !r.isCorrect)
        .map((r) => r.questionId);
      retryQuestionIds = new Set(missed);
      for (const qId of missed) {
        delete quizAnswers[qId];
      }
      quizResult = null;
      render();
    });

    container.querySelector('#btn-retake-full')?.addEventListener('click', () => {
      quizAnswers = {};
      quizResult = null;
      retryQuestionIds = null;
      render();
    });

    container.querySelector('#btn-show-full-quiz')?.addEventListener('click', () => {
      retryQuestionIds = null;
      render();
    });

    container.querySelector('#btn-result-catalog')?.addEventListener('click', () => {
      navigate('catalog');
    });
  }

  render();
}
