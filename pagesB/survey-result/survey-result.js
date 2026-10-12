const match = require('../../utils/match.js');
const store = require('../../utils/store.js');

/* 解锁标记：存「已解锁的档案 ts」，与当前 profile.ts 相同即视为已解锁（同一结果长期有效）。
   微信无法可靠检测分享是否成功，故采用业界通用的乐观放行：点分享按钮→返回页面(onShow)即解锁。 */
const SHARE_UNLOCK_KEY = 'surveyShareUnlock';

Page({
  data: {
    generating: true,
    noProfile: false,
    locked: false,        // 已匹配但未解锁：结果打码，浮分享解锁层
    totalSteps: 0,        // 建议库总条数，动态取，不写死
    summary: '',
    top: null,
    others: [],
    profile: null
  },

  onLoad(options) {
    /* 总条数随上游同步变化，界面文案动态取当前值 */
    this.setData({ totalSteps: match.totalCount() });

    /* 打开好友/群聊分享面板（默认已含转发，这里显式确保群聊可分享） */
    if (wx.showShareMenu) {
      wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    }

    const profile = match.getProfile();
    if (!match.hasProfile(profile)) {
      /* 没做过问卷：给引导空态，底下按日期给几条高性价比的当样品（不锁） */
      this.setData({
        generating: false,
        noProfile: true,
        others: match.getDailyRecommend(3)
      });
      return;
    }

    const list = match.recommend(profile, 8);
    const unlockedTs = store.get(SHARE_UNLOCK_KEY);
    const unlocked = !!(profile.ts && unlockedTs && unlockedTs === profile.ts);

    this.setData({
      profile,
      locked: !unlocked,
      summary: match.summarize(profile),
      top: list[0] || null,
      others: list.slice(1)
    });

    /* 刚答完给一段「正在匹配」的过渡，直接甩结果会显得很突兀 */
    const delay = options && options.fresh === '1' ? 1200 : 300;
    setTimeout(() => {
      this.setData({ generating: false });
    }, delay);
  },

  /* 分享按钮（open-type="share"）点击：先拉起分享面板，标记「等待返回解锁」。
     真正的解锁在 onShow 里做——分享面板会短暂切到后台，返回时触发 onShow。 */
  onShareTap() {
    this._awaitingShare = true;
  },

  onShow() {
    if (!this._awaitingShare) return;
    this._awaitingShare = false;
    if (!this.data.locked) return;

    const p = this.data.profile;
    if (p && p.ts) store.set(SHARE_UNLOCK_KEY, p.ts);
    this.setData({ locked: false });
    wx.showToast({ title: '已解锁，可查看', icon: 'success' });
  },

  onStepTap(e) {
    const { aid, index } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pagesA/article/article?id=${aid}&step=${index}`
    });
  },

  onRestart() {
    wx.redirectTo({ url: '/pagesB/survey/survey' });
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  /* 浮层里的「暂不分享」：退出结果页 */
  onCancelLock() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/home/home' });
    }
  },

  /* 分享卡片标题：用用户自己选的关注点做钩子，无档案时退回通用文案 */
  _shareTitle() {
    const p = this.data.profile;
    const n = (this.data.top ? 1 : 0) + (this.data.others ? this.data.others.length : 0);
    if (p && Array.isArray(p.concerns) && p.concerns.length) {
      const c = match.CONCERNS.find(x => x.id === p.concerns[0]);
      if (c) return `我在人生指南库为「${c.label}」筛出了 ${n} 条建议`;
    }
    return '我在人生指南库筛出了适合自己的几条建议';
  },

  onShareAppMessage() {
    return {
      title: this._shareTitle(),
      path: '/pagesB/survey-result/survey-result',
      imageUrl: '/assets/images/share-survey.png'
    };
  },

  onShareTimeline() {
    return {
      title: this._shareTitle(),
      imageUrl: '/assets/images/share-survey.png'
    };
  }
});
