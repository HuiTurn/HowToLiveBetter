/**
 * 分包数据层：索引（主包）+ 条目正文拼成完整文章
 *
 * 存在的理由：正文 1.3 MB，放主包会顶破 2 MB 上限，所以只留在分包。
 * 小程序允许分包引用主包，反过来不行，需要正文的页面必须走这里。
 *
 * 接口化后正文也是三级：Storage 缓存 → /api/steps/:id → 本地基线 steps.js。
 * 对外导出不变，页面不用改；详情页想主动拉新就调 fetchSteps(id)。
 */
const data = require('../../utils/data.js');
const stepMap = require('../data/steps.js');        // 本地基线正文
const store = require('../../utils/store.js');
const api = require('../../utils/api.js');

/** 带完整条目的文章；主包版的同名函数只有元信息 */
const getArticleById = (id) => {
  const meta = data.getArticleById(id);
  if (!meta) return null;
  return { ...meta, steps: getSteps(id) };
};

/** 正文取数：缓存 → 本地基线 */
const getSteps = (id) => {
  const cached = store.getSteps(id);
  if (Array.isArray(cached) && cached.length) return cached;
  return stepMap[id] || [];
};

/**
 * 主动拉正文（详情页用）：线上 rev 与本地不一致才用返回值刷新页面
 * @returns {Promise<{steps:Array, rev:number, updatedAt:string, changed:boolean}>}
 */
const fetchSteps = (id) => {
  if (!api.isEnabled()) return Promise.resolve({ steps: getSteps(id), rev: 0, changed: false });

  return api.getSteps(id)
    .then((res) => {
      if (!res || !Array.isArray(res.steps) || !res.steps.length) {
        return { steps: getSteps(id), rev: 0, changed: false };
      }
      const localRev = store.stepsRev(id);
      const changed = res.rev !== localRev;
      if (changed) store.setSteps(id, res.steps, res.rev);
      return { steps: res.steps, rev: res.rev, updatedAt: res.updatedAt, changed };
    })
    .catch(() => ({ steps: getSteps(id), rev: 0, changed: false }));
};

/** 全文检索：篇目标题/摘要/导语 + 条目的标题/说人话/成本/收益/备注（本地版，兜底用） */
const searchFull = (keyword) => {
  if (!keyword) return { articles: [], categories: [] };
  const k = keyword.toLowerCase();

  const hitStep = (s) =>
    (s.title && s.title.toLowerCase().includes(k)) ||
    (s.plain && s.plain.toLowerCase().includes(k)) ||
    (s.cost && s.cost.toLowerCase().includes(k)) ||
    (s.gain && s.gain.toLowerCase().includes(k)) ||
    (s.note && s.note.toLowerCase().includes(k));

  const matchedArticles = data.getArticles().filter((a) => {
    if ((a.title && a.title.toLowerCase().includes(k)) ||
        (a.summary && a.summary.toLowerCase().includes(k)) ||
        (a.content && a.content.some((c) => c.toLowerCase().includes(k)))) {
      return true;
    }
    return getSteps(a.id).some(hitStep);
  });

  const matchedCategories = data.getCategories().filter((c) =>
    (c.name && c.name.toLowerCase().includes(k)) ||
    (c.description && c.description.toLowerCase().includes(k))
  );

  return { articles: matchedArticles, categories: matchedCategories };
};

/**
 * 全文检索（服务端）：优先走 /api/search，不必把 1.8 MB 正文全量拉下来扫
 *
 * 返回结构与本地版保持一致（{articles, categories, steps?}），失败自动回落本地，
 * 页面拿到的形状永远一样，不用分两套渲染逻辑。
 */
const searchRemote = (keyword) => {
  if (!keyword) return Promise.resolve({ articles: [], categories: [] });
  if (!api.isEnabled()) return Promise.resolve(searchFull(keyword));

  return api.search(keyword)
    .then((res) => {
      if (!res || !Array.isArray(res.results)) return searchFull(keyword);
      const byId = {};
      res.results.forEach((r) => {
        if (!byId[r.id]) byId[r.id] = [];
        byId[r.id].push({ index: r.index, title: r.title, snippet: r.snippet });
      });
      const articles = data.getArticles().filter(a => byId[a.id]);
      const categories = data.getCategories().filter((c) =>
        (c.name && c.name.toLowerCase().includes(keyword.toLowerCase())) ||
        (c.description && c.description.toLowerCase().includes(keyword.toLowerCase()))
      );
      return { articles, categories, stepHits: byId, from: 'remote' };
    })
    .catch(() => searchFull(keyword));
};

module.exports = {
  /* 直接透传主包的元信息接口，页面不必同时引两份 */
  getCategories: data.getCategories,
  getCategoryById: data.getCategoryById,
  getArticles: data.getArticles,
  getRelatedArticles: data.getRelatedArticles,
  getSubCategories: data.getSubCategories,
  getTotalStepCount: data.getTotalStepCount,
  refreshArticles: data.refreshArticles,
  getDataStatus: data.getDataStatus,

  getArticleById,
  getSteps,
  fetchSteps,
  searchFull,
  searchRemote,
};
