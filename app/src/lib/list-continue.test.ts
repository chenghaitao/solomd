import assert from 'node:assert/strict';
import { test } from 'node:test';

// Explicit .ts: `node --test` loads this module graph directly and Node's ESM
// resolver will not guess an extension (tsconfig has allowImportingTsExtensions).
import { applyListContinue, bumpNumberedToken, nextListMarker } from './list-continue.ts';

const ON = { listContinuation: true, autoNumber: true };
const NO_AUTO = { listContinuation: true, autoNumber: false };
const OFF = { listContinuation: false, autoNumber: true };

// ---- bumpNumberedToken --------------------------------------------------

test('bumpNumberedToken keeps the separator style', () => {
  assert.equal(bumpNumberedToken('1.'), '2.');
  assert.equal(bumpNumberedToken('9)'), '10)');
});

test('bumpNumberedToken counts the last level, not the first', () => {
  // The user-visible contract: `1.1` ⏎ → `1.2`, `1.9` → `1.10` (not `2.`).
  assert.equal(bumpNumberedToken('1.1'), '1.2');
  assert.equal(bumpNumberedToken('1.9'), '1.10');
  assert.equal(bumpNumberedToken('1.1.2'), '1.1.3');
  assert.equal(bumpNumberedToken('1.1.'), '1.2.');
});

test('bumpNumberedToken rejects non-numbers', () => {
  assert.equal(bumpNumberedToken('abc'), null);
  assert.equal(bumpNumberedToken(''), null);
});

// ---- nextListMarker -----------------------------------------------------

test('bullets continue, and keep the indent', () => {
  assert.deepEqual(nextListMarker('- foo', ON), { marker: '- ' });
  assert.deepEqual(nextListMarker('* foo', ON), { marker: '* ' });
  assert.deepEqual(nextListMarker('  + foo', ON), { marker: '  + ' });
});

test('a task checkbox is carried to the next line, unchecked', () => {
  assert.deepEqual(nextListMarker('- [x] done', ON), { marker: '- [ ] ' });
  assert.equal(nextListMarker('- [ ] done', ON)?.marker, '- [ ] ');
});

test('an empty item ends the list instead of continuing it', () => {
  assert.equal(nextListMarker('- ', ON), 'end');
  assert.equal(nextListMarker('1. ', ON), 'end');
  assert.equal(nextListMarker('> ', ON), 'end');
});

test('ordered lines are numbered, including multi-level ones', () => {
  assert.deepEqual(nextListMarker('1. foo', ON), { marker: '2. ' });
  assert.deepEqual(nextListMarker('7) foo', ON), { marker: '8) ' });
  assert.deepEqual(nextListMarker('1.1 foo', ON), { marker: '1.2 ' });
  assert.deepEqual(nextListMarker('   1.1.9 foo', ON), { marker: '   1.1.10 ' });
});

test('autoNumber off stops ordered lists but not bullets or quotes', () => {
  assert.equal(nextListMarker('1. foo', NO_AUTO), null);
  assert.equal(nextListMarker('1.1 foo', NO_AUTO), null);
  assert.deepEqual(nextListMarker('- foo', NO_AUTO), { marker: '- ' });
  assert.deepEqual(nextListMarker('> foo', NO_AUTO), { marker: '> ' });
});

test('listContinuation off disables everything', () => {
  assert.equal(nextListMarker('- foo', OFF), null);
  assert.equal(nextListMarker('1. foo', OFF), null);
  assert.equal(nextListMarker('> foo', OFF), null);
});

test('quotes continue', () => {
  assert.deepEqual(nextListMarker('> quoted', ON), { marker: '> ' });
  assert.deepEqual(nextListMarker('  > quoted', ON), { marker: '  > ' });
});

test('prose is left alone', () => {
  assert.equal(nextListMarker('plain paragraph', ON), null);
  assert.equal(nextListMarker('', ON), null);
  // A marker needs whitespace after it — these are not lists.
  assert.equal(nextListMarker('-3 degrees', ON), null);
  assert.equal(nextListMarker('*emphasis*', ON), null);
  assert.equal(nextListMarker('# heading', ON), null);
});

test('a line opening with a decimal reads as a list — the documented cost', () => {
  // Continuing `1.1` → `1.2` means any line starting with `<digits>.<digits> `
  // is a candidate, so `1.5 is not a list` continues as `1.6 `. Same heuristic
  // trade-off as `markdownAutoNumberHeadings`; turning 自动编号 off is the way
  // out. Asserted so a change here has to be deliberate.
  assert.deepEqual(nextListMarker('1.5 is not a list', ON), { marker: '1.6 ' });
  // ...but a bare decimal without the trailing space is prose.
  assert.equal(nextListMarker('1.5', ON), null);
});

test('directives that merely look like quotes are not continued', () => {
  // `>` at the start is a quote in markdown — this is the documented cost of
  // the rule, asserted so a change to it is a deliberate one.
  assert.deepEqual(nextListMarker('> [!note] callout', ON), { marker: '> ' });
});

// ---- applyListContinue --------------------------------------------------

test('applyListContinue edits the whole textarea value', () => {
  const text = 'intro\n- foo';
  const edit = applyListContinue(text, text.length, ON);
  assert.deepEqual(edit, { value: 'intro\n- foo\n- ', caret: 'intro\n- foo\n- '.length });
});

test('Enter in the middle of an item splits it and continues the list', () => {
  const text = '- abc';
  const edit = applyListContinue(text, 3, ON); // after "- a"
  assert.deepEqual(edit, { value: '- a\n- bc', caret: 6 });
});

test('an empty item is cleared rather than continued', () => {
  const text = 'intro\n- ';
  assert.deepEqual(applyListContinue(text, text.length, ON), { value: 'intro\n', caret: 6 });
});

test('applyListContinue declines prose', () => {
  assert.equal(applyListContinue('just text', 9, ON), null);
  assert.equal(applyListContinue('- foo', 5, OFF), null);
  assert.equal(applyListContinue('1. foo', 6, NO_AUTO), null);
});

test('multi-level numbering continues in place', () => {
  const text = '1.1 输入法\n';
  const edit = applyListContinue(text, 7, ON); // end of "1.1 输入法"
  assert.deepEqual(edit, { value: '1.1 输入法\n1.2 \n', caret: 12 });
});
