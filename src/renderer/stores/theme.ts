import { defineStore } from "pinia";
import type { ThemeTitleBarPayload } from "../../shared/types";

export type ThemeMode = "system" | "light" | "dark";

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
    mode: (localStorage.getItem("theme-mode") as ThemeMode | null) ?? "system"
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
    sync() {
      const resolved = this.resolvedTheme;
      document.documentElement.dataset.theme = resolved;
      try { window.devToolbox.setThemeBackground(readTitleBarTheme()); } catch { /* preload not ready */ }
    }
  }
});

