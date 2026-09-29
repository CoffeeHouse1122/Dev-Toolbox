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
    '图片（9 项）：图标生成、图片转换、图片压缩、尺寸调整、自由裁剪、添加水印、图片占位符、Base64 图片、二维码生成',
    '音视频（8 项）：视频转化、视频动图、序列帧动图、视频去音频、视频压缩、视频循环播放（网页背景循环预览）、音频转换、音频压缩',
    '字体（4 项）：WOFF2 转换、字体预览、字体子集化、@font-face',
    '文本与样式（10 项）：Markdown、JSON/YAML/TOML、文本 Diff、JWT 解析、URL 编解码、CSS / JS 压缩、正则测试器、Clamp 字号、Base64 文本、颜色转换器',
    'SEO 发布（3 项）：robots / sitemap、HTML Meta、OG 图片',
    '文件与网络（6 项）：网站与文档、IP 查询、共享盘登录、文件重命名、资源清单、证书扫描',
    '开发者快捷（5 项）：时间戳、UUID、Hash / AES-GCM 加解密、剪贴板历史、桌面便签',
    '系统（2 项）：历史记录、设置（主题 / 字体 / 关闭行为 / 版本更新）'
  ],
  installationSteps: [
    '下载对应系统的安装包后运行安装程序，按向导选择安装目录即可。',
    '安装完成后双击桌面图标启动 Dev Toolbox。'
  ],
  preparations: [
    '确保设备满足最低系统要求（4GB 内存以上）。',
    '部分工具依赖本地二进制文件（如 ffmpeg），首次使用时会自动加载。'
  ],
  downloads: [{ label: '前往 GitHub 下载 Windows x64', url: 'https://github.com/CoffeeHouse1122/Dev-Toolbox/releases/latest', primary: true }],
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
