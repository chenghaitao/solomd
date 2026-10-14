import test from 'node:test';
import assert from 'node:assert/strict';
import { repairMarkdown } from './md-repair.ts';

test('leaves a healthy document byte-identical', () => {
  const src = [
    '# Title',
    '',
    'Some **bold** text with a [link](https://example.com) and `code`.',
    '',
    '| a | b |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    '```ts',
    'const x = 1;',
    '```',
    '',
  ].join('\n');
  const r = repairMarkdown(src);
  assert.equal(r.text, src);
  assert.deepEqual(r.fixed, []);
  assert.deepEqual(r.unparsed, []);
});

test('an empty document is not an open fence', () => {
  const r = repairMarkdown('');
  assert.equal(r.text, '');
  assert.deepEqual(r.fixed, []);
});

test('closes a fence left open at EOF', () => {
  const src = '# T\n\n```ts\nconst x = 1;\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, '# T\n\n```ts\nconst x = 1;\n```\n');
  assert.deepEqual(r.fixed, [{ line: 3, kind: 'fence' }]);
  assert.deepEqual(r.unparsed, []);
});

test('closes a tilde fence with tildes, not backticks', () => {
  const r = repairMarkdown('~~~\ncode\n');
  assert.equal(r.text, '~~~\ncode\n~~~\n');
  assert.deepEqual(r.fixed, [{ line: 1, kind: 'fence' }]);
});

test('does not close a fence that a matching marker already closed', () => {
  const src = '```\na\n```\n\n~~~\nb\n~~~\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, src);
  assert.deepEqual(r.fixed, []);
});

test('an info string on a same-length run does not close the fence', () => {
  // ```js inside an open ``` block is content, so the block is still open.
  const r = repairMarkdown('```\n```js\n');
  assert.equal(r.text, '```\n```js\n```\n');
  assert.deepEqual(r.fixed, [{ line: 1, kind: 'fence' }]);
});

test('a shorter closing run does not close a longer fence', () => {
  const r = repairMarkdown('````\ncode\n```\n');
  assert.equal(r.text, '````\ncode\n```\n````\n');
  assert.deepEqual(r.fixed, [{ line: 1, kind: 'fence' }]);
});

test('restores a closing fence that was typed with two backticks', () => {
  // The report that started this: a mermaid block closed with `` instead of
  // ``` never closes, so the diagram swallows the `## LaTeX 数学公式` heading
  // under it and the renderer reports a parse error. Two backticks are never a
  // fence, so the line is the closer the author meant.
  const src = [
    '完整测试样例',
    '',
    '```mermaid',
    '',
    'flowchart LR',
    '',
    '  A([用户上传文件]) --> B{格式检测}',
    '',
    '  C --> E([导出 / 发布])',
    '',
    '   ``',
    '',
    '',
    '## LaTeX 数学公式',
    '',
  ].join('\n');
  const r = repairMarkdown(src);
  assert.deepEqual(r.fixed, [{ line: 11, kind: 'fence' }]);
  assert.deepEqual(r.unparsed, []);
  // Written at the opener's indent, so it closes whatever the typo's indent.
  assert.ok(r.text.includes('\n```\n'), JSON.stringify(r.text));
  assert.ok(!r.text.includes('   ``'), JSON.stringify(r.text));
  // And the heading is back outside the block, where it renders as a heading.
  assert.ok(r.text.endsWith('\n```\n\n\n## LaTeX 数学公式\n'), JSON.stringify(r.text));
});

test('a one-character closer is restored too, and tildes keep tildes', () => {
  assert.equal(repairMarkdown('```\ncode\n`\n').text, '```\ncode\n```\n');
  assert.equal(repairMarkdown('~~~\ncode\n~~\n').text, '~~~\ncode\n~~~\n');
});

test('a shortened fence of the *other* character is content, not a closer', () => {
  // Inside a backtick block a `~~` line is not a closing fence — CommonMark
  // would keep the block open, and so does the repair.
  const src = '```\nstrike ~~ here\n~~\n```\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, src);
  assert.deepEqual(r.fixed, []);
});

test('a lone short fence outside any block is prose and is left alone', () => {
  const src = 'a `` b\n\n~~\n\ntext\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, src);
  assert.deepEqual(r.fixed, []);
});

test('the accepted trade-off: a bare `` line inside a code sample is rewritten', () => {
  // Documented rather than fixed: telling a deliberate `` line in a Markdown
  // tutorial from a mistyped closer needs the intent, and a block that never
  // closes damages the whole file while this line damages one sample.
  const r = repairMarkdown('```md\nEscape it as ``.\n``\n');
  assert.equal(r.text, '```md\nEscape it as ``.\n```\n');
  assert.deepEqual(r.fixed, [{ line: 3, kind: 'fence' }]);
});

test('pads a table row that lost a cell', () => {
  const src = '| a | b | c |\n| --- | --- | --- |\n| 1 | 2 |\n| 4 | 5 | 6 |\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, '| a | b | c |\n| --- | --- | --- |\n| 1 | 2 |  |\n| 4 | 5 | 6 |\n');
  assert.deepEqual(r.fixed, [{ line: 1, kind: 'table' }]);
});

test('a row with extra cells widens the header instead of being truncated', () => {
  const src = '| a | b |\n| --- | --- |\n| 1 | 2 | 3 |\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, '| a | b |  |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n');
  assert.deepEqual(r.fixed, [{ line: 1, kind: 'table' }]);
});

test('rebuilds a delimiter row that is short, keeping alignment colons', () => {
  const src = '| a | b | c |\n| :--- | ---: |\n| 1 | 2 | 3 |\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, '| a | b | c |\n| :--- | ---: | --- |\n| 1 | 2 | 3 |\n');
  assert.deepEqual(r.fixed, [{ line: 1, kind: 'table' }]);
});

test('a valid delimiter row is left alone, `--` and colons included', () => {
  const src = '| a | b |\n| :-- | --: |\n| 1 | 2 |\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, src);
  assert.deepEqual(r.fixed, []);
});

test('a short row is padded but a square table is left byte-identical', () => {
  const src = '| a | b |\n| --- | --- |\n| 1 | 2 |\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, src);
  assert.deepEqual(r.fixed, []);
});

test('a thematic break is not a table delimiter', () => {
  const src = 'Title\n---\n\nSome | prose\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, src);
  assert.deepEqual(r.fixed, []);
});

test('a table inside a fenced block is left alone', () => {
  const src = '```\n| a | b |\n| --- | --- |\n| 1 |\n```\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, src);
  assert.deepEqual(r.fixed, []);
});

test('closes a link destination left without its paren', () => {
  const r = repairMarkdown('See [the docs](https://example.com/x\n');
  assert.equal(r.text, 'See [the docs](https://example.com/x)\n');
  assert.deepEqual(r.fixed, [{ line: 1, kind: 'link' }]);
});

test('wraps a destination that contains spaces', () => {
  const r = repairMarkdown('[a](/my docs/file.md)\n');
  assert.equal(r.text, '[a](</my docs/file.md>)\n');
  assert.deepEqual(r.fixed, [{ line: 1, kind: 'link' }]);
});

test('leaves a titled destination alone', () => {
  const src = '[a](https://example.com "the title")\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, src);
  assert.deepEqual(r.fixed, []);
});

test('closes an unpaired inline-code backtick', () => {
  const r = repairMarkdown('run `npm test to check\n');
  assert.equal(r.text, 'run `npm test to check`\n');
  assert.deepEqual(r.fixed, [{ line: 1, kind: 'code' }]);
});

test('an escaped backtick is not a code span', () => {
  const src = 'a \\` b\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, src);
  assert.deepEqual(r.fixed, []);
});

test('reports an unclosed bracket instead of guessing', () => {
  const r = repairMarkdown('see [the note](https://x.dev and also [another\n');
  assert.deepEqual(r.unparsed, [{ line: 1, kind: 'bracket' }]);
});

test('a lone bracket in prose is not reported', () => {
  const src = 'arr[0 and arr[1] are different\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, src);
  assert.deepEqual(r.unparsed, []);
});

test('reports an odd number of bold markers instead of guessing', () => {
  const r = repairMarkdown('this is **not closed\n');
  assert.deepEqual(r.unparsed, [{ line: 1, kind: 'emphasis' }]);
});

test('preserves CRLF and closes the fence with CRLF', () => {
  const src = '# T\r\n\r\n```\r\ncode\r\n';
  const r = repairMarkdown(src);
  assert.equal(r.text, '# T\r\n\r\n```\r\ncode\r\n```\r\n');
});

test('a document with no trailing newline keeps its shape', () => {
  const src = 'text';
  const r = repairMarkdown(src);
  assert.equal(r.text, src);
});

test('finds several problems in one pass', () => {
  const src = '| a | b |\n| --- | --- |\n| 1 |\n\n[a](b\n\n```\ncode\n';
  const r = repairMarkdown(src);
  assert.deepEqual(r.fixed, [
    { line: 1, kind: 'table' },
    { line: 5, kind: 'link' },
    { line: 7, kind: 'fence' },
  ]);
});

test('idempotent: repairing a repaired document changes nothing', () => {
  const messy = '| a | b |\n| --- | --- |\n| 1 |\n\n[x](y\n\n```\nz\n';
  const once = repairMarkdown(messy);
  const twice = repairMarkdown(once.text);
  assert.equal(twice.text, once.text);
  assert.deepEqual(twice.fixed, []);
  assert.deepEqual(twice.unparsed, []);
});
