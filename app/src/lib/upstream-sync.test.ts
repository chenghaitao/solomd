/**
 * Assertions carried over from upstream v5.0.10 while syncing it into this
 * fork. They cover the fixes that were *not* already fixed here, so a future
 * upstream merge cannot silently drop them:
 *
 *   #504 — bare stock tickers (`00700.HK`, `600519.SH`) must not linkify.
 *   #496 — Windows backslash image destinations survive markdown-it.
 *   #494 — the FileTree context-menu keys exist in every locale.
 *
 * (#486 / #489 / #493 / #495 are covered by this fork's own suites:
 * code-copy.test.ts, editor-commands.test.ts, image-referrer.test.ts.)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderMarkdown } from './markdown.ts';
import { zh } from '../i18n/zh.ts';
import { en } from '../i18n/en.ts';

test('#504 — bare stock ticker codes are not linkified as URLs', () => {
  const html = renderMarkdown('持仓：00700.HK、600519.SH、000001.SZ，详见 https://solomd.app/docs');
  assert.ok(!html.includes('href="http://00700.HK"'), `unexpected 00700.HK link in: ${html}`);
  assert.ok(!html.includes('href="http://600519.SH"'), `unexpected 600519.SH link in: ${html}`);
  assert.ok(!html.includes('href="http://000001.SZ"'), `unexpected 000001.SZ link in: ${html}`);
  // Explicit protocol links are still auto-linked.
  assert.ok(html.includes('href="https://solomd.app/docs"'), `expected explicit https link in: ${html}`);
});

test('#504 — a filename is not mistaken for a domain', () => {
  const html = renderMarkdown('见 README.md 与 notes.txt');
  assert.ok(!/href="http:\/\/README\.md"/i.test(html), `unexpected .md link in: ${html}`);
});

test('#496 — Windows backslash image paths are normalised to forward slashes', () => {
  const html = renderMarkdown('![win](E:\\photos\\img.png)\n\n```\n![fence](E:\\photos\\img.png)\n```');
  assert.ok(html.includes('src="E:/photos/img.png"'), `expected normalised forward-slash src in: ${html}`);
  // A fenced code block still shows the source verbatim.
  assert.ok(html.includes('![fence](E:\\photos\\img.png)'), `expected code fence backslash preserved in: ${html}`);
});

test('#380 — `file:` link destinations still render as links (fork-only)', () => {
  const html = renderMarkdown('[临时记录](file:///F:/%E7%BC%93%E5%AD%98/%E4%B8%B4%E6%97%B6%E8%AE%B0%E5%BD%95.md)');
  assert.match(html, /<a\b[^>]*href="file:/, `expected a file: link in: ${html}`);
});

test('#494 — FileTree context-menu keys exist and are not raw ids', () => {
  for (const dict of [zh, en]) {
    for (const key of ['expandSubtree', 'collapseSubtree', 'clearRecentFolders'] as const) {
      const value = (dict.explorer as Record<string, string | undefined>)[key];
      assert.ok(value && !value.includes('explorer.'), `${key} missing or untranslated: ${value}`);
    }
  }
});
