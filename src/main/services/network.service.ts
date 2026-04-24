import os from "node:os";
import type { IpInfo } from "../../shared/types";

export async function getIpInfo(): Promise<IpInfo> {
  const internal = Object.entries(os.networkInterfaces())
    .flatMap(([name, items]) =>
      (items ?? []).map((item) => ({
        name,
        family: item.family === "IPv6" ? ("IPv6" as const) : ("IPv4" as const),
        address: item.address,
        internal: item.internal,
        mac: item.mac
      }))
    )
    .filter((item) => !item.internal);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as { ip?: string };
    return { internal, externalIp: data.ip ?? "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { internal, externalIp: "", externalError: message };
  } finally {
    clearTimeout(timer);
  }
}
