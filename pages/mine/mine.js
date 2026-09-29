const app = getApp();

const DEFAULT_USER = {
  nickname: '人生探索者',
  avatar: '/assets/images/avatar.jpg',
  bio: '更好的生活，从现在开始'
};

Page({
  data: {
    userInfo: { ...DEFAULT_USER },
    menuList: [
      { id: 'favorites', icon: 'star', label: '我的收藏' },
      { id: 'history', icon: 'clock', label: '浏览历史' },
      { id: 'help', icon: 'info', label: '使用说明' },
      { id: 'about', icon: 'book', label: '关于我们' },
      { id: 'opensource', icon: 'github', label: '开源项目' },
      { id: 'feedback', icon: 'chat', label: '反馈建议' }
    ],
    favoriteCount: 0,
    historyCount: 0
  },

  onLoad() {
    this.setData({ userInfo: { ...DEFAULT_USER, ...(app.globalData.userInfo || {}) } });
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const favorites = app.globalData.favorites || [];
    const history = app.globalData.readHistory || [];
    this.setData({
      favoriteCount: favorites.length,
      historyCount: history.length
    });
  },

  onEditProfile() {
    const { userInfo } = this.data;
    wx.showModal({
      title: '编辑昵称',
      editable: true,
      placeholderText: '输入昵称（12 字以内）',
      content: userInfo.nickname,
      success: (res) => {
        if (!res.confirm) return;
        const nickname = (res.content || '').trim().slice(0, 12);
        if (!nickname) {
          wx.showToast({ title: '昵称不能为空', icon: 'none' });
          return;
        }
        const next = { ...userInfo, nickname };
        app.saveUserInfo(next);
        this.setData({ userInfo: next });
        wx.showToast({ title: '已保存', icon: 'none' });
      }
    });
  },

  onMenuTap(e) {
    const { item } = e.currentTarget.dataset;
    if (!item) return;

    if (item.id === 'opensource') {
      wx.setClipboardData({
        data: 'https://github.com/eternity4719/HowToLiveBetter',
        success: () => {
          wx.showToast({ title: '项目链接已复制', icon: 'none' });
        }
      });
      return;
    }

    if (item.id === 'favorites') {
      wx.switchTab({ url: '/pages/favorite/favorite' });
      return;
    }

    if (item.id === 'history') {
      wx.navigateTo({ url: '/pagesA/search/search?type=history' });
      return;
    }

    if (item.id === 'help' || item.id === 'about') {
      wx.navigateTo({ url: `/pagesA/${item.id}/${item.id}` });
      return;
    }
  },

  onShareAppMessage() {
    return {
      title: '人生指南 - 更好的生活，从每一个选择开始',
      path: '/pages/index/index',
      imageUrl: '/assets/images/splash.jpg'
    };
  }
});
