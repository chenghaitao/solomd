import { ref } from 'vue';
import { downloadAndInstallUpdate, type UpdateProgressPayload } from '../lib/check-update';
import { DEFAULT_CHANNEL, type UpdateChannel } from '../lib/release-channels';
import { useToastsStore } from '../stores/toasts';
import { useI18n } from '../i18n';
import { openUpdateCenter } from './useUpdateCenter';

/** Shared so the Settings button and Help → Check for Updates agree. */
const checking = ref(false);

/**
 * Download + install in the background, reporting through a single toast.
 *
 * The update centre is the normal path now; this stays for callers that only
 * have a version string (e.g. a notification action) and don't open the dialog.
 */
export async function runDirectUpdateInstall(
  version: string,
  channel: UpdateChannel = DEFAULT_CHANNEL,
): Promise<void> {
  const toasts = useToastsStore();
  const { lang } = useI18n();
  const isZh = lang.value === 'zh';
  const cleanVer = version.replace(/^v/, '');
  const initMsg = isZh
    ? `正在下载更新 v${cleanVer}…`
    : `Downloading update v${cleanVer}…`;
  const toastId = toasts.push(initMsg, 'info', 0);

  const onProgress = (p: UpdateProgressPayload) => {
    const item = toasts.items.find((it) => it.id === toastId);
    if (!item) return;
    const pct = p.percent != null ? ` ${p.percent}%` : '';
    const src = p.source ? ` (${p.source})` : '';
    item.message = isZh
      ? `正在下载更新 v${cleanVer}${pct}${src}…`
      : `Downloading update v${cleanVer}${pct}${src}…`;
  };

  const ok = await downloadAndInstallUpdate(cleanVer, { channel, onProgress });

  toasts.resolve(toastId);
  if (ok) {
    toasts.success(
      isZh
        ? `v${cleanVer} 下载完成，正在启动安装程序…`
        : `v${cleanVer} downloaded — launching installer…`,
      5000,
    );
  }
}

/**
 * "Check for updates now" — Settings → Advanced and the Help menu. Both open
 * the update centre, which does its own check and shows the real state (and
 * the selected source's changelog) instead of a one-shot toast.
 */
export function useUpdateCheck() {
  async function manualCheckUpdate(): Promise<void> {
    if (checking.value) return;
    checking.value = true;
    try {
      openUpdateCenter();
    } finally {
      checking.value = false;
    }
  }

  return { checking, manualCheckUpdate };
}
