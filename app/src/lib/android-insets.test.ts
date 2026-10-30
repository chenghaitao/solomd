import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shouldApplySystemInsets, systemInsetPadding } from './android-insets.ts';

// A 1080×2400 phone at 3× : 360×800 CSS px, nav bar 144 px (48 CSS px),
// status bar 66 px (22 CSS px).
const PHONE_BARS = { top: 66, bottom: 144 };
const DPR = 3;
const SCREEN_CSS = 800;

test('edge-to-edge (Android 15): the viewport is the whole screen, so pad', () => {
  // innerHeight is the full 800 CSS px — the bars overlap it.
  assert.equal(shouldApplySystemInsets(PHONE_BARS, 800, SCREEN_CSS, DPR), true);
  assert.deepEqual(systemInsetPadding(PHONE_BARS, 800, SCREEN_CSS, DPR), { top: 22, bottom: 48 });
});

test('inset activity (Android 10/12): the viewport already excludes the bars, so pad nothing', () => {
  // 800 − 22 − 48 = 730: the OS laid the WebView out below both bars.
  assert.equal(shouldApplySystemInsets(PHONE_BARS, 730, SCREEN_CSS, DPR), false);
  assert.deepEqual(systemInsetPadding(PHONE_BARS, 730, SCREEN_CSS, DPR), { top: 0, bottom: 0 });
});

test('a viewport that is one bar short still counts as inset', () => {
  // Some skins report only the status bar in the dimensions and draw the
  // content under the nav bar: 800 − 48 = 752. Half-a-bar slack keeps this
  // out of the "pad" branch only when the difference is a full bar.
  assert.equal(shouldApplySystemInsets(PHONE_BARS, 752, SCREEN_CSS, DPR), false);
});

test('no bar heights means no padding — the no-op path on desktops', () => {
  assert.equal(shouldApplySystemInsets({ top: 0, bottom: 0 }, 800, 800, 1), false);
  assert.deepEqual(systemInsetPadding({ top: 0, bottom: 0 }, 800, 800, 1), { top: 0, bottom: 0 });
});

test('an unusable measurement keeps the padding (a hidden toolbar is worse)', () => {
  assert.equal(shouldApplySystemInsets(PHONE_BARS, 0, 0, 0), true);
  assert.deepEqual(systemInsetPadding(PHONE_BARS, Number.NaN, SCREEN_CSS, DPR), { top: 22, bottom: 48 });
});

test('landscape: the nav bar moves to the side, only a short bar is left', () => {
  // 800×360 CSS px, side nav bar (not reported in `bottom`), status bar 22.
  const landscape = { top: 22 * DPR, bottom: 0 };
  assert.equal(shouldApplySystemInsets(landscape, 338, 360, DPR), false);
  assert.deepEqual(systemInsetPadding(landscape, 338, 360, DPR), { top: 0, bottom: 0 });
  assert.equal(shouldApplySystemInsets(landscape, 360, 360, DPR), true);
});
