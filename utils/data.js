/**
 * 主包数据层：索引（元信息 + 导语），条目正文在分包
 *
 * 索引里有元信息和导语，没有条目正文——正文在分包 pagesA/data/steps.js。
 * 小程序只允许分包引用主包，反过来不行，所以主包这边拿不到 steps，
 * 需要条目的页面请改用 pagesA/utils/content.js。
 *
 * 这条边界是主包体积决定的：正文 1.3 MB 留在主包会顶破 2 MB 上限。
 *
 * ── 三级取数（接口化后）──────────────────────────────
 *   1. 内存（当次会话已取过）
 *   2. Storage 缓存（utils/store.js，模块加载时同步读入，首屏即可用）
 *   3. 接口（utils/api.js，refreshArticles() 后台拉，拉到后写缓存并替换内存）
 *   4. 都没有 → 本地基线 data/articles.js（随包发布的那一份，内容是封存那一刻的）
 *
 * 对外导出的函数名和返回结构**保持不变**，页面代码不用动；
 * 变化只是「内容可能比包里的新」，以及多出 refreshArticles / getDataStatus 两个可选调用。
 */
const categories = require('../data/categories.js');
const baseline = require('../data/articles.js');   // 本地基线：接口与缓存都不可用时的兜底
const quotes = require('../data/quotes.js');
const store = require('./store.js');
const api = require('./api.js');

let _articleMap = null;
let _categoryMap = null;

/* 缓存里的索引（同步读入，可能为 null）；有就用缓存的，比基线新 */
let _cached = null;

/* 发版迁移：比对小程序版本号，变了先清旧接口缓存，让随包基线优先，再读缓存（此时多半已清） */
let _appVersion = '';
try {
  const info = wx.getAccountInfoSync();
  _appVersion = (info && info.miniProgram && info.miniProgram.version) || '';
} catch (e) { _appVersion = ''; }
store.migrateForAppVersion(_appVersion);

try {
  const c = store.getArticles();
  if (Array.isArray(c) && c.length) _cached = c;
} catch { _cached = null; }

/** 当前生效的索引：缓存 > 基线 */
const activeArticles = () => (_cached && _cached.length ? _cached : baseline);

/* 本地基线的封存时间：全篇 updatedAt 的最大值（同步脚本写入的上游最后提交时间） */
const BASELINE_UPDATED = baseline.reduce(
  (m, a) => (a.updatedAt && a.updatedAt > m ? a.updatedAt : m), ''
);

let _status = null;
const buildStatus = () => {
  const meta = store.getMeta();
  if (_cached && meta) {
    return { source: 'cache', version: meta.version || 0, updatedAt: meta.sourceUpdatedAt || '', syncedAt: meta.syncedAt || '' };
  }
  if (_cached) {
    return { source: 'cache', version: 0, updatedAt: _cached.reduce((m, a) => (a.updatedAt && a.updatedAt > m ? a.updatedAt : m), '') };
  }
  return { source: 'local', version: 0, updatedAt: BASELINE_UPDATED, syncedAt: '' };
};
const getStatus = () => {
  if (!_status) _status = buildStatus();
  return _status;
};

const getCategoryMap = () => {
  if (!_categoryMap) {
    _categoryMap = {};
    categories.forEach(c => { _categoryMap[c.id] = c; });
  }
  return _categoryMap;
};

/** 索引变了就要清掉 id → 文章的映射，否则 getArticleById 会返回旧对象 */
const invalidate = () => { _articleMap = null; };

const getArticleMap = () => {
  if (!_articleMap) {
    _articleMap = {};
    activeArticles().forEach(a => { _articleMap[a.id] = a; });
  }
  return _articleMap;
};

const getCategories = () => categories;

const getCategoryById = id => getCategoryMap()[id] || null;

const getArticles = (filters = {}) => {
  const { categoryId, subCategory, keyword } = filters;
  let list = [...activeArticles()];

  if (categoryId) {
    list = list.filter(a => a.categoryId === categoryId);
  }

  if (subCategory && subCategory !== '全部') {
    list = list.filter(a => a.subCategory === subCategory);
  }

  if (keyword) {
    const k = keyword.toLowerCase();
    list = list.filter(a =>
      (a.title && a.title.toLowerCase().includes(k)) ||
      (a.summary && a.summary.toLowerCase().includes(k)) ||
      (a.content && a.content.some(c => c.toLowerCase().includes(k)))
    );
  }

  return list;
};

const getArticleById = id => getArticleMap()[id] || null;

const getRelatedArticles = (articleId, limit = 4) => {
  const article = getArticleById(articleId);
  if (!article) return [];
  return activeArticles()
    .filter(a => a.id !== articleId && a.categoryId === article.categoryId)
    .slice(0, limit);
};

const getSubCategories = categoryId => {
  const category = getCategoryById(categoryId);
  return category ? category.subCategories : ['全部'];
};

const getDailyQuote = (dateStr) => {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < date.length; i++) {
    hash = ((hash << 5) - hash) + date.charCodeAt(i);
    hash = hash & hash;
  }
  const index = Math.abs(hash) % quotes.length;
  return quotes[index];
};

const getRandomQuote = () => {
  const index = Math.floor(Math.random() * quotes.length);
  return quotes[index];
};

/**
 * 索引层搜索：只匹配标题、摘要、导语
 *
 * 条目正文不在这里扫——它在分包。要全文检索请用 content.js 的 searchFull，
 * 首页实时搜索用这个版本，命中率够用且不拖慢主包。
 */
const searchAll = (keyword) => {
  if (!keyword) return { articles: [], categories: [] };
  const k = keyword.toLowerCase();
  const matchedArticles = activeArticles().filter(a =>
    (a.title && a.title.toLowerCase().includes(k)) ||
    (a.summary && a.summary.toLowerCase().includes(k)) ||
    (a.content && a.content.some(c => c.toLowerCase().includes(k)))
  );
  const matchedCategories = categories.filter(c =>
    (c.name && c.name.toLowerCase().includes(k)) ||
    (c.description && c.description.toLowerCase().includes(k))
  );
  return { articles: matchedArticles, categories: matchedCategories };
};

/** 全部条目数，取自索引上的 stepCount，主包不必加载正文就能算出来 */
const getTotalStepCount = () => activeArticles().reduce((s, a) => s + (a.stepCount || 0), 0);

/**
 * 后台刷新索引：先比对 /api/meta，版本变了才拉全量
 *
 * 页面不需要等它——拿不到更新时继续用缓存/基线渲染，下次进来自然生效。
 * @returns {Promise<{changed:boolean, reason:string}>} 永远 resolve，失败也 resolve(false)
 */
const refreshArticles = () => {
  if (!api.isEnabled()) return Promise.resolve({ changed: false, reason: 'disabled' });

  return api.getMeta()
    .then((meta) => {
      if (!meta || !meta.version) return { changed: false, reason: 'bad-meta' };
      const cur = store.getMeta();
      /* 版本没变：只更新时间口径（可能同一版本重新发布过），不重拉 60 KB */
      if (cur && cur.version === meta.version) {
        store.setMeta(meta);
        _status = { source: 'cache', version: meta.version, updatedAt: meta.sourceUpdatedAt || '', syncedAt: meta.syncedAt || '' };
        return { changed: false, reason: 'same-version' };
      }
      return api.getArticles()
        .then((res) => {
          const list = Array.isArray(res) ? res : res.articles;
          if (!Array.isArray(list) || !list.length) return { changed: false, reason: 'bad-articles' };
          _cached = list;
          invalidate();
          store.setArticles(list);
          store.setMeta(meta);
          /* 术语表顺手一起更新：体积小，且与索引同版本 */
          api.getGlossary().then((g) => {
            const arr = Array.isArray(g) ? g : g.glossary;
            if (Array.isArray(arr) && arr.length) store.setGlossary(arr);
          }).catch(() => {});
          _status = { source: 'api', version: meta.version, updatedAt: meta.sourceUpdatedAt || '', syncedAt: meta.syncedAt || '' };
          return { changed: true, reason: 'updated', version: meta.version };
        });
    })
    .catch((e) => ({ changed: false, reason: 'request-failed', error: e }));
};

module.exports = {
  getCategories,
  getCategoryById,
  getArticles,
  getArticleById,
  getRelatedArticles,
  getSubCategories,
  getDailyQuote,
  getRandomQuote,
  searchAll,
  getTotalStepCount,
  /* 接口化新增：refreshArticles 供 app.onLaunch / 页面 onShow 调用，getDataStatus 供展示更新时间 */
  refreshArticles,
  getDataStatus: getStatus
};
