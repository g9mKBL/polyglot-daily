import express from 'express';
import { AppError } from '../services/progression.js';

function getUserLessonProgressMap(db, userId) {
  if (!userId) return new Map();
  const rows = db
    .prepare('SELECT * FROM user_lesson_progress WHERE user_id = ?')
    .all(userId);
  return new Map(rows.map((r) => [r.lesson_id, r]));
}

function formatLessonSummary(lesson, progressMap) {
  const p = progressMap.get(lesson.id);
  return {
    id: lesson.id,
    levelId: lesson.levelId,
    order: lesson.order,
    title: lesson.title,
    topic: lesson.topic,
    summary: lesson.summary,
    xpReward: lesson.xpReward,
    vocabCount: Array.isArray(lesson.vocabulary) ? lesson.vocabulary.length : 0,
    grammarCount: Array.isArray(lesson.grammar) ? lesson.grammar.length : 0,
    quizCount: Array.isArray(lesson.quizzes) ? lesson.quizzes.length : 0,
    progress: p
      ? {
          status: p.status,
          bestScore: p.best_score,
          attemptsCount: p.attempts_count,
          xpEarned: p.xp_earned,
          lastStudiedAt: p.last_studied_at,
          completedAt: p.completed_at
        }
      : {
          status: 'not_started',
          bestScore: 0,
          attemptsCount: 0,
          xpEarned: 0,
          lastStudiedAt: null,
          completedAt: null
        }
  };
}

function formatLevelSummary(level, progressMap, recommendedLevelId) {
  const lessons = (level.lessons || []).map((lsn) =>
    formatLessonSummary(lsn, progressMap)
  );
  const completedLessons = lessons.filter(
    (l) => l.progress.status === 'completed'
  ).length;
  return {
    levelId: level.levelId,
    language: level.language,
    code: level.code,
    order: level.order,
    title: level.title,
    subtitle: level.subtitle,
    estimatedMinutes: level.estimatedMinutes,
    completedLessons,
    totalLessons: lessons.length,
    recommendedNext: level.levelId === recommendedLevelId,
    lessons
  };
}

export function createCoursesRouter(db, content) {
  const router = express.Router();

  router.get('/courses', (req, res, next) => {
    try {
      const language = req.query.language ? String(req.query.language) : null;
      if (language && !['en', 'zh', 'ja'].includes(language)) {
        throw new AppError(
          400,
          'INVALID_LANGUAGE',
          "language must be 'en', 'zh', or 'ja'"
        );
      }

      const catalog = content.getCatalog();
      const progressMap = getUserLessonProgressMap(db, req.user?.id);
      const rawLevels = language
        ? content.getLevelsByLanguage(language)
        : content.getAllLevels();

      // Determine recommended next level per language
      const recommendedByLang = new Map();
      for (const langId of ['en', 'zh', 'ja']) {
        const langLevels = (content.getLevelsByLanguage(langId) || [])
          .slice()
          .sort((a, b) => a.order - b.order);
        const firstIncomplete = langLevels.find((lvl) =>
          (lvl.lessons || []).some(
            (lsn) => progressMap.get(lsn.id)?.status !== 'completed'
          )
        );
        if (firstIncomplete) {
          recommendedByLang.set(langId, firstIncomplete.levelId);
        } else if (langLevels.length > 0) {
          recommendedByLang.set(
            langId,
            langLevels[langLevels.length - 1].levelId
          );
        }
      }

      const levels = (rawLevels || []).map((lvl) =>
        formatLevelSummary(lvl, progressMap, recommendedByLang.get(lvl.language))
      );

      res.json({
        ok: true,
        data: {
          catalog,
          levels
        }
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/levels/:levelId', (req, res, next) => {
    try {
      const level = content.getLevel(req.params.levelId);
      if (!level) {
        throw new AppError(
          404,
          'LEVEL_NOT_FOUND',
          `Level '${req.params.levelId}' not found`
        );
      }

      const progressMap = getUserLessonProgressMap(db, req.user?.id);
      const langLevels = (content.getLevelsByLanguage(level.language) || [])
        .slice()
        .sort((a, b) => a.order - b.order);
      const firstIncomplete = langLevels.find((lvl) =>
        (lvl.lessons || []).some(
          (lsn) => progressMap.get(lsn.id)?.status !== 'completed'
        )
      );

      res.json({
        ok: true,
        data: {
          level: formatLevelSummary(
            level,
            progressMap,
            firstIncomplete?.levelId || null
          )
        }
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/lessons/:lessonId', (req, res, next) => {
    try {
      const lesson = content.getLesson(req.params.lessonId);
      if (!lesson) {
        throw new AppError(
          404,
          'LESSON_NOT_FOUND',
          `Lesson '${req.params.lessonId}' not found`
        );
      }
      const level = content.getLevel(lesson.levelId);

      let progress = {
        status: 'not_started',
        bestScore: 0,
        attemptsCount: 0,
        xpEarned: 0,
        lastStudiedAt: null,
        completedAt: null
      };
      const vocabSrs = {};

      if (req.user) {
        const pRow = db
          .prepare(
            'SELECT * FROM user_lesson_progress WHERE user_id = ? AND lesson_id = ?'
          )
          .get(req.user.id, lesson.id);
        if (pRow) {
          progress = {
            status: pRow.status,
            bestScore: pRow.best_score,
            attemptsCount: pRow.attempts_count,
            xpEarned: pRow.xp_earned,
            lastStudiedAt: pRow.last_studied_at,
            completedAt: pRow.completed_at
          };
        }

        const srsRows = db
          .prepare(
            'SELECT * FROM user_vocab_srs WHERE user_id = ? AND lesson_id = ?'
          )
          .all(req.user.id, lesson.id);
        for (const row of srsRows) {
          vocabSrs[row.vocab_id] = {
            masteryLevel: row.mastery_level,
            easeFactor: row.ease_factor,
            intervalDays: row.interval_days,
            repetitions: row.repetitions,
            correctCount: row.correct_count,
            incorrectCount: row.incorrect_count,
            nextReviewAt: row.next_review_at,
            lastReviewedAt: row.last_reviewed_at
          };
        }
      }

      res.json({
        ok: true,
        data: {
          lesson,
          level: level
            ? {
                levelId: level.levelId,
                language: level.language,
                code: level.code,
                order: level.order,
                title: level.title
              }
            : null,
          progress,
          vocabSrs
        }
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
