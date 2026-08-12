<script setup lang="ts">
import { computed, ref, watch } from "vue";
import DropZone from "../components/DropZone.vue";
import Slider from "../components/Slider.vue";

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
  <section class="tool-page">
    <component :is="'style'">{{ styleText }}</component>
    <div class="tool-header">
      <div>
        <h2>字体预览器</h2>
        <p>加载本地字体，快速检查中文、数字和英文效果</p>
      </div>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <DropZone
          v-model="input"
          title="字体文件"
          :multiple="true"
          :filters="[{ name: '字体', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]"
        />
        <div class="option-grid">
          <div v-if="fontEntries.length" class="field span-2">
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
          <label class="field span-2">
            <span>预览文本</span>
            <textarea v-model="sample" class="tool-textarea compact"></textarea>
          </label>
          <label class="field span-2">
            <span>字号</span>
            <Slider v-model="size" :min="14" :max="96" unit="px" aria-label="字号" />
          </label>
        </div>
      </section>

      <aside class="result-panel font-preview-panel">
        <div class="section-title">
          <h2>{{ compareMode ? "字体对比" : "预览" }}</h2>
          <div class="font-preview-actions">
            <button
              type="button"
              class="secondary-button"
              :class="{ selected: !compareMode }"
              :disabled="!input.length"
              @click="compareMode = false"
            >
              单字体
            </button>
            <button
              type="button"
              class="secondary-button"
              :class="{ selected: compareMode }"
              :disabled="input.length < 2"
              @click="compareMode = true"
            >
              对比
            </button>
            <span class="status-pill">{{ input.length ? `${input.length} LOADED` : "EMPTY" }}</span>
          </div>
        </div>
        <div
          v-if="!compareMode"
          class="font-preview-box"
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
      </aside>
    </div>
  </section>
</template>

<style scoped>
.font-choice-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
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
  max-height: min(68vh, 760px);
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
</style>
