import { defineStore } from "pinia";

export type ThemeMode = "system" | "light" | "dark";

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
      document.documentElement.dataset.theme = this.resolvedTheme;
    },
    sync() {
      document.documentElement.dataset.theme = this.resolvedTheme;
    }
  }
});

