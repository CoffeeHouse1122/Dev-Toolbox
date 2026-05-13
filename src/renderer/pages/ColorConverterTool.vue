<script setup lang="ts">
import { computed, ref, watch } from "vue";

// 所有颜色通道值
const hex = ref("#3b82f6");
const r = ref(59);
const g = ref(130);
const b = ref(246);
const h = ref(217);
const s = ref(91);
const l = ref(60);
const c_val = ref(76);
const m = ref(47);
const y_val = ref(0);
const k_val = ref(4);

// ---- 转换函数 ---- //

function rgbToHex(rr: number, gg: number, bb: number) {
  return "#" + [rr, gg, bb].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
}

function rgbToHsl(rr: number, gg: number, bb: number): [number, number, number] {
  const rf = rr / 255, gf = gg / 255, bf = bb / 255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const delta = max - min;
  let hh = 0, ss = 0, ll = (max + min) / 2;
  if (delta !== 0) {
    ss = ll > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === rf) hh = ((gf - bf) / delta + (gf < bf ? 6 : 0)) / 6;
    else if (max === gf) hh = ((bf - rf) / delta + 2) / 6;
    else hh = ((rf - gf) / delta + 4) / 6;
  }
  return [Math.round(hh * 360), Math.round(ss * 100), Math.round(ll * 100)];
}

function hslToRgb(hh: number, ss: number, ll: number): [number, number, number] {
  const sf = ss / 100, lf = ll / 100;
  const chroma = (1 - Math.abs(2 * lf - 1)) * sf;
  const x = chroma * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = lf - chroma / 2;
  let rf = 0, gf = 0, bf = 0;
  if (hh < 60) { rf = chroma; gf = x; }
  else if (hh < 120) { rf = x; gf = chroma; }
  else if (hh < 180) { gf = chroma; bf = x; }
  else if (hh < 240) { gf = x; bf = chroma; }
  else if (hh < 300) { rf = x; bf = chroma; }
  else { rf = chroma; bf = x; }
  return [Math.round((rf + m) * 255), Math.round((gf + m) * 255), Math.round((bf + m) * 255)];
}

function rgbToCmyk(rr: number, gg: number, bb: number): [number, number, number, number] {
  const rf = rr / 255, gf = gg / 255, bf = bb / 255;
  const kk = 1 - Math.max(rf, gf, bf);
  if (kk === 1) return [0, 0, 0, 100];
  const cc = Math.round(((1 - rf - kk) / (1 - kk)) * 100);
  const mm = Math.round(((1 - gf - kk) / (1 - kk)) * 100);
  const yy = Math.round(((1 - bf - kk) / (1 - kk)) * 100);
  return [cc, mm, yy, Math.round(kk * 100)];
}

function cmykToRgb(cc: number, mm: number, yy: number, kk: number): [number, number, number] {
  const kf = kk / 100;
  return [
    Math.round(255 * (1 - cc / 100) * (1 - kf)),
    Math.round(255 * (1 - mm / 100) * (1 - kf)),
    Math.round(255 * (1 - yy / 100) * (1 - kf))
  ];
}

// ---- 统一同步：由 RGB 作为中间桥接 ---- //

/** 接收来源标记，防止 watch 循环 */
type Source = "hex" | "rgb" | "hsl" | "cmyk";

function setAllFromRgb(rr: number, gg: number, bb: number, src: Source) {
  const [hh, ss, ll] = rgbToHsl(rr, gg, bb);
  const [cc, mm, yy, kk] = rgbToCmyk(rr, gg, bb);
  batch(() => {
    if (src !== "hex") hex.value = rgbToHex(rr, gg, bb);
    if (src !== "rgb") { r.value = rr; g.value = gg; b.value = bb; }
    if (src !== "hsl") { h.value = hh; s.value = ss; l.value = ll; }
    if (src !== "cmyk") { c_val.value = cc; m.value = mm; y_val.value = yy; k_val.value = kk; }
  });
}

let batching = false;
let pending: (() => void) | null = null;

function batch(fn: () => void) {
  batching = true;
  fn();
  batching = false;
  if (pending) {
    const cb = pending;
    pending = null;
    cb();
  }
}

// ---- watch：任一颜色空间变化 → 通过 RGB 桥接同步其余 ---- //

watch(hex, (val) => {
  if (batching) return;
  const m = val.match(/^#?([0-9a-fA-F]{3,6})$/);
  if (!m) return;
  let hx = m[1];
  if (hx.length === 3) hx = hx.split("").map((c) => c + c).join("");
  if (hx.length !== 6) return;
  const rr = parseInt(hx.substring(0, 2), 16);
  const gg = parseInt(hx.substring(2, 4), 16);
  const bb = parseInt(hx.substring(4, 6), 16);
  setAllFromRgb(rr, gg, bb, "hex");
});

watch([r, g, b], () => {
  if (batching) return;
  setAllFromRgb(r.value, g.value, b.value, "rgb");
});

watch([h, s, l], () => {
  if (batching) return;
  const [rr, gg, bb] = hslToRgb(h.value, s.value, l.value);
  setAllFromRgb(rr, gg, bb, "hsl");
});

watch([c_val, m, y_val, k_val], () => {
  if (batching) return;
  const [rr, gg, bb] = cmykToRgb(c_val.value, m.value, y_val.value, k_val.value);
  setAllFromRgb(rr, gg, bb, "cmyk");
});

const previewStyle = computed(() => ({ background: hex.value }));

const colorFormats = computed(() => ({
  hex: hex.value,
  rgb: `rgb(${r.value}, ${g.value}, ${b.value})`,
  hsl: `hsl(${h.value}, ${s.value}%, ${l.value}%)`,
  cmyk: `cmyk(${c_val.value}%, ${m.value}%, ${y_val.value}%, ${k_val.value}%)`
}));
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>颜色转换器</h2>
        <p>HEX ↔ RGB ↔ HSL ↔ CMYK 实时互转</p>
      </div>
    </div>

    <div class="tool-main">
      <div class="color-preview-bar" :style="previewStyle"></div>

      <div class="color-grid">
        <!-- HEX -->
        <div class="io-block">
          <div class="io-label">HEX</div>
          <input v-model="hex" class="tool-input" placeholder="#3b82f6" />
        </div>

        <!-- RGB -->
        <div class="io-block">
          <div class="io-label">RGB</div>
          <div style="display:flex;gap:8px;">
            <label class="field" style="margin-bottom:0;"><span>R</span><input v-model.number="r" type="number" min="0" max="255" class="tool-input" /></label>
            <label class="field" style="margin-bottom:0;"><span>G</span><input v-model.number="g" type="number" min="0" max="255" class="tool-input" /></label>
            <label class="field" style="margin-bottom:0;"><span>B</span><input v-model.number="b" type="number" min="0" max="255" class="tool-input" /></label>
          </div>
        </div>

        <!-- HSL -->
        <div class="io-block">
          <div class="io-label">HSL</div>
          <div style="display:flex;gap:8px;">
            <label class="field" style="margin-bottom:0;"><span>H°</span><input v-model.number="h" type="number" min="0" max="360" class="tool-input" /></label>
            <label class="field" style="margin-bottom:0;"><span>S%</span><input v-model.number="s" type="number" min="0" max="100" class="tool-input" /></label>
            <label class="field" style="margin-bottom:0;"><span>L%</span><input v-model.number="l" type="number" min="0" max="100" class="tool-input" /></label>
          </div>
        </div>

        <!-- CMYK -->
        <div class="io-block">
          <div class="io-label">CMYK</div>
          <div style="display:flex;gap:8px;">
            <label class="field" style="margin-bottom:0;"><span>C%</span><input v-model.number="c_val" type="number" min="0" max="100" class="tool-input" /></label>
            <label class="field" style="margin-bottom:0;"><span>M%</span><input v-model.number="m" type="number" min="0" max="100" class="tool-input" /></label>
            <label class="field" style="margin-bottom:0;"><span>Y%</span><input v-model.number="y_val" type="number" min="0" max="100" class="tool-input" /></label>
            <label class="field" style="margin-bottom:0;"><span>K%</span><input v-model.number="k_val" type="number" min="0" max="100" class="tool-input" /></label>
          </div>
        </div>
      </div>

      <div class="color-result">
        <div class="io-label">格式输出</div>
        <div class="format-list">
          <div v-for="(value, key) in colorFormats" :key="key" class="format-item">
            <span class="format-key">{{ key.toUpperCase() }}</span>
            <code class="format-value">{{ value }}</code>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.color-preview-bar {
  height: 80px;
  border-radius: 8px;
  border: 1px solid var(--border);
  margin-bottom: 16px;
  transition: background 0.2s;
}

.color-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.color-result {
  margin-top: 8px;
}

.format-list {
  display: grid;
  gap: 6px;
}

.format-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg-subtle);
  border-radius: 6px;
  border: 1px solid var(--border);
}

.format-key {
  font-weight: 600;
  font-size: 12px;
  color: var(--muted);
  min-width: 44px;
}

.format-value {
  font-family: var(--font-mono, "Cascadia Code", "Fira Code", monospace);
  font-size: 14px;
  user-select: all;
}

.tool-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-mono, "Cascadia Code", "Fira Code", monospace);
  font-size: 14px;
  outline: none;
}
.tool-input:focus { border-color: var(--accent); }

@media (max-width: 640px) {
  .color-grid { grid-template-columns: 1fr; }
}
</style>
