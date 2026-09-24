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
