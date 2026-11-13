import { findHtmlBlockEnd } from './html-live-render';

/**
 * Windows plain-block editor: split a document into the blocks that are
 * rendered one at a time. Extracted from Editor.vue so the grouping rules can
 * be tested without mounting the component.
 */
export interface PlainBlockRange {
  start: number;
  end: number;
  /**
   * The block's Markdown without the separating trailing newline — the value
   * the editable textarea carries (start/end still cover the whole range, so
   * the separator is reconstructed when the block is written back).
   */
  text: string;
  hasTrailingNewline: boolean;
}

export function splitPlainMarkdownBlocks(src: string): PlainBlockRange[] {
  if (!src) return [{ start: 0, end: 0, text: '', hasTrailingNewline: false }];

  const lines: Array<{ start: number; end: number; text: string; raw: string }> = [];
  let pos = 0;
  while (pos < src.length) {
    const nl = src.indexOf('\n', pos);
    const end = nl >= 0 ? nl + 1 : src.length;
    const raw = src.slice(pos, end);
    lines.push({
      start: pos,
      end,
      raw,
      text: raw.replace(/\r?\n$/, ''),
    });
    pos = end;
  }

  const blocks: Array<{ start: number; end: number; text: string; hasTrailingNewline: boolean }> = [];
  const pushRange = (start: number, end: number) => {
    if (end < start) return;
    // The editable text must NOT carry the block-separating trailing newline.
    // Keeping it created a phantom empty last line in the active <textarea>:
    // the caret could land after it and typed/IME-committed text dropped onto a
    // fresh line ("每输入一个换一行"). start/end still cover the full range so the
    // separator is reconstructed in updatePlainBlock.
    const raw = src.slice(start, end);
    const hasTrailingNewline = raw.endsWith('\n');
    blocks.push({
      start,
      end,
      text: (hasTrailingNewline ? raw.slice(0, -1) : raw).replace(/\r\n?/g, '\n'),
      hasTrailingNewline,
    });
  };
  const kindFor = (line: { text: string }) => {
    const text = line.text;
    const trimmed = text.replace(/^[ \t]+|[ \t]+$/g, '');
    if (trimmed === '') return 'blank';
    if (/^(```|~~~)/.test(trimmed)) return 'fence';
    // #250 — a `$$` block is one block, like a code fence. Without this the
    // splitter walked into it line by line and any line indented 4+ spaces
    // (routine inside `aligned`) became its own indented-code block, so the
    // formula rendered as three pieces with a grey slab in the middle.
    // `$$E=mc^2$$` closes on its own line and is not an opener.
    if (
      (/^\$\$/.test(trimmed) && !/^\$\$.*\$\$$/.test(trimmed)) ||
      (/^\\\[/.test(trimmed) && !/^\\\[.*\\\]$/.test(trimmed))
    ) {
      return 'mathfence';
    }
    if (/^#{1,6}[ \t\u3000]+/.test(trimmed)) return 'heading';
    if (/^(---|\*\*\*|___)[ \t]*$/.test(trimmed)) return 'thematic';
    if (/^[ \t]{0,3}>[ \t]?/.test(text)) return 'quote';
    if (/^[ \t]{0,3}([-+*]|\d+[.)])[ \t\u3000]+/.test(text)) return 'list';
    if (/^[ \t]{0,3}([-*])[ \t]+\[[ xX]\][ \t\u3000]+/.test(text)) return 'list';
    if (/^[ \t]{0,3}\|.*\|[ \t]*$/.test(text)) return 'table';
    // #546 — Only ASCII spaces (4+) or tabs form an indented code block.
    // Full-width ideographic spaces (`\u3000`, `　　　　李玲：...`) are CJK
    // paragraph/script indentation and must remain in the paragraph block.
    if (/^(?: {4,}|\t+)\S/.test(text)) return 'indented';
    return 'paragraph';
  };

  const lineTexts = lines.map((line) => line.text);

  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    // Raw block HTML (`<details>`, `<div>`, HTML tables, …) is ONE block, the
    // same way a code fence or a `$$` formula is, and the same rule the
    // CodeMirror live editor already applies (cm-live-blocks.ts). Splitting at
    // the blank lines inside a container left the opening tag alone in its own
    // block: markdown-it handed that fragment straight to innerHTML, the
    // browser auto-closed it, and `<details>` rendered a disclosure triangle
    // with nothing inside — its content showed up as sibling blocks, so no
    // click could ever fold it. Unclosed containers fall through to the
    // per-kind rules below.
    const htmlEnd = findHtmlBlockEnd(lineTexts, i);
    if (htmlEnd !== null) {
      pushRange(line.start, lines[htmlEnd].end);
      i = htmlEnd + 1;
      continue;
    }
    const kind = kindFor(line);

    if (kind === 'blank' || kind === 'heading' || kind === 'thematic') {
      pushRange(line.start, line.end);
      i++;
      continue;
    }

    if (kind === 'mathfence') {
      // Consume through the closing `$$` or `\]`; an unclosed block runs to the
      // end of the document, matching the code-fence branch below.
      const closeMarker = line.text.trim().startsWith('\\[') ? '\\]' : '$$';
      let j = i + 1;
      while (j < lines.length) {
        const t = lines[j].text.trim();
        j++;
        if (t.endsWith(closeMarker)) break;
      }
      pushRange(line.start, lines[j - 1]?.end ?? line.end);
      i = j;
      continue;
    }

    if (kind === 'fence') {
      const marker = line.text.trim().startsWith('~~~') ? '~~~' : '```';
      let j = i + 1;
      while (j < lines.length) {
        if (lines[j].text.trim().startsWith(marker)) {
          j++;
          break;
        }
        j++;
      }
      pushRange(line.start, lines[j - 1]?.end ?? line.end);
      i = j;
      continue;
    }

    const isTableSepLine = (t: string) =>
      /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(t) ||
      /^\s*\|\s*:?-+:?\s*\|\s*$/.test(t);
    const isTableStartAt = (idx: number) =>
      idx + 1 < lines.length &&
      lines[idx].text.includes('|') &&
      !isTableSepLine(lines[idx].text) &&
      isTableSepLine(lines[idx + 1].text);

    if (isTableStartAt(i) || kind === 'table') {
      let j = i + 1;
      while (
        j < lines.length &&
        (kindFor(lines[j]) === 'table' ||
          isTableSepLine(lines[j].text) ||
          ((kindFor(lines[j]) === 'paragraph' || kindFor(lines[j]) === 'indented') &&
            lines[j].text.includes('|')))
      ) {
        if (isTableStartAt(j)) break;
        j++;
      }
      pushRange(line.start, lines[j - 1]?.end ?? line.end);
      i = j;
      continue;
    }

    if (kind === 'list') {
      let j = i + 1;
      while (j < lines.length) {
        if (isTableStartAt(j)) break;
        const nextLine = lines[j];
        const nextKind = kindFor(nextLine);
        const isIndentedContinuation = /^[ \t]{2,}\S/.test(nextLine.text);
        if ((nextKind === 'fence' || nextKind === 'mathfence') && isIndentedContinuation) {
          const trimmedNext = nextLine.text.trim();
          const closeMarker = nextKind === 'fence'
            ? (trimmedNext.startsWith('~~~') ? '~~~' : '```')
            : (trimmedNext.startsWith('\\[') ? '\\]' : '$$');
          j++;
          while (j < lines.length) {
            const t = lines[j].text.trim();
            j++;
            if (nextKind === 'fence' ? t.startsWith(closeMarker) : t.endsWith(closeMarker)) break;
          }
          continue;
        }
        if (nextKind === 'list' || isIndentedContinuation) {
          j++;
          continue;
        }
        if (nextKind === 'blank' && j + 1 < lines.length) {
          if (isTableStartAt(j + 1)) break;
          const afterBlank = lines[j + 1];
          if (kindFor(afterBlank) === 'list' || /^[ \t]{2,}\S/.test(afterBlank.text)) {
            j++;
            continue;
          }
        }
        break;
      }
      pushRange(line.start, lines[j - 1]?.end ?? line.end);
      i = j;
      continue;
    }

    if (kind === 'quote' || kind === 'indented') {
      let j = i + 1;
      while (j < lines.length) {
        const nextKind = kindFor(lines[j]);
        if (nextKind !== kind && nextKind !== 'blank') break;
        if (nextKind === 'blank' && j + 1 < lines.length && kindFor(lines[j + 1]) !== kind) break;
        j++;
      }
      pushRange(line.start, lines[j - 1]?.end ?? line.end);
      i = j;
      continue;
    }

    let j = i + 1;
    while (j < lines.length && kindFor(lines[j]) === 'paragraph') j++;
    pushRange(line.start, lines[j - 1]?.end ?? line.end);
    i = j;
  }

  if (blocks.length === 0) {
    const hasTrailingNewline = src.endsWith('\n');
    return [
      {
        start: 0,
        end: src.length,
        text: hasTrailingNewline ? src.slice(0, -1) : src,
        hasTrailingNewline,
      },
    ];
  }
  // A document that ends with a newline has an empty final line. Represent it as
  // its own (zero-width) block so the caret has somewhere to land when the user
  // presses Enter at the end of the last line — otherwise the newline is absorbed
  // as a separator with no following block and the caret appears not to move.
  if (src.endsWith('\n')) {
    blocks.push({ start: src.length, end: src.length, text: '', hasTrailingNewline: false });
  }
  return blocks;
}
