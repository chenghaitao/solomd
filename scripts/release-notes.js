#!/usr/bin/env node
'use strict';

// Prints the GitHub Release body for a tag: this tag's CHANGELOG.md section,
// plus the static Install / Verify blocks.
//
//   node scripts/release-notes.js v4.14.5 > notes.md
//   gh release edit v4.14.5 --notes-file notes.md
//
// The body used to open with two links to solomd.app/whats-new — upstream's
// site, describing upstream's releases, on a fork build. A reader had to leave
// GitHub to learn what changed. The changelog section for the tag is the only
// text guaranteed to describe the binaries attached to that very release, so it
// gets inlined instead.
//
// The whole body lives here rather than in the workflow's `releaseBody` for one
// practical reason: rewriting the notes of an already-built (draft) release is
// then `--notes-file` on this same output, with nothing to keep in sync by
// hand.
//
// Always exits 0 with *something* printable: a tag pushed without a changelog
// entry must not fail the release build. Only a missing argument exits 1,
// because that is a workflow bug rather than a missing document.
//
// Dependency-free and CommonJS on purpose — the workflow calls it with the
// runner's system Node, like scripts/bump-version.js.

const fs = require('fs');
const path = require('path');

const tag = process.argv[2] || '';
const version = tag.replace(/^v/, '');

if (!version) {
  console.error('[release-notes] usage: node release-notes.js <version|vX.Y.Z>');
  process.exit(1);
}

const changelogPath = path.resolve(__dirname, '..', 'CHANGELOG.md');
const repo = process.env.GITHUB_REPOSITORY || 'chenghaitao/solomd';

/** `## [4.14.5] — 2026-09-24` and everything up to the next `## ` heading. */
function sectionFor(text, v) {
  const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp('^## \\[' + escaped + '\\]');
  // CRLF-tolerant: the maintainer releases from Windows and a stray \r would
  // otherwise ride along into the release body.
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n').trim();
}

let notes = '';
try {
  notes = sectionFor(fs.readFileSync(changelogPath, 'utf8'), version);
} catch (e) {
  // A missing/unreadable CHANGELOG must not break the release either.
  console.error('[release-notes] could not read CHANGELOG.md: ' + e.message);
}

if (!notes) {
  notes = 'No changelog entry for `' + version + '` yet — see ' +
    '[CHANGELOG.md](https://github.com/' + repo + '/blob/main/CHANGELOG.md).';
}

// macOS is deliberately absent from the download list: this fork's CI builds
// Windows and Linux only, and the locally built dmg (signed + notarized, from
// scripts/build-mac.sh) is not attached to these releases for the time being.
// Telling macOS users to "download the .dmg" pointed them at a file that is not
// there.
const body = `## SoloMD ${tag}

### What's new / 更新内容

${notes}

### Install / 安装

- **Windows**: download \`.msi\`. On first launch you may see "Windows protected your PC" → click **More info** → **Run anyway** (one-time, until SmartScreen reputation builds). 首次运行点 "更多信息" → "仍要运行" 即可
- **Linux**: download \`.AppImage\` (\`chmod +x\` and run) or \`.deb\` / \`.rpm\`
- **macOS**: built locally by the maintainer (signed + notarized universal dmg) and **not attached to this release for the time being** — build it from source with \`scripts/build-mac.sh\`. macOS 版由本地构建，暂不提供。

### Verify / 校验

The Windows builds are not code-signed yet, so Chrome's Enhanced
Protection scans each new release and reports "No viruses detected"
— that is a pass, not a warning. \`SHA256SUMS.txt\` is attached below
if you want to verify the download yourself.

Windows 版尚未代码签名，Chrome「增强保护」会扫描每个新版本并提示
"未检测到病毒" —— 这是通过，不是警告。附件 \`SHA256SUMS.txt\` 可用于自行校验。

🤖 Auto-built by GitHub Actions
`;

process.stdout.write(body);
