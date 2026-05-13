import os from "node:os";
import dns from "node:dns/promises";
import { net } from "electron";
import type { DomainIpLookupResult, IpInfo } from "../../../shared/types";

type IpSource = {
  name: string;
  url: string;
  parse: (body: string) => string;
};

const ipSources: IpSource[] = [
  {
    name: "ipify",
    url: "https://api.ipify.org?format=json",
    parse: (body) => (JSON.parse(body) as { ip?: string }).ip ?? ""
  },
  {
    name: "ip.sb",
    url: "https://api.ip.sb/ip",
    parse: (body) => body.trim()
  },
  {
    name: "ifconfig.me",
    url: "https://ifconfig.me/ip",
    parse: (body) => body.trim()
  },
  {
    name: "icanhazip",
    url: "https://icanhazip.com",
    parse: (body) => body.trim()
  }
];

function isLikelyIp(value: string) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value) || /^[a-f0-9:]+$/i.test(value);
}

async function requestWithTimeout(url: string, transport: "fetch" | "electron", timeout = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response =
      transport === "electron" ? await net.fetch(url, { signal: controller.signal }) : await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getExternalIp() {
  const errors: string[] = [];

  for (const transport of ["fetch", "electron"] as const) {
    for (const source of ipSources) {
      try {
        const body = await requestWithTimeout(source.url, transport);
        const ip = source.parse(body);
        if (isLikelyIp(ip)) {
          return { externalIp: ip, externalSource: `${source.name} / ${transport}` };
        }
        throw new Error("response did not contain an IP address");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${source.name}(${transport}): ${message}`);
      }
    }
  }

  return { externalIp: "", externalError: errors.at(-1) ?? "外网 IP 获取失败" };
}

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

  return { internal, ...(await getExternalIp()) };
}

function normalizeDomainQuery(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error("域名不能为空");

  const source = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(source);
  const host = url.hostname.trim();
  if (!host) throw new Error("无法解析域名");
  return host;
}

export async function lookupDomainIp(query: string): Promise<DomainIpLookupResult> {
  const rawQuery = query.trim();
  try {
    const host = normalizeDomainQuery(rawQuery);
    const records = await dns.lookup(host, { all: true, verbatim: false });
    return {
      query: rawQuery,
      host,
      addresses: records.map((item) => ({
        family: item.family === 6 ? "IPv6" : "IPv4",
        address: item.address
      })),
      status: "success"
    };
  } catch (error) {
    return {
      query: rawQuery,
      host: rawQuery,
      addresses: [],
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }
}
