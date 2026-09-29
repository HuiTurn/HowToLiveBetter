const { getArticleById, getCategoryById, getRelatedArticles } = require('../../utils/data.js');
const { formatCount } = require('../../utils/util.js');
const app = getApp();

Page({
  data: {
    article: null,
    category: null,
    isFavorite: false,
    relatedArticles: [],
    formattedLikes: '',
    formattedViews: ''
  },

  onLoad(options) {
    const { id } = options || {};
    if (!id) {
      wx.showToast({ title: '缺少文章参数', icon: 'none' });
      return;
    }
    this.loadArticle(id);
  },

  loadArticle(id) {
    const article = getArticleById(id);
    if (!article) {
      wx.showToast({ title: '文章不存在', icon: 'none' });
      return;
    }

    const category = getCategoryById(article.categoryId);
    const favorites = app.globalData.favorites || [];
    const related = getRelatedArticles(id, 4).map(a => ({
      ...a,
      categoryName: getCategoryById(a.categoryId)?.name || '',
      categoryColor: getCategoryById(a.categoryId)?.color || '#333333',
      isFavorite: favorites.includes(a.id)
    }));

    app.addReadHistory(id);

    this.setData({
      article,
      category,
      isFavorite: favorites.includes(id),
      relatedArticles: related,
      formattedLikes: formatCount(article.likes),
      formattedViews: formatCount(article.views)
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
      relatedArticles: this.data.relatedArticles.map(a =>
        a.id === id ? { ...a, isFavorite: idx === -1 } : a
      )
    });
  },

  onFavorite() {
    const { article, isFavorite } = this.data;
    if (!article) return;

    const favorites = [...app.globalData.favorites];
    let newLikes = article.likes;

    if (isFavorite) {
      const idx = favorites.indexOf(article.id);
      if (idx > -1) favorites.splice(idx, 1);
      newLikes = Math.max(0, newLikes - 1);
      wx.showToast({ title: '已取消收藏', icon: 'none' });
    } else {
      favorites.push(article.id);
      newLikes += 1;
      wx.showToast({ title: '已收藏', icon: 'none' });
    }

    app.saveFavorites(favorites);

    this.setData({
      isFavorite: !isFavorite,
      'article.likes': newLikes,
      formattedLikes: formatCount(newLikes)
    });
  },

  onShareAppMessage() {
    const { article } = this.data;
    if (!article) {
      return {
        title: '人生指南 - 更好的生活，从每一个选择开始',
        path: '/pages/index/index',
        imageUrl: '/assets/images/splash.jpg'
      };
    }
    return {
      title: article.title,
      path: `/pagesA/article/article?id=${article.id}`,
      imageUrl: article.cover
    };
  },

  onShareTimeline() {
    const { article } = this.data;
    if (!article) return { title: '人生指南' };
    return {
      title: article.title,
      query: `id=${article.id}`,
      imageUrl: article.cover
    };
  }
});
