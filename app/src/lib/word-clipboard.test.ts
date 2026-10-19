import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWordClipboardHtml } from './word-clipboard.ts';

test('strips .katex-html visual layer and promotes clean MathML for Word equations (#427)', () => {
  const rawHtml = `
    <p>行内公式 <span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><msup><mi>x</mi><mn>2</mn></msup></mrow></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base"><span class="mord">x</span><span class="msupsub">2</span></span></span></span> 测试</p>
    <div class="math-block"><span class="katex-display"><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow></math></span><span class="katex-html" aria-hidden="true">E=mc2</span></span></span></div>
  `;

  const out = buildWordClipboardHtml(rawHtml);
  assert.ok(!out.includes('katex-html'), '.katex-html should be stripped');
  assert.ok(out.includes('<math xmlns="http://www.w3.org/1998/Math/MathML"'));
  assert.ok(out.includes('<msup><mi>x</mi><mn>2</mn></msup>'));
  assert.ok(out.includes('display="block"'));
});

test('strips code block toolbar headers and joins .cb-line spans with <br> (#427)', () => {
  const rawHtml = `
    <div class="code-block" data-lang="ts">
      <div class="code-block__header">
        <span class="code-block__lang">ts</span>
        <button class="code-block__copy">Copy</button>
      </div>
      <pre><code class="hljs"><span class="cb-line" data-line="1">const a = 1;</span>\n<span class="cb-line" data-line="2">const b = 2;</span></code></pre>
    </div>
  `;

  const out = buildWordClipboardHtml(rawHtml);
  assert.ok(!out.includes('code-block__header'), 'header bar should be stripped');
  assert.ok(!out.includes('code-block__copy'), 'copy button should be stripped');
  assert.ok(out.includes('const a = 1;<br>const b = 2;'), 'lines should be joined with <br>');
});

test('adds start="1" to every <ol> and styles tables and task checkboxes for Word (#427)', () => {
  const rawHtml = `
    <ol><li>第一项</li><li>第二项</li></ol>
    <p>中间段落</p>
    <ol><li>新列表第一项</li></ol>
    <ul><li class="task-list-item"><input type="checkbox" checked>已完成</li><li class="task-list-item"><input type="checkbox">未完成</li></ul>
    <table><thead><tr><th>列A</th></tr></thead><tbody><tr><td>值1</td></tr></tbody></table>
  `;

  const out = buildWordClipboardHtml(rawHtml);
  const startAttrCount = (out.match(/<ol[^>]*start="1"/g) || []).length;
  assert.equal(startAttrCount, 2);
  assert.ok(out.includes('☑ '));
  assert.ok(out.includes('☐ '));
  assert.ok(!out.includes('<input'));
  assert.ok(out.includes('border-collapse: collapse'));
  assert.ok(out.includes('xmlns:w="urn:schemas-microsoft-com:office:word"'));
});
