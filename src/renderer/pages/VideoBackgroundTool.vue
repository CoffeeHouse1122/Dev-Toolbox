<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult, VideoPackMode } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import Slider from "../components/Slider.vue";
import Checkbox from "../components/Checkbox.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";
import { batchChildOutputDir, runConversionBatch } from "../utils/batchConversion";

const input = ref<string[]>([]);
const outputDir = ref("");
const mode = ref<VideoPackMode>("background-pack");
const width = ref(1280);
const crf = ref(24);
const makePoster = ref(true);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

const modeOptions = [
  { label: "视频完整包", value: "background-pack", icon: "ri-layout-masonry-line" },
  { label: "仅 MP4", value: "mp4", icon: "ri-file-video-line" },
  { label: "仅 WebM", value: "webm", icon: "ri-film-line" },
  { label: "仅 HLS", value: "hls", icon: "ri-route-line" }
];

const outputItems = computed(() => [
  { name: "MP4", detail: "background.mp4", icon: "ri-file-video-line", active: mode.value === "background-pack" || mode.value === "mp4" },
  { name: "WebM", detail: "background.webm", icon: "ri-film-line", active: mode.value === "background-pack" || mode.value === "webm" },
  { name: "HLS", detail: "index.m3u8 + .ts", icon: "ri-route-line", active: mode.value === "background-pack" || mode.value === "hls" },
  { name: "封面", detail: "poster.png", icon: "ri-image-line", active: makePoster.value },
  { name: "片段", detail: "HTML snippet", icon: "ri-code-s-slash-line", active: mode.value === "background-pack" }
]);

const selectedFileName = computed(() => {
  if (input.value.length > 1) return `已选择 ${input.value.length} 个视频`;
  return input.value[0]?.split(/[\\/]/).pop() ?? "未选择视频";
});
const canRun = computed(() => input.value.length > 0 && Boolean(outputDir.value) && !busy.value);
const crfTone = computed(() => {
  if (crf.value <= 20) return "高画质";
  if (crf.value <= 28) return "均衡";
  return "小体积";
});

async function run() {
  if (!canRun.value) return;
  const inputPaths = [...input.value];
  const destination = outputDir.value;
  const options = {
    mode: mode.value,
    width: width.value || undefined,
    crf: crf.value,
    makePoster: makePoster.value
  };
  busy.value = true;
  try {
    result.value = await runConversionBatch(inputPaths, destination, (inputPath, index) =>
      window.devToolbox.convertVideoBackground({
        inputPath,
        outputDir: batchChildOutputDir(destination, inputPath, index, inputPaths.length),
        ...options
      })
    );
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    title="视频转化"
    :description="`${selectedFileName} · ${crfTone} · ${width || '原始'}px`"
    source-title="源视频"
    source-description="可继续添加视频，任务将按队列顺序生成资源包"
    settings-title="转化设置"
    settings-description="队列中的视频共用以下输出预设"
    preview-title="输出内容"
    preview-description="根据当前预设确认每个视频将生成的资源"
    :file-count="input.length"
  >
    <template #source>
        <DropZone
          v-model="input"
          title="拖入视频文件"
          action-label="添加视频"
          compact
          append-selection
          :multiple="true"
          :filters="[{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] }]"
        />
    </template>

    <template #settings>
        <div class="video-form-grid">
          <div class="field span-2">
            <span>输出预设</span>
            <SelectMenu v-model="mode" :options="modeOptions" />
          </div>
          <label class="field">
            <span>宽度</span>
            <input v-model.number="width" type="number" min="320" step="2" />
          </label>
          <label class="field">
            <span>CRF</span>
            <Slider v-model="crf" :min="12" :max="40" aria-label="CRF" />
          </label>
          <Checkbox v-model="makePoster" class="check-row span-2 video-check-row" label="生成封面 poster.png" />
        </div>
    </template>

    <template #preview>
      <div class="output-summary-list">
        <div v-for="item in outputItems" :key="item.name" class="video-output-item" :class="{ active: item.active }">
          <i :class="item.icon" aria-hidden="true"></i>
          <span>{{ item.name }}</span>
          <small>{{ item.detail }}</small>
        </div>
      </div>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="转化结果" empty-text="转化后可在此打开输出资源" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-stack-line" aria-hidden="true"></i>
      <span>{{ input.length }} 个视频 · {{ crfTone }} · {{ width || "原始" }}px</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-play-fill" aria-hidden="true"></i>
        {{ input.length > 1 ? `批量转换（${input.length}）` : "开始转换" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>
