const { REWARDED_AD_UNIT_ID, DOWNLOAD_URL, DOWNLOAD_PASSWORD } = require('../../utils/download-config.js');

Page({
  data: {
    url: DOWNLOAD_URL,
    password: DOWNLOAD_PASSWORD,
    unlocked: false
  },

  onLoad() {
    // 激励视频广告实例建议全局只创建一次
    if (wx.createRewardedVideoAd) {
      this.rewardedAd = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
      this.rewardedAd.onClose(res => {
        // res.isEnded 为 true 表示完整看完，才解锁
        if (res && res.isEnded) {
          this.setData({ unlocked: true });
          wx.showToast({ title: '已解锁下载', icon: 'success' });
        } else {
          wx.showToast({ title: '需看完视频才能解锁', icon: 'none' });
        }
      });
      this.rewardedAd.onError(err => console.error('激励视频出错', err));
    }
  },

  onUnlock() {
    if (!this.rewardedAd) {
      wx.showToast({ title: '当前环境不支持广告', icon: 'none' });
      return;
    }
    // show 失败时先 load 再 show
    this.rewardedAd.show().catch(() =>
      this.rewardedAd.load().then(() => this.rewardedAd.show())
    ).catch(() => wx.showToast({ title: '广告加载失败，请稍后再试', icon: 'none' }));
  },

  onCopyLink() {
    if (!this.data.unlocked) {
      wx.showToast({ title: '请先观看视频解锁', icon: 'none' });
      return;
    }
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
