const { getArticleById, getCategoryById } = require('../../utils/data.js');
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
    activeTab: 'article',
    tabs: [
      { key: 'article', label: '文章' },
      { key: 'category', label: '分类' }
    ],
    articles: [],
    categories: [],
    loading: false
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const favorites = app.globalData.favorites || [];
    const categoryMap = new Map();

    const articles = favorites.map(id => {
      const article = getArticleById(id);
      if (!article) return null;
      const cat = getCategoryById(article.categoryId);
      if (cat) {
        categoryMap.set(cat.id, (categoryMap.get(cat.id) || 0) + 1);
      }
      return {
        ...article,
        isFavorite: true,
        categoryName: cat?.name || '',
        categoryColor: cat?.color || '#4ba264'
      };
    }).filter(Boolean);

    const categories = [...categoryMap.entries()].map(([id, count]) => {
      const cat = getCategoryById(id);
      return {
        ...cat,
        articleCount: count,
        bgColor: CATEGORY_TINTS[id] || '#f5f5f5'
      };
    }).filter(Boolean);

    this.setData({ articles, categories });
  },

  onTabChange(e) {
    const { key } = e.currentTarget.dataset;
    this.setData({ activeTab: key });
  },

  onCardFavorite(e) {
    const { id } = e.detail;
    const favorites = (app.globalData.favorites || []).filter(fid => fid !== id);
    app.saveFavorites(favorites);
    this.loadData();
  },

  onCategoryTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pagesA/category-detail/category-detail?id=${id}`
    });
  },

  goExplore() {
    wx.switchTab({
      url: '/pages/home/home'
    });
  },

  onPullDownRefresh() {
    this.loadData();
    wx.stopPullDownRefresh();
  },

  onShareAppMessage() {
    return {
      title: '人生指南 - 发现让生活更好的选择',
      path: '/pages/home/home',
      imageUrl: '/assets/images/splash.jpg'
    };
  }
});
