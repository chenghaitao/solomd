# Changelog / 更新日志

本仓库是 **[zhitongblog/solomd](https://github.com/zhitongblog/solomd)** 的 fork（**chenghaitao/solomd**）。

本文件记录 **本仓库自己的改动**、**与上游的功能点差异**，以及每次同步上游的处理过程。
上游发布的功能请见上游仓库的 Releases。

本仓库是个人使用的分支：功能与产品方向以上游为准，这里只做本地需要的改动。

几条约定：

- **版本号沿用上游的序号**，因此可能与上游重号（上游先占了 4.14.0 / 4.14.1，本仓库用
  4.14.1 / 4.14.2 / 4.14.3 与之区分）。自 5.0.0 起与上游同号，代码以上游为基线，另叠加本地改动与修复。
  **上游已合并但尚未发版的小补丁，本仓库会先走一个小版本号（如 5.0.0 → 5.0.1）**，
  因此有时会跑在上游前面。
- 拉取上游一律 `git fetch upstream --no-tags`：两边都有 `v4.13.3` 标签，带 `--tags` 会被拒或被
  `--force` 悄悄改写本地标签。
- 本仓库的 release 由 CI 产出，默认是 **draft**，需要在 GitHub 上手动 Publish 才对外可见。

---

## [5.0.12] — 2026-10-31

同步上游 `v5.0.10`（4 个提交：`f12bc98c` Windows 反斜杠图片路径、`4983ff5a` 合并 PR #496、
`834b3c01` 上游的 8 个 issue 修复、`341f5d00` 版本号）。上游在 10-31 21:00 发的这一版，
覆盖的 issue 与本仓库 5.0.11 有 4 个重叠（#486 / #489 / #493 / #494），两边是各自独立写的实现，
所以这次同步的实质工作是**在重叠项上做取舍**，而不是简单合并。

### 1. 上游新吸收的部分（本仓库此前没有）

| issue | 内容 | 落点 |
|---|---|---|
| #498 | iPadOS 26 / iOS 启动黑屏：不再递归处理内部 `WKWebView` 子视图的窗口背景色，`Info.plist` 显式补 `TaoSceneDelegate` 场景配置 | `gen/android/.../MainActivity.kt`、`src-tauri/ios-project-overlay.yml`、`src-tauri/src/ios_folder.rs`、`src-tauri/src/lib.rs` |
| #502 / #488 | Android SAF 库内的四件事：文件树建文件夹、打开 Daily Notes、把图片粘贴/插入到 `_assets/`、外部同步（Syncthing）后聚焦自动重载 | `src-tauri/src/saf_android.rs`（原生 ContentResolver 写入）、`lib/saf-fs.ts`、`lib/cm-image-paste.ts`、`composables/useDailyNotes.ts`、`composables/useFileWatcher.ts` |
| #504 | 关闭 schemeless 模糊域名自动链接，`00700.HK` / `600519.SH` / `000001.SZ` 不再被当域名加 `http://` | `lib/markdown.ts`：`md.linkify.set({ fuzzyLink: false })` |
| #496 | Markdown 里 Windows 反斜杠图片路径不再被 CommonMark 转义吃掉（`E:\photos\a.png` → `E:/photos/a.png`） | `lib/markdown.ts`：`normalizeImageBackslashPaths()`，跳过围栏代码块 |

`#504` 与 `#380`（放行 `file:` 链接）改的是同一处，两者同时保留：先关模糊链接、再挂
`validateLink` 覆写，互不影响。

### 2. 重叠 issue 的取舍

| issue | 5.0.11（本仓库） | 5.0.10（上游） | 5.0.12 采用 |
|---|---|---|---|
| #486 切 tab 滚动 | 顶部行号 `tabTopLineMemory` + `scrollDeltaForLine()` | 快照里存 `anchorPos`（文档偏移）+ `anchorViewportTop`（像素偏移） | **上游**：比行号多一层行内像素精度，且快照写入端本就存了这两个字段（自动合并后已在），本仓库的 `scrollDeltaForLine()` 成为死代码，删除。行号记忆继续保留 —— 预览面板仍在用 |
| #486 列表悬挂缩进 | `ch` 单位（marker 字符数 × `1ch`） | `em` 单位 + `cm-md-list-prefix` 内联块（`tabular-nums`） | **上游**：首行正文与续行落在同一 X 坐标，`1.`–`99.` 等宽对齐；本仓库的 `ch` 版本只能近似。外围的 prefix-span 代码在上游一侧，选 `ch` 会与其不自洽 |
| #486 复制换行 | `crlfForWindowsClipboard(text, windows)`，先并 `\r\n` 再转，`windows` 显式传参可单测 | `formatClipboardCodeText(text, windows = isWindowsDesktop())` | **本仓库**：三处调用点与本仓库单测都依赖这个名字；删掉上游那版，避免 `code-copy.ts` 里出现两份重复实现（自动合并后已重复，`isWindowsDesktop` 也被 import 两次） |
| #489 自动编号 | head/tail 双向扫描求最小区间 | 同思路的 `charCodeAt` 版本 | **本仓库**（行为等价，注释与单测更全）；上游那次 dispatch 里的 `scrollIntoView` 保光标一并吸收 |
| #493 Gitee 图片 403 | renderer + sanitizer DOM 遍历 + live-edit 三处，删掉 sanitizer 的字符串级正则兜底 | renderer 加守卫 + sanitizer 正则/DOM 两处 | **本仓库**：多覆盖实时编辑模式的 `ImageWidget`，正则兜底属于重复保险 |
| #494 右键菜单 i18n | 19 个语言文件补 key，`FileTree.vue` 兜底文案改英文 | 15 个语言补 3 个 key | **本仓库**（19 个，含本仓库独有的文案） |

### 3. 合并副作用与清理

- **i18n 重复键**：两边都在 `explorer` 里补了 `clearRecentFolders` / `expandSubtree` /
  `collapseSubtree`，自动合并后 15 个语言文件各出现 3 个重复键（`vue-tsc` 报 TS1117）。
  每个文件删掉后出现的那一份，保留本仓库 5.0.11 的文案，共删 45 行。
- **`code-copy.ts`**：删掉上游的 `formatClipboardCodeText` 与重复的 `isWindowsDesktop` import，
  只留 `crlfForWindowsClipboard`。
- **版本号**：`package.json` / `tauri.conf.json` / `Cargo.toml` / `Cargo.lock` = **5.0.12**
  （本仓库 5.0.11 已发，叠加上游 5.0.10 的内容后顺延一格）。
- **MCP 同步到 5.0.12**：`mcp-server/Cargo.toml`、`mcp-server/Cargo.lock`、
  `mcp-server/mcpb/manifest.json` 三处一起改，避免 mcpb 清单与 `--version` 输出对不上。
  MCP 服务端源码本次上游没有功能改动（只有版本号），`[lints.rust] linker_messages = "allow"`
  这条本仓库的静音配置保留。

### 4. 本仓库仍然保持的差异（本次合并未回流）

| 项 | 状态 |
|---|---|
| 去匿名遥测 | `app/src`、`src-tauri/src`、`web/src` 中无 `telemetry` / `posthog` / `plausible` / `umami` 引用 |
| 去推广 / 赞助 / 商店分发 | `web/` 只作源码同步、不发布；`app-store/`、MAS 脚本不参与本仓库 CI |
| 入口包拆分 | `vite.config.ts` 的 `manualChunks` 未改动；入口 `index-*.js` 967 kB（gzip 308 kB）。比 5.0.11 的 873 kB 大 94 kB，来自 #502 的 SAF 与图片粘贴新代码，不是分包退化 |
| 放行 `file:` 链接（#380） | `markdown.ts` 的 `validateLink` 覆写仍在，并新增回归用例 |
| 自有 CHANGELOG | 即本文件 |
| `node:test` 直接跑 `.ts` | `app/scripts/run-tests.sh` 仍是 `--experimental-strip-types` + `test-register.mjs` |
| Gitee 镜像 / nightly 统计 | 相关 workflow 与脚本仍是移除状态 |

### 5. 验证

| 项 | 结果 |
|---|---|
| `pnpm test`（node:test） | **577 passed / 0 failed**（新增 `upstream-sync.test.ts` 5 项：#504 ×2、#496、#380、#494） |
| `vue-tsc --noEmit` | 无错误（修掉 i18n 重复键后） |
| `vite build` | 成功，1m20s；入口 967 kB / gzip 308 kB，最大的懒加载块是 `chinese-convert` 与 `html2pdf` |
| Rust / 原生 | **未构建**：本机无 cargo，`src-tauri` 的 #498 / #502 原生改动（`saf_android.rs`、`ios_folder.rs`、`MainActivity.kt`）没有编译验证，需在 Windows / macOS 上跑 `pnpm tauri build` 与 Android/iOS 真机构建 |

---

## [5.0.11] — 2026-10-30

同步上游（`git fetch upstream --no-tags` 后无新增提交，基线仍是已合入的 5.0.9）后，修掉 6 个 issue：
**#479**（Android 底部空白 / 设置弹框）、**#486**（滚动恢复 / 列表缩进 / 通达信换行）、
**#489**（自动编号把光标顶出视口）、**#493**（Gitee 图片 403）、**#494**（右键菜单中文）、
**#495**（文件树横向滚动）。
另修 `build.bat`：一次构建曾产出多个版本的 MSI。

### 1. 文件树长名字改为横向滚动（#495）

不再把节点名截成 `…`。文件树面板保持原宽度，行按最长名字自然变宽，由滚动容器接管横向滚动；
`Shift + 滚轮` 主动处理，而不是依赖 Chromium 的默认映射（WebKit 上根本没有）。

| 位置 | 改动 |
|---|---|
| `FileTree.vue` | `.ftree__body` 加 `overflow-x: auto`；`.ftree:not(.ftree--fullnames)` 下 `.ftree__item` 用 `min-width: max-content`，`.ftree__name` 取消省略号（`text-overflow: clip`）；新增 `onTreeWheel`：从目标向上找第一个可横向滚动的祖先，`shiftKey` 时按 `deltaY` 推进 `scrollLeft`，真正滚动后 `preventDefault` 避免双重位移 |
| `Sidebar.vue` | 文件树所在滚动块 `overflow-x: hidden` → `auto`；置顶/最近/基底三段仍是流式宽度，不会溢出 |
| 保持原样 | `explorerFullNames`（完整名字/换行模式）下的旧省略号规则不变 |

### 2. 右键菜单显示内部命令字（#494）

`explorer.expandSubtree` / `collapseSubtree` / `clearRecentFolders` 三个 key 只在调用处写了中文兜底，
i18n 表里没有，所以 `t()` 返回 key 本身，菜单直接显示内部命令字。

- 19 个语言文件各补 3 条（英文与中文为正式文案，其余为英文占位）。
- `FileTree.vue` 的三处兜底文案由中文改为英文 —— 兜底只在 key 缺失时才可能出现，留着中文会在
  非中文界面下露出来。

### 3. Gitee 图床图片 403（#493）

Tauri 2 在 Windows 上给 WebView 的 origin 是 `http://tauri.localhost`，请求带出去的 `Referer` 被
Gitee 防盗链判为非法（`40310014 invalid Referer header`）。同一 URL 在浏览器 / Typora 里正常，
所以这不是网络问题。整页级 `<meta name="referrer">` 会顺带丢掉 OAuth 与分享链接的 referrer，
因此按元素处理：

| 渲染路径 | 改动 |
|---|---|
| `lib/markdown.ts` | `image` 渲染规则 `token.attrSet('referrerpolicy', 'no-referrer')`，`![](…)` 语法 |
| `lib/sanitize-html.ts` | `afterSanitizeAttributes` 里对 `img` 补同一属性，覆盖笔记里手写的 `<img>` |
| `lib/cm-live-blocks.ts` | `ImageWidget` 的 `img.referrerPolicy = 'no-referrer'`，实时编辑模式 |

### 4. Android 底部空白行与设置弹框尺寸（#479）

| 子问题 | 根因 | 处理 |
|---|---|---|
| 竖屏、横屏底部都有空白 | #153 为 Android 15 强制 edge-to-edge 加的系统栏 padding，在 Android 10/12 上被重复计算一次 —— 这些系统本来就把 Activity 排在系统栏之下 | 新增 `lib/android-insets.ts`：用 `window.innerHeight` 与 `screen.height` 比对判断系统栏是否真的压在 WebView 上，只有压上才 pad；`App.vue` 在 `resize` / `orientationchange` 时重测（旋转后横竖屏结论不同） |
| 设置弹框在手机上 ✕ 被顶边裁掉 | `.ds-modal__panel` 只吃 `env(safe-area-inset-*)`，Android WebView 里它是 0 | padding 改 `max(env(safe-area-inset-top, 0px), var(--android-safe-top, 0px), 8px)`；窄屏下关闭按钮 28 → 36px |
| 平板上弹框太小 | 面板固定 820px，在 820–1100px 视口里要么溢出要么缩在角落 | `601–1100px` 断点用 `width: min(94vw, 900px)` |

该 issue 的第 2 条（Android 自定义字体输入字体名无效，需要枚举系统字体给用户选）不在本次范围，
单独跟踪。

### 5. 滚动恢复、列表缩进、代码块复制（#486）

| 子问题 | 根因 | 处理 |
|---|---|---|
| 切回文档滚动位置不稳定，光标有时整个跑出视区 | 只按保存的 `scrollTop` 像素值恢复。离场期间上方内容一旦改变高度（图片解码完成、表格重测、折叠展开），同一像素值就落在别的行上，所以每次结果不同 | `Editor.vue` 改以「顶部行号」为锚点：`getViewLine()` 本来就存了 `tabTopLineMemory`（含行内偏移比例），恢复时用 `scrollDeltaForLine()` 按当前布局算出该行应在的位置，760ms 的稳定窗口内反复校正；像素值只作首帧近似 |
| 有序列表续行比首行多缩进一点 | `#469` 的悬挂缩进用 em 估算（`markCols * 0.58`），与实际「marker + 一个空格」的宽度差零点几个字符 | `cm-live-render.ts` 改用 `ch`：等宽编辑区里 `padding-left / text-indent` 取 `(缩进 + marker 字符数 + 1)ch`，任何字号下都落在正文起始列 |
| 代码块「复制」粘到通达信变成一行 | Windows 传统编辑器按 CRLF 解析 `CF_UNICODETEXT`，WebView 写进去的是纯 LF | `code-copy.ts` 新增 `crlfForWindowsClipboard()`：仅 Windows 桌面把 `\n` 归一成 `\r\n`（先并 `\r\n`，避免 `\r\r\n`），三条复制路径（预览、实时编辑、纯文本块）共用 |

### 6. 自动编号把编辑位置顶出视口（#489）

在长笔记下部用 `Ctrl+5` 插一个 5 级标题、开始输入标题文字时，编辑位置会突然跳到可视范围之外。

| 环节 | 事实 |
|---|---|
| 触发点 | `Editor.vue` 的 350ms 内容同步里，`settings.autoNumberHeadings` 为真就调一次 `autoNumberHeadings(doc, …, 'add')` |
| 原来的返回值 | `from: 0, to: doc.length, insert: 整篇文档` —— **全文替换** |
| 为什么跳 | 新标题获得 `1.2.1.1.1 ` 前缀后变长，行在视口底部时跨过软换行边界、行高 +1，而 `scrollTop` 不变，光标被挤到视口下方；程序化 dispatch 不会自己滚动 |
| 为什么卡 | 全文替换让 CodeMirror 丢掉全部 decoration、重测整篇（笔记里的大表格尤其明显），撤销历史也退化成"一步撤整篇" |

修复两处：

- `lib/editor-commands.ts`：`autoNumberHeadings` 返回**最小差异区间**（裁剪公共前缀/后缀）。给单个标题补前缀时变成一处 10 字符的纯插入，文档其余部分不产生变更。
- `Editor.vue`：那次 dispatch 补 `EditorView.scrollIntoView(selTo, { y: 'nearest', yMargin: 16 })` —— 光标真被挤出视口时拉回，在视口内则不动。

原先断言"`insert` 等于整篇文档"的 4 个单测改为对「应用 edit 后的文档」断言，新增一例专门覆盖 #489 的场景（编辑区间必须落在最后一行内）。

### 7. 构建脚本产出多个版本的 MSI

`tauri build` 只往 `bundle\msi` 追加、从不清理，第 5 步又用 `*.msi` 通配复制，于是历史安装包被
一起搬进 `local_build_output`。

- 读 `app/package.json` 得到 `APPVER`，构建前清空 `bundle\msi\*.msi`；
- 只复制 `SoloMD_<APPVER>_*.msi`；
- 复制后清扫 `local_build_output` 里版本或架构不匹配的 MSI / portable zip / 暂存目录。

### 验证

| 项 | 结果 |
|---|---|
| `pnpm test` | 572 passed / 0 failed（新增 `code-copy.test.ts` 7 项、`android-insets.test.ts` 6 项、`image-referrer.test.ts` 3 项、#489 回归用例 1 项） |
| `vue-tsc --noEmit` | 无错误 |
| 版本一致性 | `package.json` / `tauri.conf.json` / `Cargo.toml` / `Cargo.lock` 均为 5.0.11 |
| MSI 构建 | `build.bat` 通过，产出 `SoloMD_5.0.11_x64_en-US.msi`（14.90 MiB）与 `SoloMD_5.0.11_x64-portable.zip`；构建过程中旧的 `5.0.10` MSI / zip 被自动清扫 |

---

## [5.0.10] — 2026-10-27

修 5.0.9 里的一个 P0：分栏模式下右侧预览正常、左边编辑区整块空白。根因是上游 5.0.7 批次带进来的
一个 CodeMirror 选择器，本仓库在 5.0.9 首次合入；同一提交里的 Android SAF 图片路径修复一并带上。

### 1. 编辑区空白（#477）

分栏模式下右侧预览渲染正常，左侧连行号都没有；实时与源码模式同样空白，多开几个标签也一样。

| 环节 | 事实 |
|---|---|
| 出错代码 | `Editor.vue` 的 `activeLineExtension()` 写了 `'&dark .cm-content .cm-line.cm-activeLine'` |
| 为什么炸 | `&dark` 只在 `EditorView.baseTheme` 里合法；放进 `EditorView.theme()` 会在建 view 时抛 `RangeError: Unsupported selector: &dark` |
| 为什么必现 | `settings.highlightCurrentLine` 默认 `true`，`buildExtensions()` 无条件调用 `activeLineExtension(true)`，`EditorView` 构造中断 |
| 为什么右半边正常 | 预览是独立组件，不经过 CodeMirror |
| 何时进来 | 上游 `b6ab0768`（5.0.7 批次，#467 的暗色活动行着色）；5.0.5 没有这一行，5.0.9 首次合入 |

修复与上游 `84888e29` 一致：

- `activeLineExtension` 从 `Editor.vue` 移到 `lib/themes.ts`，选择器改 `&.cm-dark` —— `mkTheme()` 的
  `{ dark: isDark(bg) }` 会给出 `cm-dark` class，暗色主题落到暗色分支，其余仍是浅色分支。
- 新增 `lib/themes.test.ts`：8 个内置主题 × 自定义两态各建一次 `EditorState`。原来的 540 个测试
  没有一例会实例化 CodeMirror 的 theme，所以全绿也没拦住这类问题。

### 2. Android SAF 相对路径图片（#476）

| 区域 | 内容 |
|---|---|
| `lib/image-resolve.ts` | `saf:` 路径参与 `.` / `..` / 连续斜杠归一；`/storage/emulated/0/…` 与 `/sdcard/…` 映射成 `saf:primary:…`；按当前工作区 tree 解析成 data URL 并做内存缓存 |
| `lib/cm-live-blocks.ts` | 实时模式的图片块走同一条解析链 |
| `app/src-tauri/src/saf_android.rs` | 新增 `saf_read_base64` 命令，返回 SAF 文件字节 |
| `MainActivity.kt` | 对应的 Java 侧实现 |

桌面端无感，只在 Android（SAF 工作区）生效。

### 验证

| 项 | 结果 |
|---|---|
| `node --test` | **543 / 543**（5.0.9 = 540） |
| `vue-tsc --noEmit` | 退出 0 |
| `vite build` | 入口 **945.38 kB**（gzip 301.45 kB），vendor **1,738.17 kB** 不变 |
| `cargo check` | 通过，仍只有 `TIP_PRODUCT_IDS` 一条上游自带 warning |
| 选择器对照 | `EditorView.theme({'&dark …'})` → `RangeError: Unsupported selector: &dark`；改成 `{'&.cm-dark …'}` → 正常 |

### 说明

- **不重打 5.0.9**：它已经发布并有下载，重打 tag 会让已下载的包与 tag 对不上，这版单独发 5.0.10。
- 关掉 `highlightCurrentLine` 理论上能躲开，但 `settings.ts` 的 `v507HighlightLineMigrated` 迁移会把
  它强制置回 `true`，所以这是默认必现，不是某些配置才踩。

---

## [5.0.9] — 2026-10-27

两条线：**多标签活动态重做**（本仓库），以及**同步上游 18 个提交** —— WebDAV 同步、Excel / WPS 表格粘贴、
有序列表编号、每份文档的滚动位置、文件树的一批交互、表格编辑器快捷键，外加 Ivory Amber 主题与
MiniMax M3.1 Flash 默认。

### 1. 多标签活动态

多开几个文件以后，标签条就是一排几乎一样的胶囊：当前那个坐在 `--fill-1`（浅色 5% / 深色 7% 的文字色）上，
与窗格自身底色只差一根头发，文件名用 `--text`、字重 540。不看正文就分不出正在编辑哪一份。

现在按 VS Code 的层次重做：

| 项 | 改前 | 改后（浅色 / 深色） |
|---|---|---|
| 底色 | `--fill-1` 5% / 7% | `--tab-active-bg` **10% / 13%**，悬停 14% / 17% |
| 文件名 | `--text`，字重 540 | `--tab-active-fg` **#12110F / #FBFAF7**，字重 500 |
| 区分标记 | 无 | 顶边 2px accent 线（`#B4561B` / `#F4A26B`），`::before` 画在圆角内 |

- 字重只从 450 提到 500：再重就会改变文件名宽度，切换标签时整条 tab 条跟着左右抖。
- 四个 token 写进 `tokens.css` 的三层。派生层用 `color-mix(--text)` 与 `--accent`，Nord / Solarized /
  Monokai / Dracula / Ivory Amber 与 marketplace 主题自动跟随，不需要逐个列颜色。
- `docs/v5-ui-spec.md` 的 token 表去掉 `--fill-2` 旧的「active tab」用途，补上这四个。

### 2. 上游 5.0.6 批次（#455–#466）

| 区域 | 内容 |
|---|---|
| WebDAV 同步 | 设置页新增一节 + `webdav_sync.rs`（#458） |
| 表格 | 从 Excel / WPS 复制的选区粘进编辑器直接转 Markdown 表格（#460） |
| 有序列表 | 标题打断后编号重新开始，手工改过的序号也按同一规则归一（#466） |
| 阅读位置 | 预览模式下每份文档各自记住读到哪（#456） |
| 实时模式 | 代码块内的块级扫描全部失效，vue fence 里的 `<div>` 不再被当 HTML 渲染（#457）；表格可以中断引用块（#464） |
| 设置页 | 搜索结果按方向键移动时滚到可视范围（#465） |
| 快捷键 | 快捷键列表可绑定「切换预览模式」（#459） |
| 移动端 | iPad 底部安全区（#461） |
| Mermaid | 内嵌链接的悬停提示（#462） |

### 3. 上游 5.0.7 批次（#383–#406、#467–#475）

| 区域 | 内容 |
|---|---|
| 阅读位置 | 切换文档后滚动位置不再丢失（#467）；实时 / 源码 / 预览之间切换也各自记住（#406） |
| 标签页 | 右键菜单补「复制路径」（#385）；溢出按钮的全量列表加筛选框，关闭类操作跳过已固定的标签（#398） |
| 查找 | `Ctrl/⌘+F` 再按一次关闭面板，有选区时留在框内（#389） |
| 表格 | 插入表格可直接输入行列数（#387）；表格编辑器支持方向键 / Tab 移动与增删行列的快捷键（#383） |
| 有序列表 | 序号与正文分列对齐，另给几种编号样式（#469） |
| 章节编号 | 标题按层级自动编号，可选开关（#474） |
| 文件树 | 单击改为双击打开（#403）；已打开的文件加标记（#399）；文件夹节点显示笔记数（#404）；右键「展开 / 折叠」（#400）；「最近打开的文件夹」可清空（#405） |
| 只读文档 | 保存失败提示更醒目，关闭时弹「另存为」而不是静默丢弃（#468） |
| 缩放 | 缩放后屏幕中央淡出一个比例提示（#475） |
| 设置 | AI 改写提供商下拉框不再撑破卡片（#470） |

### 4. 其他上游改动

| 提交 | 内容 |
|---|---|
| `7cd9ebfd` | 社区主题 **Ivory Amber** |
| `4422d284` | MiniMax 默认模型改为 **M3.1 Flash** |
| `972e825a` | 中英双语的问题反馈模板 |
| `cce80c45` | winget 清单去掉 `.txt` 关联 |
| `1dc84185` | macOS 的 dmg 容器签名后公证并装订 |
| `1fa85707` | 官网 5.0.5 文案、What's New、FactPack、llms.txt |

### 5. 合并处置

冲突 10 处：

| 文件 | 处置 |
|---|---|
| `README.md` / `README.zh.md` / `web/public/sponsors.json` | 取本仓库侧 |
| `app/package.json` / `tauri.conf.json` / `Cargo.toml` / `Cargo.lock` | 取本仓库侧（合并时仍 5.0.5，bump 在最后一笔） |
| `app/src/components/Editor.vue` | 取上游 #389 的完整 Mod-f 切换，删掉本地的 `toggleSearchPanel()` 与 `onPlainFindBarKeydown()` —— `cm-find-panel.ts` 已接管这个键，两套并存会互相抵消 |
| `app/src/components/SettingsPanel.vue` | 保留本仓库的可拖拽高度，把上游新加的固定 `height: clamp(480px, 68vh, 660px)` 改成 `height: auto`（只留 `max-height`），否则量尺拖不动 |
| `app/src/lib/markdown.ts` | 两块都留：本地 #380 的 `file:` 协议放行 + 上游 #464 的表格中断引用块 |
| `app/src/App.vue` | 上游 iPad 不抢焦点（`if (!isMobile())`）+ 本地 `refreshMissingFiles()` |
| `app/src/components/PaneTabBar.vue` | 本地 `tab--missing` 与上游 `tab--pinned` 并存，两段 CSS 拼接 |
| `app/src/components/Preview.vue` | 保留本地的 #389 注释 |

### 验证

| 项 | 结果 |
|---|---|
| `vue-tsc --noEmit` | 退出 0 |
| `node --test` | **540 / 540 通过**（5.0.5 = 522） |
| `vite build` | 成功，入口 `index-*.js` **942.25 kB**（gzip 300.42 kB） |
| vendor 分包 | **1,738.17 kB / gzip 530.02 kB**，与上一版逐字节一致 |
| `cargo check` | 通过，1 warning：`TIP_PRODUCT_IDS` 未使用（上游自带） |
| `cargo build --bin SoloMD` | 成功 → `target/debug/SoloMD.exe` 47.8 MB |
| `astro build`（`web/`） | **111 个 HTML 页**；无 `/promote` 路由，`api/track` / `ref_download` 无载荷（历史博客正文除外） |

### 说明

- **版本号取 5.0.9**：上游在这轮里 bump 到 5.0.5 / 5.0.6 / 5.0.7，本仓库验证期间上游又发了 `v5.0.8`
  （只有版本号那一个提交），按撞号规则取下一个空号。
- **#455「设置窗口固定半屏」不采纳**：设置面板高度在本仓库是可拖拽的量尺（`--settings-h`，钳 280–1400），
  固定成 `clamp()` 会让手柄变成摆设。
- **#389 取上游实现**：Mod-f 的「开 / 关、有选区留在框内」逻辑上游已经完整做掉，本地那套 `toggleSearchPanel()`
  一并删除，同一个键不保留两套处理。
- 官网上游这轮只动了文案与 What's New，`web/` 里没有新增推广页或埋点路由。

---

## [5.0.5] — 2026-10-22

一条线：**同步上游 10 个提交** —— 应用内三档打赏与 ✨Supporter 徽章、Play Billing 8.0.0、
`#442`–`#454` 一批修复（含 Android R8 / EdgeToEdge、iPhone Duo 适配、图片尺寸语法），以及官网的 5.0.4 文案。

### 1. 应用内打赏与 Supporter 徽章

上游在这一版把「支持开发者」从一个链接做成了完整流程：

| 项 | 内容 |
|---|---|
| 入口 | 关于对话框 →「支持开发者」→ `SupportDialog.vue`；设置页同一条路径 |
| 档位 | 三档**一次性**打赏（非订阅、不自动续费），买任意一档即永久解锁 ✨Supporter 徽章 |
| 徽章 | 跨设备可恢复（`iap.rs`，macOS App Store / iOS / Android 三个商店通道） |
| 非商店构建 | 走 GitHub / 支付宝 / 微信，`iapUseStoreFlow` 决定显示哪一套 |
| 依赖 | Android Play Billing 升到 8.0.0（Google Play 合规要求） |

本仓库不做商店分发，这块跟随上游同步：代码与文案照收，应用内原有的赞助者 / 测试者致谢不变。

### 2. `#442`–`#454` 修复批次

| 区域 | 内容 |
|---|---|
| 图片尺寸 | 新增 `![alt\|50%](url)`、`![\|300](url)`、`![alt\|400x300](url)` 的管道尺寸语法；实时预览、HTML / PDF / 图片导出统一走 `parseImageAltSize()`（#446） |
| 代码块 | 独立 HTML 导出与打印补上软换行（`cb-wrap-on`）与行号（`cb-numbered-on`）的 CSS（#454） |
| 打印 | 打印遮罩按同一套代码块规则生成，行号列不再撑出页边 |
| 编辑 / 标签页 | `cm-live-blocks.ts`、`tabs.ts`、`welcome-tour.ts` 的若干小修 |
| 平台 | Android R8 混淆规则与 EdgeToEdge 边缘到边缘布局；iPhone Duo 的屏幕尺寸适配 |

### 3. 合并处置

冲突 10 处：

| 文件 | 处置 |
|---|---|
| `README.md` / `README.zh.md` / `web/public/sponsors.json` | 取本仓库侧 |
| `scripts/asc-upload-screenshots.py` | 本仓库早已删除，保持删除 |
| `app/src-tauri/src/lib.rs` / `runner.rs` | 取上游的 `iap` 注册 |
| `app/src/components/AboutDialog.vue` | 取本仓库侧：不留 promoters 名单与「帮忙推广」按钮 |
| `app/src/components/TableEditor.vue` | 两侧都要：上游的 `syncDomCellsToModel()` + 本地的提示复位 |
| `app/src/lib/markdown.ts` | 保留本仓库的 `.ts` 后缀导入，加上游的 `parseImageAltSize` |
| `app/src/lib/md-format.ts` | `FORMAT_KINDS` 取本仓库（含下标 / 上标）；函数段留本仓库 `toggleTag` + 上游 `toggleTagLines`（多行下划线），丢掉上游 `toggleTagWrap` 与重复的 `case 'underline'` |

三个不在冲突里、但会被 `vue-tsc` / `cargo` 当场拦下的问题：

| 问题 | 现象 | 处置 |
|---|---|---|
| `store_review` 被上游整文件带回 | 该模块的文件本仓库已删，`cargo check` 报模块不存在 | 删掉 `lib.rs` / `runner.rs` 里的 `mod` 与命令注册 |
| i18n `cmd.fmt.underline` 重复键 | 自动合并两边各留一份，15 个语言全报 TS1117 | 每个语言删一份 |
| `md-format.ts` 少一个 `}` | 拼接「本仓库函数 + 上游函数」时闭合括号落在上游那侧 | 补回 |

### 验证

| 项 | 结果 |
|---|---|
| `vue-tsc --noEmit` | 退出 0 |
| `node --test` | **522 / 522 通过** |
| `vite build` | 成功，入口 `index-*.js` **919.27 kB**（gzip 293.24 kB） |
| vendor 分包 | **1,738.17 kB / gzip 530.02 kB**，与上一版逐字节一致 |
| `cargo check` | 成功（3m37s），1 warning：`TIP_PRODUCT_IDS` 未使用（上游自带） |
| `astro build`（`web/`） | 成功，**111 个 HTML 页**；无 `/promote` 路由，无 `api/track` / `ref_download` 载荷（历史博客正文除外） |

### 说明

- **版本号取 5.0.5**：上游在这轮里也 bump 到了 5.0.4，与本仓库已经发布的 5.0.4 撞号。
- 官网上游新增的「In-App Tip Jar & Supporter Badge」板块、以及 What's New 里「致谢推广者」的条目，**都保留** —— 
  它们只存在于 `web/`。`tauri.conf.json` 的 `frontendDist` 指向 `app/dist`、`bundle.resources` 只有拼写词典，
  官网整棵目录不进安装包；`AboutDialog` 的赞助者 / 测试者名单也是运行时从 `solomd.app/sponsors.json` 拉取。
  实测构建产物里 `promoters` / `推广者` / `Tip Jar` / `打赏` 均为 0 命中。
- 应用内那个打赏弹窗（`SupportDialog`）会出现在包里 —— 它是功能入口，不是官网文案。

---

## [5.0.4] — 2026-10-20

一条线：**把格式栏的表格入口补齐** —— 尺寸对话框与网格编辑器各归各位，表格编辑器的对齐组补上说明；
**同步上游 17 个提交**（LanguageTool 语法检查、1013 反馈批次、Word 导出与平台修复、CodeMirror 源码模式回归，
以及打印 / 导出 / 字体 / Mermaid / 输入法修复）。

### 1. 格式栏的表格入口

表格图标的悬停面板原本只有网格拖拽与「可视化编辑…」两条通道，而后一条**接错了线**：它派发的是
`insert.table`，弹出来的还是插入尺寸对话框，网格编辑器从工具栏根本进不去。现在四条通道各司其职 ——

| 操作 | 结果 |
|---|---|
| 点表格图标 | 打开尺寸对话框（`insert.table`） |
| 悬停网格按住拖拽 | 直接插入对应尺寸的表格 |
| 「自定义表格…（3 × 2）」 | 打开尺寸对话框（新增一行） |
| 「可视化编辑…」 | 打开**网格编辑器**（`editor.tableEditor`），编辑光标所在的那张表 |

- **括号里的数字取 `INSERT_TABLE_DEFAULT_COLS/ROWS`（3 × 2）**，即对话框实际打开时的默认值。
  `#387` 定下对话框不记忆上次尺寸，所以这里不能填网格读数 —— 那会承诺一个对话框不会显示的尺寸。
  新键 `formatBar.tableCustom`，带 `{cols}` / `{rows}` 占位符，15 个语言。
- 「可视化编辑…」排在「自定义表格…」之后，顺序与插入的先后习惯一致（先定尺寸，再改内容）。
- `editor.tableEditor` 只编辑**光标所在**的表格，不在表格内时走既有提示 `tableEditor.notInTable`。

### 2. 表格编辑器对齐组的提示

四个对齐按钮此前只有字形、没有 `title`，悬停什么都不显示（行 / 列的增删按钮本来就有）。补齐 4 个键，
15 个语言：`tableEditor.alignDefault` / `alignLeft` / `alignCenter` / `alignRight`。

留空的那一项读作**「默认对齐」而不是「左对齐」** —— 它的实际含义是分隔行不加冒号、由阅读器决定对齐方式，
写成「左对齐」会与实际行为不符。

### 3. 同步上游 17 个提交

分两轮落地：前 14 个提交（LanguageTool、1013 反馈批次、Word 导出与平台修复、CodeMirror 源码模式）先合入并
单独验证过一轮；随后上游又推了 3 个提交（打印与导出批次、字体 / Mermaid / 输入法、导出 CSS 单测），一并进这一版。

| 上游提交 | 内容 | 处置 |
|---|---|---|
| `874aa491` / `a3f159cb` | **LanguageTool 语法与风格检查**（本地服务、Premium、公共 API 三种接法；`cm-languagetool.ts` 装饰层、`lt-annotate.ts` 标注、设置页一节） | 取用（产品功能，+4,083 行） |
| `1aba1d7a` | 1013 反馈批次：CJK 双击分词（`Intl.Segmenter`）、非编辑区屏蔽默认右键菜单、设置搜索框焦点环、单文件时侧栏「上一级」按钮、纯文本编辑器 IME 组合键（#416）、分栏视图焦点滚动（#414）、切换笔记时关闭 Inbox / Bases / TypeLens 浮层（#411）、行内并排 `<img>`（#257）、PDF 导出遮罩 `pointer-events`（#378）、CJK 校对批量应用前确认 | 取用 |
| `493fc6bd` | CodeMirror **纯源码模式回归**修复；幻灯片加浅色主题与字号缩放 | 取用（回归修复） |
| `a7dc9457` | Word 导出列表编号与复制为 Word（#427）、iPadOS 设置页与外观（#425 #426）、macOS 文件夹授权（#428）、Windows ShellNew（#429）、DevTools 快捷键（#423） | 取用 |
| `8b4384ab` | 撤销上一版「下载链接回退到 5.0.0」 | 取用（官网） |
| `68b5d1fd` `d89a1081` `7d9ee76b` `fbdfae77` | 上游把版本号 bump 到 5.0.2，并同步官网、`Cargo.lock`、mcpb manifest | **以本仓库为准**，app 保持 5.0.4 |
| `f7f90a53` `78576de7` `1751eef2` `66dddd9c` | 上游 bump 到 5.0.3，官网文案同步，`release.sh` 里补 `Cargo.lock` / mcpb manifest 同步与 iOS `AccentColor`，MAS 版本默认取 `package.json` | 版本号同样以本仓库为准；脚本与官网文案取用 |
| `43d54e8c` | **打印与导出批次**：独立的「打印…」（`file.print`，菜单栏 / 命令面板 / 快捷键三处入口，默认不占键位）、实时预览里裸链接按链接样式渲染（#431）、复制为 Word 的列表排版（#432）、LaTeX `\[…\]` 与 `\(…\)` 定界符（#433）、Windows 最大化时关闭按钮的圆角（#434）、编辑器与预览的顶部留白（#435 #440）、自定义 CSS 进 HTML / PDF 导出（#439） | 取用 |
| `4284d196` | **字体 / Mermaid / 输入法**：Android 端读取 `/storage/emulated/0/Fonts` 下的自定义字体（#438）、Mermaid 标签里 `@` 与括号的引号处理、Windows 输入法组合期恢复（#276） | 取用 |
| `d553f67d` | 自定义主题导出 CSS 的单测；修 E2EE 集成测试的 import 路径 | 取用 |

上游对官网（`web/`）这轮只有文档与文案更新，没有带回遥测或推广相关内容 —— 合并后 `promote` 页面、
`api/track`、`ANALYTICS.md` 依旧不存在，隐私页也没有「匿名统计」表述。`app-store/` 本轮零改动。

### 4. 合并冲突处置

| 文件 | 处置 |
|---|---|
| `README.md` / `README.zh.md` / `web/public/sponsors.json` | 取本仓库侧 |
| `app/src/stores/settings.ts` | 两边都留：本地对 `telemetryEnabled` / `telemetryNoticeAck` 的清理迁移 + 上游新增的 `v503SourceModeMigrated`（把旧的 `livePreview=false` 迁到 `viewMode`） |
| `app/src/components/SettingsPanel.vue` | 设置搜索框焦点环的裁切，两边都动过：保留本地的 sticky 搜索行（`padding: 6px 24px 12px`、背景 `var(--bg)`），同时接受上游收紧的表头内边距，两者叠加后总间距 12px |
| `app/src/components/Slideshow.vue` | 保留本地已多语言化的模板，把上游新增的控件移植进来：主题切换、字号缩放（− / % / +）、两行帮助与改写的提示语，新增 7 个 `slideshowHelp` 键（15 个语言）；`readInitialThemeAndLang` 的返回值收敛为 `{theme}`，随之删掉已无用的 `isZh` |
| `app/package.json`、`src-tauri/Cargo.toml`、`Cargo.lock`、`tauri.conf.json` | 版本号取本仓库侧（5.0.4），不跟随上游的 5.0.2 / 5.0.3 |
| `app/src/composables/useExport.ts` | 取上游新增的 `forcePrintDialog` 参数（「打印…」需要强制弹系统打印框），只去掉夹在参数行后面的 `track('file_exported')` 调用 |
| `app/src/lib/cm-live-render.ts` | 取上游按**位置**判定链接目标的实现（`URL` 紧跟 `(` 才算目标），它同时覆盖本地 #395 的两种例外并新增裸链接样式；本地 `isLinkDestinationUrl()` 因此失效，`lib/link-destination.ts` 与其单测一并删除 |
| `app/src/lib/word-clipboard.ts`、`word-clipboard.test.ts` | 取上游版本：`#432` 把 `ol` / `ul` 整段转成挂缩进段落，取代本地只给 `<ol>` 补 `start="1"` 的做法 |

### 验证

| 项 | 结果 |
|---|---|
| `vue-tsc --noEmit` | 退出 0 |
| `node --test` | **514 / 514 通过**（含上游 LanguageTool、Mermaid 引号、导出 CSS 新增用例） |
| `vite build` | 成功，入口 `index-*.js` **907.01 kB**（gzip 289.71 kB） |
| vendor 分包 | **1,738.17 kB / gzip 530.02 kB**，与上一版逐字节一致 |
| `astro build`（`web/`） | 成功，**111 个 HTML 页**；无 `/promote` 路由，产物里没有 `api/track` / `ref_download` 载荷（仅历史博客文章正文提到过 `api/track`） |

### 说明

- **版本号取 5.0.4**：上游已发布 5.0.2 / 5.0.3，tag 已被占用。
- 本文件的叙事口径本版做了统一：只记录**本地做了什么、为什么这么做**。功能与产品方向以上游为准，
  这个仓库只保留自己需要的那部分改动。
- 上游的 `#378`（PDF 导出遮罩挡住窗口拖动）与本仓库记录的 `#378`（Windows 窗口阴影）是同一个 issue 编号下的
  两件事，互不覆盖，都在。
- 上游 `#431` 的裸链接样式与本地 `#395` 的两种情况是同一处代码：本版统一到上游按位置判定的写法，
  「自动链接」与「URL 当链接文本」两种例外仍然可见，本地那份 `link-destination.ts` 就此退场。
- `web/` 这一轮上游只改文案，`app-store/` 零改动；官网下载链接仍指向上游仓库的 release，沿用上游页面未作改动。

---

## [5.0.3] — 2026-10-14

一条线：**撤销 5.0.2 刚上的自研「修复格式」引擎**（一次点击连带改多处、不可控），**同步上游 5 个提交**，
并把 **`web/` 官网与 `app-store/` 商店素材恢复与上游保持一致** —— 同步之后再贴回本仓库对官网的本地改动。

### 1. 撤销自研的 Markdown「修复格式」引擎

5.0.2 把一套自研的 Markdown 语法修复引擎接到了工具栏的星形按钮上。**实测后决定整套撤掉**：一次点击会同时
改写多处，改了什么、对不对都没法逐条审阅。最典型的一次误判 ——

| 现象 | 原因 |
|---|---|
| 表格里**含引号的单元格**，修完「多处一列引号」 | 表格重建按 `\|` 切单元格，**没有把引号内的 `\|` 排除在分隔符之外**，该行被当成多一列，再按最宽行补齐 |

| 处置 | 内容 |
|---|---|
| 删除 | `app/src/lib/md-repair.ts` 与其 31 例测试（两者已随 5.0.2 发布）；以及尚未入库的报告层 `lib/repair-report.ts`、`stores/repairBanners.ts`、`components/RepairBanners.vue` |
| 摘除全部注册点 | `lib/keybindings.ts`、`composables/useShortcuts.ts`、`lib/app-menu.ts`（「格式 → 修复 Markdown 语法」）、`components/FormatBar.vue` |
| 还原 | 星形按钮回到 **`format.markdown`（Prettier 重排）** —— 这个命令原本、也是唯一的功能；`App.vue` 与 `stores/tabs.ts` 与 5.0.2 之前逐字节一致 |

**上一轮唯一保留的成果**：格式化命令的 6 条提示（`noDocument` / `markdownOnly` / `stale` / `already` / `done` /
`failed`）改走顶层 `format.*` 键，**15 个语言全部有译文**（原先无论界面语言都是英文）；同时删掉两个已死的键
`cmd.format.repair`、`formatBar.repair`。

⚠️ **不要再引入这种「一次点击整理多处」的修复 / 自动整理功能** —— 已明确否掉。

### 2. 同步上游 5 个提交

| 上游提交 | 内容 | 处置 |
|---|---|---|
| `371f37fd` | `fix(sidebar): show sidebar collapse button on Windows and Linux too` | **取用**（真实产品修复） |
| `78dc6479` | 致谢名单补一位测试者 | 取用（名单数据） |
| `1889ef67` / `46af04ee` | 上游把版本号 bump 到 5.0.1（含 `mcp-server`） | **以本仓库为准**，app 保持 5.0.3 |
| `73c88c2d` | 官网下载链接回退 5.0.0、等 5.0.1 发版 | 由第 3 节的整目录同步吸收 |

README（中英）与 `web/public/sponsors.json` 的冲突按 **本仓库一侧** 解决。

### 3. `web/` 与 `app-store/` 恢复与上游同步（同步的同时保留本地改动）

做法是**先整目录取上游**（`git checkout upstream/main -- web app-store`），再把本仓库对官网的本地改动
**逐处重新贴回**（补丁 `git apply` 打不上 —— 上游相关行已重构，改为逐条精确替换）。

| 目录 | 规模 |
|---|---|
| `app-store/` | **369 个纯新增、0 删除**：4.14.5–4.14.11 各语言发版说明 + `app-store/v5/` 商店素材（截图、`shared.json`） |
| `web/` | 59 个文件（24 新增 / 35 修改）：官网样式、v5 截图、i18n、隐私 / 安全 / 设置文档页 |

同步后**必须再贴回**的部分（否则会被上游内容覆盖）：

| 不纳入的内容 | 涉及文件 |
|---|---|
| 遥测服务端 | `web/functions/api/track.ts`、`web/functions/api/admin/stats.ts`、`web/ANALYTICS.md` |
| 推广计划页与组件 | `components/Promote.astro`、`pages/promote.astro`、`pages/zh/promote.astro`；`lib/supporters.ts` 里的 promoter 与 `PROMOTE_*` 常量 |
| 首页推广横幅 | `Hero.astro` 的 `PROMOTE_BANNER` 与 `.brand-update-banner` 样式 |
| 返利码埋点 | `Layout.astro` 里那段 `?ref=` → `/api/track` 的 `sendBeacon` 脚本 |
| 赞助组件里的推广块 | `Sponsor.astro` 的 `.promote-card` / `.promote-featured` / `.promote-quote`；致谢页的「推广者 / Promoters」分区 |
| 官网文案 | 隐私政策（中英）、安全白皮书（中英）、`FactPack`、`translations.ts`、对比页 —— 统计相关表述改为与实际行为一致 |

### 验证

- `vue-tsc --noEmit` 干净；`bash app/scripts/run-tests.sh` **490 / 490 通过 / 0 失败**（5.0.2 为 521：本轮 −31 例 `md-repair`）。
- `vite build` 成功，入口 `index-*.js` **869.39 kB**（5.0.2 因修复引擎为 874.51 kB；回到撤销前基线
  869.36 kB 之上 +0.03 kB，差量来自上游合并进的 `Sidebar.vue`）；稳定分包 **1,738.17 kB / gzip 530.02 kB**
  与各版本逐字节一致。
- 官网 `astro build`：**111 个 HTML 页面全部生成**；产物里 `/promote` 路由、`api/track` 与 `ref_download` 埋点**均已消失**。
- `cargo check` 通过（`solomd v5.0.3`）；上游合并只在 `Sidebar.vue` 动了一处 UI 条件，无 Rust 改动。

### 说明

- **本版把「上游同步」拆成了两笔提交**：一笔是纯上游内容（`web/` + `app-store/`），另一笔是对官网的
  本地改动。撤销修复引擎另有独立提交，互不混装，便于逐笔审阅。
- 官网那篇文章 `blog/v3-5-5-font-fix-self-hosted-analytics` 仍保留原样 —— 它是历史记录，写法上提到
  `api/track` 与 `web/ANALYTICS.md`，这两者在本仓库已不存在；如需一并改写请单独提。

---

## [5.0.2] — 2026-10-14

一条线：**本仓库自研改动，无上游同步**。六件事 —— 新增**页面内格式工具栏**（设置里可关）；
设置页高度改为可拖拽调整，基础页的 29 项设置搬进新的「编辑」分类；「设为默认编辑器」的提示不再固定英文；
窄窗口下标题栏不再压住菜单栏；标签页标出已经被删掉的文件；「修复格式」换成一个真的会修 **Markdown 语法**
的自研引擎（原先只是 Prettier 重排）。

### 1. 「设为默认 Markdown 编辑器」的提示不再固定英文

`set_as_default_markdown_editor` 原先直接返回**已经拼好的英文句子**
（`Ok("Set as default for 4 Markdown type(s)…")` / `Err("LaunchServices rejected the request…")`），
前端 `toasts.success(msg)` 原样弹出 —— 无论界面语言是什么，这条提示永远是英文。

| 层 | 改动 |
|---|---|
| `src-tauri/src/set_default.rs` | 返回值 `Result<String, String>` → `SetDefaultOutcome { ok, code, count, detail }`（`serde(rename_all = "camelCase")`）。**`code` 是语言中立的枚举串**：`doneMacos` / `failedMacos` / `doneWindows` / `failedWindows` / `doneLinux` / `failedLinux` / `failedUnsupported`。`detail` 只装**原始 OS 诊断**（OSStatus、注册表路径 + 错误、`xdg-mime` stderr），由前端插值成译文里的一个「值」，不再是一句话 |
| 同上（Windows 分支） | 拆出 `register() -> Result<u32, String>`：成功返回**成功的扩展名个数**，失败返回「出错的注册表路径 + OS 错误」（原先只写 `Can't create ProgId` —— 不说具体是哪个键）。Linux 分支的 `last_error` 也改为 `trim()` 后的原始 stderr，去掉 `Failed to run xdg-mime: ` 这层英文包装 |
| `components/SettingsPanel.vue` | 新增 `SET_DEFAULT_RESULT_KEY` 把 `code` 映射到 `settings.setDefault*` 键，`{count}` / `{detail}` 插值；`ok` 走 success toast，否则走 error toast；未知 code 落 `settings.setDefaultFailedUnknown` |
| `components/Slideshow.vue` | 顺手清掉同一类问题：放映帮助面板与底部提示原先是硬编码英文（`Slideshow Shortcuts`、`F fullscreen · ? help · Esc exit` 等），改走 `slideshowHelp.*` |
| `i18n/*.ts` ×15 | 新增 **25 个键**：8 × `settings.setDefault*`、16 × `slideshowHelp.*`、1 × `tabMenu.fileMissing`（见第 3 节） |

**边界（有意为之）**：本次**只**做功能文案（`setDefault` 的结果、放映帮助）。`toasts.error` / `toasts.warning`
一类**错误提示仍保持英文硬编码** —— `t()` 本身就有「当前语言 → 英文 → key」的兜底链，为错误信息补键纯属噪音。

### 2. 窄窗口下标题栏不再压住菜单栏

Windows 无边框标题栏里 `文件名 — SoloMD` 居中显示，菜单（文件 / 编辑 / …）从品牌图标向右展开。窗口拖窄时两者
在中间相遇，标题被菜单文字压住。实测 1756px 宽的窗口：标题自然宽 ≈577px 居中、菜单右边缘 ≈645px → 左间隙
**−55px**。

`components/Toolbar.vue` 的做法是让标题**在放不下时整体让位**（文件名在标签页上已经有了，不丢信息）：

| 做法 | 说明 |
|---|---|
| 量**真实文本宽** | 加一个**不参与布局的孪生 span**（`.titlebar__title-measure`：`position: fixed` + `visibility: hidden`，**不带** `max-width: 40%` 那道钳制），量出标题的自然宽度，而不是被 clamp 后的盒子宽 —— 这样 `a.md — SoloMD` 在长文件名会被隐藏的窗口上仍能留下 |
| 判据 | 居中框两侧到「菜单右边缘」与「窗口按钮左边缘」的间隙都 ≥ **12px** 才显示，否则 `v-if` 掉整条标题 |
| 触发 | `ResizeObserver` 盯标题栏盒子，`watch([titlebarTitle, settings.language])` 跟上「菜单宽随语言变、标题随活动标签变」；`onMounted` 里先量一次，避免窄窗口下先闪一帧 |

标题与测量元素**都在布局之外**，所以观察回调不可能把自己再触发一次（无 `ResizeObserver` 死循环）。

### 3. 标签页标出「文件已经不在了」

恢复到上次会话的标签页只带回了**文件名**，没带回文件本身。文件在资源管理器里被删 / 移走 / 改名后，标签照旧
显示最后已知的内容，没有一处提示它已经没了 —— 再从别处打开一个同名文件，两者无法区分。

| 层 | 改动 |
|---|---|
| Rust | 新增 `commands::fs_files_exist(paths: Vec<String>) -> Vec<bool>`（`Path::is_file()`），在 `runner.rs` 注册。**一次 IPC 问完所有标签**，而不是逐个 round trip（`fs_dir_exists` 只能判目录；`plugin-fs` 的 `exists()` 作用域只到 `$DOCUMENT`，用不了） |
| 状态 | 新增 `stores/missingFiles.ts`（Pinia）：**不挂到 Tab 上、不持久化** —— 这是对磁盘的**观测**，不是会话状态。每次启动 + 窗口获得焦点时重算，文件放回去就自动清除 |
| 触发 | `useFiles.refreshMissingFiles()`；`App.vue` 在 `onMounted` 与 `onWindowFocus` 调用；`tabs.markSaved()` 保存后立即清掉自己的标记（能保存当然说明文件在） |
| 排除 | 跳过 `saf:…`（SAF vault）与 Android `content://` —— 它们根本不是文件系统路径，`std::fs` 的「否」会是假话 |
| 样式 | `components/PaneTabBar.vue`：`.tab--missing .tab__name { text-decoration: line-through; color: var(--danger) }`（对齐 VS Code 的「红色 + 删除线」），`#218` 的「全部标签」下拉同样处理 |
| Tooltip | `{完整路径} - {t('tabMenu.fileMissing')}`（zh「已删除」/ en「deleted」） |

### 4. 页面内格式工具栏

正文上方新增一条格式工具栏（`components/FormatBar.vue`，高 38px），把最常用的排版动作放到手边；
原先挤在右上角工具条里的两个列表开关（**回车继承列表格式** / **自动编号**）移到这里，给标签页腾出宽度。
设置 → 编辑 →「显示格式工具栏」可关闭（默认开）。

| 分组 | 内容 |
|---|---|
| 1 | 加粗、下划线、斜体、删除线 |
| 2 | 标题（hover 展开 H1–H6）、下标、上标、引用 |
| 3 | 回车继承列表格式、自动编号、任务列表 |
| 4 | 行内代码、代码块、链接、图片、表格（hover 展开 6×4 网格，可鼠标滑选范围；或点「可视化编辑」打开表格编辑器） |
| 5 | 撤销、重做、修复格式 |

**不新造命令通道**：每个按钮都派发既有窗口事件（`solomd:format-markdown` / `solomd:menu-action` /
`solomd:editor-history` / `solomd:insert-markdown { snippet, paneId }`）。只有下划线 / 下标 / 上标是新的
`FormatKind` —— Markdown 没有这三种语法，改用**内联 HTML** `<u>` / `<sub>` / `<sup>`（渲染层是
`html: true`，`lib/sanitize-html.ts` 明确放行内联 HTML；为此加 markdown-it 插件是下策，`~x~` / `^x^`
本来就不会被渲染）。裸光标落在 `<u>foo</u>` 里时取词会把标签名也算进去（取成 `u>foo`），所以
`textRun()` 把范围裁回标签之间的内容。

| 层 | 改动 |
|---|---|
| `components/FormatBar.vue` | **新增**。整条 `@mousedown.prevent`：不夺编辑器焦点、不毁选区 |
| `lib/table-grid.ts` + `.test.ts` | **新增**：6×4 网格的取值与命中判定（`gridSizeAt` / `inGridSelection`），5 例单测 |
| `lib/md-format.ts` | 联合类型与 `FORMAT_KINDS` 加 `underline` / `subscript` / `superscript` |
| `components/Icons.vue` | 补 6 个图标：下划线 / 删除线 / 下标 / 上标 / 代码块 / 表格 |
| `App.vue` | `<FormatBar>` 挂在 `.main-col`（列向）里 `<Toolbar>` 与 `.workspace` 之间；`showFormatBar` 按「非手机 × markdown 标签 × 非预览/阅读 × 非 bases/inbox/typeLens/savedView」决定 |
| `components/Toolbar.vue` | 摘掉两个列表开关（已搬进 FormatBar），右上角不再被挤 |
| `stores/settings.ts` | `formatBar`（默认 true）+ `toggleFormatBar()` |
| `lib/md-format.test.ts` | +2 例：三种 HTML 标签的正反切换（含 `u>foo` 回归例）；另加遍历 `FORMAT_KINDS` 的守卫 —— `applyFormat` 的 `default:` 是标题分支，新 kind 漏写 `case` 会因为 `'#'.repeat(NaN) === ''` 给文本加一个**前导空格**，悄无声息 |

**位置**：不做拖拽 / 浮动。工具栏本来就能在设置里整个关掉，每个按钮也都有对应快捷键；浮动条会遮正文本身，
而拖拽手势还会与按钮的 `mousedown.prevent` 抢事件。若日后真要省这 38px，正确做法是加一个
「工具栏位置」设置项（编辑区上方 ⇄ 标签栏内），不是自由拖拽。

### 5. 设置页：高度可拖拽调整 + 新增「编辑」分类

**高度**：面板底部多了一条拖拽量尺（`role="separator"`，↑↓ 键步进 24px），高度存
`settings.settingsPanelHeight`（默认 **520**，钳 280–1400），超出时页面区内部自己出滚动条。

**根因值得记一笔**：`.settings__layout` 原先写的是 `flex: 1`，即 `flex: 1 1 0%` —— **basis 归零**，
里面那句 `height: min(600px, 78vh)` 一直是**死代码**，高度完全由 flex 撑满。于是「太高」与「调不动」
是同一个原因：改成 `flex: 1 1 auto` 之后显式高度才真正生效（无剩余空间时 grow 不动，小窗口由 shrink 回退）。
弹窗是垂直居中的，长高 d 会同时把顶边抬起 d/2，所以拖拽位移按 **×2** 换算，量尺才贴着指针走；
上限按「面板顶边到视口边缘」推算，与起始高度无关。拖拽期间的光标靠 `body.settings-grip--dragging`
（弹窗 teleport 到 body，scoped 选择器够不到）。

**新分类「编辑」**（基础 → **编辑** → 写作）：基础页只剩 语言 / 主题 / 字体 / 等宽字体 / 字号 / 界面字号 /
全局缩放，其余 **29 个 `<section>`**（自动换行往下全部）迁进 `editing`。除了类型联合与 `categories` 数组，
**还必须同时加进 CSS 显示白名单的两行**（`[data-active-cat="editing"] > [data-cat="editing"]` 与
`> section[data-cat="editing"]`）—— 漏一行该页全空。

**搜索框外框显示不全**：`.ds-modal__body` 是滚动容器，会在 padding 边缘裁切；搜索行顶部 padding 原为 0，
输入框 4px 的 `--ring` 顶边被切掉。改 `padding: 6px 24px 12px` + `position: sticky; top: 0`。
背景用 `--bg` 而**不是** `--bg-pop`（深色主题下两者有色差，会显成一条带）。

### 6. 「修复格式」：自研 Markdown 修复引擎 ⚠️ 已在 5.0.3 整套撤销

> **本节只作历史记录。** 该引擎因「一次点击连带改多处、不可控」已在 **5.0.3** 撤销，
> 星形按钮已回到 `format.markdown`（Prettier）。详见 5.0.3 第 1 节。

原先工具栏那颗星是 `format.markdown`（Prettier 重排），既不会修语法，toast 也是硬编码英文。现在换成
`lib/md-repair.ts` 的纯函数 `repairMarkdown(src) -> { text, fixed[], unparsed[] }`，按「能确定意图就改、
确定不了只报告」两档工作。

| 能自动修（`fixed`） | 说明 |
|---|---|
| 未闭合围栏 | 补到文件尾 |
| **短一截的关闭围栏** | 关闭处只写了 1~2 个反引号 —— 任何 Markdown 规范里这**都不是**围栏，块会一直张着，把后面的标题吞进代码块（mermaid 图因此报 `Parse error … got 'NODE_STRING'`）。按开围栏的缩进重写成完整标记 |
| 表格 | 缺竖线的行按最宽行补齐对齐；分隔行缺短横线时按表头重建 |
| 行内 | `](` 缺 `)`；链接目标含空格却没用 `<>` 包；单侧反引号 |

| 只报告（`unparsed`） | 为什么不改 |
|---|---|
| `**` 个数为奇数 | 不知道该往哪一侧补 |
| 有 `](` 时方括号不配对 | 正文里的裸 `[` 是 `array[0]` 这类正常写法，猜不得 |

| 层 | 改动 |
|---|---|
| `lib/md-repair.ts` | **新增**（纯函数：围栏遮罩 + 表格重建 + 行内三修）|
| `lib/md-repair.test.ts` | **新增 31 例**，含 mermaid「双反引号关闭围栏」的原始样例 |
| `composables/useCommands.ts` | 新命令 `format.repair`。⚠️ 此处 `useI18n` 必须解构成 **`tr`** —— 该文件已有局部 `const t = freshActiveTab()` 会遮蔽 |
| `lib/keybindings.ts` / `useShortcuts.ts` / `lib/app-menu.ts` | 注册命令（**无默认快捷键**），菜单「格式 → 修复 Markdown 语法」 |
| `components/FormatBar.vue` | 星形按钮改指向 `format.repair` |
| `i18n/*.ts` ×15 | `repair.*` 8 键（`fixed` / `unparsed` / `none` / …），修复结果提示随界面语言 |

**安全边界**：围栏遮罩保证**代码块内部的内容永不改写**；短围栏只在**已打开的围栏内**、且**与开围栏同字符**
时才判定（正文里的散反引号照旧不动，代码块里的波浪线行仍是内容，CommonMark 也这么认为）。
**一处已知取舍**（已写成测试名）：教人怎么写代码块的教学片段里，单独一行的两个反引号会被一并改写 ——
它与「打错的关闭围栏」在文本上完全同形，只能靠意图区分；修复是用户主动点的一次检查，此处偏向
「让文档能渲染」的一边。

### 验证

- `vue-tsc --noEmit` **干净** —— 15 个语言文件按 `I18n` 全量类型核对（缺键 / 多键都会报错）。
- `cargo check` 通过（`solomd v5.0.2`）。第 4–6 节无 Rust 改动，未再跑 cargo。
- `bash app/scripts/run-tests.sh`：**521 用例 / 521 通过 / 0 失败**（5.0.1 基线 482，本轮 +39：`md-repair` 31、`table-grid` 5、`md-format` 3）。
- `vite build` 成功。入口之外那个稳定的 **1,738.17 kB / gzip 530.02 kB** 分包与 5.0.0 / 5.0.1 基线
  **逐字节一致**；本轮新增的 UI 代码落在 `index-*.js`（874.51 kB）—— 判断体积回归要按模块看，
  别拿 1,738 那个块当唯一标尺。

### 说明

- **本版是重新打的一次。** 最初的 `v5.0.2` 标签 / CI 构建 / draft Release 在人工评审之前就被删除（内容从未
  对外发布），四项修复与页面内工具栏补齐后仍用同一个版本号重新打 —— 序号没有被浪费，`main` 上的提交也没有
  改动过历史。
- **「打开文件夹无法选择桌面」不再排查。** `pickerStartDir()` 保持现状：4.14.3 那条「起点目录必须真实存在」
  的修复已完整在位；而导航窗格顶部那个「桌面」是 shell 的**无路径命名空间根**，确认它必然报
  `MK_E_UNAVAILABLE`（中文「没有供标记使用的对象」）—— 这是 OS 对话框自己的行为，VS Code 的
  「打开文件夹」同样如此。结论已写在 `pickerStartDir()` 的源码注释里，别再重复投入。

---

## [5.0.1] — 2026-10-13

一条线：**同步上游 3 个提交**（5.0.0 发版之后的补丁：文件树两处 + MCP 反链一处）。**零冲突**。

### 上游同步

上游 `03d38a68..353f95aa`：**3 个提交**、**4 个文件**、+155 / −18。
分叉点 `03d38a68` 正是上次同步（5.0.0）合并的上游 tip，两侧边界干净。
这 4 个文件本仓库一侧**从未改过**（`git log 03d38a68..HEAD -- <4 files>` 为空），
因此 `git merge upstream/main` **一次干净通过，无冲突**，无异于常规重放。

| 上游提交 | 内容 | 落地文件 |
|---|---|---|
| `fix(file-tree): toggle folder when clicking chevron caret directly (#401)` | 直接点文件夹行上的 ▸ 箭头即可展开 / 收起（原先只有点行主体才响应） | `app/src/components/FileTree.vue` |
| `fix(file-tree): do not switch workspace when opening files inside it or clicking tree (#402)` | 在树里打开文件、或点击树本身时不再误切工作区 | `app/src/composables/useFiles.ts` |
| `fix(mcp): get_backlinks finds [[folder/note]] and [[note.md]], skips fenced code (#407)` | 反链匹配与 App 侧解析器对齐（大小写不敏感、带 / 不带扩展名、文件夹路径按整段匹配）；`extract_wikilinks` 不再扫围栏代码块 | `mcp-server/src/tools.rs`、`mcp-server/src/workspace.rs` |

`#407` 的意义：`get_backlinks` 原先拿**原始链接目标**对比**原始笔记名**，所以 `[[projects/sub/deep]]`
不算 `deep` 的反链，而传 `list_notes` 返回的 `deep.md` 也匹配不到任何东西。现在按 `#278` 起 App 侧
解析器的同一套规则匹配。

**排除项**：本轮上游未触及 `web/` / `app-store/` / `server.json`，无需回退；
合并后排除项**零回流**。MCP 源码属**产品功能**，原样跟进。

### 已发现的既有缺陷（不属本次同步，本轮未修）

`mcp-server` 的 `safety::tests::resolve_new_refuses_parent_dir_components` 在 **Windows 上必失败**：

```
thread 'safety::tests::...' panicked at src\safety.rs:167:9:
assertion failed: resolve_new(&ws, &abs).is_err()
```

**根因**（已用 `rustc` 探针实测）：`env::temp_dir()` 得到 8.3 短路径 `C:\Users\ADMINI~1\…`，
经 `canonicalize()` 返回 **verbatim 路径 `\\?\C:\…`**；而 Rust 的 `Path::components()`
对 verbatim 前缀**不做分隔符解析** —— 余下整条路径被当作**单个 `Normal` 组件**返回：

| 输入 | `components()` | `has_parent_dir` |
|---|---|---|
| `\\?\C:\…\dotdot/sub/../../x.md` | `[Prefix, RootDir, Normal(…7 段…), Normal("dotdot/sub/../../x.md")]` | **false** |
| `C:\…\ws\sub\..\..\x.md`（非 verbatim） | `[Prefix, RootDir, … , ParentDir, ParentDir, Normal("x.md")]` | true |
| `../x.md` | `[ParentDir, Normal("x.md")]` | true |

于是 `resolve_new()` 开头那行遍历拦截

```rust
if raw.components().any(|c| matches!(c, Component::ParentDir)) { return Err(...) }
```

对 verbatim 路径**静默失效**。上游 CI 只跑 `app/src-tauri` 的 `cargo test --lib/--bin`，
**不跑 `mcp-server`**，所以这个失败在 CI 里从未暴露。
MCP 源码按**产品功能**处理，跟随上游修复；本轮**不擅自改**，另行向上游报。

### 验证

- `vue-tsc --noEmit` **干净**。
- `vite build` 入口 chunk **1,738.17 kB / gzip 530.02 kB**，与 5.0.0 基线**逐字节一致**（无包体回归）。
- `bash app/scripts/run-tests.sh`：**482 用例 / 482 通过 / 0 失败**。
- `cargo test`（`mcp-server`）：**34 通过 / 1 失败** —— 唯一失败即上述 Windows verbatim 既有缺陷，
  `safety.rs` 与合并前**逐字节相同**，可确认与本次同步无关。
- 排除项零回流：`git diff HEAD~1 HEAD -- web app-store server.json .github/workflows/` 为空；
  `TelemetryBanner.vue` 未回归。
- 版本号四处一致（`app/package.json` / `tauri.conf.json` / `Cargo.toml` / `Cargo.lock`）= **5.0.1**。

---

## [5.0.0] — 2026-10-13

一条线：**同步上游 129 个提交**（上游 4.14.11 → **5.0.0**，即 `feat/v5-ui` 大版本合并）。
v5 是一次界面重构：设计令牌层、52px 头部 + 整列侧栏、面板解剖、手机外壳、模糊命令匹配、
真正的「跟随系统」主题等。上游的推广、赞助、遥测、商店分发与 MCP 登记相关内容不纳入；
本仓库的 9 项自研修复（#395 #390 #381 #389 #387 #385 #384 #382 #378）与构建脚本全部保留。

### 上游同步

上游 `f0f22279..03d38a68`：**129 个提交**（106 个非 merge + 23 个 merge）、**659 个文件**有改动。
分叉点 `f0f22279` 正是上次同步（4.14.11）合并的上游 tip，两侧边界干净。

落地方式沿用上次：**真实 `git merge upstream/main`，在冲突处逐个取舍**。初始 34 个冲突文件，
回退 `web/` 与 `app-store/` 后剩 **24 个**，其中 18 个需人工取舍，其余重叠文件由 git 自动合并。
合并后相对本仓库 HEAD 净改动 **391 个文件**（新增 218 / 修改 172 / 删除 1）。

**排除（不纳入）**

| 项 | 上游 5.0 的内容 | 处置 |
|---|---|---|
| 遥测 | 重新引入 `TelemetryBanner.vue`、设置页「匿名用量」开关、`lib/telemetry.ts`、各处的 `track(...)` | 删除；`settings.ts` 保留迁移代码继续清理 `telemetryEnabled` / `telemetryNoticeAck` |
| star 提醒 / 推广 | `scheduleStarPrompt` 一类提醒、`AboutDialog` 的 promoters 区块与 promote 按钮 | 不纳入（原有的 sponsors / testers 感谢名单保留） |
| App Store / 商店分发 | `app-store/` 整目录、`scripts/asc-apply-metadata.py`、`asc-upload-screenshots.py`、`verify-mac-signed-interactive.py` | 整目录回退 + 脚本删除 |
| 官网 `web/` | 5.0 版站点、真实截图、whats-new、llms | 整目录回退（仍冻结在 4.14.x） |
| MCP Registry 登记 | `server.json` | 冻结；`mcp-server/src` 作为**产品功能**原样跟进（mcpb manifest 已随版本号到 5.0.0） |

**纳入（产品代码）**

界面 / 交互（v5 主体）

| 上游提交 | 内容 |
|---|---|
| `feat(v5): interface spec, 5.0 token layer, icon set` | CSS `@layer` 设计令牌层 + 新图标集 |
| `feat(v5): window frame` / `editor surface, pill tabs, stats pill` | 52px 头部、Windows 标题栏、整列侧栏、胶囊标签页 |
| `feat(v5): one menu style, dialogs, settings cards, palette, toasts` | 统一的菜单 / 对话框 / 设置卡片 / 命令面板 / toast |
| `feat(v5-panels)` | 右侧栏与整页视图的 5.0 面板解剖 |
| `feat(v5): phone shell` + `PhoneTabBar` / `KeyboardBar` / `SelectionBubble` | 手机外壳（笔记首页 / 搜索 / 编辑器 + 底栏）与 iPad 竖屏覆盖式侧栏 |
| `feat(v5): a find bar that belongs in 5.0` | `lib/cm-find-panel.ts`：查找条换成 v5 的 DOM（仍是 CodeMirror 的 search panel） |
| `feat(palette): fuzzy command matching` | 命令面板模糊匹配（含"不跨词命中"的修正） |
| `feat(theme): a real "System" theme that follows the OS appearance` | `followSystemTheme` + 主题校验 |
| `feat(preview): clickable task checkboxes write back to the source` | 预览里勾选任务清单回写源文件 |
| `perf(app): load KaTeX and highlight.js after the first paint` | `lib/render-deps.ts`：KaTeX / hljs 延迟加载；入口分包里给 `@vscode/markdown-it-katex` 加 katex stub |

功能修复（节选，共 54 个 `fix`）

| 内容 | 备注 |
|---|---|
| `fix(render): preserve URL-valued Markdown link labels (#395)` | **与本地 4.14.12 的方案一致**（按位置判断前一兄弟是 `(` 的 `LinkMark`）；本仓库保留抽取出来的 `lib/link-destination.ts` + 8 例单测 |
| `fix(table): guard table editor draft against backdrop click and background tab closure (#381, #390)` | 上游也独立做了；本仓库保留自己的「应用 / 丢弃 / 取消」浮层，**接入上游的 `solomd:table-close-request` 事件**（App.vue / useShortcuts 派发） |
| `fix(session): remember the caret per tab`、`fix(editor): a new note takes focus`、`fix(fs): save UTF-16LE/BE files as UTF-16`、`fix(docx): keep math in Word export`、`fix(export): embed relative images, drop front matter`、`fix(format): code block and bold/italic toggle off from inside`、`fix(commands): transforms read the editor's current text`、`fix(quick-switcher): stop offering renamed and deleted files`、`fix(backlinks): file-absolute link lines`、`fix(split): the panes line up again` 等 | 全部纳入 |

工程 / 测试

| 上游提交 | 内容 |
|---|---|
| `test: one command for the frontend unit tests, and CI runs them` | `app/scripts/run-tests.sh` + `.github/workflows/tests.yml`（node:test + Rust lib 测试） |
| `test-hooks.mjs`（随上一条） | **Node 解析钩子：无扩展名相对导入自动补 `.ts`** —— 正是本仓库之前那 8 个失败用例的根因，纳入后 **482/482 全绿** |
| `chore(deps): Tauri 2.12` | `@tauri-apps/*` 全线升到 2.12.x |
| `test: Windows regression suite` + `scripts/regress/*` | 上游的四平台手工回归套件（mac/win/linux/android，71 个用例）；**删除 `K05-telemetry-setting.js`**（它检验的正是本仓库已删掉的「匿名用量」开关），`lib/setup.js` 与 `README.md` 里的遥测措辞一并改掉 |
| `chore(v5): drop the unused StatusBar` | 上游删掉未被渲染的 `StatusBar.vue`；本仓库一侧同名文件未被改过，安全跟随（`PomodoroPill` / `WritingGoals` 已改挂在 `StatsPill` 下） |

### 冲突取舍

18 个需人工取舍的文件，几个关键判断：

| 文件 | 取舍 |
|---|---|
| `app/src/components/Editor.vue` | **两者都留**：v5 的查找面板（`createFindPanel`）与本仓库的 #389「Ctrl+F 切换」共存（`searchPanelOpen` 仍然有效） |
| `app/src/components/Preview.vue` | **保留本仓库的阅读模式排版**（#143/#384：衬线字、`--content-font-size` 不放大、两侧"纸页"阴影、`tbody` 隔行底纹），**拒绝上游 5.0 §5**（那次把阅读模式改回与编辑器同字体、只留更大的页边距） |
| `app/src/components/TableEditor.vue` | 保留本仓库的 #390/#381/#382（`baseline` 脏检查 + 自绘确认浮层 + 列选择条），**摘掉上游那套重复实现**（`initialTable` / `closeConfirm` / `DsModal` 确认框），只留上游的 `solomd:table-close-request` 监听并把 `:inert` 接到本仓库的浮层上 |
| `app/src/lib/keybindings.ts` | 取上游（v5 的 `category` 重分类 + 去掉重复项），再回植本仓库的 `insert.table` |
| `app/src/components/Toolbar.vue` | 取上游 v5 结构，再回植本仓库的 `openInsertTable()`（改走上游的 `closeAllDropdowns()`）与两个列表续行/自动编号 flat 按钮；这两个按钮按 v5 的窄屏约定加了 `!isNarrow`（`isNarrow` = 视口 ≤600px 的手机布局） |
| `app/src/lib/cm-live-render.ts` | 保留本仓库的 `isLinkDestinationUrl()`（行为与上游一致，但有独立单测） |
| `app/src/stores/settings.ts` | 两者都留：本仓库的遥测 key 清理 + 上游的系统主题校验 |
| `app/vite.config.ts` | 两者都留：本仓库的 `VENDOR_GROUPS` 手工分包 + 上游的 katex 插件 stub |
| `README.md` | 保留本仓库的 GitHub Releases / Windows-only 说明与 `chenghaitao` 链接；取上游「16 tools」措辞；删掉上游的 brew / install.sh / winget 安装段 |
| `app/src/i18n/zh.ts` | 9 个冲突块**全取上游**（`en.ts` 是权威键集，上游补了 `openLensTooltip` / `modes` / `removeTag` 等新键，缺键 `vue-tsc` 会报错），同时把上游翻译工具产出的双引号统一回单引号 |

### 验证

- `vue-tsc --noEmit` **干净**（16 个语言文件按 `Record<Lang, () => Promise<I18n>>` 全量核对）。
- `vite build` 入口 chunk **1,738.17 kB / gzip 530.02 kB**，与 4.14.13 基线**逐字节一致**（无包体回归；
  本仓库的 `VENDOR_GROUPS` 分包仍在生效，`vendor-editor` / `vendor-katex` / `vendor-preview` 均在）。
- `bash app/scripts/run-tests.sh`：**482 用例 / 482 通过 / 0 失败**。上次同步时那 8 个失败
  （无扩展名相对导入）是上游 `test-hooks.mjs` 解析钩子修好的。
- 排除项零回流：全仓 `app/src` 已无 `lib/telemetry` / `TelemetryBanner` / `track(` 引用；
  `web/`、`app-store/`、`server.json` 与本仓库 HEAD 逐字节相同。
- 本地自研零丢失：`build.bat` / `release.bat` / `scripts/bump-version.js` / `scripts/package-portable-win.ps1` /
  `lib/link-destination.ts`(+test) / `lib/insert-table.ts` / `InsertTableDialog.vue` / `lib/file-link.ts` 全部在位。
- 版本号四处一致（`app/package.json` / `tauri.conf.json` / `Cargo.toml` / `Cargo.lock`）= **5.0.0**。

---

## [4.14.12] — 2026-10-10

一条线：**一次修完 9 个待办 issue**（全部是本仓库自研，本版**不含任何上游同步**），外加设置界面的中文补全。
改动集中在编辑器 / 表格 / 文件链接三条线，另含一处窗口外观修正。

### 文件链接（#380）

| 面 | 内容 |
|---|---|
| `lib/markdown.ts` | 覆写 markdown-it 的 `validateLink`：其默认 `BAD_PROTO_RE` 把 `file:` 与 `javascript:` / `data:` 一起拒绝，本地文件链接连 `<a>` 都生成不出来，退化成原文。改为放行 `file:`，仍拦 `javascript:` / `vbscript:` / `data:text` |
| `lib/file-link.ts`（新） | `localPathFromHref()`：markdown-it 会把 href 百分号编码（手写的 `\` → `%5C`），点击时解码回真实路径 |
| `lib/image-resolve.ts` | 同样解包 `file:`，否则 `![](file:///F:/a.png)` 会从"显示原文"变成"坏图" |

href 刻意保留 `file:` 前缀（裸 `C:\…` 会被 sanitizer 的 `ALLOWED_URI_REGEXP` 拦掉，`file:` 两边都放行）。
新测试 `file-link.test.ts`（7 例）+ `markdown-file-link.test.ts`（5 例，走 `renderMarkdown()` 全链路）。

### 编辑器

| issue | 内容 |
|---|---|
| #395 | 实时编辑模式下 `[label](url)` 的 url 半边被多隐藏了一份：GFM autolink 把 URL 形状的 label 也标成 `Link` 内的 `URL` 节点。判据改为按位置判断（前一兄弟是 `LinkMark` 且文本为 `(`），抽成叶子模块 `lib/link-destination.ts` + 8 例回归测试 |
| #389 | Ctrl+F 改为**切换**：已打开时再按一次关闭并把焦点还给编辑器。CodeMirror keymap、plain 模式查找条、预览搜索三处行为统一。坑：同一元素上多个 `@keydown` 会被 Vue 合并成数组并可能互相遮蔽，Esc 与 Ctrl+F 需合并进一个 handler |

### 表格

| issue | 内容 |
|---|---|
| #390 / #381 | 表格编辑器在「有改动但未应用」就关闭时提醒。以打开时序列化的 `baseline` 判脏（不能拿 `props.source` 比，否则未对齐的原始表格一打开就算脏）；Esc / 背板点击 / ✕ / Cancel 全部走 `requestClose()`，脏则弹「应用 / 丢弃 / 取消」浮层。**#381 无需额外代码** —— 它的关闭路径即本轮改掉的同一条 |
| #382 | 表头**上方**新增一行「列号条」（真 `<tr>`，列宽自然跟随，不必跟横向滚动做同步），支持单击选单列 / `Shift` 扩选区间 / `Ctrl` 加选；对齐按钮改为「所选列对齐全部一致才高亮」。模型层新增纯函数 `setAlignMany(t, cols, align)`（越界索引跳过、无变化时返回原对象，避免弄脏 #390 的基线） |
| #387 | 插入表格改为对话框，可填行 / 列数（列 1–20、数据行 1–100，**表头另计**）。按用户要求**不做**「根据窗口调整表格」与「为新表格记住此尺寸」。新增 `lib/insert-table.ts` + `InsertTableDialog.vue`；`insert.table` 从 `INSERT_SNIPPETS` 移除（否则会 shadow 掉可绑定动作），四处入口（工具栏 / Paragraph 菜单 / 命令面板 / 快捷键）统一走 `solomd:open-insert-table-dialog` |

新快捷键 `insert.table` 默认 **`Mod+Alt+Shift+I`**（`Mod+Alt+I` 已被 Typora 预设占用）。

### 标签页 / 设置

- **#385**：标签页右键菜单加「复制路径」，复用已有的 `explorer.copyPath` 键（15 个语言均已翻译，无需新增）。
- **设置中文未翻译**：`zh.ts` 与 `en.ts` 逐键比对（walk 两棵树，`zh[k] === en[k]` 即未译），未译数 **128 → 27**。
  剩下的 27 处是品牌名（Pandoc / CodeMirror / GitHub / SM.MS）、快捷键（S / N / Del）、占位示例
  （`https://…`、`/Users/me/...`）与字面 Markdown 片段，**按设计保留英文**。
  本轮另新增 11 个键（表格编辑器脏检查 / 插入表格对话框 / 列选择），**15 个语言文件全部铺上真翻译**
  （`zh: I18n` 是全量类型，少一个文件 `vue-tsc` 就报错）。

### 窗口外观（#378）

- **导出保存面板底部的残留阴影**：`app/src-tauri/tauri.windows.conf.json` 的 `shadow: true` → **`false`**。
  tao 的 `shadow` 不是「让 DWM 画个阴影」，而是**把 HWND 撑大**（左右 / 下各 +`SM_CXSIZEFRAME + SM_CXPADDEDBORDER`
  ≈ 8px，上 1px），再用 `WM_NCCALCSIZE` 把客户区缩回去 —— 可见窗口因此比 HWND 小一圈。
  关掉后窗口没有任何描边，故在 `src/styles/main.css` 给 `#app` 补 `box-shadow: inset 0 0 0 1px var(--border)`
  （inset 不占布局）。
- **「弹窗时无法拖动标题栏」是预期行为，保留**：`tauri-plugin-dialog` 的 `save()` 总是把调用它的 webview 作为
  owner（`set_parent`），面板因此对主窗口模态。曾实现的「无 owner 非模态面板」已**整体回退**
  （`export_dialog.rs` / `save-panel.ts` 已删，四处调用点还原为 `saveDialog()`），别再往这个方向改。
- **2026-10-10 二次调查结论（不改代码）**：关掉 `shadow` 后仍偶发的底部灰带是**框架层现象** —— 原生保存面板
  弹出时主窗口被禁用，Windows/DWM 在这一刻重算边框而露出的原生带，数秒后自愈。取证见
  `.workbuddy/memory/2026-10-10.md`（续二）：灰带 ≈30px 且完全平坦、`#B7B6B2`、带内无任何本应用文字，
  全仓 CSS/JS 无规则可产生它；在本机其他 Rust/Tauri 应用同样复现，**用户已确认不处理**。
  事实与「将来若要修」的方向已写进 `win_chrome.rs` 模块注释（`shadow: false` 一节末尾的 Known limitation）
  与 `MEMORY.md`，**尤其不能摘 `WS_CAPTION` / `WS_THICKFRAME`** —— Win11 Snap Layouts 依赖它。

### 验证

- `vue-tsc --noEmit` 干净；`vite build` 入口 chunk **1,738.17 kB / gzip 530.02 kB**，与 4.14.11 基线一致（无包体回归）。
- `node --experimental-strip-types --test "src/lib/*.test.ts"`：**344 用例 / 336 通过 / 8 失败**，
  8 个全是仓库既有的失败（无扩展名相对导入，`node --test` 无法解析），与本版改动无关。
  本轮顺带把 `markdown-table.test.ts` 的导入补上 `.ts`，使它由失败转为 16/16 全绿。

---

## [4.14.13] — 2026-10-11

一条线：**阅读版式四项易读性优化**（上游 issue #384）外加**阅读模式控件顺序修正**。改动全部落在
`Preview.vue` 的样式与 `ReadingView.vue` 的模板顺序；本版**不含任何上游同步**。

### 阅读版式（#384）

全部落在 `Preview.vue` 的**非 scoped** `<style>` —— v-html 渲染出来的内容拿不到 scoped 属性，
所以该文件里的规则一律手动前缀 `.preview-content`。

| # | 现象 | 根因 | 改法 |
|---|---|---|---|
| 1 | 切到阅读模式字看起来突然变大 | `.preview-content--reading` 原为 `font-size: calc(var(--content-font-size, 15px) * 1.2)`，默认得到 **18px**，而编辑器默认 14px、预览 15px | 去掉 1.2×，直接继承预览字号。阅读模式的辨识度来自衬线字体、更宽的列与 1.8 行距，**不该靠放大字号** |
| 2 | 阅读区与非阅读区之间没有边界 | 阅读列与宿主同为 `--bg`，不像"一页纸" | 加左右柔和 `box-shadow`（两条 1px 实线 + 两条 `-14px 0 22px -14px` 渐变），色取 `color-mix(in srgb, var(--text) …)` → 浅色主题是暗影、暗色主题是光晕，一条规则通吃两套主题。开启「预览自适应宽度」（全出血）时置 `none`：两侧没有画布，阴影只会糊在窗口边框上 |
| 3 | 宽表格横向读行容易串行 | 无隔行色差 | `.preview-content tbody tr:nth-child(even)` 加 4.5% 底纹。只作用于 `tbody`，表头不上色 |
| 4 | 关掉「预览自适应宽度」改用固定宽度后，表格缩得很窄悬在列中间 | #367 把滚动容器设成 `display: block; width: max-content`，本意是"超宽表不把正文推走"，副作用却是**每张表都收缩到内容宽** | 改成 `width: 100%`，表格与正文同宽；超宽表仍由 `overflow-x: auto` 接住 |

### 阅读模式控件顺序

顺序 `[—][□][✕ 关应用][✎ 退出]` → **`[✕ 关应用][—][□][✎ 退出]`**。

- **背景**：Windows 无边框构建下，阅读模式会把工具栏（连同真正的标题栏按钮）一并卸载，所以这组浮动
  控件里必须镜像出窗口按钮；其中 ✕ 是**退出整个应用**的那个。原先它紧挨着浏览者寻找「离开阅读模式」
  的位置，而 ✕ 字形天然被读成「关掉当前视图」。
- **取舍**：把窗口三键整体放到最左、退出阅读放到最右，让两个易混按钮距离最大化 —— 在这里
  **「避免误点」优先于「贴合 Windows 标题栏在最右的惯例」**。
- 没动任何 handler（`winClose` 仍是 `getCurrentWindow().close()`）；macOS / iOS 不渲染窗口按钮，
  那里仍只有最右一个笔按钮，位置不变。
- 顺带更正文件头注释里早已过时的描述（还写着 "A small floating ✕ button (top right)"）。

### 附注：点 ✕ 会退出整个应用，这是预期行为

排查结论存档，避免以后当回归重查：

- 不是 bug。`winClose()` → `getCurrentWindow().close()` 自 **#221（`b20cfe74`，2026-08-12）** 起
  就是这个语义，与标题栏 ✕ 完全等价。它与 #384 无因果关系 —— #384 是纯 CSS 改动。
- 之所以让人困惑：**2026-09-25 之前，「退出阅读模式」那个按钮本身就是 ✕**（`<Icon name="close" />`），
  右上角曾经两个 ✕ 并排。`c30e50f8` 为消歧才把它换成笔图标，肌肉记忆停在了旧版。
- **不会丢失草稿**：关闭链路 `getCurrentWindow().close()` → `CloseRequested` →
  `runner.rs` 拦下并改发 `solomd://close-requested` → `App.vue` 先 `flushPendingEdits()`
  再 `tabs.persist()` + `tiles.persist()`，主窗口的标签会在下次启动 session restore 回来。
  只有第二窗口才弹未保存确认，因为它不参与 restore。

### 验证

- `vue-tsc --noEmit` 干净；`vite build` 入口 chunk **1,738.17 kB / gzip 530.02 kB**，与 4.14.12 基线
  逐字节一致（无包体回归）。
- `node --experimental-strip-types --test "src/lib/*.test.ts"`：**344 用例 / 336 通过 / 8 失败**，
  8 个全是仓库既有的失败（无扩展名相对导入，`node --test` 无法解析），与本版改动无关。

---

## [4.14.11] — 2026-10-09

一条线：**同步上游 43 个提交**（上游 4.14.10 之后 → 4.14.11），只取纯产品代码的功能与修复；
市场推广、赞助、遥测、商店与 MCP 分发登记相关内容不纳入；本地改动（列表续行开关、
启动懒加载、i18n 分包、文件新鲜度兜底巡检）全部保留。

### 上游同步

上游 `3a83d7e..f0f22279` 共 **43 个提交**、117 个文件有改动。分叉点 `3a83d7e` 正好是上次同步（4.14.10）
合并的上游 tip，两侧边界干净。

落地方式沿用 4.14.10 的做法：**直接 `git merge upstream/main`，在冲突处逐个取舍**。冲突只有 14 个文件，
其中 12 个属排除路径（`web/` 与 `server.json` 的整目录回退），**真正需要人工取舍的只有 2 个**
（`App.vue`、`useFileWatcher.ts`），其余 20 个重叠文件由 git 自动合并。

**纳入（38 个提交，纯产品代码）**

前端 i18n / 查找

| 上游提交 | 内容 |
|---|---|
| `8bb2be07` | 查找 / 替换面板跟随 UI 语言 |
| `1a23236a` | 已打开标签页里的查找面板跟随语言切换 |
| `665dffae` | 预览搜索的占位符与按钮标题改用真实 i18n 键 |
| `3a57614e` | 非 macOS 上「在文件管理器中显示」用对名字（Windows 显示"资源管理器"） |

编辑器

| 上游提交 | 内容 |
|---|---|
| `44309aa2` | 代码块与加粗 / 斜体可从内部反向切换关闭 |
| `3778ef13` | Tab 按有序列表标记宽度缩进列表项 |
| `7a06ed60` | 新建笔记在 CodeMirror 里获得焦点 |
| `91ba0404` | 分屏两栏重新对齐（5.0 回归）；列表不再把编辑器甩回去 |

快捷键 / 命令

| 上游提交 | 内容 |
|---|---|
| `9536421a` | redo 不再启动番茄钟 |
| `8a8ccc50` | Linux：Ctrl+B 不再在松键时自我撤销 |
| `5423d44b` | 命令转换读取编辑器当前文本，而不是陈旧副本 |
| `97429dbb` | 快速捕获默认热键不再抢公式编辑器的 Ctrl+Alt+M |

文件 / 磁盘 / 会话

| 上游提交 | 内容 |
|---|---|
| `4fcb1eec` | UTF-16LE/BE 文件另存为 UTF-16，而不是 UTF-8 |
| `41273552` | 不再弹假的「磁盘文件已变」对话框，也不会在读键中途弹 |
| `744a38d1` | 退出前最后半秒输入的内容重启后仍在 |
| `bcde170b` | Windows：退出真的退出、重启总有窗口、第二个窗口丢弃编辑前先询问 |
| `d807c1b0` | 快速切换不再列出已重命名 / 已删除的文件 |

导入 / 导出

| 上游提交 | 内容 |
|---|---|
| `e2078bb6` | DOCX 导入保留加粗、编号列表与任务状态 |
| `1057e217` | DOCX 链接保留 URL |
| `c66bee7e` | Word 导出保留数学公式 |
| `07e45820` | Linux 上文字版 PDF 保留 KaTeX 斜体字母（E, m, c, x, dx） |
| `1d4ffb28` | Linux 上「导出为图片 / 复制为图片」恢复可用 |
| `ee1b06e0` | Linux 上粘贴图片可用 |

面板 / 结构 / Mermaid

| 上游提交 | 内容 |
|---|---|
| `d803e5fd` | 反向链接支持文件绝对路径链接行，并可跳转 |
| `271d77c6` | 写新类型定义前先创建 `Types/` |
| `857fbe6a` | 收件箱切换标记后保存；mtime 精确到秒 |
| `566872c2` | 坏掉的 mermaid 图不再把错误气泡留在应用下方 |
| `d89cd697` | 分屏预览同一篇笔记时，两侧的 mermaid 图不再互相破坏 |

菜单 / 焦点 / 工具栏

| 上游提交 | 内容 |
|---|---|
| `5e75de6a` | Linux Edit 菜单有 Undo/Redo；原生菜单里的 `&` 正常显示 |
| `a168ac88` | 启动 / 分屏 / 幻灯片之后编辑器拿到键盘 |
| `723bb2c5` `154b4723` | 窄屏手机上工具栏菜单不越界（渲染后再测尺寸） |

后端（Rust）

| 上游提交 | 内容 |
|---|---|
| `901843c4` | keychain 命令不再冻结窗口 |
| `f6b7d877` | CJK 校对不再把扩展名和省略号当半角句号 |

MCP（产品功能，原样保留）

| 上游提交 | 内容 |
|---|---|
| `27fe16dd` | `export_note` 需要 `--allow-write`，且绝不静默覆盖（`safety.rs` / `tools.rs` / `workspace.rs` + 两个新测试） |

**排除（5 个提交）**

| 上游提交 | 内容 | 理由 |
|---|---|---|
| `20feffb7` | 版本号 4.14.11（4 个版本源） | 版本号由本仓库的 `bump-version.js` 统一改 |
| `56e41b78` `f0f22279` | App Store 发版说明 14 种语言（28 个文件） | 商店分发 |
| `cdf48cec` | 官网版本号 / whats-new / llms.txt | 官网分发 |
| `4ccc6006` | `solomd-mcp` 4.14.11 bundle manifest + Registry `server.json` | manifest 见下；`server.json` 是上游的 Registry 登记条目，冻结 |

### 合并取舍（本地特性怎么保下来的）

- **排除路径整体回退**：`web/`、`app-store/` 用 `git restore --source=HEAD` 回退，与合并前**逐字节零差异**；
  `server.json` 取本仓库版本（冻结在上游旧值，本仓库未登记任何 MCP Registry）。
- **`mcp-server/mcpb/manifest.json` 保留上游版**：这轮它不只是改版本号，还把 4 个工具
  （`export_note` / `get_outline` / `read_agent_trace` / `write_note`）的描述同步到新的 mcp-server 源码——
  正是上面 `27fe16dd` 的产品修复的一部分；版本 `4.14.11` 与本仓库相同，无需回退。
- **`App.vue`**：上游新加的 `focusActiveEditorSoon(...)`（产品，焦点修复）与 `scheduleStarPrompt()`
  （排除，star 提醒）挤在同一个 hunk 里——**保留焦点修复、摘除 star prompt**。
- **`useFileWatcher.ts`**：本地 30 秒兜底巡检 `startWatchdog()` 与上游新加的 `keydown` 捕获监听
  落在同一处，**两者都保留**。
- **`app-menu.ts`**：上游新增模块里的无扩展名导入 `'./keybindings'`，按本仓库约定补成
  `'./keybindings.ts'`，使其新增的 `app-menu.test.ts` 能被 `node --test` 直接跑。
- **MCP 源码是产品功能，原样保留**：与上几次「只改 manifest、零源码改动」不同，这轮上游对
  `mcp-server/src/` 有真实修复（`27fe16dd`），全部保留。
- **顺带补齐无扩展名导入（本仓库的 `node --test` 约定）**：`md-format.ts`、`docx-export.ts`、
  `diagram-export.ts`、`markdown.ts`、`stores/types.ts` 以及两个新测试文件里的相对导入补上 `.ts`，
  使本轮新增 / 改动的测试可以就地跑通（仓库本就开启 `allowImportingTsExtensions`，多处以 `.ts` 导入）。
- 其余重叠文件（15 个 i18n、`Editor.vue`、`SettingsPanel.vue`、`Toolbar.vue`、`useExport.ts`、
  `settings.ts`、`Cargo.toml`、`commands.rs`、`lib.rs`、`runner.rs`）自动合并，本地删除遥测、
  上游新增功能各落各区，无人工干预。

### 验证

- `vue-tsc --noEmit` 通过（`I18n` 类型由 `en` 推导，键不一致必报错）。
- `vite build` 通过（22.05s）。入口 chunk `index-DdF9T1vb.js` **1,738.17 kB / gzip 530.02 kB**，
  与合并前**完全一致**（1,738.17 / 530.02）——说明本轮并入的修复没有改变入口体积。
- 单元测试（本仓库的 `node --test` 跑法）本轮新增 / 改动的 13 个测试文件：**115 / 115 通过**。
- 本地改动零丢失：`git diff --name-only 3a83d7e..main`（268 个）对
  `git diff --name-only upstream/main`（282 个）做差集，**被吃掉的一侧为空**。
- 排除项零回流：`telemetry` / `TelemetryBanner` / `scheduleStarPrompt` / `starPrompt` /
  `store_review` / `request_store_review` 在 `app/` 下均无新增命中（`telemetry` 仅剩注释、
  欢迎文档的「无遥测」文案，以及 `settings.ts` 清理旧字段的代码）；`track(` 无任何调用；
  被删的 8 个文件（`lib/telemetry.ts`、`TelemetryBanner.vue`、`star-prompt.ts`、
  `web/functions/api/track.ts`、`admin/stats.ts`、`web/ANALYTICS.md`、
  `scripts/release-to-gitee.sh`、`mirror-gitee.yml`）合并后仍不存在。
- 本轮新增 i18n 键（`wholeWord` / `regexp` / `selectAll` / `replaceAll` / `revealExplorer` /
  `revealFileManager` / `quickCaptureHint`）15 种语言齐全。
- 无冲突标记残留。

## [4.14.10] — 2026-10-07

一条线：**同步上游 55 个提交**（横跨上游 4.14.8 / 4.14.9 / 4.14.10 三个版本窗口），把窗口期内的编辑器、
菜单、工具栏与启动性能修复整体纳入；市场推广、赞助、遥测、商店与 MCP 分发内容不纳入；
本地改动（列表续行开关、启动懒加载、i18n 分包）全部保留。

### 上游同步

上游 `3dbcbb0..3a83d7e` 共 **55 个提交**、181 个文件有改动（其中 140 个是 App Store 发版说明）。
分叉点 `3dbcbb0` 正好是上次同步（4.14.9）合并的上游 tip，两侧边界干净。

**这次落地方式与前几次不同**：不再用 `git merge -s ours` 记录合并 + 定向 cherry-pick，而是直接
`git merge upstream/main`，**在冲突处逐个取舍，然后把被排除的分发路径整体回退到合并前状态**。
原因是这一窗口的上游改动高度交织——55 个提交里 31 个纯产品提交集中在**同一批文件**上
（`Toolbar.vue` / `Editor.vue` / `App.vue` / `settings.ts` / i18n / `platform.ts`），
且上游这轮 commit 自己就在**反复推翻前一个提交的结论**（见下「编辑器引擎」一条）。
逐个 cherry-pick 会把同一处冲突解决三遍，且容易漏掉中间态；一次真实 merge 只解决一遍，
排除项靠最后一步显式的路径回退保证——**结果与「从未进入工作树」等价，且可 grep 证伪**。

**纳入（31 个提交，纯产品代码）**

编辑器 / Windows 实时编辑

| 上游提交 | 内容 |
|---|---|
| `ac94b790` | 快捷键：keydown 不带 `code` 时，标点组合键也能匹配上 |
| `69552b5e` | ⌘F / Ctrl+F 重新在编辑器里打开查找 |
| `47d278d4` | Windows：Ctrl+J 不再打开 WebView2 的下载页 |
| `f4025a15` | Windows 实时编辑：Ctrl+Home/End、Ctrl+Up/Down、三击与 Shift+点击可跨段（A3） |
| `0fee0164` | #374 代码块内多行选择不再跳进可编辑视图 |
| `51fbc1d0` | #368 在 Markdown 里点选中的文字会重新折叠选择 |
| `1d924beb` | #373 Vim 按键优先于其他 keymap |
| `41ef8157` | #376 Windows 右键菜单给出拼写建议 |
| `de2439df` | #375 可关闭「围栏语言自动补全」 |
| `da64eaf9` | 行间公式不再被底部裁掉（预览 / Windows 实时编辑 / 导出） |

编辑器引擎（上游在同一窗口里改了三次，最终态如下）

| 上游提交 | 内容 |
|---|---|
| `6641c01d` `376e9e7e` `41fd8820` | 新增 `auto` 引擎：WebView2 ≥ 154 用 CodeMirror，否则回退原生 textarea；中途 `376e9e7e` 曾把 CodeMirror 设为 Windows 默认，`41fd8820` 又因搜狗输入法在 WebView2 154 上掉字母而改回**原生为默认**——本仓库取最终态 |

界面 / 菜单 / 工具栏

| 上游提交 | 内容 |
|---|---|
| `e2abcce0` | 七菜单重构（bug/C1），原生菜单与 Windows menubar 共用一棵菜单树 |
| `27619fcb` | 命令面板里的功能都能从菜单到达 |
| `06c6c3df` | Typora / Word 快捷键预设（bug/B4）+ Typora 风格编辑命令 |
| `82d45e8a` | 单行工具栏（测试者提案 C2），五种视图模式收进一个下拉 |
| `e815c6c8` | #367 编辑区与预览之间的分隔条可拖动 |
| `b257a8ee` | #370 宽表格在 PDF / 打印 / HTML / 图片导出里换行收进页面 |
| `92c6b1d6` | 文件树的 × 真正隐藏树；打开文件不再把隐藏的树重新弹出 |
| `2e2ddffb` | 文件树按「路径写法无关」的键跟随当前打开的文件（新增 `path-key.ts`） |

启动性能（与本地这轮优化撞题，取上游实现）

| 上游提交 | 内容 |
|---|---|
| `b42e90d8` | 语法包 / 主题 / 快捷键查询改为按需加载 |
| `6cf545a0` | 关闭状态的对话框、隐藏面板改为首次打开时才载入（`useLazyComponent`） |
| `499f9200` | 挂载期不再为工具栏 / 标签条溢出强制布局 |

测试与开发工具（不进发布包）

| 上游提交 | 内容 |
|---|---|
| `67a82b94` | `ios-container` 测试改用 `node:test`（与本仓库约定一致） |
| `a3233d88` | Gitee 同步往返 e2e 测试（真实同步代码：推→拉→改→推→拉） |
| `bf49ac1a` `a7b937af` `b6324cca` `f020f728` | Windows 真输入法打字测试台、`?imetrace` 事件追踪（DEV 限定）、`?forceCodeMirror` QA 钩子、UI-steps 驱动 |
| `8da63163` | 测试者致谢（**仅 App 内 About 对话框的「感谢测试者」一节**；官网 thanks 页不在同步范围内） |

**排除（12 个提交 + 140 个文件）**

| 上游提交 | 内容 | 理由 |
|---|---|---|
| `6a9e09f6` `c4a58f3e` `cf037966` | 版本号 4.14.8 / 4.14.9 / 4.14.10 + App Store 发版说明（140 个文件） | 商店分发 |
| `51a29dd6` `05197291` `015b2a38` `a8e6ec42` | `solomd-mcp` 4.14.8~4.14.10 bundle manifest + Registry `server.json` | MCP **分发登记**（不带任何 MCP 源码改动，产品功能见下） |
| `3a83d7eb` `bff7ef22` `7111c273` `099cda42` | 官网版本号 / whats-new / llms.txt / llms-full.txt / MS Store 版本 pin | 官网分发 |
| `8be38f60` | Gitee 镜像只上传本次 release 的资产 | 上游镜像脚本（本仓库已删 `scripts/release-to-gitee.sh`） |

### 合并取舍（本地特性怎么保下来的）

- **遥测保持删除**：上游本轮新代码里重新出现了 `track()` 调用——`Toolbar.vue` 的 `pickViewMode()` /
  `toggleLivePreviewFromMenu()` / 主题按钮共 3 处。这些函数本身是新增的（在新 hunk 里，不产生冲突），
  已逐条摘除，`lib/telemetry.ts` 与 `TelemetryBanner.vue` 不会被重新 import。
- **星标 / 推广 / 赞助 / 商店评分**：`star-prompt.ts`、`web/src/pages/promote.astro`、`Promote.astro`、
  `supporters.ts`、`add-supporter.py`、`store_review.rs`（含 `request_store_review` 命令与 App Store
  评分弹窗）保持不存在；About 对话框只保留「感谢赞助者」与新增的「感谢测试者」，
  推广者列表与 `📣 帮忙推广` 按钮不引入；`Star on GitHub` 文案维持本仓库的 `GitHub`。
- **整目录回退到本仓库**：`web/`（官网）、`app-store/`、`README.md` / `README.zh.md`、
  `.github/` `.gitee/`、`scripts/update-sponsors-readme.py`。与合并前逐字节零差异。
- **MCP 是产品功能，原样保留**：上游本轮对 `mcp-server/` 的**全部**改动只有
  `mcp-server/mcpb/manifest.json` 里一个版本字符串，**零行源码改动**——所以 MCP 功能一点没丢：
  `mcp-server/src/**`、`README.md`、`build.rs`、`tests/`、`Cargo.lock` 与上游逐字节一致
  （唯一差异是本仓库自己加的 `[lints.rust] linker_messages = "allow"`），发布链路也照旧——
  `release.yml` 的 `build-mcp-sidecar.sh` 通过 Tauri `externalBin` 把 `solomd-mcp` **打进应用本体**，
  每个 release 另出 `solomd-mcp-linux-x64/arm64`、`win-x64/arm64` 独立包，
  配套 `install-mcp.sh` / `publish-mcp-crate.sh` / `build-mcpb.sh`。
  被挡在门外的是**上游自己的分发登记信息**，不是功能：`server.json` 里
  `name = io.github.zhitongblog/solomd`、`identifier` 指向上游 release 资产与其 sha256
  （本仓库未登记任何 MCP Registry），`build-mcpb.sh` 里 `REPO=zhitongblog/solomd` 也是从上游取二进制；
  而 mcpb manifest 的 `version` 在打包时由 `build-mcpb.sh <X.Y.Z>` 用命令行参数**直接覆盖**
  （`m["version"] = os.environ["VER"]`，工具清单同样由活的 `tools/list` 重写），
  所以仓库里这个值只是「上次打包留下的痕迹」，不是构建输入。
  本次仍把这份 manifest 的版本从冻结的 4.14.4 对齐到 **4.14.10**（它描述的是本仓库自己出的
  `.mcpb` 制品，跟着 app 版本走更诚实）；`server.json` 保持冻结——那是上游的 Registry 条目。
- **`Toolbar.vue`**：以上游的单行工具栏为基底（五种视图模式收进下拉），把本仓库的两个列表开关
  （项目符号续行 / 自动编号）补回插入下拉所在的 `toolbar__group` 内，并加上 `v-if="isMarkdown"`；
  上游新引入的 3 处 `track()` 摘除。
- **`Editor.vue`**：keymap 采用上游的 `baseKeymapCompartment` 结构（应用级和弦从 CodeMirror 的
  keymap 里过滤掉），本仓库的 `listContinuationKeymap()` 置于其前以优先于普通换行；
  导入合并上游的 `EditorMenuSpell` / `spell-suggest`。
- **`App.vue`**：整体采用上游的懒加载方案——本地此前用 `defineAsyncComponent` 只做了面板懒加载，
  上游的 `useLazyComponent` 连**关闭状态的对话框**（命令面板、快速切换、设置、搜索、关于…）也一并延迟，
  是超集，故取上游；本仓库已自动合并的「删除 `scheduleStarPrompt()` / `track('app_launched')` /
  `<TelemetryBanner />`」三处删除保持生效。
- **`main.ts`**：三方合并——iOS 容器重定位（本地保留）、上游新增的 WebView2 版本探测（挂载前必须已知）、
  本地 i18n 分包语言包加载，统一进一个 `Promise.all` + 1.5s 上界。
- **`code-languages.ts`**：上游与本地做了**同一件事**（把 13 个 lezer 语法包从 `support()` 改成
  `load()` 按需加载），取上游版本，注释改为上游措辞。
- **`ios-container.test.ts`**：上游把该测试改写成 `node:test`（`describe/it`），与本仓库约定一致，取上游。
- **`app-menu.ts`**：上游新增模块里唯一带无扩展名相对导入的（`from './keybindings'`），按本仓库约定
  补成 `'./keybindings.ts'`，使上游新增的 `app-menu.test.ts`（菜单覆盖测试）能被 `node --test` 直接跑。
- **版本号**：取 **4.14.10**（与上游同号，按本文件开头的约定）；上游的三个 bump 提交不引入，
  由 `scripts/bump-version.js 4.14.10` 统一改四处版本源。

### 验证

- `vue-tsc --noEmit` 通过。
- `vite build` 通过（32.5s）。入口 chunk `index-CeSBQsdm.js` **1,738.17 kB / gzip 530.02 kB**，
  与合并前本地的 1,737.95 kB 基本持平——说明本轮并入的启动优化与本地已有优化没有互相抵消。
- 单元测试（本仓库的 `node:test` 跑法）：**232 个用例，222 通过，10 失败**。10 个失败全部是
  **既有问题**（`node --test` 解析不了无扩展名的相对导入），对应测试文件与合并前逐字节一致；
  本轮新增/改动的测试（`app-menu` `editor-commands` `path-key` `plain-nav` `keybindings` `platform`
  `ios-container`）**108/108 通过**。
- Rust 侧 `cargo check` 通过（新增 `menu_spec.rs` 与 `webview_runtime_version` 命令）。
- 排除项零回流（逐项 grep 校验）：`telemetry` / `TelemetryBanner` / `track(`（除 `settings.ts` 里
  清理旧字段的注释）/ `starPrompt` / `store_review` / `request_store_review` / `promoters` /
  `solomd.app/promote` 在 `app/` 下均无新增命中；`git diff main -- web/ app-store/ mcp-server/
  server.json README.md README.zh.md .github/ .gitee/ docs/MARKETING.md` 输出为空。
- 无冲突标记残留（全仓库 `*.ts|*.vue|*.rs|*.json|*.md|*.py|*.sh` 扫描）。

## [4.14.9] — 2026-10-03

一条线：**同步上游 25 个提交**（上游 4.14.4 之后，横跨 4.14.5 / 4.14.6 / 4.14.7 三个版本窗口），
**只取纯产品代码的功能与修复**——市场推广、赞助、商店与 MCP 分发内容不纳入；本地改动全部保留。

### 上游同步

上游 `b799439..3dbcbb0` 共 25 个提交、167 个文件有改动。落地方式是 **`-s ours` 记录合并 + 只 cherry-pick
纯产品修复**：先把上游合并记进来但不带任何内容，再逐个挑选修复——营销 / 赞助 / 分发内容**从未进入工作树**。

**纳入（8 项，纯产品修复）**

| 上游提交 | 内容 |
|---|---|
| `ff3a650` | 导出：macOS 文字版 PDF 不再依赖打印机；Word / PDF 保留图片、图表与公式 |
| `0a2e2ca` | 编辑器：Windows 实时编辑的链接与跨段选择、列表自动重编号、菜单项、编辑器内 `Ctrl+,` |
| `561d1dd` | iOS：文件树支持删除 / 移动 / 重命名 |
| `1063e76` | iOS：工作目录可切换到 Files 里任意文件夹 |
| `7d37b8c` | iOS：在 Files 里显示 SoloMD 的文件夹，并就地编辑其中的文档 |
| `4228553` | iOS：升级后旧容器路径自动重定位（"文件夹不在原位置"） |
| `5982f72` | 脚本：komac 失败时 winget 不再误报 "PR opened" |
| `51abb49` | 脚本：某个包管理器渠道失败不再中断其余渠道 |

**排除：市场推广 / 赞助（6 项）**

| 上游提交 | 内容 | 理由 |
|---|---|---|
| `2a93f9a` | promoter 计划（"像赞助者一样署名"） | 推广 + 赞助 |
| `d1cb547` | App / About / Release / README 求 GitHub star | 推广 |
| `44c1162` | 官网 Hero 的 star 按钮 + 实时计数 | 推广 |
| `07767dd` | 把"零遥测"文案改成"opt-out 匿名统计" | 推广文案 + 遥测 |
| `06a39c3` | App Store 构建弹 Apple 评分框 | 推广 / 评价引导 |
| `1efb96d` | App Store 构建发送使用数据 | 遥测 |

**排除：商店 / MCP 分发（11 项）**

| 上游提交 | 内容 |
|---|---|
| `f39360a` `a871eff` `6d9e179` | 官网版本号 / whats-new / llms.txt 站点更新（4.14.5 / 4.14.6 / 4.14.7） |
| `a8acc83` | 官网 Microsoft Store 版本 pin |
| `b5c45b7` `b239fda` `6d85478` | 版本号 4.14.5 / 4.14.6 / 4.14.7（随商店发版说明） |
| `adf636f` `3dbcbb0` | MCP manifest / Registry 注册（4.14.6 / 4.14.7） |
| `2ce1fa2` `10b22b2` | TestFlight 构建的 `IOS_APP_VERSION` / `IOS_BUNDLE_VERSION` 覆盖 |

### 合并取舍（本地特性怎么保下来的）

- **遥测保持删除**：上游 `1efb96d` 会改本地早已删除的 `lib/telemetry.ts`、`TelemetryBanner.vue`；
  该提交整体不引入，`git grep` 确认这些文件仍不存在。
- **i18n**：`1063e76` 的 15 个语言文件里，incoming 侧同时含**保留的 `iosFolder`** 与被排除的 **`starPrompt`**，
  逐文件只保留 `iosFolder`、丢弃 `starPrompt`。
- **Rust**：`1063e76` 的 `lib.rs` / `runner.rs` 冲突里同样混入被排除的 `store_review`，
  只保留 `ios_folder`（`store_review.rs` 不引入）。
- **`main.ts`**：保留本仓库的按需语言包挂载，叠加上游的 iOS 路径重定位（iOS 侧限时 1.5s，语言包完整后再挂载）。
- **`Cargo.toml`**：`objc2-foundation` 增加 `NSURL` / `NSGeometry` 特性——这是保留的 `ios_folder.rs` 所需，
  虽然该特性原属被排除的 iOS 提交，这里按依赖需要保留。
- **MCP manifest**：`3fcd132`（winget 修复）附带把 `manifest.json` 版本抬到 4.14.5；因 MCP 分发不在同步范围内，
  已回退到已注册的 4.14.4，令 `mcp-server/` 与 `server.json` 保持零改动。

### 验证

- `vue-tsc --noEmit` 通过。
- `vite build` 通过（3392 个模块，约 14.5s）。
- 随修复带进来的 4 个单元测试用本仓库的 `node:test` 运行：**40 / 40 通过**。其中上游的
  `ios-container.test.ts` 原本 `import 'vitest'`（本仓库未装 vitest），已改写为 `node:test`；
  并把 `ios-container.ts` 的 `./platform` 补成 `./platform.ts`（仓库本就开启 `allowImportingTsExtensions`，
  多个 lib 文件已用 `.ts` 扩展名），使其可被 `node --test` 解析。
- 营销 / 赞助 / 分发标记零回流：`store_review`、`starPrompt`、`promote` 页与 `supporters` 均无新增；
  含这些关键词的文件集合与同步前**完全一致**。
- 无冲突标记残留。

## [4.14.8] — 2026-09-30

一条线：**同步上游 14 个提交**（上游 4.14.4 之后的一批），本地功能与改动点全部保留。

### 上游同步

合并上游 14 个提交（`e8f014e..b799439`）：50 个文件有改动，其中 21 个本地也动过，冲突只有 1 个文件。

**功能**

| 上游提交 | 内容 |
|---|---|
| `112ca0e` | 文件树拖拽时提示落点：移动到 / 放在之前 / 放在之后 / 已在其中 / 不能放（#361） |
| `3462ea3` `a282939` | 文件树支持 F2 重命名与 Del / ⌫ 删除，菜单里标出快捷键；双击或回车把焦点交给编辑器（#355） |
| `cb9dfa2` | 设置搜索隐藏空分类，并可在匹配项之间前后跳转（#352） |
| `06587b9` | 未保存对话框的按钮带键盘访问键（Windows/Linux 用 `Alt+键` 或直接按键）（#357） |
| `3a644a9` | 分屏可以不再同步：两栏独立滚动，预览只在保存后刷新 |
| `1176eb1` | 编辑器右键菜单新增「复制图片」（#362） |
| `b799439` | 官网首页展示全渠道下载量，并新增按渠道的管理面板 |
| `79c433b` | 官网新增「SoloMD 能在我的 Linux 上跑吗」文档页（流程图 + 发行版对照表） |

**修复**

| 上游提交 | 内容 |
|---|---|
| `c990101` | A4 可以被真正选中，PDF 目录页码因此能打开（#347） |
| `4ea3475` | 文件树里点击 `.html` 文件直接打开，不再每次新导入一份 `.md`（#356） |
| `a7a5a00` | 首行为空时，标题 / 列表 / 引用快捷键可用（#360） |
| `14dccbb` | Windows 实时编辑里大纲跳转落在标题本身，而不是上一行（#343） |
| `104e728` | Windows 实时编辑不再给多行段落加双倍行距，点击也不再跳动（#366） |

### 合并取舍（本地特性怎么保下来的）

- **站点不接统计接口，但把下载统计接回来**：上游把「全渠道下载量」写进了 `web/src/pages/admin/index.astro`，
  而本仓库早就删掉了这个文件——它的上一版整页都服务于 `/api/admin/stats` 遥测面板（连同 `/api/track`、
  `admin/stats.ts`、`ANALYTICS.md` 一并移除）。处理方式是**取上游的下载部分、丢掉遥测部分**：新的 admin 页
  保留 `GET /api/admin/downloads` 的 KPI、GitHub 分平台、逐日三块，删掉 App usage（Events / Devices /
  OS / Locale）、`load()` 与时间范围选择器；配套的 `web/functions/api/admin/downloads.ts`、
  `web/migrations/0003_downloads.sql`、`.github/workflows/download-stats.yml`、`scripts/collect-downloads.py`
  按上游保留。
- **i18n**：上游这轮 17 个新键**给 16 种语言都做了本地化**（不只是英文占位），中文文案直接沿用；
  未见 `telemetry` 段回流。
- 其余 20 个重叠文件（`Editor.vue`、`SettingsPanel.vue`、`settings.ts`、`main.css`、`pdf-options.ts` 与
  16 个 i18n 文件）由 git 自动合并：本地删除遥测、上游新增功能，两边落在不同区域，无人工干预。

### 验证

- `vue-tsc --noEmit` 通过（`I18n` 类型由 `en` 推导，键不一致必报错）。
- `vite build` 通过（3389 个模块，21 秒）。
- 本仓库删除的 7 个文件（`lib/telemetry.ts`、`TelemetryBanner.vue`、`web/functions/api/track.ts`、
  `admin/stats.ts`、`web/ANALYTICS.md`、`scripts/release-to-gitee.sh`、`mirror-gitee.yml`）合并后仍不存在；
  本仓库的 11 个文件（`build.bat`、`release.bat`、`scripts/bump-version.js`、
  `scripts/package-portable-win.ps1`、`scripts/release-notes.js`、`CHANGELOG.md`、`app/vite.config.ts`、
  `app/src/i18n/index.ts`、`lib/cm-list-continuation.ts`、`lib/list-continuation.ts`、
  `app/pnpm-workspace.yaml`）都在，且 `vite.config.ts`（+148）、`i18n/index.ts`（+106/-25）等核心改动
  相对上游仍有差异。
- 无冲突标记残留。

## [4.14.7] — 2026-09-28

一条线：**同步上游 48 个提交**（横跨上游 4.14.2 / 4.14.3 / 4.14.4 三个版本窗口），本地功能与
改动点全部保留。

### 上游同步

合并上游 48 个提交（`e71aee9..e8f014e`）：176 个文件有改动，其中 35 个本地也动过，冲突只有 6 个文件。

**功能**

| 上游提交 | 内容 |
|---|---|
| `78ab516` | 便携模式：设置存到 exe 旁边的 `data` 目录（#295） |
| `54a13fc` `1d3a91e` `3d907f9` | 文件树：按名称 / 创建 / 修改 / 手动排序（#342），跟随当前文件（#333） |
| `3d8fd70` `0e97dc8` | 俄语界面（#157），状态栏与专注会话提示一并翻译 |
| `92b9e2a` | 编辑器：Markdown 标记常显、当前行着色（#353 #344） |
| `3f12465` | Windows 可以不用 Vim 模式运行 CodeMirror（#328 #344） |
| `54adcb8` `036fdf4` | 右键菜单：剪切 / 复制 / 粘贴 / 全选（#210） |
| `c30e50f` | 阅读模式：最大化按钮，退出改用笔形图标（#221） |
| `0c33c3f` | 一个快捷键在实时编辑与仅编辑之间切换（#180） |
| `04e7fd1` | 设置项全局搜索（#352） |
| `1863797` `85a7baf` | 文字版 PDF：带标题的目录页；Windows 上不打印页眉页脚（#347） |
| `fadec45` | macOS Quick Look 渲染 Markdown，而不是纯文本（#351） |
| `f62f09c` `8f3d654` `34cc76d` | 工具栏：可隐藏纯键盘书写的按钮；AI 未启用时隐藏 AI 重写按钮（#346） |

**修复**

| 上游提交 | 内容 |
|---|---|
| `e1c27df` | 实时编辑里的 mermaid 图跟随深色主题（#354） |
| `ac422f6` | 图片路径含空格时能渲染（#345） |
| `69fa1ed` `149aab6` | HTML / 文字版 PDF / 图片版 PDF 导出在纸张上使用中性强调色（#332） |
| `dee125e` | 大纲跳转落在标题上，大纲跟随阅读位置（#350） |
| `0c8f053` | Android 选中的图片会真的插入（#349） |
| `d4ad860` | 文件夹内新建文件行与同级条目对齐（#321） |
| `118ba82` `fef2c36` | MiniMax 成本估算与 MiniMax-M3 定价 |
| 其余 | 外部打开拒绝更多可执行类型、站点 / README / 关于对话框统一赞助名单，以及 4.14.2~4.14.4 的版本号、商店说明、官网与包管理器（Homebrew / Chocolatey / winget / Scoop）杂项 |

### 合并取舍（本地特性怎么保下来的）

- **i18n 保持按需加载**：上游的 `i18n/index.ts` 一次性静态导入全部 15 种语言——正是本地那次
  「入口 chunk 4145 → 873 kB」优化要去掉的东西。这里保留本地结构，只把俄语加进 `LANGS` 与
  `loaders`；上游 #352 新增的 `getDict()`（设置搜索用）改为读本地的 `loaded` 表，英文常驻，
  语义不变。
- **`Editor.vue`** 冲突只在 import 段：上游的右键菜单、`isAndroid` / `isIOS`、`computeListContinuation`
  与本地 `ListContinuationOptions` 类型、`listContinuationKeymap` 取并集，其余自动合并。
- **`ru.ts`（上游新增）** 既缺本仓库的 4 个键（`listContinueOn` / `listContinueOff` /
  `autoNumberOn` / `autoNumberOff`，即两个列表续写与自动编号开关的悬停提示），又多出 `telemetry`
  段（本仓库的 `en` 里没有这一节，而 `I18n` 类型正是由 `en` 推导）。补键删段后 `vue-tsc` 的两个
  报错消失。
- **版本文件** 的 4 个冲突仍是纯版本号，取本地的 4.14.6（随后 release 会再覆盖）。这次 `Cargo.toml`
  的冲突块只含 `version =` 一行，没有连带吃掉本地的遥测注释 —— 已用 `Select-String` 复核。

### 验证

- `pnpm build`（`vue-tsc --noEmit` + vite）通过。
- `node --test src/lib/*.test.ts`：27 个测试文件 165 条用例，155 通过；失败的 10 个文件全部是既有的
  `ERR_MODULE_NOT_FOUND`（导入链缺 `.ts` 后缀，Node ESM 解析不到），无断言失败。
- 精确的「本地改动是否被合并吃掉」检查：本地 92 个改动文件在合并后仍全部带本仓库内容
  （`Compare-Object` 的 `<=` 侧为空）。
- 无 `lib/telemetry` 引用、无 `track(` 调用、无遥测文件；`lib/katex-standalone.ts` 的 Windows
  相对 `import.meta.glob` 补丁仍在。

## [4.14.6] — 2026-09-24

一条线：**同步上游 13 个提交**，并把与本地功能重叠的部分按「上游为主、本地特性叠加」的方式合并。

### 上游同步

合并上游 13 个提交（`595209a..e71aee9`），两侧改到了同一批文件，10 个文件冲突：

| 上游提交 | 内容 |
|---|---|
| `838ed88` | 代码块围栏语言补全（#297），语法包搬进 `lib/code-languages.ts` |
| `c764ea8` `118ac93` `dda2b4c` | PDF：分页不再切字、文字版 PDF 每页都能打印、长表格重复表头、表格内分页落在行之间 |
| `77ef464` `0168f60` | 导出：独立 HTML 内嵌本地图片、图表与公式（无 CDN），Word 里的图表（#332 #256 #313） |
| `8059e07` | 剩余菜单本地化、所有文件选择器都有合理起始目录、reveal-in-tree |
| `4a57e9d` `328d8d2` | 文件树：缩进辅助线、按选中项决定新建位置、删除确认、文件夹图标、双击打开选项（#338） |
| `516237f` | 回车续写列表（Windows 编辑 / 分栏的普通 textarea，#341） |
| `d8cd976` | 图片查看器：Esc 在任意焦点位置都能关闭（#339） |
| `9b9b754` `e71aee1` | 「用默认程序打开」真的能打开，并拒绝更多可执行类型（#331 #333） |

### 合并取舍（本地特性怎么保下来的）

- **mermaid 导出**：本地上一个版本在 `lib/mermaid-inline.ts` 里做过一遍（HTML / 剪贴板），上游的
  `lib/diagram-export.ts` 覆盖得更全（还管 PlantUML、Word 位图、WebKit canvas 污染问题），
  所以**删掉本地实现、改用上游的**；只把本地那半边——「复制为 HTML」用 2× PNG——作为
  `inlineDiagramsInHtml({ asPng: true })` 的选项加在上游文件里（注释里标了 fork addition）。
- **Esc 关闭图片查看器**：上游 #339 的修法与本地完全一致（监听 window 捕获阶段），而且把
  `removeAllListeners` 的 capture 参数也一并修了 —— 直接采用上游版本，本地改动作废。
- **文件树**：本地 4.14.4 做的缩进线 / 选中决定新建位置 / 删除确认，上游同样做了（另加文件夹图标与
  双击打开），采用上游版本。
- **回车续写列表**：采用上游 `lib/list-continuation.ts` 的规则（多级引用、围栏内不续写、光标在标记内
  不续写），在它上面叠加本地两个开关与多级编号：`computeListContinuation()` 增加
  `ListContinuationOptions` 参数，行首编号支持 `1.1` → `1.2`（`bumpNumberedToken`）。CodeMirror
  侧上游没有接线，本地补 `lib/cm-list-continuation.ts`（`insertNewlineContinueMarkup` 在本项目里
  并未被引用）。单测由上游 11 条 + 本地 7 条合并成 18 条。
- **入口体积优化**：上游的 `code-languages.ts` 仍是 13 个语法静态导入，本地的按需 `load()` 版本保留
  （`fence-languages.ts` 只读 `name`/`alias`，不受影响）。
- **不引入统计调用**：上游这些提交不带遥测，但采用上游 `useExport.ts` 会把本地删掉的 `track()` 调用带回来，
  已重新剔除（`lib/telemetry.ts` 在本仓库里不存在，否则构建直接失败）。

### 顺带修的本地问题

- `lib/katex-standalone.ts`（上游新增）用 `import.meta.glob('/node_modules/katex/dist/fonts/*.woff2')`
  取字体，在 Windows 上 Vite 会把它解析成 `/d:/...` 并生成
  `../../../../../../../d:/Code/...?url` 这种无法解析的路径，**本地构建直接失败**。改为相对写法
  `'../../node_modules/...'`（同样是相对导入者目录解析）。

### 发布说明与文档

- Release 正文不再指向上游站点：新增 `scripts/release-notes.js`，输出「本 tag 对应的 CHANGELOG 章节 +
  Install / Verify 固定段落」整份正文，workflow 直接用它（改草稿正文也能复用同一份输出）。
- **macOS 文案改为「由本地构建、暂不提供」**：14 个 README 的 macOS 小节 + Release 正文里的安装说明
  （CI 没有 macOS 任务，产物里从来就没有 dmg）。
- 新增 `scripts/release-notes.js`、`.github/workflows/release.yml` 的对应步骤。

## [4.14.5] — 2026-09-24

### Mermaid 图表的导出（HTML / 剪贴板）

此前 mermaid 只在三个地方被渲染成图：预览面板、图片版 PDF、文字版 PDF（打印）。**导出 HTML** 与
**复制为 HTML** 两条路径从来没做这件事，于是一个带 ```mermaid 的笔记导出后，图表会原样变成一段代码。
本次改动只修这两条路径，不动预览与 PDF 的既有行为。

- 新增 `app/src/lib/mermaid-inline.ts`，把原先散落三处的「把 ```mermaid 代码块换成图」收敛为
  `inlineMermaidBlocks(container, opts)` 与 `inlineMermaidInHtml(html, opts)` 两个入口；`pdf-export.ts`、
  `image-export.ts`、`useExport.ts` 里各自的渲染函数都变成它的薄封装，行为逐处保持：
  PDF 出错写错误行、图片出错保留代码块、打印出错写错误行。
- **导出 HTML**：内联 SVG。导出页始终是浅色纸张，因此图表固定 `default` 主题；mermaid 把主题样式写在
  `<svg>` 内部，所以文件仍是单文件、不联网也能看。模板同步补上 `.mermaid-block`（居中 / 限宽）与
  `.mermaid-error` 样式。
- **复制为 HTML**：贴进 Word / Google Docs / 邮件时内联 `<svg>` 会被丢弃，这里改成 2× PNG
  （复用 `svgToPngBlob`），背景与主题跟随应用，和预览里「复制图片」的做法一致。
- 没有 ```mermaid 的文档完全不触碰渲染器（mermaid 仍是按需加载的 ~590 kB chunk），字符串原样返回。

### 回车续写列表 + 图片预览按 ESC 退出

**回车续写列表（自动继承上一行格式）**

之前只有 Windows 的「实时编辑」模式会续写列表：`core` 逻辑写死在 `Editor.vue` 的 `computeSmartEnter()` 里，
而「编辑 / 分栏」的普通 textarea 路径、以及 CodeMirror（macOS / Linux / Vim）路径根本没有这个处理；
`1.1 AAA` 这类多级编号也不会续号（旧正则只认 `1. `）。现在：

- 逻辑抽到 `app/src/lib/list-continue.ts`（纯函数 + 18 条单测），三条编辑路径共用：
  普通 textarea（新增回车处理）、实时编辑的块编辑器（沿用原行为）、CodeMirror
  （`app/src/lib/cm-list-continue.ts` 提供一个 keymap，排在 `defaultKeymap` 之前）。
- **多级编号**：`1.1` ⏎ → `1.2`、`1.1.9` → `1.1.10`，只递增最后一级，并保留原分隔符风格
  （`1)` → `2)`、缩进也保留）。
- 工具栏新增两个 **Word 风格**的开关按钮（无下拉箭头，按下态即开关的值），默认都开：
  - **项目符号**（`markdownListContinue`）：回车是否继承上一行的列表 / 引用格式。关掉 = 回车就是普通换行。
  - **自动编号**（`markdownAutoNumber`）：有序列表是否自动算号。关掉 = 有序列表不再续行（无序列表 /
    任务列表 / 引用不受影响）。
- 已知取舍：多级编号要认 `1.1`，就无法区分「行首像 `1.5 is not a list` 的小数」——与
  「编号章节自动转标题」同一个启发式取舍，单测里明确断言了这一点；关掉「自动编号」即可完全关闭。

**图片预览按 ESC 退出**

`image-overlay.ts` 一直把 keydown 监听挂在遮罩层上，但打开预览时焦点并不在遮罩层里（文件树行 / 预览
面板仍然持有焦点），所以 Esc 从来没生效过（文件头部注释里写的 "close by Escape" 是假的）；`⌘/Ctrl +`
`-` `0` 缩放快捷键同样失效。改为在 `document` 上捕获阶段监听：Esc 先于应用层的其它 Esc 处理执行
（模态优先）。顺带修掉一个连带 bug：`removeAllListeners()` 之前不带 `capture` 移除监听，
capture 监听器会永久残留并继续吞掉 Esc。

**发布说明改为内联本文件的对应章节**

Release 正文原先固定写死两行链接指向 `solomd.app/whats-new` —— 那是上游的站点、讲的是上游的版本，
对本地构建来说恰好是最不该指向的地方；读者还得离开 GitHub 才能知道改了什么。现在
`.github/workflows/release.yml` 里新增一步，调用 `scripts/release-notes.js <tag>` 取出本文件里
`## [版本]` 那一节（到下一个 `## ` 标题为止）并内联进「### What's new / 更新内容」。该标签没有对应
章节时回退为仓库内 CHANGELOG 链接，任何情况下都不会让发布失败。

## [4.14.4] — 2026-09-24

三条线：**前端产物体积 / 冷启动**、**文件树体验**、**文档**。

**上游同步**：合并上游 2 个 chore 提交——4.14.1 的商店发布说明（14 种语言）、站点把
Microsoft Store 的版本号改到 4.14.1。两者都不涉及应用源码。

### 前端产物体积与冷启动

入口 chunk（WebView2 每次冷启动都要解析编译的那一个）从 **4048 kB 降到 873 kB**。

| 项 | 之前 | 之后 | 做法 |
|---|---|---|---|
| 入口 chunk | 4048 kB | **873 kB** | 见下面各条 |
| KaTeX | 两份完整副本（渲染体积 1283 kB） | 一份（`vendor-katex` 286 kB） | `resolve.alias` 把裸 `katex` 钉到 ESM 版 |
| 语言包 | 14 个字典共 ~1.1 MB 全打进入口 | 13 个独立 chunk（72–110 kB） | 每个语言一个动态 `import()` |
| CodeMirror 语法包 | 13 个语法共 ~390 kB 在入口 | 13 个按需 chunk | `LanguageDescription` 改成 `load()` |
| 面板 / 弹窗 | 14 个「只在打开时才渲染」的组件静态导入 | 各自成 chunk | `defineAsyncComponent` |

逐条说明：

- **KaTeX 重复打包（约 600 kB）**：`@vscode/markdown-it-katex` 只发 CommonJS，它的 `require('katex')`
  解析到 `dist/katex.js`，而本仓库自己的 `import katex from 'katex'` 拿到 `dist/katex.mjs`，Rollup
  把两份都打了进来。`app/vite.config.ts` 用 `{ find: /^katex$/, replacement: 'katex/dist/katex.mjs' }`
  统一到一份；锚定正则保证 `katex/dist/katex.min.css`、`katex/contrib/mhchem` 等子路径不受影响。
- **语言包按需加载**（`app/src/i18n/index.ts` + `app/src/main.ts`）：只有英文（所有查找的最终回退）
  留在入口，其余 13 个语言各自成 chunk；`main.ts` 在 `app.mount()` 之前先 `loadLocale()` 当前语言，
  所以中文用户不会看到闪一下英文。切换语言时由同一个 watcher 异步换字典。
- **语法高亮按需加载**（`app/src/lib/code-languages.ts`）：13 个 `LanguageDescription` 从
  `support:`（立即构造）改为 `load: () => import(...)`。lezer 支持「未加载的语言描述」——先跳过嵌套
  解析，等 promise 落地后自动重排（`ParseContext.getSkippingParser`），所以代码块是延迟几毫秒着色，
  而不是永远不着色。
- **`manualChunks` 只对白名单分组**（`app/vite.config.ts`）：vue / 编辑器核心 / 预览管线 / Tauri 等
  常驻依赖按家族分组；**没有**用万能兜底规则，否则 mermaid、tldraw 这类自己会懒加载的库会被压平回
  一个大文件（实测 mermaid core 会从 587 kB 涨到 1252 kB）。
- **按需渲染的界面改异步组件**（`app/src/App.vue`）：右栏面板、Bases / Inbox / TypeLens、UI 画廊等
  14 个本来由 `v-if` 门控的组件改为 `defineAsyncComponent`，首次渲染时才拉取代码。
- **`chunkSizeWarningLimit: 1800`**：剩下的超限 chunk 都是**按需加载的第三方整包**，无法再切——
  tldraw 1738 kB（白板）、OpenCC + pinyin-pro 1414 kB（中文转换）、jsPDF + html2pdf.js 985 kB（PDF
  导出）、mermaid core 587 kB（图表）。阈值设在这些之上，新冒出来的大 chunk 仍然会被警告。
- **过滤 `"use client"` 噪音**（`rollupOptions.onwarn`）：tldraw 依赖的 `@radix-ui/*` 每个包 ESM 首行
  都带 Next.js 的 `"use client"` 指令，Rollup 逐条告警（38 条/次）。按 warning code
  `MODULE_LEVEL_DIRECTIVE` + 指令名精确过滤，其它 Rollup 警告照旧输出。

### 文件树

- **层级参考线**：每层画一条虚线竖向参考线，外加连到父级的短横线（`indentGuides()`）。之前只靠
  `padding-left` 每层 +12px，层级深了分不清归属。参考线是绝对定位的，行的 padding、间距、拖拽命中区
  一律没变；内联的新建/重命名输入行同样有。
- **选中行**（`.ftree__item--selected`）：单击行、右键行、以及**当前打开的文档**都会更新选中状态；
  切换工作区或隐藏文件树时清空，避免指向一个用户已经看不到的旧目录。
- **新建文件的默认位置**（新增 `app/src/lib/new-file-target.ts`）：选中文件夹 → 建在该文件夹；选中
  文件 → 建在该文件所在文件夹；都没选 → 当前打开文档所在文件夹。保存对话框（`saveTabAs`）用它作为
  默认目录，文件树自己的 ＋ 按钮和右键菜单用它决定落在哪个文件夹（且只在选中项确实在树里时才采用，
  否则退回工作区根目录）。顺带修掉「右键选中文件时把文件当成目录」的隐患。
- **删除前确认**：原来的 `window.confirm` 换成应用内对话框（`DsModal`）——原对话框样式与全应用不一致、
  部分平台直接不弹、且文案硬编码英文。新文案区分文件/文件夹与「回收站 vs 不可撤销」，并补齐 14 种
  语言。原有的 8 秒撤销窗口（`usePendingDeletes`）保持不变。
- 新增单测 `app/src/lib/new-file-target.test.ts`（8 个用例，覆盖两种分隔符、无父目录、选中项失效等边界）。

### 文档

- 新增本文件 `CHANGELOG.md`：按版本记录本仓库的改动，并单列「与上游的功能差异」与「上游同步方式」。
- 14 个 `README*.md` 的链接统一指向本仓库（`chenghaitao/solomd`）：徽章、releases、issue、clone 地址。
  删除了上游站点的营销入口（Launch post / How we built it / Website / Security）、Gitee 镜像、
  `## Contact` 章节，以及 `install.sh` / `install.ps1` / `winget` / `brew --cask` 这些会装到上游构建的
  安装渠道；版本化资源链接（`SoloMD_4.0.0_*`，两个仓库里都已是 404）改为指向本仓库的 releases 页。
  每个 README 都加了一行 fork 说明并链到本文件。保留 `solomd.app/share/?repo=…`（应用运行时真的会
  复制这个链接）与 `/Applications/SoloMD.app/…` 这类文件系统路径。

## [4.14.3] — 2026-09-23

- **上游同步**：合并上游 4.14.1 及其后 8 个提交（#271 表格单元格挤压、#218 标签页列表下拉、#263/#306
  关闭按钮、#259 文件树长文件名用满侧栏宽度、#326 点击空白处定位光标、#325 附件目录默认隐藏等）。
  冲突只有两类：4 个版本文件（纯数字冲突）与 `PaneTabBar.vue`（上游的新标签与本地 i18n 的 `:title`）。
- **i18n 收尾**：菜单、工具提示、Android 目录选择器、编辑器查找条等最后一批硬编码字符串补齐；新增约
  25 个键 × 14 种语言（`export type I18n = typeof en` 让 `vue-tsc` 强制各语言键齐全）。
- **文件选择器起始目录**：所有 `open` / `save` 都传入**确实存在**的目录。Windows 上把不存在（或指向
  文件）的路径交给 `set_default_path`，rfd 会静默退回 shell 的虚拟桌面根，点确定报
  `MK_E_UNAVAILABLE`（中文：没有供标记使用的对象）且对话框关不掉。
- **Reveal in file tree 重写**：就地展开祖先并高亮（填充 + 描边 + 渐隐，纯色底在低对比主题里看不见），
  不再把工作区重新定位到文件所在目录；文件确实在工作区外时才改根。
- **`bump-version.js` 顺带更新 `Cargo.lock`**（上一版修复的收尾确认）。

## [4.14.2] — 2026-09-23

- **上游同步**：合并上游 4.14.0 之后的 6 个前端修复（#319 表格编辑器退格、#320 工具栏菜单高度、
  #321 文件树新建/重命名输入框位置、#329 手机工具栏换行、#330 Windows 查找框焦点）。零冲突。

## [4.14.1] — 2026-09-22

- **上游同步**：合并上游 4.14.0。
- **`bump-version.js` 同时更新 `Cargo.lock`**：此前发版后跑一次 cargo 就会把 lock 改写、工作区留下脏
  文件；现在按 `[[package]] name = "solomd"` 精确匹配那一条版本号。

## [4.13.4] — 2026-09-21

- **上游同步**：合并上游 4.13.3。
- **PDF 分页不再切断整行文字**：分页位置按行盒计算，之前会把一行字从中间切开。
- **HTML 导出内嵌本地图片**：导出文件里的图片改成 base64 内嵌。此前导出会把本地路径改写成
  `http://asset.localhost/…`——只有 SoloMD 自己的 webview 能解析，别的浏览器打开全是坏图。

## [4.13.3] — 2026-09-20

本仓库的第一个本地版本，基础是上游 4.13.2。

- **移除匿名遥测**：不是「可选关闭」，而是彻底删除。删掉 6 个文件
  （`app/src/components/TelemetryBanner.vue`、`app/src/lib/telemetry.ts`、`web/ANALYTICS.md`、
  `web/functions/api/track.ts`、`web/functions/api/admin/stats.ts`、`web/src/pages/admin/index.astro`），
  并清理 14 个语言文件、设置项、工具栏入口与站点文案里的相关描述。
- **#297 ``` 围栏语言联想**：输入 ``` 时给出语言列表（`lib/fence-languages.ts`、
  `lib/cm-fence-completion.ts`，含 174 行测试）。列表从 `lib/code-languages.ts` 派生，不另存一份。
- **#317 文件新鲜度兜底**：上游有「启动 + 窗口聚焦」两次扫描，本仓库再加一个每 30 秒的巡检，覆盖
  那些不发事件的改动（同步盘、外部编辑器）。
- **Windows 批处理脚本解析崩溃**：`build.bat` / `release.bat` 里含非 ASCII 字节时，cmd.exe 按控制台
  代码页解码会吞掉 CR，解析器错位并执行半截行。两个脚本改为纯 ASCII + CRLF。
- **构建与仓库卫生**：pnpm 允许 esbuild / core-js 跑安装脚本；本地产物（`local_build_output/`）加入
  `.gitignore`；删除上游的 Gitee 镜像 workflow（`mirror-gitee.yml`）与 Gitee 发布脚本（本仓库没有
  对应的 secrets，每次 push 都失败）。
- 两项后来被上游同等修复取代的改动（合入时取了上游版本，功能上无差异，仅存于历史）：
  「未被监听时磁盘文件变化后刷新标签页」、「无 CodeMirror 时焦点模式与实心光标可用」。

---

## 与上游的功能差异

### 未纳入的上游行为

| 上游行为 | 本仓库 |
|---|---|
| 匿名遥测（前端 POST 到 `solomd.app/api/track`，可在设置里关闭） | **完全移除**，应用与站点两侧的采集代码、横幅、后台页、站点文档一并删除 |
| Gitee 镜像：`mirror-gitee.yml` 工作流 + 发布脚本 | 删除（本仓库没有 `GITEE_*` secrets，该工作流每次 push 都失败） |
| README 里的站点营销入口（Launch post / How we built it / Website / Security）与 Gitee 镜像链接 | 已从各语言 README 移除，链接统一指向本仓库 |

保留但与本仓库定位无关的上游内容：Gitee 作为 **git 托管**的功能（`github_sync.rs` 及其设置界面、
`gitee_auth_e2e_test.rs`）、源码注释里的 Gitee issue 号。

### 本仓库新增的功能与修复

- ``` 围栏语言联想（#297）。
- 文件新鲜度 30 秒兜底巡检（#317 的本地部分）。
- 「在文件树中显示」就地展开 + 高亮重写。
- 全部文件选择器使用真实存在的起始目录（修 Windows 虚拟桌面死对话框）。
- i18n 收尾：菜单 / 工具提示 / Android 目录选择器 / 编辑器查找条等硬编码字符串补齐，14 种语言齐全。
- PDF 分页不切断整行；HTML 导出内嵌本地图片。
- 前端产物体积与冷启动优化（见 Unreleased 一节）。
- 文件树层级参考线、选中行、新建文件的默认位置、删除前确认对话框（见 Unreleased 一节）。

### 本仓库新增的工程与发布设施

上游没有这些文件：`build.bat`、`release.bat`、`scripts/bump-version.js`、
`scripts/package-portable-win.ps1`、`.gitattributes`、`app/pnpm-workspace.yaml`。

- `build.bat`：Windows 一键出 MSI + 便携 zip，产物进 `local_build_output/`（已在 `.gitignore`）。
  它会先把 `solomd-mcp` sidecar 编译到与 tauri 相同的位置，这样 bundling 阶段的
  `beforeBundleCommand` 变成空操作，绕开 Git Bash 里 `/usr/bin/link` 抢走 MSVC 链接器的问题。
- `release.bat <version> ["msg"]`：改版本号（`app/package.json` + `tauri.conf.json` + `Cargo.toml` +
  `Cargo.lock`）→ 提交 → 重建本地 tag → 推 `main` 和 tag。注意它**即使成功也返回退出码 1**
  （最后一句 `git ls-remote --exit-code` 探测残留 errorlevel），看输出而不是退出码。

### 上游同步方式

```bash
git fetch upstream --no-tags          # 绝不要带 --tags，也不要用 --force
git merge upstream/main               # 冲突基本集中在版本号文件与 14 个语言文件
```

判断「合并有没有丢掉本地改动」的精确做法（朴素的名字对比有假阳性：上游也改过的文件会从差异列表里
消失）：

```powershell
$forkChanged = git diff --name-only <上次合并点> <本地 HEAD> | Sort-Object   # 本仓库自己的改动
$differs     = git diff --name-only upstream/main HEAD | Sort-Object       # 合并后与上游的差异
Compare-Object $forkChanged $differs | Where-Object { $_.SideIndicator -eq '<=' }   # 必须为空
```

每次同步后顺带检查 `git ls-files | Select-String telemetry` 与 `Select-String mirror-gitee` 都必须
无输出——上游的新提交有可能把这些文件的引用带回来。
