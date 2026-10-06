const app = getApp();
const { REWARDED_AD_UNIT_ID, DOWNLOAD_FILES } = require('../../utils/download-config.js');

Page({
  data: {
    files: DOWNLOAD_FILES,
    unlocked: false,
    // 广告拉取中，用于页面上的等待态文案
    loading: false,
    // 广告没播成而放行的，页面上给一句说明
    adFailed: false,
    // 正在下载的文件 key + 进度（0-100）
    downloadingKey: '',
    progress: 0,
    // 两个源都下载失败的文件，露出 GitHub 地址让用户复制
    failedKey: '',
    // 失败时微信返回的原始错误，显示出来方便定位（如 url not in domain list）
    lastErrMsg: ''
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

  /*
   * 单个文件的主操作：三个格式都支持真下载（加速源优先，失败退回 GitHub 直链）。
   * 下载完成后的交付方式按格式分：
   *   - PDF → 直接打开预览
   *   - EPUB / HTML → 小程序打不开，转发给文件传输助手让用户存到本地
   */
  onFileAction(e) {
    const index = Number(e.currentTarget.dataset.index);
    const file = this.data.files[index];
    if (!file || this.data.downloadingKey) return;

    this.startDownload(file);
  },

  /* 下载：加速源优先，失败自动退回 GitHub 直链，都失败才露出地址 */
  startDownload(file) {
    const sources = [file.mirrorUrl, file.url].filter(Boolean);
    this.lastErr = '';
    this.setData({ downloadingKey: file.key, progress: 0, failedKey: '', lastErrMsg: '' });
    this.downloadFrom(file, sources, 0);
  },

  downloadFrom(file, sources, i) {
    const url = sources[i];
    if (!url) {
      this.onAllSourcesFailed(file);
      return;
    }

    const task = wx.downloadFile({
      url,
      success: res => {
        if (res.statusCode !== 200) {
          this.lastErr = 'HTTP ' + res.statusCode;
          this.downloadFrom(file, sources, i + 1);
          return;
        }
        this.setData({ downloadingKey: '', progress: 0 });
        this.openFile(file, res.tempFilePath);
      },
      fail: err => {
        // 记下来，全失败时据此判断是不是域名白名单没配
        this.lastErr = (err && err.errMsg) || '';
        console.warn('downloadFile 失败', url, this.lastErr);

        /* 域名白名单报错时，下一个源若是境外域名（github.com / githubusercontent），
           它同样不可能进白名单，再试一次只会让用户多等一个超时 */
        const next = sources[i + 1];
        if (this.isDomainErr() && next && /githubusercontent\.com|github\.com/.test(next)) {
          this.onAllSourcesFailed(file);
          return;
        }
        this.downloadFrom(file, sources, i + 1);
      }
    });

    if (task && task.onProgressUpdate) {
      task.onProgressUpdate(r => this.setData({ progress: r.progress }));
    }
  },

  /*
   * 所有源都拿不到文件。真机上九成是 downloadFile 合法域名没配 dl.aipalnet.cn
   * （微信报错形如 "downloadFile:fail url not in domain list"）。
   * 这种情况再点多少次都不会成功，所以直接把链接复制到剪贴板，别让用户白等。
   */
  onAllSourcesFailed(file) {
    this.setData({
      downloadingKey: '',
      progress: 0,
      failedKey: file.key,
      lastErrMsg: this.lastErr || ''
    });
    this.copy(file.copyUrl || file.url, file.label);
    wx.showToast({
      title: this.isDomainErr() ? '未配置下载域名，链接已复制' : '下载失败，链接已复制',
      icon: 'none',
      duration: 3000
    });
  },

  // 微信域名白名单报错形如 "downloadFile:fail url not in domain list"
  isDomainErr() {
    return /domain|合法域名/i.test(this.lastErr || '');
  },

  openFile(file, filePath) {
    /* PDF：直接打开，右上角可「用其他应用打开」存到本地 */
    if (file.openType) {
      wx.openDocument({
        filePath,
        fileType: file.openType,
        showMenu: true,
        fail: () => {
          this.setData({ failedKey: file.key });
          wx.showToast({ title: '无法打开，已显示备用链接', icon: 'none' });
        }
      });
      return;
    }

    /* EPUB / HTML：转发给文件传输助手，用户存下来就能导入阅读器 */
    if (!wx.shareFileMessage) {
      // 低版本基础库没有这个 API，退回复制链接
      this.copy(file.copyUrl || file.url, file.label);
      return;
    }

    const isDevtools =
      (wx.getDeviceInfo ? wx.getDeviceInfo().platform : '') === 'devtools';

    wx.shareFileMessage({
      filePath,
      fileName: file.name,
      fail: err => {
        const msg = (err && err.errMsg) || '';
        if (msg.includes('cancel')) return; // 用户自己取消，不算失败

        /* 开发者工具不支持 shareFileMessage（真机正常），不能当失败处理，
           否则会出现"明明 200 了还提示下载失败"的误报 */
        if (isDevtools || msg.includes('not support') || msg.includes('not yet')) {
          this.copy(file.copyUrl || file.url, file.label);
          wx.showToast({ title: '请用真机体验下载，链接已复制备用', icon: 'none' });
          return;
        }

        this.setData({ failedKey: file.key });
        wx.showToast({ title: '无法发送，已显示备用链接', icon: 'none' });
      }
    });
  },

  copy(url, label) {
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: `${label} 链接已复制`, icon: 'none' })
    });
  },

  // 兜底块第一行：复制首选链接（加速源）
  onCopyFallback(e) {
    const file = this.data.files[Number(e.currentTarget.dataset.index)];
    if (file) this.copy(file.copyUrl || file.url, file.label);
  },

  // 兜底块第二行：加速源也不通时才用的 GitHub 备用
  onCopyBackup(e) {
    const file = this.data.files[Number(e.currentTarget.dataset.index)];
    if (file) this.copy(file.url, file.label);
  },

  // 底部按钮：三个格式一起复制（优先加速源）
  onCopyLink() {
    const text = this.data.files.map(f => `${f.label}：${f.copyUrl || f.url}`).join('\n');
    wx.setClipboardData({
      data: text,
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
