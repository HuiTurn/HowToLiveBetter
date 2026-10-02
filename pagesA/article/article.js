const { getArticleById, getCategoryById, getRelatedArticles } = require('../utils/content.js');
const { formatCount } = require('../../utils/util.js');
const app = getApp();

/* 标签文案映射，与上游检索页 index.html 的 LABEL / LENS_LABEL 保持一致 */
const LENS_LABEL = { '死亡率': '换寿命', '金钱': '换钱', '时间': '换时间精力', '自由': '换人身自由' };
const COST_LABEL = {
  money: { '0': '不花钱', '少': '花少量钱', '多': '花不少钱' },
  time: { '少': '顺手', '中': '花几小时', '多': '每天占时间' },
  will: { '否': '不用毅力', '些': '要一点毅力', '是': '要很多毅力' }
};
const RATIO_KEY = { '极高': 3, '高': 2, '一般': 1 };

/* 把数据层的档位翻成可直接渲染的文案，顺带挂上折叠状态 */
const decorateSteps = steps => (steps || []).map(s => {
  const m = s.meta || {};
  return {
    ...s,
    open: false,
    lensText: LENS_LABEL[m.lens] || m.lens || '',
    costTags: [COST_LABEL.money[m.money], COST_LABEL.time[m.time], COST_LABEL.will[m.will]].filter(Boolean),
    ratioKey: RATIO_KEY[m.ratio] || 1
  };
});

Page({
  data: {
    article: null,
    category: null,
    isFavorite: false,
    starPop: false,
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
    const raw = getArticleById(id);
    if (!raw) {
      wx.showToast({ title: '文章不存在', icon: 'none' });
      return;
    }
    const article = { ...raw, steps: decorateSteps(raw.steps) };

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

  /* 展开/收起某条目的「收益与备注」，只更新这一条的字段 */
  onToggleStep(e) {
    const idx = e.currentTarget.dataset.idx;
    if (idx === undefined || !this.data.article) return;
    const key = `article.steps[${idx}].open`;
    this.setData({ [key]: !this.data.article.steps[idx].open });
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
      formattedLikes: formatCount(newLikes),
      starPop: true
    });
    setTimeout(() => this.setData({ starPop: false }), 320);
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
