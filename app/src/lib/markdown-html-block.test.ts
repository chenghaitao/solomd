/**
 * Regression tests for #T09-4 — raw HTML blocks that leave a container tag
 * open (`<details>` separated from `</details>` by blank lines).
 *
 * `unwrapInlineHtmlBlocks()` splits them into separate HTML blocks. Wrapping
 * the opening block in a `<div data-source-line>` (the #203 split-pane anchor)
 * made the browser implicitly close `<details>` at that `</div>`, so the table
 * between the two blocks fell OUT of the fold. The inserted blank lines also
 * shifted every scroll-sync anchor by +2.
 *
 * No vitest/tsx in this repo: node:test + node:assert, run via `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { preprocessMarkdown, renderMarkdown } from './markdown.ts';

const FOLDED_TABLE = `<details>
<summary>展开查看表格</summary>

| 折叠 | 内容 |
| --- | --- |
| A | 1 |

</details>`;

test('#T09-4 <details> 内的表格落在折叠容器内', () => {
  const html = renderMarkdown(FOLDED_TABLE);
  const open = html.indexOf('<details');
  const table = html.indexOf('<table');
  const close = html.indexOf('</details>');
  assert.ok(open >= 0 && table > open && close > table, '表格必须位于 <details> 与 </details> 之间');
  assert.doesNotMatch(html, /<div[^>]*>\s*<details/, '不得用 <div> 包裹未闭合的 <details>');
  assert.match(html, /<details data-source-line="1">/);
  assert.match(html, /<table data-source-line="4">/);
});

test('#T09-4 预处理插入的空行不使 data-source-line 偏移', () => {
  assert.notEqual(preprocessMarkdown(FOLDED_TABLE).replace(/\n$/, ''), FOLDED_TABLE);
  const html = renderMarkdown(FOLDED_TABLE);
  const lines = [...html.matchAll(/data-source-line="(\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(lines, ['1', '4']);
});

test('#203 完整闭合的 HTML 容器仍保留 <div> 同步锚点', () => {
  const html = renderMarkdown('<div class="card">\n<img src="x.png">\n</div>');
  assert.match(html, /<div data-source-line="1">/);
});

test('#T09-4 容器内使用原生 HTML 表格时折叠同样生效', () => {
  const src =
    '<details>\n<summary>展开查看表格</summary>\n' +
    '<table><tr><th>折叠</th></tr></table>\n</details>';
  const html = renderMarkdown(src);
  assert.equal((html.match(/<details/g) || []).length, 1);
  assert.ok(html.indexOf('<table') > html.indexOf('<details'));
  assert.ok(html.indexOf('</details>') > html.indexOf('<table'));
});

test('未插入空行的普通文档行号保持原样', () => {
  const html = renderMarkdown('# 标题\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
  assert.match(html, /<table data-source-line="3">/);
});

test('#500 T08-9: terminates a GFM pipe table when followed immediately by a non-pipe prose line', () => {
  const md = [
    '| Col1 | Col2 |',
    '| --- | --- |',
    '| a | b |',
    '普通段落文字（没有空行也没有竖线）',
  ].join('\n');

  const html = renderMarkdown(md);
  assert.ok(html.includes('</tbody>\n</table>'));
  assert.match(html, /<p[^>]*>普通段落文字（没有空行也没有竖线）<\/p>/);
});

test('#546: preserves leading full-width ideographic spaces (U+3000) in paragraphs, blockquotes, and lists', () => {
  const md = [
    '　　　　李玲：世界上已经没有人会爱我了。',
    '李玲愤然冲出屋子。',
    '',
    '　　第二段首行缩进两格。',
    '',
    '> 　　引用中的全角缩进',
    '',
    '- 　　列表项中的全角缩进',
  ].join('\n');

  const html = renderMarkdown(md);
  assert.match(html, /<p[^>]*>　　　　李玲：世界上已经没有人会爱我了。<br>\n李玲愤然冲出屋子。<\/p>/);
  assert.match(html, /<p[^>]*>　　第二段首行缩进两格。<\/p>/);
  assert.match(html, /<blockquote[^>]*>\s*<p[^>]*>　　引用中的全角缩进<\/p>\s*<\/blockquote>/);
  assert.match(html, /<li[^>]*>　　列表项中的全角缩进<\/li>/);
});

