/**
 * Curated one-line release notes for the update centre.
 *
 * The GitHub release body is the full CHANGELOG section — accurate, but far
 * too long for a dialog: tables, code paths, root-cause paragraphs. The
 * update centre shows what a user actually decides on: a handful of lines
 * grouped into features / improvements / fixes, each one sentence.
 *
 * Keyed by channel first: the same version number means different things on
 * the two channels (fork 5.0.14 is upstream 5.0.12's feature batch plus the
 * local fixes), so one flat version map would describe the wrong build.
 *
 * Anything missing here falls back to the release body (see UpdateCenter),
 * so a brand-new release is still described — just in the long form.
 */

import type { UpdateChannel } from '../lib/release-channels';

export interface ReleaseNoteGroup {
  features: string[];
  improvements: string[];
  fixes: string[];
}

type Locale = 'zh' | 'en';

type ChannelNotes = Record<string, Record<Locale, ReleaseNoteGroup>>;

const NOTES: Record<UpdateChannel, ChannelNotes> = {
  fork: {
    '5.0.14': {
      zh: {
        features: [
          '个人网盘端到端加密备份与多端同步，支持 WebDAV、本地网盘目录、网盘开放平台三种方式',
          '应用内一键下载并安装更新，中国大陆自动走 Gitee 镜像',
        ],
        improvements: [
          '保存前可选择检查原文件是否仍存在',
          '两位数有序列表不再把正文挤到下一行',
          '大文件跨屏拖选不再跳回起始行',
        ],
        fixes: [
          '缩进代码块复制粘贴后自动对齐空格',
          '三击选行不再带上末尾换行符',
          '折叠快捷键改绑后原快捷键不再误触发',
        ],
      },
      en: {
        features: [
          'End-to-end encrypted backup and multi-device sync for personal cloud drives — WebDAV, a local cloud folder, or a cloud provider API.',
          'Download and install updates in-app, with an automatic Gitee mirror in mainland China.',
        ],
        improvements: [
          'Optionally check that the original file still exists before saving.',
          'Two-digit ordered list numbers no longer push the text onto the next line.',
          'Dragging a selection across a large file no longer jumps back to the start.',
        ],
        fixes: [
          'Copying from an indented code block now strips the fence alignment spaces.',
          'Triple-click selects the line without its trailing newline.',
          'Rebinding a fold shortcut no longer leaves the old one active.',
        ],
      },
    },
    '5.0.13': {
      zh: {
        features: ['Ctrl+Tab / Ctrl+Shift+Tab 按最近使用顺序切换标签页'],
        improvements: ['表格中点击任意单元格，光标直达该单元格'],
        fixes: [
          'iPadOS 从主屏幕冷启动黑屏',
          '实时模式下 Gitee 等防盗链网络图片不显示',
          'Debian 13 + KDE 打开文件对话框假死',
        ],
      },
      en: {
        features: ['Ctrl+Tab / Ctrl+Shift+Tab cycle tabs in most-recently-used order.'],
        improvements: ['Clicking any table cell puts the caret in that cell.'],
        fixes: [
          'iPadOS cold start from the Home Screen showed a black screen.',
          'Network images behind hot-link protection (Gitee and others) did not render in Live mode.',
          'Opening a file dialog froze on Debian 13 with KDE Plasma.',
        ],
      },
    },
    '5.0.12': {
      zh: {
        features: [],
        improvements: ['文件树右键菜单的展开 / 折叠 / 清除最近文件夹显示为正常文案'],
        fixes: [
          'Windows 反斜杠图片路径被错误转义',
          'Android SAF 工作区的文件夹、日记与图片在刷新后丢失',
        ],
      },
      en: {
        features: [],
        improvements: [
          'File-tree context menu shows proper labels for expand / collapse / clear recent folders.',
        ],
        fixes: [
          'Windows image paths with backslashes were escaped incorrectly.',
          'Android SAF workspaces lost folders, daily notes and images after a refresh.',
        ],
      },
    },
  },

  official: {
    '5.0.12': {
      zh: {
        features: [
          '个人网盘端到端加密备份与多端同步（WebDAV / 本地网盘 / 开放平台三种模式）',
          '应用内一键下载安装更新，中国大陆自动切换 Gitee 镜像',
        ],
        improvements: [
          '两位数有序列表防折行，大文件跨屏拖选防回跳',
          '保存前可检查原文件是否仍存在',
        ],
        fixes: [
          '缩进代码块复制粘贴对齐、三击选行、转义符显示',
          '折叠快捷键改绑后原快捷键仍误触发',
        ],
      },
      en: {
        features: [
          'End-to-end encrypted backup and multi-device sync for personal cloud drives (WebDAV / local folder / provider API).',
          'One-click in-app update download and install, with a Gitee mirror in mainland China.',
        ],
        improvements: [
          'Two-digit ordered list numbers no longer wrap; large-file drag selection no longer loops back.',
          'Optionally check that the original file still exists before saving.',
        ],
        fixes: [
          'Indented code-block copy/paste alignment, triple-click line select, escape rendering.',
          'Rebinding a fold shortcut no longer leaves the old one active.',
        ],
      },
    },
    '5.0.11': {
      zh: {
        features: ['Ctrl+Tab / Ctrl+Shift+Tab 按最近使用顺序切换标签页'],
        improvements: ['表格中点击任意单元格，光标直达该单元格'],
        fixes: [
          'iPadOS 冷启动黑屏',
          '实时模式下防盗链网络图片不显示',
          'Debian 13 + KDE 文件对话框冻结',
        ],
      },
      en: {
        features: ['Ctrl+Tab / Ctrl+Shift+Tab cycle tabs in most-recently-used order.'],
        improvements: ['Clicking any table cell puts the caret in that cell.'],
        fixes: [
          'iPadOS cold start showed a black screen.',
          'Hot-link protected network images did not render in Live mode.',
          'File dialogs froze on Debian 13 with KDE Plasma.',
        ],
      },
    },
    '5.0.10': {
      zh: {
        features: [],
        improvements: ['模拟器 / 移动端的分栏与标题栏布局更稳'],
        fixes: [
          'Windows 反斜杠图片路径被错误转义',
          'iPadOS 26 冷启动黑屏',
          'Android SAF 工作区文件夹与日记丢失',
          'Gitee 图床图片 403 不显示',
        ],
      },
      en: {
        features: [],
        improvements: ['Steadier split-pane and title-bar layout on mobile and simulators.'],
        fixes: [
          'Windows image paths with backslashes were escaped incorrectly.',
          'iPadOS 26 cold start showed a black screen.',
          'Android SAF workspaces lost folders and daily notes.',
          'Gitee-hosted images failed with 403.',
        ],
      },
    },
  },
};

/** Notes for `version` on `channel`, or null when nothing curated exists. */
export function releaseNotesFor(
  channel: UpdateChannel,
  version: string,
  lang: string,
): ReleaseNoteGroup | null {
  const byVersion = NOTES[channel];
  if (!byVersion) return null;
  const entry = byVersion[version.replace(/^v/i, '')];
  if (!entry) return null;
  return entry[lang === 'zh' ? 'zh' : 'en'] ?? entry.en;
}

/** True when the group has nothing to show in any of the three sections. */
export function isEmptyNotes(group: ReleaseNoteGroup | null): boolean {
  if (!group) return true;
  return group.features.length + group.improvements.length + group.fixes.length === 0;
}
