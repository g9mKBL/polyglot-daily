import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

import { createApp } from '../../src/app.js';
import { openDatabase } from '../../src/db/connection.js';
import { initSchema } from '../../src/db/schema.js';
import { seedDemoData } from '../../src/db/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

function detectBrowserExecutable() {
  const candidates = [
    process.env.BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);

  for (const exePath of candidates) {
    if (fs.existsSync(exePath)) {
      return exePath;
    }
  }
  throw new Error(
    `No Chromium/Edge executable found. Checked: ${candidates.join(', ')}`
  );
}

async function startIsolatedServer({ content, seed = false }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-e2e-'));
  const dbPath = path.join(tmpDir, 'e2e.db');
  const db = openDatabase(dbPath);
  initSchema(db);
  if (seed) {
    seedDemoData(db);
  }

  const app = createApp({ db, content, publicDir: PUBLIC_DIR });
  const server = await new Promise((resolve, reject) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
    srv.on('error', reject);
  });

  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  async function cleanup() {
    await new Promise((resolve) => server.close(() => resolve()));
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return { db, baseUrl, cleanup };
}

function attachRuntimeGuards(page, { expectedClientErrors = [] } = {}) {
  const allowedRules = [
    { method: 'GET', pathSuffix: '/api/auth/me', status: 401 },
    ...expectedClientErrors
  ];

  const errors = {
    consoleErrors: [],
    networkConsoleErrors: [],
    expectedClientErrorCount: 0,
    unexpectedClientErrors: [],
    pageErrors: [],
    serverErrors: []
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.startsWith('Failed to load resource: the server responded with a status of ')) {
        errors.networkConsoleErrors.push(text);
      } else {
        errors.consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', (err) => {
    errors.pageErrors.push(err?.message || String(err));
  });

  page.on('response', (res) => {
    const status = res.status();
    if (status >= 500) {
      errors.serverErrors.push(`${status} ${res.url()}`);
      return;
    }
    if (status >= 400) {
      const req = res.request();
      const pathname = new URL(res.url()).pathname;
      const isExpected = allowedRules.some(
        (rule) =>
          rule.status === status &&
          (!rule.method || rule.method === req.method()) &&
          pathname.endsWith(rule.pathSuffix)
      );
      if (isExpected) {
        errors.expectedClientErrorCount += 1;
      } else {
        errors.unexpectedClientErrors.push(`${status} ${req.method()} ${res.url()}`);
      }
    }
  });

  return errors;
}

function assertNoRuntimeErrors(errors, label = 'page') {
  assert.deepEqual(
    errors.consoleErrors,
    [],
    `[${label}] Unexpected console.error: ${errors.consoleErrors.join(' | ')}`
  );
  assert.deepEqual(
    errors.unexpectedClientErrors,
    [],
    `[${label}] Unexpected HTTP 4xx responses: ${errors.unexpectedClientErrors.join(' | ')}`
  );
  assert.ok(
    errors.networkConsoleErrors.length <= errors.expectedClientErrorCount,
    `[${label}] Unmatched network console errors: ${errors.networkConsoleErrors.join(' | ')}`
  );
  assert.deepEqual(
    errors.pageErrors,
    [],
    `[${label}] Unexpected pageerror: ${errors.pageErrors.join(' | ')}`
  );
  assert.deepEqual(
    errors.serverErrors,
    [],
    `[${label}] Unexpected HTTP >= 500 responses: ${errors.serverErrors.join(' | ')}`
  );
}

async function firstVisible(locators, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const loc of locators) {
      const count = await loc.count();
      if (count > 0 && (await loc.first().isVisible().catch(() => false))) {
        return loc.first();
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

async function clickFirstVisible(locators, timeout = 5000) {
  const target = await firstVisible(locators, timeout);
  assert.ok(target, 'Expected at least one matching interactive element to be visible');
  await target.click();
  return target;
}

async function fillFirstVisible(locators, value, timeout = 5000) {
  const target = await firstVisible(locators, timeout);
  assert.ok(target, `Expected input element to be visible for value "${value}"`);
  await target.fill(String(value));
  return target;
}

async function navigateSection(page, pattern) {
  const navBtn = await firstVisible([
    page.getByRole('navigation').getByRole('button', { name: pattern }),
    page.getByRole('navigation').getByRole('link', { name: pattern }),
    page.locator('header nav button').filter({ hasText: pattern }),
    page.getByRole('button', { name: pattern }),
    page.getByRole('link', { name: pattern })
  ]);
  assert.ok(navBtn, `Expected navigation item matching ${pattern} to be visible`);
  await navBtn.click();
  await page.waitForLoadState('networkidle');
}

async function registerUserViaUI(page, baseUrl, user) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  // Switch to Register tab/mode if Landing shows Login first
  const registerTab = await firstVisible(
    [
      page.locator('[data-testid="auth-tab-register"]'),
      page.getByRole('tab', { name: /register|sign up|đăng ký/i }),
      page.getByRole('button', { name: /register|create account|sign up|đăng ký/i })
    ],
    2500
  );
  if (registerTab) {
    await registerTab.click();
  }

  await fillFirstVisible([
    page.locator('[data-testid="register-username"]'),
    page.locator('form input[name="username"]'),
    page.getByLabel(/username|tên đăng nhập/i)
  ], user.username);

  const displayNameInput = await firstVisible(
    [
      page.locator('[data-testid="register-display-name"]'),
      page.locator('form input[name="displayName"]'),
      page.getByLabel(/display name|tên hiển thị/i)
    ],
    1500
  );
  if (displayNameInput) {
    await displayNameInput.fill(user.displayName);
  }

  const emailInput = await firstVisible(
    [
      page.locator('[data-testid="register-email"]'),
      page.locator('form input[name="email"]'),
      page.getByLabel(/email/i)
    ],
    1500
  );
  if (emailInput && user.email) {
    await emailInput.fill(user.email);
  }

  await fillFirstVisible([
    page.locator('[data-testid="register-password"]'),
    page.locator('form input[name="password"]'),
    page.getByLabel(/password|mật khẩu/i)
  ], user.password);

  await clickFirstVisible([
    page.locator('[data-testid="register-submit"]'),
    page.locator('form button[type="submit"]'),
    page.getByRole('button', { name: /create account|register|sign up|đăng ký/i })
  ]);

  await page.waitForFunction(
    (name) => document.body.innerText.includes(name),
    user.displayName,
    { timeout: 8000 }
  );
}

async function loginUserViaUI(page, baseUrl, username, password) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  const loginTab = await firstVisible(
    [
      page.locator('[data-testid="auth-tab-login"]'),
      page.getByRole('tab', { name: /login|sign in|đăng nhập/i }),
      page.getByRole('button', { name: /login|sign in|đăng nhập/i })
    ],
    2000
  );
  if (loginTab) {
    await loginTab.click();
  }

  await fillFirstVisible([
    page.locator('[data-testid="login-identifier"]'),
    page.locator('form input[name="usernameOrEmail"]'),
    page.locator('form input[name="username"]'),
    page.getByLabel(/username|email|tên đăng nhập/i)
  ], username);

  await fillFirstVisible([
    page.locator('[data-testid="login-password"]'),
    page.locator('form input[name="password"]'),
    page.getByLabel(/password|mật khẩu/i)
  ], password);

  await clickFirstVisible([
    page.locator('[data-testid="login-submit"]'),
    page.locator('form button[type="submit"]'),
    page.getByRole('button', { name: /login|sign in|đăng nhập/i })
  ]);

  await firstVisible(
    [
      page.locator('[data-testid="dashboard-view"]'),
      page.locator('[data-testid="auth-error"]')
    ],
    6000
  );
  await page.waitForLoadState('networkidle');
}

async function openLessonViaCatalog(page, languagePattern, levelCode, lessonTitleOrOrder = 1) {
  await navigateSection(page, /courses|catalog|learn|khóa học|bài học/i);

  const langCode = languagePattern.source.includes('Chinese') || languagePattern.source.includes('chinese')
    ? 'zh'
    : languagePattern.source.includes('Japanese') || languagePattern.source.includes('japanese')
      ? 'ja'
      : 'en';

  await clickFirstVisible([
    page.locator(`[data-testid="catalog-lang-tab-${langCode}"]`),
    page.locator(`[data-catalog-lang="${langCode}"]`),
    page.getByRole('tab', { name: languagePattern })
  ]);

  const levelCardId = `level-card-${langCode}-${levelCode.toLowerCase()}`;
  const levelCard = page.locator(`[data-testid="${levelCardId}"]`);
  await levelCard.waitFor({ state: 'visible', timeout: 6000 });

  const lessonBtn = levelCard.locator('[data-open-lesson]').nth(lessonTitleOrOrder - 1);
  assert.ok((await lessonBtn.count()) > 0, `Expected lesson trigger inside ${levelCardId}`);
  await lessonBtn.click();
  await page.locator('[data-testid="lesson-view"]').waitFor({ state: 'visible', timeout: 6000 });
  await page.waitForLoadState('networkidle');
}

async function solveLessonQuizInUI(page, lesson, { intentionallyWrong = false } = {}) {
  const practiceTab = await firstVisible(
    [
      page.locator('[data-testid="lesson-tab-practice"]'),
      page.locator('[data-lesson-tab="practice"]'),
      page.getByRole('button', { name: /practice|quiz|luyện tập|kiểm tra/i })
    ],
    4000
  );
  assert.ok(practiceTab, 'Expected Practice & Quiz tab to be visible');
  await practiceTab.click();
  await page.locator('[data-testid="lesson-quiz-section"]').waitFor({ state: 'visible', timeout: 5000 });

  for (let i = 0; i < lesson.quizzes.length; i++) {
    const q = lesson.quizzes[i];
    if (q.type === 'sentence_order') {
      let order = intentionallyWrong
        ? [...q.correctOrder].reverse()
        : q.correctOrder;
      if (intentionallyWrong && JSON.stringify(order) === JSON.stringify(q.correctOrder) && order.length >= 2) {
        order = [order[1], order[0], ...order.slice(2)];
      }
      const bank = page.locator(`[data-testid="quiz-order-bank-${q.id}"]`);
      for (const token of order) {
        const tokenBtn = bank.getByRole('button', { name: token, exact: true }).first();
        assert.ok((await tokenBtn.count()) > 0, `Expected token "${token}" for sentence_order ${q.id}`);
        await tokenBtn.click();
      }
    } else {
      const targetIdx = intentionallyWrong
        ? (q.correctIndex + 1) % q.options.length
        : q.correctIndex;
      const optControl = page.locator(`[data-testid="quiz-option-${q.id}-${targetIdx}"]`);
      assert.ok((await optControl.count()) > 0, `Expected quiz option index ${targetIdx} for question ${q.id}`);
      await optControl.click();
    }
  }

  await clickFirstVisible([
    page.locator('[data-testid="quiz-submit-btn"]'),
    page.locator('#btn-submit-quiz'),
    page.getByRole('button', { name: /submit|check|finish|nộp bài|hoàn thành/i })
  ]);

  await page.locator('[data-testid="quiz-result-panel"]').waitFor({ state: 'visible', timeout: 6000 });
  await page.waitForLoadState('networkidle');
}

describe('Polyglot Daily — E2E Verification Suite (4-Tier)', () => {
  let content;
  let browser;
  let serverCtx;
  let seededServerCtx;

  before(async () => {
    content = await import('../../content/index.js');
    assert.ok(
      fs.existsSync(path.join(PUBLIC_DIR, 'index.html')),
      'Frontend public/index.html must exist before running E2E suite'
    );

    const executablePath = detectBrowserExecutable();
    browser = await chromium.launch({
      executablePath,
      headless: true
    });

    serverCtx = await startIsolatedServer({ content, seed: false });
    seededServerCtx = await startIsolatedServer({ content, seed: true });
  });

  after(async () => {
    if (browser) await browser.close();
    if (serverCtx) await serverCtx.cleanup();
    if (seededServerCtx) await seededServerCtx.cleanup();
  });

  it('Tier 1: Core Features — Auth, EN/ZH/JA Catalogs, Lesson Tabs + TTS, Profile Settings', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = attachRuntimeGuards(page);

    try {
      const user = {
        username: `t1_user_${Date.now()}`,
        displayName: 'TierOne Learner',
        email: `t1_${Date.now()}@example.test`,
        password: 'Password123!'
      };

      // T1.1 Register -> Logout -> Login
      await registerUserViaUI(page, serverCtx.baseUrl, user);
      const bodyAfterRegister = await page.locator('body').innerText();
      assert.match(bodyAfterRegister, /LN-[A-Z0-9]+/i, 'Dashboard/Profile should surface friend code');

      await clickFirstVisible([
        page.locator('[data-testid="btn-logout"], #btn-logout, [data-action="logout"]'),
        page.getByRole('button', { name: /logout|sign out|đăng xuất/i })
      ]);
      await page.waitForLoadState('networkidle');

      await loginUserViaUI(page, serverCtx.baseUrl, user.username, user.password);
      await page.waitForFunction(
        (name) => document.body.innerText.includes(name),
        user.displayName,
        { timeout: 6000 }
      );

      // T1.2 Multilingual Catalog Inspection: EN A1-C2, ZH HSK1-6, JA N5-N1
      await navigateSection(page, /courses|catalog|learn|khóa học|bài học/i);

      // English A1-C2
      await clickFirstVisible([
        page.locator('[data-testid="catalog-lang-tab-en"]'),
        page.getByRole('tab', { name: /english|tiếng anh/i })
      ]);
      await page.locator('[data-testid="level-card-en-a1"]').waitFor({ state: 'visible', timeout: 6000 });
      const enText = await page.locator('body').innerText();
      for (const code of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
        assert.ok(enText.includes(code), `English catalog should show CEFR level ${code}`);
      }

      // Chinese HSK 1-6 + Hanzi + tone-marked Pinyin
      await clickFirstVisible([
        page.locator('[data-testid="catalog-lang-tab-zh"]'),
        page.getByRole('tab', { name: /chinese|mandarin|中文|tiếng trung/i })
      ]);
      await page.locator('[data-testid="level-card-zh-hsk1"]').waitFor({ state: 'visible', timeout: 6000 });
      const zhText = await page.locator('body').innerText();
      for (const code of ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6']) {
        assert.ok(
          zhText.replace(/\s+/g, '').includes(code),
          `Chinese catalog should show ${code}`
        );
      }

      await openLessonViaCatalog(page, /chinese|mandarin|中文|tiếng trung/i, 'HSK1', 1);
      const zhLessonText = await page.locator('body').innerText();
      assert.match(zhLessonText, /[\u4e00-\u9fff]/, 'Chinese lesson should render Hanzi');
      assert.match(
        zhLessonText,
        /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/,
        'Chinese lesson should render tone-marked Pinyin'
      );

      // Japanese N5-N1 + Kana/Kanji + <ruby> Furigana
      await openLessonViaCatalog(page, /japanese|日本語|tiếng nhật/i, 'N5', 1);
      const jaHtml = await page.locator('[data-testid="lesson-view"]').innerHTML();
      const jaText = await page.locator('[data-testid="lesson-view"]').innerText();
      assert.match(jaText, /[\u3040-\u30ff\u4e00-\u9fff]/, 'Japanese lesson should render Kana/Kanji');
      assert.match(jaHtml, /<ruby>.*<rt>.*<\/rt>.*<\/ruby>/i, 'Japanese lesson should render <ruby><rt> Furigana');

      // Verify all JA levels exist in catalog
      await navigateSection(page, /courses|catalog|learn|khóa học|bài học/i);
      await clickFirstVisible([
        page.locator('[data-testid="catalog-lang-tab-ja"]'),
        page.getByRole('tab', { name: /japanese|日本語|tiếng nhật/i })
      ]);
      await page.locator('[data-testid="level-card-ja-n5"]').waitFor({ state: 'visible', timeout: 6000 });
      const jaCatalogText = await page.locator('body').innerText();
      for (const code of ['N5', 'N4', 'N3', 'N2', 'N1']) {
        assert.ok(jaCatalogText.includes(code), `Japanese catalog should show JLPT ${code}`);
      }

      // T1.3 Lesson Study Tabs (Vocab + TTS, Grammar, Dialogue + TTS, Practice: Flashcards + Match + Quiz)
      await openLessonViaCatalog(page, /english|tiếng anh/i, 'A1', 1);

      const ttsBtn = await firstVisible(
        [
          page.locator('[data-testid^="vocab-tts-"]'),
          page.getByRole('button', { name: /listen|speak|audio|play|nghe|phát âm/i })
        ],
        2500
      );
      assert.ok(ttsBtn, 'Expected Vocab TTS button to be visible');
      await ttsBtn.click();

      // Switch to Grammar tab
      await page.locator('[data-testid="lesson-tab-grammar"]').click();
      await page.locator('[data-testid="lesson-grammar-panel"]').waitFor({ state: 'visible', timeout: 3000 });

      // Switch to Dialogue tab and trigger TTS
      await page.locator('[data-testid="lesson-tab-dialogue"]').click();
      await page.locator('[data-testid="lesson-dialogue-panel"]').waitFor({ state: 'visible', timeout: 3000 });
      await page.locator('[data-testid="dialogue-line-tts-0"]').click();

      // Switch to Practice tab (contains Flashcard Deck, 4-Pair Match, and Quiz)
      await page.locator('[data-testid="lesson-tab-practice"]').click();
      await page.locator('[data-testid="lesson-flashcards"]').waitFor({ state: 'visible', timeout: 3000 });
      await page.locator('[data-testid="vocab-match-game"]').waitFor({ state: 'visible', timeout: 3000 });
      await page.locator('[data-testid="lesson-quiz-section"]').waitFor({ state: 'visible', timeout: 3000 });
      await page.locator('[data-testid="flashcard-flip-btn"]').click();

      // T1.4 Profile Settings Update (on Dashboard)
      await navigateSection(page, /dashboard|tổng quan/i);
      await page.locator('[data-testid="profile-settings-form"]').waitFor({ state: 'visible', timeout: 4000 });

      const goalInput = page.locator('[data-testid="profile-daily-goal"]');
      await goalInput.fill('90');
      await page.locator('[data-testid="profile-save-btn"]').click();
      await page.waitForFunction(
        () => document.body.innerText.includes('/ 90 XP') || document.body.innerText.includes('90 XP'),
        null,
        { timeout: 6000 }
      );

      const meRes = await page.evaluate(async () => {
        const res = await fetch('/api/auth/me');
        return res.json();
      });
      assert.equal(meRes.ok, true);
      assert.equal(meRes.data.user.dailyXpGoal, 90);

      assertNoRuntimeErrors(errors, 'Tier 1');
    } finally {
      await context.close();
    }
  });

  it('Tier 2: Boundary & Corner Cases — Duplicate/Invalid Auth, Invalid Social Codes, Mistake Bank, Mobile 390x844', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = attachRuntimeGuards(page, {
      expectedClientErrors: [
        { method: 'POST', pathSuffix: '/api/auth/login', status: 401 },
        { method: 'POST', pathSuffix: '/api/auth/register', status: 409 },
        { method: 'POST', pathSuffix: '/api/groups/join', status: 404 }
      ]
    });

    try {
      const existingUser = {
        username: `t2_dup_${Date.now()}`,
        displayName: 'TierTwo User',
        email: `t2_${Date.now()}@example.test`,
        password: 'Password123!'
      };

      await registerUserViaUI(page, serverCtx.baseUrl, existingUser);
      await clickFirstVisible([
        page.locator('[data-testid="btn-logout"], #btn-logout, [data-action="logout"]'),
        page.getByRole('button', { name: /logout|sign out|đăng xuất/i })
      ]);
      await page.waitForLoadState('networkidle');

      // T2.1a Invalid login password -> error message, no 500, no crash
      await loginUserViaUI(page, serverCtx.baseUrl, existingUser.username, 'WrongPass999!');
      const invalidLoginText = await page.locator('body').innerText();
      assert.match(
        invalidLoginText,
        /invalid|incorrect|failed|sai|không đúng|lỗi/i,
        'Invalid login should display clear error message'
      );

      // T2.1b Duplicate username registration -> error message, no 500
      const registerTab = await firstVisible(
        [
          page.locator('[data-testid="auth-tab-register"]'),
          page.getByRole('tab', { name: /register|sign up|đăng ký/i }),
          page.getByRole('button', { name: /register|create account|sign up|đăng ký/i })
        ],
        2000
      );
      assert.ok(registerTab, 'Expected register tab to be visible');
      await registerTab.click();

      await page.locator('[data-testid="register-username"]').fill(existingUser.username);
      await page.locator('[data-testid="register-display-name"]').fill(existingUser.displayName);
      await page.locator('[data-testid="register-password"]').fill('Password123!');
      await page.locator('[data-testid="register-submit"]').click();
      await page.locator('[data-testid="auth-error"]').waitFor({ state: 'visible', timeout: 5000 });
      const dupText = await page.locator('[data-testid="auth-error"]').innerText();
      assert.match(
        dupText,
        /taken|already|exists|duplicate|đã tồn tại|đã được sử dụng/i,
        'Duplicate username should show clear error message'
      );

      // Log in cleanly now
      await loginUserViaUI(page, serverCtx.baseUrl, existingUser.username, existingUser.password);
      await page.waitForFunction(
        (name) => document.body.innerText.includes(name),
        existingUser.displayName,
        { timeout: 6000 }
      );

      // T2.2 Invalid Group Invite Code -> user-facing error toast
      await navigateSection(page, /social|friends|community|bạn bè|nhóm/i);
      await page.locator('[data-testid="social-tab-groups"]').click();
      await page.locator('[data-testid="join-group-code-input"]').waitFor({ state: 'visible', timeout: 4000 });
      await page.locator('[data-testid="join-group-code-input"]').fill('GRP-NOPE99');
      await page.locator('[data-testid="join-group-submit"]').click();
      await page.locator('#toast-root .toast.is-error').waitFor({ state: 'visible', timeout: 5000 });
      const socialErrorText = await page.locator('#toast-root .toast.is-error').innerText();
      assert.match(
        socialErrorText,
        /no study group|matches|not found|invalid|error|không tìm thấy|không hợp lệ/i,
        'Invalid invite code should show user-facing error'
      );

      // T2.3 Wrong Quiz Answers -> Mistake Bank
      const enA1L1 = content.getLesson('en-a1-l1');
      await openLessonViaCatalog(page, /english|tiếng anh/i, 'A1', 1);
      await solveLessonQuizInUI(page, enA1L1, { intentionallyWrong: true });

      const mistakesRes = await page.evaluate(async () => {
        const res = await fetch('/api/mistakes?language=en');
        return res.json();
      });
      assert.equal(mistakesRes.ok, true);
      assert.ok(
        mistakesRes.data.mistakes.length >= 1,
        'Submitting wrong quiz answers should record items in Mistake Bank'
      );

      // Navigate to Review/Mistakes view and verify UI renders mistake bank
      await navigateSection(page, /review|mistakes|flashcards|ôn tập|lỗi sai/i);
      await page.locator('[data-testid="review-tab-mistakes"]').click();
      await page.locator('[data-testid="mistakes-list"]').waitFor({ state: 'visible', timeout: 4000 });
      const reviewText = await page.locator('[data-testid="mistakes-list"]').innerText();
      assert.ok(reviewText.length > 20, 'Review/Mistake Bank view should render mistake items');

      // T2.4 Mobile Viewport (390x844) Zero Horizontal Overflow
      await page.setViewportSize({ width: 390, height: 844 });
      for (const navTestId of ['nav-dashboard', 'nav-catalog', 'nav-review', 'nav-social']) {
        const nav = page.locator(`[data-testid="${navTestId}"]`);
        await nav.click();
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth
        }));
        assert.ok(
          overflow.scrollWidth <= overflow.innerWidth + 1,
          `Mobile overflow detected on ${navTestId}: scrollWidth=${overflow.scrollWidth}, innerWidth=${overflow.innerWidth}`
        );
      }

      assertNoRuntimeErrors(errors, 'Tier 2');
    } finally {
      await context.close();
    }
  });

  it('Tier 3: Cross-Feature Combinations — Quiz XP/Streak/Auto-Share, Hard Reload Persistence, SRS Due Count', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = attachRuntimeGuards(page);

    try {
      const user = {
        username: `t3_user_${Date.now()}`,
        displayName: 'TierThree Scholar',
        email: `t3_${Date.now()}@example.test`,
        password: 'Password123!'
      };

      await registerUserViaUI(page, serverCtx.baseUrl, user);

      // T3.1 Complete English A1 Lesson 1 accurately -> XP + Streak + Auto-shared Feed post
      const enA1L1 = content.getLesson('en-a1-l1');
      await openLessonViaCatalog(page, /english|tiếng anh/i, 'A1', 1);
      await solveLessonQuizInUI(page, enA1L1, { intentionallyWrong: false });

      const summaryBeforeReload = await page.evaluate(async () => {
        const [me, feed, review] = await Promise.all([
          fetch('/api/auth/me').then((r) => r.json()),
          fetch('/api/feed').then((r) => r.json()),
          fetch('/api/vocab/review?mode=due').then((r) => r.json())
        ]);
        return { me, feed, review };
      });

      assert.ok(summaryBeforeReload.me.data.stats.totalXp >= 50, 'Passing lesson should award >= 50 XP');
      assert.ok(summaryBeforeReload.me.data.stats.currentStreak >= 1, 'Passing lesson should increment streak >= 1');
      assert.ok(
        summaryBeforeReload.feed.data.posts.some(
          (p) => p.lessonId === 'en-a1-l1' || (p.title || '').includes('A1')
        ),
        'Completing lesson should auto-share milestone to feed'
      );

      // Verify Feed renders the milestone in UI
      await navigateSection(page, /social|feed|friends|bạn bè|cộng đồng/i);
      await page.locator('[data-testid="social-tab-feed"]').click();
      await page.locator('[data-testid="feed-posts-list"]').waitFor({ state: 'visible', timeout: 5000 });
      const feedUiText = await page.locator('[data-testid="feed-posts-list"]').innerText();
      assert.match(feedUiText, /TierThree Scholar|en-a1-l1|A1/i);

      // T3.2 Hard Browser Reload Persistence
      await page.reload({ waitUntil: 'networkidle' });
      const bodyAfterReload = await page.locator('body').innerText();
      assert.ok(
        bodyAfterReload.includes(user.displayName),
        'Authenticated session must persist across hard browser reload'
      );

      const meAfterReload = await page.evaluate(async () =>
        fetch('/api/auth/me').then((r) => r.json())
      );
      assert.equal(
        meAfterReload.data.stats.totalXp,
        summaryBeforeReload.me.data.stats.totalXp,
        'Total XP must persist across reload'
      );
      assert.equal(
        meAfterReload.data.stats.currentStreak,
        summaryBeforeReload.me.data.stats.currentStreak,
        'Current streak must persist across reload'
      );

      // T3.3 SRS Flashcard Review updates due count
      const initialDueCount = summaryBeforeReload.review.data.dueCount;
      assert.ok(initialDueCount >= 1, 'Completed lesson should populate due SRS flashcards');

      await navigateSection(page, /review|flashcard|ôn tập/i);
      await page.locator('[data-testid="srs-flashcard"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-testid="srs-flip-btn"]').click();
      await page.locator('[data-testid="srs-rate-good"]').click();

      await page.waitForFunction(
        (expected) => document.body.innerText.includes(`Đến hạn: ${expected}`),
        initialDueCount - 1,
        { timeout: 5000 }
      );
      const reviewAfter = await page.evaluate(async () =>
        fetch('/api/vocab/review?mode=due').then((r) => r.json())
      );
      assert.equal(
        reviewAfter.data.dueCount,
        initialDueCount - 1,
        'Rating a due flashcard Good/Easy should decrement due count by 1'
      );

      assertNoRuntimeErrors(errors, 'Tier 3');
    } finally {
      await context.close();
    }
  });

  it('Tier 4: Real-World Multi-User Social Workflow (2 Browser Contexts) + Demo Seed Verification', async () => {
    const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const errorsA = attachRuntimeGuards(pageA);
    const errorsB = attachRuntimeGuards(pageB);

    try {
      const stamp = Date.now();
      const userA = {
        username: `social_a_${stamp}`,
        displayName: 'Alice Polyglot',
        email: `alice_${stamp}@example.test`,
        password: 'Password123!'
      };
      const userB = {
        username: `social_b_${stamp}`,
        displayName: 'Bob Learner',
        email: `bob_${stamp}@example.test`,
        password: 'Password123!'
      };

      // User A registers and completes English A1 + Japanese N5 lessons
      await registerUserViaUI(pageA, serverCtx.baseUrl, userA);

      const enA1L1 = content.getLesson('en-a1-l1');
      await openLessonViaCatalog(pageA, /english|tiếng anh/i, 'A1', 1);
      await solveLessonQuizInUI(pageA, enA1L1);

      const jaN5L1 = content.getLesson('ja-n5-l1');
      await openLessonViaCatalog(pageA, /japanese|日本語|tiếng nhật/i, 'N5', 1);
      await solveLessonQuizInUI(pageA, jaN5L1);

      // User A creates a Study Group in UI
      await navigateSection(pageA, /social|friends|groups|bạn bè|nhóm/i);
      await pageA.locator('[data-testid="social-tab-groups"]').click();
      await pageA.locator('[data-testid="create-group-name"]').waitFor({ state: 'visible', timeout: 4000 });
      await pageA.locator('[data-testid="create-group-name"]').fill(`Squad ${stamp}`);
      await pageA.locator('[data-testid="create-group-submit"]').click();
      await pageA.locator('[data-testid="group-detail"]').waitFor({ state: 'visible', timeout: 6000 });
      await pageA.waitForLoadState('networkidle');

      // Capture User A's friend code and group invite code
      const userAMeta = await pageA.evaluate(async () => {
        const [me, groups] = await Promise.all([
          fetch('/api/auth/me').then((r) => r.json()),
          fetch('/api/groups').then((r) => r.json())
        ]);
        return {
          friendCode: me.data.user.friendCode,
          inviteCode: groups.data.groups[0]?.inviteCode,
          groupId: groups.data.groups[0]?.id
        };
      });
      assert.match(userAMeta.friendCode, /^LN-/);
      assert.match(userAMeta.inviteCode, /^GRP-/);

      // User B registers in contextB and adds User A by Friend Code
      await registerUserViaUI(pageB, serverCtx.baseUrl, userB);
      await navigateSection(pageB, /social|friends|groups|bạn bè|nhóm/i);

      await pageB.locator('[data-testid="friend-code-input"]').waitFor({ state: 'visible', timeout: 4000 });
      await pageB.locator('[data-testid="friend-code-input"]').fill(userAMeta.friendCode);
      await pageB.locator('[data-testid="friend-code-submit"]').click();
      await pageB.waitForFunction(
        (uname) => document.body.innerText.includes(uname),
        userA.username,
        { timeout: 6000 }
      );

      // User A refreshes / views Social and accepts friend request
      await pageA.reload({ waitUntil: 'networkidle' });
      await navigateSection(pageA, /social|friends|bạn bè/i);
      const acceptBtn = pageA.locator('[data-testid^="friend-accept-"]').first();
      await acceptBtn.waitFor({ state: 'visible', timeout: 5000 });
      await acceptBtn.click();
      await pageA.locator('[data-testid="friends-list"]').waitFor({ state: 'visible', timeout: 5000 });

      // User B joins User A's group via GRP-XXXX invite code
      await pageB.locator('[data-testid="social-tab-groups"]').click();
      await pageB.locator('[data-testid="join-group-code-input"]').waitFor({ state: 'visible', timeout: 4000 });
      await pageB.locator('[data-testid="join-group-code-input"]').fill(userAMeta.inviteCode);
      await pageB.locator('[data-testid="join-group-submit"]').click();
      await pageB.locator('[data-testid="group-detail"]').waitFor({ state: 'visible', timeout: 6000 });

      // User A posts a manual study note
      const noteTitle = `Daily Polyglot Milestone #${stamp}`;
      const noteText = `Studied EN + JA today! #${stamp}`;
      await pageA.locator('[data-testid="social-tab-feed"]').click();
      await pageA.locator('[data-testid="feed-title-input"]').waitFor({ state: 'visible', timeout: 4000 });
      await pageA.locator('[data-testid="feed-title-input"]').fill(noteTitle);
      await pageA.locator('[data-testid="feed-body-input"]').fill(noteText);
      await pageA.locator('[data-testid="feed-post-submit"]').click();
      await pageA.waitForFunction(
        (txt) => document.body.innerText.includes(txt),
        noteText,
        { timeout: 6000 }
      );

      // User B sees note in Feed, cheers, and comments
      await pageB.reload({ waitUntil: 'networkidle' });
      await navigateSection(pageB, /social|feed|bạn bè|cộng đồng/i);
      await pageB.locator('[data-testid="social-tab-feed"]').click();
      await pageB.locator('[data-testid="feed-posts-list"]').waitFor({ state: 'visible', timeout: 6000 });

      const targetPost = pageB.locator('[data-testid^="feed-post-"]', { hasText: noteText }).first();
      await targetPost.waitFor({ state: 'visible', timeout: 6000 });
      await targetPost.locator('[data-testid^="feed-cheer-"]').click();
      await targetPost.locator('[data-testid^="feed-comment-input-"]').fill('Great job Alice!');
      await targetPost.locator('[data-testid^="feed-comment-submit-"]').click();
      await pageB.waitForFunction(
        () => document.body.innerText.includes('Great job Alice!'),
        null,
        { timeout: 6000 }
      );

      // Verify Leaderboard UI renders Friends leaderboard
      await pageB.locator('[data-testid="social-tab-leaderboard"]').click();
      await pageB.locator('[data-testid="lb-scope-select"]').selectOption('friends');
      await pageB.locator(`[data-testid="lb-row-${userA.username}"]`).waitFor({ state: 'visible', timeout: 5000 });
      await pageB.locator(`[data-testid="lb-row-${userB.username}"]`).waitFor({ state: 'visible', timeout: 5000 });

      // Verify Friends & Group Leaderboard rankings + collective XP on both sides
      const [lbA, lbB, groupDetailB] = await Promise.all([
        pageA.evaluate(async (gid) => {
          const [friendsLb, groupLb] = await Promise.all([
            fetch('/api/leaderboard?scope=friends&timeframe=weekly').then((r) => r.json()),
            fetch(`/api/leaderboard?scope=group&groupId=${gid}&timeframe=weekly`).then((r) => r.json())
          ]);
          return { friendsLb, groupLb };
        }, userAMeta.groupId),
        pageB.evaluate(async (gid) => {
          const [friendsLb, groupLb] = await Promise.all([
            fetch('/api/leaderboard?scope=friends&timeframe=weekly').then((r) => r.json()),
            fetch(`/api/leaderboard?scope=group&groupId=${gid}&timeframe=weekly`).then((r) => r.json())
          ]);
          return { friendsLb, groupLb };
        }, userAMeta.groupId),
        pageB.evaluate(async (gid) =>
          fetch(`/api/groups/${gid}`).then((r) => r.json()),
        userAMeta.groupId)
      ]);

      assert.equal(lbA.friendsLb.data.entries.length, 2);
      assert.equal(lbB.friendsLb.data.entries.length, 2);
      assert.equal(lbA.friendsLb.data.entries[0].username, userA.username);
      assert.equal(lbA.groupLb.data.entries.length, 2);
      assert.ok(
        groupDetailB.data.collectiveWeeklyXp >= 100,
        'Collective group XP must reflect Alice lessons'
      );

      assertNoRuntimeErrors(errorsA, 'Tier 4 User A');
      assertNoRuntimeErrors(errorsB, 'Tier 4 User B');
    } finally {
      await contextA.close();
      await contextB.close();
    }

    // T4.2 Seeded Demo DB + Demo Login Verification
    const seedContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const seedPage = await seedContext.newPage();
    const seedErrors = attachRuntimeGuards(seedPage);
    try {
      await loginUserViaUI(seedPage, seededServerCtx.baseUrl, 'minh_anh', 'DemoPass123!');
      await seedPage.waitForFunction(
        () => document.body.innerText.includes('Minh Anh'),
        null,
        { timeout: 6000 }
      );
      const demoGroups = await seedPage.evaluate(async () =>
        fetch('/api/groups').then((r) => r.json())
      );
      assert.ok(
        demoGroups.data.groups.some((g) => g.inviteCode === 'GRP-CLUB'),
        'Seeded demo server should include GRP-CLUB group'
      );
      assertNoRuntimeErrors(seedErrors, 'Tier 4 Demo Seed');
    } finally {
      await seedContext.close();
    }
  });
});
