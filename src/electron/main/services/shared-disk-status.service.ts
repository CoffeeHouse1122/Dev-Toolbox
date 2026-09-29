import type { SharedDiskStatus } from "../../../shared/types";
import { parseSharedPath } from "../../../shared/shared-disk";
import { runSharedDiskNative, sharedDiskError } from "./shared-disk-native";

export async function getSharedDiskStatus(config: { sharePath: string }): Promise<SharedDiskStatus> {
  const { shareRoot } = parseSharedPath(config.sharePath);
  const result = await runSharedDiskNative({ action: "status", shareRoot });
  const sessions = (result.sessions ?? []).filter(item => {
    try { return parseSharedPath(item.shareRoot).host.toLowerCase() === parseSharedPath(shareRoot).host.toLowerCase(); } catch { return false; }
  });
  if (result.code === 2250) return { connected: false, state: result.discoveryUnavailable ? "unknown" : "disconnected", shareRoot, sessions,
    message: result.discoveryUnavailable ? "无法读取 Windows SMB 会话，不能确认是否已连接；请检查当前系统权限" : "尚未连接该共享" };
  if (result.code !== 0) return { connected: false, state: "unknown", shareRoot, message: sharedDiskError(result.code) };
  if (result.status === undefined) return { connected: false, state: "unknown", shareRoot, message: "无法确认连接状态" };
  const connected = result.status === 0;
  return { connected, state: connected ? "connected" : "disconnected", shareRoot, username: result.username, sessions,
    message: connected ? "检测到 Windows 已有连接，可直接打开，无需重复登录" : "已记录但未连接，请重新连接" };
}
