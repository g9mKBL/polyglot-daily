import express from 'express';
import {
  clearSessionCookie,
  createSession,
  formatUser,
  hashPassword,
  requireAuth,
  setSessionCookie,
  verifyPassword
} from '../middleware/auth.js';
import {
  AppError,
  getUserStatsSnapshot
} from '../services/progression.js';
import { generateCode } from '../services/social.js';

const AVATAR_COLORS = [
  '#2563eb',
  '#0d9488',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#16a34a'
];

function pickAvatarColor(username) {
  let sum = 0;
  for (let i = 0; i < username.length; i++) {
    sum = (sum + username.charCodeAt(i)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[sum];
}

function generateUniqueFriendCode(db) {
  for (let i = 0; i < 10; i++) {
    const code = generateCode('LN', 4);
    const exists = db
      .prepare('SELECT 1 FROM users WHERE friend_code = ?')
      .get(code);
    if (!exists) return code;
  }
  return generateCode('LN', 6);
}

export function createAuthRouter(db) {
  const router = express.Router();

  router.get('/auth/demo-accounts', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.avatar_color, u.active_language, u.friend_code,
                us.total_xp, us.current_streak
         FROM users u
         LEFT JOIN user_stats us ON us.user_id = u.id
         WHERE u.is_demo = 1
         ORDER BY u.id ASC`
      )
      .all();

    res.json({
      ok: true,
      data: {
        accounts: rows.map((r) => ({
          id: r.id,
          username: r.username,
          displayName: r.display_name,
          avatarColor: r.avatar_color,
          activeLanguage: r.active_language,
          friendCode: r.friend_code,
          totalXp: r.total_xp ?? 0,
          currentStreak: r.current_streak ?? 0
        }))
      }
    });
  });

  router.post('/auth/register', (req, res, next) => {
    try {
      const body = req.body || {};
      const username = String(body.username ?? '').trim();
      const password = String(body.password ?? '');
      const displayName = String(body.displayName ?? username).trim();
      const emailRaw =
        body.email !== undefined && body.email !== null
          ? String(body.email).trim()
          : '';
      const email = emailRaw.length > 0 ? emailRaw : null;

      if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
        throw new AppError(
          400,
          'INVALID_USERNAME',
          'Username must be 3-24 characters (letters, numbers, underscores)'
        );
      }
      if (password.length < 6 || password.length > 128) {
        throw new AppError(
          400,
          'INVALID_PASSWORD',
          'Password must be at least 6 characters'
        );
      }
      if (displayName.length < 1 || displayName.length > 40) {
        throw new AppError(
          400,
          'INVALID_DISPLAY_NAME',
          'Display name must be between 1 and 40 characters'
        );
      }
      if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AppError(400, 'INVALID_EMAIL', 'Invalid email format');
      }

      let targetLanguages = ['en', 'zh', 'ja'];
      if (Array.isArray(body.targetLanguages) && body.targetLanguages.length > 0) {
        const filtered = body.targetLanguages.filter((l) =>
          ['en', 'zh', 'ja'].includes(l)
        );
        if (filtered.length === 0) {
          throw new AppError(
            400,
            'INVALID_LANGUAGE',
            'targetLanguages must contain en, zh, or ja'
          );
        }
        targetLanguages = [...new Set(filtered)];
      }

      const activeLanguage = body.activeLanguage || targetLanguages[0] || 'en';
      if (!['en', 'zh', 'ja'].includes(activeLanguage)) {
        throw new AppError(
          400,
          'INVALID_LANGUAGE',
          "activeLanguage must be 'en', 'zh', or 'ja'"
        );
      }

      const dailyXpGoal =
        body.dailyXpGoal !== undefined ? Number(body.dailyXpGoal) : 50;
      if (!Number.isFinite(dailyXpGoal) || dailyXpGoal < 10 || dailyXpGoal > 500) {
        throw new AppError(
          400,
          'INVALID_GOAL',
          'dailyXpGoal must be between 10 and 500'
        );
      }

      let timezoneOffsetMin = 420;
      if (body.timezoneOffsetMin !== undefined) {
        const rawTz = body.timezoneOffsetMin;
        const offset =
          rawTz === null ||
          typeof rawTz === 'boolean' ||
          (typeof rawTz === 'string' && rawTz.trim() === '')
            ? NaN
            : Number(rawTz);
        if (!Number.isFinite(offset) || offset < -720 || offset > 840) {
          throw new AppError(
            400,
            'INVALID_TIMEZONE',
            'timezoneOffsetMin must be between -720 and 840'
          );
        }
        timezoneOffsetMin = Math.round(offset);
      }

      const existingUsername = db
        .prepare('SELECT id FROM users WHERE username = ?')
        .get(username);
      if (existingUsername) {
        throw new AppError(
          409,
          'DUPLICATE_USERNAME',
          'Username is already taken'
        );
      }

      if (email !== null) {
        const existingEmail = db
          .prepare('SELECT id FROM users WHERE email = ?')
          .get(email);
        if (existingEmail) {
          throw new AppError(
            409,
            'DUPLICATE_EMAIL',
            'Email is already registered'
          );
        }
      }

      const passwordHash = hashPassword(password);
      const friendCode = generateUniqueFriendCode(db);
      const avatarColor = pickAvatarColor(username);

      let userRow;
      let tokenInfo;

      db.exec('BEGIN');
      try {
        const insertInfo = db
          .prepare(
            `INSERT INTO users
              (username, display_name, email, password_hash, friend_code, avatar_color, target_languages, active_language, daily_xp_goal, auto_share_milestones, timezone_offset_min, is_demo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0)`
          )
          .run(
            username,
            displayName,
            email,
            passwordHash,
            friendCode,
            avatarColor,
            JSON.stringify(targetLanguages),
            activeLanguage,
            Math.round(dailyXpGoal),
            timezoneOffsetMin
          );

        const userId = insertInfo.lastInsertRowid;
        db.prepare('INSERT INTO user_stats (user_id) VALUES (?)').run(userId);
        tokenInfo = createSession(db, userId);
        userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      setSessionCookie(req, res, tokenInfo.rawToken);
      const user = formatUser(userRow);
      const snapshot = getUserStatsSnapshot(
        db,
        user.id,
        user.timezoneOffsetMin
      );

      res.status(201).json({
        ok: true,
        data: {
          user,
          stats: snapshot.stats,
          todayXp: snapshot.todayXp,
          token: tokenInfo.rawToken
        }
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/login', (req, res, next) => {
    try {
      const body = req.body || {};
      const identifier = String(
        body.usernameOrEmail ?? body.username ?? body.email ?? ''
      ).trim();
      const password = String(body.password ?? '');

      if (!identifier || !password) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'usernameOrEmail and password are required'
        );
      }

      const userRow = db
        .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
        .get(identifier, identifier);

      if (!userRow || !verifyPassword(password, userRow.password_hash)) {
        throw new AppError(
          401,
          'INVALID_CREDENTIALS',
          'Invalid username/email or password'
        );
      }

      const tokenInfo = createSession(db, userRow.id);
      setSessionCookie(req, res, tokenInfo.rawToken);

      const user = formatUser(userRow);
      const snapshot = getUserStatsSnapshot(
        db,
        user.id,
        user.timezoneOffsetMin
      );

      res.json({
        ok: true,
        data: {
          user,
          stats: snapshot.stats,
          todayXp: snapshot.todayXp,
          token: tokenInfo.rawToken
        }
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/logout', (req, res) => {
    if (req.sessionTokenHash) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(
        req.sessionTokenHash
      );
    }
    clearSessionCookie(req, res);
    res.json({
      ok: true,
      data: { loggedOut: true }
    });
  });

  router.get('/auth/me', requireAuth, (req, res) => {
    const snapshot = getUserStatsSnapshot(
      db,
      req.user.id,
      req.user.timezoneOffsetMin
    );
    res.json({
      ok: true,
      data: {
        user: req.user,
        stats: snapshot.stats,
        todayXp: snapshot.todayXp
      }
    });
  });

  router.patch('/profile', requireAuth, (req, res, next) => {
    try {
      const body = req.body || {};
      const updates = [];
      const params = [];

      if (body.displayName !== undefined) {
        const displayName = String(body.displayName).trim();
        if (displayName.length < 1 || displayName.length > 40) {
          throw new AppError(
            400,
            'INVALID_DISPLAY_NAME',
            'displayName must be between 1 and 40 characters'
          );
        }
        updates.push('display_name = ?');
        params.push(displayName);
      }

      if (body.targetLanguages !== undefined) {
        if (!Array.isArray(body.targetLanguages)) {
          throw new AppError(
            400,
            'INVALID_LANGUAGE',
            'targetLanguages must be an array'
          );
        }
        const valid = [...new Set(body.targetLanguages.filter((l) => ['en', 'zh', 'ja'].includes(l)))];
        if (valid.length === 0) {
          throw new AppError(
            400,
            'INVALID_LANGUAGE',
            'targetLanguages must contain at least one valid language'
          );
        }
        updates.push('target_languages = ?');
        params.push(JSON.stringify(valid));
      }

      if (body.activeLanguage !== undefined) {
        if (!['en', 'zh', 'ja'].includes(body.activeLanguage)) {
          throw new AppError(
            400,
            'INVALID_LANGUAGE',
            "activeLanguage must be 'en', 'zh', or 'ja'"
          );
        }
        updates.push('active_language = ?');
        params.push(body.activeLanguage);
      }

      if (body.dailyXpGoal !== undefined) {
        const goal = Number(body.dailyXpGoal);
        if (!Number.isFinite(goal) || goal < 10 || goal > 500) {
          throw new AppError(
            400,
            'INVALID_GOAL',
            'dailyXpGoal must be between 10 and 500'
          );
        }
        updates.push('daily_xp_goal = ?');
        params.push(Math.round(goal));
      }

      if (body.autoShareMilestones !== undefined) {
        updates.push('auto_share_milestones = ?');
        params.push(body.autoShareMilestones ? 1 : 0);
      }

      if (body.timezoneOffsetMin !== undefined) {
        const offset = Number(body.timezoneOffsetMin);
        if (!Number.isFinite(offset) || offset < -720 || offset > 840) {
          throw new AppError(
            400,
            'INVALID_TIMEZONE',
            'timezoneOffsetMin must be between -720 and 840'
          );
        }
        updates.push('timezone_offset_min = ?');
        params.push(Math.round(offset));
      }

      if (updates.length > 0) {
        params.push(req.user.id);
        db.prepare(
          `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
        ).run(...params);
      }

      const updatedRow = db
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(req.user.id);
      const user = formatUser(updatedRow);
      req.user = user;

      res.json({
        ok: true,
        data: { user }
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
