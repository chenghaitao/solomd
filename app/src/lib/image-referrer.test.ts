/**
 * #493 — a Gitee-hosted image answered 403 on Windows.
 *
 * Tauri 2 serves the Windows WebView from `http://tauri.localhost`, and the
 * request carried that as `Referer`; Gitee's hot-link protection replies
 * `{"code":"40310014","msg":"invalid Referer header"}`. With no referrer the
 * same URL is a plain 200, so every rendered `<img>` must say
 * `referrerpolicy="no-referrer"`.
 *
 * The raw-HTML half of the rule is set by the sanitizer hook (there is no DOM
 * in `node --test`, so `sanitizeRenderedHtml` takes its string fallback here
 * and the attribute assertion below only covers the Markdown syntax path).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderMarkdown } from './markdown.ts';

const GITEE = 'https://gitee.com/WuYiLingOps/pic-storage/raw/master/2026-images/a.png';

test('a Markdown image renders with referrerpolicy="no-referrer"', () => {
  const html = renderMarkdown(`![shot](${GITEE})`);
  assert.match(html, /<img\b/, 'the image did not render at all');
  assert.match(html, /referrerpolicy="no-referrer"/);
});

test('the size syntax keeps the attribute', () => {
  const html = renderMarkdown(`![shot|50%](${GITEE})`);
  assert.match(html, /referrerpolicy="no-referrer"/);
  assert.match(html, /width: 50%/);
});

test('the attribute survives a wikilink-free note with several images', () => {
  const html = renderMarkdown(`![a](${GITEE})\n\n![b](${GITEE})`);
  const imgs = html.match(/<img\b[^>]*>/g) || [];
  assert.equal(imgs.length, 2);
  for (const tag of imgs) assert.match(tag, /referrerpolicy="no-referrer"/);
});
