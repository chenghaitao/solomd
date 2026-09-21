/**
 * Tests for the PDF page-cutting logic (`pdf-paginate.ts`).
 *
 * The fixtures model a raster the way html2canvas produces one: a flat
 * background with a band of "ink" rows every line pitch. `LINE_H` / `INK_H`
 * mirror the export's defaults (15px body text at 1.75 line-height, captured
 * at scale 2), so "does a glyph line straddle this cut" is a real question
 * here rather than a synthetic one.
 *
 * Run with: `node --test app/src/lib/pdf-paginate.test.ts`
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Explicit `.ts` extension: Node's ESM resolver needs it, and tsconfig
// excludes `*.test.ts` from vue-tsc, so nothing else enforces it. See the
// build-conventions note in repo memory.
import {
  findCleanCut,
  findPageBreaks,
  isCleanRowData,
  searchWindowPx,
} from './pdf-paginate.ts';

const LINE_H = 26; // line pitch, raster rows
const INK_H = 15; // rows of one line that carry glyph pixels
const WHITE: [number, number, number] = [255, 255, 255];

interface Raster {
  rows: number;
  width: number;
  /** Inclusive row ranges that carry ink — the "lines of text". */
  lines: { top: number; bottom: number }[];
  readBand: (top: number, rows: number) => Uint8ClampedArray;
}

/**
 * A `rows`-tall raster: `background` everywhere, with a text line every
 * `LINE_H` rows (two inked columns, so a row is clean only in the leading).
 */
function makeRaster(
  rows: number,
  opts: {
    width?: number;
    lineHeight?: number;
    inkHeight?: number;
    background?: [number, number, number];
  } = {},
): Raster {
  const width = opts.width ?? 8;
  const lineHeight = opts.lineHeight ?? LINE_H;
  const inkHeight = opts.inkHeight ?? INK_H;
  const background = opts.background ?? WHITE;
  const data = new Uint8ClampedArray(rows * width * 4);
  for (let i = 0; i < rows * width; i++) {
    data[i * 4] = background[0];
    data[i * 4 + 1] = background[1];
    data[i * 4 + 2] = background[2];
    data[i * 4 + 3] = 255;
  }
  const lines: { top: number; bottom: number }[] = [];
  for (let top = 4; top + inkHeight <= rows; top += lineHeight) {
    const bottom = top + inkHeight - 1;
    lines.push({ top, bottom });
    for (let y = top; y <= bottom; y++) {
      for (const x of [1, width - 2]) {
        const offset = (y * width + x) * 4;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
      }
    }
  }
  return {
    rows,
    width,
    lines,
    readBand: (top, count) => data.subarray(top * width * 4, (top + count) * width * 4),
  };
}

/** A cut at `c` slices a line when that line has rows on both sides of it. */
function slicesALine(cut: number, raster: Raster): boolean {
  return raster.lines.some((line) => line.top < cut && cut <= line.bottom);
}

function rowIsClean(raster: Raster, y: number): boolean {
  return isCleanRowData(raster.readBand(y, 1));
}

test('a row of ink is not clean, uniform rows are', () => {
  // Plain white row.
  assert.equal(isCleanRowData(new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255])), true);
  // One pixel of a glyph in the middle of it.
  assert.equal(
    isCleanRowData(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255])),
    false,
  );
  // A code block / table header background is beige, not white — its leading
  // must still count as clean, otherwise nothing inside a code block is ever
  // cuttable and long listings get sheared anyway.
  assert.equal(isCleanRowData(new Uint8ClampedArray([243, 239, 231, 255, 243, 239, 231, 255])), true);
  // Antialiasing fringes stay well inside the tolerance.
  assert.equal(isCleanRowData(new Uint8ClampedArray([250, 250, 250, 255, 245, 245, 245, 255])), true);
  // A JPEG-ish gradient does not.
  assert.equal(isCleanRowData(new Uint8ClampedArray([255, 255, 255, 255, 200, 200, 200, 255])), false);
  assert.equal(isCleanRowData(new Uint8ClampedArray([])), true);
});

test('the cut moves up to the first blank row when the boundary has ink on it', () => {
  const raster = makeRaster(400);
  // Lines run 4 + 26k for INK_H rows, so row 90 sits inside the line 82..96.
  const straddled = raster.lines.find((l) => l.top < 90 && 90 <= l.bottom);
  assert.ok(straddled, 'fixture must have a line straddling row 90');

  const cut = findCleanCut(90, 60, (y) => rowIsClean(raster, y));
  assert.equal(slicesALine(cut, raster), false);
  assert.ok(cut <= 90, 'a cut may never move down past the boundary');
  // The whole line moves to the next page; the cut lands in the leading above it.
  assert.equal(cut, straddled.top - 1);
  assert.equal(rowIsClean(raster, cut), true);
});

test('boundaries that are already safe are kept as they are', () => {
  const raster = makeRaster(400);
  const line = raster.lines[1];
  // First blank row of a leading — the ideal break: nothing is cut off.
  const gap = line.bottom + 1;
  assert.equal(findCleanCut(gap, 60, (y) => rowIsClean(raster, y)), gap);
  // Anywhere deeper in the leading stays put as well: the furthest-down blank
  // row wins, so a page never gives up more room than it has to.
  assert.equal(findCleanCut(gap + 4, 60, (y) => rowIsClean(raster, y)), gap + 4);
  // A row inside a line climbs only as far as the leading above that line —
  // not to the previous leading, which would hand away a whole line.
  assert.equal(findCleanCut(line.top + 1, 60, (y) => rowIsClean(raster, y)), line.top - 1);
});

test('solid ink falls back to the nominal boundary', () => {
  // Nothing clean anywhere: the cut has to happen, so it happens where jsPDF
  // would have put it rather than somewhere arbitrary.
  assert.equal(findCleanCut(500, 60, () => false), 500);
});

test('page breaks never slice a line, on white or on a code background', () => {
  const pageHeightPx = 1000;
  const pageCount = 4;
  const raster = makeRaster(pageHeightPx * pageCount);
  const searchUpPx = 60;

  const cuts = findPageBreaks(raster.width, raster.rows, pageHeightPx, searchUpPx, raster.readBand);

  assert.equal(cuts.length, pageCount - 1);
  for (const [i, cut] of cuts.entries()) {
    const nominal = (i + 1) * pageHeightPx;
    assert.ok(cut <= nominal, `cut ${cut} must not run past its boundary ${nominal}`);
    assert.ok(cut >= nominal - searchUpPx, `cut ${cut} must stay inside the search window`);
    assert.equal(slicesALine(cut, raster), false, `cut ${cut} sliced a line`);
    // The cut row itself is blank, so the next page does not start mid-glyph.
    assert.equal(rowIsClean(raster, cut), true);
  }
  // Cuts are ascending, or a page would be drawn inside out.
  for (let i = 1; i < cuts.length; i++) assert.ok(cuts[i] > cuts[i - 1]);

  // Code blocks are beige, not white: the same guarantee has to hold there.
  const code = makeRaster(pageHeightPx * pageCount, { background: [243, 239, 231] });
  const codeCuts = findPageBreaks(code.width, code.rows, pageHeightPx, searchUpPx, code.readBand);
  for (const cut of codeCuts) assert.equal(slicesALine(cut, code), false);
});

test('the fixture really does reproduce the shear jsPDF used to produce', () => {
  // Guards the test above from going vacuous: with jsPDF's own cut lines (a
  // plain multiple of the page height) the same fixture *is* sliced.
  const pageHeightPx = 1000;
  const raster = makeRaster(pageHeightPx * 4);
  const naive = [1000, 2000, 3000];
  assert.equal(naive.some((cut) => slicesALine(cut, raster)), true);
});

test('a single-page document needs no cuts', () => {
  const raster = makeRaster(500);
  assert.deepEqual(findPageBreaks(raster.width, raster.rows, 1000, 60, raster.readBand), []);
  // Exactly page-sized: still one page, still no cuts.
  assert.deepEqual(findPageBreaks(raster.width, 1000, 1000, 60, raster.readBand), []);
});

test('degenerate geometry is rejected instead of looping', () => {
  const raster = makeRaster(100);
  assert.deepEqual(findPageBreaks(raster.width, raster.rows, 0, 60, raster.readBand), []);
  assert.deepEqual(findPageBreaks(0, raster.rows, 100, 60, raster.readBand), []);
  assert.deepEqual(findPageBreaks(raster.width, 0, 100, 60, raster.readBand), []);
});

test('search window is about a line and a half, capped to the page', () => {
  // 15px text at 1.75 line-height, captured at scale 2, A4 content box.
  assert.equal(searchWindowPx(26.25, 2, 2078), 79);
  // A huge font can not eat a hole out of the page.
  assert.equal(searchWindowPx(400, 2, 2078), Math.round(2078 * 0.08));
  // Never so small that a single line has nowhere to go.
  assert.equal(searchWindowPx(1, 1, 2078), 8);
});
