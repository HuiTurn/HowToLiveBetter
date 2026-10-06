const { getArticleById, getCategoryById, getRelatedArticles } = require('../utils/content.js');
const app = getApp();

/* 标签文案映射，与上游检索页 index.html 的 LABEL / LENS_LABEL 保持一致 */
const LENS_LABEL = { '死亡率': '换寿命', '金钱': '换钱', '时间': '换时间精力', '自由': '换人身自由' };
const COST_LABEL = {
  money: { '0': '不花钱', '少': '花少量钱', '多': '花不少钱' },
  time: { '少': '顺手', '中': '花几小时', '多': '每天占时间' },
  will: { '否': '不用毅力', '些': '要一点毅力', '是': '要很多毅力' }
};
const RATIO_KEY = { '极高': 3, '高': 2, '一般': 1 };

/*
 * 上游 md 的 **加粗** 标记：拆成 runs 交给 WXML 用嵌套 <text> 渲染，
 * 奇数下标是加粗段。数据文件保留原始星号（全文检索要能匹配原文），
 * 只在渲染这一层解析。
 */
const parseRuns = (text) => {
  if (!text || text.indexOf('**') === -1) return [{ t: text || '' }];
  return text
    .split('**')
    .map((seg, i) => ({ t: seg, b: i % 2 === 1 }))
    .filter(run => run.t !== '');
};

/* 把数据层的档位翻成可直接渲染的文案，顺带挂上折叠状态 */
const decorateSteps = steps => (steps || []).map(s => {
  const m = s.meta || {};
  return {
    ...s,
    open: false,
    lensText: LENS_LABEL[m.lens] || m.lens || '',
    costTags: [COST_LABEL.money[m.money], COST_LABEL.time[m.time], COST_LABEL.will[m.will]].filter(Boolean),
    ratioKey: RATIO_KEY[m.ratio] || 1,
    gainRuns: parseRuns(s.gain),
    noteRuns: parseRuns(s.note)
  };
});

Page({
  data: {
    article: null,
    category: null,
    isFavorite: false,
    isLiked: false,
    burstShow: false,
    burstX: 0,
    burstY: 0,
    starPop: false,
    showGuide: false,
    ringTop: 0,
    ringLeft: 0,
    ringSize: 0,
    arrowTop: 0,
    arrowRight: 0,
    relatedArticles: []
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
    const article = {
      ...raw,
      steps: decorateSteps(raw.steps),
      /* 导语段里的 **加粗** 同样在渲染层解析 */
      content: (raw.content || []).map(parseRuns)
    };

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
      isLiked: (wx.getStorageSync('likedArticles') || []).includes(id),
      relatedArticles: related
    });
  },

  /* 双击正文点赞：300ms 内两次 tap 视为双击 */
  onContentTap(e) {
    const now = Date.now();
    if (this._lastTap && now - this._lastTap < 300) {
      this._lastTap = 0;
      this.onDoubleLike(e);
    } else {
      this._lastTap = now;
    }
  },

  onDoubleLike(e) {
    const { article, isLiked } = this.data;
    if (!article) return;

    const p = (e.detail && e.detail.clientX != null) ? e.detail : ((e.touches && e.touches[0]) || {});
    this.setData({ burstShow: true, burstX: p.clientX || 0, burstY: p.clientY || 0 });
    setTimeout(() => this.setData({ burstShow: false }), 700);

    if (isLiked) return;
    const liked = wx.getStorageSync('likedArticles') || [];
    if (liked.includes(article.id)) return;
    liked.push(article.id);
    wx.setStorageSync('likedArticles', liked);

    this.setData({ isLiked: true });
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

    if (isFavorite) {
      const idx = favorites.indexOf(article.id);
      if (idx > -1) favorites.splice(idx, 1);
      wx.showToast({ title: '已取消收藏', icon: 'none' });
    } else {
      favorites.push(article.id);
      wx.showToast({ title: '已收藏', icon: 'none' });
    }

    app.saveFavorites(favorites);

    this.setData({
      isFavorite: !isFavorite,
      starPop: true
    });
    setTimeout(() => this.setData({ starPop: false }), 320);
  },

  onShowTimelineGuide() {
    const rect = wx.getMenuButtonBoundingClientRect();
    const { windowWidth } = wx.getSystemInfoSync();
    const centerX = rect.left + rect.height / 2;
    const ringSize = rect.height + 12;
    this.setData({
      showGuide: true,
      ringSize,
      ringTop: rect.top + rect.height / 2 - ringSize / 2,
      ringLeft: centerX - ringSize / 2,
      arrowTop: rect.top + rect.height + 42,
      arrowRight: windowWidth - centerX - 2
    });
  },

  onCloseGuide() {
    this.setData({ showGuide: false });
  },

  onShareAppMessage() {
    const { article } = this.data;
    if (!article) {
      return {
        title: '更好的生活，从每一个选择开始丨人生指南库',
        path: '/pages/index/index',
        imageUrl: '/assets/images/splash.jpg'
      };
    }
    return {
      title: `${article.title}丨人生指南库`,
      path: `/pagesA/article/article?id=${article.id}`,
      imageUrl: article.cover
    };
  },

  onShareTimeline() {
    const { article } = this.data;
    if (!article) return { title: '人生指南库' };
    return {
      title: `${article.title}丨人生指南库`,
      query: `id=${article.id}`,
      imageUrl: article.cover
    };
  }
});
