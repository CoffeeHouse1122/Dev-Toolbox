<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const spriteName = ref("sprite");
const classPrefix = ref("sprite");
const columns = ref(4);
const padding = ref(4);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const canRun = computed(() => input.value.length > 0 && outputDir.value && spriteName.value.trim() && !busy.value);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.generateSprite({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      spriteName: spriteName.value,
      classPrefix: classPrefix.value,
      columns: columns.value,
      padding: padding.value
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>雪碧图生成器</h2>
        <p>批量合并小图标，生成 sprite.png 与定位 CSS</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-layout-grid-line" aria-hidden="true"></i>
        生成雪碧图
      </button>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <DropZone
          v-model="input"
          title="图标图片"
          :multiple="true"
          :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]"
        />
        <OutputPicker v-model="outputDir" />
        <div class="option-grid">
          <label class="field">
            <span>文件名</span>
            <input v-model="spriteName" />
          </label>
          <label class="field">
            <span>CSS 类名前缀</span>
            <input v-model="classPrefix" />
          </label>
          <label class="field">
            <span>列数</span>
            <input v-model.number="columns" type="number" min="1" max="24" />
          </label>
          <label class="field">
            <span>间距</span>
            <input v-model.number="padding" type="number" min="0" max="256" />
          </label>
        </div>
      </section>
      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
