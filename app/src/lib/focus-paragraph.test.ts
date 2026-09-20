import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  activeParagraphLines,
  lineOfOffset,
  lineStartsOf,
  paragraphRange,
  textLineSource,
} from './focus-paragraph.ts';

const sorted = (src: Set<number>) => [...src].sort((a, b) => a - b);

test('a paragraph is the run of non-blank lines around the caret', () => {
  // 1: alpha
  // 2: beta      <- caret on 2
  // 3: gamma
  // 4: (blank)
  // 5: delta
  const doc = textLineSource('alpha\nbeta\ngamma\n\ndelta');
  assert.deepEqual(sorted(activeParagraphLines(doc, [{ from: 2, to: 2 }])), [1, 2, 3]);
});

test('blank lines separate paragraphs', () => {
  const doc = textLineSource('alpha\nbeta\n\ngamma\ndelta');
  assert.deepEqual(sorted(activeParagraphLines(doc, [{ from: 1, to: 1 }])), [1, 2]);
  assert.deepEqual(sorted(activeParagraphLines(doc, [{ from: 4, to: 4 }])), [4, 5]);
});

test('a caret parked on a blank line lights both neighbours', () => {
  // Long-standing CodeMirror behaviour: each side is walked until it hits a
  // blank line, and the caret's own (blank) line is active too.
  const doc = textLineSource('alpha\nbeta\n\ngamma\ndelta');
  assert.deepEqual(sorted(activeParagraphLines(doc, [{ from: 3, to: 3 }])), [1, 2, 3, 4, 5]);
});

test('whitespace-only lines count as blank separators', () => {
  const doc = textLineSource('alpha\n   \nbeta');
  assert.deepEqual(sorted(activeParagraphLines(doc, [{ from: 1, to: 1 }])), [1]);
  assert.deepEqual(sorted(activeParagraphLines(doc, [{ from: 3, to: 3 }])), [3]);
});

test('a selection spanning several lines makes that whole span active', () => {
  const doc = textLineSource('a\nb\nc\nd\ne\n\nf');
  // Select lines 2..3. Both walks then run from the *ends* of the span until
  // they hit a blank line, so 1 joins from above and 4 + 5 from below — line 6
  // is the separator that stops it.
  assert.deepEqual(sorted(activeParagraphLines(doc, [{ from: 2, to: 3 }])), [1, 2, 3, 4, 5]);
});

test('several selections can produce a non-contiguous set', () => {
  const doc = textLineSource('a\n\nb\n\nc');
  assert.deepEqual(
    sorted(activeParagraphLines(doc, [{ from: 1, to: 1 }, { from: 5, to: 5 }])),
    [1, 5],
  );
});

test('a first or last line with no separator still works', () => {
  assert.deepEqual(sorted(activeParagraphLines(textLineSource('only'), [{ from: 1, to: 1 }])), [1]);
  assert.deepEqual(sorted(activeParagraphLines(textLineSource(''), [{ from: 1, to: 1 }])), [1]);
});

test('a caret on a trailing empty line (text ends with a newline) is its own line', () => {
  // 'a\n' → lines ['a', ''] — line 2 is blank, so line 1 joins it.
  const doc = textLineSource('a\n');
  assert.deepEqual(doc.count, 2);
  assert.deepEqual(sorted(activeParagraphLines(doc, [{ from: 2, to: 2 }])), [1, 2]);
});

test('out-of-range selection lines are clamped, not dropped', () => {
  const doc = textLineSource('a\n\nb');
  assert.deepEqual(sorted(activeParagraphLines(doc, [{ from: 99, to: 99 }])), [3]);
});

test('paragraphRange is the min/max of the active set', () => {
  const doc = textLineSource('alpha\nbeta\ngamma\n\ndelta');
  assert.deepEqual(paragraphRange(doc, 2), { from: 1, to: 3 });
  // Line 4 is the blank separator, so the caret there lights both paragraphs.
  assert.deepEqual(paragraphRange(doc, 4), { from: 1, to: 5 });
  assert.deepEqual(paragraphRange(doc, 5), { from: 5, to: 5 });
});

test('lineStartsOf + lineOfOffset map offsets onto lines', () => {
  const text = 'ab\ncd\n\ne';
  const starts = lineStartsOf(text);
  assert.deepEqual(starts, [0, 3, 6, 7]);
  assert.equal(lineOfOffset(starts, 0), 1);
  assert.equal(lineOfOffset(starts, 2), 1); // still on 'ab'
  assert.equal(lineOfOffset(starts, 3), 2); // the '\n' belongs to line 1, offset 3 starts line 2
  assert.equal(lineOfOffset(starts, 6), 3);
  assert.equal(lineOfOffset(starts, 7), 4);
  assert.equal(lineOfOffset(starts, 999), 4); // clamped to the last line
});

test('lineOfOffset handles an empty document', () => {
  const starts = lineStartsOf('');
  assert.deepEqual(starts, [0]);
  assert.equal(lineOfOffset(starts, 0), 1);
});
