/**
 * #380 — end-to-end check that a `file:` link survives the real render
 * pipeline (preprocess → markdown-it → DOMPurify) and still names the right
 * filesystem path afterwards.
 *
 * The unit tests in ./file-link.test.ts cover the path parsing in isolation;
 * what they cannot catch is markdown-it's default `validateLink` refusing the
 * scheme (the link then never becomes an <a> at all) or the sanitizer's URI
 * allow-list stripping the href back out. Both are exercised here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown.ts';
import { localPathFromHref } from './file-link.ts';

/** The href of the first rendered anchor, or null when nothing was linked. */
function firstHref(markdown: string): string | null {
  const m = /<a\b[^>]*\bhref="([^"]*)"/i.exec(renderMarkdown(markdown));
  return m ? m[1] : null;
}

test('a file: destination renders as a link and resolves back to its path', () => {
  const href = firstHref('[临时记录](file:///F:\\缓存目录\\临时记录.md)');
  assert.ok(href, 'the anchor never rendered — validateLink still blocks `file:`');
  assert.equal(localPathFromHref(href), 'F:\\缓存目录\\临时记录.md');
});

test('forward-slash and percent-encoded spellings resolve identically', () => {
  const forms = [
    'file:///F:/缓存目录/临时记录.md',
    'file:///F:/%E7%BC%93%E5%AD%98%E7%9B%AE%E5%BD%95/%E4%B8%B4%E6%97%B6%E8%AE%B0%E5%BD%95.md',
    '<file:///F:/缓存目录/临时记录.md>',
    'file://F:/缓存目录/临时记录.md',
  ];
  for (const form of forms) {
    const href = firstHref(`[临时记录](${form})`);
    assert.ok(href, `no anchor for ${form}`);
    assert.equal(localPathFromHref(href), 'F:\\缓存目录\\临时记录.md', form);
  }
});

test('POSIX and UNC file: links keep their shape', () => {
  assert.equal(localPathFromHref(firstHref('[a](file:///home/me/note.md)')!), '/home/me/note.md');
  assert.equal(
    localPathFromHref(firstHref('[a](file://server/share/note.md)')!),
    '\\\\server\\share\\note.md',
  );
});

test('the dangerous schemes stay rejected', () => {
  for (const src of [
    '[x](javascript:alert(1))',
    '[x](vbscript:msgbox(1))',
    '[x](data:text/html,<b>hi</b>)',
  ]) {
    assert.equal(firstHref(src), null, src);
  }
});

test('relative links and in-page anchors are untouched', () => {
  assert.equal(localPathFromHref(firstHref('[a](../other/note.md)')!), null);
  assert.equal(firstHref('[a](#section)'), '#section');
  assert.equal(localPathFromHref(firstHref('[a](#section)')!), null);
});
