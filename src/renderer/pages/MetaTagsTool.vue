<script setup lang="ts">
import { computed, ref } from "vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

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
  <TaskFlowLayout
    title="HTML Meta 标签生成器"
    description="生成 SEO、Open Graph 与 Twitter Card 标签"
    source-title="页面摘要"
    source-description="编辑核心标题和描述，右侧代码会即时同步"
    settings-title="页面与社交信息"
    settings-description="补充页面地址、图片、语言区域和社交账号"
    file-label="16 个标签"
  >
    <template #source>
      <div class="meta-source-grid">
        <label class="field">
          <span>标题</span>
          <input v-model="title" />
        </label>
        <label class="field">
          <span>描述</span>
          <textarea v-model="description" class="tool-textarea compact meta-description"></textarea>
        </label>
      </div>
    </template>

    <template #settings>
      <div class="option-grid">
        <label class="field">
          <span>站点名称</span>
          <input v-model="siteName" />
        </label>
        <label class="field">
          <span>URL</span>
          <input v-model="url" />
        </label>
        <label class="field span-2">
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
    </template>

    <template #result>
      <aside class="result-panel meta-result-panel">
        <div class="section-title">
          <h2>Meta HTML</h2>
          <span class="status-pill success">READY</span>
        </div>
        <textarea class="tool-textarea code-output" readonly :value="html"></textarea>
      </aside>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.meta-source-grid {
  display: grid;
  grid-template-columns: minmax(240px, 0.72fr) minmax(320px, 1.28fr);
  gap: 14px;
  align-items: end;
}

.meta-description {
  min-height: 34px;
  height: 34px;
  resize: none;
}

.meta-result-panel {
  min-height: 0;
}

.meta-result-panel .code-output {
  height: 100%;
  min-height: 0;
  resize: none;
}

@media (max-width: 720px) {
  .meta-source-grid {
    grid-template-columns: 1fr;
  }

  .meta-description {
    min-height: 72px;
    height: auto;
    resize: vertical;
  }
}
</style>
