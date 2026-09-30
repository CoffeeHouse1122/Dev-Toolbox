import { readonly, ref } from "vue";

export type WorkspaceToastTone = "success" | "error" | "info";
type ToastOptions = {
  action?: { label: string; run: () => void | Promise<void> };
  onDismiss?: () => void | Promise<void>;
};

const state = ref({
  id: 0,
  visible: false,
  message: "",
  tone: "info" as WorkspaceToastTone,
  actionLabel: ""
});

let dismissTimer: number | null = null;
let nextId = 0;
let currentOptions: ToastOptions = {};

export function showWorkspaceToast(
  message: string,
  tone: WorkspaceToastTone = "info",
  duration = tone === "error" ? 4200 : 2600,
  options: ToastOptions = {}
) {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) return;

  if (dismissTimer !== null) window.clearTimeout(dismissTimer);
  const id = ++nextId;
  currentOptions = options;
  state.value = { id, visible: true, message: normalizedMessage, tone, actionLabel: options.action?.label ?? "" };
  dismissTimer = window.setTimeout(() => {
    clearWorkspaceToast(id);
  }, duration);
  return id;
}

export function clearWorkspaceToast(id = state.value.id) {
  if (state.value.id !== id) return;
  if (dismissTimer !== null) window.clearTimeout(dismissTimer);
  dismissTimer = null;
  state.value.visible = false;
  currentOptions = {};
}

export function reportWorkspaceError(cause: unknown, prefix = "操作失败") {
  const message = cause instanceof Error ? cause.message : String(cause);
  showWorkspaceToast(`${prefix}：${message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "")}`, "error", 7000);
}

export async function dismissWorkspaceToast() {
  const callback = currentOptions.onDismiss;
  clearWorkspaceToast();
  try { await callback?.(); } catch (cause) { reportWorkspaceError(cause); }
}

export async function runWorkspaceToastAction() {
  const action = currentOptions.action;
  clearWorkspaceToast();
  try { await action?.run(); } catch (cause) { reportWorkspaceError(cause); }
}

export function useWorkspaceToast() {
  return {
    toast: readonly(state),
    dismissToast: dismissWorkspaceToast,
    runAction: runWorkspaceToastAction
  };
}
