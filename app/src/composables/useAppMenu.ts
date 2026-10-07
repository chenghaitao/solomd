import { useSettingsStore } from '../stores/settings';
import { useWorkspaceStore } from '../stores/workspace';
import { useI18n } from '../i18n';
import { buildAppMenu, type MenuPlatform, type TopMenu } from '../lib/app-menu';
import { themeFamily, themeLabels } from '../lib/themes';
import { hasGitBackend, isMacOS } from '../lib/platform';
import { useTabsStore } from '../stores/tabs';
import { IS_APP_STORE_BUILD } from '../lib/app-build';
import { isMasBuild } from '../lib/check-update';
import type { Theme } from '../types';

/**
 * bug/C1 — the menu tree for one menu bar, from live state. Called inside a
 * computed / watchEffect, so every store field it reads (language, bindings,
 * recent files, the check-mark states) re-renders the menu when it changes.
 */
export function useAppMenu() {
  const settings = useSettingsStore();
  const workspace = useWorkspaceStore();
  const tabs = useTabsStore();
  const { t } = useI18n();
  const macKeys = isMacOS();

  function menuFor(platform: MenuPlatform): TopMenu[] {
    return buildAppMenu({
      t,
      // Spread: reads every key, so a binding added for the first time is a
      // dependency too (Vue tracks no key that does not exist yet — the bug
      // that kept the first rebind off the native menu in 4.11.20).
      overrides: { ...settings.keybindings },
      platform,
      macKeys,
      recent: [...workspace.recentFiles],
      themes: themeLabels,
      state: {
        autoSave: settings.autoSaveOnBlur,
        viewMode: settings.viewMode,
        focusMode: settings.focusMode,
        typewriter: settings.typewriterMode,
        spellCheck: settings.spellCheck,
        livePreview: settings.livePreview,
        fitWidth: settings.previewFitWidth,
        dark: themeFamily(settings.theme as Theme) === 'dark',
        theme: settings.theme,
        wordWrap: settings.wordWrap,
        lineNumbers: settings.showLineNumbers,
        autoGit: settings.autoGitEnabled,
        panes: {
          // The outline is per tab; the rest are workspace-wide settings.
          outline: !!tabs.activeTab?.showOutline,
          inspector: settings.showInspector,
          backlinks: settings.showBacklinks,
          relationships: settings.showRelationships,
          neighborhood: settings.showNeighborhood,
          tags: settings.showTagsPanel,
          tasks: settings.showTasksPanel,
          types: settings.showTypesPanel,
          history: settings.showHistoryPanel,
          savedViews: settings.showViewsPanel,
          agent: settings.showAgentPanel,
        },
      },
      aiAvailable: !IS_APP_STORE_BUILD,
      updateCheckAvailable: !isMasBuild(),
      gitAvailable: hasGitBackend(),
    });
  }

  return { menuFor };
}
