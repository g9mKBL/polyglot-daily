import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { openDatabase } from '../../src/db/connection.js';
import { initSchema } from '../../src/db/schema.js';
import { seedDemoData } from '../../src/db/seed.js';

function createFixtureContent() {
  const catalog = {
    version: '1.0.0',
    languages: [
      {
        id: 'en',
        name: { native: 'English', vi: 'Tiếng Anh', en: 'English' },
        ttsLocale: 'en-US',
        levelSystem: 'CEFR',
        levels: ['en-a1']
      },
      {
        id: 'zh',
        name: { native: '中文', vi: 'Tiếng Trung', en: 'Mandarin Chinese' },
        ttsLocale: 'zh-CN',
        levelSystem: 'HSK',
        levels: ['zh-hsk1']
      },
      {
        id: 'ja',
        name: { native: '日本語', vi: 'Tiếng Nhật', en: 'Japanese' },
        ttsLocale: 'ja-JP',
        levelSystem: 'JLPT',
        levels: ['ja-n5']
      }
    ]
  };

  const levels = [
    {
      levelId: 'en-a1',
      language: 'en',
      code: 'A1',
      order: 1,
      title: { vi: 'Sơ cấp A1', en: 'Beginner A1' },
      subtitle: { vi: 'Giao tiếp cơ bản', en: 'Basic communication' },
      estimatedMinutes: 30,
      lessons: [
        {
          id: 'en-a1-l1',
          levelId: 'en-a1',
          order: 1,
          title: {
            native: 'First Meetings',
            vi: 'Làm quen',
            en: 'First Meetings'
          },
          topic: 'greetings',
          summary: { vi: 'Chào hỏi cơ bản', en: 'Basic greetings' },
          xpReward: 50,
          vocabulary: [
            {
              id: 'en-a1-l1-v1',
              term: 'hello',
              reading: '/həˈloʊ/',
              partOfSpeech: 'expression',
              meaning: { vi: 'xin chào', en: 'hello' },
              example: {
                text: 'Hello, nice to meet you.',
                reading: '/həˈloʊ naɪs tuː miːt juː/',
                meaning: { vi: 'Xin chào, rất vui được gặp bạn.', en: 'Hello, nice to meet you.' }
              }
            },
            {
              id: 'en-a1-l1-v2',
              term: 'name',
              reading: '/neɪm/',
              partOfSpeech: 'noun',
              meaning: { vi: 'tên', en: 'name' },
              example: {
                text: 'My name is Minh.',
                reading: '/maɪ neɪm ɪz mɪn/',
                meaning: { vi: 'Tên tôi là Minh.', en: 'My name is Minh.' }
              }
            }
          ],
          grammar: [],
          dialogue: { title: { vi: 'Chào', en: 'Greeting' }, mode: 'dialogue', context: { vi: 'Gặp gỡ', en: 'Meeting' }, lines: [], culturalNote: { vi: 'Lịch sự', en: 'Polite' } },
          quizzes: [
            {
              id: 'en-a1-l1-q1',
              type: 'multiple_choice',
              prompt: { vi: 'Nghĩa của hello?', en: 'Meaning of hello?' },
              options: ['Xin chào', 'Tạm biệt', 'Cảm ơn', 'Xin lỗi'],
              correctIndex: 0,
              explanation: { vi: 'hello = xin chào', en: 'hello means greeting' }
            },
            {
              id: 'en-a1-l1-q2',
              type: 'reading_match',
              prompt: { vi: 'Phiên âm của name?', en: 'IPA of name?' },
              options: ['/neɪm/', '/həˈloʊ/', '/ɡʊd/', '/bæd/'],
              correctIndex: 0,
              explanation: { vi: 'name đọc là /neɪm/', en: 'name is /neɪm/' }
            },
            {
              id: 'en-a1-l1-q3',
              type: 'fill_blank',
              prompt: { vi: 'My ___ is Lan.', en: 'My ___ is Lan.' },
              options: ['hello', 'name', 'meet', 'you'],
              correctIndex: 1,
              explanation: { vi: 'My name is ...', en: 'My name is ...' }
            },
            {
              id: 'en-a1-l1-q4',
              type: 'sentence_order',
              prompt: { vi: 'Sắp xếp câu', en: 'Order the sentence' },
              targetMeaning: { vi: 'Tên tôi là An.', en: 'My name is An.' },
              tokens: ['is', 'My', 'An', 'name'],
              correctOrder: ['My', 'name', 'is', 'An'],
              correctSentence: 'My name is An',
              explanation: { vi: 'My name is An', en: 'My name is An' }
            }
          ]
        }
      ]
    },
    {
      levelId: 'zh-hsk1',
      language: 'zh',
      code: 'HSK1',
      order: 1,
      title: { vi: 'HSK 1', en: 'HSK 1' },
      subtitle: { vi: 'Cơ bản', en: 'Basics' },
      estimatedMinutes: 30,
      lessons: [
        {
          id: 'zh-hsk1-l1',
          levelId: 'zh-hsk1',
          order: 1,
          title: { native: '你好', vi: 'Xin chào', en: 'Greetings' },
          topic: 'greetings',
          summary: { vi: 'Chào hỏi', en: 'Greetings' },
          xpReward: 50,
          vocabulary: [
            {
              id: 'zh-hsk1-l1-v1',
              term: '你好',
              reading: 'nǐ hǎo',
              partOfSpeech: 'expression',
              meaning: { vi: 'xin chào', en: 'hello' },
              example: {
                text: '你好！',
                reading: 'nǐ hǎo!',
                meaning: { vi: 'Xin chào!', en: 'Hello!' }
              }
            }
          ],
          grammar: [],
          dialogue: { title: { vi: 'Chào', en: 'Greeting' }, mode: 'dialogue', context: { vi: 'Gặp gỡ', en: 'Meeting' }, lines: [], culturalNote: { vi: 'Biến điệu', en: 'Tone sandhi' } },
          quizzes: [
            {
              id: 'zh-hsk1-l1-q1',
              type: 'multiple_choice',
              prompt: { vi: '你好 nghĩa là gì?', en: 'What does 你好 mean?' },
              options: ['Xin chào', 'Cảm ơn', 'Tạm biệt', 'Không có gì'],
              correctIndex: 0,
              explanation: { vi: '你好 = xin chào', en: '你好 means hello' }
            }
          ]
        }
      ]
    },
    {
      levelId: 'ja-n5',
      language: 'ja',
      code: 'N5',
      order: 1,
      title: { vi: 'JLPT N5', en: 'JLPT N5' },
      subtitle: { vi: 'Nhập môn', en: 'Intro' },
      estimatedMinutes: 30,
      lessons: [
        {
          id: 'ja-n5-l1',
          levelId: 'ja-n5',
          order: 1,
          title: { native: 'はじめまして', vi: 'Lần đầu gặp', en: 'First Meeting' },
          topic: 'greetings',
          summary: { vi: 'Giới thiệu', en: 'Introduction' },
          xpReward: 50,
          vocabulary: [
            {
              id: 'ja-n5-l1-v1',
              term: '学生',
              reading: 'がくせい',
              romaji: 'gakusei',
              rubyText: '学生[がくせい]',
              partOfSpeech: 'noun',
              meaning: { vi: 'học sinh / sinh viên', en: 'student' },
              example: {
                text: '私は学生です。',
                rubyText: '私[わたし]は学生[がくせい]です。',
                reading: 'watashi wa gakusei desu.',
                meaning: { vi: 'Tôi là sinh viên.', en: 'I am a student.' }
              }
            }
          ],
          grammar: [],
          dialogue: { title: { vi: 'Giới thiệu', en: 'Intro' }, mode: 'dialogue', context: { vi: 'Lớp học', en: 'Class' }, lines: [], culturalNote: { vi: 'Lịch sự', en: 'Politeness' } },
          quizzes: [
            {
              id: 'ja-n5-l1-q1',
              type: 'multiple_choice',
              prompt: { vi: '学生 đọc là gì?', en: 'How to read 学生?' },
              options: ['がくせい', 'せんせい', 'ともだち', 'にほん'],
              correctIndex: 0,
              explanation: { vi: '学生 = がくせい', en: 'gakusei' }
            }
          ]
        }
      ]
    }
  ];

  const levelMap = new Map(levels.map((l) => [l.levelId, l]));
  const lessonMap = new Map();
  const vocabMap = new Map();

  for (const lvl of levels) {
    for (const lsn of lvl.lessons) {
      lessonMap.set(lsn.id, lsn);
      for (const v of lsn.vocabulary) {
        vocabMap.set(v.id, { vocab: v, lesson: lsn, level: lvl });
      }
    }
  }

  return {
    getCatalog: () => catalog,
    getLanguage: (id) => catalog.languages.find((l) => l.id === id) || null,
    getLevel: (id) => levelMap.get(id) || null,
    getLevelsByLanguage: (lang) => levels.filter((l) => l.language === lang),
    getAllLevels: () => levels,
    getLesson: (id) => lessonMap.get(id) || null,
    getVocabById: (id) => vocabMap.get(id) || null,
    getVocabByLanguage: (lang) =>
      levels
        .filter((l) => l.language === lang)
        .flatMap((l) => l.lessons.flatMap((lsn) => lsn.vocabulary))
  };
}

class TestClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookie = '';
  }

  async request(method, routePath, body) {
    const headers = {};
    if (this.cookie) headers.Cookie = this.cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${this.baseUrl}${routePath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const sidPart = setCookie.split(';')[0];
      if (sidPart.startsWith('sid=')) {
        if (sidPart === 'sid=') {
          this.cookie = '';
        } else {
          this.cookie = sidPart;
        }
      }
    }

    const json = await res.json();
    return { status: res.status, json };
  }
}

async function startServer(dbPath, content) {
  const db = openDatabase(dbPath);
  initSchema(db);
  const app = createApp({ db, content });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  return {
    db,
    server,
    baseUrl: `http://127.0.0.1:${addr.port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      db.close();
    }
  };
}

test('Full API lifecycle: auth, profile, courses, lesson grading, SRS, restart persistence & social', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-api-test-'));
  const dbPath = path.join(tempDir, 'test-app.db');
  const content = createFixtureContent();

  let instance = await startServer(dbPath, content);

  try {
    const anon = new TestClient(instance.baseUrl);
    const alice = new TestClient(instance.baseUrl);
    const bob = new TestClient(instance.baseUrl);
    const charlie = new TestClient(instance.baseUrl);

    // 1. Health & unauthenticated checks (clean empty DB, AUTO_SEED=false behavior)
    const health = await anon.request('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.ok, true);
    assert.equal(health.json.data.usersCount, 0);

    const unauthMe = await anon.request('GET', '/api/auth/me');
    assert.equal(unauthMe.status, 401);
    assert.equal(unauthMe.json.ok, false);

    // 2. Register Alice, verify duplicate username 409, logout & re-login
    const regA = await alice.request('POST', '/api/auth/register', {
      username: 'alice_en',
      displayName: 'Alice',
      password: 'Password123!',
      targetLanguages: ['en', 'ja'],
      dailyXpGoal: 60
    });
    assert.equal(regA.status, 201);
    assert.equal(regA.json.data.user.username, 'alice_en');
    assert.match(regA.json.data.user.friendCode, /^LN-/);
    const aliceId = regA.json.data.user.id;
    const aliceFriendCode = regA.json.data.user.friendCode;

    const dupA = await anon.request('POST', '/api/auth/register', {
      username: 'ALICE_EN',
      password: 'Password123!'
    });
    assert.equal(dupA.status, 409);
    assert.equal(dupA.json.error.code, 'DUPLICATE_USERNAME');

    const badLogin = await anon.request('POST', '/api/auth/login', {
      usernameOrEmail: 'alice_en',
      password: 'WrongPassword'
    });
    assert.equal(badLogin.status, 401);

    const logoutA = await alice.request('POST', '/api/auth/logout');
    assert.equal(logoutA.status, 200);
    const afterLogoutMe = await alice.request('GET', '/api/auth/me');
    assert.equal(afterLogoutMe.status, 401);

    const loginA = await alice.request('POST', '/api/auth/login', {
      usernameOrEmail: 'alice_en',
      password: 'Password123!'
    });
    assert.equal(loginA.status, 200);

    const patchProfile = await alice.request('PATCH', '/api/profile', {
      displayName: 'Alice Nguyen',
      dailyXpGoal: 75,
      activeLanguage: 'ja'
    });
    assert.equal(patchProfile.status, 200);
    assert.equal(patchProfile.json.data.user.displayName, 'Alice Nguyen');
    assert.equal(patchProfile.json.data.user.dailyXpGoal, 75);
    assert.equal(patchProfile.json.data.user.activeLanguage, 'ja');

    // 3. Courses + Lesson fail (mistakes bank) -> Lesson pass (XP, streak, auto-share)
    const coursesRes = await alice.request('GET', '/api/courses?language=en');
    assert.equal(coursesRes.status, 200);
    assert.equal(coursesRes.json.data.levels.length, 1);
    assert.equal(coursesRes.json.data.levels[0].recommendedNext, true);

    const failQuiz = await alice.request(
      'POST',
      '/api/lessons/en-a1-l1/complete',
      {
        answers: [0, 2, 3, ['An', 'is', 'name', 'My']] // 1/4 = 25%
      }
    );
    assert.equal(failQuiz.status, 200);
    assert.equal(failQuiz.json.data.passed, false);
    assert.equal(failQuiz.json.data.xpAwarded, 0);

    const mistakesAfterFail = await alice.request(
      'GET',
      '/api/mistakes?language=en'
    );
    assert.equal(mistakesAfterFail.status, 200);
    assert.equal(mistakesAfterFail.json.data.count, 3);

    const passQuiz = await alice.request(
      'POST',
      '/api/lessons/en-a1-l1/complete',
      {
        answers: [0, 0, 1, ['My', 'name', 'is', 'An']]
      }
    );
    assert.equal(passQuiz.status, 200);
    assert.equal(passQuiz.json.data.passed, true);
    assert.equal(passQuiz.json.data.isFirstCompletion, true);
    assert.equal(passQuiz.json.data.xpAwarded, 65);
    assert.equal(passQuiz.json.data.stats.currentStreak, 1);
    assert.ok(passQuiz.json.data.autoSharedPost);

    const mistakesAfterPass = await alice.request('GET', '/api/mistakes');
    assert.equal(mistakesAfterPass.json.data.count, 0);

    // 4. SRS Vocab Review
    const dueQueue = await alice.request(
      'GET',
      '/api/vocab/review?language=en&mode=due'
    );
    assert.equal(dueQueue.status, 200);
    assert.equal(dueQueue.json.data.dueCount, 2);

    const rev1 = await alice.request(
      'POST',
      '/api/vocab/en-a1-l1-v1/review',
      { rating: 'easy' }
    );
    assert.equal(rev1.status, 200);
    assert.equal(rev1.json.data.xpAwarded, 4);
    assert.equal(rev1.json.data.srs.masteryLevel, 2);

    const rev2 = await alice.request(
      'POST',
      '/api/vocab/en-a1-l1-v1/review',
      { rating: 'good' }
    );
    assert.equal(rev2.status, 200);
    assert.equal(rev2.json.data.srs.masteryLevel, 3);
    assert.equal(rev2.json.data.stats.vocabMasteredCount, 1);

    const expectedTotalXp = 65 + 4 + 3; // 72

    // 5. Persistence across server & DB reopen
    await instance.close();
    instance = await startServer(dbPath, content);

    alice.baseUrl = instance.baseUrl;
    bob.baseUrl = instance.baseUrl;
    charlie.baseUrl = instance.baseUrl;

    const meAfterRestart = await alice.request('GET', '/api/auth/me');
    assert.equal(meAfterRestart.status, 200);
    assert.equal(meAfterRestart.json.data.user.displayName, 'Alice Nguyen');
    assert.equal(meAfterRestart.json.data.stats.totalXp, expectedTotalXp);
    assert.equal(meAfterRestart.json.data.stats.lessonsCompletedCount, 1);
    assert.equal(meAfterRestart.json.data.stats.vocabMasteredCount, 1);

    const summaryAfterRestart = await alice.request(
      'GET',
      '/api/progress/summary'
    );
    assert.equal(summaryAfterRestart.status, 200);
    assert.equal(summaryAfterRestart.json.data.byLanguage.en.lessonsCompleted, 1);

    // 6. Social: Friends, Groups, Leaderboards, Feed & Authz
    const regB = await bob.request('POST', '/api/auth/register', {
      username: 'bob_zh',
      displayName: 'Bob',
      password: 'Password123!'
    });
    assert.equal(regB.status, 201);
    const bobId = regB.json.data.user.id;

    const regC = await charlie.request('POST', '/api/auth/register', {
      username: 'charlie_ja',
      displayName: 'Charlie',
      password: 'Password123!'
    });
    assert.equal(regC.status, 201);
    const charlieId = regC.json.data.user.id;

    // Search
    const searchRes = await alice.request('GET', '/api/friends/search?q=bob');
    assert.equal(searchRes.status, 200);
    assert.equal(searchRes.json.data.results.length, 1);
    assert.equal(searchRes.json.data.results[0].relationshipStatus, 'none');

    // Bob requests Alice by friendCode -> Alice accepts
    const reqBtoA = await bob.request('POST', '/api/friends/request', {
      friendCode: aliceFriendCode
    });
    assert.equal(reqBtoA.status, 201);
    const friendReqId = reqBtoA.json.data.request.id;

    const aliceFriendsBefore = await alice.request('GET', '/api/friends');
    assert.equal(aliceFriendsBefore.json.data.incomingRequests.length, 1);

    const acceptRes = await alice.request(
      'POST',
      `/api/friends/requests/${friendReqId}/respond`,
      { action: 'accept' }
    );
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.json.data.friendship.status, 'accepted');

    // Mutual friend request auto-accept: Alice -> Charlie, then Charlie -> Alice
    const reqAtoC = await alice.request('POST', '/api/friends/request', {
      targetUserId: charlieId
    });
    assert.equal(reqAtoC.status, 201);

    const reqCtoA = await charlie.request('POST', '/api/friends/request', {
      targetUserId: aliceId
    });
    assert.equal(reqCtoA.status, 200);
    assert.equal(reqCtoA.json.data.autoAccepted, true);

    // Study group: Alice creates, Bob joins via invite code, Charlie is blocked (403)
    const createGroup = await alice.request('POST', '/api/groups', {
      name: 'Morning Polyglots',
      focusLanguage: 'all',
      dailyGroupXpGoal: 150,
      weeklyGroupXpGoal: 800
    });
    assert.equal(createGroup.status, 201);
    const groupId = createGroup.json.data.group.id;
    const inviteCode = createGroup.json.data.group.inviteCode;
    assert.match(inviteCode, /^GRP-/);

    const badJoin = await bob.request('POST', '/api/groups/join', {
      inviteCode: 'GRP-NOPE'
    });
    assert.equal(badJoin.status, 404);

    const bobJoin = await bob.request('POST', '/api/groups/join', {
      inviteCode
    });
    assert.equal(bobJoin.status, 200);
    assert.equal(bobJoin.json.data.alreadyMember, false);

    // Bob completes ZH lesson
    const bobPass = await bob.request('POST', '/api/lessons/zh-hsk1-l1/complete', {
      answers: [0]
    });
    assert.equal(bobPass.status, 200);
    assert.equal(bobPass.json.data.xpAwarded, 65);

    const groupDetail = await bob.request('GET', `/api/groups/${groupId}`);
    assert.equal(groupDetail.status, 200);
    assert.equal(groupDetail.json.data.members.length, 2);
    assert.equal(
      groupDetail.json.data.collectiveDailyXp,
      expectedTotalXp + 65
    );

    // Non-member Charlie receives 403 on group detail, group leaderboard, group feed
    assert.equal(
      (await charlie.request('GET', `/api/groups/${groupId}`)).status,
      403
    );
    assert.equal(
      (
        await charlie.request(
          'GET',
          `/api/leaderboard?scope=group&groupId=${groupId}`
        )
      ).status,
      403
    );
    assert.equal(
      (await charlie.request('GET', `/api/feed?scope=group&groupId=${groupId}`))
        .status,
      403
    );

    // Global & Group leaderboards
    const lbGroup = await alice.request(
      'GET',
      `/api/leaderboard?scope=group&groupId=${groupId}&timeframe=daily&language=all`
    );
    assert.equal(lbGroup.status, 200);
    assert.equal(lbGroup.json.data.entries.length, 2);
    assert.equal(lbGroup.json.data.entries[0].username, 'alice_en');
    assert.equal(lbGroup.json.data.entries[0].xp, expectedTotalXp);
    assert.equal(lbGroup.json.data.entries[1].username, 'bob_zh');
    assert.equal(lbGroup.json.data.entries[1].xp, 65);

    const lbZh = await alice.request(
      'GET',
      '/api/leaderboard?scope=global&timeframe=all_time&language=zh'
    );
    assert.equal(lbZh.status, 200);
    assert.equal(lbZh.json.data.entries[0].username, 'bob_zh');
    assert.equal(lbZh.json.data.entries[0].xp, 65);

    // Feed: Alice creates group study note, Bob cheers & comments, Bob cannot delete, Alice can delete
    const postCreate = await alice.request('POST', '/api/feed', {
      postType: 'study_note',
      visibility: 'group',
      groupId,
      language: 'en',
      title: 'IPA tip',
      body: 'Practice vowel length!'
    });
    assert.equal(postCreate.status, 201);
    const postId = postCreate.json.data.post.id;

    const cheerRes = await bob.request('POST', `/api/feed/${postId}/cheer`, {
      reaction: 'fire'
    });
    assert.equal(cheerRes.status, 200);
    assert.equal(cheerRes.json.data.cheered, true);
    assert.equal(cheerRes.json.data.cheerCount, 1);

    const commentRes = await bob.request(
      'POST',
      `/api/feed/${postId}/comments`,
      { body: 'Great tip Alice!' }
    );
    assert.equal(commentRes.status, 201);

    const groupFeed = await bob.request(
      'GET',
      `/api/feed?scope=group&groupId=${groupId}`
    );
    assert.equal(groupFeed.status, 200);
    assert.equal(groupFeed.json.data.posts.length, 1);
    assert.equal(groupFeed.json.data.posts[0].cheerCount, 1);
    assert.equal(groupFeed.json.data.posts[0].comments.length, 1);

    const bobDeleteFail = await bob.request('DELETE', `/api/feed/${postId}`);
    assert.equal(bobDeleteFail.status, 403);

    const aliceDeleteOk = await alice.request('DELETE', `/api/feed/${postId}`);
    assert.equal(aliceDeleteOk.status, 200);

    // Leave group & remove friend
    const bobLeave = await bob.request('POST', `/api/groups/${groupId}/leave`);
    assert.equal(bobLeave.status, 200);

    const removeFriend = await alice.request('DELETE', `/api/friends/${bobId}`);
    assert.equal(removeFriend.status, 200);
  } finally {
    await instance.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('seedDemoData is idempotent and populates 4 demo accounts + GRP-CLUB', () => {
  const db = openDatabase(':memory:');
  initSchema(db);

  seedDemoData(db);
  seedDemoData(db); // Run twice to confirm idempotency

  const users = db
    .prepare('SELECT username FROM users WHERE is_demo = 1 ORDER BY username')
    .all();
  assert.deepEqual(
    users.map((u) => u.username),
    ['kenji_tan', 'linh_dan', 'minh_anh', 'wei_chen']
  );

  const group = db
    .prepare("SELECT * FROM study_groups WHERE invite_code = 'GRP-CLUB'")
    .get();
  assert.ok(group);
  const members = db
    .prepare('SELECT COUNT(*) AS cnt FROM study_group_members WHERE group_id = ?')
    .get(group.id).cnt;
  assert.equal(members, 4);

  const posts = db.prepare('SELECT COUNT(*) AS cnt FROM feed_posts').get().cnt;
  assert.equal(posts, 3);

  db.close();
});

test('Regression: register validates timezoneOffsetMin bounds and empty shareGroupId does not 403', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-reg-test-'));
  const dbPath = path.join(tempDir, 'reg-test.db');
  const content = createFixtureContent();
  const instance = await startServer(dbPath, content);

  try {
    const client = new TestClient(instance.baseUrl);

    const badTzHigh = await client.request('POST', '/api/auth/register', {
      username: 'tz_high',
      password: 'Password123!',
      timezoneOffsetMin: 999999999999
    });
    assert.equal(badTzHigh.status, 400);
    assert.equal(badTzHigh.json.ok, false);
    assert.equal(badTzHigh.json.error.code, 'INVALID_TIMEZONE');

    const badTzLow = await client.request('POST', '/api/auth/register', {
      username: 'tz_low',
      password: 'Password123!',
      timezoneOffsetMin: -800
    });
    assert.equal(badTzLow.status, 400);
    assert.equal(badTzLow.json.error.code, 'INVALID_TIMEZONE');

    const regOk = await client.request('POST', '/api/auth/register', {
      username: 'tz_ok',
      password: 'Password123!',
      timezoneOffsetMin: 420
    });
    assert.equal(regOk.status, 201);

    const completeEmptyGroup = await client.request(
      'POST',
      '/api/lessons/en-a1-l1/complete',
      {
        answers: [0, 0, 1, ['My', 'name', 'is', 'An']],
        shareGroupId: ''
      }
    );
    assert.equal(completeEmptyGroup.status, 200);
    assert.equal(completeEmptyGroup.json.data.passed, true);
  } finally {
    await instance.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
