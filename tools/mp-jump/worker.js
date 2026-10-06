/**
 * 网页跳小程序的中转服务（Cloudflare Workers）
 *
 * 作用：访问 https://<你的子域>.aipalnet.cn/xxx 时，返回一个落地页并自动拉起小程序。
 *
 * 为什么不能直接在网页里写 weixin://
 *   - Android 不识别 URL Scheme，微信外网页必须走 URL Link（https://wxaurl.cn/xxx）
 *   - 明文 scheme 还要先在 MP 平台声明「明文 Scheme 拉起此小程序」，且只能用户点击触发
 *   - 所以这里统一走官方 generate_urllink 接口，拿到短链后再跳转
 *
 * 需要的 Worker 变量（用 wrangler secret 设置，不要写进代码）：
 *   WX_APPID   小程序 appid
 *   WX_SECRET  小程序 AppSecret
 *   可选 WX_ENV_VERSION：release（默认）/ trial / develop
 *   可选 WX_FALLBACK_SCHEME：'true' 时，URL Link 生成失败降级为明文 scheme
 *   可选 DEFAULT_PATH：根路径默认跳的页面，默认 pages/home/home
 *
 * 路由规则见 resolveTarget()
 */

const TOKEN_CACHE_TTL = 6000;   // access_token 有效期 7200s，留 20 分钟余量
const LINK_CACHE_TTL = 86400 * 29; // URL Link 最长 30 天，缓存 29 天
const QR_CACHE_TTL = 86400 * 29;   // 小程序码不会过期，缓存 29 天省调用
const UA_WECHAT = /micromessenger/i;

/* ---------- 路由：URL → 小程序页面 ---------- */

/* 白名单：只允许跳本项目已发布的小程序页面，防止开放重定向 */
const ALLOWED_PREFIX = ['pages/', 'pagesA/'];

function isAllowedPath(p) {
  return ALLOWED_PREFIX.some(prefix => p.startsWith(prefix)) && !/[\s"']/.test(p);
}

function resolveTarget(u) {
  const seg = u.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const q = u.searchParams;

  /* 显式指定：/?p=pagesA/article/article&q=id%3Db01 —— 调试用 */
  const p = (q.get('p') || '').trim();
  if (p) {
    if (!isAllowedPath(p)) return null;
    return { path: p, query: (q.get('q') || '').trim() };
  }

  if (!seg.length) return { path: 'pages/home/home', query: '' };

  const [a, b] = seg;
  const id = (q.get('id') || '').trim();

  /* /b01、/a/b01、/article/b01 → 文章详情 */
  const articleId = /^b\d{1,2}$/.test(a) ? a
    : (a === 'a' && /^b\d{1,2}$/.test(b)) ? b
    : (a === 'article') ? (b || id)
    : null;
  if (articleId) {
    if (!/^b\d{1,2}$/.test(articleId)) return null;
    return { path: 'pagesA/article/article', query: 'id=' + articleId };
  }

  /* /c/lifestyle、/category/lifestyle → 分类详情 */
  if ((a === 'c' || a === 'category') && (b || id)) {
    const cid = b || id;
    if (!/^[a-z]{2,20}$/.test(cid)) return null;
    return { path: 'pagesA/category-detail/category-detail', query: 'id=' + cid };
  }

  /* 固定页 */
  const fixed = {
    home: 'pages/home/home',
    classify: 'pages/classify/classify',
    favorite: 'pages/favorite/favorite',
    mine: 'pages/mine/mine',
    daily: 'pagesA/daily/daily',
    download: 'pagesA/download/download',
    help: 'pagesA/help/help',
    about: 'pagesA/about/about'
  };
  if (fixed[a]) return { path: fixed[a], query: '' };

  /* /search?keyword=xxx */
  if (a === 'search') {
    const kw = (q.get('keyword') || id || '').trim();
    return { path: 'pagesA/search/search', query: kw ? 'keyword=' + encodeURIComponent(kw) : '' };
  }

  return null;
}

/* ---------- 电子书下载：反代 GitHub Release ---------- */

/*
 * 小程序里 wx.downloadFile 要求域名已备案，github.com 没法备案，
 * 所以下载走「复制链接到浏览器」；但国内直连 GitHub 经常慢或超时，
 * 这里用 Worker 反代一份，用户复制的是自己的域名，走 Cloudflare 出网更快。
 *
 * 上游用固定 tag `epub-latest` 发布，每次覆盖同名资产，链接长期有效。
 */
const RELEASE_BASE =
  'https://github.com/eternity4719/HowToLiveBetter/releases/download/epub-latest';

/* 文件名白名单：只反代这三个，避免被当成任意代理 */
const RELEASE_FILES = {
  epub: { name: 'HowToLiveBetter.epub', type: 'application/epub+zip' },
  html: { name: 'HowToLiveBetter.html', type: 'text/html; charset=utf-8' },
  pdf: { name: 'HowToLiveBetter.pdf', type: 'application/pdf' }
};

/* 上游会用同一个 tag 覆盖发布，缓存别太长，1 小时足够 */
const DL_CACHE_TTL = 3600;

/* /pdf 、/dl/pdf 都识别成下载；其它路径返回 null 交给小程序跳转逻辑 */
function resolveDownloadKey(u) {
  const seg = u.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (!seg.length) return null;
  if (seg[0] === 'dl') return seg[1] && RELEASE_FILES[seg[1]] ? seg[1] : null;
  if (seg.length === 1 && RELEASE_FILES[seg[0]]) return seg[0];
  return null;
}

async function handleDownload(request, key) {
  const file = RELEASE_FILES[key];
  if (!file) return new Response('未知文件', { status: 404 });

  /* 转发 Range / If-Range，保证断点续传和大文件分段下载可用 */
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('cookie');

  const upstream = await fetch(`${RELEASE_BASE}/${file.name}`, {
    method: request.method,
    headers,
    redirect: 'follow',
    cf: { cacheTtl: DL_CACHE_TTL, cacheEverything: true }
  });

  const out = new Headers(upstream.headers);
  /* 上游返回的是 octet-stream，这里改成真实类型，浏览器好识别 */
  out.set('content-type', file.type);
  /* 不管上游给不给，统一强制下载并指定文件名 */
  out.set('content-disposition', `attachment; filename="${file.name}"`);
  out.set('cache-control', `public, max-age=${DL_CACHE_TTL}`);
  out.set('access-control-allow-origin', '*');

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: out
  });
}

/* ---------- 微信 API ---------- */

/*
 * 必须用 stable_token，不能用 cgi-bin/token。
 * 原因：微信只允许「最新」那一个 token 有效，而 Workers 跑在全球多个边缘节点，
 * 每个节点各缓存一份 token、各自去刷新，就会互相把对方的 token 顶掉，
 * 表现为 40001 invalid credential ... or not latest。
 * stable_token 在同一 appid 下复用已有 token（force_refresh=false 时不作废旧 token），
 * 多节点并发取也不会互相踢。
 */
let pendingToken = null; // 同一 isolate 内的并发去重

const TOKEN_KEY = 'https://mp-jump.internal/token';
const TOKEN_INVALID = [40001, 42001]; // token 无效 / 已过期

async function getAccessToken(env, cache) {
  const key = TOKEN_KEY;
  const hit = await cache.match(key);
  if (hit) return hit.text();
  if (pendingToken) return pendingToken;

  pendingToken = (async () => {
    try {
      const res = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credential',
          appid: env.WX_APPID,
          secret: env.WX_SECRET,
          force_refresh: false
        })
      });
      const json = await res.json();
      if (!json.access_token) throw new Error('stable_token failed: ' + JSON.stringify(json));

      await cache.put(key, new Response(json.access_token, {
        headers: { 'Cache-Control': `max-age=${TOKEN_CACHE_TTL}` }
      }));
      return json.access_token;
    } finally {
      pendingToken = null;
    }
  })();

  return pendingToken;
}

async function getUrlLink(env, cache, target) {
  const cacheKey = `https://mp-jump.internal/link?${target.path}?${target.query}`;
  const hit = await cache.match(cacheKey);
  if (hit) return { url: await hit.text(), cached: true };

  const call = async () => {
    const token = await getAccessToken(env, cache);
    const res = await fetch(`https://api.weixin.qq.com/wxa/generate_urllink?access_token=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        path: target.path,
        query: target.query,
        env_version: env.WX_ENV_VERSION || 'release',
        is_expire: true,
        expire_type: 1,
        expire_interval: 30
      })
    });
    return res.json();
  };
  let json = await call();
  if (TOKEN_INVALID.includes(json.errcode)) {
    /* 缓存里的 token 被别处顶掉了，清掉重取再试一次 */
    await cache.delete(TOKEN_KEY);
    json = await call();
  }
  if (!json.url_link) {
    /* 常见失败：41030（页面不存在/未发布）、非个人主体限制、path 非法 */
    return { error: json.errcode, errmsg: json.errmsg || 'generate_urllink failed' };
  }

  await cache.put(cacheKey, new Response(json.url_link, {
    headers: { 'Cache-Control': `max-age=${LINK_CACHE_TTL}` }
  }));
  return { url: json.url_link };
}

/* 明文 scheme 兜底：需先在 MP 平台声明「明文 Scheme 拉起此小程序」 */
function buildScheme(env, target) {
  const path = encodeURIComponent(target.path);
  const query = target.query ? '&query=' + encodeURIComponent(target.query) : '';
  return `weixin://dl/business/?appid=${env.WX_APPID}&path=${path}${query}`;
}

/* ---------- 小程序码：个人主体的可用方案 ---------- */

/*
 * getwxacode 是基础能力，个人主体也能调；且 path 允许直接带 query，
 * 所以不需要改小程序代码去解析 scene。
 * 限制：单个小程序累计最多 10 万个码（本项目几十个页面够用），path ≤ 128 字符。
 */
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function getWxaCode(env, cache, target) {
  const path = target.path + (target.query ? '?' + target.query : '');
  const cacheKey = `https://mp-jump.internal/qr?${path}`;
  const hit = await cache.match(cacheKey);
  if (hit) return { b64: await hit.text() };

  const call = async () => {
    const token = await getAccessToken(env, cache);
    return fetch(`https://api.weixin.qq.com/wxa/getwxacode?access_token=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, width: 430 })
    });
  };

  let res = await call();
  let buf = await res.arrayBuffer();
  let ct = res.headers.get('content-type') || '';
  let json = null;
  if (ct.includes('application/json') || ct.includes('text/plain')) {
    json = JSON.parse(new TextDecoder().decode(buf));
  }

  /* token 失效 → 清缓存重取后再试一次 */
  if (json && TOKEN_INVALID.includes(json.errcode)) {
    await cache.delete(TOKEN_KEY);
    res = await call();
    buf = await res.arrayBuffer();
    ct = res.headers.get('content-type') || '';
    json = null;
    if (ct.includes('application/json') || ct.includes('text/plain')) {
      json = JSON.parse(new TextDecoder().decode(buf));
    }
  }

  if (json) return { error: json.errcode, errmsg: json.errmsg || 'getwxacode failed' };

  const b64 = toBase64(buf);
  await cache.put(cacheKey, new Response(b64, {
    headers: { 'Cache-Control': `max-age=${QR_CACHE_TTL}` }
  }));
  return { b64 };
}

/* ---------- 落地页 ---------- */

/*
 * 页面视觉保持「打开小程序」中转卡不变；SEO 只做在 <head> 里：
 * 爬虫抓到的是完整的标题、描述、关键词和规范地址，用户看到的还是原来那一屏。
 */
const SEO = {
  name: '人生指南库',
  // title 控制在 30 字内，品牌词放前面，核心关键词「高性价比人生指南」紧跟其后
  title: '人生指南库 · 高性价比人生指南',
  desc:
    '「人生指南库」是一份高性价比人生指南：微信小程序内 34 篇长文、665 条可操作的生活建议，' +
    '每条都标注成本、收益与证据等级，帮你挑出真正划算的那几条；覆盖生活习惯、财务理财、' +
    '人际关系、心理健康等八大主题，支持分类浏览、全文搜索与收藏。',
  keywords:
    '高性价比人生指南,人生指南库,HowToLiveBetter,微信小程序,性价比建议,生活指南,自我提升,生活建议,电子书,离线阅读'
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function renderPage({ title, target, link, qr, scheme, errMsg, isWechat, url }) {
  const jump = link || '';
  const desc = errMsg
    ? `<p class="err">${errMsg}</p>`
    : `<p class="sub">目标页面：${target.path}${target.query ? '?' + target.query : ''}</p>`;

  /* canonical 指向当前地址（去掉调试参数），避免 ?p= 变体被当成重复页面 */
  const canonical = (() => {
    if (!url) return '';
    const u = new URL(url);
    return u.origin + u.pathname;
  })();

  /* 有短链 → 自动跳转；没有 → 展示小程序码让用户长按/扫码 */
  const body = jump
    ? `<a class="btn" id="go" href="${jump}">打开小程序</a>
       <p class="tip" id="tip">如果没有自动跳转，请点击上方按钮</p>`
    : (qr
      ? `<img class="qr" src="data:image/jpeg;base64,${qr}" alt="人生指南库小程序码（高性价比人生指南）">
         <p class="tip">${isWechat ? '长按上方小程序码，选择「打开小程序」' : '用微信扫上方小程序码'}</p>
         ${scheme ? `<a class="btn btn-ghost" href="${scheme}">已在微信中？点此尝试直接打开</a>` : ''}`
      : `<p class="tip">当前无法生成跳转入口，请到微信搜索「人生指南库」</p>`);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(SEO.title)}</title>
<meta name="description" content="${esc(SEO.desc)}">
<meta name="keywords" content="${esc(SEO.keywords)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta name="robots" content="index,follow">

<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SEO.name)}">
<meta property="og:locale" content="zh_CN">
<meta property="og:title" content="${esc(SEO.title)}">
<meta property="og:description" content="${esc(SEO.desc)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(SEO.title)}">
<meta name="twitter:description" content="${esc(SEO.desc)}">
<meta name="theme-color" content="#4ba264">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
       font:15px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
       background:#f5f6f7;color:#1f2328;padding:24px}
  .card{width:100%;max-width:420px;background:#fff;border-radius:16px;padding:36px 28px;text-align:center;
        box-shadow:0 4px 24px rgba(31,35,40,.08)}
  h1{font-size:19px;font-weight:600;margin-bottom:10px}
  .sub{font-size:13px;color:#6b7280;margin-bottom:22px;word-break:break-all}
  .err{font-size:13px;color:#c0392b;margin-bottom:18px}
  .btn{display:block;width:100%;height:46px;line-height:46px;border:none;border-radius:23px;
       background:#4ba264;color:#fff;font-size:16px;font-weight:500;text-decoration:none;cursor:pointer}
  .btn:active{opacity:.85}
  .btn-ghost{margin-top:14px;background:#fff;color:#4ba264;border:1px solid #4ba264}
  .tip{margin-top:16px;font-size:12px;color:#9ca3af}
  .qr{width:220px;height:220px;margin:0 auto 14px;display:block;border-radius:8px}
</style>
</head>
<body>
<div class="card">
  <h1>${jump ? '正在打开' : '打开'}「人生指南库」</h1>
  ${desc}
  ${body}
</div>
<script>
  var jump = ${JSON.stringify(jump)};
  var isWechat = ${isWechat ? 'true' : 'false'};
  if (jump) {
    if (isWechat) {
      // 微信内：直接跳转，落地页会被小程序盖住
      setTimeout(function(){ location.replace(jump); }, 100);
    } else {
      // 微信外：部分浏览器拦截自动跳转，仍然尝试一次，失败则由用户点按钮
      setTimeout(function(){
        try { location.href = jump; } catch (e) {}
      }, 300);
    }
  }
</script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cache = caches.default;

    /* 健康检查 */
    if (url.pathname === '/_health') {
      return new Response('ok', { headers: { 'content-type': 'text/plain' } });
    }

    /* 电子书下载反代：/pdf 、/epub 、/html （或 /dl/<格式>） */
    const dlKey = resolveDownloadKey(url);
    if (dlKey) return handleDownload(request, dlKey);

    const target = resolveTarget(url);
    if (!target) {
      return new Response('未知路径。可用：/ 、/b01 、/c/lifestyle 、/daily 、/?p=页面路径&q=参数', {
        status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }
    if (!env.WX_APPID || !env.WX_SECRET) {
      return new Response('未配置 WX_APPID / WX_SECRET', { status: 500 });
    }

    let link = '';
    let qrB64 = '';
    let scheme = '';
    let errMsg = '';
    const r = await getUrlLink(env, cache, target);
    if (r.url) {
      link = r.url;
    } else {
      /*
       * URL Link 拿不到时降级。85407 = 个人主体无权限（URL Link 只对非个人主体开放），
       * 这时改用小程序码：getwxacode 是基础能力，个人主体也能用。
       */
      const qr = await getWxaCode(env, cache, target);
      if (qr.b64) {
        qrB64 = qr.b64;
        errMsg = '';
      } else {
        errMsg = `无法生成跳转入口（URL Link：${r.error} ${r.errmsg}；小程序码：${qr.error} ${qr.errmsg}）`;
      }
      /* 后台声明过「明文 Scheme 拉起此小程序」的话，额外给一个直跳按钮 */
      if (env.WX_FALLBACK_SCHEME === 'true') scheme = buildScheme(env, target);
    }

    const ua = request.headers.get('user-agent') || '';
    const html = renderPage({
      target,
      link,
      qr: qrB64,
      scheme,
      errMsg,
      isWechat: UA_WECHAT.test(ua),
      url: request.url
    });

    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
};
