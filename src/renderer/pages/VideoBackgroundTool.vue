<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult, VideoPackMode } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import OptionGrid from "../components/OptionGrid.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const mode = ref<VideoPackMode>("background-pack");
const width = ref(1280);
const crf = ref(24);
const makePoster = ref(true);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const modeOptions = [
  { label: "背景视频完整包", value: "background-pack", icon: "ri-layout-masonry-line" },
  { label: "仅 MP4", value: "mp4", icon: "ri-file-video-line" },
  { label: "仅 WebM", value: "webm", icon: "ri-film-line" },
  { label: "仅 HLS", value: "hls", icon: "ri-route-line" }
];

const canRun = computed(() => input.value.length === 1 && outputDir.value && !busy.value);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  result.value = await window.devToolbox.convertVideoBackground({
    inputPath: input.value[0],
    outputDir: outputDir.value,
    mode: mode.value,
    width: width.value || undefined,
    crf: crf.value,
    makePoster: makePoster.value
  });
  busy.value = false;
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>背景视频兼容包</h2>
        <p>生成 MP4、WebM、HLS 和 TS 切片</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-play-fill" aria-hidden="true"></i>
        开始转换
      </button>
    </div>

    <div class="tool-layout">
      <div class="tool-main">
        <DropZone
          v-model="input"
          title="源视频"
          :multiple="false"
          :filters="[{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] }]"
        />
        <OutputPicker v-model="outputDir" />

        <OptionGrid>
          <label class="field">
            <span>预设</span>
            <SelectMenu v-model="mode" :options="modeOptions" />
          </label>
          <label class="field">
            <span>宽度</span>
            <input v-model.number="width" type="number" min="320" step="2" />
          </label>
          <label class="field">
            <span>CRF</span>
            <input v-model.number="crf" type="range" min="12" max="40" />
            <strong>{{ crf }}</strong>
          </label>
          <label class="check-row">
            <input v-model="makePoster" type="checkbox" />
            <span>生成封面</span>
          </label>
        </OptionGrid>
      </div>

      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
