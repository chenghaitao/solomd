<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue';
import Icon from './Icons.vue';
import BrandMark from './BrandMark.vue';
import PomodoroPopover from './PomodoroPopover.vue';
import { useTabsStore } from '../stores/tabs';
import { useSettingsStore } from '../stores/settings';
import { useWorkspaceStore } from '../stores/workspace';
import { useTilesStore } from '../stores/tiles';
import { getPlainSelection } from '../lib/plain-selection';
import { useFiles } from '../composables/useFiles';
import { useViewport } from '../composables/useViewport';
import { shortcutLabel } from '../lib/keybindings';
import { itemShortcut, type MenuNode, type TopMenu } from '../lib/app-menu';
import { useAppMenu } from '../composables/useAppMenu';
import { useExport } from '../composables/useExport';
import { useToastsStore } from '../stores/toasts';
import { cleanAIArtifacts } from '../lib/clean-ai';
import { useI18n } from '../i18n';
import { openPath } from '@tauri-apps/plugin-opener';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { forceWinChromePreview, isIOS, isMacOS, isMobile, isWindowsDesktop } from '../lib/platform';
import { IS_APP_STORE_BUILD } from '../lib/app-build';
import { MERMAID_INSERT_SNIPPET } from '../lib/insert-snippet';
import { EditorView } from '@codemirror/view';

const { t } = useI18n();

defineEmits<{
  (e: 'open-palette'): void;
  (e: 'open-settings'): void;
  (e: 'open-help'): void;
  (e: 'open-search'): void;
}>();

const tabs = useTabsStore();
const settings = useSettingsStore();

// #168 — phone toolbar. The strip carries ~29 controls; on a phone only a
// handful are worth permanent space, but nothing may become unreachable, so
// the rest aren't removed — they're folded away until "more" expands the bar
// into a labelled sheet. Same buttons, same handlers, two presentations:
// duplicating them into a separate menu would be a second copy to keep in
// sync with every future toolbar change.
const { isNarrow } = useViewport();

// #180 — tooltips show the chord that works right now. The chord used to be
// baked into the translated string ("Open file (Ctrl+O)"), which turned every
// tooltip into a lie the moment a user rebound anything.
const macChord = isMacOS();
function tip(labelKey: string, actionId: string): string {
  const label = t(labelKey);
  const chord = shortcutLabel(actionId, settings.keybindings, macChord);
  return chord ? `${label} (${chord})` : label;
}
const sheetOpen = ref(false);
function toggleSheet(): void {
  sheetOpen.value = !sheetOpen.value;
}
// Collapse after any action — but only on a phone, where the sheet is tall,
// covers the document, and leaving it open after a click reads as "nothing
// happened".
//
// #282 — on a desktop window it must NOT collapse. The expanded strip there
// costs one extra row (36px measured at 1366), and auto-collapsing meant
// re-opening "⋯" before every single formatting action: "如果需要频繁的去
// 点击…按钮的话，也是挺消耗耐心的". The row behaves like a toolbar now,
// not like a menu: it
// stays until the "✕" that opened it is pressed again.
function onToolbarActivate(e: Event): void {
  if (!sheetOpen.value || !isNarrow.value) return;
  const el = e.target as HTMLElement | null;
  if (el?.closest('[data-phone-more]')) return;
  // A menu trigger: collapsing would move it out from under the menu it
  // just anchored. The menu's own items are teleported, outside this bar.
  if (el?.closest('[aria-haspopup]')) return;
  if (el?.closest('button, [role="menuitem"], a')) sheetOpen.value = false;
}

// #282 — "在显示器（分辨率)比较小的时候，顶部工具栏和菜单栏会显示不完全".
//
// The strip has scrolled horizontally since #134, so nothing was ever
// unreachable — but a silently clipped row still reads as broken, and you
// have to guess that it scrolls. So the same "more" control the phone layout
// uses (#168) now appears on ANY window where the bar overflows, and opens
// the same labelled sheet. Reusing that mechanism rather than building a
// desktop-only overflow dropdown avoids the trap that killed the obvious
// design: the strip's dropdown triggers anchor their teleported menus to
// their own rect, so a button moved into an overflow menu — or scrolled off
// screen — opens its menu somewhere the user isn't looking.
const barOverflows = ref(false);
function measureOverflow(): void {
  const el = toolbarRef.value;
  // While the sheet is open the bar wraps, so it never "overflows" — measuring
  // then would hide the very button that closes it.
  if (!el || sheetOpen.value) return;
  // A scroll container reports scrollWidth === clientWidth whenever the
  // content fits, so this one comparison is the whole test — an earlier
  // attempt to add an explicit hysteresis band (`scrollWidth + 48 <=
  // clientWidth`) could never be true and the button, once shown, never went
  // away again. The hysteresis is already implicit and self-limiting: the
  // button's own ~40px counts toward the overflow that keeps it on screen, so
  // there's a 40px band where it lingers after the bar would fit without it,
  // and removing it only ever frees space — it cannot oscillate.
  barOverflows.value = el.scrollWidth > el.clientWidth + 1;
}
// bug/C2 — the desktop strip leaves Save As, Open externally, Focus,
// Typewriter, Spell check, CJK proofread, Help, Settings and the theme switch
// to the menu bar (plus the palette and their shortcuts). iOS and Android have
// no menu bar and an iPhone no keyboard, so there those buttons stay, folded
// into the "⋯" sheet. `?forceNoMenubar` previews that in a desktop dev build.
const noMenuBar =
  isMobile() ||
  (import.meta.env.DEV && typeof location !== 'undefined' && location.search.includes('forceNoMenubar'));
/** The phone layout always offers it; so does a build with no menu bar (the
 *  sheet is where its extra buttons live); wider windows only when needed. */
const showMore = computed(() => isNarrow.value || noMenuBar || barOverflows.value);
const workspace = useWorkspaceStore();
const tiles = useTilesStore();
const files = useFiles();
const exporter = useExport();
const toasts = useToastsStore();

const isMarkdown = computed(() => tabs.activeTab?.language === 'markdown');

// v4.6 unified title bar (macOS only). With `titleBarStyle: "Overlay"` in
// tauri.conf, the red/yellow/green traffic lights float over the top-left of
// our toolbar instead of sitting in a separate native title bar above it —
// one combined bar (Tolaria-style). We reserve ~72px on the left for them and
// make the bar background draggable. Windows / Linux keep native decorations
// and get neither the pad nor the drag region. Computed once at module init
// (platform doesn't change at runtime).
// The `?forceWinChrome` dev preview drops the macOS 72px traffic-light
// reserve: a real Windows window never has both, and with both the preview
// measured ~60px wider than the Windows bar it is meant to reproduce.
const macTitleBar = isMacOS() && !(import.meta.env.DEV && forceWinChromePreview());

// Windows unified title bar. The Windows build is frameless (`decorations:
// false` in tauri.windows.conf.json), so the toolbar row also hosts the
// File/Edit/View/Help menubar (replacing the removed native menu bar) and the
// min/max/close caption buttons. `?forceWinChrome` previews the layout in the
// macOS dev build (window keeps its own chrome there; caption buttons no-op).
const hasTauriShell = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const winTitleBar =
  (isWindowsDesktop() && hasTauriShell) || (import.meta.env.DEV && forceWinChromePreview());
const customTitleBar = macTitleBar || winTitleBar;

// #127 — drag the window by the title bar. The declarative
// `data-tauri-drag-region` attribute proved unreliable on macOS once the
// unified title bar shipped (the empty spacer carried the attr yet the window
// would not move). Drive the OS drag explicitly via `startDragging()` on
// mousedown over any non-interactive region of the bar, and replicate the
// native double-click-to-zoom. Listener is in the capture phase so it fires
// before any child stops propagation, and only runs inside the Tauri shell.
// The same path serves the frameless Windows build (startDragging sends
// WM_NCLBUTTONDOWN/HTCAPTION under the hood, so Aero-snap drag works).
function isInteractiveTitleBarTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  return !!node?.closest?.(
    'button, input, select, textarea, a, [contenteditable="true"], .dropdown__menu, [data-no-drag]',
  );
}
function onTitleBarMouseDown(e: MouseEvent) {
  if (!customTitleBar || e.button !== 0 || e.detail > 1) return;
  if (isInteractiveTitleBarTarget(e.target)) return;
  if (!('__TAURI_INTERNALS__' in window)) return;
  void getCurrentWindow().startDragging();
}
function onTitleBarDblClick(e: MouseEvent) {
  if (!customTitleBar) return;
  if (isInteractiveTitleBarTarget(e.target)) return;
  if (!('__TAURI_INTERNALS__' in window)) return;
  void getCurrentWindow().toggleMaximize();
}

// #134 — when the bar overflows on a narrow window, let a plain mouse wheel
// scroll it horizontally so the clipped buttons stay reachable (trackpads
// already emit horizontal deltas natively). Leave Ctrl/Cmd+wheel alone — that
// is the app-wide zoom gesture handled in App.vue.
function onToolbarWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey || e.deltaY === 0) return;
  const el = e.currentTarget as HTMLElement;
  if (el.scrollWidth <= el.clientWidth) return;
  el.scrollLeft += e.deltaY;
  e.preventDefault();
}

/**
 * v2.5 F6 — open the CJK proofread panel. App.vue listens for this
 * event (same pattern as `solomd:open-help` / `solomd:open-settings`).
 */
function onOpenCjkProofread() {
  window.dispatchEvent(new CustomEvent('solomd:open-cjk-proofread'));
}

function onCleanAI() {
  const t = tabs.activeTab;
  if (!t) {
    toasts.warning('No active document');
    return;
  }
  const cleaned = cleanAIArtifacts(t.content);
  if (cleaned === t.content) {
    toasts.info('No AI artifacts found');
    return;
  }
  tabs.setContent(t.id, cleaned);
  toasts.success('AI artifacts cleaned');
}

/**
 * Toolbar entry for v2.0 F4. Mirrors the Cmd+J keyboard binding —
 * builders the same `solomd:ai-rewrite-open` event off the active editor's
 * selection so both routes funnel into AIRewriteOverlay.
 */
function onAIRewrite() {
  const t = tabs.activeTab;
  if (!t) {
    toasts.warning('No active document');
    return;
  }
  if (!settings.aiEnabled) {
    toasts.info(t === undefined ? '' : 'Enable AI rewrite in Settings first (⌘,)');
    // AI settings live under the `integrations` category in
    // SettingsPanel; pass section via event detail so the panel jumps
    // there directly instead of opening at the default `basics` tab.
    window.dispatchEvent(
      new CustomEvent('solomd:open-settings', { detail: { section: 'integrations' } }),
    );
    return;
  }
  // Read selection from the focused CodeMirror view. We REFUSE to fall back
  // to the whole document — silently translating the entire file is almost
  // never what the user wants, and the overlay's accept path replaces using
  // the editor's current selection anyway, so a "whole doc" toolbar fire
  // would either replace the whole doc on accept (data loss surprise) or
  // splice the translation at the cursor (also surprising). Force explicit
  // selection.
  //
  // #95 fix: don't require .cm-focused. The user's complaint was that
  // after closing the rewrite overlay and clicking the toolbar button
  // again, "Select some text first" fired even though the selection
  // box was clearly still visible. The overlay's close path returns
  // focus to the editor on the next tick, so by the time the button
  // click event reaches this handler the .cm-focused class is briefly
  // absent — but the DOM Selection is unchanged. Accept any .cm-editor
  // on the page; the selection check below is what matters.
  // Read the selection from CodeMirror's state — NOT window.getSelection().
  // On Windows WebView2 the DOM Selection comes back empty for the CM editor
  // (its drawSelection-managed selection isn't exposed via getSelection), so
  // the old read made AI rewrite wrongly report "Select some text first" even
  // with text selected. CM state is the source of truth and matches the ⌘J
  // path (cm-ai-rewrite.ts dispatchOpen). Also lets us pass the real from/to
  // instead of 0/0.
  const editors = [
    document.querySelector<HTMLElement>('.cm-editor.cm-focused'),
    ...Array.from(document.querySelectorAll<HTMLElement>('.cm-editor')),
  ].filter((e): e is HTMLElement => e != null);
  let picked: { selection: string; from: number; to: number } | null = null;
  for (const el of editors) {
    const view = EditorView.findFromDOM(el);
    if (!view) continue;
    const main = view.state.selection.main;
    if (main.empty) continue;
    const text = view.state.sliceDoc(main.from, main.to);
    if (text.trim()) {
      picked = { selection: text, from: main.from, to: main.to };
      break;
    }
  }
  // #126 — Windows has NO CodeMirror view since the 4.6.4 plain-editor swap,
  // so the scan above finds nothing there; ask the plain editor's selection
  // registry before giving up (textareas keep selectionStart/End on blur).
  if (!picked) {
    picked = getPlainSelection();
  }
  if (!picked) {
    const jChord = shortcutLabel('editor.aiRewrite', settings.keybindings, isMacOS()) || '—';
    toasts.info(`Select some text first, then click AI rewrite (or press ${jChord}).`);
    return;
  }
  window.dispatchEvent(
    new CustomEvent('solomd:ai-rewrite-open', { detail: picked }),
  );
}

async function onOpenExternal() {
  const path = tabs.activeTab?.filePath;
  if (!path) {
    toasts.warning(t('toast.openExternalNoFile'));
    return;
  }
  // iOS: tauri-plugin-opener calls UIApplication.shared.open(URL:) which
  // doesn't handle `file://` URLs, so a deep-linked Files-app source never
  // opens. Route through the Web Share API
  // instead — iOS 15+ WKWebView surfaces the standard iOS share sheet
  // (AirDrop / Messages / Mail / Files / iCloud) for File payloads.
  if (isIOS()) {
    const tab = tabs.activeTab;
    const fileName = path.split(/[\\/]/).pop() ?? 'note.md';
    const content = tab?.content ?? '';
    try {
      if (navigator.share && typeof File === 'function') {
        const mime = fileName.endsWith('.md') || fileName.endsWith('.markdown')
          ? 'text/markdown'
          : 'text/plain';
        const file = new File([content], fileName, { type: mime });
        const data: ShareData = { title: fileName, files: [file] };
        // Must call `canShare` as a method on `navigator` — destructuring
        // the reference drops `this`, and WebKit throws:
        //   "Can only call Navigator.canShare on instances of Navigator".
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        if (!nav.canShare || nav.canShare(data)) {
          await navigator.share(data);
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({ title: fileName, text: content });
        return;
      }
    } catch (e) {
      // AbortError = user cancelled the share sheet; not an error.
      const name = (e as { name?: string }).name;
      if (name === 'AbortError') return;
      toasts.warning(`Share failed: ${e}`);
      return;
    }
    toasts.info('Sharing not supported on this iOS version');
    return;
  }
  try {
    await openPath(path);
  } catch (e) {
    toasts.warning(`Failed: ${e}`);
  }
}

const openOpen = ref(false);
const exportOpen = ref(false);
const newOpen = ref(false);
const insertOpen = ref(false);
const aiOpen = ref(false);
const viewOpen = ref(false);
const pomoOpen = ref(false);

const newBtnRef = ref<HTMLElement | null>(null);
const openBtnRef = ref<HTMLElement | null>(null);
const exportBtnRef = ref<HTMLElement | null>(null);
const insertBtnRef = ref<HTMLElement | null>(null);
const aiBtnRef = ref<HTMLElement | null>(null);
const viewBtnRef = ref<HTMLElement | null>(null);

/** AI rewrite exists in this build and is switched on — otherwise the AI
 *  control is just "clean AI artifacts" (see the template). */
const aiRewriteAvailable = computed(() => !IS_APP_STORE_BUILD && settings.aiEnabled);

type ViewModeId = 'edit' | 'split' | 'liveEdit' | 'preview' | 'reading';
// Names follow the menu plan (bug/C1 视图 › 视图模式): 源码 / 分栏 / 实时编辑 /
// 预览模式 / 阅读模式. Only Reading has a direct chord of its own.
const viewModes: Array<{ mode: ViewModeId; icon: string; label: string; action?: string }> = [
  { mode: 'edit', icon: 'view-edit', label: 'toolbar.viewSource' },
  { mode: 'split', icon: 'view-split', label: 'toolbar.viewSplit' },
  { mode: 'liveEdit', icon: 'view-live', label: 'toolbar.viewLive' },
  { mode: 'preview', icon: 'view-preview', label: 'toolbar.viewPreview' },
  { mode: 'reading', icon: 'view-reading', label: 'toolbar.viewReading', action: 'view.toggleReading' },
];
const currentView = computed(() => viewModes.find((m) => m.mode === settings.viewMode) ?? viewModes[0]);
const currentViewIcon = computed(() => currentView.value.icon);
const currentViewLabel = computed(() => t(currentView.value.label));
// The two toggles that used to sit beside the five mode buttons, shown in the
// same modes they were shown in then.
const showLivePreviewToggle = computed(
  () => settings.viewMode !== 'preview' && settings.viewMode !== 'liveEdit' && settings.viewMode !== 'reading',
);
const showFitWidthToggle = computed(
  () => settings.viewMode === 'split' || settings.viewMode === 'preview' || settings.viewMode === 'reading',
);
function pickViewMode(mode: ViewModeId) {
  viewOpen.value = false;
  settings.setViewMode(mode);
}
function toggleLivePreviewFromMenu() {
  viewOpen.value = false;
  settings.toggleLivePreview();
}

const formatItems: Array<{ kind: string; label: string; action: string }> = [
  'bold', 'italic', 'strike', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'task',
].map((kind) => ({ kind, label: `cmd.fmt.${kind}`, action: `fmt.${kind}` }));
const menuPos = ref<{ top: number; left?: number; right?: number } | null>(null);
const floatStyle = computed<Record<string, string | number> | undefined>(() => {
  if (!menuPos.value) return undefined;
  const s: Record<string, string | number> = {
    position: 'fixed',
    top: `${menuPos.value.top}px`,
    zIndex: 1000,
    // #320 — as tall as the window allows, not a fixed 360px: the View menu
    // is ~19 rows and scrolled even on a 1080p screen, turning "click, move,
    // click" into "click, scroll, move, click". It still scrolls when the
    // window really is too short.
    maxHeight: `calc(100vh - ${menuPos.value.top}px - 8px)`,
    // Never wider than the window (see keepMenuOnScreen).
    maxWidth: 'calc(100vw - 16px)',
  };
  if (menuPos.value.left !== undefined) s.left = `${menuPos.value.left}px`;
  // `.dropdown__menu` carries `left: 0` from its stylesheet; a right-anchored
  // menu must clear it or it stretches across the whole window.
  if (menuPos.value.right !== undefined) { s.right = `${menuPos.value.right}px`; s.left = 'auto'; }
  return s;
});
function positionMenuFromButton(btn: HTMLElement | null, align: 'left' | 'right' = 'left') {
  if (!btn) { menuPos.value = null; return; }
  const rect = btn.getBoundingClientRect();
  if (align === 'right') {
    menuPos.value = { top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) };
  } else {
    menuPos.value = { top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 16) };
  }
}
/**
 * The menu is anchored to its button, so a wide menu under a button near the
 * edge of a narrow window ran off the screen: on a phone with a large display
 * size the View menu's ✓ marks and icons were cut off on the left. Once it has
 * rendered, measure it and pin it to whichever edge it crossed (watcher
 * below, after the open-flag and anchor changes have reached the DOM).
 */
function keepMenuOnScreen() {
  const pos = menuPos.value;
  const el = document.querySelector<HTMLElement>('.dropdown__menu[data-tb-menu], .menubar__menu');
  if (!pos || !el) return;
  const r = el.getBoundingClientRect();
  const margin = 8;
  if (r.left < margin) menuPos.value = { top: pos.top, left: margin };
  else if (r.right > window.innerWidth - margin) menuPos.value = { top: pos.top, right: margin };
}

// Pomodoro popover, opened from the palette. Anchored under the right end of
// the bar (the popover itself is `position:absolute; left:0` in its anchor).
const pomoAnchorStyle = ref<Record<string, string | number>>({});
function openPomodoro() {
  closeAllDropdowns();
  const r = toolbarRef.value?.getBoundingClientRect();
  const top = r && r.height > 0 ? r.bottom + 4 : 44;
  pomoAnchorStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    right: '12px',
    width: '260px',
    height: '0',
    zIndex: 1000,
  };
  pomoOpen.value = true;
}

/** #296 — formatting from the Insert menu runs the same toggle the shortcut
 *  does, so it wraps the selection instead of dropping a template beside it. */
function dispatchFormat(kind: string) {
  window.dispatchEvent(new CustomEvent('solomd:format-markdown', { detail: { kind } }));
  insertOpen.value = false;
}
function chord(actionId: string): string {
  return shortcutLabel(actionId, settings.keybindings, macChord) || '';
}

function dispatchInsert(snippet: string) {
  window.dispatchEvent(
    new CustomEvent('solomd:insert-markdown', {
      detail: { snippet, paneId: tiles.focusedPaneId },
    })
  );
  insertOpen.value = false;
}

async function pickAndInsertImage() {
  insertOpen.value = false;
  const sel = await openFileDialog({
    multiple: false,
    defaultPath: await files.filePickerStartDir(),
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'tiff'] },
    ],
  });
  if (typeof sel !== 'string') return;
  window.dispatchEvent(
    new CustomEvent('solomd:insert-image-path', {
      detail: { path: sel, paneId: tiles.focusedPaneId },
    }),
  );
}

// Insert an image by external URL (网络图片) — opens the dialog mounted in App.vue.
function openImageUrlDialog() {
  insertOpen.value = false;
  window.dispatchEvent(new CustomEvent('solomd:open-image-url-dialog'));
}

function shortPath(p: string) {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

// Close any open dropdown when user clicks outside.
// More reliable than @blur which doesn't fire consistently across browsers.
function closeAllDropdowns() {
  newOpen.value = false;
  openOpen.value = false;
  exportOpen.value = false;
  insertOpen.value = false;
  aiOpen.value = false;
  viewOpen.value = false;
  pomoOpen.value = false;
  menubarOpen.value = null;
}

// ── Windows unified title bar: in-app menubar ────────────────────────────────
// Replaces the native Windows menu bar (removed together with the window
// decorations). bug/C1: the tree is lib/app-menu.ts — the same one runner.rs
// builds the native macOS / Linux menu from — so the two menu bars show the
// same seven menus, and every chord is the binding in effect right now.
// App.vue's `dispatchMenuAction` runs the ids for both. Rendered only when
// `winTitleBar`.
const appMenu = useAppMenu();
const menubarTree = computed<TopMenu[]>(() => appMenu.menuFor('windows'));
type MenubarName = string;
const menubarOpen = ref<MenubarName | null>(null);
function toggleMenubar(name: MenubarName, e: MouseEvent) {
  const wasOpen = menubarOpen.value === name;
  closeAllDropdowns();
  if (wasOpen) return;
  positionMenuFromButton(e.currentTarget as HTMLElement);
  menubarOpen.value = name;
}
// Native menubar behavior: once a menu is open, hovering a sibling switches.
function menubarHover(name: MenubarName, e: MouseEvent) {
  if (menubarOpen.value && menubarOpen.value !== name) {
    positionMenuFromButton(e.currentTarget as HTMLElement);
    menubarOpen.value = name;
  }
}
function menuAction(node: MenuNode) {
  if (node.type !== 'item' || node.enabled === false) return;
  menubarOpen.value = null;
  // Same dispatch surface the native menus use (App.vue listens for both this
  // DOM event and the Tauri `solomd://menu` event).
  window.dispatchEvent(new CustomEvent('solomd:menu-action', { detail: node.id }));
}
/** The chord shown beside an item — read at render time from the bindings. */
function menuShortcut(node: MenuNode): string {
  return node.type === 'item' ? itemShortcut(node, { overrides: settings.keybindings, macKeys: macChord }) : '';
}
const menubarItems = computed<MenuNode[]>(
  () => menubarTree.value.find((m) => m.id === menubarOpen.value)?.items ?? [],
);

// The open submenu, placed beside its row. A separate fixed layer rather than
// a child of the menu: the menu scrolls (max-height), which would clip it.
const menubarSub = ref<{ key: string; top: number; left: number } | null>(null);
const SUBMENU_WIDTH = 240;
function openMenubarSub(key: string, e: MouseEvent) {
  cancelMenubarSubClose();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  // Open to the right; flip left when the window has no room there.
  const left = r.right + SUBMENU_WIDTH > window.innerWidth - 8 ? r.left - SUBMENU_WIDTH : r.right - 2;
  menubarSub.value = { key, top: r.top - 4, left: Math.max(8, left) };
  // Like a native menu: a submenu that would run off the bottom of the window
  // slides up until it fits (it only scrolls when taller than the window).
  void nextTick(() => {
    const el = menubarSubEl.value;
    const sub = menubarSub.value;
    if (!el || !sub || sub.key !== key) return;
    const fitTop = Math.max(8, window.innerHeight - 8 - el.scrollHeight);
    if (fitTop < sub.top) menubarSub.value = { ...sub, top: fitTop };
  });
}
const menubarSubEl = ref<HTMLElement | null>(null);
// Moving diagonally from the row to the submenu crosses the rows below it;
// closing on the first of those would make the submenu impossible to reach.
let menubarSubTimer = 0;
function closeMenubarSubSoon() {
  if (!menubarSub.value || menubarSubTimer) return;
  menubarSubTimer = window.setTimeout(() => {
    menubarSubTimer = 0;
    menubarSub.value = null;
  }, 300);
}
function cancelMenubarSubClose() {
  clearTimeout(menubarSubTimer);
  menubarSubTimer = 0;
}
const menubarSubItems = computed<MenuNode[] | null>(() => {
  const sub = menubarSub.value;
  if (!sub || !menubarOpen.value) return null;
  const entry = menubarItems.value.find((e) => e.type === 'submenu' && e.id === sub.key);
  return entry && entry.type === 'submenu' ? entry.items : null;
});
const menubarSubStyle = computed(() => {
  const sub = menubarSub.value;
  if (!sub) return undefined;
  return {
    position: 'fixed' as const,
    top: `${sub.top}px`,
    left: `${sub.left}px`,
    minWidth: `${SUBMENU_WIDTH}px`,
    zIndex: 1001,
    maxHeight: `calc(100vh - ${sub.top}px - 8px)`,
  };
});
watch(menubarOpen, () => {
  cancelMenubarSubClose();
  menubarSub.value = null;
});

// Root element — used by onScrollAnywhere to tell "a scroll that moves the
// menu anchors" (toolbar's own overflow scroll) from pane scrolls.
const toolbarRef = ref<HTMLElement | null>(null);
let barResizeObserver: ResizeObserver | null = null;
// Startup cost: reading scrollWidth during mount forced a synchronous layout
// of the whole freshly-built app (the single biggest item in a startup
// profile — ~65% of app.mount() on a cold load), and every store-driven
// re-render during startup forced another one. Neither read has to happen
// synchronously:
//  - ResizeObserver delivers an initial notification for every observed
//    element right after the first layout and before that frame paints, so
//    the first measurement reads an already-computed layout for free and a
//    resulting "⋯" still lands in the first painted frame.
//  - Content updates are coalesced into one read per animation frame (rAF
//    runs before that frame's layout/paint, so the read costs the layout the
//    frame was going to do anyway, and the result is painted in the same
//    frame).
let measureRaf = 0;
function scheduleMeasureOverflow(): void {
  if (measureRaf) return;
  measureRaf = requestAnimationFrame(() => {
    measureRaf = 0;
    measureOverflow();
  });
}
onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !toolbarRef.value) {
    scheduleMeasureOverflow();
    return;
  }
  barResizeObserver = new ResizeObserver(() => measureOverflow());
  barResizeObserver.observe(toolbarRef.value);
});
onBeforeUnmount(() => {
  barResizeObserver?.disconnect();
  barResizeObserver = null;
  if (measureRaf) cancelAnimationFrame(measureRaf);
  measureRaf = 0;
});
// The bar's *contents* change too — a markdown tab adds two groups, a locale
// switch re-widths every label. ResizeObserver never fires for those, because
// the strip scrolls instead of growing.
onUpdated(() => scheduleMeasureOverflow());

// ── Windows caption buttons (min / max / close) ─────────────────────────────
const isMaximized = ref(false);
const maxBtnHover = ref(false);
const maxBtnRef = ref<HTMLElement | null>(null);
let unlistenWinChrome: UnlistenFn[] = [];
function winMinimize() {
  if (hasTauriShell) void getCurrentWindow().minimize();
}
function winToggleMax() {
  // Fallback path only: on the real Windows main window the Rust subclass
  // claims this button as HTMAXBUTTON, so clicks never reach the DOM (Windows
  // maximizes natively and shows Snap Layouts on hover). This handler covers
  // auxiliary windows and the dev preview.
  if (hasTauriShell) void getCurrentWindow().toggleMaximize();
}
function winClose() {
  // Routes through Tauri's close-requested flow → unsaved-tabs confirm.
  if (hasTauriShell) void getCurrentWindow().close();
}
async function refreshMaximized() {
  if (!hasTauriShell) return;
  try {
    isMaximized.value = await getCurrentWindow().isMaximized();
  } catch {
    /* not fatal */
  }
}
// Report the maximize button's rect so the Rust WM_NCHITTEST subclass can
// answer HTMAXBUTTON there (Snap Layouts). Main window only; CSS px + the
// devicePixelRatio (which folds in webview zoom) → physical px in Rust.
let rectRaf = 0;
function reportMaxBtnRect() {
  if (!winTitleBar || !hasTauriShell || !isWindowsDesktop()) return;
  if (getCurrentWindow().label !== 'main') return;
  cancelAnimationFrame(rectRaf);
  rectRaf = requestAnimationFrame(() => {
    const scale = window.devicePixelRatio || 1;
    const r = maxBtnRef.value?.getBoundingClientRect();
    void invoke('set_max_button_rect', r && r.width > 0
      ? { x: r.left, y: r.top, w: r.width, h: r.height, scale }
      : { x: 0, y: 0, w: 0, h: 0, scale });
  });
}
onMounted(async () => {
  if (!winTitleBar || !hasTauriShell) return;
  await refreshMaximized();
  reportMaxBtnRect();
  window.addEventListener('resize', reportMaxBtnRect);
  try {
    unlistenWinChrome.push(
      await getCurrentWindow().onResized(() => {
        void refreshMaximized();
        reportMaxBtnRect();
      }),
    );
    unlistenWinChrome.push(
      await listen<boolean>('solomd://maxbtn-hover', (e) => {
        maxBtnHover.value = !!e.payload;
      }),
    );
  } catch {
    /* browser dev preview — no Tauri events */
  }
});
onBeforeUnmount(() => {
  if (!winTitleBar) return;
  window.removeEventListener('resize', reportMaxBtnRect);
  for (const un of unlistenWinChrome) un();
  unlistenWinChrome = [];
  if (hasTauriShell && isWindowsDesktop()) {
    void invoke('set_max_button_rect', { x: 0, y: 0, w: 0, h: 0, scale: 1 });
  }
});
// Exclusive open: opening one dropdown closes others.
type DropdownName = 'new' | 'open' | 'export' | 'insert' | 'ai' | 'view';
const dropdowns: Record<DropdownName, { open: typeof newOpen; btn: typeof newBtnRef; align: 'left' | 'right' }> = {
  new: { open: newOpen, btn: newBtnRef, align: 'left' },
  open: { open: openOpen, btn: openBtnRef, align: 'left' },
  export: { open: exportOpen, btn: exportBtnRef, align: 'left' },
  insert: { open: insertOpen, btn: insertBtnRef, align: 'left' },
  ai: { open: aiOpen, btn: aiBtnRef, align: 'left' },
  // The view menu's trigger sits at the right end of the bar.
  view: { open: viewOpen, btn: viewBtnRef, align: 'right' },
};
/** The trigger of the menu that is open now, so Escape can hand focus back. */
let lastTrigger: HTMLElement | null = null;
function toggleDropdown(name: DropdownName, e?: MouseEvent) {
  const d = dropdowns[name];
  const wasOpen = d.open.value;
  closeAllDropdowns();
  if (wasOpen) return;
  positionMenuFromButton(d.btn.value, d.align);
  d.open.value = true;
  lastTrigger = d.btn.value;
  // `detail === 0` — the click came from Enter/Space on the focused trigger,
  // not a mouse: move focus into the menu so the arrow keys work.
  if (e && e.detail === 0) void focusMenuItem('first');
}
function openByKey(name: DropdownName) {
  if (!dropdowns[name].open.value) toggleDropdown(name);
  void focusMenuItem('first');
}
const anyToolbarMenuOpen = computed(
  () => newOpen.value || openOpen.value || exportOpen.value || insertOpen.value || aiOpen.value || viewOpen.value,
);
watch(
  () => [menuPos.value, anyToolbarMenuOpen.value, menubarOpen.value],
  () => {
    if (anyToolbarMenuOpen.value || menubarOpen.value) keepMenuOnScreen();
  },
  { flush: 'post' },
);

// ── Keyboard access for the toolbar menus ────────────────────────────────────
// Items act on `mousedown.prevent` so a mouse click never steals focus (and
// the selection) from the editor — Insert and AI rewrite depend on it. The
// keyboard path reuses that exact handler by synthesising the mousedown, so
// there is one action per item, not a click and a mousedown to keep in step.
const MENU_ITEM_SEL = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';
async function focusMenuItem(which: 'first' | 'last') {
  await nextTick();
  const menu = document.querySelector<HTMLElement>('.dropdown__menu[data-tb-menu]');
  const items = Array.from(menu?.querySelectorAll<HTMLElement>(MENU_ITEM_SEL) ?? []);
  const el = which === 'first' ? items[0] : items[items.length - 1];
  el?.focus();
}
function onMenuKeydown(e: KeyboardEvent) {
  const menu = e.currentTarget as HTMLElement;
  const items = Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM_SEL));
  if (!items.length) return;
  const idx = items.indexOf(document.activeElement as HTMLElement);
  const move = (i: number) => items[(i + items.length) % items.length].focus();
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); move(idx < 0 ? 0 : idx + 1); break;
    case 'ArrowUp': e.preventDefault(); move(idx < 0 ? items.length - 1 : idx - 1); break;
    case 'Home': e.preventDefault(); move(0); break;
    case 'End': e.preventDefault(); move(items.length - 1); break;
    case 'Enter':
    case ' ': {
      if (idx < 0) return;
      e.preventDefault();
      const trigger = lastTrigger;
      items[idx].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      // An action that opened a dialog took focus itself; otherwise don't
      // strand focus on <body> where the removed menu was.
      void nextTick(() => {
        if (!document.activeElement || document.activeElement === document.body) trigger?.focus();
      });
      break;
    }
    case 'Tab':
      closeAllDropdowns();
      break;
  }
}
// Escape closes whichever toolbar menu is open and returns focus to its
// trigger. Capture phase, so the editor or a global handler doesn't also act
// on an Escape that was only meant to dismiss the menu.
function onEscapeKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (!anyToolbarMenuOpen.value && !menubarOpen.value) return;
  e.preventDefault();
  e.stopPropagation();
  const trigger = anyToolbarMenuOpen.value ? lastTrigger : null;
  closeAllDropdowns();
  trigger?.focus();
}
function onOpenPomodoroEvent() {
  openPomodoro();
}
function onDocClick(e: MouseEvent) {
  // Menus are teleported to <body>, so `.closest('.dropdown')` from a menu
  // item won't reach the original `.dropdown` wrapper — also check for the
  // menu's own marker class.
  const target = e.target as HTMLElement | null;
  if (target && (target.closest('.dropdown') || target.closest('.dropdown__menu'))) return;
  closeAllDropdowns();
}
function onViewportChange() {
  // Teleported menus position from the button's getBoundingClientRect at
  // open time; on resize / scroll those coords go stale.
  closeAllDropdowns();
}
function onScrollAnywhere(e: Event) {
  // #221(3) — only a scroll that can actually move the anchor buttons (the
  // toolbar's own horizontal overflow scroll (#134), or a document-level
  // scroll) invalidates the teleported menu's position. The capture-phase
  // listener also sees editor/preview pane scrolls, and wheel-scrolling under
  // an open View menu was closing it — native menus don't do that.
  const t = e.target as Node | null;
  if (t && t !== document && toolbarRef.value && !toolbarRef.value.contains(t)) return;
  closeAllDropdowns();
}
onMounted(() => {
  document.addEventListener('click', onDocClick, true);
  document.addEventListener('keydown', onEscapeKey, true);
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onScrollAnywhere, true);
  window.addEventListener('solomd:open-pomodoro', onOpenPomodoroEvent);
  window.addEventListener('solomd:toolbar-ai-rewrite', onAIRewrite);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick, true);
  document.removeEventListener('keydown', onEscapeKey, true);
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onScrollAnywhere, true);
  window.removeEventListener('solomd:open-pomodoro', onOpenPomodoroEvent);
  window.removeEventListener('solomd:toolbar-ai-rewrite', onAIRewrite);
});
</script>

<template>
  <div
    ref="toolbarRef"
    class="toolbar"
    :class="{
      'toolbar--mac': macTitleBar,
      'toolbar--win': winTitleBar,
      'toolbar--phone-open': isNarrow && sheetOpen,
      'toolbar--sheet': sheetOpen,
      // #346 — keyboard users can drop the buttons. Ignored on a phone:
      // with no keyboard, the ⋯ sheet is the only way back to Settings.
      'toolbar--minimal': settings.toolbarHidden && !isNarrow,
      'toolbar--gone': settings.toolbarHidden && !isNarrow && !macTitleBar && !winTitleBar,
    }"
    @mousedown.capture="onTitleBarMouseDown"
    @dblclick="onTitleBarDblClick"
    @wheel="onToolbarWheel"
    @click="onToolbarActivate"
  >
    <BrandMark class="toolbar__brand" :size="22" />

    <!-- Windows unified title bar: in-app File/Edit/View/Help menubar
         (replaces the removed native menu bar row). -->
    <nav v-if="winTitleBar" class="menubar" data-no-drag>
      <button
        v-for="m in menubarTree"
        :key="m.id"
        class="menubar__btn"
        :class="{ active: menubarOpen === m.id }"
        :data-menu="m.id"
        @click="toggleMenubar(m.id, $event)"
        @mouseenter="menubarHover(m.id, $event)"
      >{{ m.label }}</button>
      <Teleport to="body">
        <div v-if="menubarOpen" class="dropdown__menu menubar__menu" :data-menu-open="menubarOpen" :style="floatStyle">
          <template v-for="(entry, i) in menubarItems" :key="i">
            <div v-if="entry.type === 'sep'" class="dropdown__sep"></div>
            <button
              v-else-if="entry.type === 'submenu'"
              class="dropdown__item dropdown__item--single dropdown__item--sub"
              :class="{ active: menubarSub?.key === entry.id }"
              :data-sub="entry.id"
              @mouseenter="openMenubarSub(entry.id, $event)"
              @mousedown.prevent="openMenubarSub(entry.id, $event)"
            >
              <span class="dropdown__check"></span>
              <span class="dropdown__name">{{ entry.label }}</span>
              <span class="dropdown__shortcut">›</span>
            </button>
            <button
              v-else-if="entry.type === 'item'"
              class="dropdown__item dropdown__item--single"
              :class="{ 'dropdown__item--disabled': entry.enabled === false }"
              :data-id="entry.id"
              :disabled="entry.enabled === false"
              @mouseenter="closeMenubarSubSoon"
              @mousedown.prevent="menuAction(entry)"
            >
              <span class="dropdown__check">{{ entry.checked ? '✓' : '' }}</span>
              <span class="dropdown__name">{{ entry.label }}</span>
              <span v-if="menuShortcut(entry)" class="dropdown__shortcut">{{ menuShortcut(entry) }}</span>
            </button>
          </template>
        </div>
        <div
          v-if="menubarOpen && menubarSubItems"
          ref="menubarSubEl"
          class="dropdown__menu dropdown__menu--sub"
          :style="menubarSubStyle"
          @mouseenter="cancelMenubarSubClose"
        >
          <template v-for="(entry, i) in menubarSubItems" :key="i">
            <div v-if="entry.type === 'sep'" class="dropdown__sep"></div>
            <button
              v-else-if="entry.type === 'item'"
              class="dropdown__item dropdown__item--single"
              :class="{ 'dropdown__item--disabled': entry.enabled === false }"
              :data-id="entry.id"
              :disabled="entry.enabled === false"
              @mousedown.prevent="menuAction(entry)"
            >
              <span class="dropdown__check">{{ entry.checked ? '✓' : '' }}</span>
              <span class="dropdown__name">{{ entry.label }}</span>
              <span v-if="menuShortcut(entry)" class="dropdown__shortcut">{{ menuShortcut(entry) }}</span>
            </button>
          </template>
        </div>
      </Teleport>
    </nav>

    <span
      v-if="tabs.activeTab?.fileName"
      class="toolbar__title"
      :title="tabs.activeTab?.filePath || tabs.activeTab?.fileName"
    >{{ tabs.activeTab.fileName }}</span>

    <!-- bug/C2 — one row, ~11 controls:
         [New▾] [Open▾] [Save] [Export▾] | [Insert▾] [AI▾] | [Search] [Palette]  …  [View mode▾] [File tree] [Right sidebar]
         Everything that left the strip lives in the menu bar, the command
         palette and its shortcut; on iOS/Android (no menu bar) it stays in
         the "⋯" sheet below — see `noMenuBar`. -->
    <div class="toolbar__group">
      <div class="dropdown">
        <button
          ref="newBtnRef"
          class="icon-btn"
          aria-haspopup="menu"
          :aria-expanded="newOpen"
          @click="toggleDropdown('new', $event)"
          @keydown.down.prevent="openByKey('new')"
          :title="tip('toolbar.newFile', 'file.new')"
        >
          <Icon name="new" />
          <Icon name="chevron-down" :size="10" />
        </button>
        <Teleport to="body">
          <div v-if="newOpen" class="dropdown__menu dropdown__menu--narrow" role="menu" data-tb-menu :style="floatStyle" @keydown="onMenuKeydown">
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="files.newFile(); newOpen = false">
              <Icon name="new" />
              <span class="dropdown__name">{{ t('toolbar.newMarkdown') }}</span>
              <span v-if="chord('file.new')" class="dropdown__shortcut">{{ chord('file.new') }}</span>
            </button>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="files.newTextFile(); newOpen = false">
              <Icon name="new-text" />
              <span class="dropdown__name">{{ t('toolbar.newPlainText') }}</span>
              <span v-if="chord('file.newText')" class="dropdown__shortcut">{{ chord('file.newText') }}</span>
            </button>
          </div>
        </Teleport>
      </div>
      <!-- Open file / open folder / recent files: three buttons became one menu. -->
      <div class="dropdown">
        <button
          ref="openBtnRef"
          class="icon-btn"
          aria-haspopup="menu"
          :aria-expanded="openOpen"
          @click="toggleDropdown('open', $event)"
          @keydown.down.prevent="openByKey('open')"
          :title="tip('toolbar.open', 'file.open')"
        >
          <Icon name="open" />
          <Icon name="chevron-down" :size="10" />
        </button>
        <Teleport to="body">
          <div v-if="openOpen" class="dropdown__menu" role="menu" data-tb-menu :style="floatStyle" @keydown="onMenuKeydown">
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="openOpen = false; files.openFile()">
              <Icon name="open" />
              <span class="dropdown__name">{{ t('menubar.openFile') }}</span>
              <span v-if="chord('file.open')" class="dropdown__shortcut">{{ chord('file.open') }}</span>
            </button>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="openOpen = false; files.openFolder()">
              <Icon name="folder" />
              <span class="dropdown__name">{{ t('menubar.openFolder') }}</span>
            </button>
            <div class="dropdown__sep"></div>
            <div class="dropdown__heading">{{ t('toolbar.recent') }}</div>
            <div v-if="!workspace.recentFiles.length" class="dropdown__empty">{{ t('toolbar.noRecent') }}</div>
            <button
              v-for="p in workspace.recentFiles"
              :key="p"
              class="dropdown__item dropdown__item--recent"
              role="menuitem"
              tabindex="-1"
              @mousedown.prevent="files.openPath(p); openOpen = false"
              :title="p"
            >
              <span class="dropdown__name">{{ shortPath(p) }}</span>
              <span class="dropdown__path">{{ p }}</span>
              <!-- #112 — remove ONE stale entry without touching the file
                   (the only management before this was nuke-the-whole-list). -->
              <span
                class="dropdown__remove"
                role="button"
                :title="t('toolbar.removeRecent')"
                @mousedown.stop.prevent="workspace.removeRecent(p)"
              >✕</span>
            </button>
            <div v-if="workspace.recentFiles.length" class="dropdown__sep"></div>
            <button
              v-if="workspace.recentFiles.length"
              class="dropdown__item dropdown__item--muted"
              role="menuitem"
              tabindex="-1"
              @mousedown.prevent="workspace.clearRecent(); openOpen = false"
            >{{ t('toolbar.clearRecent') }}</button>
          </div>
        </Teleport>
      </div>
      <button class="icon-btn" data-phone-primary @click="files.saveActive" v-bind:title="tip('toolbar.save', 'file.save')">
        <Icon name="save" />
      </button>
      <div class="dropdown">
        <button
          ref="exportBtnRef"
          class="icon-btn"
          aria-haspopup="menu"
          :aria-expanded="exportOpen"
          @click="toggleDropdown('export', $event)"
          @keydown.down.prevent="openByKey('export')"
          :title="t('toolbar.exportTooltip')"
        >
          <Icon name="export" />
          <Icon name="chevron-down" :size="10" />
        </button>
        <Teleport to="body">
          <div v-if="exportOpen" class="dropdown__menu" role="menu" data-tb-menu :style="floatStyle" @keydown="onMenuKeydown">
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="exporter.exportHtml(); exportOpen = false">
              <span class="dropdown__name">{{ t('toolbar.exportHtml') }}</span>
            </button>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="exporter.exportDocx(); exportOpen = false">
              <span class="dropdown__name">{{ t('toolbar.exportDocx') }}</span>
            </button>
            <!-- Gitee IK8QJQ — these two produce very different PDFs and the
                 names alone did not say so. `exportPdf` goes through
                 html2pdf.js (html2canvas), which rasterises the page, so the
                 text is not selectable and files run several times larger;
                 `exportPdfPrint` hands off to the OS print engine and yields
                 real vector text. Both are worth keeping — the raster path
                 saves straight to a file with no dialog — so label the
                 tradeoff rather than hide it, and lead with the text one. -->
            <button class="dropdown__item" role="menuitem" tabindex="-1" @mousedown.prevent="exporter.exportPdfPrint(); exportOpen = false">
              <span class="dropdown__row">
                <span class="dropdown__name">{{ t('toolbar.exportPdfPrint') }}</span>
                <span v-if="chord('export.pdfPrint')" class="dropdown__shortcut">{{ chord('export.pdfPrint') }}</span>
              </span>
              <span class="dropdown__path">{{ t('toolbar.exportPdfPrintHint') }}</span>
            </button>
            <button class="dropdown__item" role="menuitem" tabindex="-1" @mousedown.prevent="exporter.exportPdf(); exportOpen = false">
              <span class="dropdown__name">{{ t('toolbar.exportPdf') }}</span>
              <span class="dropdown__path">{{ t('toolbar.exportPdfHint') }}</span>
            </button>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="exporter.exportImage(); exportOpen = false">
              <span class="dropdown__name">{{ t('toolbar.exportImage') }}</span>
            </button>
            <div class="dropdown__sep"></div>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="exporter.copyAsHtml(); exportOpen = false">
              <span class="dropdown__name">{{ t('toolbar.copyHtml') }}</span>
              <span v-if="chord('export.copyHtml')" class="dropdown__shortcut">{{ chord('export.copyHtml') }}</span>
            </button>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="exporter.copyAsPlainText(); exportOpen = false">
              <span class="dropdown__name">{{ t('toolbar.copyPlain') }}</span>
            </button>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="exporter.copyAsMarkdown(); exportOpen = false">
              <span class="dropdown__name">{{ t('toolbar.copyMarkdown') }}</span>
              <span v-if="chord('export.copyMd')" class="dropdown__shortcut">{{ chord('export.copyMd') }}</span>
            </button>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="exporter.copyAsImage(); exportOpen = false">
              <span class="dropdown__name">{{ t('toolbar.copyImage') }}</span>
            </button>
          </div>
        </Teleport>
      </div>
    </div>

    <span class="toolbar__divider"></span>

    <div class="toolbar__group">
      <div class="dropdown" v-if="isMarkdown">
        <button
          ref="insertBtnRef"
          class="icon-btn"
          aria-haspopup="menu"
          :aria-expanded="insertOpen"
          @click="toggleDropdown('insert', $event)"
          @keydown.down.prevent="openByKey('insert')"
          :title="t('toolbar.insertTooltip')"
        >
          <Icon name="insert" />
          <Icon name="chevron-down" :size="10" />
        </button>
        <Teleport to="body">
          <div v-if="insertOpen" class="dropdown__menu" role="menu" data-tb-menu :style="floatStyle" @keydown="onMenuKeydown">
            <!-- #296 — the formatting commands, with the chord beside each: the
                 menu is where a mouse user learns the key. These wrap the
                 selection; the snippet items below only insert. -->
            <button
              v-for="f in formatItems"
              :key="f.kind"
              class="dropdown__item dropdown__item--single dropdown__item--kbd"
              role="menuitem"
              tabindex="-1"
              @mousedown.prevent="dispatchFormat(f.kind)"
            >
              <span class="dropdown__name">{{ t(f.label) }}</span>
              <kbd v-if="chord(f.action)" class="dropdown__kbd">{{ chord(f.action) }}</kbd>
            </button>
            <div class="dropdown__sep"></div>
            <button class="dropdown__item dropdown__item--single dropdown__item--kbd" role="menuitem" tabindex="-1" @mousedown.prevent="dispatchFormat('codeblock')">
              <span class="dropdown__name">{{ t('toolbar.insertCodeBlock') }}</span>
              <kbd v-if="chord('fmt.codeblock')" class="dropdown__kbd">{{ chord('fmt.codeblock') }}</kbd>
            </button>
            <button class="dropdown__item dropdown__item--single dropdown__item--kbd" role="menuitem" tabindex="-1" @mousedown.prevent="dispatchFormat('code')">
              <span class="dropdown__name">{{ t('toolbar.insertInlineCode') }}</span>
              <kbd v-if="chord('fmt.code')" class="dropdown__kbd">{{ chord('fmt.code') }}</kbd>
            </button>
            <div class="dropdown__sep"></div>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="dispatchInsert('\n$$\n$|$\n$$\n')">
              <span class="dropdown__name">{{ t('toolbar.insertMathBlock') }}</span>
            </button>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="dispatchInsert('$$|$$')">
              <span class="dropdown__name">{{ t('toolbar.insertMathInline') }}</span>
            </button>
            <div class="dropdown__sep"></div>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="dispatchInsert('\n| $|$ | Header |\n| --- | --- |\n| cell | cell |\n')">
              <span class="dropdown__name">{{ t('toolbar.insertTable') }}</span>
            </button>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="dispatchInsert(MERMAID_INSERT_SNIPPET)">
              <span class="dropdown__name">{{ t('toolbar.insertMermaid') }}</span>
            </button>
            <div class="dropdown__sep"></div>
            <button class="dropdown__item dropdown__item--single dropdown__item--kbd" role="menuitem" tabindex="-1" @mousedown.prevent="dispatchFormat('link')">
              <span class="dropdown__name">{{ t('toolbar.insertLink') }}</span>
              <kbd v-if="chord('fmt.link')" class="dropdown__kbd">{{ chord('fmt.link') }}</kbd>
            </button>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="pickAndInsertImage()">
              <span class="dropdown__name">{{ t('toolbar.insertImage') }}</span>
            </button>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="openImageUrlDialog()">
              <span class="dropdown__name">{{ t('toolbar.insertNetworkImage') }}</span>
            </button>
            <button class="dropdown__item dropdown__item--single dropdown__item--kbd" role="menuitem" tabindex="-1" @mousedown.prevent="dispatchFormat('quote')">
              <span class="dropdown__name">{{ t('toolbar.insertQuote') }}</span>
              <kbd v-if="chord('fmt.quote')" class="dropdown__kbd">{{ chord('fmt.quote') }}</kbd>
            </button>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="dispatchInsert('\n---\n')">
              <span class="dropdown__name">{{ t('toolbar.insertDivider') }}</span>
            </button>
          </div>
        </Teleport>
      </div>

      <!-- Fork feature: two Word-style toggles for what Enter does at the end
           of a list line. Deliberately flat buttons, no dropdown caret: each
           one is a simple on/off, and the pressed state is the setting's value.
           Markdown only — the list continuation they drive is a Markdown one. -->
      <button
        v-if="isMarkdown"
        class="icon-btn"
        @click="settings.toggleMarkdownListContinue"
        :class="{ active: settings.markdownListContinue }"
        :title="settings.markdownListContinue ? t('toolbar.listContinueOn') : t('toolbar.listContinueOff')"
      >
        <Icon name="list-bullet" />
      </button>
      <button
        v-if="isMarkdown"
        class="icon-btn"
        @click="settings.toggleMarkdownAutoNumber"
        :class="{ active: settings.markdownAutoNumber }"
        :title="settings.markdownAutoNumber ? t('toolbar.autoNumberOn') : t('toolbar.autoNumberOff')"
      >
        <Icon name="list-number" />
      </button>

      <!-- AI▾ — a split button. The face runs the frequent action (rewrite the
           selection); the arrow opens both AI actions. App Store builds ship no
           AI rewrite, and with AI switched off the face could only ever say
           "enable AI first" (#346) — in both cases what's left is the one
           action that needs no model, so it's a plain button again. -->
      <div v-if="aiRewriteAvailable" class="dropdown ai-split">
        <button
          class="icon-btn ai-rewrite-btn"
          @mousedown.prevent
          @click="onAIRewrite"
          :title="tip('toolbar.aiRewriteTooltip', 'editor.aiRewrite')"
        >
          <span class="ai-rewrite-label">AI</span>
          <span class="ai-rewrite-spark">✨</span>
        </button>
        <button
          ref="aiBtnRef"
          class="icon-btn ai-split__arrow"
          aria-haspopup="menu"
          :aria-expanded="aiOpen"
          @mousedown.prevent
          @click="toggleDropdown('ai', $event)"
          @keydown.down.prevent="openByKey('ai')"
          :title="t('toolbar.aiMenu')"
        >
          <Icon name="chevron-down" :size="10" />
        </button>
        <Teleport to="body">
          <div v-if="aiOpen" class="dropdown__menu" role="menu" data-tb-menu :style="floatStyle" @keydown="onMenuKeydown">
            <button class="dropdown__item dropdown__item--single dropdown__item--kbd" role="menuitem" tabindex="-1" @mousedown.prevent="aiOpen = false; onAIRewrite()">
              <span class="dropdown__name">{{ t('cmd.editor.aiRewrite') }}</span>
              <kbd v-if="chord('editor.aiRewrite')" class="dropdown__kbd">{{ chord('editor.aiRewrite') }}</kbd>
            </button>
            <button class="dropdown__item dropdown__item--single" role="menuitem" tabindex="-1" @mousedown.prevent="aiOpen = false; onCleanAI()">
              <span class="dropdown__name">{{ t('toolbar.cleanAiMarks') }}</span>
            </button>
          </div>
        </Teleport>
      </div>
      <button
        v-else
        class="icon-btn clean-ai-btn"
        @click="onCleanAI"
        v-bind:title="t('toolbar.cleanAiTitle')"
      >
        <span class="clean-ai-broom">🧹</span>
        <span class="clean-ai-label">AI</span>
      </button>
    </div>

    <span class="toolbar__divider"></span>

    <div class="toolbar__group">
      <button class="icon-btn" data-phone-primary @click="$emit('open-search')" :title="tip('toolbar.searchTooltip', 'search.global')">
        <Icon name="search" />
      </button>
      <button class="icon-btn" @click="$emit('open-palette')" :title="tip('toolbar.paletteTooltip', 'palette.open')">
        <Icon name="palette" />
      </button>
    </div>

    <!-- iOS / Android have no menu bar, and an iPhone has no keyboard, so the
         buttons the desktop strip handed to the menus would simply vanish
         there (Settings above all). They stay — folded into the "⋯" sheet,
         which `noMenuBar` always offers. -->
    <div v-if="noMenuBar" class="toolbar__group toolbar__group--extras">
      <button class="icon-btn" @click="files.saveActiveAs" :title="tip('toolbar.saveAsTooltip', 'file.saveAs')">
        <Icon name="save-as" />
      </button>
      <button class="icon-btn" @click="onOpenExternal" :title="tip('toolbar.openExternalTooltip', 'file.openExternal')">
        <Icon name="external" />
      </button>
      <button
        class="icon-btn"
        :disabled="settings.viewMode === 'preview'"
        @click="settings.toggleFocusMode"
        :class="{ active: settings.focusMode }"
        :title="t('toolbar.focusModeTooltip')"
      >
        <Icon name="focus" />
      </button>
      <button
        class="icon-btn"
        :disabled="settings.viewMode === 'preview'"
        @click="settings.toggleTypewriterMode"
        :class="{ active: settings.typewriterMode }"
        :title="t('toolbar.typewriterTooltip')"
      >
        <Icon name="typewriter" />
      </button>
      <button
        class="icon-btn"
        :disabled="settings.viewMode === 'preview'"
        @click="settings.toggleSpellCheck"
        :class="{ active: settings.spellCheck }"
        :title="t('toolbar.spellCheckTooltip')"
      >
        <Icon name="spellcheck" />
      </button>
      <button
        class="icon-btn cjk-proof-btn"
        :disabled="settings.viewMode === 'preview'"
        @click="onOpenCjkProofread"
        :title="tip('toolbar.cjkProofreadTooltip', 'proofread.cjk')"
      >
        <span class="cjk-proof-glyph">中</span>
      </button>
      <button class="icon-btn" @click="$emit('open-help')" :title="tip('toolbar.helpTooltip', 'help.markdown')">
        <Icon name="help" />
      </button>
      <button class="icon-btn" @click="$emit('open-settings')" :title="tip('toolbar.settingsTooltip', 'settings.open')">
        <Icon name="settings" />
      </button>
      <button
        class="icon-btn"
        @click="settings.toggleTheme()"
        :title="settings.theme === 'dark' ? t('toolbar.lightMode') : t('toolbar.darkMode')"
      >
        <Icon :name="settings.theme === 'dark' ? 'theme-light' : 'theme-dark'" />
      </button>
    </div>

    <div class="toolbar__spacer"></div>

    <div class="toolbar__group">
      <!-- View mode▾ — five buttons became one menu. The face shows the mode
           you are in; the menu also carries the two per-mode toggles that
           used to appear beside the five buttons only in some modes. -->
      <div v-if="isMarkdown" class="dropdown" data-phone-primary>
        <button
          ref="viewBtnRef"
          class="icon-btn"
          aria-haspopup="menu"
          :aria-expanded="viewOpen"
          @click="toggleDropdown('view', $event)"
          @keydown.down.prevent="openByKey('view')"
          :title="`${t('toolbar.viewMode')}: ${currentViewLabel}`"
        >
          <Icon :name="currentViewIcon" />
          <Icon name="chevron-down" :size="10" />
        </button>
        <Teleport to="body">
          <div v-if="viewOpen" class="dropdown__menu dropdown__menu--narrow" role="menu" data-tb-menu :style="floatStyle" @keydown="onMenuKeydown">
            <button
              v-for="m in viewModes"
              :key="m.mode"
              class="dropdown__item dropdown__item--single dropdown__item--check"
              :class="{ 'is-checked': settings.viewMode === m.mode }"
              role="menuitemradio"
              :aria-checked="settings.viewMode === m.mode"
              tabindex="-1"
              @mousedown.prevent="pickViewMode(m.mode)"
            >
              <span class="dropdown__check" aria-hidden="true">{{ settings.viewMode === m.mode ? '✓' : '' }}</span>
              <Icon :name="m.icon" />
              <span class="dropdown__name">{{ t(m.label) }}</span>
              <span v-if="m.action && chord(m.action)" class="dropdown__shortcut">{{ chord(m.action) }}</span>
            </button>
            <template v-if="showLivePreviewToggle || showFitWidthToggle">
              <div class="dropdown__sep"></div>
              <button
                v-if="showLivePreviewToggle"
                class="dropdown__item dropdown__item--single dropdown__item--check"
                role="menuitemcheckbox"
                :aria-checked="settings.livePreview"
                tabindex="-1"
                @mousedown.prevent="toggleLivePreviewFromMenu()"
              >
                <span class="dropdown__check" aria-hidden="true">{{ settings.livePreview ? '✓' : '' }}</span>
                <Icon name="live" />
                <span class="dropdown__name">{{ t('toolbar.livePreviewToggle') }}</span>
              </button>
              <button
                v-if="showFitWidthToggle"
                class="dropdown__item dropdown__item--single dropdown__item--check"
                role="menuitemcheckbox"
                :aria-checked="settings.previewFitWidth"
                tabindex="-1"
                @mousedown.prevent="settings.togglePreviewFitWidth(); viewOpen = false"
              >
                <span class="dropdown__check" aria-hidden="true">{{ settings.previewFitWidth ? '✓' : '' }}</span>
                <Icon name="fit-width" />
                <span class="dropdown__name">{{ t('toolbar.fitWidth') }}</span>
              </button>
            </template>
          </div>
        </Teleport>
      </div>
      <button
        class="icon-btn toolbar__panel-toggle"
        data-phone-primary
        @click="settings.toggleFileTree"
        :class="{ active: settings.showFileTree }"
        :title="tip('toolbar.fileTreeTooltip', 'view.toggleFileTree')"
      >
        <Icon name="sidebar" />
      </button>
      <button
        class="icon-btn toolbar__panel-toggle"
        @click="settings.toggleRightSidebar"
        :class="{ active: !settings.rightSidebarHidden }"
        :title="tip('toolbar.rightSidebarTooltip', 'view.toggleRightSidebar')"
      >
        <Icon name="sidebar-right" />
      </button>
    </div>

    <!-- Writing-session presets (25/50/90/custom) used to hang off a chevron
         beside the focus-mode button. With that button gone the popover opens
         from the command palette ("solomd:open-pomodoro"), under the bar's
         right end. -->
    <Teleport to="body">
      <div v-if="pomoOpen" class="dropdown pomo-anchor" :style="pomoAnchorStyle">
        <PomodoroPopover :open="pomoOpen" @close="pomoOpen = false" />
      </div>
    </Teleport>

    <!-- #168 / #282 — expand the strip into a labelled sheet. Always offered
         on a phone; on wider windows only once the row actually overflows.
         Rendered ahead of the Windows caption buttons so the two sticky
         right-hand items don't land on top of each other. -->
    <button
      v-if="showMore"
      class="icon-btn toolbar__more"
      :class="{ active: sheetOpen, 'toolbar__more--pinned': !isNarrow }"
      data-phone-primary
      data-phone-more
      :aria-expanded="sheetOpen"
      :title="sheetOpen ? t('toolbar.phoneLess') : t('toolbar.phoneMore')"
      @click="toggleSheet"
    >
      <span aria-hidden="true">{{ sheetOpen ? '✕' : '⋯' }}</span>
    </button>
    <!-- Windows caption buttons. `position: sticky; right: 0` keeps them
         pinned even when the strip scrolls horizontally on narrow windows.
         The maximize button doubles as the Snap-Layouts target: on the real
         main window the Rust subclass claims its rect via WM_NCHITTEST, so
         hover/click are handled natively and mirrored back through the
         `solomd://maxbtn-hover` event (hence `.is-hover`, not `:hover`). -->
    <div v-if="winTitleBar" class="win-controls" data-no-drag>
      <button class="win-controls__btn" @click="winMinimize" :title="t('menubar.minimize')" tabindex="-1">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" stroke-width="1" /></svg>
      </button>
      <button
        ref="maxBtnRef"
        class="win-controls__btn win-controls__btn--max"
        :class="{ 'is-hover': maxBtnHover }"
        @click="winToggleMax"
        :title="isMaximized ? t('menubar.restore') : t('menubar.maximize')"
        tabindex="-1"
      >
        <svg v-if="!isMaximized" width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1" /></svg>
        <svg v-else width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" stroke-width="1" /><rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1" /></svg>
      </button>
      <button class="win-controls__btn win-controls__btn--close" @click="winClose" :title="t('menubar.close')" tabindex="-1">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--titlebar-h);
  padding: 0 12px;
  background: var(--bg-elev);
  border-bottom: 1px solid var(--border);
  user-select: none;
  /* #134 — on narrow windows the button groups used to overflow the strip and
     become unclickable (no scroll). The old #181 attempt at `overflow-x: auto`
     was reverted because dropdown menus were `position: absolute` inside the
     bar and got clipped. They are now `<Teleport>`-ed to <body> (see the
     `.dropdown__menu` blocks below) and repositioned on scroll via
     `onViewportChange`, so the strip can scroll horizontally without clipping
     any menu. overflow-y stays hidden so a stray vertical scrollbar can't eat
     into the thin title bar. */
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none; /* Firefox: hide the bar, keep wheel/trackpad scroll */
}
/* WebKit: hide the horizontal scrollbar so it doesn't shrink the ~40px bar. */
.toolbar::-webkit-scrollbar { height: 0; width: 0; }
/* v4.6 unified title bar — macOS only. The native traffic-light buttons are
   overlaid at the top-left by `titleBarStyle: "Overlay"`; reserve room for
   them so they don't sit on top of the brand / New button. ~72px clears the
   three 12px lights + their inset. Windows / Linux keep native decorations
   and never get this class, so their toolbar starts flush-left as before. */
.toolbar--mac {
  padding-left: 72px;
}
/* Windows unified title bar — frameless window, so this row IS the title bar:
   caption buttons render flush against the top-right corner (no padding). */
.toolbar--win {
  padding-right: 0;
}
/* #346 — "hide toolbar buttons". On macOS and Windows this row is also the
   window's title bar (traffic lights / caption buttons, drag area, menubar), so
   only the buttons go. Elsewhere the OS draws the title bar and the row can
   go entirely. */
.toolbar--minimal > .toolbar__group,
.toolbar--minimal > .toolbar__divider,
.toolbar--minimal > .toolbar__more {
  display: none;
}
.toolbar--minimal .toolbar__title {
  margin: 0 auto;
}
.toolbar--gone {
  display: none;
}
.menubar {
  display: flex;
  align-items: center;
  gap: 0;
}
.menubar__btn {
  font-size: 12px;
  padding: 4px 9px;
  border-radius: 5px;
  color: var(--text-muted);
  white-space: nowrap;
}
.menubar__btn:hover,
.menubar__btn.active {
  background: var(--bg-active);
  color: var(--text);
}
/* #282 — on a window too narrow for the whole strip, "more" stays pinned to
   the right edge while the rest scrolls under it, so it can't itself be the
   thing that scrolled out of reach. The fade tells you there IS more to the
   left of it. On Windows it sits inboard of the three 46px caption buttons. */
.toolbar__more--pinned {
  position: sticky;
  right: 0;
  z-index: 2;
  margin-left: auto;
  background: var(--bg-elev);
  box-shadow: -10px 0 10px -6px var(--bg-elev);
}
.toolbar--win .toolbar__more--pinned {
  right: 138px;
}
/* Expanded, the bar wraps and nothing is scrolling, so un-pin it. */
.toolbar--sheet .toolbar__more--pinned {
  position: static;
  margin-left: 0;
  box-shadow: none;
}

.win-controls {
  display: flex;
  align-self: stretch;
  align-items: stretch;
  margin-left: auto;
  position: sticky;
  right: 0;
  background: var(--bg-elev);
}
.win-controls__btn {
  width: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  border-radius: 0;
}
.win-controls__btn:hover,
.win-controls__btn.is-hover {
  background: var(--bg-active);
  color: var(--text);
}
/* Snap Layouts (future-proofing — NOT functional today, verified 2026-08-06
   on the Win11-ARM VM). WebView2's non-client region support (wry enables
   IsNonClientRegionSupportEnabled) currently only implements `app-region:
   drag` — COREWEBVIEW2_NON_CLIENT_REGION_KIND has no MAXIMIZE, so this value
   is ignored and the button works through its JS click handler (no hover
   flyout; Win+Arrow / drag-to-edge / drag-to-top snapping all still work
   natively). A top-level WM_NCHITTEST override can't claim the button
   either: the mouse lands on the cross-process Chrome_RenderWidgetHostHWND
   child first, and HTTRANSPARENT bubbling stops at thread boundaries
   (probe4b). If a future runtime adds the maximize region kind, this rule +
   the win_chrome.rs subclass (hover mirror + SC_MAXIMIZE) light up without
   code changes. */
.win-controls__btn--max {
  -webkit-app-region: maximize;
  app-region: maximize;
}
.win-controls__btn--close:hover {
  background: #e81123;
  color: #fff;
}
.toolbar > * { flex-shrink: 0; }
.toolbar__brand {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  flex: 0 0 22px;
  margin-right: 4px;
  pointer-events: none;
}

.toolbar__group {
  display: flex;
  gap: 1px;
  align-items: center;
}
.toolbar__group button {
  font-size: 12px;
  padding: 4px 10px;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
}
.toolbar__group button.active {
  background: var(--bg-active);
  color: var(--accent);
}
.icon-btn {
  padding: 5px 7px !important;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.icon-btn:hover {
  color: var(--text);
}
.icon-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.icon-btn:disabled:hover {
  color: var(--text-muted);
}
.clean-ai-btn {
  position: relative;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 11px !important;
  padding: 3px 10px !important;
  border: 1px solid var(--border);
  border-radius: 6px;
  gap: 2px;
  color: var(--text-muted);
  transition: all 0.15s;
}
.clean-ai-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft, rgba(255, 159, 64, 0.08));
}
.clean-ai-label {
  letter-spacing: 0.04em;
}
.clean-ai-broom {
  font-size: 11px;
  opacity: 0.85;
  margin-right: 1px;
}
.ai-rewrite-btn {
  position: relative;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 11px !important;
  padding: 3px 10px !important;
  border: 1px solid var(--border);
  border-radius: 6px;
  gap: 2px;
  color: var(--text-muted);
  transition: all 0.15s;
}
.ai-rewrite-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft, rgba(255, 159, 64, 0.08));
}
.ai-rewrite-label { letter-spacing: 0.04em; }
.ai-rewrite-spark { font-size: 11px; opacity: 0.85; margin-left: 2px; }

/* v2.5 F6 — CJK proofread toolbar button. Uses the literal "中"
 * glyph instead of an SVG icon: it telegraphs the feature's CJK
 * scope at a glance and matches Spell-check (a small icon-as-mark
 * style sits in the same toolbar group). */
.cjk-proof-btn {
  font-family: var(--font-zh, 'PingFang SC', 'Hiragino Sans GB', sans-serif);
  font-size: 13px !important;
  font-weight: 700;
  padding: 4px 8px !important;
  line-height: 1;
}
.cjk-proof-glyph {
  display: inline-block;
}

.toolbar__spacer { flex: 1 1 0; min-width: 0; }
/* Document title sits right after the SoloMD mark, mirroring a native window
   title (VSCode / macOS Notes style). flex-shrink:1 lets it ellipsis-shrink
   on narrow windows instead of pushing tool groups off the right edge
   (overrides `.toolbar > * { flex-shrink: 0 }`).
   #309 — "左侧界面文件名被遮挡". It was the ONLY shrinkable item in the row,
   so on a window too narrow for the strip it absorbed the entire squeeze
   before anything else gave: measured 8px wide at 1366 with Windows chrome,
   which renders as a single clipped glyph ("U" for Untitled.md, "c" for
   codex快捷键.md — both visible in the reporters' screenshots) and reads as
   the filename being covered up. A floor stops the shrink while the text is
   still a name; past that the strip overflows, which is honest and is
   exactly the case the "⋯" control already announces. */
.toolbar__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-left: 4px;
  padding-right: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
  min-width: 88px;
  flex-shrink: 1;
  cursor: default;
}
.toolbar__divider {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 4px;
}

.dropdown {
  position: relative;
}
/* AI▾ split button: the face and the arrow read as one bordered control. */
.ai-split {
  display: inline-flex;
  align-items: stretch;
}
.ai-split .ai-rewrite-btn {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.ai-split__arrow {
  border: 1px solid var(--border) !important;
  border-left: none !important;
  border-radius: 0 6px 6px 0;
  padding: 3px 4px !important;
  color: var(--text-faint);
}
.ai-split__arrow:hover {
  color: var(--accent);
  border-color: var(--accent) !important;
}
/* bug/C2 — one row down to ~800px. The Windows bar also carries the 168px
   menubar and 138px of caption buttons, so it runs out first: measured
   ~960px of fixed content with the filename at its floor. Shed, in order,
   what is already on screen or in the menus (601px+ only — the phone layout
   below that has its own rules, and keeps the file-tree button):
   1. the filename and brand mark — the filename is the active tab's name,
      one row below;
   2. the file-tree / right-sidebar toggles — View menu, ⌘B / ⌘⌥B (the
      proposal's own "窄窗口" adjustment, section 七). */
@media (min-width: 601px) and (max-width: 1023px) {
  .toolbar--win .toolbar__title,
  .toolbar--win .toolbar__brand {
    display: none;
  }
}
@media (min-width: 601px) and (max-width: 899px) {
  .toolbar--win .toolbar__panel-toggle {
    display: none;
  }
}
@media (min-width: 601px) and (max-width: 719px) {
  .toolbar__title {
    display: none;
  }
}
/* …but never inside the expanded sheet, which is where hidden things go. */
:root .toolbar.toolbar--sheet .toolbar__panel-toggle {
  display: inline-flex;
}
/* Buttons only a build without a menu bar keeps (iOS / Android): folded away
   until the "⋯" sheet opens. */
.toolbar__group--extras {
  display: none;
}
.toolbar--sheet .toolbar__group--extras {
  display: flex;
}
.pomo-anchor {
  pointer-events: auto;
}
.dropdown__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: min(280px, calc(100vw - 16px));
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--sh-pop);
  z-index: var(--z-pop);
  padding: 4px;
  max-height: 360px;
  overflow-y: auto;
}
.dropdown__menu--narrow {
  min-width: min(200px, calc(100vw - 16px));
}
.dropdown__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  text-align: left;
  border-radius: 4px;
}
.dropdown__name {
  color: var(--text);
  font-weight: 500;
}
.dropdown__path {
  color: var(--text-faint);
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}
.dropdown__heading {
  padding: 4px 10px 2px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-faint);
}
/* A two-line item whose first line also carries a shortcut. */
.dropdown__row {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
}
.dropdown__check {
  width: 12px;
  flex: 0 0 12px;
  text-align: center;
  color: var(--accent);
  font-size: 11px;
}
.dropdown__item--check.is-checked .dropdown__name {
  color: var(--accent);
}
.dropdown__item:focus-visible {
  outline: none;
  background: var(--bg-hover, var(--bg-active));
}
.dropdown__item--sub.active {
  background: var(--bg-hover);
}
.dropdown__shortcut {
  margin-left: auto;
  color: var(--text-faint);
  font-size: 10px;
  font-family: var(--font-mono);
}
.dropdown__item--muted {
  color: var(--text-muted);
  font-size: 11px;
}
/* bug/C1 — menubar rows reserve a check column (auto-save, focus mode, view
   mode, theme…) so labels line up whether or not a row is ticked. */
.dropdown__check {
  flex: 0 0 14px;
  width: 14px;
  color: var(--accent);
  font-size: 11px;
  text-align: center;
}
.dropdown__item--disabled {
  color: var(--text-faint);
  cursor: default;
}
.dropdown__item--disabled:hover {
  background: transparent;
}
/* #112 — per-entry recents removal. Hidden until the row is hovered so the
   list stays clean; sits over the right edge of the (column-flex) row. */
.dropdown__item--recent {
  position: relative;
  padding-right: 26px;
}
.dropdown__remove {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  display: none;
  padding: 2px 4px;
  border-radius: 3px;
  color: var(--text-faint);
  font-size: 11px;
  line-height: 1;
}
.dropdown__item--recent:hover .dropdown__remove {
  display: inline-block;
}
.dropdown__remove:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.dropdown__item--single {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.dropdown__item--kbd {
  justify-content: space-between;
}
.dropdown__kbd {
  font: inherit;
  font-size: 11px;
  color: var(--text-faint);
  white-space: nowrap;
  margin-left: 16px;
}
.dropdown__sep {
  height: 1px;
  background: var(--border);
  margin: 4px 6px;
}
.dropdown__empty {
  padding: 12px;
  color: var(--text-faint);
  font-size: 12px;
  text-align: center;
}
</style>
