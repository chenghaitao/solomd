import { watch, onMounted, onBeforeUnmount } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useTabsStore } from '../stores/tabs';
import { useSettingsStore } from '../stores/settings';
import { useTilesStore } from '../stores/tiles';
import type { FileReadResult } from '../types';

type FileChangedAction = 'reload' | 'overwrite' | 'cancel';
type ShowDialog = (fileName: string) => Promise<FileChangedAction>;

export function useFileWatcher(showDialog: ShowDialog) {
  const tabs = useTabsStore();
  const settings = useSettingsStore();
  const tiles = useTilesStore();
  const watchedPaths = new Set<string>();
  let unlisten: UnlistenFn | null = null;
  const pendingPaths = new Set<string>();
  /** Disk bytes the user has already been asked about, per path. */
  const lastPrompted = new Map<string, string>();
  let revalidating = false;
  let lastRevalidateAt = 0;
  const REVALIDATE_THROTTLE_MS = 1500;
  /** #317 — how often the watchdog re-checks the tabs on screen. Slow enough
   *  to be free (one read per visible pane), fast enough that a dropped
   *  OneDrive event is not stale for long. */
  const WATCHDOG_INTERVAL_MS = 30_000;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;

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
    // CRLF→LF normalization, encoding, BOM and line-ending all live in
    // `applyDiskRead` so a reload and a fresh open cannot drift apart.
    tabs.applyDiskRead(tabId, {
      content: result.content,
      encoding: result.encoding,
      hadBom: result.had_bom,
    });
  }

  /** A file's current bytes, normalized the way a tab stores them. */
  async function readNormalized(filePath: string) {
    const result = await invoke<FileReadResult>('read_file', { path: filePath });
    const normalized = result.content.includes('\r\n')
      ? result.content.replace(/\r\n/g, '\n')
      : result.content;
    return { result, normalized };
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
      try {
        const action = await showDialog(tab.fileName);
        if (action === 'reload') {
          await reloadTab(tab.id, filePath);
        } else if (action === 'overwrite') {
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
      }
    }
  }

  /**
   * #317 — re-read every open file and pick up what the watcher structurally
   * cannot see.
   *
   * Tabs are persisted with their text, so what you see after a restart is
   * what was in the buffer when SoloMD closed — never compared against the
   * file. The Rust watcher only reports changes while the app is running and
   * the path is registered, and it deliberately filters events that look like
   * our own writes (an mtime within tolerance of a save, and a 30s window
   * after a sync rewrite). So a file edited in another editor while SoloMD
   * was closed — the reported case — was shown stale forever, and the obvious
   * remedy of opening the file again did nothing either.
   *
   * `startup` adopts the file silently for clean tabs and leaves dirty ones
   * alone: nothing the user typed is at stake, the buffer is simply out of
   * date. `focus` and `watchdog` route changes through the ordinary conflict
   * path instead, so the auto-reload preference and the "file changed" dialog
   * still decide.
   *
   * `onlyTabIds` narrows the sweep to a subset. The watchdog passes just the
   * tabs on screen: nobody can be misled by a document they are not looking
   * at, and that holds the cost to one read per visible pane per interval
   * instead of one per open tab.
   */
  async function revalidateTabs(
    mode: 'startup' | 'focus' | 'watchdog',
    onlyTabIds?: Set<string>,
  ) {
    if (revalidating) return;
    revalidating = true;
    try {
      const candidates = onlyTabIds
        ? tabs.tabs.filter((t) => onlyTabIds.has(t.id))
        : tabs.tabs;
      const paths = [
        ...new Set(candidates.map((t) => t.filePath).filter(Boolean) as string[]),
      ];
      for (const filePath of paths) {
        if (pendingPaths.has(filePath)) continue;
        const matching = tabs.tabs.filter((t) => t.filePath === filePath);
        if (!matching.length) continue;
        const anyDirty = matching.some((t) => t.content !== t.savedContent);
        if (mode === 'startup' && anyDirty) continue;
        let read: { result: FileReadResult; normalized: string };
        try {
          read = await readNormalized(filePath);
        } catch {
          // Deleted, renamed, or on a drive that is not mounted right now —
          // none of which this pass should act on.
          continue;
        }
        if (matching.every((t) => t.savedContent === read.normalized)) {
          lastPrompted.delete(filePath);
          continue;
        }
        // A dirty tab whose buffer already equals the disk revision is not
        // stale: our own save is in flight, or an external app wrote exactly
        // the text we hold. Prompting would offer to discard edits that are
        // already the file. This compares `content`, not `savedContent`, which
        // is the point — a sweep racing markSaved() would otherwise fire the
        // dialog the instant the user saves.
        if (
          matching.some(
            (t) => t.content !== t.savedContent && t.content === read.normalized,
          )
        ) {
          continue;
        }
        if (mode === 'startup') {
          for (const t of matching) {
            tabs.applyDiskRead(t.id, {
              content: read.result.content,
              encoding: read.result.encoding,
              hadBom: read.result.had_bom,
            });
          }
          continue;
        }
        // Asking again about the same bytes the user already dismissed turns
        // every window focus into the same dialog.
        if (lastPrompted.get(filePath) === read.normalized) continue;
        lastPrompted.set(filePath, read.normalized);
        await handleFileChanged(filePath);
      }
    } finally {
      revalidating = false;
    }
  }

  function revalidateSoon(mode: 'focus') {
    // A sweep already in flight (the watchdog, or another focus) will see this
    // anyway — stamping the throttle here would swallow the focus that caused
    // it and push the refresh out to the next trigger.
    if (revalidating) return;
    const now = Date.now();
    if (now - lastRevalidateAt < REVALIDATE_THROTTLE_MS) return;
    lastRevalidateAt = now;
    void revalidateTabs(mode);
  }

  const onWindowFocus = () => revalidateSoon('focus');
  const onVisibility = () => {
    if (document.visibilityState === 'visible') revalidateSoon('focus');
  };

  /**
   * #317 — the slow watchdog, for what neither the OS watcher nor the focus
   * sweep can cover: a change that landed inside SoloMD's own suppression
   * window (an mtime within tolerance of a save, the 30s rewrite window after
   * a git pull) while the user stayed in the app, and vaults on OneDrive or a
   * network share, where the platform watcher drops events silently. Startup
   * plus focus only ever ran when the window came back — which never happens
   * for someone who never left.
   *
   * Scoped to the tabs on screen, and skipped entirely while the document is
   * hidden (mobile, another tab), so nothing pops up behind the user's back.
   * Dirty tabs still go through the ordinary conflict path, and the bytes the
   * user already dismissed are remembered, so a 30s heartbeat cannot turn into
   * a 30s dialog.
   */
  function startWatchdog() {
    if (watchdogTimer !== null) return;
    watchdogTimer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const onScreen = new Set(
        tiles.allLeaves.map((l) => l.activeTabId).filter(Boolean) as string[],
      );
      if (onScreen.size === 0) return;
      void revalidateTabs('watchdog', onScreen);
    }, WATCHDOG_INTERVAL_MS);
  }

  function stopWatchdog() {
    if (watchdogTimer !== null) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
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

    // #317 — the restored buffers are whatever was open last time; check them
    // against disk before the user reads a stale document.
    void revalidateTabs('startup');
    window.addEventListener('focus', onWindowFocus);
    document.addEventListener('visibilitychange', onVisibility);
    // ...and keep looking, for the changes no event will ever announce.
    startWatchdog();
  });

  onBeforeUnmount(async () => {
    stopWatcher();
    stopWatchdog();
    window.removeEventListener('focus', onWindowFocus);
    document.removeEventListener('visibilitychange', onVisibility);
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
