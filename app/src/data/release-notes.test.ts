/**
 * Curated one-line notes: the update centre must describe the build the user
 * would actually install, so notes are keyed by channel before version —
 * fork 5.0.14 and official 5.0.14 are different things.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isEmptyNotes, releaseNotesFor } from './release-notes.ts';

test('a curated version returns its three sections', () => {
  const notes = releaseNotesFor('fork', '5.0.14', 'zh');
  assert.ok(notes);
  assert.ok(notes!.features.length > 0);
  assert.ok(notes!.improvements.length > 0);
  assert.ok(notes!.fixes.length > 0);
});

test('the fork and official channels describe their own builds', () => {
  const fork = releaseNotesFor('fork', '5.0.14', 'en');
  const official = releaseNotesFor('official', '5.0.12', 'en');
  assert.ok(fork && official);
  assert.notDeepEqual(fork!.features, official!.features);
  // The fork number does not exist on the official channel.
  assert.equal(releaseNotesFor('official', '5.0.14', 'en'), null);
});

test('Chinese and English differ, and unknown languages fall back to English', () => {
  const zh = releaseNotesFor('fork', '5.0.14', 'zh');
  const en = releaseNotesFor('fork', '5.0.14', 'en');
  const de = releaseNotesFor('fork', '5.0.14', 'de');
  assert.notDeepEqual(zh!.fixes, en!.fixes);
  assert.deepEqual(de, en);
});

test('a leading v is accepted and an unknown version returns null', () => {
  assert.ok(releaseNotesFor('fork', 'v5.0.13', 'en'));
  assert.equal(releaseNotesFor('fork', '4.0.0', 'en'), null);
  assert.equal(releaseNotesFor('fork', '', 'en'), null);
});

test('an empty group is reported as empty so the UI can use the long form', () => {
  assert.equal(isEmptyNotes(null), true);
  assert.equal(isEmptyNotes({ features: [], improvements: [], fixes: [] }), true);
  assert.equal(isEmptyNotes({ features: ['a'], improvements: [], fixes: [] }), false);
});
