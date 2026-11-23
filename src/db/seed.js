import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../middleware/auth.js';
import { openDatabase, getDefaultDbPath } from './connection.js';
import { initSchema } from './schema.js';
import {
  addDaysToDateString,
  getLocalDateString
} from '../services/progression.js';

const DEMO_USERS = [
  {
    username: 'minh_anh',
    displayName: 'Minh Anh',
    email: 'minh_anh@demo.polyglot.local',
    friendCode: 'LN-MINH',
    avatarColor: '#2563eb',
    targetLanguages: ['en', 'ja'],
    activeLanguage: 'en',
    dailyXpGoal: 60,
    currentStreak: 7,
    longestStreak: 12,
    enXp: 270,
    zhXp: 30,
    jaXp: 120,
    lessonsCompleted: 7,
    vocabMastered: 18,
    dailySplit: [
      { daysAgo: 0, en: 50, zh: 0, ja: 20, lessons: 1, quizzes: 1, vocab: 6 },
      { daysAgo: 1, en: 60, zh: 0, ja: 30, lessons: 2, quizzes: 2, vocab: 8 },
      { daysAgo: 2, en: 40, zh: 15, ja: 20, lessons: 1, quizzes: 1, vocab: 5 },
      { daysAgo: 3, en: 70, zh: 15, ja: 25, lessons: 2, quizzes: 2, vocab: 7 },
      { daysAgo: 4, en: 50, zh: 0, ja: 25, lessons: 1, quizzes: 1, vocab: 6 }
    ],
    completedLessons: [
      { id: 'en-a1-l1', lang: 'en', code: 'A1', score: 100, xp: 65 },
      { id: 'en-a1-l2', lang: 'en', code: 'A1', score: 90, xp: 59 },
      { id: 'ja-n5-l1', lang: 'ja', code: 'N5', score: 85, xp: 58 }
    ]
  },
  {
    username: 'linh_dan',
    displayName: 'Linh Đan',
    email: 'linh_dan@demo.polyglot.local',
    friendCode: 'LN-LINH',
    avatarColor: '#0d9488',
    targetLanguages: ['en', 'zh'],
    activeLanguage: 'zh',
    dailyXpGoal: 50,
    currentStreak: 5,
    longestStreak: 9,
    enXp: 110,
    zhXp: 180,
    jaXp: 20,
    lessonsCompleted: 5,
    vocabMastered: 14,
    dailySplit: [
      { daysAgo: 0, en: 20, zh: 45, ja: 0, lessons: 1, quizzes: 1, vocab: 5 },
      { daysAgo: 1, en: 30, zh: 40, ja: 0, lessons: 1, quizzes: 1, vocab: 6 },
      { daysAgo: 2, en: 20, zh: 35, ja: 10, lessons: 1, quizzes: 1, vocab: 4 },
      { daysAgo: 3, en: 25, zh: 30, ja: 10, lessons: 1, quizzes: 1, vocab: 5 },
      { daysAgo: 4, en: 15, zh: 30, ja: 0, lessons: 1, quizzes: 1, vocab: 4 }
    ],
    completedLessons: [
      { id: 'zh-hsk1-l1', lang: 'zh', code: 'HSK1', score: 100, xp: 65 },
      { id: 'en-a1-l1', lang: 'en', code: 'A1', score: 80, xp: 58 }
    ]
  },
  {
    username: 'kenji_tan',
    displayName: 'Kenji Tan',
    email: 'kenji_tan@demo.polyglot.local',
    friendCode: 'LN-KENJ',
    avatarColor: '#7c3aed',
    targetLanguages: ['ja', 'en'],
    activeLanguage: 'ja',
    dailyXpGoal: 80,
    currentStreak: 12,
    longestStreak: 15,
    enXp: 220,
    zhXp: 60,
    jaXp: 400,
    lessonsCompleted: 11,
    vocabMastered: 28,
    dailySplit: [
      { daysAgo: 0, en: 30, zh: 10, ja: 70, lessons: 2, quizzes: 2, vocab: 9 },
      { daysAgo: 1, en: 40, zh: 15, ja: 85, lessons: 2, quizzes: 2, vocab: 10 },
      { daysAgo: 2, en: 50, zh: 10, ja: 80, lessons: 2, quizzes: 2, vocab: 8 },
      { daysAgo: 3, en: 50, zh: 15, ja: 90, lessons: 3, quizzes: 3, vocab: 12 },
      { daysAgo: 4, en: 50, zh: 10, ja: 75, lessons: 2, quizzes: 2, vocab: 9 }
    ],
    completedLessons: [
      { id: 'ja-n5-l1', lang: 'ja', code: 'N5', score: 100, xp: 65 },
      { id: 'ja-n5-l2', lang: 'ja', code: 'N5', score: 95, xp: 60 },
      { id: 'en-a2-l1', lang: 'en', code: 'A2', score: 90, xp: 59 }
    ]
  },
  {
    username: 'wei_chen',
    displayName: 'Wei Chen',
    email: 'wei_chen@demo.polyglot.local',
    friendCode: 'LN-WEIC',
    avatarColor: '#ea580c',
    targetLanguages: ['zh', 'en'],
    activeLanguage: 'zh',
    dailyXpGoal: 50,
    currentStreak: 3,
    longestStreak: 6,
    enXp: 75,
    zhXp: 120,
    jaXp: 0,
    lessonsCompleted: 3,
    vocabMastered: 9,
    dailySplit: [
      { daysAgo: 0, en: 15, zh: 35, ja: 0, lessons: 1, quizzes: 1, vocab: 4 },
      { daysAgo: 1, en: 20, zh: 40, ja: 0, lessons: 1, quizzes: 1, vocab: 5 },
      { daysAgo: 2, en: 15, zh: 25, ja: 0, lessons: 1, quizzes: 1, vocab: 3 },
      { daysAgo: 3, en: 15, zh: 10, ja: 0, lessons: 0, quizzes: 1, vocab: 2 },
      { daysAgo: 4, en: 10, zh: 10, ja: 0, lessons: 0, quizzes: 0, vocab: 2 }
    ],
    completedLessons: [
      { id: 'zh-hsk1-l1', lang: 'zh', code: 'HSK1', score: 90, xp: 59 },
      { id: 'en-a1-l1', lang: 'en', code: 'A1', score: 75, xp: 58 }
    ]
  }
];

export function seedDemoData(db) {
  const today = getLocalDateString(420);
  const demoPasswordHash = hashPassword('DemoPass123!');

  db.exec('BEGIN');
  try {
    const userIds = new Map();

    for (const demo of DEMO_USERS) {
      let existing = db
        .prepare('SELECT id FROM users WHERE username = ?')
        .get(demo.username);

      if (!existing) {
        const info = db
          .prepare(
            `INSERT INTO users
              (username, display_name, email, password_hash, friend_code, avatar_color, target_languages, active_language, daily_xp_goal, auto_share_milestones, timezone_offset_min, is_demo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 420, 1)`
          )
          .run(
            demo.username,
            demo.displayName,
            demo.email,
            demoPasswordHash,
            demo.friendCode,
            demo.avatarColor,
            JSON.stringify(demo.targetLanguages),
            demo.activeLanguage,
            demo.dailyXpGoal
          );
        existing = { id: info.lastInsertRowid };
      }

      const userId = existing.id;
      userIds.set(demo.username, userId);

      const totalXp = demo.enXp + demo.zhXp + demo.jaXp;
      db.prepare(
        `INSERT OR IGNORE INTO user_stats
          (user_id, total_xp, en_xp, zh_xp, ja_xp, current_streak, longest_streak, last_active_date, lessons_completed_count, vocab_mastered_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        userId,
        totalXp,
        demo.enXp,
        demo.zhXp,
        demo.jaXp,
        demo.currentStreak,
        demo.longestStreak,
        today,
        demo.lessonsCompleted,
        demo.vocabMastered
      );

      for (const day of demo.dailySplit) {
        const activityDate = addDaysToDateString(today, -day.daysAgo);
        const dayTotal = day.en + day.zh + day.ja;
        db.prepare(
          `INSERT OR IGNORE INTO daily_activity_log
            (user_id, activity_date, xp_earned, en_xp, zh_xp, ja_xp, lessons_completed, quizzes_taken, vocab_reviewed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          userId,
          activityDate,
          dayTotal,
          day.en,
          day.zh,
          day.ja,
          day.lessons,
          day.quizzes,
          day.vocab
        );
      }

      for (const lsn of demo.completedLessons) {
        db.prepare(
          `INSERT OR IGNORE INTO user_lesson_progress
            (user_id, lesson_id, language, level_code, status, best_score, attempts_count, xp_earned, completed_at)
           VALUES (?, ?, ?, ?, 'completed', ?, 1, ?, datetime('now'))`
        ).run(userId, lsn.id, lsn.lang, lsn.code, lsn.score, lsn.xp);
      }
    }

    // Accepted friendships among all 4 demo users
    const names = DEMO_USERS.map((u) => u.username);
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const id1 = userIds.get(names[i]);
        const id2 = userIds.get(names[j]);
        const userA = Math.min(id1, id2);
        const userB = Math.max(id1, id2);
        db.prepare(
          `INSERT OR IGNORE INTO friendships
            (user_a_id, user_b_id, requester_id, status, responded_at)
           VALUES (?, ?, ?, 'accepted', datetime('now'))`
        ).run(userA, userB, id1);
      }
    }

    // Study group: Polyglot Daily Club (GRP-CLUB)
    const ownerId = userIds.get('minh_anh');
    let groupRow = db
      .prepare("SELECT id FROM study_groups WHERE invite_code = 'GRP-CLUB'")
      .get();

    if (!groupRow) {
      const gInfo = db
        .prepare(
          `INSERT INTO study_groups
            (name, description, focus_language, invite_code, daily_group_xp_goal, weekly_group_xp_goal, owner_id)
           VALUES (?, ?, 'all', 'GRP-CLUB', 200, 1200, ?)`
        )
        .run(
          'Polyglot Daily Club',
          'Daily practice crew for English, Mandarin Chinese, and Japanese learners.',
          ownerId
        );
      groupRow = { id: gInfo.lastInsertRowid };
    }

    for (const username of names) {
      const uid = userIds.get(username);
      db.prepare(
        `INSERT OR IGNORE INTO study_group_members (group_id, user_id, role)
         VALUES (?, ?, ?)`
      ).run(groupRow.id, uid, uid === ownerId ? 'owner' : 'member');
    }

    // Sample feed posts if none exist for demo users yet
    const existingDemoPosts = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM feed_posts fp
         JOIN users u ON u.id = fp.author_id
         WHERE u.is_demo = 1`
      )
      .get().cnt;

    if (existingDemoPosts === 0) {
      const minhId = userIds.get('minh_anh');
      const linhId = userIds.get('linh_dan');
      const kenjiId = userIds.get('kenji_tan');
      const weiId = userIds.get('wei_chen');

      const p1 = db
        .prepare(
          `INSERT INTO feed_posts
            (author_id, post_type, visibility, group_id, language, level_code, lesson_id, title, body, metadata_json)
           VALUES (?, 'lesson_completed', 'friends', NULL, 'en', 'A1', 'en-a1-l1', ?, ?, ?)`
        )
        .run(
          minhId,
          'Completed A1 · First Meetings & Identity (100%)',
          'Hit a 7-day streak today! Practiced English introductions and daily routines.',
          JSON.stringify({ score: 100, xpAwarded: 65 })
        ).lastInsertRowid;

      const p2 = db
        .prepare(
          `INSERT INTO feed_posts
            (author_id, post_type, visibility, group_id, language, level_code, lesson_id, title, body, metadata_json)
           VALUES (?, 'study_note', 'group', ?, 'zh', 'HSK1', NULL, ?, ?, ?)`
        )
        .run(
          linhId,
          groupRow.id,
          'Tone sandhi tip for Mandarin beginners (你好)',
          'Remember: when two 3rd-tone syllables appear together like nǐ hǎo, the first is pronounced like 2nd tone (ní hǎo)!',
          JSON.stringify({})
        ).lastInsertRowid;

      const p3 = db
        .prepare(
          `INSERT INTO feed_posts
            (author_id, post_type, visibility, group_id, language, level_code, lesson_id, title, body, metadata_json)
           VALUES (?, 'streak_milestone', 'friends', NULL, 'ja', 'N5', 'ja-n5-l2', ?, ?, ?)`
        )
        .run(
          kenjiId,
          '12-day Japanese & English study streak!',
          'Wrapped up JLPT N5 Lesson 2 and reviewed 12 kanji flashcards before work.',
          JSON.stringify({ streak: 12 })
        ).lastInsertRowid;

      // Sample cheers & comments
      db.prepare(
        'INSERT OR IGNORE INTO feed_cheers (post_id, user_id, reaction) VALUES (?, ?, ?)'
      ).run(p1, linhId, 'cheer');
      db.prepare(
        'INSERT OR IGNORE INTO feed_cheers (post_id, user_id, reaction) VALUES (?, ?, ?)'
      ).run(p1, kenjiId, 'cheer');
      db.prepare(
        'INSERT OR IGNORE INTO feed_cheers (post_id, user_id, reaction) VALUES (?, ?, ?)'
      ).run(p2, minhId, 'cheer');
      db.prepare(
        'INSERT OR IGNORE INTO feed_cheers (post_id, user_id, reaction) VALUES (?, ?, ?)'
      ).run(p3, weiId, 'cheer');

      db.prepare(
        'INSERT INTO feed_comments (post_id, author_id, body) VALUES (?, ?, ?)'
      ).run(p1, kenjiId, 'Nice 100% score! Keep that streak going!');
      db.prepare(
        'INSERT INTO feed_comments (post_id, author_id, body) VALUES (?, ?, ?)'
      ).run(p2, weiId, 'Super helpful reminder for HSK 1 tone pairs!');
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { seededUsers: DEMO_USERS.length };
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const dbPath = process.env.DB_PATH || getDefaultDbPath();
  const db = openDatabase(dbPath);
  initSchema(db);
  const res = seedDemoData(db);
  db.close();
  console.log(`Seeded ${res.seededUsers} demo accounts into ${dbPath}`);
}
