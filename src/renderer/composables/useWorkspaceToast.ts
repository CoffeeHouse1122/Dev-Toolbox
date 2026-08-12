import { readonly, ref } from "vue";

export type WorkspaceToastTone = "success" | "error" | "info";

const state = ref({
  visible: false,
  message: "",
  tone: "info" as WorkspaceToastTone
});

let dismissTimer: number | null = null;

export function showWorkspaceToast(
  message: string,
  tone: WorkspaceToastTone = "info",
  duration = tone === "error" ? 4200 : 2600
) {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) return;

  if (dismissTimer !== null) window.clearTimeout(dismissTimer);
  state.value = { visible: true, message: normalizedMessage, tone };
  dismissTimer = window.setTimeout(() => {
    state.value.visible = false;
    dismissTimer = null;
  }, duration);
}

export function dismissWorkspaceToast() {
  if (dismissTimer !== null) window.clearTimeout(dismissTimer);
  dismissTimer = null;
  state.value.visible = false;
}

export function useWorkspaceToast() {
  return {
    toast: readonly(state),
    dismissToast: dismissWorkspaceToast
  };
}
