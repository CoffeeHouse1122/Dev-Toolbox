const MANIFEST_URL = './release-manifest.json'

const DEFAULT_MANIFEST = {
  appName: 'Dev Toolbox',
  title: 'Dev Toolbox 开发工具箱',
  heroDescription: '本地优先的前端资源转换桌面工具箱，支持图片、字体、音视频、CSS、文本等常见开发资产的格式转换与处理。',
  latestVersion: '--',
  system: 'Windows 10 / 11 | macOS 12+ | Linux',
  packageType: 'NSIS 安装程序 (Win) / DMG (Mac) / AppImage (Linux)',
  recommendedEnvironment: '4GB 内存以上',
  downloadHint: '更新清单加载失败，请稍后重试或联系维护人员。',
  features: [
    '图片：图标生成、格式转换、压缩、尺寸调整、裁剪、水印、雪碧图、Base64 编解码、二维码生成',
    '字体：WOFF2 转换、字体预览、字体子集化、@font-face 生成器',
    '文本与 CSS：Markdown 导出、JSON/YAML/TOML 互转、文本 Diff、JWT 解析、URL 编解码、正则测试、Clamp 字号计算、代码截图',
    '音视频：视频转 GIF / 序列帧、视频去音频、音频格式转换',
    'SEO 与发布：robots.txt / sitemap 生成、HTML Meta 标签生成、OG 图片生成',
    '开发辅助：时间戳转换、UUID 生成、剪贴板历史、IP 查询、文件批量重命名'
  ],
  installationSteps: [
    '下载对应系统的安装包后运行安装程序，按向导选择安装目录即可。',
    '安装完成后双击桌面图标启动 Dev Toolbox。'
  ],
  preparations: [
    '确保设备满足最低系统要求（4GB 内存以上）。',
    '部分工具依赖本地二进制文件（如 ffmpeg），首次使用时会自动加载。'
  ],
  downloads: [],
  releaseNotes: []
}

function normalizeString(value, fallback = '') {
  const normalizedValue = String(value || '').trim()
  return normalizedValue || fallback
}

function normalizeList(value, fallback = []) {
  if (!Array.isArray(value) || !value.length) return [...fallback]
  return value.map((item) => normalizeString(item)).filter(Boolean)
}

function normalizeDownloads(downloads = []) {
  if (!Array.isArray(downloads)) return []
  return downloads
    .map((item) => ({
      label: normalizeString(item?.label, '下载应用'),
      url: normalizeString(item?.url),
      note: normalizeString(item?.note),
      primary: Boolean(item?.primary)
    }))
    .filter((item) => item.url)
}

function normalizeReleaseNotes(releaseNotes = []) {
  if (!Array.isArray(releaseNotes)) return []
  return releaseNotes
    .map((item) => ({
      version: normalizeString(item?.version),
      publishedAt: normalizeString(item?.publishedAt || item?.published_at),
      summary: normalizeString(item?.summary),
      changes: normalizeList(item?.changes)
    }))
    .filter((item) => item.version)
}

function normalizeManifest(payload = {}) {
  return {
    appName: normalizeString(payload.appName, DEFAULT_MANIFEST.appName),
    title: normalizeString(payload.title, DEFAULT_MANIFEST.title),
    heroDescription: normalizeString(payload.heroDescription, DEFAULT_MANIFEST.heroDescription),
    latestVersion: normalizeString(payload.latestVersion || payload.version, DEFAULT_MANIFEST.latestVersion),
    system: normalizeString(payload.system, DEFAULT_MANIFEST.system),
    packageType: normalizeString(payload.packageType, DEFAULT_MANIFEST.packageType),
    recommendedEnvironment: normalizeString(payload.recommendedEnvironment, DEFAULT_MANIFEST.recommendedEnvironment),
    downloadHint: normalizeString(payload.downloadHint, DEFAULT_MANIFEST.downloadHint),
    features: normalizeList(payload.features, DEFAULT_MANIFEST.features),
    installationSteps: normalizeList(payload.installationSteps, DEFAULT_MANIFEST.installationSteps),
    preparations: normalizeList(payload.preparations, DEFAULT_MANIFEST.preparations),
    downloads: normalizeDownloads(payload.downloads),
    releaseNotes: normalizeReleaseNotes(payload.releaseNotes)
  }
}

function createListItem(content) {
  const item = document.createElement('li')
  item.textContent = content
  return item
}

function renderList(targetId, items) {
  const container = document.getElementById(targetId)
  if (!container) return
  container.replaceChildren(...items.map(createListItem))
}

function renderDownloads(downloads, downloadHint) {
  const container = document.getElementById('download-buttons')
  const hintElement = document.getElementById('download-hint')
  if (!container) return

  const buttons = []

  const setupConicEffect = (button, label) => {
    const textNode = document.createElement('span')
    textNode.textContent = label
    textNode.style.position = 'relative'
    textNode.style.zIndex = '1'
    button.appendChild(textNode)

    button.addEventListener('mousemove', (e) => {
      const rect = button.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      button.style.setProperty('--x', `${x}px`)
      button.style.setProperty('--y', `${y}px`)
    })
  }

  downloads.forEach((item, index) => {
    const isPrimary = index === 0 || item.primary
    const button = document.createElement('a')
    button.className = isPrimary ? 'button-primary conic-btn' : 'button-secondary conic-btn'
    button.href = item.url
    setupConicEffect(button, item.label)
    buttons.push(button)
  })

  const logButton = document.createElement('a')
  const isLogPrimary = buttons.length === 0
  logButton.className = isLogPrimary ? 'button-primary conic-btn' : 'button-secondary conic-btn'
  logButton.href = '#update-log'
  setupConicEffect(logButton, '查看更新日志')

  buttons.push(logButton)

  container.replaceChildren(...buttons)

  if (hintElement) {
    const downloadNotes = downloads.map((item) => item.note).filter(Boolean)
    hintElement.textContent = downloadNotes[0] || downloadHint
  }
}

function renderReleaseNotes(releaseNotes) {
  const container = document.getElementById('release-log-list')
  if (!container) return

  if (!releaseNotes.length) {
    const emptyState = document.createElement('article')
    emptyState.className = 'log-item'
    emptyState.innerHTML = '<p class="log-desc">更新日志待补充。</p>'
    container.replaceChildren(emptyState)
    return
  }

  const nodes = releaseNotes.map((item) => {
    const article = document.createElement('article')
    article.className = 'log-item'

    const head = document.createElement('div')
    head.className = 'log-head'

    const version = document.createElement('span')
    version.className = 'log-version'
    version.textContent = `v${item.version}`

    const date = document.createElement('span')
    date.className = 'log-date'
    date.textContent = item.publishedAt || '待补充'

    head.append(version, date)

    const summary = document.createElement('p')
    summary.className = 'log-desc'
    summary.textContent = item.summary || '本版本更新内容待补充。'

    article.append(head, summary)

    if (item.changes.length) {
      const changes = document.createElement('ul')
      changes.className = 'log-changes'
      item.changes.forEach((change) => {
        const changeItem = document.createElement('li')
        changeItem.textContent = change
        changes.appendChild(changeItem)
      })
      article.appendChild(changes)
    }

    return article
  })

  container.replaceChildren(...nodes)
}

function renderManifest(manifest) {
  const pageTitle = document.getElementById('page-title')
  const heroDescription = document.getElementById('hero-description')
  const currentVersion = document.getElementById('current-version')
  const systemValue = document.getElementById('system-value')
  const packageType = document.getElementById('package-type')
  const recommendedEnvironment = document.getElementById('recommended-environment')
  const footerAppName = document.getElementById('footer-app-name')

  document.title = `${manifest.title}下载`
  if (pageTitle) pageTitle.textContent = manifest.title
  if (heroDescription) heroDescription.textContent = manifest.heroDescription
  if (currentVersion) currentVersion.textContent = manifest.latestVersion === '--' ? '--' : `v${manifest.latestVersion}`
  if (systemValue) systemValue.textContent = manifest.system
  if (packageType) packageType.textContent = manifest.packageType
  if (recommendedEnvironment) recommendedEnvironment.textContent = manifest.recommendedEnvironment
  if (footerAppName) footerAppName.textContent = manifest.appName

  renderDownloads(manifest.downloads, manifest.downloadHint)
  renderList('feature-list', manifest.features)
  renderList('installation-list', manifest.installationSteps)
  renderList('preparation-list', manifest.preparations)
  renderReleaseNotes(manifest.releaseNotes)
}

async function loadManifest() {
  try {
    const response = await fetch(MANIFEST_URL, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`版本清单加载失败（${response.status}）`)
    }
    const payload = await response.json()
    renderManifest(normalizeManifest(payload))
  } catch (_) {
    renderManifest(DEFAULT_MANIFEST)
  }
}

loadManifest()
