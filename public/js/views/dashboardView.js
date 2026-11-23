import { api } from '../api.js';
import { escapeHtml, formatBilingual, langLabel, langShort } from '../ruby.js';
import { getState, notify, setState } from '../state.js';

export async function renderDashboardView(container, { navigate }) {
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Đang tải bảng điều khiển… / Loading dashboard…</p></div>`;

  let summary;
  let coursesData;
  try {
    const user = getState().user;
    const activeLang = user?.activeLanguage || 'en';
    [summary, coursesData] = await Promise.all([
      api.getProgressSummary(),
      api.getCourses(activeLang)
    ]);
    setState({
      stats: summary.stats,
      todayXp: summary.todayXp,
      summary
    });
  } catch (err) {
    container.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
    return;
  }

  const user = getState().user;
  const stats = summary.stats || {};
  const dailyGoal = summary.dailyGoal || user?.dailyXpGoal || 50;
  const todayXp = summary.todayXp || 0;
  const goalPct = Math.min(100, Math.round((todayXp / Math.max(1, dailyGoal)) * 100));

  const levels = coursesData?.levels || [];
  const recommendedLevel =
    levels.find((l) => l.recommendedNext) || levels[0] || null;
  const nextLesson =
    recommendedLevel?.lessons?.find((lsn) => lsn.progress?.status !== 'completed') ||
    recommendedLevel?.lessons?.[0] ||
    null;

  const history = summary.dailyHistory || [];
  const maxDayXp = Math.max(dailyGoal, ...history.map((d) => d.xpEarned || 0), 10);

  container.innerHTML = `
    <div class="stack" data-testid="dashboard-view">
      <div class="card row-between">
        <div class="stack-sm">
          <div class="row">
            <span class="badge badge-primary">Level ${stats.userLevel || 1}</span>
            <span class="badge">Mã bạn bè / Friend Code: <strong class="mono">${escapeHtml(user.friendCode)}</strong></span>
          </div>
          <h1 style="margin:0">Xin chào, ${escapeHtml(user.displayName)}!</h1>
          <p class="muted" style="margin:0">
            Ngôn ngữ chính: <strong>${langLabel(user.activeLanguage)}</strong> ·
            Đã hoàn thành <strong>${stats.lessonsCompletedCount || 0}</strong> bài học &amp; thuộc <strong>${stats.vocabMasteredCount || 0}</strong> từ vựng.
          </p>
        </div>

        ${
          nextLesson
            ? `
          <div class="card-subtle stack-sm" style="min-width:260px; max-width:360px">
            <div class="subtle">Bài học gợi ý tiếp theo / Recommended Next</div>
            <div>
              <span class="badge badge-${escapeHtml(recommendedLevel.language)}">${escapeHtml(recommendedLevel.code)}</span>
              <strong>${escapeHtml(nextLesson.title?.native || nextLesson.id)}</strong>
            </div>
            <div class="subtle">${formatBilingual(nextLesson.title)}</div>
            <button type="button" class="btn btn-primary" data-testid="dashboard-resume-btn" id="btn-resume-lesson">
              Tiếp tục học ngay / Resume Lesson →
            </button>
          </div>
        `
            : ''
        }
      </div>

      <div class="grid-4" data-testid="dashboard-stats">
        <div class="card kpi-card">
          <span class="subtle">Tổng XP / Total XP</span>
          <div class="kpi-value" data-testid="dashboard-total-xp">⚡ ${stats.totalXp || 0}</div>
          <span class="subtle">Hạng cá nhân: Level ${stats.userLevel || 1}</span>
        </div>

        <div class="card kpi-card" data-testid="dashboard-daily-goal">
          <span class="subtle">Mục tiêu hôm nay / Daily Goal</span>
          <div class="kpi-value">${todayXp} / ${dailyGoal} <small style="font-size:0.85rem">XP</small></div>
          <div class="progress-track">
            <div class="progress-fill ${goalPct >= 100 ? 'is-success' : ''}" style="width:${goalPct}%"></div>
          </div>
          <span class="subtle">${goalPct}% hoàn thành</span>
        </div>

        <div class="card kpi-card">
          <span class="subtle">Chuỗi ngày học / Study Streak</span>
          <div class="kpi-value" data-testid="dashboard-streak">🔥 ${stats.currentStreak || 0} ngày</div>
          <span class="subtle">Kỷ lục / Longest: 🏆 ${stats.longestStreak || 0} ngày</span>
        </div>

        <div class="card kpi-card">
          <span class="subtle">Ôn tập &amp; Câu sai / Review</span>
          <div class="row">
            <button type="button" class="btn btn-sm btn-tts" id="btn-go-srs" data-testid="dashboard-due-reviews">
              SRS: <strong>${summary.dueVocabCount || 0}</strong> đến hạn
            </button>
            <button type="button" class="btn btn-sm" id="btn-go-mistakes" data-testid="dashboard-mistakes">
              Lỗi sai: <strong>${summary.mistakesCount || 0}</strong>
            </button>
          </div>
          <span class="subtle">Ôn flashcard &amp; sửa câu sai mỗi ngày</span>
        </div>
      </div>

      <div class="card stack-sm">
        <h2 class="section-title">Tiến độ theo ngôn ngữ / Language Mastery</h2>
        <div class="grid-3">
          ${['en', 'zh', 'ja']
            .map((lang) => {
              const info = summary.byLanguage?.[lang] || {
                xp: 0,
                lessonsCompleted: 0,
                totalLessons: 0,
                vocabMastered: 0
              };
              const pct = info.totalLessons
                ? Math.round((info.lessonsCompleted / info.totalLessons) * 100)
                : 0;
              return `
              <div class="card-subtle stack-sm" data-testid="dashboard-lang-card-${lang}">
                <div class="row-between">
                  <span class="badge badge-${lang}">${langShort(lang)}</span>
                  <strong>⚡ ${info.xp} XP</strong>
                </div>
                <strong>${langLabel(lang)}</strong>
                <div class="progress-track">
                  <div class="progress-fill" style="width:${pct}%"></div>
                </div>
                <div class="row-between subtle">
                  <span>Bài học: ${info.lessonsCompleted}/${info.totalLessons}</span>
                  <span>Từ thuộc: ${info.vocabMastered}</span>
                </div>
                <button type="button" class="btn btn-sm" data-open-lang="${lang}">
                  Mở lộ trình ${langShort(lang)} →
                </button>
              </div>
            `;
            })
            .join('')}
        </div>
      </div>

      <div class="grid-2">
        <div class="card stack-sm">
          <h2 class="section-title">Hoạt động 14 ngày qua / Recent Activity</h2>
          ${
            history.length === 0
              ? '<p class="subtle">Chưa có lịch sử XP. Hoàn thành bài học hoặc ôn SRS để bắt đầu chuỗi ngày học!</p>'
              : `
            <div class="mini-bars" aria-label="Biểu đồ XP theo ngày">
              ${history
                .map((d) => {
                  const h = Math.max(6, Math.round(((d.xpEarned || 0) / maxDayXp) * 100));
                  return `
                  <div class="mini-bar-col" title="${escapeHtml(d.date)}: ${d.xpEarned} XP">
                    <div class="mini-bar" style="height:${h}%"></div>
                    <span class="mini-bar-lbl">${escapeHtml(d.date.slice(5))}</span>
                  </div>
                `;
                })
                .join('')}
            </div>
          `
          }

          <h3 style="margin:10px 0 4px;font-size:1rem">Bài kiểm tra gần đây / Recent Quizzes</h3>
          ${
            (summary.recentQuizzes || []).length === 0
              ? '<p class="subtle">Chưa có lần làm quiz nào.</p>'
              : `
            <div class="stack-sm">
              ${summary.recentQuizzes
                .slice(0, 5)
                .map(
                  (q) => `
                <div class="row-between card-subtle" style="padding:8px 12px">
                  <span>
                    <span class="badge badge-${escapeHtml(q.language)}">${escapeHtml(q.levelCode)}</span>
                    <strong class="mono">${escapeHtml(q.lessonId)}</strong>
                  </span>
                  <span><strong>${q.score}%</strong> (${q.correctCount}/${q.totalQuestions}) · +${q.xpAwarded} XP</span>
                </div>
              `
                )
                .join('')}
            </div>
          `
          }
        </div>

        <div class="card stack-sm">
          <h2 class="section-title">Cài đặt hồ sơ / Profile Settings</h2>
          <form id="profile-settings-form" class="stack-sm" data-testid="profile-settings-form">
            <div class="field">
              <label for="prof-display-name">Tên hiển thị / Display Name</label>
              <input id="prof-display-name" name="displayName" class="input" type="text" required maxlength="40" value="${escapeHtml(user.displayName)}" data-testid="profile-display-name" />
            </div>

            <div class="field">
              <label>Ngôn ngữ đang theo học / Target Languages</label>
              <div class="checkbox-row">
                ${['en', 'zh', 'ja']
                  .map(
                    (l) => `
                  <label class="checkbox-pill">
                    <input type="checkbox" name="targetLanguages" value="${l}" ${user.targetLanguages?.includes(l) ? 'checked' : ''} />
                    ${langShort(l)}
                  </label>
                `
                  )
                  .join('')}
              </div>
            </div>

            <div class="grid-2">
              <div class="field">
                <label for="prof-active-lang">Ngôn ngữ chính / Active Language</label>
                <select id="prof-active-lang" name="activeLanguage" class="select" data-testid="profile-active-language">
                  <option value="en" ${user.activeLanguage === 'en' ? 'selected' : ''}>Tiếng Anh (EN)</option>
                  <option value="zh" ${user.activeLanguage === 'zh' ? 'selected' : ''}>Tiếng Trung (ZH)</option>
                  <option value="ja" ${user.activeLanguage === 'ja' ? 'selected' : ''}>Tiếng Nhật (JA)</option>
                </select>
              </div>
              <div class="field">
                <label for="prof-daily-goal">Mục tiêu XP/ngày (10–500)</label>
                <input id="prof-daily-goal" name="dailyXpGoal" class="input" type="number" min="10" max="500" value="${Number(user.dailyXpGoal) || 50}" data-testid="profile-daily-goal" />
              </div>
            </div>

            <label class="checkbox-pill" style="justify-content:flex-start">
              <input type="checkbox" name="autoShareMilestones" ${user.autoShareMilestones ? 'checked' : ''} data-testid="profile-auto-share" />
              Tự động chia sẻ thành tích bài học lên bảng tin bạn bè
            </label>

            <button type="submit" class="btn btn-primary" data-testid="profile-save-btn">
              Lưu cài đặt / Save Profile
            </button>
          </form>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-resume-lesson')?.addEventListener('click', () => {
    if (nextLesson) {
      navigate('lesson', { lessonId: nextLesson.id, lessonTab: 'vocab' });
    }
  });

  container.querySelector('#btn-go-srs')?.addEventListener('click', () => {
    navigate('review', { reviewTab: 'srs' });
  });

  container.querySelector('#btn-go-mistakes')?.addEventListener('click', () => {
    navigate('review', { reviewTab: 'mistakes' });
  });

  container.querySelectorAll('[data-open-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-open-lang');
      setState({ activeCatalogLanguage: lang });
      navigate('catalog');
    });
  });

  container
    .querySelector('#profile-settings-form')
    ?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const targetLanguages = Array.from(
        form.querySelectorAll('input[name="targetLanguages"]:checked')
      ).map((el) => el.value);

      if (targetLanguages.length === 0) {
        notify('Vui lòng chọn ít nhất 1 ngôn ngữ học.', 'error');
        return;
      }

      try {
        const res = await api.updateProfile({
          displayName: form.displayName.value.trim(),
          targetLanguages,
          activeLanguage: form.activeLanguage.value,
          dailyXpGoal: Number(form.dailyXpGoal.value) || 50,
          autoShareMilestones: form.autoShareMilestones.checked
        });
        setState({
          user: res.user,
          activeCatalogLanguage: res.user.activeLanguage
        });
        notify('Đã cập nhật hồ sơ thành công!', 'success');
        renderDashboardView(container, { navigate });
      } catch (err) {
        notify(err.message || 'Không thể lưu hồ sơ', 'error');
      }
    });
}
