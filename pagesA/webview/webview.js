Page({
  data: {
    url: 'https://github.com/eternity4719/HowToLiveBetter'
  },

  onLoad(options) {
    const { url } = options || {};
    if (url) {
      try {
        const decoded = decodeURIComponent(url);
        if (/^https?:\/\//i.test(decoded)) {
          this.setData({ url: decoded });
        }
      } catch (e) {
        console.error('URL decode error', e);
      }
    }
  },

  onError(e) {
    console.error('webview 加载失败', e);
    wx.showModal({
      title: '提示',
      content: '当前链接无法在微信小程序内打开，已复制链接到剪贴板，请在浏览器中访问。',
      showCancel: false,
      success: () => {
        wx.setClipboardData({
          data: this.data.url,
          success: () => {
            wx.navigateBack();
          }
        });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '更好的生活，从每一个选择开始丨人生指南库',
      path: '/pages/index/index',
      imageUrl: '/assets/images/splash.jpg'
    };
  }
});
