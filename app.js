App({
  globalData: {
    userInfo: null,
    favorites: [],
    readHistory: []
  },

  onLaunch() {
    this.loadStorage();
    this.tryUpdate();
  },

  onShow() {
    this.loadStorage();
  },

  loadStorage() {
    try {
      const favorites = wx.getStorageSync('favorites') || [];
      const readHistory = wx.getStorageSync('readHistory') || [];
      const userInfo = wx.getStorageSync('userInfo') || null;
      this.globalData.favorites = favorites;
      this.globalData.readHistory = readHistory;
      this.globalData.userInfo = userInfo;
    } catch (e) {
      console.error('读取本地缓存失败', e);
    }
  },

  saveFavorites(favorites) {
    this.globalData.favorites = favorites;
    wx.setStorageSync('favorites', favorites);
  },

  saveUserInfo(userInfo) {
    this.globalData.userInfo = userInfo;
    wx.setStorageSync('userInfo', userInfo);
  },

  addReadHistory(articleId) {
    const history = this.globalData.readHistory.filter(id => id !== articleId);
    history.unshift(articleId);
    if (history.length > 100) history.pop();
    this.globalData.readHistory = history;
    wx.setStorageSync('readHistory', history);
  },

  tryUpdate() {
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager();
      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '新版本已准备好，是否重启应用？',
          success: res => {
            if (res.confirm) updateManager.applyUpdate();
          }
        });
      });
    }
  }
});
