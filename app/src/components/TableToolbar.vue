<script setup lang="ts">
/**
 * The floating toolbar for the table the caret is in — what replaced the grid
 * dialog (#500).
 *
 * The dialog asked the user to leave the text, edit a copy in a modal, and
 * apply it back. A table is a few lines of text; the operations worth having
 * are the structural ones, and those can be applied to the document directly.
 * So the bar appears over the table while the caret is inside one, and every
 * button is a single edit on the real document — undoable, no Apply/Cancel.
 *
 * Editor-agnostic for the same reason SelectionBubble.vue is: Windows runs a
 * plain `<textarea>` by default and CodeMirror on request, and a feature
 * written against one of them would be silently dead in the other. Editor.vue
 * hands this component two readers — `read` (which table, which cell) and
 * `rect` (where that table is on screen) — for whichever editor it is running,
 * and applies the emitted action itself. No table logic lives here.
 *
 * Never takes focus or the caret (every press is `mousedown.prevent`), and
 * never on touch: iOS / Android have the keyboard bar.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Icon from './Icons.vue';
import { useI18n } from '../i18n';
import { isMobile } from '../lib/platform';
import { placeBubble, type Box } from '../lib/selection-bubble';
import { tableActionEnabled, type TableAction, type TableToolbarState } from '../lib/table-toolbar';

const props = defineProps<{
  /** The editor's root element: events are read from it, the bar stays near it. */
  host: HTMLElement | null;
  enabled: boolean;
  read: () => TableToolbarState | null;
  rect: () => Box | null;
}>();
const emit = defineEmits<{ (e: 'action', action: TableAction): void }>();

const { t } = useI18n();
const touchPlatform = isMobile();

const visible = ref(false);
const below = ref(false);
const pos = ref<{ left: number; top: number } | null>(null);
const state = ref<TableToolbarState | null>(null);
const moreOpen = ref(false);
const menuBelow = ref(false);
const barEl = ref<HTMLElement | null>(null);

let dismissedKey: string | null = null;
let composing = false;

function hide() {
  visible.value = false;
  moreOpen.value = false;
  pos.value = null;
}

function usable(): TableToolbarState | null {
  if (!props.enabled || touchPlatform || composing) return null;
  return props.read();
}

/** Show, or with `inPlace` re-measure the open bar without re-animating it. */
async function refresh(inPlace = false) {
  const s = usable();
  if (!s) {
    hide();
    return;
  }
  // Escape dismissed the bar for this caret position; moving brings it back.
  if (s.key === dismissedKey) {
    hide();
    return;
  }
  dismissedKey = null;
  const r = props.rect();
  const host = props.host;
  if (!r || !host) {
    hide();
    return;
  }
  const bounds = host.getBoundingClientRect();
  // The table scrolled out of the pane: nothing to point at.
  if (r.bottom < bounds.top || r.top > bounds.bottom) {
    hide();
    return;
  }
  state.value = s;
  if (!inPlace || !visible.value) {
    pos.value = null;
    visible.value = true;
  }
  await nextTick();
  const el = barEl.value;
  if (!el) return;
  const p = placeBubble(
    r,
    { width: el.offsetWidth, height: el.offsetHeight },
    {
      left: Math.max(bounds.left, 0),
      right: Math.min(bounds.right, window.innerWidth),
      top: Math.max(bounds.top, 0),
      bottom: Math.min(bounds.bottom, window.innerHeight),
    },
  );
  below.value = p.below;
  pos.value = { left: p.left, top: p.top };
}

// ── events from the editor ────────────────────────────────────────────────
/**
 * One recompute per frame, not per event.
 *
 * A single keystroke fires `input`, `keyup` and `selectionchange`; measuring
 * three times per key is what makes a floating bar feel heavy, and on the
 * plain-textarea path each measure builds a mirror element to find the caret.
 */
let frame = 0;
function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    void refresh(visible.value);
  });
}
function cancelFrame() {
  if (!frame) return;
  cancelAnimationFrame(frame);
  frame = 0;
}

function onDocSelectionChange() {
  const host = props.host;
  if (!host) return;
  const a = document.activeElement;
  if (!a || !host.contains(a)) return;
  schedule();
}
function onCompositionStart() {
  composing = true;
  cancelFrame();
  hide();
}
function onCompositionEnd() {
  composing = false;
  schedule();
}
function onFocusOut() {
  // Focus moving between the plain editor's block textareas stays inside.
  setTimeout(() => {
    const a = document.activeElement;
    if (!props.host || !a || !props.host.contains(a)) hide();
  }, 0);
}
function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (moreOpen.value) {
    moreOpen.value = false;
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (!visible.value) return;
  dismissedKey = props.read()?.key ?? state.value?.key ?? null;
  cancelFrame();
  hide();
  e.preventDefault();
  e.stopPropagation();
}

let bound: HTMLElement | null = null;
function bind(host: HTMLElement | null) {
  if (bound === host) return;
  unbind();
  if (!host || touchPlatform) return;
  bound = host;
  host.addEventListener('keyup', schedule, true);
  host.addEventListener('input', schedule, true);
  host.addEventListener('mouseup', schedule, true);
  host.addEventListener('scroll', schedule, true);
  host.addEventListener('keydown', onKeyDown, true);
  host.addEventListener('compositionstart', onCompositionStart, true);
  host.addEventListener('compositionend', onCompositionEnd, true);
  host.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('selectionchange', onDocSelectionChange);
  window.addEventListener('blur', hide);
  window.addEventListener('resize', schedule);
}
function unbind() {
  const host = bound;
  if (!host) return;
  bound = null;
  host.removeEventListener('keyup', schedule, true);
  host.removeEventListener('input', schedule, true);
  host.removeEventListener('mouseup', schedule, true);
  host.removeEventListener('scroll', schedule, true);
  host.removeEventListener('keydown', onKeyDown, true);
  host.removeEventListener('compositionstart', onCompositionStart, true);
  host.removeEventListener('compositionend', onCompositionEnd, true);
  host.removeEventListener('focusout', onFocusOut, true);
  document.removeEventListener('selectionchange', onDocSelectionChange);
  window.removeEventListener('blur', hide);
  window.removeEventListener('resize', schedule);
}

watch(() => props.host, (h) => bind(h), { immediate: true });
watch(() => props.enabled, (on) => { if (!on) hide(); });
onBeforeUnmount(() => {
  cancelFrame();
  hide();
  unbind();
});

// ── actions ───────────────────────────────────────────────────────────────
function run(action: TableAction) {
  moreOpen.value = false;
  emit('action', action);
  // The edit and its new caret land on the next frame on the plain path;
  // re-measure once they have, so the bar follows the table it edits.
  requestAnimationFrame(() => requestAnimationFrame(() => void refresh(true)));
}

const MENU_ROOM = 4 * 28 + 2 * 4 + 16;
function toggleMore() {
  menuBelow.value = below.value || (pos.value?.top ?? 0) < MENU_ROOM;
  moreOpen.value = !moreOpen.value;
}

function enabled(action: TableAction): boolean {
  const s = state.value;
  if (!s) return false;
  return tableActionEnabled(s.model, action, s.row, s.col);
}

/** Alignment currently on the caret's column, so the buttons show pressed. */
const align = computed(() => state.value?.model.aligns[state.value.col] ?? null);

interface PrimaryButton {
  action: TableAction;
  glyph: string;
  label: string;
  danger?: boolean;
}
const rowButtons: PrimaryButton[] = [
  { action: 'row-above', glyph: '↑+', label: 'tableToolbar.rowAbove' },
  { action: 'row-below', glyph: '↓+', label: 'tableToolbar.rowBelow' },
  { action: 'row-delete', glyph: '✕', label: 'tableToolbar.rowDelete', danger: true },
];
const colButtons: PrimaryButton[] = [
  { action: 'col-left', glyph: '+←', label: 'tableToolbar.colLeft' },
  { action: 'col-right', glyph: '+→', label: 'tableToolbar.colRight' },
  { action: 'col-delete', glyph: '✕', label: 'tableToolbar.colDelete', danger: true },
];
const alignButtons: Array<PrimaryButton & { value: 'left' | 'center' | 'right' }> = [
  { action: 'align-left', value: 'left', glyph: '⟵', label: 'tableToolbar.alignLeft' },
  { action: 'align-center', value: 'center', glyph: '↔', label: 'tableToolbar.alignCenter' },
  { action: 'align-right', value: 'right', glyph: '⟶', label: 'tableToolbar.alignRight' },
];
const moreButtons: PrimaryButton[] = [
  { action: 'row-up', glyph: '⤒', label: 'tableToolbar.rowUp' },
  { action: 'row-down', glyph: '⤓', label: 'tableToolbar.rowDown' },
  { action: 'col-move-left', glyph: '⇤', label: 'tableToolbar.colMoveLeft' },
  { action: 'col-move-right', glyph: '⇥', label: 'tableToolbar.colMoveRight' },
];

const style = computed(() =>
  pos.value
    ? { left: `${pos.value.left}px`, top: `${pos.value.top}px` }
    : { left: '-9999px', top: '-9999px', visibility: 'hidden' as const },
);

defineExpose({ hide, refresh });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && state"
      ref="barEl"
      class="tbl-bar"
      :class="{ 'tbl-bar--below': below, 'tbl-bar--placed': !!pos }"
      :style="style"
      role="toolbar"
      :aria-label="t('tableToolbar.label')"
      data-table-toolbar
      @mousedown.prevent
    >
      <button
        v-for="b in rowButtons"
        :key="b.action"
        class="tbl-bar__btn"
        :class="{ 'is-danger': b.danger }"
        :title="t(b.label)"
        :aria-label="t(b.label)"
        :disabled="!enabled(b.action)"
        :data-action="b.action"
        @click="run(b.action)"
      >{{ b.glyph }}</button>

      <span class="tbl-bar__sep" aria-hidden="true" />

      <button
        v-for="b in colButtons"
        :key="b.action"
        class="tbl-bar__btn"
        :class="{ 'is-danger': b.danger }"
        :title="t(b.label)"
        :aria-label="t(b.label)"
        :disabled="!enabled(b.action)"
        :data-action="b.action"
        @click="run(b.action)"
      >{{ b.glyph }}</button>

      <span class="tbl-bar__sep" aria-hidden="true" />

      <button
        v-for="b in alignButtons"
        :key="b.action"
        class="tbl-bar__btn"
        :class="{ 'is-on': align === b.value }"
        :title="t(b.label)"
        :aria-label="t(b.label)"
        :aria-pressed="align === b.value"
        :disabled="!enabled(b.action)"
        :data-action="b.action"
        @click="run(b.action)"
      >{{ b.glyph }}</button>

      <span class="tbl-bar__sep" aria-hidden="true" />

      <div class="tbl-bar__anchor">
        <button
          class="tbl-bar__btn"
          :class="{ 'is-on': moreOpen }"
          :title="t('tableToolbar.more')"
          :aria-label="t('tableToolbar.more')"
          aria-haspopup="menu"
          :aria-expanded="moreOpen"
          data-action="more"
          @click="toggleMore"
        ><Icon name="more" :size="15" /></button>
        <div v-if="moreOpen" class="tbl-bar__menu" :class="{ 'tbl-bar__menu--below': menuBelow }" role="menu">
          <button
            v-for="b in moreButtons"
            :key="b.action"
            class="tbl-bar__item"
            role="menuitem"
            :disabled="!enabled(b.action)"
            :data-action="b.action"
            @click="run(b.action)"
          >
            <span class="tbl-bar__glyph" aria-hidden="true">{{ b.glyph }}</span>
            <span class="tbl-bar__name">{{ t(b.label) }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tbl-bar {
  position: fixed;
  z-index: var(--z-pop);
  display: flex;
  align-items: center;
  gap: 1px;
  padding: var(--sp-1);
  background: var(--bg-pop);
  border: var(--bd-hair);
  border-radius: var(--r-lg);
  box-shadow: var(--sh-pop);
  user-select: none;
  -webkit-user-select: none;
  font-family: var(--font-ui, system-ui);
}
.tbl-bar--placed {
  animation: tbl-bar-in var(--dur-fast) var(--ease-out) both;
}
.tbl-bar--placed.tbl-bar--below {
  animation-name: tbl-bar-in-below;
}
@keyframes tbl-bar-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
@keyframes tbl-bar-in-below {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}

.tbl-bar__btn {
  min-width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  cursor: default;
  transition: background-color var(--dur-fast) var(--ease-out);
}
.tbl-bar__btn:hover:not(:disabled) {
  background: var(--fill-1);
}
.tbl-bar__btn:active:not(:disabled),
.tbl-bar__btn.is-on {
  background: var(--fill-2);
}
.tbl-bar__btn.is-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--danger, #d64545) 14%, transparent);
  color: var(--danger, #d64545);
}
.tbl-bar__btn:disabled {
  color: var(--text-faint);
  opacity: 0.45;
}
.tbl-bar__btn:focus-visible {
  outline: none;
  box-shadow: var(--ring);
}

.tbl-bar__sep {
  width: var(--hair-w);
  align-self: stretch;
  margin: 6px var(--sp-1);
  background: var(--hairline);
}

.tbl-bar__anchor {
  position: relative;
  display: inline-flex;
}
.tbl-bar__menu {
  position: absolute;
  left: -4px;
  bottom: calc(100% + 8px);
  min-width: 190px;
  padding: var(--sp-1);
  background: var(--bg-pop);
  border: var(--bd-hair);
  border-radius: var(--r-lg);
  box-shadow: var(--sh-pop);
  animation: tbl-bar-menu-in var(--dur-fast) var(--ease-out) both;
  transform-origin: bottom left;
}
.tbl-bar__menu--below {
  bottom: auto;
  top: calc(100% + 8px);
  transform-origin: top left;
}
@keyframes tbl-bar-menu-in {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: none; }
}
.tbl-bar__item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  height: 28px;
  padding: 0 var(--sp-2) 0 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: default;
}
.tbl-bar__item:hover:not(:disabled) {
  background: var(--fill-1);
}
.tbl-bar__item:disabled {
  color: var(--text-faint);
  opacity: 0.45;
}
.tbl-bar__glyph {
  width: 16px;
  text-align: center;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.tbl-bar__name {
  flex: 1;
}
</style>
