/**
 * #380 — local file links.
 *
 * `[临时记录](file:///F:\缓存目录\临时记录.md)` should open that note. Two
 * things stand in the way, and this module solves the second one:
 *
 *   1. markdown-it refuses `file:` hrefs outright, so the link did not even
 *      render (see the `validateLink` override in ./markdown.ts).
 *   2. A `file:` href is a URL, not a path — and markdown-it percent-encodes
 *      everything dubious on the way out, including the separators of a
 *      hand-typed Windows path:
 *
 *        written  `file:///F:\缓存目录\临时记录.md`
 *        href     `file:///F:%5C%E7%BC%93%E5%AD%98%E7%9B%AE%E5%BD%95%5C….md`
 *
 *      so the escapes have to be decoded again before the filesystem sees
 *      them. (The `file:` scheme itself is deliberately left in the DOM: a
 *      bare `C:\…` href is rejected by the sanitizer's URI allow-list, while
 *      `file:` passes both markdown-it and DOMPurify — see sanitize-html.ts.)
 *
 * Accepted shapes:
 *   file:///F:/dir/a.md        → F:\dir\a.md          (Windows drive)
 *   file:///F:\dir\a.md        → F:\dir\a.md          (back-slash, encoded)
 *   file://F:/dir/a.md         → F:\dir\a.md          (drive read as "host")
 *   file:///home/me/a.md       → /home/me/a.md        (POSIX)
 *   file:///C:/Users/a%20b.md  → C:\Users\a b.md      (percent-decoded)
 *   file://server/share/a.md   → \\server\share\a.md  (Windows UNC)
 *   C:\dir\a.md                → C:\dir\a.md          (bare drive path)
 *
 * Deliberately NOT accepted: anything with another scheme (`http:`, `mailto:`,
 * `asset:`, …) and every relative path — those keep their existing handling in
 * `link-open.ts`.
 */

/** Decode `%xx` escapes, keeping the input when the sequence is malformed. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** `C:`, `c:` — a bare Windows drive letter acting as the URL's "host". */
const DRIVE_HOST_RE = /^[a-z]:$/i;
/** `F:\dir` or `F:/dir` — a path rooted in a Windows drive. */
const DRIVE_PATH_RE = /^[a-z]:[\\/]/i;
/** `/F:\dir` or `/F:/dir` — the same, still carrying the URL's leading slash. */
const LEADING_SLASH_DRIVE_RE = /^\/[a-z]:[\\/]/i;
/**
 * `//host/` — a genuine authority. The trailing `/` is required: without it
 * `file://F:\dir\a.md` (a drive path with back slashes and no separator after
 * the colons) would be mis-read as host `F:\dir\a.m`.
 */
const FILE_AUTHORITY_RE = /^file:\/\/[^/?#]+\//i;

/**
 * The filesystem path a link href points at, or `null` when the href is not a
 * local file link. Pure — no platform sniffing — so the same Markdown opens
 * the same way whichever OS reads it: a drive-letter path is handed to the OS
 * backslash-first (`openLinkedFile` normalises per platform), a POSIX path
 * keeps its slashes.
 */
export function localPathFromHref(href: string): string | null {
  // Decode first: the whole routine then works on the text the user typed,
  // which is what makes `%5C`-encoded Windows separators work at all.
  const raw = safeDecode(href.trim());
  if (!raw) return null;
  // A bare Windows drive path typed without a `file:` scheme.
  if (DRIVE_PATH_RE.test(raw)) return raw;
  if (!/^file:/i.test(raw)) return null;

  let host = '';
  let path = '';
  if (FILE_AUTHORITY_RE.test(raw)) {
    // `file://F:/dir/a.md`, `file://server/share/a.md` — there IS a host.
    const rest = raw.slice('file://'.length);
    const slash = rest.indexOf('/');
    host = rest.slice(0, slash);
    path = rest.slice(slash);
  } else {
    // `file:///F:/dir`, `file://F:\dir` (no separator → the "host" slot is
    // really the start of the path), `file:/F:/dir`.
    path = raw.slice('file:'.length).replace(/^\/\//, '');
  }
  // The authority is now fully peeled off; what follows is path-only.
  if (host && DRIVE_HOST_RE.test(host)) {
    // `file://F:/dir` — the drive ended up in the host slot.
    path = host + path;
    host = '';
  }
  if (LEADING_SLASH_DRIVE_RE.test(path)) path = path.slice(1);

  if (host && host.toLowerCase() !== 'localhost') {
    // UNC share: `file://server/share/note.md` → `\\server\share\note.md`.
    return `\\\\${host}${path.replace(/\//g, '\\')}`;
  }
  if (DRIVE_PATH_RE.test(path)) return path.replace(/\//g, '\\');
  return path;
}
