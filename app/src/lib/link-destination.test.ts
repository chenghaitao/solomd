/**
 * #395 — live-edit mode made URL links disappear.
 *
 * The live-edit decoration hides the destination of `[label](url)` so the line
 * reads like the preview. It decided "this URL is a destination" from the node's
 * parent being a `Link` — but GFM's autolink extension tags a URL-shaped *label*
 * as a `URL` node inside that same `Link`, so `[https://solomd.app/](…)` had
 * both halves hidden. With the label gone there was nothing left to show.
 *
 * These tests pin the discriminator against the real lezer-markdown tree (not a
 * hand-written mock), because getting the parent/prevSibling relationships
 * wrong is exactly what caused the bug.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parser as mdParser, GFM } from '@lezer/markdown';
import { isLinkDestinationUrl, type LinkUrlNode } from './link-destination.ts';

const parser = mdParser.configure(GFM);

/** Every `URL` node in the tree, in document order, tagged as hidden or not. */
function urlNodes(source: string): Array<{ text: string; hide: boolean }> {
  const slice = (from: number, to: number) => source.slice(from, to);
  const found: Array<{ text: string; hide: boolean }> = [];
  parser.parse(source).iterate({
    enter: (node) => {
      if (node.name !== 'URL') return;
      found.push({
        text: slice(node.from, node.to),
        hide: isLinkDestinationUrl(node.node as unknown as LinkUrlNode, slice),
      });
    },
  });
  return found;
}

test('hides the destination of a plain labelled link', () => {
  assert.deepEqual(urlNodes('[官网](https://solomd.app/zh/)'), [
    { text: 'https://solomd.app/zh/', hide: true },
  ]);
});

test('keeps a URL-shaped label visible — the #395 regression', () => {
  // The label stays, only the destination is hidden.
  assert.deepEqual(urlNodes('[https://solomd.app/zh/](https://solomd.app/zh/)'), [
    { text: 'https://solomd.app/zh/', hide: false },
    { text: 'https://solomd.app/zh/', hide: true },
  ]);
});

test('keeps a bare autolink visible', () => {
  assert.deepEqual(urlNodes('<https://solomd.app/>'), [
    { text: 'https://solomd.app/', hide: false },
  ]);
});

test('keeps a URL-shaped label visible when the destination differs', () => {
  assert.deepEqual(urlNodes('- 官网：[https://a.example/](https://b.example/x)'), [
    { text: 'https://a.example/', hide: false },
    { text: 'https://b.example/x', hide: true },
  ]);
});

test('keeps the reference-style and image forms untouched', () => {
  // A reference link has no inline destination to hide.
  assert.deepEqual(urlNodes('[官网][ref]\n\n[ref]: https://solomd.app/'), [
    { text: 'https://solomd.app/', hide: false },
  ]);
  // An autolinked bare URL in a paragraph is plain text, not a destination.
  assert.deepEqual(urlNodes('见 https://solomd.app/ 说明'), [
    { text: 'https://solomd.app/', hide: false },
  ]);
});

test('ignores a URL-shaped node that is not inside a Link', () => {
  const node: LinkUrlNode = {
    name: 'URL',
    parent: { name: 'Paragraph' },
    prevSibling: { name: 'LinkMark', from: 0, to: 1 },
  };
  assert.equal(isLinkDestinationUrl(node, () => '('), false);
});

test('ignores a URL that follows the opening bracket mark', () => {
  const node: LinkUrlNode = {
    name: 'URL',
    parent: { name: 'Link' },
    prevSibling: { name: 'LinkMark', from: 0, to: 1 },
  };
  assert.equal(isLinkDestinationUrl(node, () => '['), false);
  assert.equal(isLinkDestinationUrl(node, () => '('), true);
});

test('ignores a link whose destination has no preceding mark', () => {
  const node: LinkUrlNode = { name: 'URL', parent: { name: 'Link' }, prevSibling: null };
  assert.equal(isLinkDestinationUrl(node, () => '('), false);
});
