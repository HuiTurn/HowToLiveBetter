const { searchRemote, getArticleById, getCategoryById } = require('../utils/content.js');
const { getStatusBarHeight } = require('../../utils/util.js');
const app = getApp();

const CATEGORY_TINTS = {
  lifestyle: '#dcefd8',
  learning: '#dbeffe',
  work: '#fdedd9',
  relationships: '#f2e3fe',
  mental: '#fee3e4',
  finance: '#fff1d4',
  time: '#dfe9fd',
  life: '#ffe9d5'
};

Page({
  data: {
    statusBarHeight: 20,
    keyword: '',
    articles: [],
    categories: [],
    historyArticles: [],
    hotKeywords: ['焦虑', '理财', '健康', '睡眠', '拖延', '保险', '急救', '法律'],
    tabs: ['全部', '文章', '分类'],
    activeTab: '全部',
    loading: false,
    hasResult: false
  },

  onLoad(options) {
    const { type } = options || {};
    const keyword = options && options.keyword ? decodeURIComponent(options.keyword) : '';
    this.setData({
      statusBarHeight: getStatusBarHeight(),
      historyArticles: this.buildHistory()
    });

    if (keyword) {
      this.setData({ keyword });
      this.doSearch(keyword);
    } else if (type === 'history') {
      this.loadHistory();
    }
  },

  buildHistory() {
    const history = app.globalData.readHistory || [];
    return history.slice(0, 5).map(id => getArticleById(id)).filter(Boolean);
  },

  loadHistory() {
    const history = app.globalData.readHistory || [];
    const favorites = app.globalData.favorites || [];
    const articles = history.slice(0, 50).map(id => getArticleById(id)).filter(Boolean).map(a => ({
      ...a,
      isFavorite: favorites.includes(a.id),
      categoryName: getCategoryById(a.categoryId)?.name || ''
    }));

    this.setData({
      keyword: '浏览历史',
      articles,
      categories: [],
      hasResult: true
    });
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchConfirm() {
    const { keyword } = this.data;
    if (!keyword.trim()) return;
    this.doSearch(keyword);
  },

  onClear() {
    this.setData({
      keyword: '',
      articles: [],
      categories: [],
      hasResult: false,
      activeTab: '全部'
    });
  },

  onCancel() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/home/home' })
    });
  },

  onTabTap(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  onTagTap(e) {
    const { text } = e.currentTarget.dataset;
    this.setData({ keyword: text });
    this.doSearch(text);
  },

  doSearch(keyword) {
    this.setData({ loading: true, activeTab: '全部' });

    /*
     * 全文检索走服务端（/api/search）：否则要把 1.8 MB 正文全量拉下来才能搜，得不偿失。
     * 接口不可用会自动回落本地扫描，返回结构一致，页面不用分两套逻辑。
     */
    setTimeout(() => {
      searchRemote(keyword).then(({ articles, categories }) => {
        const favorites = app.globalData.favorites || [];
        const enrichedArticles = articles.map(a => ({
          ...a,
          isFavorite: favorites.includes(a.id),
          categoryName: getCategoryById(a.categoryId)?.name || ''
        }));
        const enrichedCategories = categories.map(c => ({
          ...c,
          bgColor: CATEGORY_TINTS[c.id] || '#f5f5f5'
        }));

        this.setData({
          articles: enrichedArticles,
          categories: enrichedCategories,
          hasResult: true,
          loading: false
        });
      });
    }, 300);
  },

  onArticleTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pagesA/article/article?id=${id}`
    });
  },

  onCategoryTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pagesA/category-detail/category-detail?id=${id}`
    });
  },

  onCardFavorite(e) {
    const { id } = e.detail;
    const favorites = [...(app.globalData.favorites || [])];
    const idx = favorites.indexOf(id);
    if (idx > -1) {
      favorites.splice(idx, 1);
    } else {
      favorites.push(id);
    }
    app.saveFavorites(favorites);

    this.setData({
      articles: this.data.articles.map(a =>
        a.id === id ? { ...a, isFavorite: idx === -1 } : a
      )
    });
  },

  onShareAppMessage() {
    const { keyword } = this.data;
    return {
      title: keyword ? `搜索「${keyword}」丨人生指南库` : '搜索丨人生指南库',
      path: `/pagesA/search/search?keyword=${encodeURIComponent(keyword)}`,
      imageUrl: '/assets/images/splash.jpg'
    };
  },

  onShareTimeline() {
    const { keyword } = this.data;
    return {
      title: keyword ? `搜索「${keyword}」丨人生指南库` : '搜索丨人生指南库',
      query: `keyword=${encodeURIComponent(keyword)}`,
      imageUrl: '/assets/images/splash.jpg'
    };
  }
});
