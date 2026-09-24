/**
 * list-continue.ts — what Enter does at the end of a list line.
 *
 * Typing `- foo` and pressing Enter should start the next bullet; `1. foo`
 * should start `2.`; a numbered outline like `1.1 foo` should start `1.2`.
 * Nothing here touches the DOM or CodeMirror — the editor paths (the plain
 * `<textarea>`, the block live editor, and the CodeMirror keymap) each call
 * these three pure functions with their own idea of "the current line".
 *
 * Two toolbar toggles decide the behaviour, both on by default:
 *
 *   - `listContinuation` ("项目符号"): inherit the previous line's list format
 *     at all. Off → Enter is always a plain newline.
 *   - `autoNumber` ("自动编号"): count ordered items. Off → ordered lists stop
 *     being continued at all (`1. ` ⏎ → plain newline), while bullets, task
 *     items and quotes keep working.
 */

export interface ListContinueOptions {
  /** Master switch: continue a list / quote on Enter. */
  listContinuation: boolean;
  /** Compute the next ordered number, including multi-level (`1.1` → `1.2`). */
  autoNumber: boolean;
}

export interface ListContinueEdit {
  value: string;
  caret: number;
}

/**
 * - `{ marker }` — put this marker on the new line
 * - `'end'` — the item was empty: drop the marker, leave a blank line
 * - `null` — not a list line (or the feature is off): let Enter do its thing
 */
export type ListMarker = { marker: string } | 'end' | null;

// `- `, `* `, `+ ` with an optional task checkbox. A marker only counts as a
// list when whitespace follows it, so `-3` or `*emphasis*` stay prose.
const BULLET_RE = /^(\s*)([-*+])\s+(?:(\[[ xX]\])\s+)?(.*)$/;
// `1. `, `1) `, `1.1 `, `1.1.2 ` — the trailing separator is optional because
// multi-level numbering carries its punctuation inside the number itself.
const ORDERED_RE = /^(\s*)(\d+(?:[.)]\d+)*[.)]?)\s+(.*)$/;
// `> `, `>> `, `> > ` — one level per line, as the plain path always did.
const QUOTE_RE = /^(\s*)(>)\s?(.*)$/;

/**
 * Increment the last segment of a numbered token, keeping its shape:
 * `1.` → `2.`, `1)` → `2)`, `1.1` → `1.2`, `1.1.2` → `1.1.3`, `1.1.` → `1.2.`.
 * Returns null for anything that isn't a number token.
 */
export function bumpNumberedToken(token: string): string | null {
  const m = /^(\d+)((?:[.)]\d+)*)([.)]?)$/.exec(token);
  if (!m) return null;
  const head = m[1];
  const tail = m[2];
  const trail = m[3];
  if (!tail) return `${Number(head) + 1}${trail}`;
  const segs = tail.match(/[.)]\d+/g);
  if (!segs || !segs.length) return null;
  const last = segs[segs.length - 1];
  const bumped = `${last[0]}${Number(last.slice(1)) + 1}`;
  return `${head}${segs.slice(0, -1).join('')}${bumped}${trail}`;
}

/** Decide what the line after `line` should start with. */
export function nextListMarker(line: string, opts: ListContinueOptions): ListMarker {
  if (!opts.listContinuation) return null;

  const bullet = BULLET_RE.exec(line);
  if (bullet) {
    const [, indent, mark, box, content] = bullet;
    if (content.trim() === '') return 'end';
    return { marker: `${indent}${mark} ${box ? '[ ] ' : ''}` };
  }

  const ordered = ORDERED_RE.exec(line);
  if (ordered) {
    const [, indent, token, content] = ordered;
    // Auto numbering off means ordered lines are no longer list lines here.
    if (!opts.autoNumber) return null;
    if (content.trim() === '') return 'end';
    const next = bumpNumberedToken(token);
    if (next === null) return null;
    return { marker: `${indent}${next} ` };
  }

  const quote = QUOTE_RE.exec(line);
  if (quote) {
    const [, indent, mark, content] = quote;
    if (content.trim() === '') return 'end';
    return { marker: `${indent}${mark} ` };
  }

  return null;
}

/**
 * The whole-textarea flavour: given the text and a collapsed caret, return the
 * new value and caret, or null to let the browser handle Enter. Used by the
 * plain editor, which owns its document as one string.
 */
export function applyListContinue(
  text: string,
  caret: number,
  opts: ListContinueOptions,
): ListContinueEdit | null {
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
  const nl = text.indexOf('\n', caret);
  const lineEnd = nl < 0 ? text.length : nl;
  const next = nextListMarker(text.slice(lineStart, lineEnd), opts);
  if (next === null) return null;

  if (next === 'end') {
    // Drop the marker and leave the caret on the now-empty line.
    return { value: text.slice(0, lineStart) + text.slice(caret), caret: lineStart };
  }
  // Insert at the caret, not at the line end: Enter in the middle of an item
  // splits it and continues the list, which is what every other editor does.
  const insert = `\n${next.marker}`;
  return { value: text.slice(0, caret) + insert + text.slice(caret), caret: caret + insert.length };
}
