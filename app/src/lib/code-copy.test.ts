/**
 * #486 — "copy code block" pasted into 通达信 collapsed every line into one.
 *
 * Win32 editors read `CF_UNICODETEXT` as CRLF-delimited; the WebView writes
 * whatever string it is given, which is LF-only. `crlfForWindowsClipboard`
 * is the single place that conversion happens, so it is tested here rather
 * than through the clipboard plugin.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crlfForWindowsClipboard } from './code-copy.ts';

test('Windows: every LF becomes CRLF', () => {
  const code = 'MA5:MA(C,5);\nMA10:MA(C,10);\nDRAWICON(MA5>MA10,1);';
  const out = crlfForWindowsClipboard(code, true);
  assert.equal(
    out,
    'MA5:MA(C,5);\r\nMA10:MA(C,10);\r\nDRAWICON(MA5>MA10,1);',
  );
  assert.equal(out.split('\r\n').length, 3);
  // Three lines carry two separators, so exactly two CRs.
  assert.equal((out.match(/\r/g) || []).length, 2);
});

test('Windows: text that already uses CRLF is not doubled', () => {
  const out = crlfForWindowsClipboard('a\r\nb\r\nc', true);
  assert.equal(out, 'a\r\nb\r\nc');
  assert.ok(!/\r\r/.test(out));
});

test('Windows: mixed line endings normalise to one CRLF per break', () => {
  const out = crlfForWindowsClipboard('a\r\nb\nc\rd', true);
  assert.equal(out, 'a\r\nb\r\nc\rd');
});

test('Windows: a single line is left untouched', () => {
  assert.equal(crlfForWindowsClipboard('TOTAL:=1;', true), 'TOTAL:=1;');
});

test('Windows: a trailing newline survives as one CRLF', () => {
  assert.equal(crlfForWindowsClipboard('a\n', true), 'a\r\n');
});

test('other platforms keep their LF', () => {
  assert.equal(crlfForWindowsClipboard('a\nb', false), 'a\nb');
  assert.equal(crlfForWindowsClipboard('a\r\nb', false), 'a\r\nb');
});

test('empty text stays empty', () => {
  assert.equal(crlfForWindowsClipboard('', true), '');
});
