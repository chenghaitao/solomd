/**
 * highlight.js output → flat, offset-addressed token ranges.
 *
 * `markdown-it`'s `highlight` hook hands hljs' HTML straight to the preview:
 * the browser parses the `<span class="hljs-*">` soup and the classes in
 * `styles/hljs-theme.css` colour it. CodeMirror cannot do that — a fenced
 * block in the live editor is plain text in a `contenteditable`, so the only
 * way to colour it is `Decoration.mark()` over document ranges.
 *
 * hljs has no public API that returns tokens as offsets (`highlight()` gives
 * HTML, `_emitter` is private). So we walk its HTML here, and — because hljs
 * only ever emits `<span>` plus HTML-escaped text, never reflows or trims —
 * the decoded text length of each chunk is exactly its length in the source.
 * That makes the offsets exact rather than approximate.
 *
 * The emitted class names are the hljs ones on purpose: `hljs-theme.css`
 * already maps them to the `--syn-*` theme variables, so the editor, the
 * preview and the exports share one palette with no third stylesheet.
 *
 * Issue #589.
 */
import { getHljs } from './render-deps';

export interface CodeToken {
  /** Offset into the highlighted source string. */
  from: number;
  /** Exclusive end offset. */
  to: number;
  /** hljs classes for this run, e.g. `['hljs-keyword']`. */
  classes: string[];
}

/** Auto-detection is a guess; below this it guesses noise, above it costs too
 *  much per keystroke. Explicitly-tagged fences are highlighted at any size. */
const AUTO_MIN_LENGTH = 24;
const AUTO_MAX_LENGTH = 4000;

/** Bounded so a long editing session over many notes can't grow unbounded. */
const CACHE_LIMIT = 32;
const cache = new Map<string, CodeToken[]>();

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

const ENTITY_RE = /&(?:#x([0-9a-fA-F]+)|#(\d+)|([a-zA-Z]+));/g;

/** hljs escapes text with exactly this set; length matters, so decode. */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(ENTITY_RE, (whole, hex, dec, name) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    if (dec) return String.fromCodePoint(parseInt(dec, 10));
    const named = NAMED_ENTITIES[String(name).toLowerCase()];
    return named === undefined ? whole : named;
  });
}

const TAG_RE = /<span\b([^>]*)>|<\/span>|<[^>]*>/g;
const CLASS_ATTR_RE = /class\s*=\s*(?:"([^"]*)"|'([^']*)')/;

/**
 * Turn hljs HTML into offset ranges. Nested spans merge their classes, so
 * `<span class="hljs-title function_">` yields both — matching how the CSS
 * in `hljs-theme.css` targets `.hljs-title.function_`.
 */
export function tokensFromHljsHtml(html: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const stack: string[][] = [];
  let offset = 0;
  let cursor = 0;

  const pushText = (text: string): void => {
    if (!text) return;
    const length = decodeEntities(text).length;
    if (length <= 0) return;
    const classes = stack.flat();
    if (classes.length > 0) {
      tokens.push({ from: offset, to: offset + length, classes });
    }
    offset += length;
  };

  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(html)) !== null) {
    pushText(html.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    if (match[0].startsWith('</span')) {
      stack.pop();
    } else if (match[0].startsWith('<span')) {
      const raw = CLASS_ATTR_RE.exec(match[1] ?? '');
      const cls = raw?.[1] ?? raw?.[2] ?? '';
      stack.push(cls.split(/\s+/).filter(Boolean));
    }
    // Any other tag hljs might emit carries no text, so it moves no offset.
  }
  pushText(html.slice(cursor));

  return tokens;
}

/**
 * Token ranges for one code block, or `[]` when there is nothing to colour
 * yet (hljs still loading, or a grammar we don't ship) — callers then render
 * plain text exactly as before.
 */
export function highlightCodeTokens(code: string, lang = ''): CodeToken[] {
  const language = lang.trim().toLowerCase().split(/\s+/)[0] ?? '';
  const key = `${language}\u0000${code}`;
  const cached = cache.get(key);
  if (cached) {
    // Refresh LRU position.
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

  const hl = getHljs();
  if (!hl) return [];

  let html = '';
  try {
    if (language && hl.getLanguage(language)) {
      html = hl.highlight(code, { language, ignoreIllegals: true }).value;
    } else if (
      code.length >= AUTO_MIN_LENGTH
      && code.length <= AUTO_MAX_LENGTH
      && !language
    ) {
      // Unlabelled fence: same best-effort guess the preview makes. Skipped
      // for an *unknown* tag (`\`\`\`foo`) — the author meant something we
      // don't have a grammar for, and guessing there reads as a bug.
      html = hl.highlightAuto(code).value;
    }
  } catch {
    html = '';
  }

  const tokens = html ? tokensFromHljsHtml(html) : [];
  cache.set(key, tokens);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return tokens;
}

/** Test seam — the cache must not leak between cases. */
export function clearTokenCache(): void {
  cache.clear();
}
