const { getCategories, getArticles } = require('../../utils/data.js');
const app = getApp();

Page({
  data: {
    tabs: [],
    current: 'lifestyle',
    articles: []
  },

  onLoad() {
    const categories = getCategories();
    this.setData({
      tabs: categories,
      current: categories[0] ? categories[0].id : ''
    });
    this.loadArticles();
  },

  onShow() {
    if (this.data.tabs.length) this.loadArticles();
  },

  loadArticles() {
    const favorites = app.globalData.favorites || [];
    const articles = getArticles({ categoryId: this.data.current }).map(a => ({
      ...a,
      isFavorite: favorites.includes(a.id)
    }));
    this.setData({ articles });
  },

  onTabTap(e) {
    const { id } = e.currentTarget.dataset;
    if (id === this.data.current) return;
    this.setData({ current: id });
    this.loadArticles();
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

  onPullDownRefresh() {
    this.loadArticles();
    wx.stopPullDownRefresh();
  },

  onShareAppMessage() {
    return {
      title: '全部分类丨人生指南库',
      path: '/pages/classify/classify',
      imageUrl: '/assets/images/splash.jpg'
    };
  },

  onShareTimeline() {
    return {
      title: '全部分类丨人生指南库',
      imageUrl: '/assets/images/splash.jpg'
    };
  }
});
