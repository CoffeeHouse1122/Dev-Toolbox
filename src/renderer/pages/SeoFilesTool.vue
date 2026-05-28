<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import Checkbox from "../components/Checkbox.vue";

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
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>robots.txt / sitemap.xml</h2>
        <p>生成站点爬虫策略与搜索引擎索引清单</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-road-map-line" aria-hidden="true"></i>
        生成 SEO 文件
      </button>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <OutputPicker v-model="outputDir" />
        <label class="field">
          <span>站点 URL</span>
          <input v-model="siteUrl" />
        </label>
        <div class="option-grid">
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
        </div>
        <label class="field">
          <span>Sitemap 页面路径</span>
          <textarea v-model="pages" class="tool-textarea compact"></textarea>
        </label>
        <label class="field">
          <span>Robots Disallow 路径</span>
          <textarea v-model="disallow" class="tool-textarea compact"></textarea>
        </label>
      </section>
      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
