/**
 * Markdown list / quote continuation on Enter for the plain-textarea editors
 * (Windows, #341). CodeMirror gets the same behaviour from
 * `insertNewlineContinueMarkup`; this is the textarea equivalent, kept pure so
 * both plain paths (flat textarea and live-edit blocks) share one rule.
 *
 *   - `- item|`        → `- item\n- |`
 *   - `3. item|`       → `3. item\n4. |`   (`)` delimiters kept)
 *   - `1.1 item|`      → `1.1 item\n1.2 |` (fork: multi-level outlines count
 *     their last level, `1.1.9` → `1.1.10`, keeping the separator style)
 *   - `- [x] done|`    → `- [x] done\n- [ ] |`
 *   - `> > quote|`     → `> > quote\n> > |`
 *   - `> - item|`      → `> - item\n> - |`
 *   - Enter on an empty item removes that item's marker (ends the list /
 *     quote), leaving the line empty — the second Enter of "Enter, Enter".
 *
 * Returns null whenever a plain newline is the right answer: a selection, the
 * caret inside the marker itself, a line that is not a list/quote, a line
 * inside a fenced code block, or either of the fork's two toolbar toggles
 * saying no (see `ListContinuationOptions`).
 */

export interface ContinuationEdit {
  value: string;
  caret: number;
}

/**
 * The two toolbar toggles (fork addition, both on by default).
 *
 *   - `listContinuation` — "项目符号": inherit the previous line's list / quote
 *     format at all. Off → Enter is always a plain newline.
 *   - `autoNumber` — "自动编号": count ordered items. Off → an ordered line is no
 *     longer a list line for this purpose (bullets, tasks and quotes are
 *     unaffected).
 */
export interface ListContinuationOptions {
  listContinuation: boolean;
  autoNumber: boolean;
}

const DEFAULT_OPTIONS: ListContinuationOptions = { listContinuation: true, autoNumber: true };

// Leading indent + any number of `>` quote markers (each with optional space).
const QUOTE_PREFIX = /^([ \t]*(?:>[ \t]?)*)/;
// A list marker right after the quote prefix: bullet or ordered, then an
// optional task box. The ordered number is one or more levels (`1`, `1.1`,
// `1.1.2`) and its trailing delimiter is optional, because a multi-level
// outline carries that punctuation inside the number (`1.1 ` has no marker
// delimiter of its own).
const LIST_MARKER = /^([ \t]*)(?:([-*+])|(\d{1,9}(?:[.)]\d{1,9})*))([.)]?)([ \t]+)(\[[ xX]\][ \t]+)?/;

/**
 * Increment the last level of a numbered token, keeping its shape:
 * `1` → `2`, `1.1` → `1.2`, `1.1.9` → `1.1.10`. Returns null for a token that
 * is not a number.
 */
export function bumpNumberedToken(token: string): string | null {
  const m = /^(\d+)((?:[.)]\d+)*)$/.exec(token);
  if (!m) return null;
  const head = m[1];
  const rest = m[2].match(/[.)]\d+/g);
  if (!rest || !rest.length) return `${Number(head) + 1}`;
  const last = rest[rest.length - 1];
  return `${head}${rest.slice(0, -1).join('')}${last[0]}${Number(last.slice(1)) + 1}`;
}

/** True when `lineStart` sits inside an open ``` / ~~~ fence of `text`. */
export function insideFence(text: string, lineStart: number): boolean {
  let open: { ch: string; len: number } | null = null;
  const before = text.slice(0, lineStart);
  for (const line of before.split('\n')) {
    const m = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!m) continue;
    const ch = m[1][0];
    const len = m[1].length;
    if (!open) {
      // A backtick opener's info string may not contain backticks.
      if (ch === '`' && m[2].includes('`')) continue;
      open = { ch, len };
    } else if (ch === open.ch && len >= open.len && m[2].trim() === '') {
      open = null;
    }
  }
  return open !== null;
}

export function computeListContinuation(
  text: string,
  selStart: number,
  selEnd: number,
  opts: ListContinuationOptions = DEFAULT_OPTIONS,
): ContinuationEdit | null {
  // Toolbar "项目符号" off → never continue a list or a quote.
  if (!opts.listContinuation) return null;
  if (selStart !== selEnd) return null;
  const caret = selStart;
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
  const nl = text.indexOf('\n', caret);
  const lineEnd = nl < 0 ? text.length : nl;
  const line = text.slice(lineStart, lineEnd);

  if (insideFence(text, lineStart)) return null;

  const quote = line.match(QUOTE_PREFIX)?.[1] ?? '';
  const hasQuote = quote.includes('>');
  const rest = line.slice(quote.length);
  const list = rest.match(LIST_MARKER);

  let markerLen: number; // length of the whole marker on this line
  let nextMarker: string; // marker for the new line
  if (list) {
    const [whole, indent, bullet, num, delim, gap, task] = list;
    // Toolbar "自动编号" off → an ordered line is not a list line here any more
    // (a bullet is, and so is a quote — see the doc comment).
    if (!bullet && !opts.autoNumber) return null;
    markerLen = quote.length + whole.length;
    // Normalise the gap after the marker to one space unless it was a
    // deliberate multi-space alignment (keep it then — it is the item's
    // content column).
    const sep = gap.includes('\t') ? gap : gap.length > 4 ? ' ' : gap;
    const head = bullet ?? `${bumpNumberedToken(num) ?? num}${delim}`;
    nextMarker = `${quote}${indent}${head}${sep}${task ? '[ ] ' : ''}`;
  } else if (hasQuote) {
    markerLen = quote.length;
    // `>` without a trailing space still continues as `> `.
    nextMarker = /[ \t]$/.test(quote) ? quote : `${quote} `;
  } else {
    return null;
  }

  // Caret inside (or before) the marker: splitting there would duplicate it.
  if (caret - lineStart < markerLen) return null;

  const content = line.slice(markerLen);
  if (content.trim() === '' && caret === lineEnd) {
    // Empty item → drop the marker and end the list here. For a list inside a
    // quote, keep the quote (`> - ` → `> `); a bare quote line ends the quote.
    const keep = list && hasQuote ? (/[ \t]$/.test(quote) ? quote : `${quote} `) : '';
    const value = text.slice(0, lineStart) + keep + text.slice(lineEnd);
    return { value, caret: lineStart + keep.length };
  }

  const insert = `\n${nextMarker}`;
  return { value: text.slice(0, caret) + insert + text.slice(caret), caret: caret + insert.length };
}
