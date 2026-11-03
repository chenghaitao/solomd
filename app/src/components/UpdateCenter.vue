<script setup lang="ts">
/**
 * Update centre — the dialog behind "check for updates".
 *
 * Layout follows the familiar shape: a headline naming the new version,
 * one-sentence notes grouped into features / improvements / fixes, a
 * collapsible version history, and a footer that carries the update source
 * plus the download actions.
 *
 * Everything shown follows the selected source (#channels), so switching
 * between the fork build and the official build swaps the headline, the
 * notes, the history list and the download target together — the two can
 * never disagree about what "the new version" is.
 */
import { computed, ref, watch } from 'vue';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';

import { DsModal } from '../ui';
import { useI18n } from '../i18n';
import { useSettingsStore } from '../stores/settings';
import { cancelUpdateDownload, compareSemver, downloadAndInstallUpdate } from '../lib/check-update';
import {
  channelPage,
  fetchChannelReleases,
  type ChannelRelease,
  type UpdateChannel,
} from '../lib/release-channels';
import { isEmptyNotes, releaseNotesFor } from '../data/release-notes';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

const { t, lang } = useI18n();
const settings = useSettingsStore();

const channel = computed<UpdateChannel>({
  get: () => settings.updateChannel,
  set: (v) => {
    settings.updateChannel = v;
    settings.persist();
  },
});

const currentVersion = ref('');
const releases = ref<ChannelRelease[]>([]);
const loading = ref(false);
const failed = ref(false);
const historyOpen = ref(true);

const downloading = ref(false);
const percent = ref<number | null>(null);
const downloaded = ref(false);

const latest = computed<ChannelRelease | null>(() => {
  const list = releases.value;
  return list.find((r) => !r.prerelease) ?? list[0] ?? null;
});

const hasUpdate = computed(() => {
  if (!latest.value || !currentVersion.value) return false;
  if (latest.value.version === settings.ignoredUpdateVersion) return false;
  return compareSemver(latest.value.version, currentVersion.value) > 0;
});

const pendingCount = computed(() => (hasUpdate.value ? 1 : 0));

const notes = computed(() =>
  latest.value ? releaseNotesFor(channel.value, latest.value.version, lang.value) : null,
);

const noteGroups = computed(() => {
  const group = notes.value;
  if (isEmptyNotes(group)) return [];
  return [
    { key: 'features', title: t('updateCenter.features'), lines: group!.features },
    { key: 'improvements', title: t('updateCenter.improvements'), lines: group!.improvements },
    { key: 'fixes', title: t('updateCenter.fixes'), lines: group!.fixes },
  ].filter((section) => section.lines.length > 0);
});

/** Long-form fallback for a release that has no curated one-liners yet. */
const fallbackBody = computed(() => {
  if (noteGroups.value.length > 0) return '';
  const body = latest.value?.body ?? '';
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line) => line.replace(/^#{1,6}\s*/, '').trim())
    .filter((line) => line && !/^\|?[-\s|:]+\|?$/.test(line))
    .slice(0, 8)
    .join('\n');
});

/** Everything that is not the build in use — the "version history" list. */
const history = computed(() =>
  releases.value.filter(
    (r) => !currentVersion.value || compareSemver(r.version, currentVersion.value) !== 0,
  ),
);

function publishedLabel(release: ChannelRelease): string {
  if (!release.publishedAt) return '';
  const date = new Date(release.publishedAt);
  if (Number.isNaN(date.getTime())) return '';
  const text = date.toLocaleDateString(lang.value === 'zh' ? 'zh-CN' : lang.value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return t('updateCenter.publishedOn', { date: text });
}

async function load(): Promise<void> {
  loading.value = true;
  failed.value = false;
  try {
    const list = await fetchChannelReleases(channel.value);
    releases.value = list;
    failed.value = list.length === 0;
  } catch {
    releases.value = [];
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

async function ensureVersion(): Promise<void> {
  if (currentVersion.value) return;
  try {
    currentVersion.value = await getVersion();
  } catch {
    currentVersion.value = '';
  }
}

function resetTransient(): void {
  downloaded.value = false;
  percent.value = null;
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    resetTransient();
    void ensureVersion();
    void load();
  },
);

watch(channel, () => {
  if (!props.modelValue) return;
  resetTransient();
  void load();
});

async function openPage(url: string): Promise<void> {
  try {
    await openUrl(url || channelPage(channel.value));
  } catch {
    /* the browser refused to open it — nothing useful to say here */
  }
}

async function startDownload(): Promise<void> {
  if (!latest.value || downloading.value) return;
  downloading.value = true;
  percent.value = 0;
  const ok = await downloadAndInstallUpdate(latest.value.version, {
    channel: channel.value,
    onProgress: (p) => {
      if (p.percent != null) percent.value = p.percent;
    },
  });
  downloading.value = false;
  downloaded.value = ok;
}

async function cancelDownload(): Promise<void> {
  await cancelUpdateDownload();
  downloading.value = false;
  percent.value = null;
}

function ignoreVersion(): void {
  if (latest.value) {
    settings.ignoredUpdateVersion = latest.value.version;
    settings.persist();
  }
  emit('update:modelValue', false);
}
</script>

<template>
  <DsModal
    :model-value="modelValue"
    width="620px"
    class="update-center"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="uc__heading">
        <h2 class="ds-modal__title">{{ t('updateCenter.title') }}</h2>
        <span v-if="pendingCount" class="uc__badge">
          {{ t('updateCenter.available', { count: pendingCount }) }}
        </span>
      </div>
    </template>

    <div class="uc__lead">
      <template v-if="loading">{{ t('updateCenter.checking') }}</template>
      <template v-else-if="failed">{{ t('updateCenter.checkFailed') }}</template>
      <template v-else-if="latest">
        {{ t('updateCenter.headline', { latest: latest.version, current: currentVersion || '—' }) }}
      </template>
      <template v-else>{{ t('updateCenter.upToDate') }}</template>
    </div>

    <div v-if="noteGroups.length" class="uc__notes">
      <section v-for="section in noteGroups" :key="section.key">
        <h3 class="uc__notes-title">{{ section.title }}</h3>
        <ul class="uc__notes-list">
          <li v-for="line in section.lines" :key="line">{{ line }}</li>
        </ul>
      </section>
    </div>
    <pre v-else-if="fallbackBody" class="uc__notes uc__notes--raw">{{ fallbackBody }}</pre>

    <p v-if="downloaded" class="uc__downloaded">
      {{ t('updateCenter.downloaded', { version: latest?.version ?? '' }) }}
    </p>

    <div class="uc__history">
      <button type="button" class="uc__history-head" @click="historyOpen = !historyOpen">
        <span>{{ t('updateCenter.history') }}</span>
        <svg
          class="uc__chevron"
          :class="{ 'uc__chevron--open': historyOpen }"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <template v-if="historyOpen">
        <p class="uc__hint">{{ t('updateCenter.historyHint') }}</p>
        <ul v-if="history.length" class="uc__versions">
          <li v-for="release in history" :key="release.tag" class="uc__version">
            <span class="uc__version-tag">{{ release.tag }}</span>
            <span class="uc__version-date">{{ publishedLabel(release) }}</span>
            <button type="button" class="uc__btn" @click="openPage(release.pageUrl)">
              {{ t('updateCenter.openPage') }}
            </button>
          </li>
        </ul>
        <p v-else class="uc__hint">{{ t('updateCenter.noHistory') }}</p>
      </template>
    </div>

    <template #footer>
      <div class="uc__foot">
        <label class="uc__channel">
          <span class="uc__channel-label">{{ t('updateCenter.source') }}</span>
          <select v-model="channel" class="uc__select" :disabled="downloading">
            <option value="fork">{{ t('updateCenter.sourceFork') }}</option>
            <option value="official">{{ t('updateCenter.sourceOfficial') }}</option>
          </select>
        </label>

        <div class="uc__actions">
          <button type="button" class="uc__btn" @click="openPage(latest?.pageUrl ?? '')">
            {{ t('updateCenter.openPage') }}
          </button>
          <template v-if="downloading">
            <button type="button" class="uc__btn" @click="cancelDownload">
              {{ t('updateCenter.cancel') }}
            </button>
            <button type="button" class="uc__btn uc__btn--primary" disabled>
              {{ t('updateCenter.downloading', { percent: percent ?? 0 }) }}
            </button>
          </template>
          <template v-else-if="downloaded">
            <button type="button" class="uc__btn" @click="ignoreVersion">
              {{ t('updateCenter.ignore') }}
            </button>
            <button type="button" class="uc__btn uc__btn--primary" @click="startDownload">
              {{ t('updateCenter.restart') }}
            </button>
          </template>
          <template v-else>
            <button
              type="button"
              class="uc__btn uc__btn--primary"
              :disabled="!latest || !hasUpdate"
              @click="startDownload"
            >
              {{ t('updateCenter.download') }}
            </button>
          </template>
        </div>
      </div>
    </template>
  </DsModal>
</template>

<style scoped>
.uc__heading {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}
.uc__badge {
  flex: none;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  color: var(--text-2);
  background: var(--fill-2);
  border-radius: 999px;
}
.uc__lead {
  margin: 0 0 var(--sp-3);
  font-size: 13px;
  color: var(--text-2);
}
.uc__notes {
  max-height: 260px;
  overflow-y: auto;
  padding: var(--sp-3);
  background: var(--fill-1);
  border: var(--bd-hair);
  border-radius: var(--r-lg);
}
.uc__notes--raw {
  margin: 0;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-2);
  white-space: pre-wrap;
}
.uc__notes section + section {
  margin-top: var(--sp-3);
}
.uc__notes-title {
  margin: 0 0 4px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}
.uc__notes-list {
  margin: 0;
  padding-left: 16px;
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.6;
}
.uc__notes-list li + li {
  margin-top: 3px;
}
.uc__downloaded {
  margin: var(--sp-3) 0 0;
  font-size: 12.5px;
  color: var(--accent);
}
.uc__history {
  margin-top: var(--sp-4);
  padding-top: var(--sp-3);
  border-top: var(--bd-hair);
}
.uc__history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  background: transparent;
  border: 0;
  cursor: default;
}
.uc__chevron {
  color: var(--text-3);
  transform: rotate(180deg);
  transition: transform var(--dur) var(--ease-out);
}
.uc__chevron--open {
  transform: rotate(0deg);
}
.uc__hint {
  margin: var(--sp-2) 0 var(--sp-2);
  font-size: 12px;
  color: var(--text-3);
}
.uc__versions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 190px;
  overflow-y: auto;
}
/* One card per version, the way the reference dialog does it: a bordered
   block reads as a pickable row, whereas a divided list reads as a table. */
.uc__version {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 10px 12px;
  background: var(--bg-pop);
  border: var(--bd-hair);
  border-radius: var(--r-md);
}
.uc__version-tag {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.uc__version-date {
  flex: 1;
  font-size: 12px;
  color: var(--text-3);
}
.uc__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  width: 100%;
  flex-wrap: wrap;
}
.uc__channel {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: 12.5px;
  color: var(--text-3);
}
.uc__select {
  height: 28px;
  padding: 0 6px;
  font-size: 12.5px;
  color: var(--text);
  background: var(--bg-pop);
  border: var(--bd-hair);
  border-radius: var(--r-sm);
}
.uc__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  margin-left: auto;
}
.uc__btn {
  height: 30px;
  padding: 0 12px;
  font-size: 12.5px;
  color: var(--text);
  background: var(--bg-pop);
  border: var(--bd-hair);
  border-radius: var(--r-sm);
  cursor: default;
  white-space: nowrap;
}
.uc__btn:hover:not(:disabled) {
  background: var(--fill-1);
}
.uc__btn:disabled {
  opacity: 0.55;
}
.uc__btn--primary {
  color: var(--on-accent, #fff);
  background: var(--accent);
  border-color: transparent;
}
.uc__btn--primary:hover:not(:disabled) {
  background: var(--accent);
  filter: brightness(1.05);
}
@media (max-width: 560px) {
  .uc__foot {
    flex-direction: column;
    align-items: stretch;
  }
  .uc__actions {
    justify-content: flex-end;
    margin-left: 0;
  }
}
</style>
