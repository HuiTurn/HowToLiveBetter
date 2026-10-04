// 本项目源码仓库地址
const REPO_URL = 'https://github.com/HuiTurn/HowToLiveBetter';

Page({
  data: {
    version: '1.0.0'
  },

  // 项目源码：复制本项目仓库地址
  onCopyRepo() {
    wx.setClipboardData({
      data: REPO_URL,
      success: () => {
        wx.showToast({ title: '项目地址已复制', icon: 'none' });
      }
    });
  },

  // 数据来源：内容源自上游原书仓库
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
