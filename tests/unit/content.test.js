import test from 'node:test';
import assert from 'node:assert/strict';
import content, {
  getAllLevels,
  getCatalog,
  getLanguage,
  getLesson,
  getLevel,
  getLevelsByLanguage,
  getVocabById,
  getVocabByLanguage,
  validateCurriculum
} from '../../content/index.js';

const PLACEHOLDER_REGEX = /\b(todo|tbd|lorem|ipsum|placeholder|dummy|mock)\b/i;
const NUMERIC_PINYIN_REGEX = /\b[a-züǖǘǚǜ]+[1-5]\b/i;
const TONE_MARKED_PINYIN_REGEX = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i;
const HAN_OR_KANJI_REGEX = /[\u4e00-\u9faf]/;

function sameMultiset(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  const counts = new Map();
  for (const item of a) counts.set(item, (counts.get(item) || 0) + 1);
  for (const item of b) {
    const prev = counts.get(item) || 0;
    if (prev === 0) return false;
    counts.set(item, prev - 1);
  }
  return true;
}

test('Catalog and all 17 levels (51 lessons) load and pass validateCurriculum()', () => {
  const catalog = getCatalog();
  assert.equal(catalog.version, '1.0.0');
  assert.equal(catalog.languages.length, 3);

  const allLevels = getAllLevels();
  assert.equal(allLevels.length, 17, 'Expected 17 levels (6 EN + 6 ZH + 5 JA)');

  assert.equal(getLevelsByLanguage('en').length, 6);
  assert.equal(getLevelsByLanguage('zh').length, 6);
  assert.equal(getLevelsByLanguage('ja').length, 5);

  const levelsMap = new Map(allLevels.map((lvl) => [lvl.levelId, lvl]));
  const result = validateCurriculum(catalog, levelsMap);

  assert.equal(
    result.valid,
    true,
    `Curriculum validation failed:\n${result.errors.join('\n')}`
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.stats.levels, 17);
  assert.equal(result.stats.lessons, 51);
  assert.ok(result.stats.vocabulary >= 306);
  assert.ok(result.stats.grammar >= 102);
  assert.ok(result.stats.dialogues >= 51);
  assert.ok(result.stats.quizzes >= 204);
});

test('content/index.js lookup APIs and default export match backend expectations', () => {
  assert.equal(typeof content.getCatalog, 'function');
  assert.equal(getLanguage('en')?.ttsLocale, 'en-US');
  assert.equal(getLanguage('zh')?.ttsLocale, 'zh-CN');
  assert.equal(getLanguage('ja')?.ttsLocale, 'ja-JP');
  assert.equal(getLanguage('fr'), null);

  assert.equal(getLevel('en-a1')?.code, 'A1');
  assert.equal(getLevel('zh-hsk6')?.code, 'HSK6');
  assert.equal(getLevel('ja-n1')?.code, 'N1');
  assert.equal(getLevel('missing-level'), null);

  // Check lesson IDs referenced by src/db/seed.js
  for (const id of [
    'en-a1-l1',
    'en-a1-l2',
    'en-a2-l1',
    'zh-hsk1-l1',
    'ja-n5-l1',
    'ja-n5-l2'
  ]) {
    const lesson = getLesson(id);
    assert.ok(lesson, `Seeded lesson ${id} must exist in curriculum`);
    assert.equal(lesson.id, id);
  }
  assert.equal(getLesson('non-existent'), null);

  // Check getVocabById returns { vocab, lesson, level } compatible with progression.js
  const vocabHit = getVocabById('ja-n5-l1-v1');
  assert.ok(vocabHit);
  assert.equal(vocabHit.vocab.id, 'ja-n5-l1-v1');
  assert.equal(vocabHit.lesson.id, 'ja-n5-l1');
  assert.equal(vocabHit.level.language, 'ja');
  assert.equal(getVocabById('missing-vocab'), null);

  assert.ok(getVocabByLanguage('en').length >= 108);
  assert.ok(getVocabByLanguage('zh').length >= 108);
  assert.ok(getVocabByLanguage('ja').length >= 90);
});

test('Linguistic integrity: IPA (en), tone-marked Pinyin (zh), Furigana + Romaji (ja), unique IDs, zero placeholders', () => {
  const allLevels = getAllLevels();
  const lessonIds = new Set();
  const vocabIds = new Set();
  const grammarIds = new Set();
  const quizIds = new Set();

  for (const level of allLevels) {
    assert.equal(level.lessons.length, 3, `${level.levelId} must have 3 lessons`);

    for (const lesson of level.lessons) {
      assert.ok(!lessonIds.has(lesson.id), `Duplicate lesson ID ${lesson.id}`);
      lessonIds.add(lesson.id);

      assert.ok(lesson.vocabulary.length >= 6, `${lesson.id} needs >= 6 vocab`);
      assert.ok(lesson.grammar.length >= 2, `${lesson.id} needs >= 2 grammar`);
      assert.ok(
        lesson.dialogue.lines.length >= 4 && lesson.dialogue.lines.length <= 6,
        `${lesson.id} dialogue must have 4-6 lines`
      );
      assert.ok(lesson.quizzes.length >= 4, `${lesson.id} needs >= 4 quizzes`);

      const quizTypes = new Set(lesson.quizzes.map((q) => q.type));
      assert.ok(
        quizTypes.size >= 3,
        `${lesson.id} quizzes must cover >= 3 distinct types`
      );

      for (const v of lesson.vocabulary) {
        assert.ok(!vocabIds.has(v.id), `Duplicate vocab ID ${v.id}`);
        vocabIds.add(v.id);

        if (level.language === 'en') {
          assert.match(
            v.reading,
            /^\/.+\/$/,
            `${v.id} English reading must be IPA enclosed in /.../`
          );
        } else if (level.language === 'zh') {
          assert.ok(
            !NUMERIC_PINYIN_REGEX.test(v.reading),
            `${v.id} Chinese reading must not use numeric tone digits: ${v.reading}`
          );
          assert.ok(
            TONE_MARKED_PINYIN_REGEX.test(v.reading),
            `${v.id} Chinese reading must contain Unicode tone marks: ${v.reading}`
          );
        } else if (level.language === 'ja') {
          assert.ok(
            typeof v.romaji === 'string' && v.romaji.trim().length > 0,
            `${v.id} Japanese vocab must have non-empty romaji`
          );
          assert.ok(
            typeof v.rubyText === 'string' && v.rubyText.trim().length > 0,
            `${v.id} Japanese vocab must have rubyText`
          );
          if (HAN_OR_KANJI_REGEX.test(v.term)) {
            assert.match(
              v.rubyText,
              /\[[^\]]+\]/,
              `${v.id} Japanese Kanji term must include [furigana] in rubyText`
            );
          }
        }
      }

      for (const g of lesson.grammar) {
        assert.ok(!grammarIds.has(g.id), `Duplicate grammar ID ${g.id}`);
        grammarIds.add(g.id);
        assert.ok(g.examples.length >= 2, `${g.id} needs >= 2 examples`);
      }

      for (const q of lesson.quizzes) {
        assert.ok(!quizIds.has(q.id), `Duplicate quiz ID ${q.id}`);
        quizIds.add(q.id);

        if (q.type === 'sentence_order') {
          assert.ok(
            sameMultiset(q.tokens, q.correctOrder),
            `${q.id}: tokens must be exact permutation of correctOrder`
          );
          assert.notDeepEqual(
            q.tokens,
            q.correctOrder,
            `${q.id}: tokens should be shuffled rather than already in correctOrder`
          );
          const joined = q.correctOrder.join('').replace(/\s+/g, '');
          const expected = q.correctSentence.replace(/\s+/g, '');
          assert.equal(joined, expected, `${q.id}: correctSentence mismatch`);
        } else {
          assert.equal(q.options.length, 4, `${q.id}: must have 4 options`);
          assert.equal(
            new Set(q.options).size,
            4,
            `${q.id}: options must be distinct`
          );
          assert.ok(
            Number.isInteger(q.correctIndex) &&
              q.correctIndex >= 0 &&
              q.correctIndex <= 3,
            `${q.id}: invalid correctIndex`
          );
        }
      }

      const serialized = JSON.stringify(lesson);
      assert.equal(
        PLACEHOLDER_REGEX.test(serialized),
        false,
        `Placeholder keyword found in ${lesson.id}`
      );
    }
  }
});

test('validateCurriculum rejects malformed fixtures (missing level, numeric pinyin, missing romaji, placeholder)', () => {
  const catalog = structuredClone(getCatalog());
  const allLevels = getAllLevels();
  const baseMap = new Map(allLevels.map((lvl) => [lvl.levelId, structuredClone(lvl)]));

  // 1. Missing level
  const missingMap = new Map(baseMap);
  missingMap.delete('ja-n1');
  const resMissing = validateCurriculum(catalog, missingMap);
  assert.equal(resMissing.valid, false);
  assert.ok(resMissing.errors.some((e) => e.includes('ja-n1')));

  // 2. Numeric pinyin & missing romaji & placeholder
  const badMap = new Map(baseMap);
  const zh1 = structuredClone(badMap.get('zh-hsk1'));
  zh1.lessons[0].vocabulary[0].reading = 'ni3 hao3';
  badMap.set('zh-hsk1', zh1);

  const ja5 = structuredClone(badMap.get('ja-n5'));
  ja5.lessons[0].vocabulary[0].romaji = '';
  ja5.lessons[0].summary.en = 'TODO finish this lesson';
  badMap.set('ja-n5', ja5);

  const resBad = validateCurriculum(catalog, badMap);
  assert.equal(resBad.valid, false);
  assert.ok(resBad.errors.some((e) => e.includes('tone-marked Pinyin')));
  assert.ok(resBad.errors.some((e) => e.includes('romaji')));
  assert.ok(resBad.errors.some((e) => e.includes('Placeholder text')));
});
