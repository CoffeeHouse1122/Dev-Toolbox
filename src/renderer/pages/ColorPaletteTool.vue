<script setup lang="ts">
import { computed, ref } from "vue";

// === HEX <-> HSL helpers ===
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function relativeLuminance(r: number, g: number, b: number) {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]) {
  const la = relativeLuminance(...a);
  const lb = relativeLuminance(...b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// === State ===
const baseColor = ref("#0969da");

const baseRgb = computed(() => hexToRgb(baseColor.value) ?? [9, 105, 218]);
const baseHsl = computed(() => rgbToHsl(...baseRgb.value));

// Tailwind-like 11-step shade scale (50, 100..900, 950)
const shadeStops = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const shades = computed(() => {
  const [h, s] = baseHsl.value;
  // Map shade index -> target lightness
  const lightnessMap: Record<number, number> = {
    50: 97, 100: 93, 200: 86, 300: 76, 400: 64,
    500: 50, 600: 42, 700: 34, 800: 27, 900: 20, 950: 12
  };
  return shadeStops.map((stop) => {
    const l = lightnessMap[stop];
    const [r, g, b] = hslToRgb(h, s, l);
    const hex = rgbToHex(r, g, b);
    return { stop, hex, lightness: l };
  });
});

// Color harmonies
const harmonies = computed(() => {
  const [h, s, l] = baseHsl.value;
  const make = (deg: number) => rgbToHex(...hslToRgb((h + deg + 360) % 360, s, l));
  return {
    complementary: [baseColor.value, make(180)],
    analogous: [make(-30), baseColor.value, make(30)],
    triadic: [baseColor.value, make(120), make(240)],
    tetradic: [baseColor.value, make(90), make(180), make(270)],
    splitComplementary: [baseColor.value, make(150), make(210)]
  };
});

// Contrast vs white/black
const contrastAgainstWhite = computed(() => contrastRatio(baseRgb.value, [255, 255, 255]));
const contrastAgainstBlack = computed(() => contrastRatio(baseRgb.value, [0, 0, 0]));

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

const css = computed(() => {
  const lines = [":root {"];
  for (const s of shades.value) lines.push(`  --color-${s.stop}: ${s.hex};`);
  lines.push("}");
  return lines.join("\n");
});

const tailwindConfig = computed(() => {
  const obj: Record<string, string> = {};
  for (const s of shades.value) obj[String(s.stop)] = s.hex;
  return `// tailwind.config.js fragment\ncolors: {\n  brand: ${JSON.stringify(obj, null, 4).replace(/^/gm, "  ").trimStart()}\n}`;
});

function pickLuminanceTextColor(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#000";
  return relativeLuminance(...rgb) > 0.5 ? "#000" : "#fff";
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>配色生成器</h2>
        <p>从基础色生成完整 11 阶色板、和谐配色与 CSS / Tailwind 配置</p>
      </div>
    </div>

    <div class="color-gen-layout">
      <aside class="color-controls">
        <label class="field">
          <span>基础色</span>
          <div class="color-input-row">
            <input type="color" v-model="baseColor" />
            <input type="text" v-model="baseColor" />
          </div>
        </label>
        <div class="info-list">
          <div class="info-row"><span>HEX</span><strong>{{ baseColor.toUpperCase() }}</strong></div>
          <div class="info-row"><span>RGB</span><strong>rgb({{ Math.round(baseRgb[0]) }}, {{ Math.round(baseRgb[1]) }}, {{ Math.round(baseRgb[2]) }})</strong></div>
          <div class="info-row"><span>HSL</span><strong>hsl({{ Math.round(baseHsl[0]) }}, {{ Math.round(baseHsl[1]) }}%, {{ Math.round(baseHsl[2]) }}%)</strong></div>
          <div class="info-row">
            <span>白底对比度</span>
            <strong>{{ contrastAgainstWhite.toFixed(2) }} <small style="margin-left: 6px;">{{ contrastAgainstWhite >= 4.5 ? "AA ✓" : contrastAgainstWhite >= 3 ? "AA Large" : "✗" }}</small></strong>
          </div>
          <div class="info-row">
            <span>黑底对比度</span>
            <strong>{{ contrastAgainstBlack.toFixed(2) }} <small style="margin-left: 6px;">{{ contrastAgainstBlack >= 4.5 ? "AA ✓" : contrastAgainstBlack >= 3 ? "AA Large" : "✗" }}</small></strong>
          </div>
        </div>
      </aside>

      <div style="display: grid; gap: 14px;">
        <section class="color-section">
          <h3>
            色阶 (Tailwind 风格)
            <button type="button" class="secondary-button" style="min-height: 28px; padding: 4px 10px; font-size: 12px;" @click="copyText(css)">
              <i class="ri-clipboard-line" aria-hidden="true"></i>
              复制 CSS
            </button>
          </h3>
          <div class="palette-swatches">
            <button
              v-for="s in shades"
              :key="s.stop"
              type="button"
              class="swatch"
              :style="{ background: s.hex, color: pickLuminanceTextColor(s.hex) }"
              :title="`点击复制 ${s.hex}`"
              @click="copyText(s.hex)"
            >
              <span class="swatch-name" :style="{ color: pickLuminanceTextColor(s.hex), opacity: 0.6 }">{{ s.stop }}</span>
              {{ s.hex.toUpperCase() }}
            </button>
          </div>
        </section>

        <section class="color-section">
          <h3>和谐配色</h3>
          <div style="display: grid; gap: 12px;">
            <div v-for="(palette, key) in harmonies" :key="key" style="display: grid; grid-template-columns: 130px 1fr; gap: 12px; align-items: center;">
              <span style="font-size: 12px; color: var(--muted); text-transform: capitalize;">{{ key }}</span>
              <div class="harmony-row" :style="{ gridTemplateColumns: `repeat(${palette.length}, 1fr)` }">
                <button
                  v-for="c in palette"
                  :key="c"
                  type="button"
                  class="harmony-swatch"
                  :style="{ background: c }"
                  :title="`点击复制 ${c}`"
                  @click="copyText(c)"
                ></button>
              </div>
            </div>
          </div>
        </section>

        <section class="color-section">
          <h3>
            Tailwind 配置
            <button type="button" class="secondary-button" style="min-height: 28px; padding: 4px 10px; font-size: 12px;" @click="copyText(tailwindConfig)">
              <i class="ri-clipboard-line" aria-hidden="true"></i>
              复制
            </button>
          </h3>
          <pre class="code-output" style="margin: 0; padding: 12px; background: var(--surface-subtle); border-radius: 6px; max-height: 240px; overflow: auto;">{{ tailwindConfig }}</pre>
        </section>
      </div>
    </div>
  </section>
</template>
