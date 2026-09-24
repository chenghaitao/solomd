/**
 * Render ```mermaid fences into real diagrams, in place — after the fact.
 *
 * `renderMarkdown()` deliberately leaves a mermaid fence as
 * `<pre><code class="language-mermaid">`: the renderer is async and large
 * (`mermaid-lazy.ts` keeps ~600 kB out of the entry chunk), so the markdown
 * pass cannot wait for it. Every surface that shows a document therefore has
 * to rewrite those fences afterwards — the Preview pane, the PDF paths, the
 * PNG path, the HTML export and "copy as HTML".
 *
 * This is the single place that rewrite lives. It used to be three near
 * identical copies (pdf-export, image-export, useExport) with three different
 * ways of failing, and the two paths that were never given a copy — the HTML
 * export and the clipboard — shipped the diagram *source* verbatim, which is
 * what "导出的 HTML 里图表变成了一堆代码" was.
 */

import { initMermaid } from './mermaid-lazy';
import { svgToPngBlob } from './mermaid-export';

export type MermaidTheme = 'default' | 'dark' | 'neutral' | 'forest';

export interface MermaidInlineOptions {
  /** Temporary render id prefix. Mermaid ids must not collide in a document. */
  idPrefix: string;
  /**
   * Diagram theme. Export *files* always pass 'default': the artifacts are
   * light paper (the HTML template is light, the PDF page is white), so a dark
   * diagram would sit on white with unreadable edges. Only surfaces that
   * really are dark (the print overlay in dark mode, the clipboard where the
   * user pastes into their own editor) should pass 'dark'.
   */
  theme?: MermaidTheme;
  /**
   * What to do with a diagram mermaid refuses to parse:
   *  - `replace` (default) leaves a `<pre class="mermaid-error">` naming the
   *    reason where the diagram would have been, like the Preview pane does;
   *  - `skip` leaves the original code block untouched.
   */
  onError?: 'replace' | 'skip';
  /**
   * Embed a PNG data URL instead of the SVG. Inline SVG is better everywhere
   * it survives — crisp at any zoom, selectable text, a few kB — but Word,
   * Google Docs and most mail clients drop inline SVG on paste, so the
   * clipboard path rasterizes.
   */
  rasterize?: boolean;
  /** Rasterization scale over the SVG's intrinsic size (default 2×). */
  scale?: number;
  /** Canvas background when rasterizing; omitted keeps transparency. */
  background?: string;
}

// One counter for the whole session: mermaid ids must be unique per document,
// and passing a prefix per call keeps the ids readable in a DOM dump.
let seq = 0;

/**
 * Replace every mermaid fence inside `container`. Returns how many rendered —
 * 0 also means "mermaid was never even loaded".
 */
export async function inlineMermaidBlocks(
  container: HTMLElement,
  opts: MermaidInlineOptions,
): Promise<number> {
  const blocks = container.querySelectorAll('pre > code.language-mermaid');
  if (!blocks.length) return 0; // no diagrams: never pay for the renderer
  const mermaid = await initMermaid({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: opts.theme ?? 'default',
  });
  let rendered = 0;
  for (const block of Array.from(blocks)) {
    const pre = block.parentElement as HTMLElement | null;
    if (!pre) continue;
    const code = (block.textContent || '').trim();
    try {
      const { svg } = await mermaid.render(`${opts.idPrefix}${++seq}`, code);
      pre.replaceWith(await buildReplacement(svg, opts));
      rendered += 1;
    } catch (e) {
      // A broken diagram must never abort an export or a print.
      if ((opts.onError ?? 'replace') === 'skip') continue;
      const err = document.createElement('pre');
      err.className = 'mermaid-error';
      err.textContent = `Mermaid error: ${(e as Error).message}`;
      pre.replaceWith(err);
    }
  }
  return rendered;
}

async function buildReplacement(svg: string, opts: MermaidInlineOptions): Promise<HTMLElement> {
  const wrap = document.createElement('div');
  wrap.className = 'mermaid-block';
  if (!opts.rasterize) {
    // Mermaid inlines its theme CSS inside the <svg>, so the markup is
    // self-contained: no stylesheet, no font file, no fetch.
    wrap.innerHTML = svg;
    return wrap;
  }
  const holder = document.createElement('div');
  holder.innerHTML = svg;
  const el = holder.querySelector('svg');
  if (!el) throw new Error('mermaid produced no <svg>');
  const blob = await svgToPngBlob(el as unknown as SVGElement, {
    scale: opts.scale ?? 2,
    background: opts.background,
  });
  const img = document.createElement('img');
  // Empty alt: the diagram is decorative in the sense that the surrounding
  // prose carries the meaning, and inventing English alt text would leak into
  // an otherwise translated document.
  img.alt = '';
  img.src = await blobToDataUrl(blob);
  wrap.appendChild(img);
  return wrap;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * The same rewrite for a caller that only holds markup — the HTML export and
 * the clipboard never mount the document, they build a string.
 *
 * A document with no mermaid fence is returned untouched, without the
 * innerHTML round-trip below, so nothing can be re-serialized needlessly.
 */
export async function inlineMermaidInHtml(
  html: string,
  opts: MermaidInlineOptions,
): Promise<string> {
  if (!html.includes('language-mermaid')) return html;
  const host = document.createElement('div');
  host.innerHTML = html;
  await inlineMermaidBlocks(host, opts);
  return host.innerHTML;
}
