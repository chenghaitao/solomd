import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadHljs } from './render-deps.ts';
import {
  clearTokenCache,
  decodeEntities,
  highlightCodeTokens,
  tokensFromHljsHtml,
} from './hljs-tokens.ts';

// ---- the HTML walk ------------------------------------------------------

test('escaped entities decode to one character each', () => {
  assert.equal(decodeEntities('a &amp; b'), 'a & b');
  assert.equal(decodeEntities('&lt;div&gt;'), '<div>');
  assert.equal(decodeEntities('&#x27;q&#x27;'), "'q'");
  assert.equal(decodeEntities('&#38;'), '&');
  assert.equal(decodeEntities('no entities here'), 'no entities here');
  // An unknown named entity is left alone rather than silently dropped.
  assert.equal(decodeEntities('&bogus;'), '&bogus;');
});

test('offsets are measured on decoded text, not on the escaped HTML', () => {
  const html = '<span class="hljs-string">&#x27;hi&amp;bye&#x27;</span>';
  assert.deepEqual(tokensFromHljsHtml(html), [
    { from: 0, to: 8, classes: ['hljs-string'] },
  ]);
});

test('nested spans carry every class, so `.hljs-title.function_` still matches', () => {
  const html = '<span class="hljs-title function_">double</span>';
  assert.deepEqual(tokensFromHljsHtml(html), [
    { from: 0, to: 6, classes: ['hljs-title', 'function_'] },
  ]);
});

test('text outside any span produces no token but still advances the offset', () => {
  const html = 'x = <span class="hljs-number">1</span>;';
  assert.deepEqual(tokensFromHljsHtml(html), [
    { from: 4, to: 5, classes: ['hljs-number'] },
  ]);
});

test('empty and tagless input yield no tokens', () => {
  assert.deepEqual(tokensFromHljsHtml(''), []);
  assert.deepEqual(tokensFromHljsHtml('plain text'), []);
});

// ---- against real highlight.js ------------------------------------------

const SAMPLE = [
  'const answer = 42; // the answer',
  'function double(n) { return n * 2; }',
].join('\n');

test('real hljs output maps back onto the source text exactly', async () => {
  await loadHljs();
  clearTokenCache();
  const tokens = highlightCodeTokens(SAMPLE, 'js');
  assert.ok(tokens.length >= 6, `expected several tokens, got ${tokens.length}`);

  let previousEnd = 0;
  for (const token of tokens) {
    assert.ok(token.from >= previousEnd, 'tokens must be ordered and not overlap');
    assert.ok(token.to > token.from, 'tokens must not be empty');
    assert.ok(token.to <= SAMPLE.length, 'tokens must stay inside the source');
    previousEnd = token.to;
  }

  const at = (predicate: (classes: string[]) => boolean): string => {
    const token = tokens.find((candidate) => predicate(candidate.classes));
    assert.ok(token, 'expected token was not produced');
    return SAMPLE.slice(token.from, token.to);
  };

  assert.equal(at((c) => c.includes('hljs-keyword')), 'const');
  assert.equal(at((c) => c.includes('hljs-number')), '42');
  // The line comment runs to the end of its line and nothing past it.
  assert.equal(at((c) => c.includes('hljs-comment')), '// the answer');
  // A declaration name is tagged with two classes; the CSS needs both.
  assert.equal(
    at((c) => c.includes('hljs-title') && c.includes('function_')),
    'double',
  );
});

test('an unknown grammar is left plain instead of guessed at', async () => {
  await loadHljs();
  clearTokenCache();
  assert.deepEqual(highlightCodeTokens(SAMPLE, 'not-a-language'), []);
});

test('an unlabelled block falls back to auto-detection', async () => {
  await loadHljs();
  clearTokenCache();
  assert.ok(highlightCodeTokens(SAMPLE, '').length > 0);
});

test('very short unlabelled snippets are not auto-detected', async () => {
  await loadHljs();
  clearTokenCache();
  assert.deepEqual(highlightCodeTokens('a = 1', ''), []);
});

test('the cache hands back the same result without re-highlighting', async () => {
  await loadHljs();
  clearTokenCache();
  const first = highlightCodeTokens(SAMPLE, 'js');
  const second = highlightCodeTokens(SAMPLE, 'js');
  assert.equal(second, first, 'expected the cached array identity');
});
