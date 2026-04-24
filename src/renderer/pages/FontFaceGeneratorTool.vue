<script setup lang="ts">
import { computed, ref } from "vue";
import SelectMenu from "../components/SelectMenu.vue";

const family = ref("Source Han Sans CN");
const url = ref("./SourceHanSansCN-Regular.woff2");
const format = ref("woff2");
const weight = ref("400");
const style = ref("normal");
const display = ref("swap");

const formatOptions = [
  { label: "WOFF2", value: "woff2" },
  { label: "WOFF", value: "woff" },
  { label: "TTF", value: "truetype" },
  { label: "OTF", value: "opentype" }
];
const displayOptions = [
  { label: "swap", value: "swap" },
  { label: "block", value: "block" },
  { label: "fallback", value: "fallback" },
  { label: "optional", value: "optional" }
];

const css = computed(() => `@font-face {
  font-family: "${family.value}";
  src: url("${url.value}") format("${format.value}");
  font-weight: ${weight.value};
  font-style: ${style.value};
  font-display: ${display.value};
}`);
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>@font-face CSS 生成器</h2>
        <p>按字体文件路径生成可直接使用的 Web 字体声明</p>
      </div>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <div class="option-grid">
          <label class="field">
            <span>font-family</span>
            <input v-model="family" />
          </label>
          <label class="field">
            <span>字体地址</span>
            <input v-model="url" />
          </label>
          <div class="field">
            <span>format</span>
            <SelectMenu v-model="format" :options="formatOptions" />
          </div>
          <div class="field">
            <span>font-display</span>
            <SelectMenu v-model="display" :options="displayOptions" />
          </div>
          <label class="field">
            <span>font-weight</span>
            <input v-model="weight" />
          </label>
          <label class="field">
            <span>font-style</span>
            <input v-model="style" />
          </label>
        </div>
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
