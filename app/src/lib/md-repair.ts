/**
 * Repair the machine-checkable mistakes in a Markdown document.
 *
 * `formatMarkdown` (lib/markdown-format.ts) reformats a document that already
 * parses. This fixes the ones that do not — the typos a renderer swallows
 * silently and shows as literal text: an unclosed code fence that eats the
 * rest of the file, a table row that lost a pipe and dropped out of the table,
 * a link whose `)` never came.
 *
 * Every finding lands in one of two buckets, and the split is the point:
 *
 *   - `fixed`    — the intent is unambiguous (a fence is open at EOF, a closing
 *                  fence was typed with too few characters, a row is one cell
 *                  short of its header), so it is repaired in place.
 *   - `unparsed` — it is clearly broken but the intent is not (a stray `*` can
 *                  be a typo or arithmetic; a lone `[` can be prose), so it is
 *                  reported and left alone rather than guessed at. The caller
 *                  turns this into "could not be repaired" feedback.
 *
 * Nothing outside a fenced block is touched for the punctuation passes, and a
 * table is only ever rewritten where it is actually short of cells — a table
 * that was already square comes back byte-identical.
 */

export type RepairKind = 'fence' | 'table' | 'link' | 'code' | 'bracket' | 'emphasis';

export interface RepairFinding {
  /** 1-based line number in the source. */
  line: number;
  kind: RepairKind;
}

export interface RepairResult {
  /** The repaired document; byte-identical to the input when nothing was wrong. */
  text: string;
  /** Findings that were repaired in place. */
  fixed: RepairFinding[];
  /** Findings that were recognised but deliberately left alone. */
  unparsed: RepairFinding[];
}

/** A line, split so the original EOL survives a rebuild byte for byte. */
interface Line {
  body: string;
  eol: string;
}

function splitLines(src: string): Line[] {
  const lines: Line[] = [];
  let i = 0;
  while (i < src.length) {
    const nl = src.indexOf('\n', i);
    if (nl < 0) {
      lines.push({ body: src.slice(i), eol: '' });
      break;
    }
    const crlf = src[nl - 1] === '\r';
    lines.push({ body: src.slice(i, crlf ? nl - 1 : nl), eol: crlf ? '\r\n' : '\n' });
    i = nl + 1;
  }
  return lines;
}

function joinLines(lines: Line[]): string {
  return lines.map((l) => l.body + l.eol).join('');
}

/** The EOL every line in this document uses; '\n' when there are none yet. */
function documentEol(lines: Line[]): string {
  for (const l of lines) if (l.eol) return l.eol;
  return '\n';
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** The fence marker a line opens (or closes) with, if any. */
function fenceMarker(body: string): { char: string; len: number } | null {
  const m = FENCE_OPEN.exec(body);
  if (!m) return null;
  const char = m[1][0];
  // CommonMark: a backtick fence may not carry a backtick in its info string,
  // which is what keeps ``` ``x`` ``` from reading as an opener.
  if (char === '`' && m[2].includes('`')) return null;
  return { char, len: m[1].length };
}

/**
 * A fence marker the author shortened on its way out: a closing ```` ``` ````
 * typed as ``, a `~~~` as `~`. One or two fence characters are not a fence at
 * any level of the spec, so a line holding nothing else is either a typo or a
 * block that never closed — and a block that never closed swallows the rest of
 * the file, which is exactly what a renderer then chokes on. A fence's own
 * content putting a lone `` `` `` on a line by itself is possible but rare
 * (see the note on `shortClosers`), and this is a repair command, not a
 * formatter: the user asked for the document to be checked.
 */
const NEAR_FENCE = /^[ \t]*(`{1,2}|~{1,2})[ \t]*$/;

/**
 * Which lines sit inside a fenced block, the fence still open at EOF, and any
 * near-miss closers found along the way.
 *
 * The fence lines themselves count as inside: their contents are code, and
 * the docs of this module promise not to rewrite code.
 */
function fenceMask(lines: Line[]): {
  inFence: boolean[];
  unclosed: { index: number; indent: string; char: string; len: number } | null;
  /** Lines holding a shortened closing fence, with the marker to write back. */
  shortClosers: { index: number; marker: string }[];
} {
  const inFence = new Array<boolean>(lines.length).fill(false);
  const shortClosers: { index: number; marker: string }[] = [];
  let open: { index: number; indent: string; char: string; len: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const body = lines[i].body;
    const indent = /^ */.exec(body)?.[0] ?? '';
    const label = fenceMarker(body);
    if (!open) {
      if (label) {
        open = { index: i, indent, char: label.char, len: label.len };
        inFence[i] = true;
      }
      continue;
    }
    inFence[i] = true;
    // Only a bare fence of the same character, at least as long, closes it —
    // anything else (an info string, a different marker) is plain content.
    if (
      label &&
      label.char === open.char &&
      label.len >= open.len &&
      body.slice(indent.length + label.len).trim() === ''
    ) {
      open = null;
      continue;
    }
    // The shortened closer. Only the opener's own character counts, so a `~~`
    // inside a ```` ``` ```` block stays where it is, and the marker is written
    // at the opener's indent so it closes no matter how the typo was indented.
    const near = NEAR_FENCE.exec(body);
    if (near && near[1][0] === open.char) {
      shortClosers.push({ index: i, marker: open.indent + open.char.repeat(Math.max(3, open.len)) });
      open = null;
    }
  }
  return { inFence, unclosed: open, shortClosers };
}

// ── tables ──────────────────────────────────────────────────────────────────

const DELIMITER_CELL = /^:?-{1,}:?$/;

/** Split a table row on unescaped pipes, trimming each cell. */
function splitRow(body: string): string[] {
  let s = body.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) {
      cur += ch + s[i + 1];
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function buildRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

/**
 * Is this the `|---|---|` row under a table header?
 *
 * A table needs either a pipe or two cells: without that guard a lone `---`
 * (thematic break) or the `-----` of a setext heading reads as a delimiter
 * row and every paragraph under it gets treated as a broken table.
 */
function isDelimiterRow(body: string): boolean {
  if (!body.includes('-')) return false;
  const cells = splitRow(body);
  if (cells.length < 2 && !body.includes('|')) return false;
  return cells.every((c) => DELIMITER_CELL.test(c));
}

/** Pad `cells` out to `width`. */
function padTo(cells: string[], width: number): string[] {
  return cells.length >= width ? cells : cells.concat(new Array(width - cells.length).fill(''));
}

function repairTables(lines: Line[], inFence: boolean[], fixed: RepairFinding[]): void {
  for (let i = 0; i + 1 < lines.length; i++) {
    if (inFence[i] || inFence[i + 1]) continue;
    if (!isDelimiterRow(lines[i + 1].body)) continue;
    const headCells = splitRow(lines[i].body);
    if (headCells.length < 2 && !lines[i].body.includes('|')) continue;

    // Rows belong to the table until a blank line or a line with no pipe at
    // all — after that a stray `a | b` is prose again, not a table row.
    const rows: number[] = [];
    for (let j = i + 2; j < lines.length; j++) {
      if (inFence[j]) break;
      const body = lines[j].body;
      if (body.trim() === '' || !body.includes('|')) break;
      rows.push(j);
    }

    const delimCells = splitRow(lines[i + 1].body);
    // The widest line wins: a row with more cells than the header means the
    // header is the one that lost its pipes, not the row that gained one.
    let width = Math.max(headCells.length, delimCells.length);
    for (const r of rows) width = Math.max(width, splitRow(lines[r].body).length);
    if (width < 2) continue;

    let changed = false;
    const head = headCells.length === width ? null : buildRow(padTo(headCells, width));
    if (head !== null) {
      lines[i] = { ...lines[i], body: head };
      changed = true;
    }
    const delimOk = delimCells.length === width && delimCells.every((c) => DELIMITER_CELL.test(c));
    if (!delimOk) {
      // Keep whatever alignment colons survived; a cell that lost its dashes
      // entirely gets the default three.
      const next = Array.from({ length: width }, (_, k) => {
        const c = delimCells[k] ?? '';
        return `${c.startsWith(':') ? ':' : ''}---${c.endsWith(':') ? ':' : ''}`;
      });
      lines[i + 1] = { ...lines[i + 1], body: buildRow(next) };
      changed = true;
    }
    for (const r of rows) {
      const cells = splitRow(lines[r].body);
      if (cells.length === width) continue;
      lines[r] = { ...lines[r], body: buildRow(padTo(cells, width)) };
      changed = true;
    }
    if (changed) fixed.push({ line: i + 1, kind: 'table' });
  }
}

// ── inline punctuation ──────────────────────────────────────────────────────

/** Drop inline code spans, so `**` or `[` inside them are not counted. */
function stripInlineCode(body: string): string {
  return body.replace(/`+[^`]*`+/g, '');
}

/** Index of the `)` closing the `(` at `from`, honouring nesting + escapes. */
function matchingParen(body: string, from: number): number {
  let depth = 0;
  // Starts after the opening paren, so a nested `(a(b)c)` is skipped whole.
  for (let i = from + 1; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

/**
 * Fix link/image destinations: a target with spaces has to be wrapped in
 * `<>` to parse at all, and a `](` with no `)` swallows the rest of the line.
 * The `)` is closed at end of line, which is where the author stopped typing.
 */
function repairLinkLine(body: string): { body: string; fixed: boolean } {
  let out = body;
  let fixed = false;

  for (let at = out.indexOf(']('); at >= 0; at = out.indexOf('](', at + 2)) {
    const open = at + 1;
    const close = matchingParen(out, open);
    if (close < 0) {
      out = `${out.replace(/\s+$/, '')})`;
      fixed = true;
      break;
    }
    const inner = out.slice(open + 1, close);
    // `dest "title"` / `dest (title)` — only the destination is checked.
    const titled = /^(.*?)(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))\s*$/.exec(inner.trim());
    const dest = titled ? titled[1] : inner.trim();
    const title = titled ? titled[2] : '';
    if (/\s/.test(dest) && !dest.startsWith('<')) {
      out = `${out.slice(0, open + 1)}<${dest}>${title}${out.slice(close)}`;
      fixed = true;
      at += dest.length + 2;
    }
  }
  return { body: out, fixed };
}

function repairInline(
  lines: Line[],
  inFence: boolean[],
  fixed: RepairFinding[],
  unparsed: RepairFinding[],
): void {
  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) continue;
    let body = lines[i].body;

    // Escape hatch: after this line, go back to the original so the counting
    // passes look at what the document still says, but keep the repair.
    const link = repairLinkLine(body);
    if (link.fixed) {
      body = link.body;
      fixed.push({ line: i + 1, kind: 'link' });
    }

    // An unpaired backtick turns the rest of the line into code.
    const ticks = (body.replace(/\\`/g, '').match(/`/g) ?? []).length;
    if (ticks % 2 === 1) {
      body = `${body.replace(/\s+$/, '')}\``;
      fixed.push({ line: i + 1, kind: 'code' });
    }

    const bare = stripInlineCode(body);
    const opens = (bare.match(/\[/g) ?? []).length;
    const closes = (bare.match(/\]/g) ?? []).length;
    // Only when there is a `](` somewhere: otherwise `a[0` and `array[1]` in
    // prose are not something a repair pass can reason about.
    if (opens !== closes && /\]\(/.test(bare)) {
      unparsed.push({ line: i + 1, kind: 'bracket' });
    }
    if ((bare.match(/\*\*/g) ?? []).length % 2 === 1) {
      unparsed.push({ line: i + 1, kind: 'emphasis' });
    }

    if (body !== lines[i].body) lines[i] = { ...lines[i], body };
  }
}

/**
 * Repair `source`. Pure: the caller decides whether to write the result back,
 * and anything that cannot be repaired is reported rather than changed.
 */
export function repairMarkdown(source: string): RepairResult {
  const lines = splitLines(source);
  const { inFence, unclosed, shortClosers } = fenceMask(lines);
  const fixed: RepairFinding[] = [];
  const unparsed: RepairFinding[] = [];

  // A shortened closer is rewritten in place — that line *is* the fence, and
  // leaving it in the block is what a diagram renderer trips over.
  for (const { index, marker } of shortClosers) {
    lines[index] = { ...lines[index], body: marker };
    fixed.push({ line: index + 1, kind: 'fence' });
  }

  repairTables(lines, inFence, fixed);
  repairInline(lines, inFence, fixed, unparsed);

  // Last, so the closer it adds is not itself inspected by the passes above.
  if (unclosed) {
    lines.push({
      body: unclosed.indent + unclosed.char.repeat(unclosed.len),
      eol: documentEol(lines),
    });
    fixed.push({ line: unclosed.index + 1, kind: 'fence' });
  }

  const byLine = (a: RepairFinding, b: RepairFinding) => a.line - b.line;
  fixed.sort(byLine);
  unparsed.sort(byLine);
  return { text: joinLines(lines), fixed, unparsed };
}
