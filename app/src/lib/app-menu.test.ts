import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildAppMenu, itemShortcut, toNativeSpec, type MenuContext, type MenuNode, type NativeNode, type TopMenu } from './app-menu.ts';
import { KEY_ACTIONS, typoraPreset } from './keybindings.ts';
import { en } from '../i18n/en.ts';
import { zh } from '../i18n/zh.ts';
import { ja } from '../i18n/ja.ts';
import { ko } from '../i18n/ko.ts';
import { de } from '../i18n/de.ts';
import { fr } from '../i18n/fr.ts';
import { es } from '../i18n/es.ts';
import { pt } from '../i18n/pt.ts';
import { it as itDict } from '../i18n/it.ts';
import { pl } from '../i18n/pl.ts';
import { nl } from '../i18n/nl.ts';
import { tr } from '../i18n/tr.ts';
import { sv } from '../i18n/sv.ts';
import { uk } from '../i18n/uk.ts';
import { ru } from '../i18n/ru.ts';

const DICTS: Record<string, unknown> = { en, zh, ja, ko, de, fr, es, pt, it: itDict, pl, nl, tr, sv, uk, ru };

/** A `t` that fails loudly on a key the locale does not have. */
function strictT(dict: unknown, lang: string) {
  return (key: string) => {
    let cur: any = dict;
    for (const p of key.split('.')) cur = cur?.[p];
    if (typeof cur !== 'string') throw new Error(`${lang}: missing ${key}`);
    return cur;
  };
}

function ctx(over: Partial<MenuContext> = {}): MenuContext {
  return {
    t: strictT(en, 'en'),
    overrides: {},
    platform: 'windows',
    macKeys: false,
    recent: ['/notes/a.md', 'C:\\notes\\b.md'],
    themes: [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }],
    state: {
      autoSave: false, viewMode: 'edit', focusMode: true, typewriter: false, spellCheck: true,
      livePreview: true, fitWidth: false, dark: false, theme: 'light',
    },
    aiAvailable: true,
    updateCheckAvailable: true,
    ...over,
  };
}

function walk(nodes: MenuNode[], out: MenuNode[] = []): MenuNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.type === 'submenu') walk(n.items, out);
  }
  return out;
}
const ids = (menus: TopMenu[]) =>
  menus.flatMap((m) => walk(m.items)).filter((n) => n.type === 'item').map((n) => (n as { id: string }).id);
const find = (menus: TopMenu[], id: string) =>
  menus.flatMap((m) => walk(m.items)).find((n) => n.type === 'item' && n.id === id) as Extract<MenuNode, { type: 'item' }>;

test('C1: seven top-level menus, no Tools menu', () => {
  const m = buildAppMenu(ctx());
  assert.deepEqual(m.map((x) => x.id), ['file', 'edit', 'paragraph', 'format', 'navigate', 'view', 'help']);
  assert.deepEqual(m.map((x) => x.label), ['File', 'Edit', 'Paragraph', 'Format', 'Go', 'View', 'Help']);
});

test('macOS keeps its app menu and Window menu around the seven', () => {
  const m = buildAppMenu(ctx({ platform: 'mac', macKeys: true }));
  assert.deepEqual(m.map((x) => x.id), ['app', 'file', 'edit', 'paragraph', 'format', 'navigate', 'view', 'window', 'help']);
  const file = ids([m[1]]);
  assert.ok(!file.includes('settings.open'), 'Settings lives in the app menu on macOS');
  assert.ok(!file.includes('file.exit'), 'Quit lives in the app menu on macOS');
  assert.ok(ids([m[0]]).includes('settings.open'));
});

test('C1 section 四 / 六 / Part-1 commands all have a menu entry', () => {
  const all = new Set(ids(buildAppMenu(ctx())));
  const required = [
    // File
    'file.new', 'file.newText', 'file.newInFolder', 'window.new', 'file.open', 'file.openFolder',
    'daily.openToday', 'file.save', 'file.saveAs', 'file.autoSave', 'file.import', 'export.html',
    'export.docx', 'export.pdfPrint', 'export.pdf', 'export.image', 'export.copyHtml', 'export.copyMd',
    'inbox.toggle', 'file.openExternal', 'settings.open', 'file.closeTab', 'tab.reopenClosed', 'file.exit',
    // Edit
    'edit.undo', 'edit.redo', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.selectAll', 'editor.caseCycle',
    'editor.selectWord', 'editor.deleteWord', 'editor.selectLine', 'editor.jumpToSelection',
    'editor.aiRewrite', 'clean.aiArtifacts', 'proofread.cjk', 'format.markdown',
    // Paragraph
    'fmt.h1', 'fmt.h2', 'fmt.h3', 'fmt.h4', 'fmt.h5', 'fmt.h6', 'heading.promote', 'heading.demote',
    'heading.paragraph', 'fmt.ul', 'fmt.ol', 'fmt.task', 'fmt.quote', 'fmt.codeblock',
    'editor.tableEditor', 'editor.formulaEditor', 'insert.mathBlock', 'insert.mermaid', 'insert.table', 'insert.hr',
    // Format
    'fmt.bold', 'fmt.italic', 'fmt.strike', 'fmt.code', 'insert.mathInline', 'fmt.link',
    'editor.insertImage', 'editor.insertImageUrl',
    // Navigate
    'palette.open', 'quickSwitcher.open', 'search.global', 'edit.find', 'tab.prev', 'tab.next',
    'tile.splitRight', 'tile.splitDown', 'tile.focusNext', 'tile.focusPrev',
    // View
    'view.mode:edit', 'view.mode:split', 'view.mode:liveEdit', 'view.mode:preview', 'view.mode:reading',
    'view.toggleLiveEdit', 'view.cycleView', 'view.slideshow', 'view.toggleFileTree',
    'view.toggleRightSidebar', 'view.toggleOutline', 'view.toggleInspector', 'view.toggleToolbar',
    'fold.toggle', 'fold.all', 'fold.none', 'view.toggleFocusMode', 'view.toggleTypewriter',
    'pomodoro.startLast', 'pomodoro.open', 'view.toggleSpellCheck', 'view.toggleLivePreview',
    'view.toggleFitWidth', 'view.darkMode', 'theme.set:light', 'view.zoomUiIn', 'view.zoomEditorIn', 'view.zoomPreviewIn',
    // Help
    'help.markdown', 'help.shortcuts', 'help.cli', 'help.checkUpdate', 'help.about',
  ];
  for (const id of required) assert.ok(all.has(id), `missing ${id}`);
});

test('every menu id is something App.vue can dispatch', () => {
  const actionIds = new Set(KEY_ACTIONS.map((a) => a.id));
  // Handled by name in dispatchMenuAction, or a palette command (useCommands).
  const menuOnly = new Set([
    'file.openFolder', 'file.autoSave', 'recent.clear', 'recent.none', 'view.darkMode',
    'view.zoomPreviewIn', 'view.zoomPreviewOut', 'view.zoomPreviewReset', 'help.shortcuts', 'help.cli',
    'help.checkUpdate', 'help.about', 'edit.find', 'edit.undo', 'edit.redo', 'edit.cut', 'edit.copy',
    'edit.paste', 'edit.selectAll', 'insert.mathBlock', 'insert.mathInline', 'insert.table',
    'insert.mermaid', 'insert.hr',
    // palette commands
    'export.html', 'export.docx', 'export.pdf', 'export.image', 'clean.aiArtifacts',
    'view.toggleSpellCheck', 'view.toggleLivePreview', 'view.toggleFitWidth', 'pomodoro.open',
    'editor.insertImage', 'editor.insertImageUrl',
  ]);
  for (const platform of ['windows', 'mac', 'linux'] as const) {
    for (const id of ids(buildAppMenu(ctx({ platform })))) {
      const ok = actionIds.has(id) || menuOnly.has(id) || /^(recent\.open|view\.mode|theme\.set):/.test(id);
      assert.ok(ok, `${platform}: nothing dispatches ${id}`);
    }
  }
});

test('labels exist in all 15 locales', () => {
  for (const [lang, dict] of Object.entries(DICTS)) {
    for (const platform of ['windows', 'mac', 'linux'] as const) {
      assert.doesNotThrow(() => buildAppMenu(ctx({ t: strictT(dict, lang), platform })), `${lang}/${platform}`);
    }
  }
});

test('menus show the binding in effect, not the factory default', () => {
  const c = ctx();
  const m = buildAppMenu(c);
  assert.equal(itemShortcut(find(m, 'fmt.bold'), c), 'Ctrl+Shift+B');
  assert.equal(itemShortcut(find(m, 'view.toggleFileTree'), c), 'Ctrl+B');
  assert.equal(itemShortcut(find(m, 'heading.promote'), c), '');
  const p = { ...c, overrides: typoraPreset('windows') };
  assert.equal(itemShortcut(find(m, 'fmt.bold'), p), 'Ctrl+B');
  assert.equal(itemShortcut(find(m, 'view.toggleFileTree'), p), 'Ctrl+Shift+B');
  assert.equal(itemShortcut(find(m, 'heading.promote'), p), 'Ctrl+=');
  assert.equal(itemShortcut(find(m, 'view.zoomUiIn'), p), '', 'UI zoom keeps its entry, loses its chord');
  assert.equal(itemShortcut(find(m, 'search.global'), p), 'Ctrl+Alt+F');
  // A single rebind is reflected too.
  assert.equal(itemShortcut(find(m, 'file.save'), { ...c, overrides: { 'file.save': 'Mod+Alt+9' } }), 'Ctrl+Alt+9');
  // The Windows edit keys are fixed; the reading item shows its toggle chord.
  assert.equal(itemShortcut(find(m, 'edit.undo'), c), 'Ctrl+Z');
  assert.equal(itemShortcut(find(m, 'view.mode:reading'), c), 'Ctrl+Shift+R');
});

test('check marks follow state', () => {
  const m = buildAppMenu(ctx());
  assert.equal(find(m, 'view.toggleFocusMode').checked, true);
  assert.equal(find(m, 'view.toggleTypewriter').checked, false);
  assert.equal(find(m, 'view.mode:edit').checked, true);
  assert.equal(find(m, 'view.mode:split').checked, false);
  assert.equal(find(m, 'theme.set:light').checked, true);
});

test('recent files: basenames, clear, and a disabled placeholder when empty', () => {
  const m = buildAppMenu(ctx());
  assert.equal(find(m, 'recent.open:1').label, 'b.md');
  assert.ok(find(m, 'recent.clear'));
  const empty = buildAppMenu(ctx({ recent: [] }));
  assert.equal(find(empty, 'recent.none').enabled, false);
});

function nativeWalk(nodes: NativeNode[], out: NativeNode[] = []): NativeNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.kind === 'submenu') nativeWalk(n.items, out);
  }
  return out;
}
const nativeAccel = (spec: ReturnType<typeof toNativeSpec>, id: string) => {
  const n = spec.flatMap((m) => nativeWalk(m.items)).find((x) => (x.kind === 'item' || x.kind === 'check') && x.id === id);
  return n && (n.kind === 'item' || n.kind === 'check') ? n.accelerator : 'MISSING';
};

test('native spec: accelerators are the live bindings, each claimed once', () => {
  const c = ctx({ platform: 'mac', macKeys: true });
  const spec = toNativeSpec(buildAppMenu(c), c);
  assert.equal(nativeAccel(spec, 'fmt.bold'), 'CmdOrCtrl+Shift+B');
  assert.equal(nativeAccel(spec, 'view.zoomUiIn'), 'CmdOrCtrl+Equal');
  assert.equal(nativeAccel(spec, 'heading.promote'), undefined);
  assert.equal(nativeAccel(spec, 'edit.find'), undefined, '⌘F must reach the focused find');
  assert.equal(nativeAccel(spec, 'view.zoomPreviewIn'), 'CmdOrCtrl+Control+=');
  const preset = { ...c, overrides: typoraPreset('mac') };
  const spec2 = toNativeSpec(buildAppMenu(preset), preset);
  assert.equal(nativeAccel(spec2, 'fmt.bold'), 'CmdOrCtrl+B');
  assert.equal(nativeAccel(spec2, 'view.toggleFileTree'), 'CmdOrCtrl+Shift+B');
  assert.equal(nativeAccel(spec2, 'heading.promote'), 'CmdOrCtrl+Equal');
  assert.equal(nativeAccel(spec2, 'view.zoomUiIn'), undefined, 'unbound → no accelerator left behind');
  for (const s of [spec, spec2]) {
    const accels = s.flatMap((m) => nativeWalk(m.items))
      .map((n) => (n.kind === 'item' || n.kind === 'check' ? n.accelerator : undefined))
      .filter(Boolean);
    assert.equal(new Set(accels).size, accels.length, 'no accelerator on two items');
  }
});

test('native spec never steals the OS edit chords', () => {
  const c = ctx({ platform: 'mac', macKeys: true });
  // ⌘⇧Z is redo on macOS; pomodoro.startLast ships on it.
  const spec = toNativeSpec(buildAppMenu(c), c);
  assert.equal(nativeAccel(spec, 'pomodoro.startLast'), undefined);
  const edit = spec.find((m) => m.text === 'Edit')!;
  assert.ok(edit.items.some((n) => n.kind === 'predefined' && n.role === 'redo'));
});
