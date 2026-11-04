import { ref } from 'vue';
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  openReleaseUrl,
  type UpdateProgressPayload,
} from '../lib/check-update';
import { DEFAULT_CHANNEL, type UpdateChannel } from '../lib/release-channels';
import { isMobile } from '../lib/platform';
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
 * "Check for updates now" — Settings → Advanced and the Help menu.
 *
 * Desktop: opens the update centre (channel picker + in-app installer).
 * Mobile (Android): ships through the app stores, so it checks the official
 * source only and sends the user to the official download page — never the
 * desktop centre, never a channel choice. iOS hides this entry entirely
 * (App Store rules forbid in-app update checks).
 */
export function useUpdateCheck() {
  const toasts = useToastsStore();
  const { t } = useI18n();

  async function manualCheckUpdate(): Promise<void> {
    if (checking.value) return;
    checking.value = true;
    try {
      if (!isMobile()) {
        openUpdateCenter();
        return;
      }
      // Mobile: official source only.
      const r = await checkForUpdate();
      if (r.error) {
        toasts.error(t('settings.updateCheckFailed'));
      } else if (r.hasUpdate && r.latest) {
        await openReleaseUrl(r.url, r.latest);
      } else {
        toasts.info(t('settings.upToDate'));
      }
    } finally {
      checking.value = false;
    }
  }

  return { checking, manualCheckUpdate };
}
