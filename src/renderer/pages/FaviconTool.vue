<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import OptionGrid from "../components/OptionGrid.vue";
import ResultPanel from "../components/ResultPanel.vue";
import Checkbox from "../components/Checkbox.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const includePng = ref(true);
const includeManifest = ref(true);
const sizes = ref([256]);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

const canRun = computed(() => input.value.length === 1 && outputDir.value && sizes.value.length > 0 && !busy.value);
const availableSizes = [16, 32, 48, 64, 128, 180, 192, 256, 512];

function toggleSize(size: number) {
  sizes.value = sizes.value.includes(size) ? sizes.value.filter((item) => item !== size) : [...sizes.value, size];
}

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  result.value = await window.devToolbox.convertFavicon({
    inputPath: input.value[0],
    outputDir: outputDir.value,
    sizes: [...sizes.value],
    includePng: includePng.value,
    includeManifest: includeManifest.value
  });
  busy.value = false;
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>Favicon 图标包</h2>
        <p>生成 ICO、PNG 图标和 manifest</p>
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
          title="源图片"
          preview="image"
          :multiple="false"
          :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]"
        />
        <OutputPicker v-model="outputDir" />

        <OptionGrid>
          <label class="field span-2">
            <span>尺寸</span>
            <div class="size-grid">
              <button
                v-for="size in availableSizes"
                :key="size"
                type="button"
                class="toggle-chip"
                :class="{ selected: sizes.includes(size) }"
                @click="toggleSize(size)"
              >
                {{ size }}
              </button>
            </div>
          </label>
          <Checkbox v-model="includePng" class="check-row" label="生成 PNG 文件" />
          <Checkbox v-model="includeManifest" class="check-row" label="生成 Manifest" />
        </OptionGrid>
      </div>

      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
