<script setup lang="ts">
import { ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import Slider from "../components/Slider.vue";
import Checkbox from "../components/Checkbox.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const quality = ref(78);
const keepMetadata = ref(false);
const keepOriginalName = ref(false);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

async function run() {
  if (!input.value.length || !outputDir.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.compressImages({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      quality: quality.value,
      keepMetadata: keepMetadata.value,
      keepOriginalName: keepOriginalName.value
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    tool-id="image-compress"
    description="PNG / JPG / WebP / AVIF 单个或批量压缩"
    source-title="源图片"
    source-description="添加待压缩图片，任务将按队列顺序处理"
    settings-title="压缩设置"
    settings-description="所有源图片共用以下质量与输出规则"
    :file-count="input.length"
  >
    <template #source>
      <DropZone
        v-model="input"
        title="拖入源图片"
        action-label="添加图片"
        compact
        append-selection
        :multiple="true"
        :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }]"
      />
    </template>

    <template #settings>
      <div class="option-grid">
        <label class="field">
          <span>质量</span>
          <Slider v-model="quality" :min="1" :max="100" aria-label="质量" />
        </label>
        <Checkbox v-model="keepMetadata" class="check-row" label="保留元数据" />
        <Checkbox v-model="keepOriginalName" class="check-row" label="保持原命名输出" />
      </div>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-stack-line" aria-hidden="true"></i>
      <span>{{ input.length }} 张 · 质量 {{ quality }}</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!input.length || !outputDir || busy" @click="run">
        <i class="ri-image-edit-line" aria-hidden="true"></i>
        压缩 {{ input.length > 1 ? input.length : "" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>
