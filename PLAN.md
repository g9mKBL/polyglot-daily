# PLAN.md — Polyglot Daily (Multilingual Learning Website: EN / ZH / JA)

## 1. Overview & Goals
**Polyglot Daily** is a full-stack multilingual learning web application for **English (CEFR A1–C2)**, **Mandarin Chinese (HSK 1–6)**, and **Japanese (JLPT N5–N1)** built for daily individual study and social learning among friends.

- **Pre-compiled Curriculum**: 17 tiered levels × 3 structured lessons = **51 lessons** with bilingual (`vi` + `en`) glosses, phonetic guides (English IPA, Chinese tone-marked Pinyin, Japanese `漢字[かな]` Furigana + Romaji), vocabulary, grammar guides, dialogues/readings, and 4-mode interactive quizzes.
- **Persistent User Accounts & Progression**: User registration/login, profile preferences, server-side quiz grading (`>= 70%` pass), deterministic XP, local-calendar daily streaks, SM-2-lite vocabulary SRS flashcards, and persistent mistake bank.
- **Social & Friend Features**: Friend codes (`LN-XXXX`), user search, friend requests (with auto-accept on mutual requests), study groups (`GRP-XXXX` invite codes) with collective daily/weekly XP goals, Global/Friends/Group leaderboards, and a progress-sharing feed with milestone auto-sharing, manual study notes, cheers, and comments.

---

## 2. Architecture & Technical Stack
- **Runtime**: Node.js `v24.21.0` ESM (`"type": "module"`).
- **Backend**: Pure-JS `express` REST + static server (`src/app.js`, `src/server.js`).
- **Database**: Built-in `node:sqlite` (`DatabaseSync`) writing to `data/app.db` (configurable via `DB_PATH`) with `PRAGMA journal_mode = WAL;` and `PRAGMA foreign_keys = ON;`. Zero native C++ addons (`better-sqlite3`, `bcrypt`, `sqlite3` are forbidden).
- **Authentication & Security**: Built-in `node:crypto` (`scryptSync` + 16-byte salt + `timingSafeEqual` for passwords; `randomBytes(32)` + SHA-256 `token_hash` stored in `sessions` table). Session transport via `HttpOnly; SameSite=Lax; Path=/` cookie `sid` with `Authorization: Bearer <token>` fallback.
- **Frontend**: Bundler-free HTML5, modular CSS (`public/styles/main.css`), and Vanilla ES Modules (`public/js/**`), with Web Speech API TTS (`en-US`, `zh-CN`, `ja-JP`) and non-blocking phonetic guide fallback.
- **Testing**:
  - Unit & Curriculum & API Integration: built-in `node --test` (`node:test` + `node:assert/strict` + native `fetch` on ephemeral `server.listen(0)` and temp DBs with `AUTO_SEED=false`).
  - Browser E2E: `playwright-core` (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) driving pre-installed system Chrome/Edge.

---

## 3. Repository Layout & Module Ownership (Zero File Overlap)

```text
d:\Download\test dự án\
├── PLAN.md
├── GEMINI.md
├── package.json
├── .gitignore
├── data/
│   └── .gitkeep
├── content/
│   ├── catalog.json
│   ├── index.js
│   ├── en/{a1,a2,b1,b2,c1,c2}.json
│   ├── zh/{hsk1,hsk2,hsk3,hsk4,hsk5,hsk6}.json
│   └── ja/{n5,n4,n3,n2,n1}.json
├── src/
│   ├── app.js
│   ├── server.js
│   ├── db/
│   │   ├── connection.js
│   │   ├── schema.js
│   │   └── seed.js
│   ├── middleware/
│   │   └── auth.js
│   ├── services/
│   │   ├── progression.js
│   │   └── social.js
│   └── routes/
│       ├── auth.js
│       ├── courses.js
│       ├── progress.js
│       └── social.js
├── public/
│   ├── index.html
│   ├── styles/
│   │   └── main.css
│   └── js/
│       ├── api.js
│       ├── state.js
│       ├── tts.js
│       ├── ruby.js
│       ├── main.js
│       └── views/
│           ├── authView.js
│           ├── dashboardView.js
│           ├── catalogView.js
│           ├── lessonView.js
│           ├── reviewView.js
│           └── socialView.js
└── tests/
    ├── unit/
    │   ├── content.test.js
    │   └── logic.test.js
    ├── integration/
    │   └── api.test.js
    └── e2e/
        └── app.spec.mjs
```

### Worker Ownership Split
| Role / Worker | Owned Paths |
|---|---|
| **Worker 1 (Docs + Backend, DB & API Tests)** | `PLAN.md`, `GEMINI.md`, `package.json`, `.gitignore`, `data/.gitkeep`, `src/**`, `tests/unit/logic.test.js`, `tests/integration/api.test.js` |
| **Worker 2 (Multilingual Curriculum & Content Tests)** | `content/**`, `tests/unit/content.test.js` |
| **Worker 3 (Frontend Web UI)** | `public/**` |
| **E2E Test Writer** | `tests/e2e/app.spec.mjs` |

---

## 4. Frozen Interface Contracts

### 4.1 Curriculum JSON Schema (`content/`)
- **`content/catalog.json`**:
  ```json
  {
    "version": "1.0.0",
    "languages": [
      {
        "id": "en | zh | ja",
        "name": { "native": "...", "vi": "...", "en": "..." },
        "ttsLocale": "en-US | zh-CN | ja-JP",
        "levelSystem": "CEFR | HSK | JLPT",
        "levels": ["..."]
      }
    ]
  }
  ```
- **Level files (`content/<lang>/<level>.json`)**:
  - `levelId` (e.g. `"en-a1"`, `"zh-hsk1"`, `"ja-n5"`), `language` (`"en"|"zh"|"ja"`), `code`, `order`, `title: { vi, en }`, `subtitle: { vi, en }`, `estimatedMinutes`, `lessons` (3 lessons).
  - Each `Lesson`:
    - `id` (e.g. `"en-a1-l1"`), `levelId`, `order` (`1|2|3`), `title: { native, vi, en }`, `topic`, `summary: { vi, en }`, `xpReward` (default `50`).
    - `vocabulary` (`>= 6` items): `{ id, term, reading, romaji?, rubyText?, partOfSpeech, meaning: { vi, en }, example: { text, rubyText?, reading, meaning: { vi, en } }, note?: { vi, en } }`.
    - `grammar` (`>= 2` items): `{ id, pattern, title: { vi, en }, structure, explanation: { vi, en }, usageNote: { vi, en }, examples: [{ text, rubyText?, reading, meaning: { vi, en } }] }`.
    - `dialogue`: `{ title: { vi, en }, mode: "dialogue"|"reading", context: { vi, en }, lines: [{ speaker, text, rubyText?, reading, meaning: { vi, en } }], culturalNote: { vi, en } }`.
    - `quizzes` (`>= 4` items covering `>= 3` types):
      - `"multiple_choice" | "reading_match" | "fill_blank"`: `{ id, type, prompt: { vi, en }, targetText?, targetReading?, ttsText?, options: string[4], correctIndex: 0..3, explanation: { vi, en } }`
      - `"sentence_order"`: `{ id, type: "sentence_order", prompt: { vi, en }, targetMeaning: { vi, en }, tokens: string[], correctOrder: string[], correctSentence: string, explanation: { vi, en } }`
- **`content/index.js` exports**:
  `getCatalog()`, `getLanguage(lang)`, `getLevel(levelId)`, `getLevelsByLanguage(lang)`, `getAllLevels()`, `getLesson(lessonId)`, `getVocabById(vocabId)`, `getVocabByLanguage(lang)`, `validateCurriculum(catalog, levelsMap)`.

### 4.2 SQLite Schema (`src/db/schema.js`)
14 relational tables initialized idempotently with `PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;`:
- `users (id PK, username UNIQUE NOCASE, display_name, email UNIQUE NOCASE, password_hash, friend_code UNIQUE, avatar_color, target_languages, active_language, daily_xp_goal, auto_share_milestones, timezone_offset_min, is_demo, created_at)`
- `sessions (token_hash PK, user_id FK, expires_at, created_at)`
- `user_stats (user_id PK FK, total_xp, en_xp, zh_xp, ja_xp, current_streak, longest_streak, last_active_date, lessons_completed_count, vocab_mastered_count, updated_at)`
- `daily_activity_log (user_id FK, activity_date, xp_earned, en_xp, zh_xp, ja_xp, lessons_completed, quizzes_taken, vocab_reviewed, updated_at, PK(user_id, activity_date))`
- `user_lesson_progress (user_id FK, lesson_id, language, level_code, status, best_score, attempts_count, xp_earned, last_studied_at, completed_at, PK(user_id, lesson_id))`
- `quiz_attempts (id PK, user_id FK, lesson_id, language, level_code, score, correct_count, total_questions, xp_awarded, answers_json, created_at)`
- `user_vocab_srs (user_id FK, vocab_id, lesson_id, language, mastery_level, ease_factor, interval_days, repetitions, correct_count, incorrect_count, next_review_at, last_reviewed_at, PK(user_id, vocab_id))`
- `user_mistakes (user_id FK, lesson_id, question_id, language, wrong_count, last_wrong_at, PK(user_id, lesson_id, question_id))`
- `friendships (id PK, user_a_id FK, user_b_id FK, requester_id FK, status, created_at, responded_at, CHECK(user_a_id < user_b_id), UNIQUE(user_a_id, user_b_id))`
- `study_groups (id PK, name, description, focus_language, invite_code UNIQUE, daily_group_xp_goal, weekly_group_xp_goal, owner_id FK, created_at)`
- `study_group_members (group_id FK, user_id FK, role, joined_at, PK(group_id, user_id))`
- `feed_posts (id PK, author_id FK, post_type, visibility, group_id FK nullable, language nullable, level_code nullable, lesson_id nullable, title, body, metadata_json, created_at)`
- `feed_cheers (post_id FK, user_id FK, reaction, created_at, PK(post_id, user_id))`
- `feed_comments (id PK, post_id FK, author_id FK, body, created_at)`

### 4.3 REST API Contract
All JSON responses use `{ ok: true, data: ... }` or `{ ok: false, error: { code, message } }`.
- **Health & Auth**:
  - `GET /api/health`
  - `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/demo-accounts`, `PATCH /api/profile`
- **Courses & Learning Progression**:
  - `GET /api/courses` (`?language=en|zh|ja`), `GET /api/levels/:levelId`, `GET /api/lessons/:lessonId`
  - `POST /api/lessons/:lessonId/complete` (`{ answers, shareToFeed?, shareGroupId? }`, server-side graded, pass threshold `score >= 70`)
  - `GET /api/vocab/review` (`?language=&lessonId=&mode=due|lesson|all&limit=20`)
  - `POST /api/vocab/:vocabId/review` (`{ rating: 'again'|'hard'|'good'|'easy' }`)
  - `GET /api/mistakes` (`?language=`)
  - `GET /api/progress/summary`
- **Social**:
  - `GET /api/friends`, `GET /api/friends/search?q=`, `POST /api/friends/request`, `POST /api/friends/requests/:id/respond`, `DELETE /api/friends/:friendUserId`
  - `GET /api/groups`, `POST /api/groups`, `POST /api/groups/join`, `GET /api/groups/:groupId`, `POST /api/groups/:groupId/leave`
  - `GET /api/leaderboard` (`?scope=global|friends|group&groupId=&timeframe=daily|weekly|all_time&language=all|en|zh|ja`)
  - `GET /api/feed` (`?scope=all|friends|group&groupId=&limit=20`), `POST /api/feed`, `POST /api/feed/:postId/cheer`, `POST /api/feed/:postId/comments`, `DELETE /api/feed/:postId`

---

## 5. Milestones & Verification Gates
1. **M0 (Planning & Docs)**: `PLAN.md` and `GEMINI.md` created in `d:\Download\test dự án` before main code.
2. **M1-Backend / M1-Curriculum / M1-Frontend / M1-E2E**: Parallel implementation within strict module ownership boundaries.
3. **M2 (Verification Gate)**:
   - `npm run test:unit` (`content.test.js` + `logic.test.js`) -> 100% pass, exit code 0.
   - `npm run test:integration` (`api.test.js` on isolated temp DB with `AUTO_SEED=false`) -> 100% pass, exit code 0.
   - `npm run test:e2e` (`app.spec.mjs` via `playwright-core` + system Chrome/Edge) -> 100% pass, exit code 0.
