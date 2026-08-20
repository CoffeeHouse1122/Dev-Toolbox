<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import OptionGrid from "../components/OptionGrid.vue";
import ResultPanel from "../components/ResultPanel.vue";
import Slider from "../components/Slider.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const appName = ref("My App");
const shortName = ref("App");
const themeColor = ref("#0d9488");
const backgroundColor = ref("#ffffff");
const maskablePaddingPercent = ref(20);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

const previewPath = computed(() => input.value[0] ?? "");
const previewUrl = computed(() => previewPath.value && !/\.svg$/i.test(previewPath.value)
  ? `devtoolbox-file://preview/${encodeURIComponent(previewPath.value)}`
  : "");
const colorsValid = computed(() => /^#[0-9a-f]{6}$/i.test(themeColor.value) && /^#[0-9a-f]{6}$/i.test(backgroundColor.value));
const maskablePreviewPadding = computed(() => `${maskablePaddingPercent.value * 0.48}px`);
const canRun = computed(() => (
  input.value.length > 0
  && Boolean(outputDir.value)
  && Boolean(appName.value.trim())
  && Boolean(shortName.value.trim())
  && colorsValid.value
  && !busy.value
));

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.generatePwaIconPackages({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      appName: appName.value.trim(),
      shortName: shortName.value.trim(),
      themeColor: themeColor.value,
      backgroundColor: backgroundColor.value,
      maskablePadding: maskablePaddingPercent.value / 100
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    title="PWA 与移动图标包"
    description="生成 PWA、Android、iOS 与浏览器常用图标资源"
    source-title="应用图标源图"
    source-description="支持批量添加；每个源图都会生成独立目录和 ZIP"
    settings-title="应用与安全区域"
    settings-description="设置 Manifest 文案、主题色与 Maskable 留白"
    preview-title="移动端效果"
    preview-description="模拟主屏幕图标与启动主题色"
    variant="preview-dominant"
    :file-count="input.length"
  >
    <template #source>
      <DropZone
        v-model="input"
        title="拖入应用图标"
        action-label="添加图标"
        compact
        append-selection
        :multiple="true"
        :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]"
      />
    </template>

    <template #settings>
      <OptionGrid>
        <label class="field">
          <span>应用名称</span>
          <input v-model="appName" type="text" maxlength="80" placeholder="My App" />
        </label>
        <label class="field">
          <span>短名称</span>
          <input v-model="shortName" type="text" maxlength="24" placeholder="App" />
        </label>
        <label class="field">
          <span>主题色</span>
          <span class="color-control">
            <input v-model="themeColor" type="color" aria-label="选择主题色" />
            <input v-model="themeColor" type="text" maxlength="7" aria-label="主题色色值" />
          </span>
        </label>
        <label class="field">
          <span>背景色</span>
          <span class="color-control">
            <input v-model="backgroundColor" type="color" aria-label="选择背景色" />
            <input v-model="backgroundColor" type="text" maxlength="7" aria-label="背景色色值" />
          </span>
        </label>
        <label class="field span-2">
          <span>Maskable 安全留白：{{ maskablePaddingPercent }}%</span>
          <Slider v-model="maskablePaddingPercent" :min="10" :max="40" aria-label="Maskable 安全留白" />
        </label>
      </OptionGrid>
      <p v-if="!colorsValid" class="error-banner">主题色和背景色需使用 6 位 HEX，例如 #0d9488。</p>
      <div class="package-list" aria-label="图标包内容">
        <span><i class="ri-checkbox-circle-line"></i>PWA 192 / 512</span>
        <span><i class="ri-checkbox-circle-line"></i>Maskable 192 / 512</span>
        <span><i class="ri-checkbox-circle-line"></i>Apple Touch 180</span>
        <span><i class="ri-checkbox-circle-line"></i>Favicon 32</span>
        <span><i class="ri-checkbox-circle-line"></i>Manifest + HTML</span>
      </div>
    </template>

    <template #preview>
      <div class="pwa-preview-stage" :style="{ backgroundColor: themeColor }">
        <div class="phone-preview">
          <div class="phone-status"><span>9:41</span><i class="ri-wifi-line"></i></div>
          <div class="launcher-icon" :style="{ backgroundColor }">
            <img v-if="previewUrl" :src="previewUrl" :style="{ padding: maskablePreviewPadding }" alt="应用图标预览" />
            <i v-else class="ri-apps-2-line" aria-hidden="true"></i>
          </div>
          <strong>{{ shortName.trim() || "App" }}</strong>
          <small>{{ previewUrl ? "Maskable 安全区域预览" : (previewPath ? "SVG 将在安全处理后写入图标包" : "添加图标后显示预览") }}</small>
        </div>
      </div>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="图标包结果" empty-text="生成后可在此打开 ZIP 与资源目录" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-smartphone-line" aria-hidden="true"></i>
      <span>{{ input.length }} 个源图 · 6 张图标 · Manifest / ZIP</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-archive-line" aria-hidden="true"></i>
        {{ busy ? "生成中…" : "生成移动图标包" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.color-control {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 7px;
}

.color-control input[type="color"] {
  width: 40px;
  min-width: 40px;
  height: 34px;
  padding: 3px;
  cursor: pointer;
}

.package-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-subtle);
}

.package-list span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}

.package-list i {
  color: var(--accent-strong);
  font-size: 14px;
}

.pwa-preview-stage {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 190px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background-image:
    radial-gradient(circle at 18% 18%, rgb(255 255 255 / 20%), transparent 34%),
    linear-gradient(145deg, rgb(0 0 0 / 3%), rgb(0 0 0 / 22%));
}

.phone-preview {
  display: grid;
  justify-items: center;
  gap: 8px;
  width: min(68%, 270px);
  min-height: 210px;
  padding: 14px 18px 18px;
  border: 1px solid rgb(255 255 255 / 24%);
  border-radius: 24px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  box-shadow: 0 18px 38px rgb(0 0 0 / 24%);
  backdrop-filter: blur(14px);
}

.phone-status {
  display: flex;
  justify-content: space-between;
  width: 100%;
  color: var(--muted);
  font: 10px/1 var(--font-mono);
}

.launcher-icon {
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  margin-top: 5px;
  overflow: hidden;
  border-radius: 22px;
  box-shadow: 0 10px 22px rgb(0 0 0 / 24%);
}

.launcher-icon img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.launcher-icon > i {
  color: var(--accent-strong);
  font-size: 38px;
}

.phone-preview strong {
  color: var(--text);
  font-size: 13px;
}

.phone-preview small {
  color: var(--muted);
  font-size: 10px;
}

@media (max-width: 720px) {
  .package-list {
    grid-template-columns: 1fr;
  }
}
</style>
