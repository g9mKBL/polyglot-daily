export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function formatSqliteDatetime(date = new Date()) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

export function getLocalDateString(timezoneOffsetMin = 420, now = new Date()) {
  const offset = Number.isFinite(Number(timezoneOffsetMin))
    ? Number(timezoneOffsetMin)
    : 420;
  const shifted = new Date(now.getTime() + offset * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToDateString(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function computeStreakUpdate(
  { currentStreak = 0, longestStreak = 0, lastActiveDate = null },
  activityDate
) {
  if (lastActiveDate && activityDate < lastActiveDate) {
    const preservedStreak = Math.max(1, Number(currentStreak || 0));
    return {
      currentStreak: preservedStreak,
      longestStreak: Math.max(Number(longestStreak) || 0, preservedStreak),
      lastActiveDate
    };
  }
  let nextStreak = 1;
  if (lastActiveDate === activityDate) {
    nextStreak = Math.max(1, Number(currentStreak) || 1);
  } else if (lastActiveDate === addDaysToDateString(activityDate, -1)) {
    nextStreak = (Number(currentStreak) || 0) + 1;
  }
  const nextLongest = Math.max(Number(longestStreak) || 0, nextStreak);
  return {
    currentStreak: nextStreak,
    longestStreak: nextLongest,
    lastActiveDate: activityDate
  };
}

export function computeEffectiveStreak(
  { currentStreak = 0, lastActiveDate = null },
  todayDate
) {
  if (!lastActiveDate || !currentStreak) return 0;
  const yesterday = addDaysToDateString(todayDate, -1);
  return lastActiveDate >= yesterday ? Number(currentStreak) : 0;
}

function normalizeSentence(str) {
  return String(str ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function extractAnswerEntry(question, idx, answersInput) {
  if (Array.isArray(answersInput)) {
    const isKeyedByQuestionId = answersInput.some(
      (item) =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        'questionId' in item
    );
    if (isKeyedByQuestionId) {
      return answersInput.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          item.questionId === question.id
      );
    }
    return answersInput[idx];
  }
  if (answersInput && typeof answersInput === 'object') {
    return answersInput[question.id];
  }
  return undefined;
}

export function gradeQuiz(lesson, answersInput) {
  const quizzes = Array.isArray(lesson?.quizzes) ? lesson.quizzes : [];
  if (quizzes.length === 0) {
    return {
      score: 100,
      correctCount: 0,
      totalQuestions: 0,
      passed: true,
      results: []
    };
  }

  let correctCount = 0;
  const results = quizzes.map((q, idx) => {
    const rawAns = extractAnswerEntry(q, idx, answersInput);

    if (q.type === 'sentence_order') {
      let userTokens = null;
      let userSentence = null;

      if (Array.isArray(rawAns)) {
        userTokens = rawAns.map((t) => String(t));
      } else if (rawAns && typeof rawAns === 'object') {
        const candidate =
          rawAns.orderedTokens ?? rawAns.tokens ?? rawAns.answer ?? rawAns.value;
        if (Array.isArray(candidate)) {
          userTokens = candidate.map((t) => String(t));
        } else if (typeof candidate === 'string') {
          userSentence = candidate;
        }
      } else if (typeof rawAns === 'string') {
        userSentence = rawAns;
      }

      const expectedOrder = Array.isArray(q.correctOrder) ? q.correctOrder : [];
      const exactTokensMatch =
        Array.isArray(userTokens) &&
        userTokens.length === expectedOrder.length &&
        userTokens.every((tok, i) => tok === expectedOrder[i]);

      const joinedMatch =
        Array.isArray(userTokens) &&
        q.correctSentence &&
        normalizeSentence(userTokens.join('')) ===
          normalizeSentence(q.correctSentence.replace(/\s+/g, ''));

      const sentenceMatch =
        typeof userSentence === 'string' &&
        q.correctSentence &&
        normalizeSentence(userSentence) === normalizeSentence(q.correctSentence);

      const isCorrect = Boolean(exactTokensMatch || joinedMatch || sentenceMatch);
      if (isCorrect) correctCount += 1;

      return {
        questionId: q.id,
        type: q.type,
        isCorrect,
        userAnswer: userTokens ?? userSentence ?? null,
        correctAnswer: q.correctOrder,
        correctSentence: q.correctSentence,
        explanation: q.explanation ?? null
      };
    }

    // multiple_choice | reading_match | fill_blank
    let selectedIndex = null;
    let rawValue = rawAns;
    if (rawAns && typeof rawAns === 'object' && !Array.isArray(rawAns)) {
      rawValue =
        rawAns.selectedIndex ??
        rawAns.index ??
        rawAns.answer ??
        rawAns.value ??
        null;
    }

    if (typeof rawValue === 'number' && Number.isInteger(rawValue)) {
      selectedIndex = rawValue;
    } else if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      if (/^\d+$/.test(trimmed)) {
        selectedIndex = Number(trimmed);
      } else if (Array.isArray(q.options)) {
        const foundIdx = q.options.indexOf(rawValue);
        if (foundIdx !== -1) selectedIndex = foundIdx;
      }
    }

    const isCorrect = selectedIndex === q.correctIndex;
    if (isCorrect) correctCount += 1;

    return {
      questionId: q.id,
      type: q.type,
      isCorrect,
      selectedIndex,
      correctIndex: q.correctIndex,
      correctAnswer: Array.isArray(q.options) ? q.options[q.correctIndex] : null,
      explanation: q.explanation ?? null
    };
  });

  const totalQuestions = quizzes.length;
  const score = Math.round((correctCount / totalQuestions) * 100);
  const passed = score >= 70;

  return {
    score,
    correctCount,
    totalQuestions,
    passed,
    results
  };
}

export function calculateLessonXp({
  lesson,
  score,
  passed,
  isFirstCompletion,
  previousBestScore = 0
}) {
  if (!passed) return 0;

  if (isFirstCompletion) {
    const base = lesson?.xpReward ? Math.round(Number(lesson.xpReward) * 0.6) : 30;
    const scoreBonus = Math.round(score / 10);
    const perfectBonus = score === 100 ? 5 : 0;
    const firstBonus = 20;
    return base + scoreBonus + perfectBonus + firstBonus;
  }

  let repeatXp = 10;
  if (score > previousBestScore) {
    repeatXp += Math.round((score - previousBestScore) / 5);
  }
  if (score === 100 && previousBestScore < 100) {
    repeatXp += 5;
  }
  return repeatXp;
}

export function calculateSrsUpdate(current = {}, rating, now = new Date()) {
  const validRatings = new Set(['again', 'hard', 'good', 'easy']);
  if (!validRatings.has(rating)) {
    throw new AppError(
      400,
      'INVALID_RATING',
      "Rating must be one of 'again', 'hard', 'good', 'easy'"
    );
  }

  let masteryLevel = Number(current.masteryLevel ?? current.mastery_level ?? 0);
  let easeFactor = Number(current.easeFactor ?? current.ease_factor ?? 2.5);
  let intervalDays = Number(current.intervalDays ?? current.interval_days ?? 0);
  let repetitions = Number(current.repetitions ?? 0);
  let correctCount = Number(current.correctCount ?? current.correct_count ?? 0);
  let incorrectCount = Number(
    current.incorrectCount ?? current.incorrect_count ?? 0
  );

  let nextReviewDate;
  let xpAwarded = 0;

  if (rating === 'again') {
    repetitions = 0;
    intervalDays = 0;
    easeFactor = Math.max(1.3, Number((easeFactor - 0.2).toFixed(2)));
    masteryLevel = Math.max(0, masteryLevel - 1);
    incorrectCount += 1;
    nextReviewDate = new Date(now.getTime() + 10 * 60_000);
    xpAwarded = 1;
  } else if (rating === 'hard') {
    repetitions = Math.max(1, repetitions);
    intervalDays =
      intervalDays <= 0 ? 1 : Math.max(1, Math.round(intervalDays * 1.2));
    easeFactor = Math.max(1.3, Number((easeFactor - 0.15).toFixed(2)));
    masteryLevel = Math.min(5, masteryLevel + 1);
    correctCount += 1;
    nextReviewDate = new Date(now.getTime() + intervalDays * 86_400_000);
    xpAwarded = 2;
  } else if (rating === 'good') {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 3;
    else intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
    masteryLevel = Math.min(5, masteryLevel + 1);
    correctCount += 1;
    nextReviewDate = new Date(now.getTime() + intervalDays * 86_400_000);
    xpAwarded = 3;
  } else {
    // easy
    repetitions += 1;
    if (repetitions === 1) intervalDays = 2;
    else if (repetitions === 2) intervalDays = 5;
    else intervalDays = Math.max(2, Math.round(intervalDays * easeFactor * 1.3));
    easeFactor = Math.min(3.0, Number((easeFactor + 0.1).toFixed(2)));
    masteryLevel = Math.min(5, masteryLevel + (masteryLevel < 4 ? 2 : 1));
    correctCount += 1;
    nextReviewDate = new Date(now.getTime() + intervalDays * 86_400_000);
    xpAwarded = 4;
  }

  return {
    masteryLevel,
    easeFactor,
    intervalDays,
    repetitions,
    correctCount,
    incorrectCount,
    nextReviewAt: formatSqliteDatetime(nextReviewDate),
    lastReviewedAt: formatSqliteDatetime(now),
    xpAwarded
  };
}

export function formatStatsRow(row, timezoneOffsetMin = 420, todayOverride = null) {
  const today = todayOverride || getLocalDateString(timezoneOffsetMin);
  if (!row) {
    return {
      totalXp: 0,
      enXp: 0,
      zhXp: 0,
      jaXp: 0,
      currentStreak: 0,
      effectiveStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      lessonsCompletedCount: 0,
      vocabMasteredCount: 0,
      userLevel: 1
    };
  }
  const effectiveStreak = computeEffectiveStreak(
    {
      currentStreak: row.current_streak,
      lastActiveDate: row.last_active_date
    },
    today
  );
  return {
    totalXp: row.total_xp,
    enXp: row.en_xp,
    zhXp: row.zh_xp,
    jaXp: row.ja_xp,
    currentStreak: effectiveStreak,
    rawStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastActiveDate: row.last_active_date,
    lessonsCompletedCount: row.lessons_completed_count,
    vocabMasteredCount: row.vocab_mastered_count,
    userLevel: Math.floor(row.total_xp / 250) + 1
  };
}

export function getUserStatsSnapshot(db, userId, timezoneOffsetMin = 420) {
  const today = getLocalDateString(timezoneOffsetMin);
  const statsRow = db
    .prepare('SELECT * FROM user_stats WHERE user_id = ?')
    .get(userId);
  const dailyRow = db
    .prepare(
      'SELECT xp_earned FROM daily_activity_log WHERE user_id = ? AND activity_date = ?'
    )
    .get(userId, today);

  return {
    stats: formatStatsRow(statsRow, timezoneOffsetMin, today),
    todayXp: dailyRow ? dailyRow.xp_earned : 0,
    todayDate: today
  };
}

function recordXpAndActivity(
  db,
  user,
  {
    language,
    xpAwarded = 0,
    lessonsCompletedDelta = 0,
    quizzesTakenDelta = 0,
    vocabReviewedDelta = 0
  }
) {
  const today = getLocalDateString(user.timezoneOffsetMin);
  const langCol =
    language === 'en' ? 'en_xp' : language === 'zh' ? 'zh_xp' : 'ja_xp';

  db.prepare(
    `INSERT INTO daily_activity_log
      (user_id, activity_date, xp_earned, ${langCol}, lessons_completed, quizzes_taken, vocab_reviewed, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, activity_date) DO UPDATE SET
       xp_earned = xp_earned + excluded.xp_earned,
       ${langCol} = ${langCol} + excluded.${langCol},
       lessons_completed = lessons_completed + excluded.lessons_completed,
       quizzes_taken = quizzes_taken + excluded.quizzes_taken,
       vocab_reviewed = vocab_reviewed + excluded.vocab_reviewed,
       updated_at = datetime('now')`
  ).run(
    user.id,
    today,
    xpAwarded,
    xpAwarded,
    lessonsCompletedDelta,
    quizzesTakenDelta,
    vocabReviewedDelta
  );

  if (xpAwarded > 0 || lessonsCompletedDelta > 0) {
    const existingStats = db
      .prepare('SELECT * FROM user_stats WHERE user_id = ?')
      .get(user.id);

    const streakUpdate =
      xpAwarded > 0
        ? computeStreakUpdate(
            {
              currentStreak: existingStats?.current_streak ?? 0,
              longestStreak: existingStats?.longest_streak ?? 0,
              lastActiveDate: existingStats?.last_active_date ?? null
            },
            today
          )
        : {
            currentStreak: existingStats?.current_streak ?? 0,
            longestStreak: existingStats?.longest_streak ?? 0,
            lastActiveDate: existingStats?.last_active_date ?? null
          };

    db.prepare(
      `UPDATE user_stats
       SET total_xp = total_xp + ?,
           ${langCol} = ${langCol} + ?,
           current_streak = ?,
           longest_streak = ?,
           last_active_date = ?,
           lessons_completed_count = lessons_completed_count + ?,
           updated_at = datetime('now')
       WHERE user_id = ?`
    ).run(
      xpAwarded,
      xpAwarded,
      streakUpdate.currentStreak,
      streakUpdate.longestStreak,
      streakUpdate.lastActiveDate,
      lessonsCompletedDelta,
      user.id
    );

    return { today, streakAfter: streakUpdate.currentStreak };
  }

  return { today, streakAfter: null };
}

export function completeLesson(db, content, user, lessonId, payload) {
  const lesson = content.getLesson(lessonId);
  if (!lesson) {
    throw new AppError(404, 'LESSON_NOT_FOUND', `Lesson '${lessonId}' not found`);
  }
  const level = content.getLevel(lesson.levelId);
  if (!level) {
    throw new AppError(
      404,
      'LEVEL_NOT_FOUND',
      `Level '${lesson.levelId}' not found`
    );
  }

  if (!payload || payload.answers === undefined) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Quiz answers are required to complete a lesson'
    );
  }

  const rawShareGroupId = payload.shareGroupId;
  const shareGroupId =
    rawShareGroupId !== undefined &&
    rawShareGroupId !== null &&
    !(typeof rawShareGroupId === 'string' && rawShareGroupId.trim() === '')
      ? Number(rawShareGroupId)
      : null;
  if (shareGroupId !== null) {
    const member = db
      .prepare(
        'SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ?'
      )
      .get(shareGroupId, user.id);
    if (!member) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'You are not a member of the target study group'
      );
    }
  }

  const grading = gradeQuiz(lesson, payload.answers);
  const nowSql = formatSqliteDatetime();

  let attemptRow;
  let xpAwarded = 0;
  let isFirstCompletion = false;
  let autoSharedPost = null;

  db.exec('BEGIN');
  try {
    const existingProgress = db
      .prepare(
        'SELECT * FROM user_lesson_progress WHERE user_id = ? AND lesson_id = ?'
      )
      .get(user.id, lessonId);

    const alreadyCompleted = existingProgress?.status === 'completed';
    isFirstCompletion = !alreadyCompleted && grading.passed;

    xpAwarded = calculateLessonXp({
      lesson,
      score: grading.score,
      passed: grading.passed,
      isFirstCompletion,
      previousBestScore: existingProgress?.best_score ?? 0
    });

    const nextStatus =
      alreadyCompleted || grading.passed ? 'completed' : 'in_progress';
    const nextBestScore = Math.max(
      existingProgress?.best_score ?? 0,
      grading.score
    );
    const completedAt =
      existingProgress?.completed_at ?? (grading.passed ? nowSql : null);

    db.prepare(
      `INSERT INTO user_lesson_progress
        (user_id, lesson_id, language, level_code, status, best_score, attempts_count, xp_earned, last_studied_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(user_id, lesson_id) DO UPDATE SET
         status = ?,
         best_score = ?,
         attempts_count = attempts_count + 1,
         xp_earned = xp_earned + ?,
         last_studied_at = ?,
         completed_at = COALESCE(completed_at, ?)`
    ).run(
      user.id,
      lessonId,
      level.language,
      level.code,
      nextStatus,
      nextBestScore,
      xpAwarded,
      nowSql,
      completedAt,
      nextStatus,
      nextBestScore,
      xpAwarded,
      nowSql,
      completedAt
    );

    const attemptInfo = db
      .prepare(
        `INSERT INTO quiz_attempts
          (user_id, lesson_id, language, level_code, score, correct_count, total_questions, xp_awarded, answers_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        user.id,
        lessonId,
        level.language,
        level.code,
        grading.score,
        grading.correctCount,
        grading.totalQuestions,
        xpAwarded,
        JSON.stringify(grading.results)
      );

    attemptRow = db
      .prepare('SELECT * FROM quiz_attempts WHERE id = ?')
      .get(attemptInfo.lastInsertRowid);

    // Update mistake bank
    const upsertMistake = db.prepare(
      `INSERT INTO user_mistakes (user_id, lesson_id, question_id, language, wrong_count, last_wrong_at)
       VALUES (?, ?, ?, ?, 1, datetime('now'))
       ON CONFLICT(user_id, lesson_id, question_id) DO UPDATE SET
         wrong_count = wrong_count + 1,
         last_wrong_at = datetime('now')`
    );
    const deleteMistake = db.prepare(
      'DELETE FROM user_mistakes WHERE user_id = ? AND lesson_id = ? AND question_id = ?'
    );

    for (const r of grading.results) {
      if (r.isCorrect) {
        deleteMistake.run(user.id, lessonId, r.questionId);
      } else {
        upsertMistake.run(user.id, lessonId, r.questionId, level.language);
      }
    }

    // Seed lesson vocabulary into user_vocab_srs on pass so SRS queue is populated
    if (grading.passed && Array.isArray(lesson.vocabulary)) {
      const insertVocab = db.prepare(
        `INSERT OR IGNORE INTO user_vocab_srs
          (user_id, vocab_id, lesson_id, language, mastery_level, ease_factor, interval_days, repetitions, correct_count, incorrect_count, next_review_at)
         VALUES (?, ?, ?, ?, 0, 2.5, 0, 0, 0, 0, datetime('now'))`
      );
      for (const vocab of lesson.vocabulary) {
        insertVocab.run(user.id, vocab.id, lessonId, level.language);
      }
    }

    const { streakAfter } = recordXpAndActivity(db, user, {
      language: level.language,
      xpAwarded,
      lessonsCompletedDelta: isFirstCompletion ? 1 : 0,
      quizzesTakenDelta: 1
    });

    // Check if entire level is completed
    let levelCompletedNow = false;
    if (isFirstCompletion && Array.isArray(level.lessons)) {
      const lessonIds = level.lessons.map((l) => l.id);
      const placeholders = lessonIds.map(() => '?').join(',');
      const completedRow = db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM user_lesson_progress
           WHERE user_id = ? AND status = 'completed' AND lesson_id IN (${placeholders})`
        )
        .get(user.id, ...lessonIds);
      levelCompletedNow = completedRow.cnt === lessonIds.length;
    }

    const streakMilestone =
      streakAfter && [3, 7, 14, 30, 60, 100].includes(streakAfter);
    const shouldShare =
      grading.passed &&
      (payload.shareToFeed === true ||
        (payload.shareToFeed !== false &&
          user.autoShareMilestones &&
          (isFirstCompletion || grading.score >= 80 || streakMilestone)));

    if (shouldShare) {
      const postType = levelCompletedNow
        ? 'level_milestone'
        : 'lesson_completed';
      const visibility = shareGroupId ? 'group' : 'friends';
      const title = levelCompletedNow
        ? `Completed ${level.language.toUpperCase()} ${level.code} (${level.title?.en || level.code})!`
        : `Completed ${level.code} · ${lesson.title?.en || lesson.id} (${grading.score}%)`;
      const body = `Earned +${xpAwarded} XP with ${grading.correctCount}/${grading.totalQuestions} correct answers.`;

      const postInfo = db
        .prepare(
          `INSERT INTO feed_posts
            (author_id, post_type, visibility, group_id, language, level_code, lesson_id, title, body, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          user.id,
          postType,
          visibility,
          shareGroupId,
          level.language,
          level.code,
          lessonId,
          title,
          body,
          JSON.stringify({
            score: grading.score,
            xpAwarded,
            levelCompleted: levelCompletedNow
          })
        );

      autoSharedPost = db
        .prepare('SELECT * FROM feed_posts WHERE id = ?')
        .get(postInfo.lastInsertRowid);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const snapshot = getUserStatsSnapshot(db, user.id, user.timezoneOffsetMin);

  return {
    attempt: {
      id: attemptRow.id,
      lessonId: attemptRow.lesson_id,
      language: attemptRow.language,
      levelCode: attemptRow.level_code,
      score: attemptRow.score,
      correctCount: attemptRow.correct_count,
      totalQuestions: attemptRow.total_questions,
      xpAwarded: attemptRow.xp_awarded,
      createdAt: attemptRow.created_at
    },
    grading,
    passed: grading.passed,
    isFirstCompletion,
    xpAwarded,
    stats: snapshot.stats,
    todayXp: snapshot.todayXp,
    autoSharedPost: autoSharedPost
      ? {
          id: autoSharedPost.id,
          postType: autoSharedPost.post_type,
          visibility: autoSharedPost.visibility,
          groupId: autoSharedPost.group_id,
          title: autoSharedPost.title,
          body: autoSharedPost.body,
          createdAt: autoSharedPost.created_at
        }
      : null
  };
}

export function getVocabReviewQueue(
  db,
  content,
  user,
  { language = null, lessonId = null, mode = 'due', limit = 20 }
) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  let candidates = [];

  if (lessonId) {
    const lesson = content.getLesson(lessonId);
    if (!lesson) {
      throw new AppError(
        404,
        'LESSON_NOT_FOUND',
        `Lesson '${lessonId}' not found`
      );
    }
    const level = content.getLevel(lesson.levelId);
    candidates = (lesson.vocabulary || []).map((v) => ({
      ...v,
      lessonId: lesson.id,
      language: level?.language || lesson.id.split('-')[0],
      levelCode: level?.code || ''
    }));
  } else if (language) {
    if (!['en', 'zh', 'ja'].includes(language)) {
      throw new AppError(400, 'INVALID_LANGUAGE', 'Invalid language filter');
    }
    const levels = content.getLevelsByLanguage(language) || [];
    for (const lvl of levels) {
      for (const lsn of lvl.lessons || []) {
        for (const v of lsn.vocabulary || []) {
          candidates.push({
            ...v,
            lessonId: lsn.id,
            language: lvl.language,
            levelCode: lvl.code
          });
        }
      }
    }
  } else {
    const levels = content.getAllLevels() || [];
    for (const lvl of levels) {
      for (const lsn of lvl.lessons || []) {
        for (const v of lsn.vocabulary || []) {
          candidates.push({
            ...v,
            lessonId: lsn.id,
            language: lvl.language,
            levelCode: lvl.code
          });
        }
      }
    }
  }

  const srsRows = db
    .prepare('SELECT * FROM user_vocab_srs WHERE user_id = ?')
    .all(user.id);
  const srsMap = new Map(srsRows.map((r) => [r.vocab_id, r]));
  const nowSql = formatSqliteDatetime();

  const annotated = candidates.map((item) => {
    const row = srsMap.get(item.id);
    const isDue = row ? row.next_review_at <= nowSql : false;
    return {
      ...item,
      srs: row
        ? {
            masteryLevel: row.mastery_level,
            easeFactor: row.ease_factor,
            intervalDays: row.interval_days,
            repetitions: row.repetitions,
            correctCount: row.correct_count,
            incorrectCount: row.incorrect_count,
            nextReviewAt: row.next_review_at,
            lastReviewedAt: row.last_reviewed_at,
            isDue
          }
        : {
            masteryLevel: 0,
            easeFactor: 2.5,
            intervalDays: 0,
            repetitions: 0,
            correctCount: 0,
            incorrectCount: 0,
            nextReviewAt: null,
            lastReviewedAt: null,
            isDue: true
          }
    };
  });

  let cards;
  const dueOnly = annotated.filter(
    (c) => srsMap.has(c.id) && c.srs.nextReviewAt <= nowSql
  );

  if (mode === 'due') {
    cards = dueOnly.slice(0, safeLimit);
  } else if (mode === 'lesson' || mode === 'all') {
    cards = annotated.slice(0, safeLimit);
  } else {
    throw new AppError(
      400,
      'INVALID_MODE',
      "mode must be one of 'due', 'lesson', 'all'"
    );
  }

  return {
    mode,
    dueCount: dueOnly.length,
    totalCount: annotated.length,
    cards
  };
}

export function reviewVocab(db, content, user, vocabId, rating) {
  const vocabEntry = content.getVocabById(vocabId);
  if (!vocabEntry) {
    throw new AppError(
      404,
      'VOCAB_NOT_FOUND',
      `Vocabulary '${vocabId}' not found`
    );
  }

  // Support both { vocab, lesson, level } or flat vocab item depending on content/index.js
  const vocab = vocabEntry.vocab || vocabEntry;
  const lessonId =
    vocabEntry.lesson?.id || vocabEntry.lessonId || vocab.lessonId || 'unknown';
  const language =
    vocabEntry.level?.language ||
    vocabEntry.language ||
    vocab.language ||
    vocabId.split('-')[0];

  if (!['en', 'zh', 'ja'].includes(language)) {
    throw new AppError(400, 'INVALID_LANGUAGE', 'Unable to determine language');
  }

  let updatedSrs;
  let xpAwarded = 0;

  db.exec('BEGIN');
  try {
    const existing = db
      .prepare(
        'SELECT * FROM user_vocab_srs WHERE user_id = ? AND vocab_id = ?'
      )
      .get(user.id, vocabId);

    const next = calculateSrsUpdate(existing || {}, rating, new Date());
    xpAwarded = next.xpAwarded;

    db.prepare(
      `INSERT INTO user_vocab_srs
        (user_id, vocab_id, lesson_id, language, mastery_level, ease_factor, interval_days, repetitions, correct_count, incorrect_count, next_review_at, last_reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, vocab_id) DO UPDATE SET
         mastery_level = excluded.mastery_level,
         ease_factor = excluded.ease_factor,
         interval_days = excluded.interval_days,
         repetitions = excluded.repetitions,
         correct_count = excluded.correct_count,
         incorrect_count = excluded.incorrect_count,
         next_review_at = excluded.next_review_at,
         last_reviewed_at = excluded.last_reviewed_at`
    ).run(
      user.id,
      vocabId,
      lessonId,
      language,
      next.masteryLevel,
      next.easeFactor,
      next.intervalDays,
      next.repetitions,
      next.correctCount,
      next.incorrectCount,
      next.nextReviewAt,
      next.lastReviewedAt
    );

    const masteredCountRow = db
      .prepare(
        'SELECT COUNT(*) AS cnt FROM user_vocab_srs WHERE user_id = ? AND mastery_level >= 3'
      )
      .get(user.id);

    db.prepare(
      `UPDATE user_stats
       SET vocab_mastered_count = ?, updated_at = datetime('now')
       WHERE user_id = ?`
    ).run(masteredCountRow.cnt, user.id);

    recordXpAndActivity(db, user, {
      language,
      xpAwarded,
      vocabReviewedDelta: 1
    });

    updatedSrs = {
      vocabId,
      lessonId,
      language,
      masteryLevel: next.masteryLevel,
      easeFactor: next.easeFactor,
      intervalDays: next.intervalDays,
      repetitions: next.repetitions,
      correctCount: next.correctCount,
      incorrectCount: next.incorrectCount,
      nextReviewAt: next.nextReviewAt,
      lastReviewedAt: next.lastReviewedAt
    };

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const snapshot = getUserStatsSnapshot(db, user.id, user.timezoneOffsetMin);

  return {
    srs: updatedSrs,
    xpAwarded,
    stats: snapshot.stats,
    todayXp: snapshot.todayXp
  };
}

export function getUserMistakes(db, content, user, { language = null } = {}) {
  if (language && !['en', 'zh', 'ja'].includes(language)) {
    throw new AppError(400, 'INVALID_LANGUAGE', 'Invalid language filter');
  }

  const rows = language
    ? db
        .prepare(
          'SELECT * FROM user_mistakes WHERE user_id = ? AND language = ? ORDER BY last_wrong_at DESC'
        )
        .all(user.id, language)
    : db
        .prepare(
          'SELECT * FROM user_mistakes WHERE user_id = ? ORDER BY last_wrong_at DESC'
        )
        .all(user.id);

  const mistakes = rows.map((row) => {
    const lesson = content.getLesson(row.lesson_id);
    const question = lesson?.quizzes?.find((q) => q.id === row.question_id) || null;
    return {
      lessonId: row.lesson_id,
      lessonTitle: lesson?.title || null,
      levelId: lesson?.levelId || null,
      questionId: row.question_id,
      language: row.language,
      wrongCount: row.wrong_count,
      lastWrongAt: row.last_wrong_at,
      question
    };
  });

  return {
    count: mistakes.length,
    mistakes
  };
}

export function getProgressSummary(db, content, user) {
  const snapshot = getUserStatsSnapshot(db, user.id, user.timezoneOffsetMin);
  const allLevels = content.getAllLevels() || [];

  const lessonProgressRows = db
    .prepare('SELECT * FROM user_lesson_progress WHERE user_id = ?')
    .all(user.id);
  const completedSet = new Set(
    lessonProgressRows
      .filter((r) => r.status === 'completed')
      .map((r) => r.lesson_id)
  );

  const vocabMasteredByLang = new Map();
  for (const row of db
    .prepare(
      'SELECT language, COUNT(*) AS cnt FROM user_vocab_srs WHERE user_id = ? AND mastery_level >= 3 GROUP BY language'
    )
    .all(user.id)) {
    vocabMasteredByLang.set(row.language, row.cnt);
  }

  const byLanguage = {};
  for (const lang of ['en', 'zh', 'ja']) {
    const levels = allLevels.filter((l) => l.language === lang);
    const lessons = levels.flatMap((l) => l.lessons || []);
    const completedLessons = lessons.filter((lsn) =>
      completedSet.has(lsn.id)
    ).length;

    byLanguage[lang] = {
      xp:
        lang === 'en'
          ? snapshot.stats.enXp
          : lang === 'zh'
            ? snapshot.stats.zhXp
            : snapshot.stats.jaXp,
      lessonsCompleted: completedLessons,
      totalLessons: lessons.length,
      vocabMastered: vocabMasteredByLang.get(lang) || 0
    };
  }

  const recentQuizzes = db
    .prepare(
      `SELECT id, lesson_id, language, level_code, score, correct_count, total_questions, xp_awarded, created_at
       FROM quiz_attempts
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 10`
    )
    .all(user.id)
    .map((r) => ({
      id: r.id,
      lessonId: r.lesson_id,
      language: r.language,
      levelCode: r.level_code,
      score: r.score,
      correctCount: r.correct_count,
      totalQuestions: r.total_questions,
      xpAwarded: r.xp_awarded,
      createdAt: r.created_at
    }));

  const startDate = addDaysToDateString(snapshot.todayDate, -13);
  const dailyHistory = db
    .prepare(
      `SELECT activity_date, xp_earned, en_xp, zh_xp, ja_xp, lessons_completed, quizzes_taken, vocab_reviewed
       FROM daily_activity_log
       WHERE user_id = ? AND activity_date >= ?
       ORDER BY activity_date ASC`
    )
    .all(user.id, startDate)
    .map((r) => ({
      date: r.activity_date,
      xpEarned: r.xp_earned,
      enXp: r.en_xp,
      zhXp: r.zh_xp,
      jaXp: r.ja_xp,
      lessonsCompleted: r.lessons_completed,
      quizzesTaken: r.quizzes_taken,
      vocabReviewed: r.vocab_reviewed
    }));

  const mistakesCount = db
    .prepare('SELECT COUNT(*) AS cnt FROM user_mistakes WHERE user_id = ?')
    .get(user.id).cnt;

  const nowSql = formatSqliteDatetime();
  const dueVocabCount = db
    .prepare(
      'SELECT COUNT(*) AS cnt FROM user_vocab_srs WHERE user_id = ? AND next_review_at <= ?'
    )
    .get(user.id, nowSql).cnt;

  return {
    stats: snapshot.stats,
    todayXp: snapshot.todayXp,
    dailyGoal: user.dailyXpGoal,
    byLanguage,
    recentQuizzes,
    dailyHistory,
    mistakesCount,
    dueVocabCount
  };
}
