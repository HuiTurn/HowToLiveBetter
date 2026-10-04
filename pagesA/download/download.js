const app = getApp();
const { REWARDED_AD_UNIT_ID, DOWNLOAD_URL, DOWNLOAD_PASSWORD } = require('../../utils/download-config.js');

Page({
  data: {
    url: DOWNLOAD_URL,
    password: DOWNLOAD_PASSWORD,
    unlocked: false,
    // 广告拉取中，用于页面上的等待态文案
    loading: false
  },

  onLoad() {
    // 本次启动已经解锁过，直接展示链接，不再重复播放广告
    if (app.globalData.downloadUnlocked) {
      this.setData({ unlocked: true });
      return;
    }

    this.initAd();
    // 进页面即自动播放：留一帧让页面先渲染出来，避免广告盖在白屏上
    this.adTimer = setTimeout(() => this.playAd(), 300);
  },

  onUnload() {
    if (this.adTimer) clearTimeout(this.adTimer);
  },

  initAd() {
    if (!wx.createRewardedVideoAd) {
      console.warn('当前环境不支持激励视频广告');
      return;
    }

    this.rewardedAd = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });

    this.rewardedAd.onClose(res => {
      // res.isEnded 为 true 表示完整看完，才解锁
      if (res && res.isEnded) {
        app.globalData.downloadUnlocked = true;
        this.setData({ unlocked: true });
        wx.showToast({ title: '已解锁下载', icon: 'success' });
      } else {
        wx.showToast({ title: '需看完视频才能解锁', icon: 'none' });
      }
    });

    this.rewardedAd.onError(err => {
      console.error('激励视频出错', err);
      this.setData({ loading: false });
    });
  },

  // 自动播放 / 按钮重试共用
  playAd() {
    if (!this.rewardedAd) {
      wx.showToast({ title: '当前环境不支持广告', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    // show 失败时先 load 再 show
    this.rewardedAd.show()
      .catch(() => this.rewardedAd.load().then(() => this.rewardedAd.show()))
      .then(() => this.setData({ loading: false }))
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: '广告加载失败，可点下方按钮重试', icon: 'none' });
      });
  },

  onRetryAd() {
    this.playAd();
  },

  onCopyLink() {
    // 链接 + 提取码一起复制，方便用户到浏览器粘贴
    wx.setClipboardData({
      data: `${DOWNLOAD_URL}\n提取码：${DOWNLOAD_PASSWORD}`,
      success: () => wx.showToast({ title: '链接已复制，请到浏览器打开', icon: 'none' })
    });
  },

  onShareAppMessage() {
    return {
      title: '离线下载完整版丨人生指南库',
      path: '/pages/index/index',
      imageUrl: '/assets/images/splash.jpg'
    };
  }
});
