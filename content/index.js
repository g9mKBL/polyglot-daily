import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLACEHOLDER_REGEX = /\b(todo|tbd|lorem|ipsum|placeholder|dummy|mock)\b/i;
const NUMERIC_PINYIN_REGEX = /\b[a-züǖǘǚǜ]+[1-5]\b/i;
const TONE_MARKED_PINYIN_REGEX = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i;
const VALID_QUIZ_TYPES = new Set([
  'multiple_choice',
  'reading_match',
  'fill_blank',
  'sentence_order'
]);

const LEVEL_FILE_MAP = [
  ['en-a1', path.join('en', 'a1.json')],
  ['en-a2', path.join('en', 'a2.json')],
  ['en-b1', path.join('en', 'b1.json')],
  ['en-b2', path.join('en', 'b2.json')],
  ['en-c1', path.join('en', 'c1.json')],
  ['en-c2', path.join('en', 'c2.json')],
  ['zh-hsk1', path.join('zh', 'hsk1.json')],
  ['zh-hsk2', path.join('zh', 'hsk2.json')],
  ['zh-hsk3', path.join('zh', 'hsk3.json')],
  ['zh-hsk4', path.join('zh', 'hsk4.json')],
  ['zh-hsk5', path.join('zh', 'hsk5.json')],
  ['zh-hsk6', path.join('zh', 'hsk6.json')],
  ['ja-n5', path.join('ja', 'n5.json')],
  ['ja-n4', path.join('ja', 'n4.json')],
  ['ja-n3', path.join('ja', 'n3.json')],
  ['ja-n2', path.join('ja', 'n2.json')],
  ['ja-n1', path.join('ja', 'n1.json')]
];

function readJsonUtf8(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function isNonEmptyString(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

function checkBilingual(obj, label, errors) {
  if (!obj || typeof obj !== 'object') {
    errors.push(`${label} must be an object with { vi, en }`);
    return;
  }
  if (!isNonEmptyString(obj.vi)) {
    errors.push(`${label}.vi must be a non-empty string`);
  }
  if (!isNonEmptyString(obj.en)) {
    errors.push(`${label}.en must be a non-empty string`);
  }
}

function scanStringsForPlaceholders(value, pathLabel, errors) {
  if (typeof value === 'string') {
    if (PLACEHOLDER_REGEX.test(value)) {
      errors.push(`Placeholder text detected at ${pathLabel}: "${value}"`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) =>
      scanStringsForPlaceholders(item, `${pathLabel}[${idx}]`, errors)
    );
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      scanStringsForPlaceholders(val, `${pathLabel}.${key}`, errors);
    }
  }
}

function normalizeLevelsInput(levelsMap) {
  if (levelsMap instanceof Map) {
    return levelsMap;
  }
  if (Array.isArray(levelsMap)) {
    return new Map(levelsMap.map((lvl) => [lvl?.levelId, lvl]));
  }
  if (levelsMap && typeof levelsMap === 'object') {
    return new Map(Object.entries(levelsMap));
  }
  return new Map();
}

function sameMultiset(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  const counts = new Map();
  for (const item of a) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  for (const item of b) {
    const prev = counts.get(item) || 0;
    if (prev === 0) return false;
    counts.set(item, prev - 1);
  }
  return true;
}

export function validateCurriculum(catalogInput, levelsInput) {
  const errors = [];
  const levelsMap = normalizeLevelsInput(levelsInput);

  if (!catalogInput || typeof catalogInput !== 'object') {
    return {
      valid: false,
      errors: ['Catalog must be a valid object'],
      stats: null
    };
  }

  scanStringsForPlaceholders(catalogInput, 'catalog', errors);

  if (!isNonEmptyString(catalogInput.version)) {
    errors.push('catalog.version must be a non-empty string');
  }
  if (!Array.isArray(catalogInput.languages) || catalogInput.languages.length !== 3) {
    errors.push('catalog.languages must contain 3 language entries (en, zh, ja)');
  }

  const seenLevelIds = new Set();
  const seenLessonIds = new Set();
  const seenVocabIds = new Set();
  const seenGrammarIds = new Set();
  const seenQuizIds = new Set();

  let totalLessons = 0;
  let totalVocab = 0;
  let totalGrammar = 0;
  let totalDialogues = 0;
  let totalQuizzes = 0;

  for (const langEntry of catalogInput.languages || []) {
    if (!['en', 'zh', 'ja'].includes(langEntry.id)) {
      errors.push(`Unsupported language id in catalog: ${langEntry.id}`);
      continue;
    }
    if (!Array.isArray(langEntry.levels) || langEntry.levels.length === 0) {
      errors.push(`catalog.languages[${langEntry.id}].levels must be non-empty`);
      continue;
    }

    for (const levelId of langEntry.levels) {
      if (seenLevelIds.has(levelId)) {
        errors.push(`Duplicate levelId in catalog: ${levelId}`);
      }
      seenLevelIds.add(levelId);

      const level = levelsMap.get(levelId);
      if (!level) {
        errors.push(`Missing level data for ${levelId}`);
        continue;
      }

      scanStringsForPlaceholders(level, levelId, errors);

      if (level.levelId !== levelId) {
        errors.push(`Level ${levelId} has mismatched levelId: ${level.levelId}`);
      }
      if (level.language !== langEntry.id) {
        errors.push(`Level ${levelId} has mismatched language: ${level.language}`);
      }
      if (!isNonEmptyString(level.code)) {
        errors.push(`Level ${levelId} missing code`);
      }
      if (!Number.isInteger(level.order) || level.order < 1) {
        errors.push(`Level ${levelId} must have integer order >= 1`);
      }
      checkBilingual(level.title, `${levelId}.title`, errors);
      checkBilingual(level.subtitle, `${levelId}.subtitle`, errors);

      if (!Array.isArray(level.lessons) || level.lessons.length !== 3) {
        errors.push(`Level ${levelId} must have exactly 3 lessons`);
        continue;
      }

      for (const lesson of level.lessons) {
        totalLessons += 1;
        const lLabel = `${levelId}/${lesson.id || 'unknown'}`;

        if (!isNonEmptyString(lesson.id)) {
          errors.push(`${lLabel}: lesson.id is required`);
        } else if (seenLessonIds.has(lesson.id)) {
          errors.push(`Duplicate lesson.id: ${lesson.id}`);
        } else {
          seenLessonIds.add(lesson.id);
        }

        if (lesson.levelId !== levelId) {
          errors.push(`${lLabel}: lesson.levelId must equal ${levelId}`);
        }
        if (!lesson.title || !isNonEmptyString(lesson.title.native)) {
          errors.push(`${lLabel}: lesson.title.native is required`);
        }
        checkBilingual(lesson.title, `${lLabel}.title`, errors);
        checkBilingual(lesson.summary, `${lLabel}.summary`, errors);

        // Vocabulary validation
        const vocabList = Array.isArray(lesson.vocabulary) ? lesson.vocabulary : [];
        if (vocabList.length < 6) {
          errors.push(`${lLabel}: vocabulary must have >= 6 items (got ${vocabList.length})`);
        }
        for (const v of vocabList) {
          totalVocab += 1;
          const vLabel = `${lLabel}/vocab/${v.id || 'unknown'}`;
          if (!isNonEmptyString(v.id)) {
            errors.push(`${vLabel}: id is required`);
          } else if (seenVocabIds.has(v.id)) {
            errors.push(`Duplicate vocab id: ${v.id}`);
          } else {
            seenVocabIds.add(v.id);
          }
          if (!isNonEmptyString(v.term)) errors.push(`${vLabel}: term is required`);
          if (!isNonEmptyString(v.reading)) errors.push(`${vLabel}: reading is required`);
          if (!isNonEmptyString(v.partOfSpeech)) {
            errors.push(`${vLabel}: partOfSpeech is required`);
          }
          checkBilingual(v.meaning, `${vLabel}.meaning`, errors);

          if (!v.example || !isNonEmptyString(v.example.text) || !isNonEmptyString(v.example.reading)) {
            errors.push(`${vLabel}: example.text and example.reading are required`);
          } else {
            checkBilingual(v.example.meaning, `${vLabel}.example.meaning`, errors);
          }

          if (level.language === 'zh') {
            if (NUMERIC_PINYIN_REGEX.test(v.reading) || !TONE_MARKED_PINYIN_REGEX.test(v.reading)) {
              errors.push(`${vLabel}: zh reading must use tone-marked Pinyin ("${v.reading}")`);
            }
            if (v.example?.reading && NUMERIC_PINYIN_REGEX.test(v.example.reading)) {
              errors.push(`${vLabel}: zh example.reading must not use numeric tone digits`);
            }
          }

          if (level.language === 'ja') {
            if (!isNonEmptyString(v.romaji)) {
              errors.push(`${vLabel}: ja vocab requires non-empty romaji`);
            }
            if (!isNonEmptyString(v.rubyText)) {
              errors.push(`${vLabel}: ja vocab requires rubyText`);
            }
          }
        }

        // Grammar validation
        const grammarList = Array.isArray(lesson.grammar) ? lesson.grammar : [];
        if (grammarList.length < 2) {
          errors.push(`${lLabel}: grammar must have >= 2 items (got ${grammarList.length})`);
        }
        for (const g of grammarList) {
          totalGrammar += 1;
          const gLabel = `${lLabel}/grammar/${g.id || 'unknown'}`;
          if (!isNonEmptyString(g.id)) {
            errors.push(`${gLabel}: id is required`);
          } else if (seenGrammarIds.has(g.id)) {
            errors.push(`Duplicate grammar id: ${g.id}`);
          } else {
            seenGrammarIds.add(g.id);
          }
          if (!isNonEmptyString(g.pattern)) errors.push(`${gLabel}: pattern is required`);
          if (!isNonEmptyString(g.structure)) errors.push(`${gLabel}: structure is required`);
          checkBilingual(g.title, `${gLabel}.title`, errors);
          checkBilingual(g.explanation, `${gLabel}.explanation`, errors);
          checkBilingual(g.usageNote, `${gLabel}.usageNote`, errors);

          if (!Array.isArray(g.examples) || g.examples.length < 2) {
            errors.push(`${gLabel}: grammar requires >= 2 examples`);
          } else {
            g.examples.forEach((ex, idx) => {
              if (!isNonEmptyString(ex.text) || !isNonEmptyString(ex.reading)) {
                errors.push(`${gLabel}.examples[${idx}]: text and reading are required`);
              }
              checkBilingual(ex.meaning, `${gLabel}.examples[${idx}].meaning`, errors);
            });
          }
        }

        // Dialogue validation
        const dlg = lesson.dialogue;
        if (!dlg || typeof dlg !== 'object') {
          errors.push(`${lLabel}: dialogue is required`);
        } else {
          totalDialogues += 1;
          checkBilingual(dlg.title, `${lLabel}.dialogue.title`, errors);
          checkBilingual(dlg.context, `${lLabel}.dialogue.context`, errors);
          checkBilingual(dlg.culturalNote, `${lLabel}.dialogue.culturalNote`, errors);
          if (!['dialogue', 'reading'].includes(dlg.mode)) {
            errors.push(`${lLabel}.dialogue.mode must be 'dialogue' or 'reading'`);
          }
          if (!Array.isArray(dlg.lines) || dlg.lines.length < 4 || dlg.lines.length > 6) {
            errors.push(`${lLabel}.dialogue.lines must have 4-6 lines`);
          } else {
            dlg.lines.forEach((line, idx) => {
              if (!isNonEmptyString(line.speaker) || !isNonEmptyString(line.text) || !isNonEmptyString(line.reading)) {
                errors.push(`${lLabel}.dialogue.lines[${idx}]: speaker, text, reading required`);
              }
              checkBilingual(line.meaning, `${lLabel}.dialogue.lines[${idx}].meaning`, errors);
            });
          }
        }

        // Quizzes validation
        const quizList = Array.isArray(lesson.quizzes) ? lesson.quizzes : [];
        if (quizList.length < 4) {
          errors.push(`${lLabel}: quizzes must have >= 4 items (got ${quizList.length})`);
        }
        const quizTypes = new Set();
        for (const q of quizList) {
          totalQuizzes += 1;
          const qLabel = `${lLabel}/quiz/${q.id || 'unknown'}`;
          if (!isNonEmptyString(q.id)) {
            errors.push(`${qLabel}: id is required`);
          } else if (seenQuizIds.has(q.id)) {
            errors.push(`Duplicate quiz id: ${q.id}`);
          } else {
            seenQuizIds.add(q.id);
          }

          if (!VALID_QUIZ_TYPES.has(q.type)) {
            errors.push(`${qLabel}: invalid quiz type "${q.type}"`);
            continue;
          }
          quizTypes.add(q.type);
          checkBilingual(q.prompt, `${qLabel}.prompt`, errors);
          checkBilingual(q.explanation, `${qLabel}.explanation`, errors);

          if (q.type === 'sentence_order') {
            checkBilingual(q.targetMeaning, `${qLabel}.targetMeaning`, errors);
            if (!Array.isArray(q.tokens) || q.tokens.length < 2) {
              errors.push(`${qLabel}: tokens must be an array with >= 2 items`);
            }
            if (!Array.isArray(q.correctOrder) || q.correctOrder.length < 2) {
              errors.push(`${qLabel}: correctOrder must be an array with >= 2 items`);
            }
            if (!sameMultiset(q.tokens, q.correctOrder)) {
              errors.push(`${qLabel}: tokens must be an exact permutation of correctOrder`);
            }
            if (!isNonEmptyString(q.correctSentence)) {
              errors.push(`${qLabel}: correctSentence is required`);
            } else if (Array.isArray(q.correctOrder)) {
              const joinedCompact = q.correctOrder.join('').replace(/\s+/g, '');
              const sentenceCompact = q.correctSentence.replace(/\s+/g, '');
              if (joinedCompact !== sentenceCompact) {
                errors.push(
                  `${qLabel}: correctOrder ("${joinedCompact}") does not match correctSentence ("${sentenceCompact}")`
                );
              }
            }
          } else {
            if (!Array.isArray(q.options) || q.options.length !== 4) {
              errors.push(`${qLabel}: options must have exactly 4 items`);
            } else {
              if (q.options.some((opt) => !isNonEmptyString(opt))) {
                errors.push(`${qLabel}: all 4 options must be non-empty strings`);
              }
              if (new Set(q.options).size !== 4) {
                errors.push(`${qLabel}: options must be 4 distinct strings`);
              }
            }
            if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) {
              errors.push(`${qLabel}: correctIndex must be an integer 0..3`);
            }
          }
        }
        if (quizTypes.size < 3) {
          errors.push(`${lLabel}: quizzes must cover >= 3 distinct types (got ${quizTypes.size})`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      levels: seenLevelIds.size,
      lessons: totalLessons,
      vocabulary: totalVocab,
      grammar: totalGrammar,
      dialogues: totalDialogues,
      quizzes: totalQuizzes
    }
  };
}

const catalog = readJsonUtf8(path.join(__dirname, 'catalog.json'));

const levelsList = [];
const levelsById = new Map();
const levelsByLanguage = new Map([
  ['en', []],
  ['zh', []],
  ['ja', []]
]);
const lessonsById = new Map();
const vocabById = new Map();
const vocabByLanguage = new Map([
  ['en', []],
  ['zh', []],
  ['ja', []]
]);

for (const [expectedId, relPath] of LEVEL_FILE_MAP) {
  const fullPath = path.join(__dirname, relPath);
  const levelData = readJsonUtf8(fullPath);
  levelsList.push(levelData);
  levelsById.set(levelData.levelId || expectedId, levelData);

  const langArr = levelsByLanguage.get(levelData.language);
  if (langArr) {
    langArr.push(levelData);
  }

  const langVocabArr = vocabByLanguage.get(levelData.language);
  for (const lesson of levelData.lessons || []) {
    lessonsById.set(lesson.id, lesson);
    for (const vocab of lesson.vocabulary || []) {
      vocabById.set(vocab.id, { vocab, lesson, level: levelData });
      if (langVocabArr) {
        langVocabArr.push(vocab);
      }
    }
  }
}

for (const arr of levelsByLanguage.values()) {
  arr.sort((a, b) => a.order - b.order);
}

export function getCatalog() {
  return catalog;
}

export function getLanguage(lang) {
  return catalog.languages.find((l) => l.id === lang) || null;
}

export function getLevel(levelId) {
  return levelsById.get(levelId) || null;
}

export function getLevelsByLanguage(lang) {
  return levelsByLanguage.get(lang) || [];
}

export function getAllLevels() {
  return levelsList;
}

export function getLesson(lessonId) {
  return lessonsById.get(lessonId) || null;
}

export function getVocabById(vocabId) {
  return vocabById.get(vocabId) || null;
}

export function getVocabByLanguage(lang) {
  return vocabByLanguage.get(lang) || [];
}

export default {
  getCatalog,
  getLanguage,
  getLevel,
  getLevelsByLanguage,
  getAllLevels,
  getLesson,
  getVocabById,
  getVocabByLanguage,
  validateCurriculum
};
