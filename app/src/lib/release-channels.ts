/**
 * Update sources ("channels") for the in-app update centre.
 *
 * Two of them, picked in the dialog and remembered:
 *
 *   fork     — this repository's own GitHub releases. Default, and the only
 *              one that carries the local fixes.
 *   official — upstream's releases. Resolved through the original path
 *              (`solomd.app/api/stats`, then GitHub, then the Gitee mirror)
 *              so the behaviour mainland users already rely on is unchanged.
 *
 * Everything the dialog shows — the version line, the notes, the history
 * list, the download link and the installer download — follows the selected
 * channel, so the two can never disagree.
 */

export type UpdateChannel = 'fork' | 'official';

export const DEFAULT_CHANNEL: UpdateChannel = 'fork';

export interface ChannelRelease {
  /** Bare version, e.g. `5.0.14`. */
  version: string;
  /** Tag as published, e.g. `v5.0.14`. */
  tag: string;
  /** ISO timestamp; empty when the source did not provide one. */
  publishedAt: string;
  /** Human-facing release page for this version's downloads. */
  pageUrl: string;
  prerelease: boolean;
  /** Release body, used as a fallback when no curated notes exist. */
  body: string;
}

interface ChannelSpec {
  id: UpdateChannel;
  /** `owner/name` on GitHub. */
  repo: string;
  page: string;
  /** Official builds keep the proxy + Gitee resolver from check-update.ts. */
  official: boolean;
}

const CHANNELS: Record<UpdateChannel, ChannelSpec> = {
  fork: {
    id: 'fork',
    repo: 'chenghaitao/solomd',
    page: 'https://github.com/chenghaitao/solomd/releases',
    official: false,
  },
  official: {
    id: 'official',
    repo: 'zhitongblog/solomd',
    page: 'https://github.com/zhitongblog/solomd/releases',
    official: true,
  },
};

/** Gitee mirror of the upstream repository, used when GitHub is unreachable. */
const GITEE_API = 'https://gitee.com/api/v5/repos/zhitong45/solomd/releases';
const GITEE_PAGE = 'https://gitee.com/zhitong45/solomd/releases';

export function channelSpec(channel: UpdateChannel): ChannelSpec {
  return CHANNELS[channel] ?? CHANNELS[DEFAULT_CHANNEL];
}

/** Release-list page for a channel — the "open download page" target. */
export function channelPage(channel: UpdateChannel): string {
  return channelSpec(channel).page;
}

/** GitHub owner/name for a channel, used by the installer download command. */
export function channelRepo(channel: UpdateChannel): string {
  return channelSpec(channel).repo;
}

function isOfficial(channel: UpdateChannel): boolean {
  return (CHANNELS[channel] ?? CHANNELS[DEFAULT_CHANNEL]).official === true;
}

function normaliseVersion(raw: unknown): string {
  return String(raw ?? '').trim().replace(/^v/i, '');
}

function toRelease(raw: Record<string, unknown>, pageFallback: string): ChannelRelease | null {
  const tag = String(raw.tag_name ?? raw.tag ?? '').trim();
  const version = normaliseVersion(tag || raw.name);
  if (!version) return null;
  return {
    version,
    tag: tag || `v${version}`,
    publishedAt: String(raw.published_at ?? raw.created_at ?? ''),
    pageUrl: String(raw.html_url ?? '') || `${pageFallback}/tag/${tag || `v${version}`}`,
    prerelease: raw.prerelease === true || raw.is_prerelease === true,
    body: String(raw.body ?? raw.description ?? ''),
  };
}

async function fetchJson(url: string): Promise<unknown> {
  // A stalled connection must fail fast: without a timeout the dialog sits on
  // "checking" forever instead of offering a retry.
  const res = await fetch(url, {
    // GitHub's unauthenticated API is rate-limited per IP; the response is
    // small and always changing, so never serve it from a cache.
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Undo the XML entity escaping Atom feeds apply to their text nodes. */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, '&');
}

/** HTML fragment → plain text, one line per block, tags dropped. */
function htmlToText(html: string): string {
  return decodeEntities(html)
    .replace(/<\/(p|div|li|h[1-6]|tr|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Parse a `releases.atom` feed.
 *
 * Why this exists: `api.github.com` allows 60 unauthenticated requests per
 * hour per IP, and the update centre fetches on every open — a handful of
 * checks behind one NAT, or a user who retries a few times, exhausts it and
 * every request comes back `403 rate limit exceeded`. The Atom feed is served
 * by github.com itself, carries no such quota, and still gives the tag, the
 * publish date and the download link. It has no per-release Markdown body
 * worth showing, so the curated notes are what the dialog relies on.
 *
 * Parsed with regexes rather than DOMParser so the same code path is covered
 * by node:test (no DOM there).
 */
export function parseReleasesAtom(xml: string, pageFallback: string): ChannelRelease[] {
  const out: ChannelRelease[] = [];
  const entries = xml.split(/<entry>/i).slice(1);
  for (const raw of entries) {
    const href =
      /<link\b[^>]*\brel="alternate"[^>]*\bhref="([^"]+)"/i.exec(raw)?.[1] ??
      /<link\b[^>]*\bhref="([^"]+)"[^>]*\brel="alternate"/i.exec(raw)?.[1] ??
      '';
    const tagFromHref = /\/tag\/([^/?#"]+)/.exec(href)?.[1] ?? '';
    const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1] ?? '').trim();
    const tag = decodeURIComponent(tagFromHref) || (/\bv\d/i.test(title) ? title.split(/\s+/).pop()! : '');
    const version = normaliseVersion(tag);
    if (!version) continue;
    const updated = /<updated>([^<]+)<\/updated>/i.exec(raw)?.[1] ?? '';
    const content = /<content\b[^>]*>([\s\S]*?)<\/content>/i.exec(raw)?.[1] ?? '';
    out.push({
      version,
      tag: tag || `v${version}`,
      publishedAt: updated,
      pageUrl: href || `${pageFallback}/tag/${tag || `v${version}`}`,
      prerelease: false,
      body: htmlToText(content),
    });
  }
  return out;
}

/** Successful lookups are reused for a few minutes: opening the dialog twice
 *  in a row must not spend two API calls out of the hourly budget. */
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<UpdateChannel, { at: number; list: ChannelRelease[] }>();

/** Drop the memoised lists (the retry button and the tests use this). */
export function clearChannelCache(): void {
  cache.clear();
}

/**
 * Releases of `channel`, newest first. Empty array when nothing could be
 * reached — the caller shows a retry affordance rather than an empty list.
 *
 * Sources, in order: the GitHub API (richest), github.com's Atom feed (no
 * rate limit), and — for the official channel only — the Gitee mirror.
 */
export async function fetchChannelReleases(
  channel: UpdateChannel,
  limit = 12,
): Promise<ChannelRelease[]> {
  const cached = cache.get(channel);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.list.slice(0, limit);
  }

  const spec = channelSpec(channel);
  const remember = (list: ChannelRelease[]): ChannelRelease[] => {
    if (list.length > 0) cache.set(channel, { at: Date.now(), list });
    return list.slice(0, limit);
  };

  try {
    const data = await fetchJson(
      `https://api.github.com/repos/${spec.repo}/releases?per_page=${limit}`,
    );
    if (Array.isArray(data)) {
      const list = data
        .filter((r) => r && r.draft !== true)
        .map((r) => toRelease(r as Record<string, unknown>, spec.page))
        .filter((r): r is ChannelRelease => r !== null);
      if (list.length > 0) return remember(list);
    }
  } catch {
    /* rate limit or offline — try the feed */
  }

  try {
    const xml = await fetchText(`https://github.com/${spec.repo}/releases.atom`);
    const list = parseReleasesAtom(xml, spec.page);
    if (list.length > 0) return remember(list);
  } catch {
    /* fall through to the mirror */
  }

  // Only upstream has a Gitee mirror; the fork does not.
  if (isOfficial(channel)) {
    try {
      const data = await fetchJson(`${GITEE_API}?per_page=${limit}&page=1`);
      if (Array.isArray(data)) {
        return remember(
          data
            .map((r) => toRelease(r as Record<string, unknown>, GITEE_PAGE))
            .filter((r): r is ChannelRelease => r !== null),
        );
      }
    } catch {
      /* nothing left to try */
    }
  }
  return [];
}

function compareVersion(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map(Number);
  const pb = b.replace(/^v/i, '').split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export interface ChannelCheck {
  latest: ChannelRelease | null;
  hasUpdate: boolean;
  /** True when the source could not be reached at all. */
  error: boolean;
}

/**
 * Is there a newer build on `channel` than `current`? Used by the startup
 * check, which only needs the answer — the dialog re-fetches for its list.
 */
export async function checkChannelUpdate(
  channel: UpdateChannel,
  current: string,
): Promise<ChannelCheck> {
  const list = await fetchChannelReleases(channel, 5);
  if (list.length === 0) return { latest: null, hasUpdate: false, error: true };
  const latest = list.find((r) => !r.prerelease) ?? list[0];
  const hasUpdate = current ? compareVersion(latest.version, current) > 0 : false;
  return { latest, hasUpdate, error: false };
}
