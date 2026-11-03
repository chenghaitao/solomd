import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';

/**
 * Update check & direct installer download protocol.
 *
 * This fork (chenghaitao/solomd) resolves update metadata and installers
 * exclusively from its own GitHub releases. Upstream's solomd.app proxy and
 * the Gitee mirror are intentionally NOT used — they would report upstream
 * version numbers and hand out upstream binaries.
 *
 * If GitHub is unreachable we surface `null` latest with `error: true` so the
 * UI shows "couldn't check, retry" instead of silently claiming "up to date".
 */

const GITHUB_RELEASES_API = 'https://api.github.com/repos/chenghaitao/solomd/releases/latest';
const RELEASES_PAGE = 'https://github.com/chenghaitao/solomd/releases';

export interface UpdateResult {
  current: string;
  latest: string | null;
  hasUpdate: boolean;
  url: string;
  /** True when no source could be reached. UI should show
   *  "couldn't check" rather than "up to date". */
  error: boolean;
}

export interface UpdateProgressPayload {
  version: string;
  downloaded: number;
  total: number | null;
  percent: number | null;
  source: string;
}

/** Returns semver comparison: 1 if a > b, -1 if a < b, 0 if equal */
function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

const MAS_BUILD = import.meta.env.VITE_MAS_BUILD === '1';

export const isMasBuild = (): boolean => MAS_BUILD;

async function fetchLatestFromGitHub(): Promise<{ tag: string; url: string } | null> {
  try {
    const res = await fetch(GITHUB_RELEASES_API, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const tag = (data.tag_name || '').replace(/^v/, '');
    if (!tag) return null;
    return { tag, url: data.html_url || RELEASES_PAGE };
  } catch {
    return null;
  }
}

export async function checkForUpdate(): Promise<UpdateResult> {
  const current = await getVersion().catch(() => '0.0.0');
  if (MAS_BUILD) {
    return { current, latest: null, hasUpdate: false, url: '', error: false };
  }

  const info = await fetchLatestFromGitHub();
  if (!info) {
    return {
      current,
      latest: null,
      hasUpdate: false,
      url: RELEASES_PAGE,
      error: true,
    };
  }

  const hasUpdate = compareSemver(info.tag, current) > 0;
  return {
    current,
    latest: info.tag,
    hasUpdate,
    url: info.url,
    error: false,
  };
}

/**
 * Fallback browser opener when direct installer download fails or on mobile.
 * Always opens this fork's GitHub releases page.
 */
export async function openReleaseUrl(_url: string, version?: string | null): Promise<void> {
  try {
    const cleanVer = (version || '').trim().replace(/^v/, '');
    const target = cleanVer ? `${RELEASES_PAGE}/tag/v${cleanVer}` : RELEASES_PAGE;
    await openUrl(target);
  } catch {
    /* ignore */
  }
}

let activeUpdateDownload = false;

/**
 * Directly download the platform installer (`.msi` on Windows, `.dmg` on macOS,
 * `.AppImage` on Linux) from this fork's GitHub releases and launch the
 * installer immediately.
 */
export async function downloadAndInstallUpdate(
  version: string,
  onProgress?: (p: UpdateProgressPayload) => void,
): Promise<boolean> {
  if (activeUpdateDownload) return false;
  activeUpdateDownload = true;
  let unlisten: (() => void) | null = null;
  try {
    if (onProgress) {
      unlisten = await listen<UpdateProgressPayload>('solomd://update-progress', (ev) => {
        onProgress(ev.payload);
      });
    }
    await invoke<string>('download_and_install_update', { version });
    return true;
  } catch {
    await openReleaseUrl('', version);
    return false;
  } finally {
    if (unlisten) {
      try {
        unlisten();
      } catch {}
    }
    activeUpdateDownload = false;
  }
}

/** Store the last-checked timestamp so we don't spam GitHub on every launch. */
const LS_KEY = 'solomd.update.last-check';
const CHECK_INTERVAL = 24 * 3600 * 1000; // 24 hours

export async function checkForUpdateOnStartup(): Promise<UpdateResult | null> {
  if (MAS_BUILD) return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const ts = Number(raw);
      if (Date.now() - ts < CHECK_INTERVAL) return null;
    }
  } catch {}
  const result = await checkForUpdate();
  // Only stamp the cache when the check actually succeeded — failed
  // checks shouldn't lock us out for 24 h.
  if (!result.error) {
    try {
      localStorage.setItem(LS_KEY, String(Date.now()));
    } catch {}
  }
  return result;
}
