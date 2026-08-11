<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import ResultPanel from "../components/ResultPanel.vue";

const input = ref<string[]>([]);
const pattern = ref("{name}-{n}");
const start = ref(1);
const replaceFrom = ref("");
const replaceTo = ref("");
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

function previewSafeName(value: string) {
  let next = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  next = Array.from(next).slice(0, 180).join("").replace(/[. ]+$/g, "");
  if (!next || next === "." || next === "..") next = "untitled";
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(next)) next = `_${next}`;
  return next;
}

const previewRows = computed(() =>
  input.value.map((filePath, index) => {
    const name = filePath.split(/[\\/]/).pop() ?? filePath;
    const dotIndex = name.lastIndexOf(".");
    const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
    const ext = dotIndex > 0 ? name.slice(dotIndex) : "";
    const serial = String(start.value + index).padStart(3, "0");
    const replaced = replaceFrom.value ? base.replaceAll(replaceFrom.value, replaceTo.value) : base;
    const next = pattern.value.replaceAll("{name}", replaced).replaceAll("{n}", serial);
    return { from: name, to: `${previewSafeName(next)}${ext.normalize("NFC")}` };
  })
);

async function run(dryRun = false) {
  if (!input.value.length) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.renameFiles({
      inputPaths: [...input.value],
      pattern: pattern.value,
      start: start.value,
      replaceFrom: replaceFrom.value || undefined,
      replaceTo: replaceTo.value,
      dryRun
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
        <h2>文件名重命名</h2>
        <p>支持单个或批量，使用 {name} 和 {n} 生成新名称</p>
      </div>
      <div class="header-actions">
        <button type="button" class="secondary-button" :disabled="!input.length || busy" @click="run(true)">
          <i class="ri-shield-check-line" aria-hidden="true"></i>
          校验计划
        </button>
        <button type="button" class="primary-button" :disabled="!input.length || busy" @click="run(false)">
          <i class="ri-edit-2-line" aria-hidden="true"></i>
          重命名
        </button>
      </div>
    </div>
    <div class="tool-layout">
      <section class="tool-main">
        <DropZone v-model="input" title="选择文件" :multiple="true" />
        <div class="option-grid">
          <label class="field span-2"><span>命名模式</span><input v-model="pattern" /></label>
          <label class="field"><span>起始序号</span><input v-model.number="start" type="number" min="0" /></label>
          <label class="field"><span>查找</span><input v-model="replaceFrom" /></label>
          <label class="field"><span>替换为</span><input v-model="replaceTo" /></label>
        </div>
        <div class="rename-preview" v-if="previewRows.length">
          <div class="rename-row table-head"><span>原文件名</span><span>新文件名</span></div>
          <div v-for="row in previewRows" :key="row.from" class="rename-row">
            <span>{{ row.from }}</span>
            <span>{{ row.to }}</span>
          </div>
        </div>
      </section>
      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
