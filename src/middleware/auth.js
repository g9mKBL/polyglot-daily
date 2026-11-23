import crypto from 'node:crypto';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64, SCRYPT_PARAMS).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') {
    return false;
  }
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, saltHex, hashHex] = parts;
  if (!saltHex || !hashHex) {
    return false;
  }
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, saltHex, 64, SCRYPT_PARAMS);
    if (expected.length !== actual.length) {
      return false;
    }
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function parseCookies(cookieHeader) {
  const cookies = Object.create(null);
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return cookies;
  }
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}

export function extractSessionToken(req) {
  const cookies = parseCookies(req.headers?.cookie);
  if (cookies.sid) {
    return cookies.sid;
  }
  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  return null;
}

export function formatUser(row) {
  if (!row) return null;
  let targetLanguages = ['en', 'zh', 'ja'];
  try {
    const parsed = JSON.parse(row.target_languages || '["en","zh","ja"]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      targetLanguages = parsed;
    }
  } catch {
    targetLanguages = ['en', 'zh', 'ja'];
  }
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email ?? null,
    friendCode: row.friend_code,
    avatarColor: row.avatar_color,
    targetLanguages,
    activeLanguage: row.active_language,
    dailyXpGoal: row.daily_xp_goal,
    autoShareMilestones: Boolean(row.auto_share_milestones),
    timezoneOffsetMin: row.timezone_offset_min,
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at
  };
}

export function createSession(db, userId) {
  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);

  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'
  ).run(tokenHash, userId, expiresAt);

  return { rawToken, tokenHash, expiresAt };
}

export function setSessionCookie(req, res, rawToken) {
  const isHttps =
    Boolean(req.secure) || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `sid=${encodeURIComponent(rawToken)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req, res) {
  const isHttps =
    Boolean(req.secure) || req.headers['x-forwarded-proto'] === 'https';
  const parts = ['sid=', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (isHttps) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function attachUser(db) {
  const findSessionStmt = db.prepare(`
    SELECT u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > datetime('now')
  `);

  return function attachUserMiddleware(req, _res, next) {
    req.user = null;
    req.sessionTokenHash = null;

    const rawToken = extractSessionToken(req);
    if (!rawToken) {
      return next();
    }

    const tokenHash = hashToken(rawToken);
    const userRow = findSessionStmt.get(tokenHash);
    if (userRow) {
      req.user = formatUser(userRow);
      req.sessionTokenHash = tokenHash;
    }
    return next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
  }
  return next();
}
