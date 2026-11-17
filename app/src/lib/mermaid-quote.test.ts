import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  quoteUnquotedMermaidLabels,
  formatMermaidError,
  mermaidBoldToHtml,
  normalizeMermaidSource,
  safeRender,
  type MermaidRenderer,
} from './mermaid-lazy';

test('quoteUnquotedMermaidLabels quotes unquoted square-bracket node labels containing @ or () (#276)', () => {
  const src = `flowchart TD\n  A[user @ host] --> B[step (1)]`;
  assert.equal(
    quoteUnquotedMermaidLabels(src),
    `flowchart TD\n  A["user @ host"] --> B["step (1)"]`,
  );
});

test('quoteUnquotedMermaidLabels leaves already-quoted labels, cylinder/subroutine shapes, and @{ shape } untouched (#276)', () => {
  const src = [
    'flowchart TD',
    '  A["already @ quoted"] --> B[(Database)]',
    '  B --> C[[Subroutine]]',
    '  D@{ shape: rect }',
  ].join('\n');
  assert.equal(quoteUnquotedMermaidLabels(src), src);
});

test('safeRender retries with quoted labels when Mermaid v11 rejects unquoted @ in [label] (#276)', async () => {
  const calls: string[] = [];
  const fakeMermaid: MermaidRenderer = {
    render: async (_id: string, code: string) => {
      calls.push(code);
      if (code.includes('[foo @ bar]')) {
        throw new Error("Parse error on line 2: Expecting 'SQE', got 'SHAPE_DATA'");
      }
      return { svg: '<svg>ok</svg>', bindFunctions: undefined } as never;
    },
  };
  const fakeDoc = {
    body: {
      clientWidth: 800,
      appendChild: () => {},
    },
    createElement: () => ({
      setAttribute: () => {},
      remove: () => {},
      innerHTML: '',
    }),
    getElementById: () => null,
  } as unknown as Document;

  const res = await safeRender(fakeMermaid, 'mmd-1', 'flowchart TD\n  A[foo @ bar] --> B[ok]', fakeDoc);
  assert.equal(res.svg, '<svg>ok</svg>');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes('A["foo @ bar"]'));
});

test('formatMermaidError appends a helpful quoting hint when a diagram with @ or () in [...] still fails (#276)', () => {
  const msg = formatMermaidError(
    new Error('Parse error on line 2'),
    'flowchart TD\n  A[foo @ bar] -->',
  );
  assert.ok(msg.includes('Hint: Wrap node labels containing "@" or "()" in quotes'));
});

test('mermaidBoldToHtml turns **…** in node and subgraph labels into <b> (#600)', () => {
  const src = [
    'graph LR',
    '  A[**程序员转型方向**] --> B[**技术路线：成为专家**]',
    '  B1[**AI/ML工程师**<br>学Python]',
    '  subgraph C[**业务路线**]',
    '    C1[**AI产品经理**]',
    '  end',
  ].join('\n');
  assert.equal(
    mermaidBoldToHtml(src),
    [
      'graph LR',
      '  A[<b>程序员转型方向</b>] --> B[<b>技术路线：成为专家</b>]',
      '  B1[<b>AI/ML工程师</b><br>学Python]',
      '  subgraph C[<b>业务路线</b>]',
      '    C1[<b>AI产品经理</b>]',
      '  end',
    ].join('\n'),
  );
});

test('mermaidBoldToHtml leaves single asterisks, empty pairs, multi-line spans and existing <b> alone (#600)', () => {
  const cases = [
    'A[*italic*] --> B[plain]',
    'A[**] --> B[x]',
    'A[**spans\nlines**]',
    'A[<b>already</b>]',
  ];
  for (const src of cases) assert.equal(mermaidBoldToHtml(src), src, src);
  // A second pass over an already-converted label must be a no-op.
  const once = mermaidBoldToHtml('A[**x**]');
  assert.equal(mermaidBoldToHtml(once), once);
});

test('normalizeMermaidSource is what every render path feeds mermaid (#600)', () => {
  assert.equal(normalizeMermaidSource('graph LR\n A[**x**]'), 'graph LR\n A[<b>x</b>]');
});
