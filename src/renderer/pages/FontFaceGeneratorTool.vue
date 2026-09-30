<script setup lang="ts">
import { computed, ref } from "vue";
import SelectMenu from "../components/SelectMenu.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const family = ref("Source Han Sans CN");
const url = ref("./SourceHanSansCN-Regular.woff2");
const format = ref("woff2");
const weight = ref("400");
const style = ref("normal");
const display = ref("swap");

const formatOptions = [
  { label: "WOFF2", value: "woff2" },
  { label: "WOFF", value: "woff" },
  { label: "TTF", value: "truetype" },
  { label: "OTF", value: "opentype" }
];
const displayOptions = [
  { label: "swap", value: "swap" },
  { label: "block", value: "block" },
  { label: "fallback", value: "fallback" },
  { label: "optional", value: "optional" }
];

const css = computed(() => `@font-face {
  font-family: "${family.value}";
  src: url("${url.value}") format("${format.value}");
  font-weight: ${weight.value};
  font-style: ${style.value};
  font-display: ${display.value};
}`);
</script>

<template>
  <TaskFlowLayout
    class="font-face-page"
    title="@font-face CSS 生成器"
    description="按字体文件路径生成可直接使用的 Web 字体声明"
    source-title="字体来源"
    source-description="填写字体族名和资源地址，右侧 CSS 将实时更新"
    settings-title="字体声明"
    settings-description="设置资源格式、加载策略、字重与样式"
    preview-title="CSS 预览"
    preview-description="参数变化会即时同步，无需额外执行"
    file-label="实时更新"
    variant="preview-dominant"
  >
    <template #source>
      <div class="font-source-grid">
        <label class="field">
          <span>font-family</span>
          <input v-model="family" />
        </label>
        <label class="field">
          <span>字体地址</span>
          <input v-model="url" />
        </label>
      </div>
    </template>

    <template #settings>
      <div class="option-grid">
        <div class="field">
          <span>format</span>
          <SelectMenu v-model="format" :options="formatOptions" />
        </div>
        <div class="field">
          <span>font-display</span>
          <SelectMenu v-model="display" :options="displayOptions" />
        </div>
        <label class="field">
          <span>font-weight</span>
          <input v-model="weight" />
        </label>
        <label class="field">
          <span>font-style</span>
          <input v-model="style" />
        </label>
      </div>
    </template>

    <template #preview-actions>
      <span class="status-pill success">已同步</span>
    </template>

    <template #preview>
      <textarea
        class="tool-textarea code-output font-face-code"
        aria-label="生成的 @font-face CSS"
        readonly
        :value="css"
      ></textarea>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.font-source-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 12px;
}

.field,
.field input,
.option-grid :deep(.select-menu) {
  min-width: 0;
}

.font-face-code {
  width: 100%;
  height: 100%;
  min-height: 240px;
  resize: none;
}

@media (min-width: 1121px) and (min-height: 721px) {
  .font-face-page :deep(.task-flow-workbench) {
    grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
  }

  .font-face-page :deep(.task-flow-preview-content) {
    grid-template-rows: minmax(0, 1fr);
    align-content: stretch;
  }

  .font-face-code {
    min-height: 0;
  }
}

@media (max-width: 900px) {
  .font-source-grid {
    grid-template-columns: 1fr;
  }
}
</style>
