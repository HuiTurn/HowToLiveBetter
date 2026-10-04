const app = getApp();
const { REWARDED_AD_UNIT_ID, DOWNLOAD_URL, DOWNLOAD_PASSWORD } = require('../../utils/download-config.js');

Page({
  data: {
    url: DOWNLOAD_URL,
    password: DOWNLOAD_PASSWORD,
    unlocked: false,
    // 广告拉取中，用于页面上的等待态文案
    loading: false,
    // 广告没播成而放行的，页面上给一句说明
    adFailed: false
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
      this.failOpen();
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
      // 播完预加载下一条，避免下次 show 时还没就绪（正式环境常见 2005）
      this.rewardedAd.load().catch(() => {});
    });

    this.rewardedAd.onError(err => {
      console.error('激励视频出错', err);
      this.setData({ loading: false });
      // 1004 无填充 / 1005 审核中 / 1006 被驳回 / 1008 已关闭 等，一律放行，不能让用户拿不到链接
      this.failOpen(err && err.errCode);
    });
  },

  // 广告没播成（环境不支持 / 无填充 / 加载失败）时兜底放行，保证下载功能可用
  failOpen(code) {
    if (this.data.unlocked) return;
    app.globalData.downloadUnlocked = true;
    this.setData({ unlocked: true, loading: false, adFailed: true });
    wx.showToast({
      title: code ? `广告不可用(${code})，已直接解锁` : '广告未就绪，已直接解锁',
      icon: 'none'
    });
  },

  // 自动播放 / 按钮重试共用
  playAd() {
    if (!this.rewardedAd) {
      this.failOpen();
      return;
    }

    this.setData({ loading: true });
    // 正式环境必须先 load 完成再 show，直接 show 容易返回 2005（广告未就绪）
    this.rewardedAd.load()
      .then(() => this.rewardedAd.show())
      .then(() => this.setData({ loading: false }))
      .catch(err => {
        // onError 会同步触发一次，这里只负责收尾，避免重复放行/toast
        this.setData({ loading: false });
        if (!this.data.unlocked) this.failOpen(err && (err.errCode || err.errMsg));
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
