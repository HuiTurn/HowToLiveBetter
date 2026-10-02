/**
 * 分包数据层：索引（主包）+ 条目正文（本分包）拼成完整文章
 *
 * 存在的理由：正文 1.3 MB，放主包会顶破 2 MB 上限，所以只留在分包。
 * 小程序允许分包引用主包，反过来不行，需要正文的页面必须走这里。
 *
 * 用法上和 utils/data.js 保持一致，只是 getArticleById 返回的对象带 steps，
 * 另有 searchFull 做全文检索。
 */
const data = require('../../utils/data.js');
const stepMap = require('../data/steps.js');

/** 带完整条目的文章；主包版的同名函数只有元信息 */
const getArticleById = (id) => {
  const meta = data.getArticleById(id);
  if (!meta) return null;
  return { ...meta, steps: stepMap[id] || [] };
};

/** 全文检索：篇目标题/摘要/导语 + 条目的标题/说人话/成本/收益/备注 */
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
    return (stepMap[a.id] || []).some(hitStep);
  });

  const matchedCategories = data.getCategories().filter((c) =>
    (c.name && c.name.toLowerCase().includes(k)) ||
    (c.description && c.description.toLowerCase().includes(k))
  );

  return { articles: matchedArticles, categories: matchedCategories };
};

module.exports = {
  /* 直接透传主包的元信息接口，页面不必同时引两份 */
  getCategories: data.getCategories,
  getCategoryById: data.getCategoryById,
  getArticles: data.getArticles,
  getRelatedArticles: data.getRelatedArticles,
  getSubCategories: data.getSubCategories,
  getTotalStepCount: data.getTotalStepCount,

  getArticleById,
  searchFull,
};
