/**
 * Page assembly for the built-in PDF export ("导出为 PDF（图片）").
 *
 * `html2pdf.js` rasterises the whole document with html2canvas and hands that
 * one tall image to jsPDF, which slices it at a fixed page height. Those slice
 * lines know nothing about text: a paragraph or a code line that happens to sit
 * on a boundary gets sheared in half. The pagebreak plugin's `avoid` list is
 * meant to prevent that, but it works in *CSS* pixels while jsPDF slices
 * *raster* pixels — the two grids only agree while the rendered container
 * measures exactly what the plugin assumed, and they drift apart the moment
 * anything about the page size, the margins or the capture scale is off. A
 * long document then collects that drift page after page, and lines start
 * getting cut deeper in the document.
 *
 * So the export paginates the raster itself: for every nominal boundary, look
 * for a *clean* cut line — a row with no ink in it, i.e. the leading between
 * two lines of text — and rebuild the image as whole pages, each exactly
 * `pageHeightPx` tall with its content pinned to the top of the page. jsPDF
 * still does the slicing, but every slice now lands on a row we picked, so no
 * glyph can be cut in half. Page count is unchanged; a page that had to give up
 * a few rows to reach a clean line simply ends with a little more white.
 *
 * Everything here is deliberately free of app state so it can be unit tested
 * (see `pdf-paginate.test.ts`) and driven from the browser harness
 * (`pdf-harness.html`).
 */

/** Per-channel slack (0-255) when deciding a row carries no ink. */
const ROW_TOLERANCE = 8;

/** Never spend more than this share of a page hunting for a clean cut line. */
const MAX_SEARCH_SHARE = 0.08;

/** Decides whether raster row `y` is free of ink. */
export type CleanRowProbe = (y: number) => boolean;

/**
 * True when an RGBA row carries no ink — every pixel within `tolerance` of the
 * row's first pixel. Comparing against the row's own colour (rather than
 * against white) is what makes this work inside a code block or a table
 * header: their backgrounds are beige, not white, but the leading between two
 * of their lines is still one flat colour top to bottom.
 *
 * `data` is a single row of RGBA bytes.
 */
export function isCleanRowData(data: Uint8ClampedArray, tolerance = ROW_TOLERANCE): boolean {
  if (data.length < 4) return true;
  const r0 = data[0];
  const g0 = data[1];
  const b0 = data[2];
  for (let i = 4; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - r0) > tolerance ||
      Math.abs(data[i + 1] - g0) > tolerance ||
      Math.abs(data[i + 2] - b0) > tolerance
    ) {
      return false;
    }
  }
  return true;
}

/**
 * The raster row a page should end on for a nominal boundary at `nominalY`.
 *
 * Scans *up* from the boundary for the first row that carries no ink. That is
 * the largest cut which cannot shear a glyph: ink bands are contiguous, so any
 * line of text straddling the cut necessarily has ink *on* the cut row — while
 * a cut one row below such a line (its last inked row) is already fine and must
 * not be given up, or every boundary that lands exactly on a baseline would
 * push a whole extra line to the next page.
 *
 * Scanning up (never down) is what keeps the page from overflowing.
 *
 * Falls back to the nominal boundary when the window is solid ink (a photo, a
 * full-bleed block): that is the old, shearing behaviour, but there is nothing
 * better to do — some row has to be cut.
 */
export function findCleanCut(
  nominalY: number,
  searchUpPx: number,
  isCleanRow: CleanRowProbe,
): number {
  const nominal = Math.floor(nominalY);
  const stop = Math.max(0, nominal - Math.max(0, Math.floor(searchUpPx)));
  for (let y = nominal; y >= stop; y--) {
    if (isCleanRow(y)) return y;
  }
  return nominal;
}

/**
 * Ascending raster rows at which to split a `contentHeightPx`-tall raster into
 * pages of `pageHeightPx`. Empty when the document fits on a single page (then
 * there is nothing to shear and the caller can leave the raster alone).
 *
 * `readBand(top, rows)` returns `rows` RGBA rows of a `width`-wide raster
 * starting at `top`. It is injected so the caller can fetch exactly one band
 * per boundary — `getImageData` is a GPU readback — and so the tests can feed
 * a synthetic line grid instead of a real canvas.
 */
export function findPageBreaks(
  width: number,
  contentHeightPx: number,
  pageHeightPx: number,
  searchUpPx: number,
  readBand: (top: number, rows: number) => Uint8ClampedArray,
): number[] {
  if (!(width > 0) || !(pageHeightPx > 0) || !(contentHeightPx > 0)) return [];
  const pages = Math.ceil(contentHeightPx / pageHeightPx);
  const breaks: number[] = [];
  for (let page = 1; page < pages; page++) {
    const nominal = Math.floor(page * pageHeightPx);
    const top = Math.max(0, nominal - Math.max(0, Math.floor(searchUpPx)));
    const rows = nominal - top + 1;
    const band = readBand(top, rows);
    breaks.push(
      findCleanCut(nominal, searchUpPx, (y) => {
        // Rows we did not read back must never be assumed blank, or a band
        // that came out too short would silently hand back a cut we know
        // nothing about. Out-of-band reads degrade to the nominal boundary.
        if (y < top || y >= top + rows) return false;
        const offset = (y - top) * width * 4;
        return isCleanRowData(band.subarray(offset, offset + width * 4));
      }),
    );
  }
  return breaks;
}

/**
 * How far above a nominal boundary to look, in raster pixels.
 *
 * One and a half body lines is enough to reach the leading above the line that
 * straddles the boundary from anywhere inside it, while staying small enough
 * that a page never visibly loses space. Clamped as a share of the page so a
 * gigantic font size can't carve a hole in the middle of a page.
 */
export function searchWindowPx(
  lineHeightPx: number,
  rasterPerCssPx: number,
  pageHeightPx: number,
): number {
  const wanted = Math.round(lineHeightPx * rasterPerCssPx * 1.5);
  const cap = Math.round(pageHeightPx * MAX_SEARCH_SHARE);
  return Math.max(8, Math.min(wanted, cap));
}

/** A raster re-laid as whole pages, plus the rows each page ends on. */
export interface PagedRaster {
  canvas: HTMLCanvasElement;
  /** Ascending raster rows the pages end on (`breaks.length + 1` pages). */
  breaks: number[];
}

/**
 * Re-lay `source` as whole pages: page N's rows are copied to the top of page
 * N's slot in a taller canvas whose height is an exact multiple of
 * `pageHeightPx`. Slicing that canvas at `pageHeightPx` therefore reproduces
 * our page boundaries instead of guessing its own.
 *
 * Returns `null` when the raster already fits one page (nothing to fix) or
 * when the canvas can't be read back.
 */
export function buildPagedCanvas(
  source: HTMLCanvasElement,
  pageHeightPx: number,
  searchUpPx: number,
): PagedRaster | null {
  if (!(pageHeightPx > 0) || source.width <= 0 || source.height <= 0) return null;
  if (source.height <= pageHeightPx) return null;

  const srcCtx = source.getContext('2d');
  if (!srcCtx) return null;

  const width = source.width;
  const breaks = findPageBreaks(
    width,
    source.height,
    pageHeightPx,
    searchUpPx,
    (top, rows) => srcCtx.getImageData(0, top, width, rows).data,
  );
  if (!breaks.length) return null;

  const out = document.createElement('canvas');
  out.width = width;
  out.height = (breaks.length + 1) * pageHeightPx;
  const outCtx = out.getContext('2d');
  if (!outCtx) return null;

  // Undrawn rows have to be paper, not transparent: the export keeps CORS
  // images and a PDF viewer would show black behind anything unpainted.
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, out.width, out.height);

  let from = 0;
  for (let page = 0; page < breaks.length; page++) {
    const to = breaks[page];
    if (to > from) {
      outCtx.drawImage(source, 0, from, width, to - from, 0, page * pageHeightPx, width, to - from);
    }
    from = to;
  }
  // Last page: whatever is left, which is at most one page tall.
  if (source.height > from) {
    outCtx.drawImage(
      source,
      0,
      from,
      width,
      source.height - from,
      0,
      breaks.length * pageHeightPx,
      width,
      source.height - from,
    );
  }
  return { canvas: out, breaks };
}
