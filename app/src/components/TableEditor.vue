<script setup lang="ts">
/**
 * Grid editor for a Markdown table.
 *
 * Editing a table as text is the point where people give up on Markdown:
 * adding a column means retyping every row, and one missing `|` turns the
 * table back into a paragraph without saying so. This edits it as a grid and
 * writes well-formed, column-aligned Markdown back.
 *
 * Nothing reaches the document until Apply — the session's `apply` closure is
 * the only write path, and Cancel simply drops the working copy.
 *
 * #390 — because of that, closing the dialog *is* discarding, and there was
 * nothing standing between a stray Esc and a lost table. Every close path now
 * goes through `requestClose()`: with no edits it closes as before, with edits
 * it asks whether to Apply or Discard first.
 *
 * #382 — the alignment buttons used to act only on the caret's column, so
 * right-aligning four numeric columns meant four clicks plus four caret moves.
 * The numbered strip above the header selects columns the way a spreadsheet
 * does (click, Shift-click for a range, Ctrl/Cmd-click to add one), and the
 * alignment buttons then act on the whole selection at once.
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  parseTable,
  serializeTable,
  insertRow,
  deleteRow,
  moveRow,
  insertColumn,
  deleteColumn,
  moveColumn,
  setAlignMany,
  setCell,
  emptyTable,
  type TableAlign,
  type TableModel,
} from '../lib/markdown-table';
import { useI18n } from '../i18n';

const props = defineProps<{ source: string }>();
const emit = defineEmits<{
  (e: 'apply', markdown: string): void;
  (e: 'close'): void;
}>();

const { t } = useI18n();

const model = ref<TableModel>(parseTable(props.source) ?? emptyTable());
/** Which column the row/column buttons act on. -1 while the caret is in the
 *  header, which is still a column — the row index is what differs. */
const focused = ref<{ row: number; col: number }>({ row: -1, col: 0 });
const gridEl = ref<HTMLElement | null>(null);
/** #390 — the Markdown an immediate Apply would have written, captured on
 *  open. Comparing against this rather than against `props.source` keeps the
 *  prompt honest for a table that was never column-aligned: opening and
 *  closing it untouched must not look like an edit. */
const baseline = ref(serializeTable(model.value));
/** #390 — the "apply or discard?" overlay is up. */
const showDiscardPrompt = ref(false);
/** #390 — focused on open so Enter confirms without a round of Tab presses. */
const promptPrimaryEl = ref<HTMLButtonElement | null>(null);

watch(
  () => props.source,
  (next) => {
    model.value = parseTable(next) ?? emptyTable();
    focused.value = { row: -1, col: 0 };
    baseline.value = serializeTable(model.value);
    showDiscardPrompt.value = false;
    clearColSelection();
  },
);

const preview = computed(() => serializeTable(model.value));
const colCount = computed(() => model.value.header.length);
/** #390 — is there anything Apply would change? */
const dirty = computed(() => preview.value !== baseline.value);

/**
 * #382 — the columns the alignment buttons act on, ascending. Empty means
 * "just the caret's column", which is how the toolbar behaved before, so a
 * user who never touches the strip sees no change.
 */
const selectedCols = ref<number[]>([]);
/** #382 — where a Shift-click range starts. Null until a plain click. */
const colAnchor = ref<number | null>(null);

function clearColSelection() {
  selectedCols.value = [];
  colAnchor.value = null;
}

/** #382 — what "set alignment" applies to. */
function alignTargets(): number[] {
  return selectedCols.value.length ? selectedCols.value : [focused.value.col];
}

/**
 * #382 — the alignment to show as pressed: the shared alignment of every
 * target, or `undefined` while they disagree (so nothing looks chosen).
 */
const activeAlign = computed<TableAlign | undefined>(() => {
  const targets = alignTargets();
  const first = model.value.aligns[targets[0]] ?? null;
  return targets.every((c) => (model.value.aligns[c] ?? null) === first) ? first : undefined;
});

/** #382 — click / Shift-click / Ctrl-click on the numbered column strip. */
function selectColumn(col: number, e: MouseEvent) {
  if (e.shiftKey && colAnchor.value !== null) {
    const lo = Math.min(colAnchor.value, col);
    const hi = Math.max(colAnchor.value, col);
    selectedCols.value = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  } else if (e.ctrlKey || e.metaKey) {
    const next = new Set(selectedCols.value);
    if (next.has(col)) next.delete(col);
    else next.add(col);
    selectedCols.value = [...next].sort((a, b) => a - b);
    colAnchor.value = col;
  } else {
    selectedCols.value = [col];
    colAnchor.value = col;
  }
  focused.value = { row: focused.value.row, col };
}

const ALIGNS: Array<{ value: TableAlign; label: string }> = [
  { value: null, label: '─' },
  { value: 'left', label: '⟵' },
  { value: 'center', label: '↔' },
  { value: 'right', label: '⟶' },
];

/** What a cell holds, as the model stores it. Chromium reports a trailing
 *  line break for an editable block that is (or just was) empty, and the model
 *  turns line breaks into spaces — so without trimming it, "a" read back as
 *  "a ", never matched the model, and every keystroke rewrote the cell. */
function cellText(el: HTMLElement): string {
  return el.innerText.replace(/\n$/, '').replace(/\r?\n/g, ' ');
}

function onCellInput(row: number, col: number, e: Event) {
  model.value = setCell(model.value, row, col, cellText(e.target as HTMLElement));
}

/**
 * #319 — a cell's text is written by this directive, not by `{{ cell }}`.
 * Interpolation re-rendered the cell on every keystroke; rewriting the text
 * node of the element being typed in puts the caret back at the start, so
 * "abc" came out as "cba". Write only when the cell shows something other
 * than the model — a structural change (row/column inserted, moved or
 * deleted) — never while it already agrees.
 */
const vCellText = {
  mounted(el: HTMLElement, binding: { value: string }) {
    el.textContent = binding.value ?? '';
  },
  updated(el: HTMLElement, binding: { value: string }) {
    const next = binding.value ?? '';
    if (cellText(el) !== next) el.textContent = next;
  },
};

function focusCell(row: number, col: number) {
  focused.value = { row, col };
  // #382 — the caret has moved to a specific cell, so a column selection made
  // a moment ago is over. Without this the highlight would sit on a column the
  // user is no longer working on, and the next alignment click would land
  // somewhere they did not ask for.
  clearColSelection();
}

/** Restore focus into the grid after a structural change, so the keyboard
 *  does not get dropped back to the page on every button press. */
async function refocus(row: number, col: number) {
  focused.value = { row, col };
  await nextTick();
  const sel = `[data-cell="${row}:${col}"]`;
  (gridEl.value?.querySelector(sel) as HTMLElement | null)?.focus();
}

function addRowBelow() {
  const at = focused.value.row + 1;
  model.value = insertRow(model.value, at);
  void refocus(at, focused.value.col);
}
function addRowAbove() {
  const at = Math.max(0, focused.value.row);
  model.value = insertRow(model.value, at);
  void refocus(at, focused.value.col);
}
function removeRow() {
  if (focused.value.row < 0) return;
  const at = focused.value.row;
  model.value = deleteRow(model.value, at);
  void refocus(Math.min(at, model.value.rows.length - 1), focused.value.col);
}
function rowUp() {
  const at = focused.value.row;
  if (at <= 0) return;
  model.value = moveRow(model.value, at, at - 1);
  void refocus(at - 1, focused.value.col);
}
function rowDown() {
  const at = focused.value.row;
  if (at < 0 || at >= model.value.rows.length - 1) return;
  model.value = moveRow(model.value, at, at + 1);
  void refocus(at + 1, focused.value.col);
}

function addColRight() {
  const at = focused.value.col + 1;
  clearColSelection();
  model.value = insertColumn(model.value, at);
  void refocus(focused.value.row, at);
}
function addColLeft() {
  const at = focused.value.col;
  clearColSelection();
  model.value = insertColumn(model.value, at);
  void refocus(focused.value.row, at);
}
function removeCol() {
  const at = focused.value.col;
  clearColSelection();
  model.value = deleteColumn(model.value, at);
  void refocus(focused.value.row, Math.min(at, model.value.header.length - 1));
}
function colLeft() {
  const at = focused.value.col;
  if (at <= 0) return;
  clearColSelection();
  model.value = moveColumn(model.value, at, at - 1);
  void refocus(focused.value.row, at - 1);
}
function colRight() {
  const at = focused.value.col;
  if (at >= model.value.header.length - 1) return;
  clearColSelection();
  model.value = moveColumn(model.value, at, at + 1);
  void refocus(focused.value.row, at + 1);
}
/** #382 — one click sets the whole selection. */
function chooseAlign(a: TableAlign) {
  model.value = setAlignMany(model.value, alignTargets(), a);
}

function apply() {
  showDiscardPrompt.value = false;
  emit('apply', serializeTable(model.value));
  emit('close');
}

/** #390 — the single door out of the dialog. */
async function requestClose() {
  if (!dirty.value) {
    emit('close');
    return;
  }
  showDiscardPrompt.value = true;
  await nextTick();
  promptPrimaryEl.value?.focus();
}

/** #390 — "丢弃": drop the working copy, as Cancel always did. */
function discardAndClose() {
  showDiscardPrompt.value = false;
  emit('close');
}

/**
 * Tab moves to the next cell rather than out of the dialog, which is what a
 * grid is expected to do; Escape cancels. Enter inside a cell is swallowed
 * because a newline would split the row across two table lines.
 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    // While the prompt is up, Esc dismisses the prompt — not the whole editor,
    // which is the tab-away reflex that #390 exists to stop.
    if (showDiscardPrompt.value) showDiscardPrompt.value = false;
    else void requestClose();
    return;
  }
  // With the prompt up the keyboard belongs to it: Enter / Space must reach
  // whichever button was focused (Apply is focused on open), so nothing below
  // may swallow those keys.
  if (showDiscardPrompt.value) return;
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) apply();
    return;
  }
  if (e.key !== 'Tab') return;
  const { row, col } = focused.value;
  e.preventDefault();
  const cols = colCount.value;
  let flat = (row + 1) * cols + col + (e.shiftKey ? -1 : 1);
  const total = (model.value.rows.length + 1) * cols;
  flat = ((flat % total) + total) % total;
  void refocus(Math.floor(flat / cols) - 1, flat % cols);
}
</script>

<template>
  <div class="tbl__backdrop" @click.self="requestClose" @keydown="onKeydown">
    <div class="tbl" role="dialog" aria-modal="true">
      <header class="tbl__head">
        <span class="tbl__title">{{ t('tableEditor.heading') }}</span>
        <span class="tbl__size">{{ colCount }} × {{ model.rows.length }}</span>
        <button class="tbl__x" :title="t('tableEditor.cancel')" @click="requestClose">×</button>
      </header>

      <div class="tbl__toolbar">
        <div class="tbl__group">
          <span class="tbl__grouplabel">{{ t('tableEditor.row') }}</span>
          <button @click="addRowAbove" :title="t('tableEditor.rowAbove')">↑+</button>
          <button @click="addRowBelow" :title="t('tableEditor.rowBelow')">↓+</button>
          <button @click="rowUp" :title="t('tableEditor.rowUp')">⤒</button>
          <button @click="rowDown" :title="t('tableEditor.rowDown')">⤓</button>
          <button class="tbl__danger" @click="removeRow" :title="t('tableEditor.rowDelete')">✕</button>
        </div>
        <div class="tbl__group">
          <span class="tbl__grouplabel">{{ t('tableEditor.column') }}</span>
          <button @click="addColLeft" :title="t('tableEditor.colLeft')">+←</button>
          <button @click="addColRight" :title="t('tableEditor.colRight')">+→</button>
          <button @click="colLeft" :title="t('tableEditor.colMoveLeft')">⇤</button>
          <button @click="colRight" :title="t('tableEditor.colMoveRight')">⇥</button>
          <button class="tbl__danger" @click="removeCol" :title="t('tableEditor.colDelete')">✕</button>
        </div>
        <div class="tbl__group">
          <span class="tbl__grouplabel">
            {{ t('tableEditor.align') }}
            <!-- #382 — how many columns the next click will cover. -->
            <span v-if="selectedCols.length > 1" class="tbl__colcount">{{ selectedCols.length }}</span>
          </span>
          <button
            v-for="a in ALIGNS"
            :key="String(a.value)"
            :class="{ 'tbl__on': activeAlign === a.value }"
            @click="chooseAlign(a.value)"
          >{{ a.label }}</button>
        </div>
      </div>

      <div class="tbl__gridwrap" ref="gridEl">
        <table class="tbl__grid">
          <thead>
            <!-- #382 — the numbered strip. Click a number to aim the
                 alignment buttons at that column, Shift-click for a range,
                 Ctrl/Cmd-click to add one column to the selection. -->
            <tr class="tbl__colbar">
              <th
                v-for="c in colCount"
                :key="`s${c}`"
                class="tbl__colbarcell"
                :class="{ 'tbl__colsel': selectedCols.includes(c - 1) }"
              >
                <button
                  type="button"
                  class="tbl__colbtn"
                  :title="t('tableEditor.selectColumn')"
                  @click="selectColumn(c - 1, $event)"
                >{{ c }}</button>
              </th>
            </tr>
            <tr>
              <th
                v-for="(cell, c) in model.header"
                :key="`h${c}`"
                :class="{
                  'tbl__focus': focused.row === -1 && focused.col === c,
                  'tbl__colsel': selectedCols.includes(c),
                }"
              >
                <div
                  class="tbl__cell"
                  contenteditable="plaintext-only"
                  :data-cell="`-1:${c}`"
                  :style="{ textAlign: model.aligns[c] ?? 'left' }"
                  @focus="focusCell(-1, c)"
                  @input="(e) => onCellInput(-1, c, e)"
                  v-cell-text="cell"
                ></div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in model.rows" :key="`r${r}`">
              <td
                v-for="(cell, c) in row"
                :key="`c${r}-${c}`"
                :class="{
                  'tbl__focus': focused.row === r && focused.col === c,
                  'tbl__colsel': selectedCols.includes(c),
                }"
              >
                <div
                  class="tbl__cell"
                  contenteditable="plaintext-only"
                  :data-cell="`${r}:${c}`"
                  :style="{ textAlign: model.aligns[c] ?? 'left' }"
                  @focus="focusCell(r, c)"
                  @input="(e) => onCellInput(r, c, e)"
                  v-cell-text="cell"
                ></div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <details class="tbl__preview">
        <summary>{{ t('tableEditor.preview') }}</summary>
        <pre>{{ preview }}</pre>
      </details>

      <footer class="tbl__foot">
        <span class="tbl__hint">{{ t('tableEditor.hint') }}</span>
        <button class="tbl__btn" @click="requestClose">{{ t('tableEditor.cancel') }}</button>
        <button class="tbl__btn tbl__btn--primary" @click="apply">{{ t('tableEditor.apply') }}</button>
      </footer>
    </div>

    <div
      v-if="showDiscardPrompt"
      class="tbl__confirm"
      role="alertdialog"
      aria-modal="true"
      @click.self="showDiscardPrompt = false"
    >
      <div class="tbl__confirmbox">
        <p class="tbl__confirmtitle">{{ t('tableEditor.discardTitle') }}</p>
        <p class="tbl__confirmbody">{{ t('tableEditor.discardBody') }}</p>
        <div class="tbl__confirmfoot">
          <button class="tbl__btn" @click="showDiscardPrompt = false">{{ t('tableEditor.cancel') }}</button>
          <button class="tbl__btn tbl__btn--danger" @click="discardAndClose">
            {{ t('tableEditor.discard') }}
          </button>
          <button ref="promptPrimaryEl" class="tbl__btn tbl__btn--primary" @click="apply">
            {{ t('tableEditor.apply') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tbl__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2100;
}
.tbl {
  display: flex;
  flex-direction: column;
  width: min(880px, 92vw);
  max-height: 86vh;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
  overflow: hidden;
}
.tbl__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.tbl__title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  flex: 1;
}
.tbl__size {
  font-size: 11px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.tbl__x {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.tbl__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elev);
}
.tbl__group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tbl__grouplabel {
  font-size: 11px;
  color: var(--text-faint);
  margin-right: 2px;
}
.tbl__group button {
  min-width: 28px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-muted);
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
}
.tbl__group button:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.tbl__group button.tbl__on {
  border-color: var(--accent, #ff9f40);
  color: var(--accent, #ff9f40);
}
.tbl__danger:hover {
  color: var(--danger, #d64545) !important;
  border-color: var(--danger, #d64545);
}
.tbl__gridwrap {
  flex: 1;
  overflow: auto;
  padding: 10px 14px;
}
.tbl__grid {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
}
.tbl__grid th,
.tbl__grid td {
  border: 1px solid var(--border);
  padding: 0;
  vertical-align: top;
}
.tbl__grid th {
  background: var(--bg-elev);
  font-weight: 600;
}
/* #382 — the numbered column strip. It is a real table row, so each number
   stays welded to its column however the table is sized or scrolled. */
.tbl__colbar th {
  background: var(--bg);
  padding: 0;
}
.tbl__colbtn {
  display: block;
  width: 100%;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--text-faint);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.tbl__colbtn:hover {
  background: var(--bg-hover);
  color: var(--accent, #ff9f40);
}
/* #382 — one tint for a selected column, on its number and on its cells.
   Beats `.tbl__grid th`'s background on specificity, so a selected header
   column reads as selected too. */
.tbl__grid .tbl__colsel {
  background: color-mix(in srgb, var(--accent, #ff9f40) 16%, transparent);
}
.tbl__colcount {
  display: inline-block;
  margin-left: 5px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--accent, #ff9f40);
  color: var(--accent-fg, #1a1a1a);
  font-size: 10px;
  font-weight: 600;
}
.tbl__focus {
  outline: 2px solid var(--accent, #ff9f40);
  outline-offset: -2px;
}
.tbl__cell {
  min-width: 80px;
  min-height: 1.6em;
  padding: 6px 8px;
  outline: none;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.tbl__preview {
  border-top: 1px solid var(--border);
  padding: 6px 14px;
  font-size: 11px;
  color: var(--text-muted);
}
.tbl__preview pre {
  margin: 6px 0 0;
  padding: 8px;
  background: var(--bg-elev);
  border-radius: 6px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
}
.tbl__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
}
.tbl__hint {
  flex: 1;
  font-size: 11px;
  color: var(--text-faint);
}
.tbl__btn {
  padding: 5px 14px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.tbl__btn--primary {
  background: var(--accent, #ff9f40);
  border-color: var(--accent, #ff9f40);
  color: var(--accent-fg, #1a1a1a);
  font-weight: 600;
}
/* #390 — the apply-or-discard prompt. Sits above `.tbl` in the same backdrop,
   so the grid stays visible (and visibly unsaved) behind it. */
.tbl__confirm {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}
.tbl__confirmbox {
  width: min(420px, 88vw);
  padding: 16px 18px 12px;
  background: var(--bg-elev);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--sh-pop, 0 18px 48px rgba(0, 0, 0, 0.4));
}
.tbl__confirmtitle {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}
.tbl__confirmbody {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}
.tbl__confirmfoot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.tbl__btn--danger {
  border-color: var(--danger, #d64545);
  color: var(--danger, #d64545);
}
.tbl__btn--danger:hover {
  background: var(--danger, #d64545);
  color: #fff;
}
</style>
