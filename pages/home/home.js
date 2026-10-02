const { getCategories, searchAll, getCategoryById, getTotalStepCount } = require('../../utils/data.js');
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
    categories: [],
    searchKeyword: '',
    searchResults: [],
    searching: false,
    totalSteps: 0
  },

  onLoad() {
    this.loadCategories();
    /* 条目正文在分包，主包只取索引上的计数用于文案 */
    this.setData({ totalSteps: getTotalStepCount() });
  },

  loadCategories() {
    const categories = getCategories().map(c => ({
      ...c,
      bgColor: CATEGORY_TINTS[c.id] || '#f5f5f5'
    }));
    this.setData({ categories });
  },

  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({ searchKeyword: keyword });
    if (!keyword) {
      this.setData({ searching: false, searchResults: [] });
      return;
    }
    const { articles } = searchAll(keyword);
    const favorites = app.globalData.favorites || [];
    this.setData({
      searching: true,
      searchResults: articles.slice(0, 10).map(a => ({
        ...a,
        isFavorite: favorites.includes(a.id)
      }))
    });
  },

  onSearchConfirm() {
    this.onFullSearch();
  },

  /**
   * 跳搜索页做全文检索
   *
   * 首页这里只匹配篇目标题/摘要/导语，条目正文在分包拿不到。
   * 想按条目内容找（比如搜「安全带」）就得进搜索页，那边能扫全部条目。
   */
  onFullSearch() {
    const keyword = this.data.searchKeyword;
    if (!keyword) return;
    wx.navigateTo({
      url: `/pagesA/search/search?keyword=${encodeURIComponent(keyword)}`
    });
  },

  onClearSearch() {
    this.setData({
      searchKeyword: '',
      searching: false,
      searchResults: []
    });
  },

  onCategoryTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pagesA/category-detail/category-detail?id=${id}`
    });
  },

  onDailyRead() {
    wx.navigateTo({
      url: '/pagesA/daily/daily'
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
      searchResults: this.data.searchResults.map(a =>
        a.id === id ? { ...a, isFavorite: idx === -1 } : a
      )
    });
  },

  onPullDownRefresh() {
    this.loadCategories();
    wx.stopPullDownRefresh();
  },

  onShareAppMessage() {
    return {
      title: '人生指南 - 发现让生活更好的选择',
      path: '/pages/home/home',
      imageUrl: '/assets/images/splash.jpg'
    };
  },

  onShareTimeline() {
    return {
      title: '人生指南 - 发现让生活更好的选择',
      imageUrl: '/assets/images/splash.jpg'
    };
  }
});
