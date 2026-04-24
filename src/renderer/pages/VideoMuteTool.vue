<script setup lang="ts">
import { ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

async function run() {
  if (!input.value.length || !outputDir.value) return;
  busy.value = true;
  result.value = await window.devToolbox.removeVideoAudio({ inputPaths: [...input.value], outputDir: outputDir.value });
  busy.value = false;
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>视频去音频</h2>
        <p>批量移除音轨，保留视频画面</p>
      </div>
      <button type="button" class="primary-button" :disabled="!input.length || !outputDir || busy" @click="run">
        <i class="ri-volume-mute-line" aria-hidden="true"></i>
        去除音频
      </button>
    </div>
    <div class="tool-layout">
      <section class="tool-main">
        <DropZone v-model="input" title="源视频" :filters="[{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] }]" />
        <OutputPicker v-model="outputDir" />
      </section>
      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>

