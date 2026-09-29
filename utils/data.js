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

const searchAll = (keyword) => {
  if (!keyword) return { articles: [], categories: [] };
  const k = keyword.toLowerCase();
  const matchedArticles = articles.filter(a =>
    (a.title && a.title.toLowerCase().includes(k)) ||
    (a.summary && a.summary.toLowerCase().includes(k)) ||
    (a.content && a.content.some(c => c.toLowerCase().includes(k))) ||
    (a.steps && a.steps.some(s =>
      (s.title && s.title.toLowerCase().includes(k)) ||
      (s.desc && s.desc.toLowerCase().includes(k))
    ))
  );
  const matchedCategories = categories.filter(c =>
    (c.name && c.name.toLowerCase().includes(k)) ||
    (c.description && c.description.toLowerCase().includes(k))
  );
  return { articles: matchedArticles, categories: matchedCategories };
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
  searchAll
};
