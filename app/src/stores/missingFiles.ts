/**
 * Files a tab names that are no longer on disk — deleted in Explorer, moved to
 * another folder, renamed outside the app, or on a drive that is not mounted.
 *
 * A restored session brings the tabs back but not the files behind them, and
 * the tab kept showing its last-known text with nothing saying the file was
 * gone. Worse, if another file with the same name appeared elsewhere and got
 * opened, the two were indistinguishable by name. PaneTabBar strikes the name
 * through for the paths listed here.
 *
 * Kept beside the tabs rather than on them on purpose: this is an observation
 * about the disk, not part of the session. It is recomputed on launch and on
 * every window focus (`useFiles().refreshMissingFiles()`), never persisted —
 * so it can neither survive a relaunch as a stale mark nor outlive the moment
 * the file comes back.
 */
import { defineStore } from 'pinia';
import { samePath } from '../lib/path-key';

export const useMissingFilesStore = defineStore('missingFiles', {
  state: () => ({
    /** Absolute paths, exactly as the tabs spell them. */
    paths: [] as string[],
  }),
  getters: {
    /** True when `path` is a file we last saw vanish. Untitled tabs have no path. */
    isMissing: (state) => (path: string | null | undefined) =>
      !!path && state.paths.some((p) => samePath(p, path)),
  },
  actions: {
    /** Replace the whole set (the checker answers for every path at once). */
    set(paths: string[]) {
      this.paths = paths;
    },
    /** The file is back — saving or reopening one clears its own mark at once,
     *  without waiting for the next focus. */
    clear(path: string) {
      this.paths = this.paths.filter((p) => !samePath(p, path));
    },
  },
});
