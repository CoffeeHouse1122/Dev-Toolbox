<script setup lang="ts">
import { computed, ref } from "vue";
import DropZone from "../components/DropZone.vue";
import Slider from "../components/Slider.vue";

const input = ref<string[]>([]);
const sample = ref("Dev Toolbox 字体预览：前端资源工具箱 1234567890");
const size = ref(42);

const fontUrl = computed(() => (input.value[0] ? `devtoolbox-file://preview/${encodeURIComponent(input.value[0])}` : ""));
const styleText = computed(() =>
  fontUrl.value
    ? `@font-face { font-family: "PreviewFont"; src: url("${fontUrl.value}"); font-display: swap; }`
    : ""
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
          :multiple="false"
          :filters="[{ name: '字体', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]"
        />
        <div class="option-grid">
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
          <h2>预览</h2>
          <span class="status-pill">{{ input.length ? "LOADED" : "EMPTY" }}</span>
        </div>
        <div class="font-preview-box" :style="{ fontFamily: input.length ? 'PreviewFont' : undefined, fontSize: `${size}px` }">
          {{ sample }}
        </div>
      </aside>
    </div>
  </section>
</template>
