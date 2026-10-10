<script setup lang="ts">
/**
 * "Insert table" dialog (#387).
 *
 * Modelled on Word's Insert Table box: pick a column and a row count, then
 * OK. Two of Word's controls are deliberately missing — "AutoFit to window"
 * (a Markdown table has no width to fit; the reader's window decides) and
 * "Remember this size for new tables" (a remembered size is a modal default
 * that surprises the second table more than it helps the first). The dialog
 * therefore opens on the same default every time, which is also why it resets
 * on open rather than holding the last values.
 *
 * The spinner counts are strings, because that is what `<input type="number">`
 * hands back through a v-model — a half-typed `-` or `1e` included. Parsing
 * and clamping happen in `lib/insert-table.ts`, which is unit-tested; this
 * component only carries the values.
 *
 * Opened from the toolbar's Insert menu, the Paragraph menu, the command
 * palette and the `insert.table` shortcut; App.vue owns the state and puts the
 * result on the `solomd:insert-markdown` channel.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { DsModal, DsButton, DsInput } from '../ui';
import { useI18n } from '../i18n';
import {
  INSERT_TABLE_DEFAULT_COLS,
  INSERT_TABLE_DEFAULT_ROWS,
  INSERT_TABLE_MAX_COLS,
  INSERT_TABLE_MAX_ROWS,
  INSERT_TABLE_MIN_COLS,
  INSERT_TABLE_MIN_ROWS,
  clampTableSize,
  tableMarkdown,
} from '../lib/insert-table';

const { t } = useI18n();

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: 'confirm', markdown: string): void;
  (e: 'cancel'): void;
}>();

const cols = ref(String(INSERT_TABLE_DEFAULT_COLS));
const rows = ref(String(INSERT_TABLE_DEFAULT_ROWS));
const colsRef = ref<InstanceType<typeof DsInput> | null>(null);

/** What OK would insert — shown live, so the clamp is never a surprise. */
const size = computed(() => clampTableSize(cols.value, rows.value));

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    // Not "remember the last one" — see the header.
    cols.value = String(INSERT_TABLE_DEFAULT_COLS);
    rows.value = String(INSERT_TABLE_DEFAULT_ROWS);
    void nextTick(() => {
      (colsRef.value?.$el as HTMLInputElement | undefined)?.focus?.();
    });
  },
);

function confirm() {
  emit('confirm', tableMarkdown(size.value.cols, size.value.rows));
}
</script>

<template>
  <DsModal
    :model-value="open"
    :title="t('insertTableDialog.title')"
    width="360px"
    @update:model-value="emit('cancel')"
  >
    <div class="itd">
      <p class="itd__section">{{ t('insertTableDialog.sizeSection') }}</p>
      <div class="itd__row">
        <label class="itd__label" for="itd-cols">{{ t('insertTableDialog.columns') }}</label>
        <DsInput
          id="itd-cols"
          ref="colsRef"
          v-model="cols"
          type="number"
          size="sm"
          data-autofocus
          :min="INSERT_TABLE_MIN_COLS"
          :max="INSERT_TABLE_MAX_COLS"
          @keydown.enter="confirm"
        />
      </div>
      <div class="itd__row">
        <label class="itd__label" for="itd-rows">{{ t('insertTableDialog.rows') }}</label>
        <DsInput
          id="itd-rows"
          v-model="rows"
          type="number"
          size="sm"
          :min="INSERT_TABLE_MIN_ROWS"
          :max="INSERT_TABLE_MAX_ROWS"
          @keydown.enter="confirm"
        />
      </div>
      <p class="itd__note">{{ t('insertTableDialog.note') }}</p>
    </div>
    <template #footer>
      <DsButton variant="ghost" @click="emit('cancel')">{{ t('insertTableDialog.cancel') }}</DsButton>
      <DsButton variant="primary" @click="confirm">{{ t('insertTableDialog.ok') }}</DsButton>
    </template>
  </DsModal>
</template>

<style scoped>
.itd {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.itd__section {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}
.itd__row {
  display: grid;
  grid-template-columns: 1fr 110px;
  align-items: center;
  gap: 12px;
}
.itd__label {
  font-size: 13px;
  color: var(--text);
  cursor: default;
}
.itd__note {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-faint);
}
</style>
