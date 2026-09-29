import type { SharedDiskStatus } from "../../../shared/types";
import { parseSharedPath } from "../../../shared/shared-disk";
import { runSharedDiskNative, sharedDiskError } from "./shared-disk-native";

export async function getSharedDiskStatus(config: { sharePath: string }): Promise<SharedDiskStatus> {
  const { shareRoot } = parseSharedPath(config.sharePath);
  const result = await runSharedDiskNative({ action: "status", shareRoot });
  if (result.code === 2250) return { connected: false, state: "disconnected", shareRoot, message: "尚未连接该共享" };
  if (result.code !== 0) return { connected: false, state: "unknown", shareRoot, message: sharedDiskError(result.code) };
  if (result.status === undefined) return { connected: false, state: "unknown", shareRoot, message: "无法确认连接状态" };
  const connected = result.status === 0;
  return { connected, state: connected ? "connected" : "disconnected", shareRoot, message: connected ? "Windows 共享会话已连接；打开目录时检查访问权限" : "已记录但未连接，请重新连接" };
}
