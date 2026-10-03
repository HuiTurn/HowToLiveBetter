const { getStatusBarHeight } = require('../../utils/util.js');

Page({
  data: {
    showContent: false,
    topPadding: 88
  },

  onLoad() {
    this.setData({ topPadding: getStatusBarHeight() + 128 });
    if (wx.getStorageSync('splashSeen')) {
      this.redirecting = true;
      wx.switchTab({ url: '/pages/home/home' });
      return;
    }
    wx.setStorageSync('splashSeen', 1);
  },

  onShow() {
    if (this.redirecting) return;
    setTimeout(() => {
      this.setData({ showContent: true });
    }, 100);
  },

  onExplore() {
    wx.switchTab({
      url: '/pages/home/home',
      fail: (err) => {
        console.error('switchTab 失败', err);
        wx.showToast({ title: '页面跳转失败，请重新编译', icon: 'none' });
      }
    });
  },

  onOpenSource() {
    wx.setClipboardData({
      data: 'https://github.com/eternity4719/HowToLiveBetter',
      success: () => {
        wx.showToast({ title: '项目链接已复制', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '更好的生活，从每一个选择开始丨人生指南库',
      path: '/pages/index/index',
      imageUrl: '/assets/images/splash.jpg'
    };
  },

  onShareTimeline() {
    return {
      title: '更好的生活，从每一个选择开始丨人生指南库',
      imageUrl: '/assets/images/splash.jpg'
    };
  }
});
