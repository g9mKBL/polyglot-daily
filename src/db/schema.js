export function initSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      email TEXT UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      friend_code TEXT NOT NULL UNIQUE,
      avatar_color TEXT NOT NULL DEFAULT '#2563eb',
      target_languages TEXT NOT NULL DEFAULT '["en","zh","ja"]',
      active_language TEXT NOT NULL DEFAULT 'en' CHECK (active_language IN ('en','zh','ja')),
      daily_xp_goal INTEGER NOT NULL DEFAULT 50,
      auto_share_milestones INTEGER NOT NULL DEFAULT 1,
      timezone_offset_min INTEGER NOT NULL DEFAULT 420,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_stats (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      total_xp INTEGER NOT NULL DEFAULT 0,
      en_xp INTEGER NOT NULL DEFAULT 0,
      zh_xp INTEGER NOT NULL DEFAULT 0,
      ja_xp INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_active_date TEXT,
      lessons_completed_count INTEGER NOT NULL DEFAULT 0,
      vocab_mastered_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_activity_log (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_date TEXT NOT NULL,
      xp_earned INTEGER NOT NULL DEFAULT 0,
      en_xp INTEGER NOT NULL DEFAULT 0,
      zh_xp INTEGER NOT NULL DEFAULT 0,
      ja_xp INTEGER NOT NULL DEFAULT 0,
      lessons_completed INTEGER NOT NULL DEFAULT 0,
      quizzes_taken INTEGER NOT NULL DEFAULT 0,
      vocab_reviewed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, activity_date)
    );

    CREATE TABLE IF NOT EXISTS user_lesson_progress (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL,
      language TEXT NOT NULL CHECK (language IN ('en','zh','ja')),
      level_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('not_started','in_progress','completed')),
      best_score INTEGER NOT NULL DEFAULT 0,
      attempts_count INTEGER NOT NULL DEFAULT 0,
      xp_earned INTEGER NOT NULL DEFAULT 0,
      last_studied_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      PRIMARY KEY (user_id, lesson_id)
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL,
      language TEXT NOT NULL CHECK (language IN ('en','zh','ja')),
      level_code TEXT NOT NULL,
      score INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      xp_awarded INTEGER NOT NULL,
      answers_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_vocab_srs (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vocab_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      language TEXT NOT NULL CHECK (language IN ('en','zh','ja')),
      mastery_level INTEGER NOT NULL DEFAULT 0,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      interval_days INTEGER NOT NULL DEFAULT 0,
      repetitions INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      incorrect_count INTEGER NOT NULL DEFAULT 0,
      next_review_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_reviewed_at TEXT,
      PRIMARY KEY (user_id, vocab_id)
    );

    CREATE TABLE IF NOT EXISTS user_mistakes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      language TEXT NOT NULL CHECK (language IN ('en','zh','ja')),
      wrong_count INTEGER NOT NULL DEFAULT 1,
      last_wrong_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, lesson_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      responded_at TEXT,
      CHECK (user_a_id < user_b_id),
      UNIQUE (user_a_id, user_b_id)
    );

    CREATE TABLE IF NOT EXISTS study_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      focus_language TEXT NOT NULL DEFAULT 'all' CHECK (focus_language IN ('all','en','zh','ja')),
      invite_code TEXT NOT NULL UNIQUE,
      daily_group_xp_goal INTEGER NOT NULL DEFAULT 200,
      weekly_group_xp_goal INTEGER NOT NULL DEFAULT 1000,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS study_group_members (
      group_id INTEGER NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS feed_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_type TEXT NOT NULL CHECK (post_type IN ('lesson_completed','level_milestone','streak_milestone','study_note')),
      visibility TEXT NOT NULL DEFAULT 'friends' CHECK (visibility IN ('friends','group','public')),
      group_id INTEGER REFERENCES study_groups(id) ON DELETE CASCADE,
      language TEXT CHECK (language IN ('en','zh','ja')),
      level_code TEXT,
      lesson_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feed_cheers (
      post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reaction TEXT NOT NULL DEFAULT 'cheer',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS feed_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_daily_activity_date ON daily_activity_log(activity_date);
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_vocab_srs_due ON user_vocab_srs(user_id, language, next_review_at);
    CREATE INDEX IF NOT EXISTS idx_friendships_a ON friendships(user_a_id, status);
    CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships(user_b_id, status);
    CREATE INDEX IF NOT EXISTS idx_feed_posts_created ON feed_posts(created_at, id);
  `);
}
