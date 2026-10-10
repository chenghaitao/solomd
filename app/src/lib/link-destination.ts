/**
 * #395 — which `URL` nodes in a Markdown syntax tree are link *destinations*.
 *
 * Live-edit mode (`cm-live-render.ts`) hides the destination of
 * `[label](url)` so the line reads like a preview, and keeps everything else.
 * The predicate lives here, in a leaf module, so it can be tested against a
 * real lezer-markdown tree without dragging the whole editor extension (and its
 * CodeMirror/Widget dependencies) into the test runner.
 */

/**
 * The tree fields this test reads. Deliberately narrow: a lezer `SyntaxNode`
 * satisfies it as-is, so callers need no cast.
 */
export interface LinkUrlNode {
  name: string;
  parent: { name: string } | null;
  prevSibling: { name: string; from: number; to: number } | null;
}

/**
 * `true` when the node is the destination of an inline `[label](url)` link —
 * the only URL that live-edit should hide.
 *
 * Three shapes reach here and only the first is a destination:
 *
 *   `[官网](https://solomd.app/)`
 *     a `URL` right after the `(` LinkMark — hide it.
 *   `[https://solomd.app/](https://solomd.app/)`
 *     GFM's autolink extension tags the URL-shaped *label* as a `URL` node
 *     too, sitting inside the same `Link` but after the `[` LinkMark. The old
 *     parent-only test hid it as well; with the label being the only visible
 *     text, the rendered link disappeared entirely (#395).
 *   `<https://solomd.app/>`
 *     an Autolink, where the URL is the whole link: its parent is not `Link`.
 *
 * Position is the reliable discriminator, so the `LinkMark` immediately before
 * the URL must be `(`.
 */
export function isLinkDestinationUrl(
  urlNode: LinkUrlNode,
  slice: (from: number, to: number) => string,
): boolean {
  if (!urlNode.parent || urlNode.parent.name !== 'Link') return false;
  const prev = urlNode.prevSibling;
  if (!prev || prev.name !== 'LinkMark') return false;
  return slice(prev.from, prev.to) === '(';
}
