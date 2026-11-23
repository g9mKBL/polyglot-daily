import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSessionToken,
  hashPassword,
  hashToken,
  parseCookies,
  verifyPassword
} from '../../src/middleware/auth.js';
import {
  addDaysToDateString,
  calculateLessonXp,
  calculateSrsUpdate,
  computeEffectiveStreak,
  computeStreakUpdate,
  getLocalDateString,
  gradeQuiz
} from '../../src/services/progression.js';

test('hashPassword & verifyPassword use unique salts and timing-safe verification', () => {
  const h1 = hashPassword('MySecretPass123');
  const h2 = hashPassword('MySecretPass123');

  assert.ok(h1.startsWith('scrypt$'));
  assert.notEqual(h1, h2, 'Each hash must use a fresh random salt');
  assert.equal(verifyPassword('MySecretPass123', h1), true);
  assert.equal(verifyPassword('WrongPass123', h1), false);
  assert.equal(verifyPassword('MySecretPass123', 'invalid-format'), false);
  assert.equal(verifyPassword('', h1), false);
});

test('hashToken, parseCookies & extractSessionToken work for cookie and Bearer', () => {
  const token = 'abc123token';
  assert.equal(hashToken(token).length, 64);
  assert.equal(hashToken(token), hashToken(token));

  const parsed = parseCookies('foo=bar; sid=my%20token; theme=dark');
  assert.equal(parsed.sid, 'my token');
  assert.equal(parsed.theme, 'dark');

  assert.equal(
    extractSessionToken({ headers: { cookie: 'sid=cookie_tok' } }),
    'cookie_tok'
  );
  assert.equal(
    extractSessionToken({
      headers: { authorization: 'Bearer header_tok' }
    }),
    'header_tok'
  );
  assert.equal(extractSessionToken({ headers: {} }), null);
});

test('Local date helpers and streak calculation handle increments, repeats, and gaps', () => {
  const utcTime = new Date('2026-11-23T20:00:00Z'); // 2026-11-24 03:00 in UTC+7
  assert.equal(getLocalDateString(420, utcTime), '2026-11-24');
  assert.equal(getLocalDateString(0, utcTime), '2026-11-23');
  assert.equal(addDaysToDateString('2026-11-24', -1), '2026-11-23');
  assert.equal(addDaysToDateString('2026-03-01', -1), '2026-02-28');

  // First activity
  const s1 = computeStreakUpdate(
    { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
    '2026-11-20'
  );
  assert.deepEqual(s1, {
    currentStreak: 1,
    longestStreak: 1,
    lastActiveDate: '2026-11-20'
  });

  // Same-day activity keeps streak
  const s2 = computeStreakUpdate(s1, '2026-11-20');
  assert.equal(s2.currentStreak, 1);

  // Next consecutive day increments streak
  const s3 = computeStreakUpdate(s2, '2026-11-21');
  assert.deepEqual(s3, {
    currentStreak: 2,
    longestStreak: 2,
    lastActiveDate: '2026-11-21'
  });

  // 2-day gap resets currentStreak to 1 while preserving longestStreak
  const s4 = computeStreakUpdate(
    { currentStreak: 5, longestStreak: 9, lastActiveDate: '2026-11-18' },
    '2026-11-21'
  );
  assert.deepEqual(s4, {
    currentStreak: 1,
    longestStreak: 9,
    lastActiveDate: '2026-11-21'
  });

  // Effective streak on read
  assert.equal(
    computeEffectiveStreak(
      { currentStreak: 5, lastActiveDate: '2026-11-23' },
      '2026-11-23'
    ),
    5
  );
  assert.equal(
    computeEffectiveStreak(
      { currentStreak: 5, lastActiveDate: '2026-11-22' },
      '2026-11-23'
    ),
    5
  );
  assert.equal(
    computeEffectiveStreak(
      { currentStreak: 5, lastActiveDate: '2026-11-21' },
      '2026-11-23'
    ),
    0
  );
});

test('SM-2-lite calculateSrsUpdate transitions across again, hard, good, easy', () => {
  const now = new Date('2026-11-23T12:00:00Z');

  const r1 = calculateSrsUpdate({}, 'good', now);
  assert.equal(r1.repetitions, 1);
  assert.equal(r1.intervalDays, 1);
  assert.equal(r1.masteryLevel, 1);
  assert.equal(r1.correctCount, 1);

  const r2 = calculateSrsUpdate(r1, 'good', now);
  assert.equal(r2.repetitions, 2);
  assert.equal(r2.intervalDays, 3);
  assert.equal(r2.masteryLevel, 2);

  const r3 = calculateSrsUpdate(r2, 'easy', now);
  assert.equal(r3.repetitions, 3);
  assert.ok(r3.intervalDays >= 8);
  assert.equal(r3.masteryLevel, 4);
  assert.equal(r3.easeFactor, 2.6);

  const rHard = calculateSrsUpdate(r3, 'hard', now);
  assert.equal(rHard.masteryLevel, 5);
  assert.equal(rHard.easeFactor, 2.45);

  const rAgain = calculateSrsUpdate(rHard, 'again', now);
  assert.equal(rAgain.repetitions, 0);
  assert.equal(rAgain.intervalDays, 0);
  assert.equal(rAgain.masteryLevel, 4);
  assert.equal(rAgain.incorrectCount, 1);

  assert.throws(() => calculateSrsUpdate({}, 'invalid', now), {
    code: 'INVALID_RATING'
  });
});

test('gradeQuiz & calculateLessonXp evaluate all quiz modes and enforce 70% pass threshold', () => {
  const sampleLesson = {
    id: 'en-a1-l1',
    xpReward: 50,
    quizzes: [
      {
        id: 'q1',
        type: 'multiple_choice',
        options: ['Hello', 'Goodbye', 'Thanks', 'Sorry'],
        correctIndex: 0
      },
      {
        id: 'q2',
        type: 'reading_match',
        options: ['/həˈloʊ/', '/ɡʊdˈbaɪ/', '/θæŋks/', '/ˈsɒri/'],
        correctIndex: 1
      },
      {
        id: 'q3',
        type: 'fill_blank',
        options: ['am', 'is', 'are', 'be'],
        correctIndex: 2
      },
      {
        id: 'q4',
        type: 'sentence_order',
        tokens: ['name', 'is', 'My', 'Linh'],
        correctOrder: ['My', 'name', 'is', 'Linh'],
        correctSentence: 'My name is Linh'
      }
    ]
  };

  // 100% pass
  const perfect = gradeQuiz(sampleLesson, [
    0,
    1,
    2,
    ['My', 'name', 'is', 'Linh']
  ]);
  assert.equal(perfect.score, 100);
  assert.equal(perfect.correctCount, 4);
  assert.equal(perfect.passed, true);
  assert.equal(
    calculateLessonXp({
      lesson: sampleLesson,
      score: perfect.score,
      passed: perfect.passed,
      isFirstCompletion: true,
      previousBestScore: 0
    }),
    65 // 30 base + 10 score + 5 perfect + 20 first-time
  );

  // 75% pass via object format
  const pass75 = gradeQuiz(sampleLesson, [
    { questionId: 'q1', selectedIndex: 0 },
    { questionId: 'q2', selectedIndex: 1 },
    { questionId: 'q3', selectedIndex: 2 },
    { questionId: 'q4', orderedTokens: ['Linh', 'is', 'name', 'My'] }
  ]);
  assert.equal(pass75.score, 75);
  assert.equal(pass75.passed, true);
  assert.equal(pass75.results[3].isCorrect, false);

  // 50% fail -> 0 XP
  const fail50 = gradeQuiz(sampleLesson, [0, 1, 0, ['wrong']]);
  assert.equal(fail50.score, 50);
  assert.equal(fail50.passed, false);
  assert.equal(
    calculateLessonXp({
      lesson: sampleLesson,
      score: fail50.score,
      passed: fail50.passed,
      isFirstCompletion: true,
      previousBestScore: 0
    }),
    0
  );
});

test('gradeQuiz does not fall back positionally for questionId-keyed arrays', () => {
  const sampleLesson = {
    id: 'en-a1-l1',
    xpReward: 50,
    quizzes: [
      {
        id: 'q1',
        type: 'multiple_choice',
        options: ['Hello', 'Goodbye', 'Thanks', 'Sorry'],
        correctIndex: 0
      },
      {
        id: 'q2',
        type: 'reading_match',
        options: ['/həˈloʊ/', '/ɡʊdˈbaɪ/', '/θæŋks/', '/ˈsɒri/'],
        correctIndex: 1
      }
    ]
  };

  const bogus = gradeQuiz(sampleLesson, [
    { questionId: 'nonexistent-q-id', selectedIndex: 0 }
  ]);
  assert.equal(bogus.correctCount, 0);
  assert.equal(bogus.score, 0);
  assert.equal(bogus.passed, false);
  assert.equal(bogus.results[0].isCorrect, false);

  // q1 must NOT steal index 0 from a partial q2-only array
  const partialWrongQ2 = gradeQuiz(sampleLesson, [
    { questionId: 'q2', selectedIndex: 0 }
  ]);
  assert.equal(partialWrongQ2.correctCount, 0);
  assert.equal(partialWrongQ2.score, 0);
  assert.equal(partialWrongQ2.results[0].isCorrect, false);
  assert.equal(partialWrongQ2.results[1].isCorrect, false);

  const partialCorrectQ2 = gradeQuiz(sampleLesson, [
    { questionId: 'q2', selectedIndex: 1 }
  ]);
  assert.equal(partialCorrectQ2.correctCount, 1);
  assert.equal(partialCorrectQ2.score, 50);
  assert.equal(partialCorrectQ2.results[0].isCorrect, false);
  assert.equal(partialCorrectQ2.results[1].isCorrect, true);
});

test('computeStreakUpdate preserves streak and lastActiveDate on backward timezone date shift', () => {
  const shifted = computeStreakUpdate(
    { currentStreak: 5, longestStreak: 7, lastActiveDate: '2026-11-24' },
    '2026-11-23'
  );
  assert.deepEqual(shifted, {
    currentStreak: 5,
    longestStreak: 7,
    lastActiveDate: '2026-11-24'
  });
});
