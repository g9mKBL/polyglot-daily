import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { attachUser } from './middleware/auth.js';
import { createAuthRouter } from './routes/auth.js';
import { createCoursesRouter } from './routes/courses.js';
import { createProgressRouter } from './routes/progress.js';
import { createSocialRouter } from './routes/social.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

export function createApp({ db, content, publicDir } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  const resolvedPublicDir = publicDir || path.join(PROJECT_ROOT, 'public');
  const indexHtmlPath = path.join(resolvedPublicDir, 'index.html');

  app.use(express.json({ limit: '1mb' }));
  app.use(attachUser(db));

  app.get('/api/health', (_req, res) => {
    const row = db.prepare('SELECT COUNT(*) AS cnt FROM users').get();
    res.json({
      ok: true,
      data: {
        status: 'up',
        db: 'up',
        usersCount: row.cnt
      }
    });
  });

  app.use('/api', createAuthRouter(db));
  app.use('/api', createCoursesRouter(db, content));
  app.use('/api', createProgressRouter(db, content));
  app.use('/api', createSocialRouter(db));

  // Unmatched /api/* -> JSON 404
  app.use('/api', (_req, res) => {
    res.status(404).json({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'API endpoint not found'
      }
    });
  });

  if (fs.existsSync(resolvedPublicDir)) {
    app.use(express.static(resolvedPublicDir));
  }

  // SPA fallback for client routes
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      return next();
    }
    if (fs.existsSync(indexHtmlPath)) {
      return res.sendFile(indexHtmlPath);
    }
    return res.status(404).json({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Frontend not built yet'
      }
    });
  });

  // Centralized error handler
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Malformed JSON request body'
        }
      });
    }
    const status = Number(err?.status) || 500;
    const code = err?.code || 'INTERNAL_ERROR';
    const message =
      status >= 500
        ? 'Internal server error'
        : err?.message || 'Request failed';

    if (status >= 500) {
      console.error('[API Error]', err);
    }

    return res.status(status).json({
      ok: false,
      error: { code, message }
    });
  });

  return app;
}
