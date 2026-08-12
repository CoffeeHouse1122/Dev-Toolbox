import { defineStore } from "pinia";
import type { ThemeTitleBarPayload } from "../../shared/types";

export type ThemeMode = "system" | "light" | "dark";
export type UiFont = "source-han" | "zcool-kuaile" | "wdxl-lubrifont";

const uiFonts: UiFont[] = ["source-han", "zcool-kuaile", "wdxl-lubrifont"];

function storedUiFont(): UiFont {
  const value = localStorage.getItem("ui-font") as UiFont | null;
  return value && uiFonts.includes(value) ? value : "source-han";
}

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readTitleBarTheme(): ThemeTitleBarPayload {
  const styles = window.getComputedStyle(document.documentElement);
  const accentColor = styles.getPropertyValue("--accent").trim() || "#0969da";
  const surfaceColor = styles.getPropertyValue("--surface").trim() || "#ffffff";
  const textColor = styles.getPropertyValue("--text").trim() || "#1f2328";

  return {
    accentColor,
    surfaceColor,
    textColor
  };
}

export const useThemeStore = defineStore("theme", {
  state: () => ({
    mode: (localStorage.getItem("theme-mode") as ThemeMode | null) ?? "dark",
    uiFont: storedUiFont()
  }),
  getters: {
    resolvedTheme(state) {
      return state.mode === "system" ? systemTheme() : state.mode;
    }
  },
  actions: {
    setMode(mode: ThemeMode) {
      this.mode = mode;
      localStorage.setItem("theme-mode", mode);
      this.sync();
    },
    setUiFont(font: UiFont) {
      this.uiFont = font;
      localStorage.setItem("ui-font", font);
      document.documentElement.dataset.uiFont = font;
    },
    sync() {
      const resolved = this.resolvedTheme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.uiFont = this.uiFont;
      try { window.devToolbox.setThemeBackground(readTitleBarTheme()); } catch { /* preload not ready */ }
    }
  }
});
