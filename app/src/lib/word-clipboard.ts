/**
 * #427 — "Copy as Word" (`copyAsWord`) HTML transformer.
 *
 * Pasting SoloMD's raw preview HTML directly into Microsoft Word / WPS Office
 * fails in four ways because external stylesheets are not carried on the
 * clipboard:
 *   1. KaTeX outputs both `<span class="katex-mathml"><math>…</math></span>`
 *      and `<span class="katex-html" aria-hidden="true">…</span>`. Without
 *      `katex.min.css` (`display: none` on `.katex-mathml`), Word pastes both
 *      trees — every formula appears twice (once as an equation and once as
 *      garbled span fragments). Keeping only `<math>` lets Word convert it
 *      into a native Office Math (OMML) equation.
 *   2. Fenced code blocks wrap each line in `<span class="cb-line">` and emit
 *      a `<div class="code-block__header">` with language badge + Copy button.
 *      Word pastes the button text and collapses `.cb-line` spans onto a
 *      single line unless explicit `<br>` breaks are inserted.
 *   3. Tables have no inline borders, so Word pastes borderless cells.
 *   4. `<input type="checkbox">` in task lists becomes a legacy ActiveX
 *      control in Word instead of `☑` / `☐`.
 */

const WORD_BASE_CSS = `
  body {
    font-family: Calibri, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1f1e1c;
  }
  h1, h2, h3, h4, h5, h6 {
    font-family: Calibri, "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #1f1e1c;
    margin-top: 12pt;
    margin-bottom: 6pt;
    line-height: 1.3;
  }
  h1 { font-size: 20pt; }
  h2 { font-size: 16pt; }
  h3 { font-size: 13.5pt; }
  h4 { font-size: 12pt; }
  p { margin: 0 0 8pt 0; }
  ul, ol { margin: 6pt 0 8pt 0; padding-left: 24pt; }
  li { margin: 2pt 0; }
  blockquote {
    margin: 8pt 0;
    padding: 4pt 0 4pt 10pt;
    border-left: 3pt solid #e07b39;
    color: #5e5b55;
  }
  pre {
    background: #f6f5f2;
    border: 1px solid #e5e7eb;
    border-left: 3pt solid #e07b39;
    padding: 8pt 10pt;
    font-family: Consolas, "JetBrains Mono", "Courier New", monospace;
    font-size: 9.5pt;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 8pt 0;
  }
  code {
    font-family: Consolas, "JetBrains Mono", "Courier New", monospace;
    font-size: 9.5pt;
    background: #f6f5f2;
    padding: 1pt 3pt;
  }
  pre code {
    background: transparent;
    padding: 0;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 8pt 0;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 6px 10px;
    vertical-align: top;
  }
  th {
    background: #f6f5f2;
    font-weight: bold;
  }
  hr {
    border: none;
    border-bottom: 1px solid #d1d5db;
    margin: 12pt 0;
  }
`;

/**
 * Find every balanced `<tagName ...>...</tagName>` whose opening tag matches
 * `openTagRegex` and replace it with `replacer(innerHtml, openTag)`.
 * Handles arbitrarily nested tags of the same `tagName` (e.g. KaTeX's nested
 * `<span>` trees).
 */
function replaceBalancedElement(
  html: string,
  tagName: string,
  openTagRegex: RegExp,
  replacer: (innerHtml: string, openTag: string) => string,
): string {
  const openAnyRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const closeRe = new RegExp(`</${tagName}\\s*>`, 'gi');
  const matcher = new RegExp(
    openTagRegex.source,
    openTagRegex.flags.includes('g') ? openTagRegex.flags : `${openTagRegex.flags}g`,
  );

  let out = '';
  let cursor = 0;

  while (cursor < html.length) {
    matcher.lastIndex = cursor;
    const match = matcher.exec(html);
    if (!match) {
      out += html.slice(cursor);
      break;
    }

    const startIdx = match.index;
    const openTag = match[0];
    const innerStart = startIdx + openTag.length;

    // Walk forward counting nested <tagName> and </tagName>
    let depth = 1;
    let scanPos = innerStart;
    let innerEnd = -1;
    let afterClose = -1;

    while (depth > 0 && scanPos < html.length) {
      openAnyRe.lastIndex = scanPos;
      closeRe.lastIndex = scanPos;
      const nextOpen = openAnyRe.exec(html);
      const nextClose = closeRe.exec(html);

      if (!nextClose) break;

      if (nextOpen && nextOpen.index < nextClose.index) {
        // Self-closing tag check
        if (!nextOpen[0].endsWith('/>')) {
          depth++;
        }
        scanPos = nextOpen.index + nextOpen[0].length;
      } else {
        depth--;
        if (depth === 0) {
          innerEnd = nextClose.index;
          afterClose = nextClose.index + nextClose[0].length;
        } else {
          scanPos = nextClose.index + nextClose[0].length;
        }
      }
    }

    if (innerEnd < 0) {
      // Unbalanced fallback: copy remaining string as-is
      out += html.slice(cursor);
      break;
    }

    out += html.slice(cursor, startIdx);
    const innerHtml = html.slice(innerStart, innerEnd);
    out += replacer(innerHtml, openTag);
    cursor = afterClose;
  }

  return out;
}

function ensureMathMlAttrs(mathHtml: string, displayBlock: boolean): string {
  return mathHtml.replace(/^<math\b([^>]*)>/i, (_full, attrs: string) => {
    let nextAttrs = attrs;
    if (!/\bxmlns\s*=/i.test(nextAttrs)) {
      nextAttrs += ' xmlns="http://www.w3.org/1998/Math/MathML"';
    }
    if (displayBlock && !/\bdisplay\s*=/i.test(nextAttrs)) {
      nextAttrs += ' display="block"';
    }
    return `<math${nextAttrs}>`;
  });
}

function styleTablesForWord(html: string): string {
  return html
    .replace(/<table(\b[^>]*?)>/gi, (_m, attrs: string) => {
      if (/\bstyle\s*=/i.test(attrs)) return `<table${attrs}>`;
      return `<table${attrs} style="border-collapse: collapse; width: 100%; margin: 8pt 0;">`;
    })
    .replace(/<th(\b[^>]*?)>/gi, (_m, attrs: string) => {
      const base = 'border: 1px solid #cbd5e1; padding: 6px 10px; background: #f6f5f2; font-weight: bold;';
      if (/\bstyle\s*=\s*"([^"]*)"/i.test(attrs)) {
        return `<th${attrs.replace(/\bstyle\s*=\s*"([^"]*)"/i, `style="${base} $1"`)}>`;
      }
      return `<th${attrs} style="${base}">`;
    })
    .replace(/<td(\b[^>]*?)>/gi, (_m, attrs: string) => {
      const base = 'border: 1px solid #cbd5e1; padding: 6px 10px;';
      if (/\bstyle\s*=\s*"([^"]*)"/i.test(attrs)) {
        return `<td${attrs.replace(/\bstyle\s*=\s*"([^"]*)"/i, `style="${base} $1"`)}>`;
      }
      return `<td${attrs} style="${base}">`;
    });
}

export function buildWordClipboardHtml(rawHtml: string): string {
  if (!rawHtml) return '';

  let html = styleTablesForWord(rawHtml);

  // 1. Strip interactive toolbar / header chrome inside code blocks & heading anchors.
  html = replaceBalancedElement(
    html,
    'div',
    /<div\b[^>]*\bclass="[^"]*\bcode-block__header\b[^"]*"[^>]*>/i,
    () => '',
  );
  html = replaceBalancedElement(
    html,
    'button',
    /<button\b[^>]*\bclass="[^"]*\bcode-block__copy\b[^"]*"[^>]*>/i,
    () => '',
  );
  html = replaceBalancedElement(
    html,
    'a',
    /<a\b[^>]*\bclass="[^"]*\bheading-anchor\b[^"]*"[^>]*>/i,
    () => '',
  );

  // 2. KaTeX: strip `.katex-html` visual spans and promote `<math>` so Word
  //    converts MathML into native Office Math without duplicating text.
  html = replaceBalancedElement(
    html,
    'span',
    /<span\b[^>]*\bclass="[^"]*\bkatex-display\b[^"]*"[^>]*>/i,
    (inner) => {
      const mathMatch = inner.match(/<math\b[\s\S]*?<\/math>/i);
      if (mathMatch) {
        const math = ensureMathMlAttrs(mathMatch[0], true);
        return `<p align="center" style="text-align:center;margin:8pt 0;">${math}</p>`;
      }
      return replaceBalancedElement(
        inner,
        'span',
        /<span\b[^>]*\bclass="[^"]*\bkatex-html\b[^"]*"[^>]*>/i,
        () => '',
      );
    },
  );

  html = replaceBalancedElement(
    html,
    'span',
    /<span\b[^>]*\bclass="[^"]*\bkatex\b[^"]*"[^>]*>/i,
    (inner) => {
      const mathMatch = inner.match(/<math\b[\s\S]*?<\/math>/i);
      if (mathMatch) {
        return ensureMathMlAttrs(mathMatch[0], false);
      }
      return replaceBalancedElement(
        inner,
        'span',
        /<span\b[^>]*\bclass="[^"]*\bkatex-html\b[^"]*"[^>]*>/i,
        () => '',
      );
    },
  );

  // 3. Fenced code blocks: remove `.cb-ln` line numbers and join `.cb-line`
  //    spans with explicit `<br>` line breaks so Word preserves line breaks.
  html = replaceBalancedElement(html, 'pre', /<pre\b[^>]*>/i, (preInner) => {
    let cleaned = replaceBalancedElement(
      preInner,
      'span',
      /<span\b[^>]*\bclass="[^"]*\bcb-ln\b[^"]*"[^>]*>/i,
      () => '',
    );

    const lines: string[] = [];
    replaceBalancedElement(
      cleaned,
      'span',
      /<span\b[^>]*\bclass="[^"]*\bcb-line\b[^"]*"[^>]*>/i,
      (lineInner) => {
        lines.push(lineInner);
        return '';
      },
    );

    if (lines.length > 0) {
      const joined = lines.join('<br>');
      if (/<code\b[^>]*>/i.test(cleaned)) {
        cleaned = replaceBalancedElement(
          cleaned,
          'code',
          /<code\b[^>]*>/i,
          (_codeInner, codeOpen) => `${codeOpen}${joined}</code>`,
        );
      } else {
        cleaned = joined;
      }
    }

    const preStyle =
      'background:#f6f5f2;border:1px solid #e5e7eb;border-left:3pt solid #e07b39;padding:8pt 10pt;font-family:Consolas,"Courier New",monospace;font-size:9.5pt;line-height:1.45;white-space:pre-wrap;word-break:break-word;margin:8pt 0;';
    return `<pre style="${preStyle}">${cleaned}</pre>`;
  });

  // 4. Task-list checkboxes -> plain Unicode ballot boxes (`☑` / `☐`).
  html = html.replace(/<input\b[^>]*\btype=["']checkbox["'][^>]*>/gi, (tag) =>
    /\bchecked\b/i.test(tag) ? '☑ ' : '☐ ',
  );

  // 5. Ordered lists: explicit `start="1"` on every `<ol>` that doesn't set
  //    one so Word restarts numbering at 1 for each list section (#427).
  html = html.replace(/<ol(\b[^>]*?)>/gi, (_m, attrs: string) => {
    if (/\bstart\s*=/i.test(attrs)) return `<ol${attrs}>`;
    return `<ol start="1"${attrs}>`;
  });

  return wrapWordDocument(html);
}

function wrapWordDocument(fragmentHtml: string): string {
  return [
    '<!DOCTYPE html>',
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml">',
    '<head>',
    '<meta charset="utf-8">',
    `<style>${WORD_BASE_CSS}</style>`,
    '</head>',
    '<body>',
    '<!--StartFragment-->',
    fragmentHtml,
    '<!--EndFragment-->',
    '</body>',
    '</html>',
  ].join('\n');
}
