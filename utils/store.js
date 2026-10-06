/**
 * Storage 缓存层（接口数据的落地位置）
 *
 * 取数优先级是「内存 → Storage 缓存 → 接口 → 本地基线」，这一层管第二级：
 * 命中缓存就能秒开、断网也能看，不必每次都等网络。
 *
 * 容量：微信 Storage 总上限 10 MB、单 key 1 MB。34 篇正文约 1.4 MB，
 * 这里按 6 MB 设软上限，超了按 LRU 淘汰「正文」类 key，
 * 索引和术语永远保留（它们小且是首屏必需）。
 *
 * key 约定：htlb:<name>，正文是 htlb:steps:<id>
 */
const PREFIX = 'htlb:';
const SOFT_LIMIT = 6 * 1024 * 1024;   // 6 MB
/* 永不淘汰：首屏必需且体积小；appVer 是版本迁移标记，也不能被淘汰 */
const KEEP = ['meta', 'articles', 'glossary', 'appVer'];

const k = (name) => PREFIX + name;
const stepsKey = (id) => k(`steps:${id}`);
const metaKey = (name) => k(`meta:${name}`);   // 记录每个数据块的 version / 写入时间

let index = null;   // { key: { ts, size } }

const loadIndex = () => {
  if (!index) {
    try { index = wx.getStorageSync(k('lru')) || {}; } catch { index = {}; }
  }
  return index;
};

const saveIndex = () => {
  try { wx.setStorageSync(k('lru'), index); } catch { /* 写不进就放弃索引，不影响数据 */ }
};

/** 粗略估算 UTF-8 字节数（Storage 按字节算，中文 3 字节） */
const byteLen = (s) => s.replace(/[\u0080-\u07ff]/g, 'aa').replace(/[\u0800-\uffff]/g, 'aaa').length;

const usage = () => Object.values(loadIndex()).reduce((s, it) => s + (it.size || 0), 0);

function set(name, value) {
  const key = k(name);
  let str;
  try {
    str = JSON.stringify(value);
  } catch {
    return false;
  }
  const size = byteLen(str);
  /* 单 key 逼近 1 MB 就别写了，写了也会失败 */
  if (size > 900 * 1024) return false;
  try {
    wx.setStorageSync(key, str);
  } catch {
    return false;
  }
  const idx = loadIndex();
  idx[key] = { ts: Date.now(), size };
  saveIndex();
  evictIfNeeded();
  return true;
}

function get(name) {
  let str;
  try {
    str = wx.getStorageSync(k(name));
  } catch {
    return null;
  }
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    /* 缓存坏了就当没有，别让页面崩 */
    del(name);
    return null;
  }
}

function del(name) {
  const key = k(name);
  try { wx.removeStorageSync(key); } catch { /* ignore */ }
  const idx = loadIndex();
  delete idx[key];
  saveIndex();
}

/** LRU 淘汰正文：永远不动 KEEP 里的三个 key */
function evictIfNeeded() {
  const idx = loadIndex();
  let total = usage();
  if (total <= SOFT_LIMIT) return;
  const candidates = Object.keys(idx)
    .filter(key => !KEEP.some(n => key === k(n)))
    .sort((a, b) => (idx[a].ts || 0) - (idx[b].ts || 0));
  for (const key of candidates) {
    if (total <= SOFT_LIMIT) break;
    try { wx.removeStorageSync(key); } catch { /* ignore */ }
    total -= idx[key].size || 0;
    delete idx[key];
  }
  saveIndex();
}

/* ---------- 语义化封装：上层不用自己拼 key ---------- */

const getMeta = () => get('meta');
const setMeta = (m) => set('meta', m);

const getArticles = () => get('articles');
const setArticles = (list) => set('articles', list);

const getGlossary = () => get('glossary');
const setGlossary = (g) => set('glossary', g);

const getSteps = (id) => get(`steps:${id}`);

/** 正文按 rev 存：rev 没变就不用重写，省 Storage 写入 */
const setSteps = (id, steps, rev) => {
  const prev = get(metaKey(`steps:${id}`));
  if (prev && prev.rev === rev) return true;
  const ok = set(`steps:${id}`, steps);
  if (ok) set(metaKey(`steps:${id}`), { rev, ts: Date.now() });
  return ok;
};

const stepsRev = (id) => (get(metaKey(`steps:${id}`)) || {}).rev || 0;

const clearAll = () => {
  const idx = loadIndex();
  Object.keys(idx).forEach(key => { try { wx.removeStorageSync(key); } catch { /* ignore */ } });
  index = {};
  saveIndex();
};

/**
 * 绑定小程序版本号：发版后清掉旧版接口缓存，让随包基线优先
 *
 * 否则存量用户本地 Storage 里的旧缓存会一直压住新包里的 data/articles.js /
 * steps.js（data.js 里 _cached 优先级高于 baseline），导致「发版更新数据」对老用户
 * 失效，要等数据版本号 bump 才生效。
 *
 * 做法：模块加载时比对版本号，变了就清掉 articles/glossary/meta 与所有 steps 缓存，
 * 本次启动回落到随包基线；之后 refreshArticles 若发现数据版本更新会重新灌缓存。
 *
 * ⚠️ 开发者工具里 miniProgram.version 为空字符串，此时跳过（开发态不按「发版」处理，
 *    否则每次编译都清缓存、看不到接口缓存效果）。
 *
 * @param {string} currentVersion 当前小程序版本号（wx.getAccountInfoSync().miniProgram.version）
 * @returns {boolean} true 表示发生了版本升级并清了缓存
 */
const APPVER_KEY = 'appVer';

const migrateForAppVersion = (currentVersion) => {
  if (!currentVersion) return false;            // 开发态/取不到版本，跳过
  const prev = get(APPVER_KEY);
  if (prev === currentVersion) return false;    // 版本没变，不动
  del('articles');
  del('glossary');
  del('meta');
  const idx = loadIndex();
  Object.keys(idx)
    .filter(key => key.startsWith(k('steps:')))
    .forEach((key) => { try { wx.removeStorageSync(key); } catch { /* ignore */ } delete idx[key]; });
  saveIndex();
  set(APPVER_KEY, currentVersion);
  return !!prev;                                // true 表示发生了版本升级
};

module.exports = {
  get, set, del, usage, clearAll,
  migrateForAppVersion,
  getMeta, setMeta,
  getArticles, setArticles,
  getGlossary, setGlossary,
  getSteps, setSteps, stepsRev,
  stepsKey
};
