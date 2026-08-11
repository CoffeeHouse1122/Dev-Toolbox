const fs = require("node:fs");
const path = require("node:path");

function readEnvFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").split(/\r?\n/).reduce((result, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return result;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) return result;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key) result[key] = value;
      return result;
    }, {});
  } catch (error) {
    if (error && error.code === "ENOENT") return {};
    throw error;
  }
}

function normalizeManifestUrl(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  const parsed = new URL(value);
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) {
    throw new Error("DESKTOP_APP_UPDATE_URL must be an HTTP(S) URL without embedded credentials.");
  }
  if (parsed.hostname.endsWith(".invalid") || parsed.hostname === "xxx.com" || parsed.hostname === "www.xxx.com") {
    throw new Error("DESKTOP_APP_UPDATE_URL still uses a placeholder hostname; configure the real personal update server first.");
  }
  return parsed.toString();
}

function prepareBuildConfig(projectRoot = process.cwd()) {
  const localEnv = readEnvFile(path.join(projectRoot, ".env"));
  const manifestUrl = normalizeManifestUrl(
    process.env.AUTOUPDATE_FEED_URL ||
      process.env.DESKTOP_APP_UPDATE_URL ||
      localEnv.AUTOUPDATE_FEED_URL ||
      localEnv.DESKTOP_APP_UPDATE_URL
  );
  const outputPath = path.join(projectRoot, "dist", "electron", "update-config.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({ manifestUrl }, null, 2)}\n`, "utf8");
  return { outputPath, configured: Boolean(manifestUrl) };
}

if (require.main === module) {
  const result = prepareBuildConfig();
  console.log(`Update feed build config: ${result.configured ? "configured" : "disabled"}.`);
}

module.exports = { normalizeManifestUrl, prepareBuildConfig, readEnvFile };
