# Changelog / 更新日志

本仓库是 **[zhitongblog/solomd](https://github.com/zhitongblog/solomd)** 的 fork（**chenghaitao/solomd**）。

本文件只记录 **本 fork 自己的改动**，以及 **与上游的功能点差异**。上游发布的 v4.x 功能请见上游仓库的
Releases；每次合并上游的节点单独记在「上游同步」一节里。

几条约定：

- **版本号沿用上游的 4.x 序号**，因此可能与上游重号（上游先占了 4.14.0 / 4.14.1，本 fork 用
  4.14.1 / 4.14.2 / 4.14.3 与之区分）。
- 拉取上游一律 `git fetch upstream --no-tags`：两边都有 `v4.13.3` 标签，带 `--tags` 会被拒或被
  `--force` 悄悄改写本地标签。
- 本 fork 的 release 由 CI 产出，默认是 **draft**，需要在 GitHub 上手动 Publish 才对外可见。

---

## [4.14.12] — 2026-10-10

一条线：**一次修完 9 个待办 issue**（全部是本 fork 自研，本版**不含任何上游同步**），外加设置界面的中文补全。
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
  ≈ 8px，上 1px），再用 `WM_NCCALCSIZE` 把客户区缩回去 —— 可见窗口因此比 HWND 小一圈，那圈边距就是残留带的来源。
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

## [4.14.11] — 2026-10-09

一条线：**同步上游 43 个提交**（上游 4.14.10 之后 → 4.14.11），只取纯产品代码的功能与修复；
市场推广 / 赞助 / 遥测 / 商店与 MCP 分发登记一律不落地；本地改动（遥测移除、列表续行开关、
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
| `20feffb7` | 版本号 4.14.11（4 个版本源） | 版本号由本 fork 的 `bump-version.js` 统一改 |
| `56e41b78` `f0f22279` | App Store 发版说明 14 种语言（28 个文件） | 商店分发 |
| `cdf48cec` | 官网版本号 / whats-new / llms.txt | 官网分发 |
| `4ccc6006` | `solomd-mcp` 4.14.11 bundle manifest + Registry `server.json` | manifest 见下；`server.json` 是上游的 Registry 登记条目，冻结 |

### 合并取舍（本地特性怎么保下来的）

- **排除路径整体回退**：`web/`、`app-store/` 用 `git restore --source=HEAD` 回退，与合并前**逐字节零差异**；
  `server.json` 取本 fork 版本（冻结在上游旧值，本 fork 未登记任何 MCP Registry）。
- **`mcp-server/mcpb/manifest.json` 保留上游版**：这轮它不只是改版本号，还把 4 个工具
  （`export_note` / `get_outline` / `read_agent_trace` / `write_note`）的描述同步到新的 mcp-server 源码——
  正是上面 `27fe16dd` 的产品修复的一部分；版本 `4.14.11` 与本 fork 相同，无需回退。
- **`App.vue`**：上游新加的 `focusActiveEditorSoon(...)`（产品，焦点修复）与 `scheduleStarPrompt()`
  （排除，求 star）挤在同一个 hunk 里——**保留焦点修复、摘除 star prompt**。
- **`useFileWatcher.ts`**：本地 30 秒兜底巡检 `startWatchdog()` 与上游新加的 `keydown` 捕获监听
  落在同一处，**两者都保留**。
- **`app-menu.ts`**：上游新增模块里的无扩展名导入 `'./keybindings'`，按本 fork 约定补成
  `'./keybindings.ts'`，使其新增的 `app-menu.test.ts` 能被 `node --test` 直接跑。
- **MCP 源码是产品功能，原样保留**：与上几次「只改 manifest、零源码改动」不同，这轮上游对
  `mcp-server/src/` 有真实修复（`27fe16dd`），全部保留。
- **顺带补齐无扩展名导入（fork 的 `node --test` 约定）**：`md-format.ts`、`docx-export.ts`、
  `diagram-export.ts`、`markdown.ts`、`stores/types.ts` 以及两个新测试文件里的相对导入补上 `.ts`，
  使本轮新增 / 改动的测试可以就地跑通（仓库本就开启 `allowImportingTsExtensions`，多处以 `.ts` 导入）。
- 其余重叠文件（15 个 i18n、`Editor.vue`、`SettingsPanel.vue`、`Toolbar.vue`、`useExport.ts`、
  `settings.ts`、`Cargo.toml`、`commands.rs`、`lib.rs`、`runner.rs`）自动合并，本地删除遥测、
  上游新增功能各落各区，无人工干预。

### 验证

- `vue-tsc --noEmit` 通过（`I18n` 类型由 `en` 推导，键不一致必报错）。
- `vite build` 通过（22.05s）。入口 chunk `index-DdF9T1vb.js` **1,738.17 kB / gzip 530.02 kB**，
  与合并前**完全一致**（1,738.17 / 530.02）——说明本轮并入的修复没有改变入口体积。
- 单元测试（fork 的 `node --test` 跑法）本轮新增 / 改动的 13 个测试文件：**115 / 115 通过**。
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
菜单、工具栏与启动性能修复整体纳入；市场推广 / 赞助 / 遥测 / 商店与 MCP 分发内容一律不落地；
本地改动（遥测移除、列表续行开关、启动懒加载、i18n 分包）全部保留。

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
| `6641c01d` `376e9e7e` `41fd8820` | 新增 `auto` 引擎：WebView2 ≥ 154 用 CodeMirror，否则回退原生 textarea；中途 `376e9e7e` 曾把 CodeMirror 设为 Windows 默认，`41fd8820` 又因搜狗输入法在 WebView2 154 上掉字母而改回**原生为默认**——本 fork 取最终态 |

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
| `67a82b94` | `ios-container` 测试改用 `node:test`（与本 fork 约定一致） |
| `a3233d88` | Gitee 同步往返 e2e 测试（真实同步代码：推→拉→改→推→拉） |
| `bf49ac1a` `a7b937af` `b6324cca` `f020f728` | Windows 真输入法打字测试台、`?imetrace` 事件追踪（DEV 限定）、`?forceCodeMirror` QA 钩子、UI-steps 驱动 |
| `8da63163` | 测试者致谢（**仅 App 内 About 对话框的「感谢测试者」一节**；官网 thanks 页属排除项） |

**排除（12 个提交 + 140 个文件）**

| 上游提交 | 内容 | 理由 |
|---|---|---|
| `6a9e09f6` `c4a58f3e` `cf037966` | 版本号 4.14.8 / 4.14.9 / 4.14.10 + App Store 发版说明（140 个文件） | 商店分发 |
| `51a29dd6` `05197291` `015b2a38` `a8e6ec42` | `solomd-mcp` 4.14.8~4.14.10 bundle manifest + Registry `server.json` | MCP **分发登记**（不带任何 MCP 源码改动，产品功能见下） |
| `3a83d7eb` `bff7ef22` `7111c273` `099cda42` | 官网版本号 / whats-new / llms.txt / llms-full.txt / MS Store 版本 pin | 官网分发 |
| `8be38f60` | Gitee 镜像只上传本次 release 的资产 | 上游镜像脚本（本 fork 已删 `scripts/release-to-gitee.sh`） |

### 合并取舍（本地特性怎么保下来的）

- **遥测保持删除**：上游本轮新代码里重新出现了 `track()` 调用——`Toolbar.vue` 的 `pickViewMode()` /
  `toggleLivePreviewFromMenu()` / 主题按钮共 3 处。这些函数本身是新增的（在新 hunk 里，不产生冲突），
  已逐条摘除，`lib/telemetry.ts` 与 `TelemetryBanner.vue` 不会被重新 import。
- **星标 / 推广 / 赞助 / 商店评分**：`star-prompt.ts`、`web/src/pages/promote.astro`、`Promote.astro`、
  `supporters.ts`、`add-supporter.py`、`store_review.rs`（含 `request_store_review` 命令与 App Store
  评分弹窗）保持不存在；About 对话框只保留「感谢赞助者」与新增的「感谢测试者」，
  推广者列表与 `📣 帮忙推广` 按钮不落地；`Star on GitHub` 文案维持本 fork 的 `GitHub`。
- **整目录回退到本 fork**：`web/`（官网）、`app-store/`、`README.md` / `README.zh.md`、
  `.github/` `.gitee/`、`scripts/update-sponsors-readme.py`。与合并前逐字节零差异。
- **MCP 是产品功能，原样保留**：上游本轮对 `mcp-server/` 的**全部**改动只有
  `mcp-server/mcpb/manifest.json` 里一个版本字符串，**零行源码改动**——所以 MCP 功能一点没丢：
  `mcp-server/src/**`、`README.md`、`build.rs`、`tests/`、`Cargo.lock` 与上游逐字节一致
  （唯一差异是本 fork 自己加的 `[lints.rust] linker_messages = "allow"`），发布链路也照旧——
  `release.yml` 的 `build-mcp-sidecar.sh` 通过 Tauri `externalBin` 把 `solomd-mcp` **打进应用本体**，
  每个 release 另出 `solomd-mcp-linux-x64/arm64`、`win-x64/arm64` 独立包，
  配套 `install-mcp.sh` / `publish-mcp-crate.sh` / `build-mcpb.sh`。
  被挡在门外的是**上游自己的分发登记信息**，不是功能：`server.json` 里
  `name = io.github.zhitongblog/solomd`、`identifier` 指向上游 release 资产与其 sha256
  （fork 未登记任何 MCP Registry），`build-mcpb.sh` 里 `REPO=zhitongblog/solomd` 也是从上游取二进制；
  而 mcpb manifest 的 `version` 在打包时由 `build-mcpb.sh <X.Y.Z>` 用命令行参数**直接覆盖**
  （`m["version"] = os.environ["VER"]`，工具清单同样由活的 `tools/list` 重写），
  所以仓库里这个值只是「上次打包留下的痕迹」，不是构建输入。
  本次仍把这份 manifest 的版本从冻结的 4.14.4 对齐到 **4.14.10**（它描述的是本 fork 自己出的
  `.mcpb` 制品，跟着 app 版本走更诚实）；`server.json` 保持冻结——那是上游的 Registry 条目。
- **`Toolbar.vue`**：以上游的单行工具栏为基底（五种视图模式收进下拉），把本 fork 的两个列表开关
  （项目符号续行 / 自动编号）补回插入下拉所在的 `toolbar__group` 内，并加上 `v-if="isMarkdown"`；
  上游新引入的 3 处 `track()` 摘除。
- **`Editor.vue`**：keymap 采用上游的 `baseKeymapCompartment` 结构（应用级和弦从 CodeMirror 的
  keymap 里过滤掉），本 fork 的 `listContinuationKeymap()` 置于其前以优先于普通换行；
  导入合并上游的 `EditorMenuSpell` / `spell-suggest`。
- **`App.vue`**：整体采用上游的懒加载方案——本地此前用 `defineAsyncComponent` 只做了面板懒加载，
  上游的 `useLazyComponent` 连**关闭状态的对话框**（命令面板、快速切换、设置、搜索、关于…）也一并延迟，
  是超集，故取上游；本 fork 已自动合并的「删除 `scheduleStarPrompt()` / `track('app_launched')` /
  `<TelemetryBanner />`」三处删除保持生效。
- **`main.ts`**：三方合并——iOS 容器重定位（本地保留）、上游新增的 WebView2 版本探测（挂载前必须已知）、
  本地 i18n 分包语言包加载，统一进一个 `Promise.all` + 1.5s 上界。
- **`code-languages.ts`**：上游与本地做了**同一件事**（把 13 个 lezer 语法包从 `support()` 改成
  `load()` 按需加载），取上游版本，注释改为上游措辞。
- **`ios-container.test.ts`**：上游把该测试改写成 `node:test`（`describe/it`），与本 fork 约定一致，取上游。
- **`app-menu.ts`**：上游新增模块里唯一带无扩展名相对导入的（`from './keybindings'`），按本 fork 约定
  补成 `'./keybindings.ts'`，使上游新增的 `app-menu.test.ts`（菜单覆盖测试）能被 `node --test` 直接跑。
- **版本号**：取 **4.14.10**（与上游同号，按本文件开头的约定）；上游的三个 bump 提交不引入，
  由 `scripts/bump-version.js 4.14.10` 统一改四处版本源。

### 验证

- `vue-tsc --noEmit` 通过。
- `vite build` 通过（32.5s）。入口 chunk `index-CeSBQsdm.js` **1,738.17 kB / gzip 530.02 kB**，
  与合并前本地的 1,737.95 kB 基本持平——说明本轮并入的启动优化与本地已有优化没有互相抵消。
- 单元测试（fork 的 `node:test` 跑法）：**232 个用例，222 通过，10 失败**。10 个失败全部是
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
**只取纯产品代码的功能与修复**——市场推广 / 赞助 / 商店与 MCP 分发内容一律不引入；本地改动全部保留。

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
| `44c1162` | 官网 Hero 求 star 按钮 + 实时计数 | 推广 |
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
  只保留 `ios_folder`（`store_review.rs` 不落地）。
- **`main.ts`**：保留 fork 的按需语言包挂载，叠加上游的 iOS 路径重定位（iOS 侧限时 1.5s，语言包完整后再挂载）。
- **`Cargo.toml`**：`objc2-foundation` 增加 `NSURL` / `NSGeometry` 特性——这是保留的 `ios_folder.rs` 所需，
  虽然该特性原属被排除的 iOS 提交，这里按依赖需要保留。
- **MCP manifest**：`3fcd132`（winget 修复）附带把 `manifest.json` 版本抬到 4.14.5；因 MCP 分发属排除项，
  已回退到已注册的 4.14.4，令 `mcp-server/` 与 `server.json` 保持零改动。

### 验证

- `vue-tsc --noEmit` 通过。
- `vite build` 通过（3392 个模块，约 14.5s）。
- 随修复带进来的 4 个单元测试用 fork 的 `node:test` 运行：**40 / 40 通过**。其中上游的
  `ios-container.test.ts` 原本 `import 'vitest'`（本 fork 未装 vitest），已改写为 `node:test`；
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

- **站点保持无遥测，但把下载统计接回来**：上游把「全渠道下载量」写进了 `web/src/pages/admin/index.astro`，
  而本 fork 早就删掉了这个文件——它的上一版整页都服务于 `/api/admin/stats` 遥测面板（连同 `/api/track`、
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
- fork 删除的 7 个文件（`lib/telemetry.ts`、`TelemetryBanner.vue`、`web/functions/api/track.ts`、
  `admin/stats.ts`、`web/ANALYTICS.md`、`scripts/release-to-gitee.sh`、`mirror-gitee.yml`）合并后仍不存在；
  fork 的 11 个文件（`build.bat`、`release.bat`、`scripts/bump-version.js`、
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
- **`ru.ts`（上游新增）** 既缺本 fork 的 4 个键（`listContinueOn` / `listContinueOff` /
  `autoNumberOn` / `autoNumberOff`，即两个列表续写与自动编号开关的悬停提示），又多出 `telemetry`
  段（本 fork 的 `en` 里没有这一节，而 `I18n` 类型正是由 `en` 推导）。补键删段后 `vue-tsc` 的两个
  报错消失。
- **版本文件** 的 4 个冲突仍是纯版本号，取本地的 4.14.6（随后 release 会再覆盖）。这次 `Cargo.toml`
  的冲突块只含 `version =` 一行，没有连带吃掉本地的遥测注释 —— 已用 `Select-String` 复核。

### 验证

- `pnpm build`（`vue-tsc --noEmit` + vite）通过。
- `node --test src/lib/*.test.ts`：27 个测试文件 165 条用例，155 通过；失败的 10 个文件全部是既有的
  `ERR_MODULE_NOT_FOUND`（导入链缺 `.ts` 后缀，Node ESM 解析不到），无断言失败。
- 精确的「本地改动是否被合并吃掉」检查：本地 92 个改动文件在合并后仍全部带 fork 内容
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
- **无遥测**：上游这些提交不带遥测，但采用上游 `useExport.ts` 会把本地删掉的 `track()` 调用带回来，
  已重新剔除（`lib/telemetry.ts` 在本 fork 里不存在，否则构建直接失败）。

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
对一个 fork 构建来说恰好是最不该指向的地方；读者还得离开 GitHub 才能知道改了什么。现在
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

- 新增本文件 `CHANGELOG.md`：按版本记录本 fork 的改动，并单列「与上游的功能差异」与「上游同步方式」。
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

本 fork 的第一个本地版本，基础是上游 4.13.2。

- **移除匿名遥测**：不是「可选关闭」，而是彻底删除。删掉 6 个文件
  （`app/src/components/TelemetryBanner.vue`、`app/src/lib/telemetry.ts`、`web/ANALYTICS.md`、
  `web/functions/api/track.ts`、`web/functions/api/admin/stats.ts`、`web/src/pages/admin/index.astro`），
  并清理 14 个语言文件、设置项、工具栏入口与站点文案里的相关描述。
- **#297 ``` 围栏语言联想**：输入 ``` 时给出语言列表（`lib/fence-languages.ts`、
  `lib/cm-fence-completion.ts`，含 174 行测试）。列表从 `lib/code-languages.ts` 派生，不另存一份。
- **#317 文件新鲜度兜底**：上游有「启动 + 窗口聚焦」两次扫描，本 fork 再加一个每 30 秒的巡检，覆盖
  那些不发事件的改动（同步盘、外部编辑器）。
- **Windows 批处理脚本解析崩溃**：`build.bat` / `release.bat` 里含非 ASCII 字节时，cmd.exe 按控制台
  代码页解码会吞掉 CR，解析器错位并执行半截行。两个脚本改为纯 ASCII + CRLF。
- **构建与仓库卫生**：pnpm 允许 esbuild / core-js 跑安装脚本；本地产物（`local_build_output/`）加入
  `.gitignore`；删除上游的 Gitee 镜像 workflow（`mirror-gitee.yml`）与 Gitee 发布脚本（本 fork 没有
  对应的 secrets，每次 push 都失败）。
- 两项后来被上游同等修复取代的改动（合入时取了上游版本，功能上无差异，仅存于历史）：
  「未被监听时磁盘文件变化后刷新标签页」、「无 CodeMirror 时焦点模式与实心光标可用」。

---

## 与上游的功能差异

### 本 fork 去掉的上游行为

| 上游行为 | 本 fork |
|---|---|
| 匿名遥测（前端 POST 到 `solomd.app/api/track`，可在设置里关闭） | **完全移除**，应用与站点两侧的采集代码、横幅、后台页、站点文档一并删除 |
| Gitee 镜像：`mirror-gitee.yml` 工作流 + 发布脚本 | 删除（本 fork 没有 `GITEE_*` secrets，该工作流每次 push 都失败） |
| README 里的站点营销入口（Launch post / How we built it / Website / Security）与 Gitee 镜像链接 | 已从各语言 README 移除，链接统一指向本仓库 |

保留但与本 fork 定位无关的上游内容：Gitee 作为 **git 托管**的功能（`github_sync.rs` 及其设置界面、
`gitee_auth_e2e_test.rs`）、源码注释里的 Gitee issue 号。

### 本 fork 独有的功能与修复

- ``` 围栏语言联想（#297）。
- 文件新鲜度 30 秒兜底巡检（#317 的本地部分）。
- 「在文件树中显示」就地展开 + 高亮重写。
- 全部文件选择器使用真实存在的起始目录（修 Windows 虚拟桌面死对话框）。
- i18n 收尾：菜单 / 工具提示 / Android 目录选择器 / 编辑器查找条等硬编码字符串补齐，14 种语言齐全。
- PDF 分页不切断整行；HTML 导出内嵌本地图片。
- 前端产物体积与冷启动优化（见 Unreleased 一节）。
- 文件树层级参考线、选中行、新建文件的默认位置、删除前确认对话框（见 Unreleased 一节）。

### 本 fork 独有的工程与发布设施

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
$forkChanged = git diff --name-only <上次合并点> <本地 HEAD> | Sort-Object   # 本 fork 自己的改动
$differs     = git diff --name-only upstream/main HEAD | Sort-Object       # 合并后与上游的差异
Compare-Object $forkChanged $differs | Where-Object { $_.SideIndicator -eq '<=' }   # 必须为空
```

每次同步后顺带检查 `git ls-files | Select-String telemetry` 与 `Select-String mirror-gitee` 都必须
无输出——上游的新提交有可能把这些文件的引用带回来。
