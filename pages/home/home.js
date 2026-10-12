const { getCategories, searchAll, getTotalStepCount } = require('../../utils/data.js');
const daily = require('../../utils/daily.js');
const match = require('../../utils/match.js');
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
    totalSteps: 0,
    summary: {},
    updateText: '',
    updateSubText: '',
    latestDayText: '',
    latest: [],
    hasProfile: false,
    profileText: ''
  },

  onLoad() {
    this.loadCategories();
    this.loadDaily();
    /* 条目正文在分包，主包只取索引上的计数用于文案 */
    this.setData({ totalSteps: getTotalStepCount() });
  },

  onShow() {
    /* 调研完回来，hero 上要显示「已按你的处境推荐」 */
    this.loadProfile();
  },

  loadCategories() {
    const categories = getCategories().map(c => ({
      id: c.id,
      name: c.name,
      bgColor: CATEGORY_TINTS[c.id] || '#f5f5f5'
    }));
    this.setData({ categories });
  },

  loadDaily() {
    const summary = daily.getSummary();
    /* 顶部状态行：「今日更新 3条」——没更新就降级成最近一次更新的日期 */
    const updateText = summary.todayCount > 0
      ? `今日更新 ${summary.todayCount} 条`
      : `今日暂无更新`;
    /* 区块副标题：日期 + 条数 */
    const md = (s) => (s ? `${Number(s.slice(5, 7))}月${Number(s.slice(8, 10))}日` : '');
    const updateSubText = summary.todayCount > 0
      ? `${md(summary.today)} · ${summary.todayCount} 条新建议`
      : `最近更新 ${md(summary.latestDate)} · ${summary.latestCount} 条`;

    /* 列表条数与文案数字保持一致：今日更新几篇就列几篇（各取首条预览），避免“说 5 条只显 3 条” */
    const shownCount = summary.todayCount > 0 ? summary.todayCount : summary.latestCount;

    this.setData({
      summary,
      latest: daily.getLatestSteps(shownCount, 1),
      updateText,
      updateSubText,
      latestDayText: md(summary.latestDate)
    });
  },

  loadProfile() {
    const profile = match.getProfile();
    if (!match.hasProfile(profile)) {
      this.setData({ hasProfile: false, profileText: '' });
      return;
    }
    const labels = (profile.concerns || [])
      .map(cid => { const c = match.CONCERNS.find(x => x.id === cid); return c ? c.label : ''; })
      .filter(Boolean);
    const head = labels.slice(0, 2).join('、');
    this.setData({
      hasProfile: true,
      profileText: `已按你的关注点「${head}${labels.length > 2 ? ' 等' : ''}」为你推荐，可随时重做`
    });
  },

  onStartSurvey() {
    wx.navigateTo({ url: '/pagesB/survey/survey' });
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

  /** 「探索分类 › 全部」：跳分类 tab */
  onAllCategories() {
    wx.switchTab({ url: '/pages/classify/classify' });
  },

  onArticleTap(e) {
    const { id } = e.currentTarget.dataset;
    const step = e.currentTarget.dataset.step;
    /* 今日更新是条目级，点进去直接定位到那一条 */
    const q = step ? `?id=${id}&step=${step}` : `?id=${id}`;
    wx.navigateTo({
      url: `/pagesA/article/article${q}`
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
    this.loadDaily();
    wx.stopPullDownRefresh();
  },

  onShareAppMessage() {
    return {
      title: '发现让生活更好的选择丨人生指南库',
      path: '/pages/home/home',
      imageUrl: '/assets/images/splash.jpg'
    };
  },

  onShareTimeline() {
    return {
      title: '发现让生活更好的选择丨人生指南库',
      imageUrl: '/assets/images/splash.jpg'
    };
  }
});
