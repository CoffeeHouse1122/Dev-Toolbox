<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionItemResult, ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const fileName = ref("image.png");
const base64Text = ref("");
const result = ref<ConversionResult | null>(null);
const busy = ref(false);
const mode = ref<"encode" | "decode">("encode");
const canRun = computed(() =>
  mode.value === "encode"
    ? input.value.length > 0 && !busy.value
    : Boolean(base64Text.value.trim() && outputDir.value && fileName.value.trim() && !busy.value)
);

function run() {
  return mode.value === "encode" ? encodeImage() : decodeImage();
}

async function encodeImage() {
  if (!input.value.length) return;
  busy.value = true;
  const inputPaths = [...input.value];
  const encodedItems: Array<{
    inputPath: string;
    fileName: string;
    status: "success" | "error";
    mimeType?: string;
    dataUrl?: string;
    errorMessage?: string;
  }> = [];
  const items: ConversionItemResult[] = [];
  const logs: string[] = [];

  try {
    for (const inputPath of inputPaths) {
      const fileName = inputPath.split(/[\\/]/).pop() || inputPath;
      try {
        const encoded = await window.devToolbox.imageToBase64(inputPath);
        encodedItems.push({ inputPath, fileName, status: "success", mimeType: encoded.mimeType, dataUrl: encoded.dataUrl });
        items.push({ inputPath, status: "success" });
        logs.push(`[${fileName}] MIME: ${encoded.mimeType}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        encodedItems.push({ inputPath, fileName, status: "error", errorMessage });
        items.push({ inputPath, status: "error", errorMessage });
        logs.push(`[${fileName}] ${errorMessage}`);
      }
    }

    const failed = items.filter((item) => item.status === "error").length;
    const status = failed === 0 ? "success" : failed === items.length ? "error" : "partial";
    base64Text.value = inputPaths.length === 1 && encodedItems[0]?.status === "success"
      ? encodedItems[0].dataUrl || ""
      : JSON.stringify({ version: 1, images: encodedItems }, null, 2);
    result.value = {
      id: `base64-${Date.now()}`,
      status,
      files: [],
      outputPath: "",
      logs,
      items,
      errorMessage: failed ? `${failed} / ${items.length} 个文件编码失败。` : undefined
    };
  } finally {
    busy.value = false;
  }
}

async function decodeImage() {
  if (!base64Text.value || !outputDir.value) return;
  busy.value = true;
  result.value = await window.devToolbox.base64ToImage(base64Text.value, outputDir.value, fileName.value);
  busy.value = false;
}
</script>

<template>
  <TaskFlowLayout
    tool-id="base64-image"
    description="图片转 Data URL，或从 Base64 还原图片文件"
    :source-title="mode === 'encode' ? '源图片' : 'Base64 内容'"
    :source-description="mode === 'encode' ? '可批量编码图片，多文件将输出结构化 JSON' : '粘贴 Base64 或完整 Data URL'"
    :settings-title="mode === 'encode' ? '编码输出' : '还原设置'"
    :settings-description="mode === 'encode' ? '编码内容会显示在右侧，可直接复制保存' : '设置还原后的文件名与输出目录'"
    preview-title="内容预览"
    preview-description="编码结果和待还原内容会在此同步显示"
    :file-count="mode === 'encode' ? input.length : (base64Text.trim() ? 1 : 0)"
  >
    <template #source-actions>
      <div class="segmented base64-mode-tabs" role="group" aria-label="转换方向">
        <button type="button" :class="{ selected: mode === 'encode' }" @click="mode = 'encode'">图片编码</button>
        <button type="button" :class="{ selected: mode === 'decode' }" @click="mode = 'decode'">图片还原</button>
      </div>
    </template>

    <template #source>
      <DropZone
        v-if="mode === 'encode'"
        v-model="input"
        title="拖入源图片"
        action-label="添加图片"
        compact
        append-selection
        :multiple="true"
        :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg'] }]"
      />
      <textarea v-else v-model="base64Text" class="tool-textarea base64-source-textarea" placeholder="粘贴 Base64 或 Data URL"></textarea>
    </template>

    <template #settings>
      <div v-if="mode === 'encode'" class="base64-guidance">
        <i class="ri-code-line" aria-hidden="true"></i>
        <div>
          <strong>编码格式自动识别</strong>
          <p>单张图片输出 Data URL；多张图片输出包含文件名、MIME 和状态的 JSON。</p>
        </div>
      </div>
      <label v-else class="field">
        <span>文件名</span>
        <input v-model="fileName" />
      </label>
    </template>

    <template #preview>
      <textarea v-model="base64Text" class="tool-textarea base64-preview-textarea" :readonly="mode === 'encode'" placeholder="等待生成或粘贴 Base64 内容"></textarea>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="转换结果" empty-text="执行后在此显示状态" compact />
    </template>

    <template v-if="mode === 'decode'" #destination>
      <OutputPicker v-model="outputDir" />
    </template>
    <template #summary>
      <i :class="mode === 'encode' ? 'ri-code-line' : 'ri-image-add-line'" aria-hidden="true"></i>
      <span>{{ mode === "encode" ? `${input.length} 张图片待编码` : (base64Text.trim() ? `还原为 ${fileName}` : "等待粘贴内容") }}</span>
    </template>
    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i :class="mode === 'encode' ? 'ri-code-line' : 'ri-image-add-line'" aria-hidden="true"></i>
        {{ busy ? "处理中…" : mode === "encode" ? "开始编码" : "还原图片" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.base64-mode-tabs {
  min-width: 190px;
}

.base64-source-textarea {
  min-height: 72px;
  max-height: 132px;
  resize: vertical;
}

.base64-preview-textarea {
  width: 100%;
  height: 100%;
  min-height: 120px;
  resize: none;
}

.base64-guidance {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 12px;
  border-radius: 7px;
  background: var(--surface-subtle);
}

.base64-guidance > i {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 7px;
  color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  font-size: 18px;
}

.base64-guidance strong,
.base64-guidance p {
  display: block;
  margin: 0;
}

.base64-guidance p {
  margin-top: 5px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
</style>
