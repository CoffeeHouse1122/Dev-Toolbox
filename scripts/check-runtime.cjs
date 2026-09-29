const MIN_NODE_VERSION = "22.14.0";
const MIN_NAPI_VERSION = 10;

function getRuntimeError({ node, napi } = process.versions) {
  const [major, minor] = String(node).split(".").map(Number);
  const supportedNode = major > 22 || (major === 22 && minor >= 14);
  if (!supportedNode || !(Number(napi) >= MIN_NAPI_VERSION)) {
    // Check before loading native addons: unsupported Node-API can crash Windows.
    return `需要 Node.js >= ${MIN_NODE_VERSION} 且支持 Node-API ${MIN_NAPI_VERSION}（better-sqlite3 要求）。当前 Node.js ${node} / Node-API ${napi ?? "未知"}。请按 .nvmrc 切换 Node.js 后重试。`;
  }
  return null;
}

if (require.main === module) {
  const error = getRuntimeError();
  if (error) {
    console.error(error);
    process.exitCode = 1;
  } else {
    console.log(`运行环境检查通过：Node.js ${process.versions.node} / Node-API ${process.versions.napi}`);
  }
}

module.exports = { getRuntimeError, MIN_NODE_VERSION };
