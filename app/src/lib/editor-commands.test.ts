import assert from 'node:assert/strict';
import { test } from 'node:test';

import { autoNumberHeadings, deleteWord, selectCodeBlockBody, selectLine, selectWord, shiftHeading, type Range, type TextEdit } from './editor-commands.ts';

/** `|` marks the selection ends (one `|` = a bare caret). */
function parse(marked: string): { doc: string; from: number; to: number } {
  const first = marked.indexOf('|');
  const rest = marked.slice(first + 1);
  const second = rest.indexOf('|');
  const doc = second < 0 ? marked.replace('|', '') : marked.slice(0, first) + rest.replace('|', '');
  return { doc, from: first, to: second < 0 ? first : first + second };
}
function show(doc: string, from: number, to: number): string {
  return from === to
    ? doc.slice(0, from) + '|' + doc.slice(from)
    : doc.slice(0, from) + '|' + doc.slice(from, to) + '|' + doc.slice(to);
}
function sel(marked: string, fn: (d: string, f: number, t: number) => Range | null): string | null {
  const { doc, from, to } = parse(marked);
  const r = fn(doc, from, to);
  return r ? show(doc, r.from, r.to) : null;
}
function edit(marked: string, fn: (d: string, f: number, t: number) => TextEdit | null): string | null {
  const { doc, from, to } = parse(marked);
  const e = fn(doc, from, to);
  if (!e) return null;
  const out = doc.slice(0, e.from) + e.insert + doc.slice(e.to);
  return show(out, e.selFrom, e.selTo);
}

/** Apply a TextEdit to `doc`. #489 made `autoNumberHeadings` return the
 *  minimal changed range instead of the whole document, so tests assert the
 *  resulting document rather than `edit.insert`. */
function apply(doc: string, e: TextEdit): string {
  return doc.slice(0, e.from) + e.insert + doc.slice(e.to);
}

test('select word: inside, at either edge, and nothing between spaces', () => {
  assert.equal(sel('one tw|o three', selectWord), 'one |two| three');
  assert.equal(sel('one |two three', selectWord), 'one |two| three');
  assert.equal(sel('one two| three', selectWord), 'one |two| three');
  assert.equal(sel('one  |  two', selectWord), null);
});

test('select word: a selection grows to the words it touches', () => {
  assert.equal(sel('one t|wo th|ree', selectWord), 'one |two three| four'.replace(' four', ''));
});

test('select word: CJK picks a word, not the whole clause', () => {
  const r = sel('我们使用中文|输入法写作', selectWord);
  assert.ok(r, 'a CJK word is found');
  const picked = r!.split('|')[1];
  assert.ok(picked.length >= 1 && picked.length < 9, `picked "${picked}"`);
});

test('select word never crosses a line break', () => {
  assert.equal(sel('alpha\n|beta', selectWord), 'alpha\n|beta|');
  assert.equal(sel('alpha|\nbeta', selectWord), '|alpha|\nbeta');
});

test('delete word takes one neighbouring space with it', () => {
  assert.equal(edit('a wo|rd here', deleteWord), 'a |here');
  assert.equal(edit('wo|rd here', deleteWord), '|here');
  assert.equal(edit('a wo|rd.', deleteWord), 'a|.');
  assert.equal(edit('a wo|rd', deleteWord), 'a|');
  assert.equal(edit('a  |  b', deleteWord), null);
});

test('select line: the line without its break, then line by line', () => {
  assert.equal(sel('one\ntw|o\nthree', selectLine), 'one\n|two|\nthree');
  assert.equal(sel('one\n|two|\nthree', selectLine), 'one\n|two\nthree|');
  // At the last line it stays put.
  assert.equal(sel('one\n|two|', selectLine), 'one\n|two|');
  // A partial selection spanning lines covers those lines whole.
  assert.equal(sel('o|ne\ntw|o\nthree', selectLine), '|one\ntwo|\nthree');
});

test('heading promote / demote walk the levels and are inverses', () => {
  const up = (m: string) => edit(m, (d, f, t) => shiftHeading(d, f, t, 'promote'));
  const down = (m: string) => edit(m, (d, f, t) => shiftHeading(d, f, t, 'demote'));
  assert.equal(up('### Ti|tle'), '## Ti|tle');
  assert.equal(up('# Ti|tle'), null);
  assert.equal(up('Plain te|xt'), '###### Plain te|xt');
  assert.equal(down('## Ti|tle'), '### Ti|tle');
  assert.equal(down('###### Ti|tle'), 'Ti|tle');
  assert.equal(down('Plain te|xt'), null);
});

test('convert to paragraph drops the marker; caret inside the marker lands at the text', () => {
  const para = (m: string) => edit(m, (d, f, t) => shiftHeading(d, f, t, 'paragraph'));
  assert.equal(para('## Ti|tle'), 'Ti|tle');
  assert.equal(para('#|# Title'), '|Title');
  assert.equal(para('Already plain|'), null);
});

test('heading commands leave lists, quotes, fences and blank lines alone', () => {
  const up = (m: string) => edit(m, (d, f, t) => shiftHeading(d, f, t, 'promote'));
  assert.equal(up('- ite|m'), null);
  assert.equal(up('> quo|te'), null);
  assert.equal(up('```\n# not a he|ading\n```'), null);
  // A selection over several lines shifts each heading line.
  assert.equal(up('|## A\n\ntext\n### B|'), '|# A\n\n###### text\n## B|');
});

test('autoNumberHeadings numbers hierarchically, skips fences, and toggles off when already numbered (#474)', () => {
  const doc = '# Intro\n## Part A\n### Detail\n## Part B\n```\n# Not a heading\n```\n# Outro';
  const numbered = '# 1. Intro\n## 1.1 Part A\n### 1.1.1 Detail\n## 1.2 Part B\n```\n# Not a heading\n```\n# 2. Outro';
  const e1 = autoNumberHeadings(doc, 0, 0);
  assert.ok(e1);
  assert.equal(apply(doc, e1!), numbered);
  // #489: only the changed span is rewritten, never the whole document.
  assert.ok(e1!.to - e1!.from < doc.length, 'a full-document replacement would re-measure every block');
  // Running again when already accurately numbered removes the numbers cleanly.
  const e2 = autoNumberHeadings(numbered, 0, 0);
  assert.ok(e2);
  assert.equal(apply(numbered, e2!), doc);
});

test('autoNumberHeadings add-mode refreshes numbers when headings are added or cleared (#484)', () => {
  // Adding a new heading between 1.1 and 1.2 renumbers 1.2 -> 1.3
  const added = '# 1. Intro\n## 1.1 Part A\n## Inserted\n## 1.2 Part B';
  const eAdd = autoNumberHeadings(added, 0, 0, 'add');
  assert.ok(eAdd);
  assert.equal(
    apply(added, eAdd!),
    '# 1. Intro\n## 1.1 Part A\n## 1.2 Inserted\n## 1.3 Part B',
  );
  // Deleting a heading's text leaving "## 1.1 " strips the orphan number and renumbers following headings
  const cleared = '# 1. Intro\n## 1.1 \n## 1.2 Part B';
  const eClear = autoNumberHeadings(cleared, 0, 0, 'add');
  assert.ok(eClear);
  assert.equal(apply(cleared, eClear!), '# 1. Intro\n## \n## 1.1 Part B');
});

test('autoNumberHeadings returns a localised edit for a heading typed at the end (#489)', () => {
  // The reported scenario: a long note, the caret is in a fresh 5th-level
  // heading near the bottom, and typing the first character makes the
  // auto-numbering pass add its prefix to that one line. Under `## 1.2 Part B`
  // the counter is 1.2, so the fifth level reads 1.2.1.1.1.
  const doc = '# 1. Intro\n## 1.1 Part A\n### 1.1.1 Detail\n## 1.2 Part B\n##### 标题';
  const e = autoNumberHeadings(doc, doc.length, doc.length, 'add');
  assert.ok(e);
  assert.equal(
    apply(doc, e!),
    '# 1. Intro\n## 1.1 Part A\n### 1.1.1 Detail\n## 1.2 Part B\n##### 1.2.1.1.1 标题',
  );
  // The edit is confined to the last line: the editor can re-measure just
  // that line instead of the whole document (which is what made the viewport
  // jump while typing).
  const lastLineStart = doc.lastIndexOf('\n') + 1;
  assert.ok(e!.from >= lastLineStart, `edit starts at ${e!.from}, before the last line (${lastLineStart})`);
  // Pure insertion of the prefix: nothing after it is rewritten.
  assert.equal(e!.to, e!.from);
  assert.equal(e!.insert, '1.2.1.1.1 ');
  assert.equal(e!.selFrom, apply(doc, e!).length);
});

test('selectCodeBlockBody selects the code block body first and returns null when already selected', () => {
  const doc = '# Title\n```js\nconst a = 1;\nconst b = 2;\n```\nFooter';
  assert.equal(
    sel('# Title\n```js\nconst |a = 1;\nconst b = 2;\n```\nFooter', selectCodeBlockBody),
    '# Title\n```js\n|const a = 1;\nconst b = 2;|\n```\nFooter',
  );
  // Once the full body is selected, a second Ctrl+A returns null so the editor selects the whole document.
  assert.equal(
    sel('# Title\n```js\n|const a = 1;\nconst b = 2;|\n```\nFooter', selectCodeBlockBody),
    null,
  );
  // Indented fenced code block inside a list item:
  assert.equal(
    sel('1. 列表一\n   ```ts\n   let |x = 1;\n   ```\n2. 列表二', selectCodeBlockBody),
    '1. 列表一\n   ```ts\n|   let x = 1;|\n   ```\n2. 列表二',
  );
  // Outside a code block returns null:
  assert.equal(sel('# Title|\n```js\na\n```', selectCodeBlockBody), null);
  void doc;
});
