/**
 * Release-channel resolution for the update centre.
 *
 * The network is stubbed: what matters here is which source is asked, in
 * which order, and how a response is turned into a version/date/page triple.
 *
 * The Atom step exists because `api.github.com` allows 60 unauthenticated
 * calls per hour per IP — a quota the dialog burned through in normal use,
 * which is exactly the "couldn't reach the update source" report.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  channelPage,
  channelRepo,
  checkChannelUpdate,
  clearChannelCache,
  fetchChannelReleases,
  parseReleasesAtom,
} from './release-channels.ts';

const realFetch = globalThis.fetch;
const calls: string[] = [];

interface StubOptions {
  github?: unknown;
  gitee?: unknown;
  atom?: string;
  githubStatus?: number;
}

const ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>tag:github.com,2008:Repository/1/v5.0.15</id>
    <updated>2026-11-03T04:19:17Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/chenghaitao/solomd/releases/tag/v5.0.15"/>
    <title>SoloMD v5.0.15</title>
    <content type="html">&lt;h2&gt;Update centre&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;Two sources&lt;/li&gt;&lt;/ul&gt;</content>
  </entry>
  <entry>
    <id>tag:github.com,2008:Repository/1/v5.0.13</id>
    <updated>2026-11-02T02:33:17Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/chenghaitao/solomd/releases/tag/v5.0.13"/>
    <title>SoloMD v5.0.13</title>
    <content type="html">&lt;p&gt;Older&lt;/p&gt;</content>
  </entry>
</feed>`;

function stubFetch({ github, gitee, atom, githubStatus = 200 }: StubOptions): void {
  calls.length = 0;
  clearChannelCache();
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('api.github.com')) {
      if (github === undefined || githubStatus !== 200) {
        return new Response('{"message":"API rate limit exceeded"}', { status: githubStatus || 403 });
      }
      return new Response(JSON.stringify(github), { status: 200 });
    }
    if (url.endsWith('.atom')) {
      if (atom === undefined) return new Response('not found', { status: 404 });
      return new Response(atom, { status: 200 });
    }
    if (url.includes('gitee.com')) {
      if (gitee === undefined) return new Response('nope', { status: 500 });
      return new Response(JSON.stringify(gitee), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  clearChannelCache();
});

const GH_RELEASES = [
  {
    tag_name: 'v5.0.15',
    published_at: '2026-11-03T04:19:17Z',
    html_url: 'https://github.com/chenghaitao/solomd/releases/tag/v5.0.15',
    draft: false,
    prerelease: false,
    body: 'notes',
  },
  {
    tag_name: 'v5.0.13',
    published_at: '2026-11-02T02:33:17Z',
    html_url: 'https://github.com/chenghaitao/solomd/releases/tag/v5.0.13',
    draft: false,
    prerelease: false,
    body: '',
  },
  {
    tag_name: 'v5.0.16-rc',
    published_at: '2026-11-04T01:00:00Z',
    html_url: '',
    draft: true,
    prerelease: true,
    body: '',
  },
];

test('the API answer is used when it is available, and drafts are dropped', async () => {
  stubFetch({ github: GH_RELEASES });
  const list = await fetchChannelReleases('fork');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /api\.github\.com\/repos\/chenghaitao\/solomd\/releases/);
  assert.deepEqual(
    list.map((r) => r.version),
    ['5.0.15', '5.0.13'],
  );
  assert.equal(list[0].tag, 'v5.0.15');
  assert.equal(list[0].pageUrl, 'https://github.com/chenghaitao/solomd/releases/tag/v5.0.15');
});

test('a rate-limited API falls back to the Atom feed (#the 403 report)', async () => {
  stubFetch({ githubStatus: 403, atom: ATOM_FEED });
  const list = await fetchChannelReleases('fork');
  assert.deepEqual(
    list.map((r) => r.version),
    ['5.0.15', '5.0.13'],
  );
  assert.equal(list[0].publishedAt, '2026-11-03T04:19:17Z');
  assert.equal(list[0].pageUrl, 'https://github.com/chenghaitao/solomd/releases/tag/v5.0.15');
  // The feed carries the notes body as escaped HTML; it arrives as plain text.
  assert.match(list[0].body, /Update centre/);
  assert.doesNotMatch(list[0].body, /<h2>/);
});

test('the official channel falls back to the Gitee mirror when both GitHub paths fail', async () => {
  stubFetch({
    githubStatus: 403,
    gitee: [
      { tag_name: 'v5.0.12', created_at: '2026-11-01T03:13:22Z', html_url: '', name: 'v5.0.12' },
    ],
  });
  const list = await fetchChannelReleases('official');
  assert.equal(calls.length, 3, 'api → atom → gitee');
  assert.match(calls[0], /zhitongblog\/solomd/);
  assert.match(calls[1], /github\.com\/zhitongblog\/solomd\/releases\.atom/);
  assert.match(calls[2], /gitee\.com\/api\/v5\/repos\/zhitong45\/solomd\/releases/);
  assert.equal(list[0].version, '5.0.12');
  assert.equal(list[0].pageUrl, 'https://gitee.com/zhitong45/solomd/releases/tag/v5.0.12');
});

test('the fork channel never asks Gitee (it has no mirror) and reports nothing', async () => {
  stubFetch({ githubStatus: 500 });
  const list = await fetchChannelReleases('fork');
  assert.equal(list.length, 0);
  assert.equal(
    calls.filter((u) => u.includes('gitee')).length,
    0,
    "the fork must not fall through to upstream's mirror",
  );
});

test('a second open reuses the memoised list instead of spending quota', async () => {
  stubFetch({ github: GH_RELEASES });
  await fetchChannelReleases('fork');
  await fetchChannelReleases('fork');
  await checkChannelUpdate('fork', '5.0.14');
  assert.equal(calls.length, 1, 'one network call for three lookups');
});

test('clearChannelCache forces a fresh request (the retry button)', async () => {
  stubFetch({ github: GH_RELEASES });
  await fetchChannelReleases('fork');
  clearChannelCache();
  await fetchChannelReleases('fork');
  assert.equal(calls.length, 2);
});

test('parseReleasesAtom reads tag, date, link and body without a DOM', () => {
  const list = parseReleasesAtom(ATOM_FEED, 'https://github.com/x/y/releases');
  assert.equal(list.length, 2);
  assert.equal(list[0].version, '5.0.15');
  assert.equal(list[0].tag, 'v5.0.15');
  assert.equal(list[0].publishedAt, '2026-11-03T04:19:17Z');
  assert.equal(list[0].pageUrl, 'https://github.com/chenghaitao/solomd/releases/tag/v5.0.15');
  assert.equal(list[0].prerelease, false);
  assert.match(list[0].body, /Two sources/);
});

test('parseReleasesAtom skips an entry with no usable tag', () => {
  const xml = '<feed><entry><title>something</title></entry></feed>';
  assert.deepEqual(parseReleasesAtom(xml, 'https://github.com/x/y/releases'), []);
});

test('checkChannelUpdate compares against the installed version', async () => {
  stubFetch({ github: GH_RELEASES });
  const newer = await checkChannelUpdate('fork', '5.0.13');
  assert.equal(newer.hasUpdate, true);
  assert.equal(newer.latest?.version, '5.0.15');

  const same = await checkChannelUpdate('fork', '5.0.15');
  assert.equal(same.hasUpdate, false);

  const ahead = await checkChannelUpdate('fork', '5.1.0');
  assert.equal(ahead.hasUpdate, false);
});

test('checkChannelUpdate reports an unreachable source instead of "up to date"', async () => {
  stubFetch({ githubStatus: 500 });
  const res = await checkChannelUpdate('fork', '5.0.15');
  assert.equal(res.error, true);
  assert.equal(res.latest, null);
  assert.equal(res.hasUpdate, false);
});

test('channel metadata is stable for both sources', () => {
  assert.equal(channelRepo('fork'), 'chenghaitao/solomd');
  assert.equal(channelRepo('official'), 'zhitongblog/solomd');
  assert.match(channelPage('official'), /zhitongblog\/solomd\/releases$/);
});
