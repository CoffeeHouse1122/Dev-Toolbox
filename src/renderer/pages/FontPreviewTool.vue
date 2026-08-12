<script setup lang="ts">
import { computed, ref, watch } from "vue";
import DropZone from "../components/DropZone.vue";
import Slider from "../components/Slider.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref<string[]>([]);
const sample = ref("Dev Toolbox 字体预览：前端资源工具箱 1234567890");
const size = ref(42);
const activePath = ref("");
const compareMode = ref(false);

const fontEntries = computed(() =>
  input.value.map((path, index) => ({
    path,
    name: path.split(/[\\/]/).pop() || path,
    family: `PreviewFont-${index}`,
    url: `devtoolbox-file://preview/${encodeURIComponent(path)}`
  }))
);
const activeFont = computed(() => fontEntries.value.find((item) => item.path === activePath.value) || fontEntries.value[0]);
const styleText = computed(() =>
  fontEntries.value
    .map((font) => `@font-face { font-family: "${font.family}"; src: url("${font.url}"); font-display: swap; }`)
    .join("\n")
);

watch(
  input,
  (paths) => {
    if (!paths.includes(activePath.value)) activePath.value = paths[0] || "";
    if (paths.length < 2) compareMode.value = false;
  },
  { immediate: true }
);
</script>

<template>
  <TaskFlowLayout
    title="字体预览器"
    description="加载本地字体，快速检查中文、数字和英文效果"
    source-title="源字体"
    source-description="可持续追加多个字体，并在预览区切换或并排比较"
    settings-title="预览设置"
    settings-description="选择当前字体、预览文本与字号"
    preview-title="字体预览"
    preview-description="在单字体预览与多字体对比之间切换"
    :file-count="input.length"
    variant="preview-dominant"
  >
    <template #source>
      <component :is="'style'">{{ styleText }}</component>
      <DropZone
        v-model="input"
        title="拖入字体文件"
        action-label="添加字体"
        compact
        append-selection
        :multiple="true"
        :filters="[{ name: '字体', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]"
      />
    </template>

    <template #settings>
      <div class="font-preview-settings">
        <div v-if="fontEntries.length" class="field">
          <span>当前字体</span>
          <div class="font-choice-list" role="list" aria-label="选择当前预览字体">
            <button
              v-for="font in fontEntries"
              :key="font.path"
              type="button"
              class="font-choice"
              :class="{ selected: font.path === activeFont?.path }"
              :title="font.path"
              @click="activePath = font.path"
            >
              <i class="ri-font-size-2" aria-hidden="true"></i>
              <span>{{ font.name }}</span>
            </button>
          </div>
        </div>
        <label class="field">
          <span>预览文本</span>
          <textarea v-model="sample" class="tool-textarea compact"></textarea>
        </label>
        <label class="field">
          <span>字号</span>
          <Slider v-model="size" :min="14" :max="96" unit="px" aria-label="字号" />
        </label>
      </div>
    </template>

    <template #preview-actions>
      <div class="font-preview-actions" role="group" aria-label="预览模式">
        <button
          type="button"
          class="secondary-button"
          :class="{ selected: !compareMode }"
          :aria-pressed="!compareMode"
          :disabled="!input.length"
          @click="compareMode = false"
        >
          单字体
        </button>
        <button
          type="button"
          class="secondary-button"
          :class="{ selected: compareMode }"
          :aria-pressed="compareMode"
          :disabled="input.length < 2"
          @click="compareMode = true"
        >
          对比
        </button>
      </div>
    </template>

    <template #preview>
      <div v-if="!input.length" class="font-preview-empty" role="status">
        <i class="ri-font-size-2" aria-hidden="true"></i>
        <span>添加字体后显示实时预览</span>
      </div>
      <div
        v-else-if="!compareMode"
        class="font-preview-box font-preview-single"
        :style="{ fontFamily: activeFont?.family, fontSize: `${size}px` }"
      >
        {{ sample }}
      </div>
      <div v-else class="font-comparison-list">
        <article v-for="font in fontEntries" :key="font.path" class="font-comparison-item">
          <header>
            <strong>{{ font.name }}</strong>
            <button type="button" class="secondary-button" @click="activePath = font.path; compareMode = false">设为当前</button>
          </header>
          <div class="font-preview-box" :style="{ fontFamily: font.family, fontSize: `${size}px` }">
            {{ sample }}
          </div>
        </article>
      </div>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.font-preview-settings {
  display: grid;
  gap: 14px;
  min-height: 0;
}

.font-choice-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
  max-height: 144px;
  overflow: auto;
}

.font-choice {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 38px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text);
  background: var(--surface);
  cursor: pointer;
}

.font-choice span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-choice:hover,
.font-choice.selected {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent);
}

.font-preview-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.font-preview-actions .secondary-button {
  min-height: 28px;
  padding: 3px 9px;
}

.font-preview-actions .secondary-button.selected {
  border-color: var(--accent);
  color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}

.font-comparison-list {
  display: grid;
  gap: 12px;
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.font-comparison-item {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 94%, var(--accent) 6%);
}

.font-comparison-item header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.font-comparison-item strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-comparison-item .font-preview-box {
  min-height: 132px;
}

.font-preview-box.font-preview-single {
  height: 100%;
  min-height: 0;
  padding: 18px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.font-preview-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  height: 100%;
  min-height: 240px;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  color: var(--muted);
  background: var(--surface-subtle);
}

.font-preview-empty i {
  color: var(--accent-strong);
  font-size: 28px;
}

@media (max-width: 1120px), (max-height: 720px) {
  .font-preview-box.font-preview-single,
  .font-preview-empty {
    min-height: 280px;
  }

  .font-comparison-list {
    max-height: none;
  }
}
</style>
