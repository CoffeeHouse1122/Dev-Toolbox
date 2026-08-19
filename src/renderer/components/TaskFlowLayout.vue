<script setup lang="ts">
import { computed, useSlots } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    description: string;
    sourceTitle: string;
    sourceDescription?: string;
    settingsTitle?: string;
    settingsDescription?: string;
    previewTitle?: string;
    previewDescription?: string;
    fileCount?: number;
    fileLabel?: string;
    variant?: "standard" | "preview-dominant" | "analysis";
  }>(),
  {
    sourceDescription: "可一次添加多个文件，任务将按队列顺序处理",
    settingsTitle: "处理设置",
    settingsDescription: "本次任务中的文件共用以下参数",
    previewTitle: "任务预览",
    previewDescription: "执行前确认处理内容，执行后查看输出状态",
    fileCount: 0,
    fileLabel: "",
    variant: "standard"
  }
);

const slots = useSlots();
const hasSettings = computed(() => Boolean(slots.settings));
const hasPreview = computed(() => Boolean(slots.preview));
const hasResult = computed(() => Boolean(slots.result));
const hasActionBar = computed(() => Boolean(slots.destination || slots.summary || slots.actions));
const countLabel = computed(() => props.fileLabel || `${props.fileCount} 个文件`);
</script>

<template>
  <section class="tool-page task-flow-page" :class="`task-flow-${variant}`">
    <header class="tool-header task-flow-header">
      <div>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
    </header>

    <div
      class="task-flow-layout"
      :class="{
        'has-preview': hasPreview,
        'without-result': !hasResult,
        'without-settings': !hasSettings,
        'without-destination': !$slots.destination,
        'without-action-bar': !hasActionBar
      }"
    >
      <section class="task-flow-panel task-flow-source-panel">
        <div class="panel-heading">
          <div>
            <h3>{{ sourceTitle }}</h3>
            <p>{{ sourceDescription }}</p>
          </div>
          <div class="task-flow-heading-actions">
            <slot name="source-actions"></slot>
            <span class="status-pill">{{ countLabel }}</span>
          </div>
        </div>
        <slot name="source"></slot>
      </section>

      <div class="task-flow-workbench">
        <section v-if="hasSettings" class="task-flow-panel task-flow-settings-panel">
          <div class="panel-heading">
            <div>
              <h3>{{ settingsTitle }}</h3>
              <p>{{ settingsDescription }}</p>
            </div>
          </div>
          <div class="task-flow-settings-content">
            <slot name="settings"></slot>
          </div>
        </section>

        <div class="task-flow-output-column">
          <section v-if="hasPreview" class="task-flow-panel task-flow-preview-panel">
            <div class="panel-heading">
              <div>
                <h3>{{ previewTitle }}</h3>
                <p>{{ previewDescription }}</p>
              </div>
              <slot name="preview-actions"></slot>
            </div>
            <div class="task-flow-preview-content">
              <slot name="preview"></slot>
            </div>
          </section>

          <div v-if="hasResult" class="task-flow-result-slot">
            <slot name="result"></slot>
          </div>
        </div>
      </div>

      <footer v-if="hasActionBar" class="task-flow-action-bar">
        <div v-if="$slots.destination" class="task-flow-destination">
          <slot name="destination"></slot>
        </div>
        <div v-if="$slots.summary" class="task-flow-summary" aria-live="polite">
          <slot name="summary"></slot>
        </div>
        <div v-if="$slots.actions" class="task-flow-actions">
          <slot name="actions"></slot>
        </div>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.task-flow-page {
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  height: calc(100vh - var(--titlebar-height) - 72px);
  min-height: 0;
  overflow: hidden;
}

.task-flow-header {
  min-height: 0;
}

.task-flow-layout {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 14px;
  min-height: 0;
}

.task-flow-layout.without-action-bar {
  grid-template-rows: auto minmax(0, 1fr);
}

.task-flow-panel,
.task-flow-action-bar {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.task-flow-panel {
  min-width: 0;
  padding: 14px;
}

.task-flow-panel > .panel-heading {
  margin-bottom: 12px;
}

.task-flow-heading-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-flow-workbench {
  display: grid;
  grid-template-columns: minmax(320px, 0.78fr) minmax(420px, 1fr);
  gap: 14px;
  align-items: stretch;
  min-height: 0;
}

.task-flow-preview-dominant .task-flow-workbench {
  grid-template-columns: minmax(300px, 0.64fr) minmax(500px, 1.36fr);
}

.task-flow-analysis .task-flow-workbench {
  grid-template-columns: minmax(420px, 1.08fr) minmax(380px, 0.92fr);
}

.task-flow-layout.without-settings .task-flow-workbench {
  grid-template-columns: 1fr;
}

.task-flow-settings-panel,
.task-flow-preview-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}

.task-flow-settings-content,
.task-flow-preview-content {
  display: grid;
  gap: 14px;
  align-content: start;
  min-height: 0;
  overflow: auto;
}

.task-flow-output-column {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  gap: 14px;
  min-width: 0;
  min-height: 0;
}

.task-flow-layout.has-preview .task-flow-output-column {
  grid-template-rows: minmax(0, 1.35fr) minmax(0, 0.8fr);
}

.task-flow-layout.has-preview.without-result .task-flow-output-column {
  grid-template-rows: minmax(0, 1fr);
}

.task-flow-preview-dominant .task-flow-layout.has-preview .task-flow-output-column {
  grid-template-rows: minmax(0, 1.75fr) minmax(0, 0.68fr);
}

.task-flow-preview-dominant .task-flow-layout.has-preview.without-result .task-flow-output-column {
  grid-template-rows: minmax(0, 1fr);
}

.task-flow-result-slot {
  min-width: 0;
  min-height: 0;
}

.task-flow-result-slot :deep(.result-panel) {
  height: 100%;
  min-height: 0;
}

.task-flow-result-slot :deep(.result-panel > .empty-state) {
  min-height: 0;
}

.task-flow-result-slot :deep(.result-panel .result-content) {
  min-height: 0;
  overflow: auto;
}

.task-flow-action-bar {
  position: relative;
  z-index: 8;
  display: grid;
  grid-template-columns: minmax(300px, 1fr) auto auto;
  gap: 16px;
  align-items: end;
  padding: 12px 14px;
}

.task-flow-layout.without-destination .task-flow-action-bar {
  grid-template-columns: minmax(0, 1fr) auto;
}

.task-flow-destination {
  min-width: 0;
}

.task-flow-summary {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0 4px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.task-flow-summary :deep(i) {
  color: var(--accent-strong);
  font-size: 15px;
}

.task-flow-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.task-flow-actions :deep(.primary-button) {
  min-width: 132px;
}

@media (max-width: 1120px), (max-height: 720px) {
  .task-flow-page {
    grid-template-rows: none;
    height: auto;
    overflow: visible;
  }

  .task-flow-layout,
  .task-flow-layout.without-action-bar {
    grid-template-rows: none;
    min-height: auto;
  }

  .task-flow-workbench,
  .task-flow-preview-dominant .task-flow-workbench,
  .task-flow-analysis .task-flow-workbench,
  .task-flow-layout.without-settings .task-flow-workbench {
    grid-template-columns: 1fr;
  }

  .task-flow-settings-panel,
  .task-flow-preview-panel,
  .task-flow-output-column,
  .task-flow-layout.has-preview .task-flow-output-column,
  .task-flow-preview-dominant .task-flow-layout.has-preview .task-flow-output-column {
    grid-template-rows: none;
    height: auto;
    min-height: auto;
    overflow: visible;
  }

  .task-flow-settings-content,
  .task-flow-preview-content {
    overflow: visible;
  }

  .task-flow-action-bar {
    position: sticky;
    bottom: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    box-shadow: 0 -8px 24px color-mix(in srgb, var(--bg) 72%, transparent);
  }

  .task-flow-destination {
    grid-column: 1 / -1;
  }
}

@media (max-width: 720px) {
  .task-flow-source-panel > .panel-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .task-flow-heading-actions {
    justify-content: space-between;
  }

  .task-flow-action-bar,
  .task-flow-layout.without-destination .task-flow-action-bar {
    grid-template-columns: 1fr;
  }

  .task-flow-destination,
  .task-flow-summary,
  .task-flow-actions {
    grid-column: 1;
    width: 100%;
  }

  .task-flow-summary,
  .task-flow-actions {
    justify-content: center;
  }

  .task-flow-actions :deep(button) {
    flex: 1;
  }
}
</style>
