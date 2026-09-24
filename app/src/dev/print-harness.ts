/**
 * Dev harness for the text PDF ("导出为 PDF（文字）") — open
 * `/print-harness.html` from the Vite dev server and print the page (Chromium's
 * print-to-PDF is the engine WebView2 prints with on Windows).
 *
 * It mounts the same overlay `exportPdfPrint` mounts (`mountPrintOverlay`), with
 * the app's real stylesheets, over a document long enough to need several
 * pages and holding a table that runs across page boundaries. Two things are
 * checked by printing it (#337):
 *   - the print is as many pages as the document, not one;
 *   - a table split across pages repeats its header row on the next page.
 *
 * Query params: `?rows=N` table length (default 120), `?pdf=a4` to apply a
 * user-touched A4 page setup instead of the webview default.
 * `window.__printHarness` reports the overlay's height when ready.
 */
import '../styles/cjk-font.css';
import '../styles/main.css';
import '../styles/hljs-theme.css';
import 'katex/dist/katex.min.css';
// Preview.vue's unscoped <style> block carries the `.preview-content` skin the
// overlay uses; importing the SFC is what injects it, as it does in the app.
import '../components/Preview.vue';
import { renderMarkdown } from '../lib/markdown';
import { buildPrintStyle, resolvePdfOptions } from '../lib/pdf-options';
import { defaultPdfDefaults } from '../stores/settings';
import { mountPrintOverlay } from '../lib/print-overlay';

const params = new URLSearchParams(location.search);
const rows = Number(params.get('rows') || 120);

function fixture(): string {
  const parts: string[] = ['# 打印分页测试 / Print pagination\n'];
  for (let i = 1; i <= 6; i++) {
    parts.push(
      `## ${i}. 段落\n\n` +
        '试算会把同一笔交易的两条流水放在一起比对，「应计」来自渠道，「实收」来自银行账单。'.repeat(6) +
        '\n',
    );
  }
  parts.push('## 长表格 / Long table\n');
  parts.push('| 序号 | 名称 | 说明 |\n| --- | --- | --- |');
  for (let r = 1; r <= rows; r++) {
    parts.push(`| ${r} | 条目 ${r} | 第 ${r} 行的说明文字，用来占满单元格宽度 row ${r} |`);
  }
  parts.push('\n## 结尾 / End\n\nLAST-LINE-MARKER');
  return parts.join('\n');
}

const source = fixture();
const opts = resolvePdfOptions(defaultPdfDefaults(), source, params.get('pdf') === 'a4');
const mounted = mountPrintOverlay(renderMarkdown(source), 'light', buildPrintStyle(opts));

(window as any).__printHarness = {
  ready: true,
  overlayHeight: mounted.content.getBoundingClientRect().height,
};
