# mp-jump：网页跳小程序中转（Cloudflare Workers）

访问子域上的某个路径，返回一个落地页并自动拉起「人生指南库」小程序。
域名 `aipalnet.cn` 的 NS 已在 Cloudflare，可直接绑 Workers 自定义域。

## 为什么要有这一层

| 方式 | 微信外浏览器 | 微信内 |
|---|---|---|
| `weixin://dl/business/?appid=…` | ❌ Android 不识别 Scheme，浏览器当无效链接 | ⚠️ 需用户点击触发，且要先在后台声明 |
| `https://wxaurl.cn/xxx`（URL Link） | ✅ 走微信中间页后拉起 | ✅ |

所以 Worker 的工作是：调官方 `generate_urllink` 拿到短链 → 返回落地页 → 跳转。
结果按 path+query 缓存 29 天，`access_token` 缓存 6000 秒，不会每次访问都打微信接口。

## 电子书下载反代（第二个用途）

同一个 Worker 还兼作 GitHub Release 的下载加速：`/pdf` `/epub` `/html`（或 `/dl/<格式>`）。

**为什么需要**：小程序 `wx.downloadFile` 要求域名已 ICP 备案，github.com 无法备案，
所以下载走「复制链接 → 浏览器打开」；但国内直连 GitHub 常慢或超时。
反代后用户复制的是自己的域名，走 Cloudflare 出网更快。

- 上游 `eternity4719/HowToLiveBetter` 用**固定 tag `epub-latest`** 发布，每次覆盖同名资产
  → 链接长期有效，上游更新内容后无需改代码
- 文件名走白名单，只反代 EPUB / HTML / PDF 三个，不会被当成任意代理
- 转发 `Range` 头，支持断点续传；强制 `Content-Disposition: attachment` 保证是下载而非预览
- 边缘缓存 1 小时（`cacheEverything`）——上游会覆盖发布，缓存不能太长

验证：
```bash
curl -I https://dl.aipalnet.cn/pdf      # 200 + content-disposition 文件名
curl -I https://dl.aipalnet.cn/evil     # 404
```

确认能下载后，把小程序 `utils/download-config.js` 里的 `USE_MIRROR` 改成 `true`，
页面上的链接就整体切到加速域名（改回 `false` 即回退 GitHub 直链）。

## SEO：只优化 head 元数据，页面视觉不变

用户明确要求：页面保持「打开小程序」中转卡的展示不变，SEO 只做在 `<head>` 里
（爬虫看到完整的元信息，用户看到的还是原来那一屏）。

`renderPage` 的 head 现在包含：
- `<title>` 人生指南库 · 打开小程序（品牌词在前，30 字内）
- `description`：34 篇长文、665 条建议、八大主题、分类/搜索/收藏
- `keywords`：人生指南库 / HowToLiveBetter / 微信小程序 / 生活指南…
- `canonical`：当前地址去掉 query（避免 `?p=` 调试变体被当成重复页面）
- `robots: index,follow`、Open Graph（website）、Twitter Card（summary）、theme-color

文案集中在文件顶部的 `SEO` 常量里，要改措辞只动那一处。

```bash
curl -s https://dl.aipalnet.cn/ | grep -E "<title>|description|canonical|og:"   # 验证
```

## 路由规则

| 访问 | 打开 |
|---|---|
| `/` | 首页 `pages/home/home` |
| `/b01` · `/a/b01` · `/article/b01` | 文章详情 `pagesA/article/article?id=b01` |
| `/c/lifestyle` · `/category/lifestyle` | 分类详情 `pagesA/category-detail/category-detail?id=lifestyle` |
| `/daily` | 每日 `pagesA/daily/daily` |
| `/search?keyword=戒烟` | 搜索页 |
| `/classify` `/favorite` `/mine` `/download` `/help` `/about` | 对应页面 |
| `/?p=pagesA/article/article&q=id%3Db01` | 任意页面（调试用，受白名单限制） |

分类 id：`lifestyle` 生活习惯、`time` 时间管理、`finance` 财务理财、`life` 生活方式、
`relationships` 人际关系、`work` 高效工作、`mental` 心理健康、`learning` 学习成长。
文章 id：`b01`–`b34`。

## 部署

```bash
cd miniprogram/tools/mp-jump
npm i -D wrangler            # 或 npx wrangler 直接用
npx wrangler login           # 浏览器授权 Cloudflare 账号
npx wrangler secret put WX_APPID     # wx7fe49fd1287ff886
npx wrangler secret put WX_SECRET    # 小程序后台 → 开发 → 开发管理 → 开发设置 → AppSecret
npx wrangler deploy
```

绑定子域（两种选一）：
- 面板：Workers → mp-jump → Settings → Domains & Routes → Add → Custom domain → `mp.aipalnet.cn`
- 或 `wrangler.toml` 里已写好 `custom_domain = true`，deploy 时会自动创建

`wrangler.toml` 里配了两个自定义域：`mp.aipalnet.cn`（跳转）、`dl.aipalnet.cn`（下载）。
只想先跑一个就把另一行删掉。

验证：`curl https://mp.aipalnet.cn/_health` 返回 `ok`。

## errcode 40001：access_token is invalid or not latest

报错里带 **"or not latest"** 时，说明 token 不是过期，而是**被别人顶掉了**——微信同一 appid
只保证最新那一个 token 有效。Workers 在全球多个边缘节点运行，每个节点各缓存一份 token、
各自去刷新，就会互相作废对方的 token。

本 Worker 已按官方建议改用 `cgi-bin/stable_token`（`force_refresh: false`）：
同一 appid 下复用已有 token，多次获取**不会作废旧 token**，多节点并发也安全。
另外接口返回 40001 / 42001 时会清掉 token 缓存自动重试一次。

如果换成 stable_token 后仍然报 40001，按这个顺序查：

1. **是否有别处也在用同一个 AppSecret 取 token**——你自己的脚本、微信 API 调试台、
   另一个 Worker/服务器。任何一处调 `cgi-bin/token` 都会作废 Worker 手上的 token。
   把那些地方也换成 stable_token，或者给它们单独配置
2. **改用 KV 存 token**（彻底方案）：边缘节点的 `caches.default` 不跨节点共享，
   KV 是全局一致的。在 `wrangler.toml` 里绑定一个 KV namespace，把 token 读写换成 KV 即可
3. AppSecret 是否被重置过（后台重置后旧 token 立即失效）

## errcode 85407：个人主体不支持 URL Link

调用 `generate_urllink` 返回 `85407 no scheme permission`，基本等于**个人主体小程序**。
微信官方社区答复：URL Link / 加密 Scheme 只对「已认证的非个人主体」开放，个人主体无解。

Worker 已内置降级：拿不到 URL Link 时自动改调 `getwxacode` 生成**小程序码**并展示在落地页上。
`getwxacode` 是基础能力，个人主体可用，且 `path` 允许直接带 `?id=b01`，
**不需要改小程序代码去解析 scene**。限制：单个小程序累计最多 10 万个码，path ≤ 128 字符。

个人主体下的实际体验：

| 场景 | 表现 |
|---|---|
| 微信内打开链接 | 显示小程序码，长按 →「打开小程序」，直达目标页 |
| 微信外浏览器 | 显示小程序码，用微信扫一下 |
| 想一键直跳 | 需在后台声明「明文 Scheme 拉起此小程序」并开 `WX_FALLBACK_SCHEME=true`；Android 仍需点击触发 |

彻底解决只有一条路：把小程序主体升级为个体工商户/企业（有营业执照即可，
成本主要是注册费），升级后 URL Link 全线可用，Worker 主链路自动生效，无需再改代码。

## 前提条件

1. **小程序已发布上线**：开发版/体验版生成的链接/码普通用户打不开
2. **页面路径真实存在**：接口会校验，写错返回 41030
3. URL Link 有效期最长 30 天，过期自动重新生成；单日生成上限 50 万
4. 小程序码缓存 29 天，累计生成上限 10 万个

## 已知限制

- 微信外浏览器无法做到"无感自动跳转"：会先经过微信中间页，用户需再点一次
- iOS 上可能弹系统确认框，用户选择"不跳转"就打不开，落地页保留了手动按钮兜底
