<script setup lang="ts">
import { computed, ref } from "vue";

const title = ref("Dev Toolbox");
const description = ref("面向前端开发的本地资源工具箱");
const url = ref("https://example.com");
const image = ref("https://example.com/og.png");
const siteName = ref("Dev Toolbox");
const locale = ref("zh_CN");
const twitter = ref("@example");

function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

const html = computed(() => `<title>${esc(title.value)}</title>
<meta name="description" content="${esc(description.value)}" />
<link rel="canonical" href="${esc(url.value)}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(title.value)}" />
<meta property="og:description" content="${esc(description.value)}" />
<meta property="og:url" content="${esc(url.value)}" />
<meta property="og:image" content="${esc(image.value)}" />
<meta property="og:site_name" content="${esc(siteName.value)}" />
<meta property="og:locale" content="${esc(locale.value)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title.value)}" />
<meta name="twitter:description" content="${esc(description.value)}" />
<meta name="twitter:image" content="${esc(image.value)}" />
<meta name="twitter:site" content="${esc(twitter.value)}" />`);
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>HTML Meta 标签生成器</h2>
        <p>生成 SEO、Open Graph 与 Twitter Card 标签</p>
      </div>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <div class="option-grid">
          <label class="field">
            <span>标题</span>
            <input v-model="title" />
          </label>
          <label class="field">
            <span>站点名称</span>
            <input v-model="siteName" />
          </label>
          <label class="field span-2">
            <span>描述</span>
            <textarea v-model="description" class="tool-textarea compact"></textarea>
          </label>
          <label class="field">
            <span>URL</span>
            <input v-model="url" />
          </label>
          <label class="field">
            <span>OG 图片</span>
            <input v-model="image" />
          </label>
          <label class="field">
            <span>Locale</span>
            <input v-model="locale" />
          </label>
          <label class="field">
            <span>Twitter</span>
            <input v-model="twitter" />
          </label>
        </div>
      </section>
      <aside class="result-panel">
        <div class="section-title">
          <h2>Meta HTML</h2>
          <span class="status-pill success">READY</span>
        </div>
        <textarea class="tool-textarea code-output" readonly :value="html"></textarea>
      </aside>
    </div>
  </section>
</template>
