import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  completeLesson,
  getProgressSummary,
  getUserMistakes,
  getVocabReviewQueue,
  reviewVocab
} from '../services/progression.js';

export function createProgressRouter(db, content) {
  const router = express.Router();

  router.post(
    '/lessons/:lessonId/complete',
    requireAuth,
    (req, res, next) => {
      try {
        const result = completeLesson(
          db,
          content,
          req.user,
          req.params.lessonId,
          req.body
        );
        res.json({ ok: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get('/vocab/review', requireAuth, (req, res, next) => {
    try {
      const result = getVocabReviewQueue(db, content, req.user, {
        language: req.query.language ? String(req.query.language) : null,
        lessonId: req.query.lessonId ? String(req.query.lessonId) : null,
        mode: req.query.mode ? String(req.query.mode) : 'due',
        limit: req.query.limit ? Number(req.query.limit) : 20
      });
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  router.post('/vocab/:vocabId/review', requireAuth, (req, res, next) => {
    try {
      const rating = req.body?.rating;
      const result = reviewVocab(
        db,
        content,
        req.user,
        req.params.vocabId,
        rating
      );
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  router.get('/mistakes', requireAuth, (req, res, next) => {
    try {
      const result = getUserMistakes(db, content, req.user, {
        language: req.query.language ? String(req.query.language) : null
      });
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  router.get('/progress/summary', requireAuth, (req, res, next) => {
    try {
      const result = getProgressSummary(db, content, req.user);
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
