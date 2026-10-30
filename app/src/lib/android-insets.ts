/**
 * #479 — Android system-bar padding, applied only when it is actually needed.
 *
 * #153 added `--android-safe-top/bottom` because Android 15 (targetSdk 35+)
 * forces edge-to-edge and the WebView reports `env(safe-area-inset-*)` as 0
 * there, so the toolbar rendered under the status bar. The heights come from
 * the framework dimens (`status_bar_height`, `navigation_bar_height`), which
 * exist on **every** Android version.
 *
 * The catch, reported as #479: on Android 10 / 12 devices the OS does *not*
 * put the WebView under the system bars — it already insets the activity — so
 * adding the nav-bar height as `padding-bottom` left a blank strip under the
 * content, in both orientations, that nothing could use.
 *
 * Telling the two cases apart needs no extra native call: when the activity is
 * laid out below the bars, the layout viewport is shorter than the screen by
 * exactly those bars; when it draws under them (edge-to-edge), the viewport is
 * the full screen. So compare the two and only pad in the second case.
 *
 * Kept as a pure function so the arithmetic is unit-tested without a device.
 */

export interface SystemInsetsPx {
  top: number;
  bottom: number;
}

/**
 * True when the system bars overlap the WebView, i.e. when the app must pad
 * its own layout by them.
 *
 * @param insets       bar heights in **physical** px, as the native command reports them
 * @param viewport     `window.innerHeight` in CSS px
 * @param screenHeight `window.screen.height` in CSS px
 * @param dpr          `window.devicePixelRatio`
 *
 * Defaults to `true` whenever the measurement looks unusable (0 / NaN): an
 * extra blank strip is a cosmetic complaint, a toolbar hidden under the status
 * bar is an unusable app, so unknown leans to padding.
 */
export function shouldApplySystemInsets(
  insets: SystemInsetsPx,
  viewport: number,
  screenHeight: number,
  dpr: number,
): boolean {
  const top = Math.max(0, insets?.top || 0);
  const bottom = Math.max(0, insets?.bottom || 0);
  if (!top && !bottom) return false;
  if (!(viewport > 0) || !(screenHeight > 0) || !(dpr > 0)) return true;
  const barsCss = (top + bottom) / dpr;
  if (barsCss <= 0) return false;
  // Half a bar of slack: the viewport and `screen.height` are rounded
  // independently, and some skins report only one of the two bars.
  return viewport >= screenHeight - barsCss / 2;
}

/**
 * The CSS padding to publish, i.e. the bar heights in CSS px when the bars
 * overlap the viewport, otherwise zero.
 */
export function systemInsetPadding(
  insets: SystemInsetsPx,
  viewport: number,
  screenHeight: number,
  dpr: number,
): { top: number; bottom: number } {
  if (!shouldApplySystemInsets(insets, viewport, screenHeight, dpr)) {
    return { top: 0, bottom: 0 };
  }
  const scale = dpr > 0 ? dpr : 1;
  return {
    top: Math.round(Math.max(0, insets?.top || 0) / scale),
    bottom: Math.round(Math.max(0, insets?.bottom || 0) / scale),
  };
}
