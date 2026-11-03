/**
 * Release-channel resolution for the update centre.
 *
 * The network is stubbed: what matters here is which source is asked, in which
 * order, and how a response is turned into a version/date/page triple.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { channelPage, channelRepo, checkChannelUpdate, fetchChannelReleases } from './release-channels.ts';

const realFetch = globalThis.fetch;
const calls: string[] = [];

interface StubOptions {
  github?: unknown;
  gitee?: unknown;
  githubStatus?: number;
}

function stubFetch({ github, gitee, githubStatus = 200 }: StubOptions): void {
  calls.length = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('api.github.com')) {
      if (github === undefined || githubStatus !== 200) {
        return new Response('{"message":"rate limited"}', { status: githubStatus || 403 });
      }
      return new Response(JSON.stringify(github), { status: 200 });
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
});

const GH_RELEASES = [
  {
    tag_name: 'v5.0.14',
    published_at: '2026-11-02T14:10:11Z',
    html_url: 'https://github.com/chenghaitao/solomd/releases/tag/v5.0.14',
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
    tag_name: 'v5.0.15-rc',
    published_at: '2026-11-03T01:00:00Z',
    html_url: '',
    draft: true,
    prerelease: true,
    body: '',
  },
];

test('the fork channel asks its own repository and drops drafts', async () => {
  stubFetch({ github: GH_RELEASES });
  const list = await fetchChannelReleases('fork');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /api\.github\.com\/repos\/chenghaitao\/solomd\/releases/);
  assert.deepEqual(
    list.map((r) => r.version),
    ['5.0.14', '5.0.13'],
  );
  assert.equal(list[0].tag, 'v5.0.14');
  assert.equal(list[0].pageUrl, 'https://github.com/chenghaitao/solomd/releases/tag/v5.0.14');
});

test('the official channel falls back to the Gitee mirror when GitHub fails', async () => {
  stubFetch({
    githubStatus: 403,
    gitee: [{ tag_name: 'v5.0.12', created_at: '2026-11-01T03:13:22Z', html_url: '', name: 'v5.0.12' }],
  });
  const list = await fetchChannelReleases('official');
  assert.equal(calls.length, 2);
  assert.match(calls[0], /zhitongblog\/solomd/);
  assert.match(calls[1], /gitee\.com\/api\/v5\/repos\/zhitong45\/solomd\/releases/);
  assert.equal(list[0].version, '5.0.12');
  // No html_url from Gitee — the mirror's page is built from the tag.
  assert.equal(list[0].pageUrl, 'https://gitee.com/zhitong45/solomd/releases/tag/v5.0.12');
});

test('the fork channel never asks Gitee (it has no mirror) and reports nothing', async () => {
  stubFetch({ githubStatus: 500 });
  const list = await fetchChannelReleases('fork');
  assert.equal(list.length, 0);
  assert.equal(
    calls.filter((u) => u.includes('gitee')).length,
    0,
    'the fork must not fall through to upstream\'s mirror',
  );
});

test('checkChannelUpdate compares against the installed version', async () => {
  stubFetch({ github: GH_RELEASES });
  const newer = await checkChannelUpdate('fork', '5.0.13');
  assert.equal(newer.hasUpdate, true);
  assert.equal(newer.latest?.version, '5.0.14');

  const same = await checkChannelUpdate('fork', '5.0.14');
  assert.equal(same.hasUpdate, false);

  const ahead = await checkChannelUpdate('fork', '5.1.0');
  assert.equal(ahead.hasUpdate, false);
});

test('checkChannelUpdate reports an unreachable source instead of "up to date"', async () => {
  stubFetch({ githubStatus: 500 });
  const res = await checkChannelUpdate('fork', '5.0.14');
  assert.equal(res.error, true);
  assert.equal(res.latest, null);
  assert.equal(res.hasUpdate, false);
});

test('channel metadata is stable for both sources', () => {
  assert.equal(channelRepo('fork'), 'chenghaitao/solomd');
  assert.equal(channelRepo('official'), 'zhitongblog/solomd');
  assert.match(channelPage('official'), /zhitongblog\/solomd\/releases$/);
});
