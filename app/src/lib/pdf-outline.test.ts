import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  patchOutlineTitleEncoding,
  populatePdfOutline,
  rasterRowToPageNumber,
  utf16BeHexString,
  type JsPdfOutlineLike,
} from './pdf-export';

test('#515 rasterRowToPageNumber maps raster Y to 1-based page numbers', () => {
  assert.equal(rasterRowToPageNumber(0, 1000, null), 1);
  assert.equal(rasterRowToPageNumber(999, 1000, null), 1);
  assert.equal(rasterRowToPageNumber(1000, 1000, null), 2);
  assert.equal(rasterRowToPageNumber(2500, 1000, null), 3);

  // With explicit page breaks from buildPagedCanvas
  const breaks = [920, 1840];
  assert.equal(rasterRowToPageNumber(100, 1000, breaks), 1);
  assert.equal(rasterRowToPageNumber(919, 1000, breaks), 1);
  assert.equal(rasterRowToPageNumber(920, 1000, breaks), 2);
  assert.equal(rasterRowToPageNumber(1839, 1000, breaks), 2);
  assert.equal(rasterRowToPageNumber(1840, 1000, breaks), 3);
});

test('#515 populatePdfOutline builds hierarchical H1-H6 bookmark tree', () => {
  interface MockNode {
    id: number;
    parent: MockNode | null;
    title: string;
    pageNumber: number;
  }
  const calls: MockNode[] = [];
  const outline: JsPdfOutlineLike = {
    add(parent, title, options) {
      const node: MockNode = {
        id: calls.length + 1,
        parent: (parent as MockNode | null) ?? null,
        title,
        pageNumber: options.pageNumber,
      };
      calls.push(node);
      return node;
    },
  };

  populatePdfOutline(outline, [
    { level: 1, text: '第一章 概述', pageNumber: 1 },
    { level: 2, text: '1.1 背景', pageNumber: 1 },
    { level: 3, text: '1.1.1 细节', pageNumber: 2 },
    { level: 2, text: '1.2 目标', pageNumber: 2 },
    { level: 1, text: '第二章 架构', pageNumber: 3 },
    { level: 4, text: '2.0.0.1 跳级小节', pageNumber: 4 },
  ]);

  assert.equal(calls.length, 6);
  // H1 #1 -> root
  assert.equal(calls[0].parent, null);
  assert.equal(calls[0].title, '第一章 概述');
  assert.equal(calls[0].pageNumber, 1);
  // H2 1.1 -> child of H1 #1
  assert.equal(calls[1].parent, calls[0]);
  // H3 1.1.1 -> child of H2 1.1
  assert.equal(calls[2].parent, calls[1]);
  assert.equal(calls[2].pageNumber, 2);
  // H2 1.2 -> sibling of H2 1.1 (child of H1 #1)
  assert.equal(calls[3].parent, calls[0]);
  // H1 #2 -> root
  assert.equal(calls[4].parent, null);
  // Skipped level H4 -> child of H1 #2
  assert.equal(calls[5].parent, calls[4]);
  assert.equal(calls[5].pageNumber, 4);
});

// --- #563 — CJK bookmark titles -------------------------------------------

/**
 * #563 — just enough of jsPDF's `to8bitStream()` + `pdfEscape()` to reproduce
 * exactly what it hands the PDF writer for a `/Title`: UTF-16BE bytes wrapped
 * in a literal string, with only `\`, `(` and `)` escaped.
 */
function legacyMakeString(text: string): string {
  let bytes = text;
  if (/[^\x00-\xFF]/.test(text)) {
    bytes = '\u00FE\u00FF';
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      bytes += String.fromCharCode(code >> 8, code & 0xFF);
    }
  }
  const escaped = bytes.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  return '(' + escaped + ')';
}

/**
 * #563 — Read a PDF string the way a conforming reader does: decode the
 * backslash escapes, turn a bare EOL marker into 0x0A (ISO 32000-1 7.3.4.2),
 * and decode a `<FEFF…>` hex string as UTF-16BE.
 */
function readPdfString(raw: string): string {
  const escapes: Record<number, number> = {
    0x6E: 0x0A, 0x72: 0x0D, 0x74: 0x09, 0x62: 0x08, 0x66: 0x0C,
  };
  const bytes: number[] = [];
  if (raw.startsWith('<')) {
    const hex = raw.slice(1, -1);
    for (let i = 0; i + 1 < hex.length; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
  } else {
    assert.equal(raw[0], '(');
    for (let i = 1; i < raw.length; i++) {
      const code = raw.charCodeAt(i);
      if (code === 0x5C) {
        const next = raw.charCodeAt(++i);
        bytes.push(escapes[next] ?? next);
        continue;
      }
      if (code === 0x29) break;
      bytes.push(code === 0x0D || code === 0x0A ? 0x0A : code);
    }
  }
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return out;
  }
  return bytes.map((b) => String.fromCharCode(b)).join('');
}

test('#563 jsPDF alone turns 名 into 吊 (the reported bug)', () => {
  // 名 U+540D and 不 U+4E0D both carry 0x0D as their low byte, which a PDF
  // reader turns into 0x0A: 0x540D -> 0x540A, 0x4E0D -> 0x4E0A.
  assert.equal(readPdfString(legacyMakeString('名不虚传')), '吊上虚传');
  // Characters with any other low byte are untouched.
  assert.equal(readPdfString(legacyMakeString('安全测试')), '安全测试');
});

test('#563 utf16BeHexString writes UTF-16BE hex with a BOM', () => {
  assert.equal(utf16BeHexString('名'), '<FEFF540D>');
  assert.equal(utf16BeHexString('A'), '<FEFF0041>');
  assert.equal(utf16BeHexString(''), '<FEFF>');
  // Surrogate pairs are two code units, which is exactly UTF-16BE.
  assert.equal(utf16BeHexString('😀'), '<FEFFD83DDE00>');
});

test('#563 the patched makeString round-trips titles containing 0x0D', () => {
  const outline: JsPdfOutlineLike = { add: () => null, makeString: legacyMakeString };
  patchOutlineTitleEncoding(outline);
  for (const title of ['名不虚传', '第一章 概述', 'plain ascii', '名 (a) \\ b', '명']) {
    assert.equal(readPdfString(outline.makeString!(title)), title);
  }
});

test('#563 patchOutlineTitleEncoding is idempotent and tolerates mocks', () => {
  const outline: JsPdfOutlineLike = { add: () => null, makeString: legacyMakeString };
  patchOutlineTitleEncoding(outline);
  const once = outline.makeString;
  patchOutlineTitleEncoding(outline);
  assert.equal(outline.makeString, once);
  assert.doesNotThrow(() => patchOutlineTitleEncoding({ add: () => null }));
  assert.doesNotThrow(() => patchOutlineTitleEncoding(null));
});

test('#563 populatePdfOutline patches the outline it writes into', () => {
  const written: string[] = [];
  const outline: JsPdfOutlineLike = {
    add(_parent, title) {
      written.push(title);
      return {};
    },
    makeString: legacyMakeString,
  };
  populatePdfOutline(outline, [{ level: 1, text: '名不虚传', pageNumber: 1 }]);
  // The title handed to jsPDF is still the plain text...
  assert.equal(written[0], '名不虚传');
  // ...and what it would write to the file decodes back unchanged.
  assert.equal(readPdfString(outline.makeString!('名不虚传')), '名不虚传');
});
