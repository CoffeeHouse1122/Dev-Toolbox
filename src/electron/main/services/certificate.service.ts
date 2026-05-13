import tls from "node:tls";
import type { CertificateScanOptions, CertificateScanResult } from "../../../shared/types";

const DAY_MS = 24 * 60 * 60 * 1000;

type PeerCertificateWithIssuer = tls.PeerCertificate & {
  issuerCertificate?: tls.PeerCertificate;
};

function normalizeTarget(raw: string) {
  const value = raw.trim();
  if (!value) throw new Error("域名不能为空");

  const source = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(source);
  const host = url.hostname.trim();
  const port = Number.parseInt(url.port || "443", 10);

  if (!host) throw new Error("无法解析域名");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("端口不合法");

  return {
    domain: port === 443 ? host : `${host}:${port}`,
    host,
    port
  };
}

function stringifyIssuer(issuer: tls.PeerCertificate["issuer"] | tls.PeerCertificate["subject"] | undefined) {
  if (!issuer || typeof issuer !== "object") return "-";

  const keys = ["CN", "O", "OU", "C"];
  const parts = keys
    .map((key) => {
      const value = issuer[key as keyof typeof issuer];
      return value ? `${key}=${String(value)}` : "";
    })
    .filter(Boolean);

  return parts.length ? parts.join(", ") : "-";
}

function resolveIssuer(certificate: PeerCertificateWithIssuer) {
  const issuer = stringifyIssuer(certificate.issuer);
  if (issuer !== "-") return issuer;
  return stringifyIssuer(certificate.issuerCertificate?.subject);
}

function calculateRemainingDays(validTo: string) {
  const expiresAt = new Date(validTo).getTime();
  if (!Number.isFinite(expiresAt)) return null;
  return Math.ceil((expiresAt - Date.now()) / DAY_MS);
}

function scanOne(rawDomain: string, timeoutMs: number): Promise<CertificateScanResult> {
  let target: ReturnType<typeof normalizeTarget>;

  try {
    target = normalizeTarget(rawDomain);
  } catch (error) {
    return Promise.resolve({
      domain: rawDomain.trim() || rawDomain,
      host: rawDomain.trim(),
      port: 443,
      issuer: "-",
      validFrom: "",
      validTo: "",
      remainingDays: null,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  }

  return new Promise((resolve) => {
    const socket = tls.connect({
      host: target.host,
      port: target.port,
      servername: target.host,
      rejectUnauthorized: false,
      timeout: timeoutMs
    });

    const finish = (result: CertificateScanResult) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate();

      if (!certificate || Object.keys(certificate).length === 0) {
        finish({
          domain: target.domain,
          host: target.host,
          port: target.port,
          issuer: "-",
          validFrom: "",
          validTo: "",
          remainingDays: null,
          status: "error",
          errorMessage: "未获取到 HTTPS 证书"
        });
        return;
      }

      finish({
        domain: target.domain,
        host: target.host,
        port: target.port,
        issuer: resolveIssuer(certificate),
        validFrom: certificate.valid_from || "",
        validTo: certificate.valid_to || "",
        remainingDays: certificate.valid_to ? calculateRemainingDays(certificate.valid_to) : null,
        status: "success"
      });
    });

    socket.once("timeout", () => {
      finish({
        domain: target.domain,
        host: target.host,
        port: target.port,
        issuer: "-",
        validFrom: "",
        validTo: "",
        remainingDays: null,
        status: "error",
        errorMessage: `连接超时（${timeoutMs}ms）`
      });
    });

    socket.once("error", (error) => {
      finish({
        domain: target.domain,
        host: target.host,
        port: target.port,
        issuer: "-",
        validFrom: "",
        validTo: "",
        remainingDays: null,
        status: "error",
        errorMessage: error.message
      });
    });
  });
}

export async function scanCertificates(options: CertificateScanOptions) {
  const timeoutMs = options.timeoutMs ?? 8000;
  const seen = new Set<string>();
  const domains = options.domains
    .map((domain) => domain.trim())
    .filter(Boolean)
    .filter((domain) => {
      const key = domain.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return Promise.all(domains.map((domain) => scanOne(domain, timeoutMs)));
}