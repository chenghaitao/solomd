import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localPathFromHref } from './file-link.ts';

test('renders a Windows drive file: URL as a backslash path', () => {
  assert.equal(localPathFromHref('file:///F:/dir/note.md'), 'F:\\dir\\note.md');
  assert.equal(localPathFromHref('file:///F:\\dir\\note.md'), 'F:\\dir\\note.md');
  // The drive read as the URL "host" (`file://F:/dir`).
  assert.equal(localPathFromHref('file://F:/dir/note.md'), 'F:\\dir\\note.md');
});

test('decodes the percent escapes markdown-it adds for CJK names', () => {
  const href =
    'file:///F:/%E7%BC%93%E5%AD%98%E7%9B%AE%E5%BD%95/%E4%B8%B4%E6%97%B6%E8%AE%B0%E5%BD%95.md';
  assert.equal(localPathFromHref(href), 'F:\\缓存目录\\临时记录.md');
  assert.equal(localPathFromHref('file:///F:/a%20b/c.md'), 'F:\\a b\\c.md');
});

test('keeps POSIX paths slash-separated', () => {
  assert.equal(localPathFromHref('file:///home/me/note.md'), '/home/me/note.md');
  assert.equal(localPathFromHref('file://localhost/home/me/note.md'), '/home/me/note.md');
});

test('turns a remote host into a UNC share', () => {
  assert.equal(localPathFromHref('file://server/share/note.md'), '\\\\server\\share\\note.md');
});

test('accepts a bare Windows drive path', () => {
  assert.equal(localPathFromHref('C:\\notes\\a.md'), 'C:\\notes\\a.md');
  assert.equal(localPathFromHref('c:/notes/a.md'), 'c:/notes/a.md');
});

test('ignores every other scheme and relative path', () => {
  for (const href of [
    'https://solomd.app/',
    'http://example.com/a.md',
    'mailto:me@example.com',
    'asset://localhost/x.md',
    './sibling.md',
    '../up/a.md',
    '#heading',
    '',
    '   ',
  ]) {
    assert.equal(localPathFromHref(href), null, href);
  }
});

test('survives a malformed escape instead of throwing', () => {
  assert.equal(localPathFromHref('file:///F:/100%/a.md'), 'F:\\100%\\a.md');
});
