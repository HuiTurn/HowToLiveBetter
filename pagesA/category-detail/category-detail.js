const { getCategoryById, getSubCategories, getArticles } = require('../../utils/data.js');
const app = getApp();

Page({
  data: {
    category: null,
    subCategories: ['全部'],
    currentSub: '全部',
    articles: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 10
  },

  onLoad(options) {
    const { id } = options || {};
    if (!id) {
      wx.showToast({ title: '缺少分类参数', icon: 'none' });
      return;
    }
    this.loadCategory(id);
  },

  loadCategory(id) {
    const category = getCategoryById(id);
    if (!category) {
      wx.showToast({ title: '分类不存在', icon: 'none' });
      return;
    }

    const subCategories = getSubCategories(id);
    this.setData({
      category,
      subCategories,
      page: 1,
      hasMore: true
    });

    this.loadArticles(true);
  },

  loadArticles(reset = false) {
    const { category, currentSub, page, pageSize } = this.data;
    if (this.data.loading) return;

    this.setData({ loading: true });

    const favorites = app.globalData.favorites || [];
    const allArticles = getArticles({ categoryId: category.id, subCategory: currentSub });
    const start = (page - 1) * pageSize;
    const list = allArticles.slice(start, start + pageSize).map(a => ({
      ...a,
      isFavorite: favorites.includes(a.id)
    }));

    setTimeout(() => {
      this.setData({
        articles: reset ? list : [...this.data.articles, ...list],
        loading: false,
        hasMore: start + pageSize < allArticles.length
      });
      if (reset) wx.stopPullDownRefresh();
    }, 300);
  },

  onSubTap(e) {
    const { name } = e.currentTarget.dataset;
    if (name === this.data.currentSub) return;
    this.setData({
      currentSub: name,
      page: 1,
      hasMore: true,
      articles: []
    });
    this.loadArticles(true);
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

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.loadArticles();
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true, articles: [] });
    this.loadArticles(true);
  },

  onShareAppMessage() {
    const { category } = this.data;
    if (!category) {
      return {
        title: '更好的生活，从每一个选择开始丨人生指南库',
        path: '/pages/index/index',
        imageUrl: '/assets/images/splash.jpg'
      };
    }
    return {
      title: `${category.name}丨人生指南库`,
      path: `/pagesA/category-detail/category-detail?id=${category.id}`,
      imageUrl: '/assets/images/splash.jpg'
    };
  },

  onShareTimeline() {
    const { category } = this.data;
    if (!category) return { title: '人生指南库' };
    return {
      title: `${category.name}丨人生指南库`,
      query: `id=${category.id}`,
      imageUrl: '/assets/images/splash.jpg'
    };
  }
});
