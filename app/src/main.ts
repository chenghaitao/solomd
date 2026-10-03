import { createApp, defineAsyncComponent } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { isLang, loadLocale } from './i18n';
import { useSettingsStore } from './stores/settings';
import { reanchorIosContainerPaths } from './lib/ios-container';
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
const app = createApp(rootComponent);
const pinia = createPinia();
app.use(pinia);

// The locale dictionaries are code-split — only English is bundled, the other
// 13 are chunks (they were ~1.1 MB inside the entry chunk before). Await the
// one in use before the first paint so a translated UI never flashes English;
// `t()` falls back to English for the few ms until the chunk lands.
const settings = useSettingsStore(pinia);

// iOS: point stored paths at the current app container before any store reads
// them (lib/ios-container). Bounded, so a slow path API never blocks launch.
void Promise.all([
  Promise.race([
    reanchorIosContainerPaths().catch(() => {}),
    new Promise((r) => setTimeout(r, 1500)),
  ]),
  loadLocale(isLang(settings.language) ? settings.language : 'en').catch(() => {}),
]).finally(() => {
  app.mount('#app');
});
