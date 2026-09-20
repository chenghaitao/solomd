/**
 * focus-paragraph.ts — "which lines are the active paragraph", shared by the
 * CodeMirror focus-mode extension and the two Windows plain-<textarea> editor
 * paths.
 *
 * #316 — focus mode shipped as a CodeMirror extension only. With Vim off,
 * Windows runs the plain textarea editor (see `shouldUsePlainWindowsEditor`),
 * neither extension is loaded there, and both switches did nothing — turning
 * Vim *on* appeared to fix them, because that is what puts CodeMirror back.
 * Pulling the paragraph rule out here lets both editors dim exactly the same
 * lines, and makes the rule testable without a DOM.
 *
 * The rule is unchanged from the original extension: a paragraph is the run of
 * consecutive non-blank lines around the selection, and blank lines separate
 * them. Because each side is walked until it hits a blank line, a caret parked
 * on a blank line lights the paragraphs on *both* sides — long-standing
 * CodeMirror behaviour, kept deliberately.
 */

/** 1-based, inclusive line range. */
export interface LineRange {
  from: number;
  to: number;
}

/**
 * A lazy view over a document's logical lines.
 *
 * Deliberately not a `string[]`: the CodeMirror path probes this on every
 * keystroke and must not materialise (or even walk) the whole document, while
 * the plain path already holds a real array.
 */
export interface LineSource {
  /** Total number of logical lines. Always ≥ 1. */
  count: number;
  /** True when line `n` (1-based) is empty or whitespace-only. */
  isBlank(n: number): boolean;
}

/**
 * Line numbers (1-based) that count as active for focus mode.
 *
 * Every line covered by a selection range is active, then each range is grown
 * up and down across non-blank lines. With several selections the result can be
 * non-contiguous, which is why this returns a set rather than a range.
 */
export function activeParagraphLines(
  src: LineSource,
  selections: readonly LineRange[],
): Set<number> {
  const active = new Set<number>();
  const clamp = (n: number) => Math.max(1, Math.min(n, src.count));

  for (const selection of selections) {
    const from = clamp(selection.from);
    const to = clamp(selection.to);
    for (let n = from; n <= to; n++) active.add(n);
    // Walk up until a blank line (paragraph start)…
    let up = from - 1;
    while (up >= 1 && !src.isBlank(up)) {
      active.add(up);
      up--;
    }
    // …and down until a blank line (paragraph end).
    let down = to + 1;
    while (down <= src.count && !src.isBlank(down)) {
      active.add(down);
      down++;
    }
  }
  return active;
}

/** `LineSource` over an in-memory document. */
export function textLineSource(text: string): LineSource {
  const lines = text.split('\n');
  return {
    count: Math.max(lines.length, 1),
    isBlank: (n) => (lines[n - 1] ?? '').trim().length === 0,
  };
}

/**
 * Char offsets at which each logical line starts, parallel to the lines of the
 * same text. Lets callers map a document offset (a block boundary, say) onto a
 * line number without rescanning the document per lookup.
 */
export function lineStartsOf(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

/** 1-based number of the line whose start is the greatest one ≤ `offset`. */
export function lineOfOffset(starts: readonly number[], offset: number): number {
  if (!starts.length) return 1;
  const target = Math.max(0, offset);
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * Convenience for the single-caret case the textarea editors have: the first
 * and last line of the caret's paragraph. `activeParagraphLines` can return a
 * non-contiguous set for multi-selection, but a textarea has one caret, so the
 * min/max of that set *is* the paragraph.
 */
export function paragraphRange(src: LineSource, caretLine: number): LineRange {
  const active = activeParagraphLines(src, [{ from: caretLine, to: caretLine }]);
  let from = caretLine;
  let to = caretLine;
  for (const n of active) {
    if (n < from) from = n;
    if (n > to) to = n;
  }
  return { from, to };
}
