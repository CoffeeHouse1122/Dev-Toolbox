import path from "node:path";
import type { ConversionResult, SeoFilesOptions } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, uniqueId, writeTextFile } from "./file-utils";

function normalizeSiteUrl(siteUrl: string) {
  const raw = siteUrl.trim();
  if (!raw) throw new Error("站点 URL 不能为空");
  const parsed = new URL(raw);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("站点 URL 仅支持 http 或 https");
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    throw new Error("请输入不包含账号信息的有效站点 URL");
  }
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/g, "");
  return parsed.toString().replace(/\/+$/g, "");
}

function normalizePath(page: string) {
  const trimmed = page.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    throw new Error(`页面路径不能是完整 URL：${trimmed}`);
  }
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return encodeURI(normalized).replace(/#/g, "%23");
}

const allowedChangefreq = new Set(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);

function normalizePriority(value: string) {
  const priority = Number(value);
  if (!Number.isFinite(priority) || priority < 0 || priority > 1) {
    throw new Error("Sitemap priority 必须是 0 到 1 之间的数字");
  }
  return String(Math.round(priority * 10) / 10);
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function generateSeoFiles(options: SeoFilesOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("seo-files");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "seo-files",
    sourcePath: "inline-seo-config",
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);
    const siteUrl = normalizeSiteUrl(options.siteUrl);
    if (!allowedChangefreq.has(options.changefreq)) {
      throw new Error(`不支持的 changefreq：${options.changefreq}`);
    }
    const priority = normalizePriority(options.priority);
    const pages = [...new Set(options.pages.split(/\r?\n/).map(normalizePath).filter(Boolean))];

    if (options.includeRobots) {
      const robotsPath = path.join(options.outputDir, "robots.txt");
      const disallow = options.disallow
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => `Disallow: ${normalizePath(item)}`)
        .join("\n");
      await writeTextFile(
        robotsPath,
        `User-agent: *
${disallow || "Allow: /"}
Sitemap: ${siteUrl}/sitemap.xml
`
      );
      files.push(robotsPath);
    }

    if (options.includeSitemap) {
      const sitemapPath = path.join(options.outputDir, "sitemap.xml");
      const now = new Date().toISOString();
      const urls = pages.map(
        (page) => `  <url>
    <loc>${escapeXml(`${siteUrl}${page}`)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${escapeXml(options.changefreq)}</changefreq>
    <priority>${priority}</priority>
  </url>`
      );
      await writeTextFile(
        sitemapPath,
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`
      );
      files.push(sitemapPath);
    }

    logs.push(`Generated ${files.length} SEO file(s).`);
    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
