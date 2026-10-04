/**
 * The application menu, as data (bug/C1).
 *
 * SoloMD has two menu bars: the native one (macOS menubar, Linux window menu —
 * built in Rust, runner.rs) and the in-app one in the Windows title bar
 * (Toolbar.vue; Windows runs frameless). They used to be two hand-written
 * lists that drifted apart — different items, and accelerators baked in as
 * factory defaults. Now both render this one tree:
 *
 *   文件 · 编辑 · 段落 · 格式 · 导航 · 视图 · 帮助
 *
 * plus the macOS app menu and Window menu, which macOS requires. Every item
 * carries the *action id* whose binding it shows, so the label always reads
 * the chord in effect right now — rebind ⌘B in Settings and the menu follows.
 *
 * Pure: no Vue, no stores, no i18n instance. The caller passes `t`, the
 * overrides and the bits of state the check marks reflect.
 */
import {
  combosFor,
  formatCombo,
  normalizeCombo,
  toTauriAccelerator,
  type KeyOverrides,
} from './keybindings';

export type MenuPlatform = 'mac' | 'windows' | 'linux';

export type PredefinedRole =
  | 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'
  | 'about' | 'services' | 'hide' | 'hideOthers' | 'showAll' | 'quit'
  | 'minimize' | 'maximize' | 'closeWindow';

export interface MenuItemNode {
  type: 'item';
  /** What a click dispatches (App.vue `dispatchMenuAction`). */
  id: string;
  label: string;
  /** Bindable action whose chord the item shows; defaults to `id`. */
  action?: string;
  /** A chord that is not a rebindable action (the Windows edit keys). */
  fixedShortcut?: string;
  /** macOS-only fixed accelerator, Tauri spelling (preview zoom: ⌃⌘=). */
  fixedNativeAccel?: string;
  /** Show the chord but never put it on a native menu item (see below). */
  noNativeAccel?: boolean;
  checked?: boolean;
  enabled?: boolean;
}
export interface MenuSubmenuNode {
  type: 'submenu';
  id: string;
  label: string;
  items: MenuNode[];
}
export interface MenuPredefinedNode {
  type: 'predefined';
  role: PredefinedRole;
  label?: string;
}
export type MenuNode = MenuItemNode | MenuSubmenuNode | MenuPredefinedNode | { type: 'sep' };

export interface TopMenu {
  id: string;
  label: string;
  items: MenuNode[];
}

export interface MenuState {
  autoSave: boolean;
  viewMode: string;
  focusMode: boolean;
  typewriter: boolean;
  spellCheck: boolean;
  livePreview: boolean;
  fitWidth: boolean;
  dark: boolean;
  theme: string;
}

export interface MenuContext {
  t: (key: string, params?: Record<string, string | number>) => string;
  overrides: KeyOverrides;
  /** Which menu bar is being built: decides the app/Window menus, Quit, Settings. */
  platform: MenuPlatform;
  /** Whether chords are spelled ⌘⇧K (true) or Ctrl+Shift+K. */
  macKeys: boolean;
  recent: string[];
  themes: { value: string; label: string }[];
  state: MenuState;
  /** App Store builds ship without AI rewrite. */
  aiAvailable: boolean;
  /** Mac App Store builds may not check for updates themselves. */
  updateCheckAvailable: boolean;
}

const sep = { type: 'sep' } as const;

/** Basename for the recent-files submenu (paths can be either separator). */
function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

export const RECENT_LIMIT = 10;
export const VIEW_MODES = ['edit', 'split', 'liveEdit', 'preview', 'reading'] as const;

/** Build the whole menu bar for one platform. */
export function buildAppMenu(ctx: MenuContext): TopMenu[] {
  const { t, platform, state } = ctx;
  const mac = platform === 'mac';
  const native = platform !== 'windows';
  const item = (id: string, label: string, extra: Partial<MenuItemNode> = {}): MenuItemNode => ({
    type: 'item', id, label, ...extra,
  });
  const fmt = (kind: string) => item(`fmt.${kind}`, t(`cmd.fmt.${kind}`));

  // Edit keys: the native menus use the OS's own items (they drive the
  // focused field's real undo stack); the Windows menubar drives them itself.
  const editKey = (role: PredefinedRole, id: string, label: string, chord: string): MenuNode =>
    native ? { type: 'predefined', role, label } : item(id, label, { fixedShortcut: chord });

  const recentItems: MenuNode[] = ctx.recent.length
    ? [
        ...ctx.recent.slice(0, RECENT_LIMIT).map((p, i) => item(`recent.open:${i}`, baseName(p))),
        sep,
        item('recent.clear', t('toolbar.clearRecent')),
      ]
    : [item('recent.none', t('toolbar.noRecent'), { enabled: false })];

  // ---- 文件 File ----
  const file: MenuNode[] = [
    item('file.new', t('menubar.newMd')),
    item('file.newText', t('menubar.newText')),
    item('file.newInFolder', t('cmd.file.newInFolder')),
    item('window.new', t('menubar.newWindow')),
    sep,
    item('file.open', t('menubar.openFile')),
    item('file.openFolder', t('menubar.openFolder')),
    { type: 'submenu', id: 'recent', label: t('menubar.openRecent'), items: recentItems },
    item('daily.openToday', t('cmd.daily.openToday')),
    sep,
    item('file.save', t('menubar.save')),
    item('file.saveAs', t('menubar.saveAs')),
    item('file.autoSave', t('menubar.autoSave'), { checked: state.autoSave }),
    sep,
    item('file.import', t('menubar.importDocs')),
    {
      type: 'submenu',
      id: 'export',
      label: t('toolbar.export'),
      items: [
        item('export.html', t('toolbar.exportHtml')),
        item('export.docx', t('toolbar.exportDocx')),
        // "PDF (text)" IS the system-print route (C1 listed it twice).
        item('export.pdfPrint', t('toolbar.exportPdfPrint')),
        item('export.pdf', t('toolbar.exportPdf')),
        item('export.image', t('toolbar.exportImage')),
        sep,
        item('export.copyHtml', t('cmd.export.copyHtml')),
        item('export.copyMd', t('cmd.export.copyMd')),
      ],
    },
    sep,
    item('inbox.toggle', t('cmd.inbox.toggle')),
    sep,
    item('file.openExternal', t('menubar.openExternal')),
    // macOS keeps Settings in the app menu (HIG); everywhere else it is File.
    ...(mac ? [] : [sep, item('settings.open', t('menubar.settings'))]),
    sep,
    item('file.closeTab', t('menubar.closeTab')),
    item('tab.reopenClosed', t('cmd.tab.reopenClosed')),
    // Quit is the app menu's on macOS.
    ...(mac ? [] : [sep, item('file.exit', t('menubar.exit'), { fixedShortcut: platform === 'windows' ? 'Alt+F4' : undefined })]),
  ];

  // ---- 编辑 Edit ----
  const edit: MenuNode[] = [
    editKey('undo', 'edit.undo', t('menubar.undo'), 'Ctrl+Z'),
    editKey('redo', 'edit.redo', t('menubar.redo'), 'Ctrl+Y'),
    sep,
    editKey('cut', 'edit.cut', t('menubar.cut'), 'Ctrl+X'),
    editKey('copy', 'edit.copy', t('menubar.copy'), 'Ctrl+C'),
    editKey('paste', 'edit.paste', t('menubar.paste'), 'Ctrl+V'),
    sep,
    editKey('selectAll', 'edit.selectAll', t('menubar.selectAll'), 'Ctrl+A'),
    sep,
    item('editor.caseCycle', t('cmd.editor.caseCycle')),
    sep,
    item('editor.selectWord', t('cmd.editor.selectWord')),
    item('editor.deleteWord', t('cmd.editor.deleteWord')),
    item('editor.selectLine', t('cmd.editor.selectLine')),
    item('editor.jumpToSelection', t('cmd.editor.jumpToSelection')),
    sep,
    ...(ctx.aiAvailable ? [item('editor.aiRewrite', t('cmd.editor.aiRewrite'))] : []),
    item('clean.aiArtifacts', t('toolbar.cleanAiMarks')),
    item('proofread.cjk', t('cmd.proofread.cjk')),
    item('format.markdown', t('cmd.format.markdown')),
  ];

  // ---- 段落 Paragraph ----
  const paragraph: MenuNode[] = [
    fmt('h1'), fmt('h2'), fmt('h3'), fmt('h4'), fmt('h5'), fmt('h6'),
    sep,
    item('heading.promote', t('cmd.heading.promote')),
    item('heading.demote', t('cmd.heading.demote')),
    item('heading.paragraph', t('cmd.heading.paragraph')),
    sep,
    fmt('ul'), fmt('ol'), fmt('task'),
    sep,
    fmt('quote'), fmt('codeblock'),
    sep,
    item('editor.tableEditor', t('cmd.editor.tableEditor')),
    item('editor.formulaEditor', t('cmd.editor.formulaEditor')),
    sep,
    item('insert.mathBlock', t('toolbar.insertMathBlock')),
    item('insert.mermaid', t('toolbar.insertMermaid')),
    item('insert.table', t('toolbar.insertTable')),
    item('insert.hr', t('toolbar.insertDivider')),
  ];

  // ---- 格式 Format ----
  const format: MenuNode[] = [
    fmt('bold'), fmt('italic'), fmt('strike'),
    sep,
    fmt('code'),
    item('insert.mathInline', t('toolbar.insertMathInline')),
    sep,
    fmt('link'),
    item('editor.insertImage', t('toolbar.insertImage')),
    item('editor.insertImageUrl', t('toolbar.insertNetworkImage')),
  ];

  // ---- 导航 Navigate ----
  const navigate: MenuNode[] = [
    item('palette.open', t('menubar.palette')),
    item('quickSwitcher.open', t('cmd.quickSwitcher.open')),
    item('search.global', t('menubar.globalSearch')),
    // No native accelerator on purpose: a native accelerator wins over the
    // webview, and ⌘F has to reach whichever find is focused (the editor's,
    // the preview's, the settings search box). The webview handles it.
    item('edit.find', t('menubar.find'), { action: 'editor.find', noNativeAccel: true }),
    sep,
    item('tab.prev', t('cmd.tab.prev')),
    item('tab.next', t('cmd.tab.next')),
    sep,
    item('tile.splitRight', t('cmd.tile.splitRight')),
    item('tile.splitDown', t('cmd.tile.splitDown')),
    item('tile.focusNext', t('cmd.tile.focusNext')),
    item('tile.focusPrev', t('cmd.tile.focusPrev')),
  ];

  // ---- 视图 View ----
  const modeLabel: Record<string, string> = {
    edit: t('toolbar.viewSource'),
    split: t('toolbar.viewSplit'),
    liveEdit: t('toolbar.viewLive'),
    preview: t('toolbar.viewPreview'),
    reading: t('toolbar.viewReading'),
  };
  const view: MenuNode[] = [
    {
      type: 'submenu',
      id: 'viewMode',
      label: t('toolbar.viewMode'),
      items: VIEW_MODES.map((m) =>
        item(`view.mode:${m}`, modeLabel[m], {
          checked: state.viewMode === m,
          // Reading mode has its own toggle chord; the others are reached by
          // cycling.
          action: m === 'reading' ? 'view.toggleReading' : undefined,
          // The item sets the mode, the chord toggles it — the native menu
          // must not run "set reading" on the toggle key.
          noNativeAccel: m === 'reading',
        }),
      ),
    },
    item('view.toggleLiveEdit', t('menubar.toggleLiveEdit')),
    item('view.cycleView', t('menubar.cycleView')),
    item('view.slideshow', t('cmd.view.slideshow')),
    sep,
    item('view.toggleFileTree', t('menubar.toggleFileTree')),
    item('view.toggleRightSidebar', t('menubar.toggleRightSidebar')),
    item('view.toggleOutline', t('menubar.toggleOutline')),
    item('view.toggleInspector', t('menubar.toggleInspector')),
    item('view.toggleToolbar', t('menubar.toggleToolbar')),
    sep,
    item('fold.toggle', t('cmd.fold.toggle')),
    item('fold.all', t('cmd.fold.all')),
    item('fold.none', t('cmd.fold.none')),
    sep,
    item('view.toggleFocusMode', t('menubar.focusMode'), { checked: state.focusMode }),
    item('view.toggleTypewriter', t('menubar.typewriterMode'), { checked: state.typewriter }),
    item('pomodoro.startLast', t('cmd.pomodoro.startLast')),
    item('pomodoro.open', t('menubar.writingSession')),
    sep,
    item('view.toggleSpellCheck', t('menubar.spellCheck'), { checked: state.spellCheck }),
    item('view.toggleLivePreview', t('toolbar.livePreviewToggle'), { checked: state.livePreview }),
    item('view.toggleFitWidth', t('toolbar.fitWidth'), { checked: state.fitWidth }),
    sep,
    item('view.darkMode', t('menubar.darkMode'), { checked: state.dark }),
    {
      type: 'submenu',
      id: 'theme',
      label: t('menubar.theme'),
      items: ctx.themes.map((th) => item(`theme.set:${th.value}`, th.label, { checked: state.theme === th.value })),
    },
    sep,
    {
      type: 'submenu',
      id: 'zoom',
      label: t('menubar.zoom'),
      items: [
        item('view.zoomUiIn', t('menubar.uiZoomIn')),
        item('view.zoomUiOut', t('menubar.uiZoomOut')),
        item('view.zoomUiReset', t('menubar.uiZoomReset')),
        sep,
        item('view.zoomEditorIn', t('menubar.editorZoomIn')),
        item('view.zoomEditorOut', t('menubar.editorZoomOut')),
        item('view.zoomEditorReset', t('menubar.editorZoomReset')),
        sep,
        // ⌃⌘ = / - / 0 exists only on macOS ("Mod" cannot say ⌘ and ⌃).
        item('view.zoomPreviewIn', t('menubar.previewZoomIn'), mac ? { fixedShortcut: '⌃⌘=', fixedNativeAccel: 'CmdOrCtrl+Control+=' } : {}),
        item('view.zoomPreviewOut', t('menubar.previewZoomOut'), mac ? { fixedShortcut: '⌃⌘-', fixedNativeAccel: 'CmdOrCtrl+Control+-' } : {}),
        item('view.zoomPreviewReset', t('menubar.previewZoomReset'), mac ? { fixedShortcut: '⌃⌘0', fixedNativeAccel: 'CmdOrCtrl+Control+0' } : {}),
      ],
    },
  ];

  // ---- 帮助 Help ----
  const help: MenuNode[] = [
    item('help.markdown', t('menubar.mdHelp')),
    item('help.shortcuts', t('menubar.helpShortcuts')),
    item('help.cli', t('menubar.helpCli')),
    ...(ctx.updateCheckAvailable ? [sep, item('help.checkUpdate', t('menubar.checkUpdate'))] : []),
    sep,
    item('help.about', t('menubar.about')),
  ];

  const menus: TopMenu[] = [
    { id: 'file', label: t('menubar.file'), items: file },
    { id: 'edit', label: t('menubar.edit'), items: edit },
    { id: 'paragraph', label: t('menubar.paragraph'), items: paragraph },
    { id: 'format', label: t('menubar.format'), items: format },
    { id: 'navigate', label: t('menubar.navigate'), items: navigate },
    { id: 'view', label: t('menubar.view'), items: view },
    { id: 'help', label: t('menubar.help'), items: help },
  ];
  if (!mac) return menus;

  // macOS: the first menu is the app menu (About / Settings / Quit by HIG,
  // and without it ⌘Q does nothing — #31), and Window sits before Help.
  const appMenu: TopMenu = {
    id: 'app',
    label: 'SoloMD',
    items: [
      { type: 'predefined', role: 'about' },
      sep,
      item('settings.open', t('menubar.settings')),
      sep,
      { type: 'predefined', role: 'services', label: t('menubar.services') },
      sep,
      { type: 'predefined', role: 'hide', label: t('menubar.hide') },
      { type: 'predefined', role: 'hideOthers', label: t('menubar.hideOthers') },
      { type: 'predefined', role: 'showAll', label: t('menubar.showAll') },
      sep,
      { type: 'predefined', role: 'quit', label: t('menubar.quit') },
    ],
  };
  const windowMenu: TopMenu = {
    id: 'window',
    label: t('menubar.window'),
    items: [
      { type: 'predefined', role: 'minimize', label: t('menubar.minimize') },
      { type: 'predefined', role: 'maximize', label: t('menubar.maximize') },
      sep,
      { type: 'predefined', role: 'closeWindow', label: t('menubar.close') },
    ],
  };
  return [appMenu, ...menus.slice(0, 6), windowMenu, menus[6]];
}

/** The chord an item displays: the binding in effect, or its fixed chord. */
export function itemShortcut(node: MenuItemNode, ctx: Pick<MenuContext, 'overrides' | 'macKeys'>): string {
  const combos = combosFor(node.action ?? node.id, ctx.overrides);
  if (combos.length) return formatCombo(combos[0], ctx.macKeys);
  return node.fixedShortcut ?? '';
}

/**
 * Chords the native Edit menu's OS items own. An action rebound onto one of
 * them keeps working through the webview, but its menu item must not claim
 * the accelerator — the OS item would lose ⌘Z / ⌘C / ….
 */
const OS_EDIT_CHORDS = new Set(['Mod+Z', 'Mod+Shift+Z', 'Mod+X', 'Mod+C', 'Mod+V', 'Mod+A'].map(normalizeCombo));

// ---- Native spec (what runner.rs `set_menu_spec` builds) ----

export type NativeNode =
  | { kind: 'item'; id: string; text: string; accelerator?: string; enabled: boolean }
  | { kind: 'check'; id: string; text: string; accelerator?: string; enabled: boolean; checked: boolean }
  | { kind: 'separator' }
  | { kind: 'submenu'; text: string; items: NativeNode[] }
  | { kind: 'predefined'; role: PredefinedRole; text?: string };

export interface NativeMenu {
  text: string;
  items: NativeNode[];
}

/**
 * The menu as runner.rs builds it. Accelerators are the bindings in effect
 * (Tauri spelling); an item whose action is unbound carries none, so a rebind
 * never leaves the old chord firing from the menu (#180). Each chord is
 * claimed once — a second item asking for it shows no accelerator.
 */
export function toNativeSpec(menus: TopMenu[], ctx: Pick<MenuContext, 'overrides'>): NativeMenu[] {
  const claimed = new Set<string>();
  const accelFor = (node: MenuItemNode): string | undefined => {
    if (node.fixedNativeAccel) {
      if (claimed.has(node.fixedNativeAccel)) return undefined;
      claimed.add(node.fixedNativeAccel);
      return node.fixedNativeAccel;
    }
    if (node.noNativeAccel) return undefined;
    const combo = combosFor(node.action ?? node.id, ctx.overrides)[0];
    if (!combo || OS_EDIT_CHORDS.has(combo)) return undefined;
    const accel = toTauriAccelerator(combo);
    if (claimed.has(accel)) return undefined;
    claimed.add(accel);
    return accel;
  };
  const convert = (nodes: MenuNode[]): NativeNode[] =>
    nodes.map((n): NativeNode => {
      if (n.type === 'sep') return { kind: 'separator' };
      if (n.type === 'predefined') return { kind: 'predefined', role: n.role, text: n.label };
      if (n.type === 'submenu') return { kind: 'submenu', text: n.label, items: convert(n.items) };
      const accelerator = accelFor(n);
      const base = { id: n.id, text: n.label, enabled: n.enabled !== false, ...(accelerator ? { accelerator } : {}) };
      return n.checked === undefined ? { kind: 'item', ...base } : { kind: 'check', ...base, checked: n.checked };
    });
  return menus.map((m) => ({ text: m.label, items: convert(m.items) }));
}
