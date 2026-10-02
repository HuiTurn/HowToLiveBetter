/**
 * 主包数据层：只认 data/articles.js 这份「索引」
 *
 * 索引里有元信息和导语，没有条目正文——正文在分包 pagesA/data/steps.js。
 * 小程序只允许分包引用主包，反过来不行，所以主包这边拿不到 steps，
 * 需要条目的页面请改用 pagesA/utils/content.js。
 *
 * 这条边界是主包体积决定的：正文 1.3 MB 留在主包会顶破 2 MB 上限。
 */
const categories = require('../data/categories.js');
const articles = require('../data/articles.js');
const quotes = require('../data/quotes.js');

let _articleMap = null;
let _categoryMap = null;

const getCategoryMap = () => {
  if (!_categoryMap) {
    _categoryMap = {};
    categories.forEach(c => { _categoryMap[c.id] = c; });
  }
  return _categoryMap;
};

const getArticleMap = () => {
  if (!_articleMap) {
    _articleMap = {};
    articles.forEach(a => { _articleMap[a.id] = a; });
  }
  return _articleMap;
};

const getCategories = () => categories;

const getCategoryById = id => getCategoryMap()[id] || null;

const getArticles = (filters = {}) => {
  const { categoryId, subCategory, keyword } = filters;
  let list = [...articles];

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
  return articles
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
  const matchedArticles = articles.filter(a =>
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
const getTotalStepCount = () => articles.reduce((s, a) => s + (a.stepCount || 0), 0);

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
  getTotalStepCount
};
