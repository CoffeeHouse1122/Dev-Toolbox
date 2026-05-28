import type { App, InjectionKey } from "vue";
import { AnimatePresence } from "motion-v";

export const motionPresets = {
  spring: { type: "spring", stiffness: 420, damping: 34, mass: 0.7 },
  fadeUp: {
    initial: { opacity: 0, y: 10, scale: 0.985 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 8, scale: 0.98 }
  },
  toast: {
    initial: { opacity: 0, y: 12, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 8, scale: 0.98 },
    transition: { duration: 0.18, ease: "easeOut" }
  }
};

export type MotionPresets = typeof motionPresets;
export const motionPresetsKey: InjectionKey<MotionPresets> = Symbol("dev-toolbox-motion-presets");

export function installMotion(app: App) {
  app.component("AnimatePresence", AnimatePresence);
  app.provide(motionPresetsKey, motionPresets);
}