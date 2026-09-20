#!/usr/bin/env node
'use strict';

// Bumps the SoloMD version across the three sources of truth:
//   app/package.json            (frontend / CI reads this for release name)
//   app/src-tauri/tauri.conf.json  (installer + bundle version; has a BOM)
//   app/src-tauri/Cargo.toml    (crate version)
//
// Pure regex replacement (not JSON.parse) to preserve formatting and the
// UTF-8 BOM on tauri.conf.json. Kept dependency-free so release.bat can call
// it with the system Node directly.

const fs = require('fs');
const path = require('path');

const v = process.argv[2];

if (!v || !/^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/.test(v)) {
  console.error('[bump-version] usage: node bump-version.js <semver>  (e.g. 4.13.2)');
  process.exit(1);
}

const repo = path.resolve(__dirname, '..');

const targets = [
  {
    rel: 'app/package.json',
    re: /"version":\s*"[^"]+"/,
    rep: `"version": "${v}"`,
  },
  {
    rel: 'app/src-tauri/tauri.conf.json',
    re: /"version":\s*"[^"]+"/,
    rep: `"version": "${v}"`,
  },
  {
    rel: 'app/src-tauri/Cargo.toml',
    re: /^version\s*=\s*"[^"]+"/m,
    rep: `version = "${v}"`,
  },
];

let ok = true;
for (const t of targets) {
  const p = path.join(repo, t.rel);
  if (!fs.existsSync(p)) {
    console.error(`[bump-version] missing: ${t.rel}`);
    ok = false;
    continue;
  }
  const buf = fs.readFileSync(p);
  const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  let s = buf.toString('utf8');
  if (!t.re.test(s)) {
    console.error(`[bump-version] no version field found in: ${t.rel}`);
    ok = false;
    continue;
  }
  s = s.replace(t.re, t.rep);
  if (hasBom) s = '﻿' + s;
  fs.writeFileSync(p, s, 'utf8');
  console.log(`[bump-version] ${t.rel} -> ${v}`);
}

process.exit(ok ? 0 : 1);
