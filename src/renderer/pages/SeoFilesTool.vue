<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import Checkbox from "../components/Checkbox.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const outputDir = ref("");
const siteUrl = ref("https://example.com");
const pages = ref("/\n/about\n/contact");
const disallow = ref("/admin\n/private");
const changefreq = ref("weekly");
const priority = ref("0.8");
const includeRobots = ref(true);
const includeSitemap = ref(true);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const canRun = computed(() => outputDir.value && siteUrl.value.trim() && (includeRobots.value || includeSitemap.value) && !busy.value);
const changefreqOptions = ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"].map((value) => ({ label: value, value }));
const outputCount = computed(() => Number(includeRobots.value) + Number(includeSitemap.value));
const pageCount = computed(() => pages.value.split(/\r?\n/).filter((item) => item.trim()).length);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.generateSeoFiles({
      outputDir: outputDir.value,
      siteUrl: siteUrl.value,
      disallow: disallow.value,
      pages: pages.value,
      changefreq: changefreq.value,
      priority: priority.value,
      includeRobots: includeRobots.value,
      includeSitemap: includeSitemap.value
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    class="seo-files-page"
    tool-id="seo-files"
    description="生成站点爬虫策略与搜索引擎索引清单"
    source-title="站点信息"
    source-description="填写网站根地址，页面路径将基于该地址生成索引"
    settings-title="索引与爬虫设置"
    settings-description="选择输出文件，并配置页面索引和禁止抓取路径"
    :file-label="`${outputCount} 个输出文件`"
  >
    <template #source>
      <div class="seo-source-row">
        <label class="field">
          <span>站点 URL</span>
          <input v-model="siteUrl" />
        </label>
      </div>
    </template>

    <template #settings>
      <div class="option-grid seo-options">
        <Checkbox v-model="includeRobots" class="check-row" label="robots.txt" />
        <Checkbox v-model="includeSitemap" class="check-row" label="sitemap.xml" />
        <div class="field">
          <span>changefreq</span>
          <SelectMenu v-model="changefreq" :options="changefreqOptions" />
        </div>
        <label class="field">
          <span>priority</span>
          <input v-model="priority" />
        </label>
        <label class="field seo-path-field">
          <span>Sitemap 页面路径</span>
          <textarea v-model="pages" class="tool-textarea compact seo-paths-textarea"></textarea>
        </label>
        <label class="field seo-path-field">
          <span>Robots Disallow 路径</span>
          <textarea v-model="disallow" class="tool-textarea compact seo-paths-textarea"></textarea>
        </label>
      </div>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="生成结果" empty-text="生成后可在此打开 SEO 文件" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-road-map-line" aria-hidden="true"></i>
      <span>{{ outputCount }} 个文件 · {{ pageCount }} 个页面路径</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-road-map-line" aria-hidden="true"></i>
        {{ busy ? "生成中…" : "生成 SEO 文件" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.seo-source-row {
  min-width: 0;
}

.field, .field input, .seo-options :deep(.select-menu) { min-width: 0; }
.seo-path-field { grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
.seo-paths-textarea {
  display: block;
  min-height: 110px;
  resize: vertical;
}
.seo-files-page :deep(.result-panel.paged .file-list) { grid-template-columns: minmax(0, 1fr); }

@media (min-width: 1121px) and (min-height: 721px) {
  .seo-files-page :deep(.task-flow-source-panel) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    align-items: center;
    gap: 24px;
  }
  .seo-files-page :deep(.task-flow-source-panel > .panel-heading) { margin-bottom: 0; }
  .seo-files-page :deep(.task-flow-workbench) { grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr); }
  .seo-files-page :deep(.task-flow-settings-content) { grid-template-rows: minmax(0, 1fr); align-content: stretch; }
  .seo-options { grid-template-rows: auto auto minmax(0, 1fr); }
  .seo-paths-textarea { height: 100%; resize: none; }
  .seo-options :deep(.select-popover) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 720px) {
  .seo-path-field { grid-column: 1 / -1; }
}
</style>
