<script setup lang="ts">
import { ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const fileName = ref("image.png");
const base64Text = ref("");
const result = ref<ConversionResult | null>(null);
const busy = ref(false);

async function encodeImage() {
  if (!input.value[0]) return;
  busy.value = true;
  const encoded = await window.devToolbox.imageToBase64(input.value[0]);
  base64Text.value = encoded.dataUrl;
  result.value = { id: "base64-preview", status: "success", files: [], outputPath: "", logs: [`MIME: ${encoded.mimeType}`] };
  busy.value = false;
}

async function decodeImage() {
  if (!base64Text.value || !outputDir.value) return;
  busy.value = true;
  result.value = await window.devToolbox.base64ToImage(base64Text.value, outputDir.value, fileName.value);
  busy.value = false;
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>Base64 图片转换</h2>
        <p>图片转 Data URL，或从 Base64 还原图片文件</p>
      </div>
      <div class="header-actions">
        <button type="button" class="secondary-button" :disabled="!input.length || busy" @click="encodeImage">
          <i class="ri-code-line" aria-hidden="true"></i>
          编码
        </button>
        <button type="button" class="primary-button" :disabled="!base64Text || !outputDir || busy" @click="decodeImage">
          <i class="ri-image-add-line" aria-hidden="true"></i>
          还原
        </button>
      </div>
    </div>

    <div class="media-tool-layout">
      <section class="tool-main media-tool-main">
        <DropZone v-model="input" title="源图片" preview="image" :multiple="false" :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg'] }]" />
        <textarea v-model="base64Text" class="tool-textarea" placeholder="Base64 或 Data URL"></textarea>
        <OutputPicker v-model="outputDir" />
        <label class="field">
          <span>文件名</span>
          <input v-model="fileName" />
        </label>
      </section>
      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>

