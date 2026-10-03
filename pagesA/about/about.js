Page({
  data: {
    version: '1.0.0'
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
  }
});
