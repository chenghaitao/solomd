import { createApp, defineAsyncComponent } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { isLang, loadLocale } from './i18n';
import { useSettingsStore } from './stores/settings';
import { reanchorIosContainerPaths } from './lib/ios-container';
import { isWindowsDesktop } from './lib/platform';
import './styles/cjk-font.css';
import './styles/main.css';
import './styles/hljs-theme.css';
import 'katex/dist/katex.min.css';

const params = new URLSearchParams(window.location.search);
const isSlideshow = params.get('slideshow') === '1';
// The quick-capture box is a second webview on the same bundle rather than a
// separate entry point: it needs the settings and workspace stores (theme,
// language, current folder) and gets them from the shared localStorage for
// free this way.
const isQuickCapture = params.get('quickCapture') === '1';

// Both alternate roots are chosen by a URL param that the main window never
// carries, so they are loaded on demand — keeping reveal.js and the capture
// box out of the entry chunk every normal launch has to compile.
const rootComponent = isSlideshow
  ? defineAsyncComponent(() => import('./components/Slideshow.vue'))
  : isQuickCapture
    ? defineAsyncComponent(() => import('./components/QuickCapture.vue'))
    : App;
// Dev-only: ?imetrace loads dev/ime-trace.js (IME event tracer for the
// Windows VM tests). Stripped from production builds by the DEV guard.
if (import.meta.env.DEV && /[?&]imetrace\b/.test(location.search)) {
  const s = document.createElement('script');
  s.src = '/dev/ime-trace.js';
  document.head.appendChild(s);
}

const app = createApp(rootComponent);
const pinia = createPinia();
app.use(pinia);

// The locale dictionaries are code-split — only English is bundled, the other
// 13 are chunks (they were ~1.1 MB inside the entry chunk before). Await the
// one in use before the first paint so a translated UI never flashes English;
// `t()` falls back to English for the few ms until the chunk lands.
const settings = useSettingsStore(pinia);

// Windows: the editor engine follows the WebView2 version (platform.ts
// resolveWindowsEditorEngine), and Editor.vue decides it once at load, so the
// version must be known before mount.
async function readWebviewVersion(): Promise<void> {
  if (!isWindowsDesktop()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  const v = await invoke<string | null>('webview_runtime_version');
  if (v) (window as unknown as { __SOLOMD_WEBVIEW_VERSION__?: string }).__SOLOMD_WEBVIEW_VERSION__ = v;
}

// iOS: point stored paths at the current app container before any store reads
// them (lib/ios-container). Windows: the WebView2 version has to be known
// before Editor.vue picks an engine. Both are bounded, and the locale chunk is
// awaited as well, so a slow API never blocks launch — an unknown WebView2
// version just means the native textarea.
void Promise.all([
  Promise.race([
    Promise.all([
      reanchorIosContainerPaths().catch(() => {}),
      readWebviewVersion().catch(() => {}),
    ]),
    new Promise((r) => setTimeout(r, 1500)),
  ]),
  loadLocale(isLang(settings.language) ? settings.language : 'en').catch(() => {}),
]).finally(() => {
  app.mount('#app');
});
