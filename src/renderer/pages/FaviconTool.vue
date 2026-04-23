<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import OptionGrid from "../components/OptionGrid.vue";
import ResultPanel from "../components/ResultPanel.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const includePng = ref(true);
const includeManifest = ref(true);
const sizes = ref([16, 32, 48, 64, 128, 256]);
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
    sizes: sizes.value,
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
        <h2>Favicon Package</h2>
        <p>ICO, PNG icons, manifest</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-play-fill" aria-hidden="true"></i>
        Convert
      </button>
    </div>

    <div class="tool-layout">
      <div class="tool-main">
        <DropZone
          v-model="input"
          title="Source image"
          :multiple="false"
          :filters="[{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]"
        />
        <OutputPicker v-model="outputDir" />

        <OptionGrid>
          <label class="field span-2">
            <span>Sizes</span>
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
          <label class="check-row">
            <input v-model="includePng" type="checkbox" />
            <span>PNG files</span>
          </label>
          <label class="check-row">
            <input v-model="includeManifest" type="checkbox" />
            <span>Manifest</span>
          </label>
        </OptionGrid>
      </div>

      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
