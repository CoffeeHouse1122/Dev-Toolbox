<script setup lang="ts">
import { computed, ref } from "vue";

const prefix = ref("app");
const source = ref("primary: #0969da\nsurface: #ffffff\nradius: 8px");

function normalizeName(name: string) {
  return name
    .trim()
    .replace(/[A-Z]/g, (item) => `-${item.toLowerCase()}`)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

const css = computed(() => {
  const rows = source.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.includes(":") ? ":" : "=";
      const [name, ...rest] = line.split(separator);
      return { name: normalizeName(name), value: rest.join(separator).trim() };
    })
    .filter((item) => item.name && item.value);

  const prefixText = normalizeName(prefix.value);
  return `:root {\n${rows.map((item) => `  --${prefixText ? `${prefixText}-` : ""}${item.name}: ${item.value};`).join("\n")}\n}`;
});
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>CSS 变量生成器</h2>
        <p>把键值列表转换为规范的 :root CSS 变量</p>
      </div>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <label class="field">
          <span>变量前缀</span>
          <input v-model="prefix" placeholder="例如 app、brand、theme" />
        </label>
        <label class="field">
          <span>键值列表</span>
          <textarea v-model="source" class="tool-textarea markdown-editor" placeholder="primary: #0969da"></textarea>
        </label>
      </section>

      <aside class="result-panel">
        <div class="section-title">
          <h2>CSS</h2>
          <span class="status-pill success">READY</span>
        </div>
        <textarea class="tool-textarea code-output" readonly :value="css"></textarea>
      </aside>
    </div>
  </section>
</template>
