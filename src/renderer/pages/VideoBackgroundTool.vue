<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult, VideoPackMode } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import Slider from "../components/Slider.vue";
import Checkbox from "../components/Checkbox.vue";

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

const selectedFileName = computed(() => input.value[0]?.split(/[\\/]/).pop() ?? "未选择视频");
const canRun = computed(() => input.value.length === 1 && outputDir.value && !busy.value);
const crfTone = computed(() => {
  if (crf.value <= 20) return "高画质";
  if (crf.value <= 28) return "均衡";
  return "小体积";
});

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
        <h2>视频转化</h2>
        <p>{{ selectedFileName }} · {{ crfTone }} · {{ width || "原始" }}px</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-play-fill" aria-hidden="true"></i>
        开始转换
      </button>
    </div>

    <div class="media-tool-layout">
      <section class="tool-main media-tool-main">
        <DropZone
          v-model="input"
          title="源视频"
          preview="video"
          :multiple="false"
          :filters="[{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] }]"
        />
        <OutputPicker v-model="outputDir" />

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
      </section>

      <aside class="media-tool-side">
        <section class="output-summary">
          <div class="section-title">
            <h2>输出内容</h2>
          </div>
          <div class="output-summary-list">
            <div v-for="item in outputItems" :key="item.name" class="video-output-item" :class="{ active: item.active }">
              <i :class="item.icon" aria-hidden="true"></i>
              <span>{{ item.name }}</span>
              <small>{{ item.detail }}</small>
            </div>
          </div>
        </section>

        <ResultPanel :result="result" :busy="busy" />
      </aside>
    </div>
  </section>
</template>
