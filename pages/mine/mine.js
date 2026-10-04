const app = getApp();

const DEFAULT_USER = {
  nickname: '人生探索者',
  avatar: '/assets/images/avatar.jpg',
  bio: '更好的生活，从现在开始'
};

// 右上角「···」菜单里的入口名称，各平台统一为「添加到桌面」
const DESKTOP_GUIDE = {
  step2: '选择「添加到桌面」',
  tileText: '添加到桌面',
  tagline: '之后从手机桌面一键打开，随时查阅'
};

Page({
  data: {
    userInfo: { ...DEFAULT_USER },
    menuList: [
      { id: 'favorites', icon: 'star', label: '我的收藏' },
      { id: 'history', icon: 'clock', label: '浏览历史' },
      { id: 'desktop', icon: 'desktop', label: '添加到桌面' },
      { id: 'help', icon: 'info', label: '使用说明' },
      { id: 'download', icon: 'download', label: '离线下载' },
      { id: 'about', icon: 'book', label: '关于我们' },
      { id: 'opensource', icon: 'github', label: '开源项目' },
      { id: 'feedback', icon: 'chat', label: '反馈建议' }
    ],
    favoriteCount: 0,
    historyCount: 0,
    // 添加到桌面引导蒙层
    showGuide: false,
    guideStep2: '',
    guideTileText: '',
    guideTagline: '',
    ringTop: 0,
    ringLeft: 0,
    ringSize: 0,
    arrowTop: 0,
    arrowRight: 0
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
        data: 'https://github.com/HuiTurn/HowToLiveBetter',
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

    if (item.id === 'desktop') {
      this.showDesktopGuide();
      return;
    }

    if (item.id === 'download') {
      wx.navigateTo({ url: '/pagesA/download/download' });
      return;
    }

    if (item.id === 'help' || item.id === 'about') {
      wx.navigateTo({ url: `/pagesA/${item.id}/${item.id}` });
      return;
    }
  },

  // 与「分享到朋友圈」同款：高亮右上角胶囊，两步引导
  showDesktopGuide() {
    const { windowWidth } = wx.getSystemInfoSync();

    // 兜底：个别环境取不到胶囊位置
    const rect = (wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect()) || {
      top: 48,
      height: 32,
      left: windowWidth - 96
    };

    const centerX = rect.left + rect.height / 2;
    const ringSize = rect.height + 12;

    this.setData({
      showGuide: true,
      guideStep2: DESKTOP_GUIDE.step2,
      guideTileText: DESKTOP_GUIDE.tileText,
      guideTagline: DESKTOP_GUIDE.tagline,
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
    return {
      title: '更好的生活，从每一个选择开始丨人生指南库',
      path: '/pages/index/index',
      imageUrl: '/assets/images/splash.jpg'
    };
  }
});
