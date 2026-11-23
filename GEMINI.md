# GEMINI.md — Polyglot Daily Project Conventions & Developer Guide

## 1. Project Identity
- **App Name**: Polyglot Daily
- **Purpose**: Multilingual learning website (English CEFR A1–C2, Mandarin Chinese HSK 1–6, Japanese JLPT N5–N1) with user accounts, persistent learning progression, SRS flashcards, study groups, leaderboards, and progress feed.
- **Target Runtime**: Node.js `v24.21.0` (`"type": "module"`, ESM) on Windows (`d:\Download\test dự án`).

---

## 2. Commands (Run from `d:\Download\test dự án`)
- **Install dependencies** (with Playwright browser download skipped):
  ```powershell
  $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD="1"; npm install
  ```
- **Start server** (default `http://localhost:3000`; auto-seeds demo data on empty DB unless `AUTO_SEED=false`):
  ```powershell
  npm start
  ```
- **Seed demo dataset manually** (idempotent):
  ```powershell
  npm run seed
  ```
- **Run unit tests** (curriculum integrity + backend logic):
  ```powershell
  npm run test:unit
  ```
- **Run API & persistence integration tests**:
  ```powershell
  npm run test:integration
  ```
- **Run unit + integration tests**:
  ```powershell
  npm test
  ```
- **Run browser E2E tests** (`playwright-core` + system Chrome/Edge):
  ```powershell
  npm run test:e2e
  ```
- **Run full verification suite**:
  ```powershell
  npm run test:all
  ```

---

## 3. Hard Technical Rules
1. **No Native C++ Addons**:
   - Use ONLY Node.js built-in `node:sqlite` (`DatabaseSync`) and `node:crypto` (`scryptSync`, `timingSafeEqual`, `randomBytes`, `createHash`).
   - **FORBIDDEN**: `better-sqlite3`, `sqlite3`, `bcrypt`, or any package requiring `node-gyp` / MSVC.
2. **Playwright Constraint**:
   - Use `playwright-core` in `devDependencies` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.
   - **FORBIDDEN**: installing full `playwright`.
   - Auto-detect system browser in E2E (`process.env.BROWSER_PATH` -> `C:\Program Files\Google\Chrome\Application\chrome.exe` -> `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`).
3. **Unicode & Whitespace-Safe Path Handling**:
   - The workspace path `d:\Download\test dự án` contains spaces and Vietnamese diacritics.
   - Always resolve paths using `fileURLToPath(import.meta.url)` + `path.dirname(...)` + `path.join(...)`. Never rely on fragile `process.cwd()` relative assumptions or unquoted CLI paths.
4. **Database & Security Rules**:
   - Always enable `PRAGMA journal_mode = WAL;` and `PRAGMA foreign_keys = ON;`.
   - Use parameterized SQL queries (`db.prepare(...).get/all/run(...)`) exclusively — never string-interpolate user inputs into SQL.
   - Hash passwords with `scryptSync` + 16-byte random salt (`scrypt$<saltHex>$<hashHex>`) and verify with `timingSafeEqual`.
   - Store only SHA-256 `token_hash` in `sessions` and issue `HttpOnly; SameSite=Lax; Path=/` cookies (`sid`), with `Authorization: Bearer <token>` support for API clients/tests.
   - Never mutate production `data/app.db` in automated tests; tests must use isolated temp DB files with `AUTO_SEED=false`.
5. **UTF-8 & Content Integrity**:
   - All HTML, CSS, JS, and JSON files must be UTF-8 encoded to properly render Latin/IPA, Hanzi + tone-marked Pinyin (`ā á ǎ à`), and Japanese Kana/Kanji + `<ruby>` Furigana + Romaji.
   - Zero placeholder/mock/TODO data in curriculum or production paths.
6. **API Envelope Convention**:
   - Success: `{ "ok": true, "data": ... }`
   - Error: `{ "ok": false, "error": { "code": "...", "message": "..." } }`

---

## 4. Module Ownership Table
Agents and contributors must respect strict file ownership boundaries:

| Worker / Track | Owned Directories & Files |
|---|---|
| **Worker 1 (Docs, Backend & API Tests)** | `PLAN.md`, `GEMINI.md`, `package.json`, `.gitignore`, `data/.gitkeep`, `src/**`, `tests/unit/logic.test.js`, `tests/integration/api.test.js` |
| **Worker 2 (Curriculum & Content Tests)** | `content/**`, `tests/unit/content.test.js` |
| **Worker 3 (Frontend Web UI)** | `public/**` |
| **E2E Test Writer** | `tests/e2e/app.spec.mjs` |
