#!/usr/bin/env node
'use strict';

// Prints the CHANGELOG.md section for a version, for use as the GitHub Release
// body (see the "Extract this tag's CHANGELOG section" step in
// .github/workflows/release.yml).
//
// The release body used to open with two links to solomd.app/whats-new —
// upstream's site, describing upstream's releases, on a fork build. A reader
// had to leave GitHub to learn what changed. The changelog section for the tag
// is the only text guaranteed to describe the binaries attached to that very
// release, so it gets inlined instead.
//
//   node scripts/release-notes.js v4.14.5   > notes.md
//
// Always exits 0 with *something* printable: a tag pushed without a changelog
// entry must not fail the release build. Only a missing argument exits 1,
// because that is a workflow bug rather than a missing document.
//
// Dependency-free and CommonJS on purpose — the workflow calls it with the
// runner's system Node, like scripts/bump-version.js.

const fs = require('fs');
const path = require('path');

const raw = process.argv[2] || '';
const version = raw.replace(/^v/, '');

if (!version) {
  console.error('[release-notes] usage: node release-notes.js <version|vX.Y.Z>');
  process.exit(1);
}

const changelogPath = path.resolve(__dirname, '..', 'CHANGELOG.md');

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
  const repo = process.env.GITHUB_REPOSITORY || 'chenghaitao/solomd';
  notes =
    'No changelog entry for `' + version + '` yet — see ' +
    '[CHANGELOG.md](https://github.com/' + repo + '/blob/main/CHANGELOG.md).';
}

process.stdout.write(notes + '\n');
