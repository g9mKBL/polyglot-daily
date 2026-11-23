const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

export function stripRubyBrackets(rubyText) {
  return String(rubyText ?? '').replace(/\[[^\]]+\]/g, '');
}

/**
 * Parses Japanese `漢字[かな]` notation into safe HTML `<ruby>漢字<rt>かな</rt></ruby>`.
 * Handles multiple bracketed segments inside a single string while escaping all text.
 */
export function renderRubyText(rubyText, fallbackText = '', showPhonetics = true) {
  const source = rubyText || fallbackText || '';
  if (!source) return '';
  if (!rubyText) return escapeHtml(fallbackText);

  if (!showPhonetics) {
    return escapeHtml(stripRubyBrackets(rubyText));
  }

  const pattern = /([^\s\[\]]+?)\[([^\]]+)\]/g;
  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(rubyText)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(rubyText.slice(lastIndex, match.index));
    }
    const base = escapeHtml(match[1]);
    const reading = escapeHtml(match[2]);
    result += `<ruby>${base}<rp>(</rp><rt>${reading}</rt><rp>)</rp></ruby>`;
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < rubyText.length) {
    result += escapeHtml(rubyText.slice(lastIndex));
  }

  return result;
}

export function formatBilingual(obj) {
  if (!obj) return '';
  if (typeof obj === 'string') return escapeHtml(obj);
  const vi = obj.vi ? escapeHtml(obj.vi) : '';
  const en = obj.en ? escapeHtml(obj.en) : '';
  if (vi && en && vi !== en) {
    return `${vi} <span class="subtle">/ ${en}</span>`;
  }
  return vi || en;
}

export function langLabel(lang) {
  if (lang === 'en') return 'Tiếng Anh (EN)';
  if (lang === 'zh') return 'Tiếng Trung (中文)';
  if (lang === 'ja') return 'Tiếng Nhật (日本語)';
  return 'Tất cả (All)';
}

export function langShort(lang) {
  if (lang === 'en') return 'EN';
  if (lang === 'zh') return 'ZH';
  if (lang === 'ja') return 'JA';
  return 'ALL';
}
