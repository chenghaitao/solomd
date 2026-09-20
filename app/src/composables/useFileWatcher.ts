import { watch, onMounted, onBeforeUnmount } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useTabsStore } from '../stores/tabs';
import { useSettingsStore } from '../stores/settings';
import { useTilesStore } from '../stores/tiles';
import type { FileReadResult, Tab } from '../types';

type FileChangedAction = 'reload' | 'overwrite' | 'cancel';
type ShowDialog = (fileName: string) => Promise<FileChangedAction>;

/// Minimum gap between two focus-driven revalidation sweeps. Switching apps is
/// chatty (Spotlight, screen recording, the OS file picker…) and each sweep
/// re-reads every open tab from disk.
const FOCUS_REVALIDATE_THROTTLE_MS = 1_500;

/// Watchdog sweep interval — see `startWatchdog`.
const WATCHDOG_INTERVAL_MS = 30_000;

export function useFileWatcher(showDialog: ShowDialog) {
  const tabs = useTabsStore();
  const settings = useSettingsStore();
  const tiles = useTilesStore();
  const watchedPaths = new Set<string>();
  let unlisten: UnlistenFn | null = null;
  const pendingPaths = new Set<string>();
  /// path → the exact disk revision we already reacted to. Without this a
  /// focus sweep would re-prompt for the same untouched external edit every
  /// time the user comes back after answering "cancel".
  const lastHandledDisk = new Map<string, string>();
  let lastFocusRevalidateAt = 0;
  let revalidating = false;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;

  /// CRLF→LF, mirroring CodeMirror's own doc normalization. Comparing raw
  /// disk bytes against a normalized buffer would report a phantom change on
  /// every Windows (CRLF) file.
  const normalize = (s: string) => (s.includes('\r\n') ? s.replace(/\r\n/g, '\n') : s);

  async function syncWatchedPaths() {
    const currentPaths = new Set<string>();
    for (const tab of tabs.tabs) {
      if (tab.filePath) {
        currentPaths.add(tab.filePath);
      }
    }

    const toWatch = [...currentPaths].filter((p) => !watchedPaths.has(p));
    const toUnwatch = [...watchedPaths].filter((p) => !currentPaths.has(p));

    for (const path of toWatch) {
      try {
        await invoke('watch_file', { path });
        watchedPaths.add(path);
      } catch (e) {
        console.warn('watch_file failed:', e);
      }
    }

    for (const path of toUnwatch) {
      try {
        await invoke('unwatch_file', { path });
      } catch (e) {
        console.warn('unwatch_file failed:', e);
      }
      watchedPaths.delete(path);
    }
  }

  async function reloadTab(tabId: string, filePath: string) {
    const result = await invoke<FileReadResult>('read_file', { path: filePath });
    // `applyDiskRead` normalizes CRLF→LF so reloads behave like fresh opens
    // (CodeMirror does the same normalization internally, otherwise a re-read
    // of a CRLF file leaves savedContent=CRLF but the editor's doc=LF and
    // dirty flips on without edits — same bug as openFromDisk).
    tabs.applyDiskRead(tabId, {
      content: result.content,
      encoding: result.encoding,
      hadBom: result.had_bom,
      language: result.language,
    });
    lastHandledDisk.set(filePath, normalize(result.content));
  }

  /**
   * Stale-buffer sweep — the reason this exists.
   *
   * The OS file watcher only reports changes that happen *while SoloMD is
   * running* and *while the path is registered*, and the Rust side additionally
   * suppresses events it believes are self-writes (a ±2s mtime epsilon around
   * our own save, plus a 30s "this whole subtree is being rewritten" window
   * opened by a git pull). Anything written outside those windows — the far
   * more common case of editing the file in VS Code while SoloMD is closed, or
   * a sync client landing a change right after a pull — is invisible to it, so
   * a tab restored from the previous session could sit on yesterday's bytes
   * forever and re-opening the file appeared to do nothing.
   *
   * Reading each open file once at startup, and again whenever the window
   * regains focus, closes that hole.
   *
   * `promptDirty` decides what to do about a tab with unsaved edits whose disk
   * copy also moved: `true` routes it through the same dialog the watcher uses,
   * `false` leaves it strictly alone (startup — SoloMD may have been closed for
   * days, and a modal about a file nobody has touched yet this session is worse
   * than the user noticing the unsaved-changes dot).
   *
   * `tabIds` narrows the sweep to a subset (the watchdog only checks the tabs
   * currently on screen) — omitted means every open file.
   */
  async function revalidateTabs(opts: { promptDirty?: boolean; tabIds?: Set<string> } = {}) {
    if (revalidating) return;
    revalidating = true;
    try {
      const candidates = opts.tabIds
        ? tabs.tabs.filter((t) => opts.tabIds!.has(t.id))
        : tabs.tabs;
      const paths = [
        ...new Set(
          candidates
            .filter((t): t is Tab & { filePath: string } => !!t.filePath)
            .map((t) => t.filePath),
        ),
      ];

      for (const path of paths) {
        const matching = tabs.tabs.filter((t) => t.filePath === path);
        if (matching.length === 0) continue;

        let result: FileReadResult;
        try {
          result = await invoke<FileReadResult>('read_file', { path });
        } catch {
          // Unreadable: deleted, moved, an Android `content://` vault URI
          // (Rust fs can't open those), or a permission prompt is pending. A
          // failed read must never touch the buffer.
          continue;
        }
        const disk = normalize(result.content);

        // Nothing to do unless some tab's last-known-disk bytes differ from
        // what is actually on disk now. This is also what keeps a plain focus
        // sweep free of false positives for files SoloMD itself just saved.
        if (!matching.some((t) => t.savedContent !== disk)) continue;
        if (lastHandledDisk.get(path) === disk) continue;
        // A dirty tab whose buffer already equals the disk revision is a save
        // of ours still in flight (or an external app that wrote exactly our
        // text). Nothing is stale, and reloading/prompting here would drop the
        // edits markSaved() is about to legitimize.
        if (matching.some((t) => t.content !== t.savedContent && normalize(t.content) === disk)) {
          continue;
        }

        if (opts.promptDirty) {
          await handleFileChanged(path);
        } else {
          for (const t of matching) {
            if (t.content !== t.savedContent) continue; // keep unsaved work
            tabs.applyDiskRead(t.id, {
              content: result.content,
              encoding: result.encoding,
              hadBom: result.had_bom,
              language: result.language,
            });
          }
        }
        lastHandledDisk.set(path, disk);
      }
    } finally {
      revalidating = false;
    }
  }

  function onWindowFocus() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const now = Date.now();
    if (now - lastFocusRevalidateAt < FOCUS_REVALIDATE_THROTTLE_MS) return;
    lastFocusRevalidateAt = now;
    void revalidateTabs({ promptDirty: true });
  }

  /// Mobile / tab-switching equivalent of `focus`. Desktop fires both when
  /// coming back from another app, which the throttle collapses into one sweep.
  function onVisibilityChange() {
    if (document.visibilityState === 'visible') onWindowFocus();
  }

  /**
   * Slow watchdog for the cases neither the OS watcher nor the focus sweep can
   * cover: a change that landed inside SoloMD's own suppression window (30s
   * after a git pull rewrote the subtree) while the user stayed in the app, and
   * vaults on OneDrive / network shares, where the platform watcher silently
   * drops events.
   *
   * Deliberately scoped to the tabs actually on screen — the user can only be
   * misled by a document they are looking at, and that keeps the cost at one
   * read per visible pane per interval instead of one per open tab.
   */
  function startWatchdog() {
    if (watchdogTimer !== null) return;
    watchdogTimer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const onScreen = new Set(tiles.allLeaves.map((l) => l.activeTabId).filter(Boolean));
      if (onScreen.size === 0) return;
      void revalidateTabs({ promptDirty: true, tabIds: onScreen });
    }, WATCHDOG_INTERVAL_MS);
  }

  function stopWatchdog() {
    if (watchdogTimer !== null) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
  }

  async function handleFileChanged(filePath: string) {
    const matching = tabs.tabs.filter((t) => t.filePath === filePath);
    if (matching.length === 0) return;

    // If a dialog is already pending for this path, skip
    if (pendingPaths.has(filePath)) return;

    const isPreview = settings.viewMode === 'preview';

    for (const tab of matching) {
      const isDirty = tab.content !== tab.savedContent;
      // Settings → "auto-refresh externally-modified files" (default on).
      // Preview mode always auto-reloads — nothing to lose. Dirty tabs
      // always show the dialog — we never silently throw away unsaved
      // edits regardless of this preference.
      const autoReload = settings.autoReloadExternalChanges !== false;

      if (!isDirty && (isPreview || autoReload)) {
        try {
          await reloadTab(tab.id, filePath);
        } catch (e) {
          console.warn('reload failed:', e);
        }
        continue;
      }

      // Dirty tab in edit/split mode — show dialog
      pendingPaths.add(filePath);
      let decided: FileChangedAction | null = null;
      try {
        decided = await showDialog(tab.fileName);
        if (decided === 'reload') {
          await reloadTab(tab.id, filePath);
        } else if (decided === 'overwrite') {
          const payload =
            tab.lineEnding === 'crlf' ? tab.content.replace(/\n/g, '\r\n') : tab.content;
          await invoke('write_file', {
            path: tab.filePath,
            content: payload,
            encoding: tab.encoding || 'UTF-8',
          });
          tabs.markSaved(tab.id, tab.filePath!);
        }
      } catch (e) {
        console.warn('file-changed dialog action failed:', e);
      } finally {
        pendingPaths.delete(filePath);
        // "Cancel" leaves disk ahead of the buffer on purpose, so record the
        // revision the user just declined. The focus / watchdog sweeps
        // compare against this map and would otherwise re-open the same
        // dialog every time the window regained focus.
        if (decided !== 'reload') {
          try {
            const latest = await invoke<FileReadResult>('read_file', { path: filePath });
            lastHandledDisk.set(filePath, normalize(latest.content));
          } catch {
            // File vanished / unreadable — nothing to remember.
          }
        }
      }
    }
  }

  // Watch tabs for path changes
  const stopWatcher = watch(
    () => tabs.tabs.map((t) => t.filePath).join('|'),
    () => syncWatchedPaths(),
  );

  onMounted(async () => {
    await syncWatchedPaths();

    try {
      unlisten = await listen<string>('solomd://file-changed', (e) => {
        if (e.payload) handleFileChanged(e.payload);
      });
    } catch (e) {
      console.warn('file-changed listener failed:', e);
    }

    // Restored tabs carry the content they had when the app last closed, and
    // no watcher event will ever arrive for what happened while it was down —
    // re-read every open file once so those edits (and any change the Rust
    // side suppressed as a self-write) actually show up.
    void revalidateTabs({ promptDirty: false });

    // Cheap safety net for the same class of miss while we ARE running: a
    // dropped/suppressed watcher event, or an external write that landed
    // during SoloMD's own 30s post-pull rewrite window. Focus is the moment
    // the user looks at the app again, so it is the right time to re-check.
    window.addEventListener('focus', onWindowFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    startWatchdog();
  });

  onBeforeUnmount(async () => {
    stopWatcher();
    stopWatchdog();
    window.removeEventListener('focus', onWindowFocus);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
    for (const path of watchedPaths) {
      try {
        await invoke('unwatch_file', { path });
      } catch {}
    }
    watchedPaths.clear();
  });
}
