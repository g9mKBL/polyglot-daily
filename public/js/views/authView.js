import { api } from '../api.js';
import { escapeHtml, langShort } from '../ruby.js';
import { notify, setState } from '../state.js';

export async function renderAuthView(container, { onAuthenticated }) {
  let mode = 'login';
  let errorMsg = '';
  let demoAccounts = [];
  let isLoading = false;

  try {
    const res = await api.getDemoAccounts();
    demoAccounts = Array.isArray(res?.accounts) ? res.accounts : [];
  } catch {
    demoAccounts = [];
  }

  function render() {
    container.innerHTML = `
      <section class="auth-layout" data-testid="auth-view">
        <div class="auth-hero">
          <span class="badge badge-primary">Polyglot Daily · EN / 中文 / 日本語</span>
          <h1>Học 3 ngôn ngữ mỗi ngày cùng bạn bè</h1>
          <p>
            Lộ trình bài bản từ cơ bản đến nâng cao: Tiếng Anh (CEFR A1–C2),
            Tiếng Trung (HSK 1–6) và Tiếng Nhật (JLPT N5–N1).
          </p>
          <ul class="auth-feature-list">
            <li><strong>51 bài học biên soạn sẵn:</strong> Từ vựng có IPA / Pinyin / Furigana, ngữ pháp, hội thoại TTS &amp; bài tập 4 chế độ.</li>
            <li><strong>Ghi nhớ thông minh (SRS):</strong> Flashcard lặp lại ngắt quãng &amp; ngân hàng câu sai (Mistake Bank).</li>
            <li><strong>Nhóm học &amp; Bảng xếp hạng:</strong> Kết bạn qua mã, lập nhóm học chung mục tiêu XP và chia sẻ tiến độ.</li>
          </ul>
        </div>

        <div class="stack">
          <div class="card stack">
            <div class="tabs" role="tablist">
              <button type="button"
                class="tab-btn ${mode === 'login' ? 'is-active' : ''}"
                data-testid="auth-tab-login"
                id="tab-login">
                Đăng nhập / Login
              </button>
              <button type="button"
                class="tab-btn ${mode === 'register' ? 'is-active' : ''}"
                data-testid="auth-tab-register"
                id="tab-register">
                Đăng ký / Register
              </button>
            </div>

            ${errorMsg ? `<div class="error-banner" role="alert" data-testid="auth-error">${escapeHtml(errorMsg)}</div>` : ''}

            ${
              mode === 'login'
                ? `
              <form id="login-form" class="stack-sm" data-testid="login-form">
                <div class="field">
                  <label for="login-identifier">Tên đăng nhập hoặc Email / Username or Email</label>
                  <input id="login-identifier" name="usernameOrEmail" class="input" type="text" required autocomplete="username" placeholder="vd: minh_anh" data-testid="login-identifier" />
                </div>
                <div class="field">
                  <label for="login-password">Mật khẩu / Password</label>
                  <input id="login-password" name="password" class="input" type="password" required autocomplete="current-password" placeholder="••••••••" data-testid="login-password" />
                </div>
                <button type="submit" class="btn btn-primary" ${isLoading ? 'disabled' : ''} data-testid="login-submit">
                  ${isLoading ? 'Đang đăng nhập…' : 'Đăng nhập / Sign In'}
                </button>
              </form>
            `
                : `
              <form id="register-form" class="stack-sm" data-testid="register-form">
                <div class="grid-2">
                  <div class="field">
                    <label for="reg-username">Tên đăng nhập / Username *</label>
                    <input id="reg-username" name="username" class="input" type="text" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" placeholder="vd: lan_anh_99" data-testid="register-username" />
                  </div>
                  <div class="field">
                    <label for="reg-display-name">Tên hiển thị / Display Name *</label>
                    <input id="reg-display-name" name="displayName" class="input" type="text" required maxlength="40" placeholder="vd: Lan Anh" data-testid="register-display-name" />
                  </div>
                </div>
                <div class="grid-2">
                  <div class="field">
                    <label for="reg-email">Email (tùy chọn / optional)</label>
                    <input id="reg-email" name="email" class="input" type="email" placeholder="you@example.com" data-testid="register-email" />
                  </div>
                  <div class="field">
                    <label for="reg-password">Mật khẩu / Password (≥ 6 ký tự) *</label>
                    <input id="reg-password" name="password" class="input" type="password" required minlength="6" placeholder="••••••" data-testid="register-password" />
                  </div>
                </div>
                <div class="field">
                  <label>Ngôn ngữ muốn học / Target Languages</label>
                  <div class="checkbox-row">
                    <label class="checkbox-pill"><input type="checkbox" name="targetLanguages" value="en" checked /> Tiếng Anh (EN)</label>
                    <label class="checkbox-pill"><input type="checkbox" name="targetLanguages" value="zh" checked /> Tiếng Trung (中文)</label>
                    <label class="checkbox-pill"><input type="checkbox" name="targetLanguages" value="ja" checked /> Tiếng Nhật (日本語)</label>
                  </div>
                </div>
                <div class="grid-2">
                  <div class="field">
                    <label for="reg-active-lang">Ngôn ngữ chính / Primary Language</label>
                    <select id="reg-active-lang" name="activeLanguage" class="select" data-testid="register-active-language">
                      <option value="en">Tiếng Anh (English)</option>
                      <option value="zh">Tiếng Trung (Mandarin)</option>
                      <option value="ja">Tiếng Nhật (Japanese)</option>
                    </select>
                  </div>
                  <div class="field">
                    <label for="reg-goal">Mục tiêu XP/ngày / Daily XP Goal</label>
                    <input id="reg-goal" name="dailyXpGoal" class="input" type="number" min="10" max="500" value="50" data-testid="register-daily-goal" />
                  </div>
                </div>
                <button type="submit" class="btn btn-primary" ${isLoading ? 'disabled' : ''} data-testid="register-submit">
                  ${isLoading ? 'Đang tạo tài khoản…' : 'Tạo tài khoản / Create Account'}
                </button>
              </form>
            `
            }
          </div>

          ${
            demoAccounts.length > 0
              ? `
            <div class="card stack-sm" data-testid="demo-accounts-section">
              <div class="row-between">
                <strong>Tài khoản dùng thử nhanh / Quick Demo Accounts</strong>
                <span class="subtle">Mật khẩu chung: <code class="mono">DemoPass123!</code></span>
              </div>
              <div class="demo-grid">
                ${demoAccounts
                  .map(
                    (acc) => `
                  <button type="button" class="demo-card" data-demo-username="${escapeHtml(acc.username)}" data-testid="demo-account-${escapeHtml(acc.username)}">
                    <span class="avatar" style="background:${escapeHtml(acc.avatarColor || '#2563eb')}">${escapeHtml((acc.displayName || acc.username).slice(0, 1).toUpperCase())}</span>
                    <span>
                      <div><strong>${escapeHtml(acc.displayName)}</strong> <span class="badge badge-${escapeHtml(acc.activeLanguage)}">${langShort(acc.activeLanguage)}</span></div>
                      <div class="subtle">@${escapeHtml(acc.username)} · ⚡${acc.totalXp ?? 0} · 🔥${acc.currentStreak ?? 0}</div>
                    </span>
                  </button>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
              : ''
          }
        </div>
      </section>
    `;

    container.querySelector('#tab-login')?.addEventListener('click', () => {
      mode = 'login';
      errorMsg = '';
      render();
    });

    container.querySelector('#tab-register')?.addEventListener('click', () => {
      mode = 'register';
      errorMsg = '';
      render();
    });

    container.querySelector('#login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const usernameOrEmail = form.usernameOrEmail.value.trim();
      const password = form.password.value;
      errorMsg = '';
      isLoading = true;
      render();

      try {
        const data = await api.login({ usernameOrEmail, password });
        setState({
          user: data.user,
          stats: data.stats,
          todayXp: data.todayXp,
          activeCatalogLanguage: data.user.activeLanguage || 'en'
        });
        notify(`Chào mừng ${data.user.displayName}!`, 'success');
        onAuthenticated();
      } catch (err) {
        errorMsg = err.message || 'Đăng nhập thất bại';
        isLoading = false;
        render();
      }
    });

    container.querySelector('#register-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const checkedLangs = Array.from(
        form.querySelectorAll('input[name="targetLanguages"]:checked')
      ).map((el) => el.value);

      if (checkedLangs.length === 0) {
        errorMsg = 'Vui lòng chọn ít nhất 1 ngôn ngữ học.';
        render();
        return;
      }

      const payload = {
        username: form.username.value.trim(),
        displayName: form.displayName.value.trim(),
        email: form.email.value.trim() || undefined,
        password: form.password.value,
        targetLanguages: checkedLangs,
        activeLanguage: form.activeLanguage.value,
        dailyXpGoal: Number(form.dailyXpGoal.value) || 50,
        timezoneOffsetMin: -new Date().getTimezoneOffset()
      };

      errorMsg = '';
      isLoading = true;
      render();

      try {
        const data = await api.register(payload);
        setState({
          user: data.user,
          stats: data.stats,
          todayXp: data.todayXp,
          activeCatalogLanguage: data.user.activeLanguage || 'en'
        });
        notify(`Tạo tài khoản thành công! Mã kết bạn: ${data.user.friendCode}`, 'success');
        onAuthenticated();
      } catch (err) {
        errorMsg = err.message || 'Đăng ký thất bại';
        isLoading = false;
        render();
      }
    });

    container.querySelectorAll('[data-demo-username]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const username = btn.getAttribute('data-demo-username');
        errorMsg = '';
        isLoading = true;
        render();
        try {
          const data = await api.login({
            usernameOrEmail: username,
            password: 'DemoPass123!'
          });
          setState({
            user: data.user,
            stats: data.stats,
            todayXp: data.todayXp,
            activeCatalogLanguage: data.user.activeLanguage || 'en'
          });
          notify(`Đã đăng nhập ${data.user.displayName}`, 'success');
          onAuthenticated();
        } catch (err) {
          errorMsg = err.message || 'Không thể đăng nhập tài khoản demo';
          isLoading = false;
          render();
        }
      });
    });
  }

  render();
}
