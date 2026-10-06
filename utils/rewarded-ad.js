/*
 * 激励视频广告的统一入口（「我的」页入口 + 离线下载页兜底共用）。
 *
 * ⚠️ 平台红线：必须由用户主动点击触发。任何 onLoad / onShow 里自动 show() 都会被驳回
 *    （微信实测驳回过一次：「激励视频自动播放，请整改」）。
 *    所以这里只给两个动作：
 *      preloadAd() —— 只 load 不 show，让点击时广告已就绪（避免 2005 未就绪）
 *      playAd()    —— 播放，只允许出现在 bindtap / catchtap 的回调链里
 *
 * ⚠️ 为什么要收口到一处：createRewardedVideoAd 返回的是单例，多个页面各自
 *    onClose / onError 注册回调会全部叠加触发，出现「一次关闭跳两次页面」这类问题。
 *    这里改成每次播放登记一个一次性监听，事件派发后立刻注销。
 */
const { REWARDED_AD_UNIT_ID } = require('./download-config.js');

let ad = null;
// 当前这条素材是否已 load 过（show 之后失效，需要重新 load）
let ready = false;
// 正在进行的 load，避免并发重复 load
let loadingTask = null;
// 本次播放登记的监听（onStart / onClose / onUnavailable）
const pending = new Set();

const ensureAd = () => {
  if (ad) return ad;
  if (!wx.createRewardedVideoAd) return null;

  ad = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });

  ad.onClose(res => {
    ready = false;
    dispatch('onClose', !!(res && res.isEnded));
  });

  ad.onError(err => {
    ready = false;
    dispatch('onUnavailable', err);
  });

  return ad;
};

/* 派发一次就清空：同一事件不会重复回调给同一次播放 */
const dispatch = (type, payload) => {
  const list = [...pending];
  pending.clear();
  list.forEach(h => {
    const fn = h[type];
    if (fn) fn(payload);
  });
};

const loadAd = () => {
  const instance = ensureAd();
  if (!instance) return Promise.reject(new Error('ad unsupported'));

  if (ready) return Promise.resolve();
  if (loadingTask) return loadingTask;

  loadingTask = instance
    .load()
    .then(() => { ready = true; })
    .catch(() => {})
    .then(() => { loadingTask = null; });

  return loadingTask;
};

/* 预热：不播放，只是让素材提前就绪 */
const preloadAd = () => {
  loadAd().catch(() => {});
};

/*
 * 播放。handlers:
 *   onStart        —— 广告已经显示出来（可以在这时收起 loading）
 *   onClose(ended) —— 广告关闭，ended 为 true 表示完整看完
 *   onUnavailable(err) —— 环境不支持 / 拉不到素材 / show 失败
 * 后两者只会有先到的那个被调用一次。
 */
const playAd = (handlers) => {
  const h = handlers || {};
  const instance = ensureAd();

  if (!instance) {
    if (h.onUnavailable) h.onUnavailable(new Error('ad unsupported'));
    return;
  }

  pending.add(h);

  loadAd()
    .then(() => instance.show())
    .then(() => {
      ready = false;
      if (h.onStart) h.onStart();
    })
    .catch(err => {
      /*
       * load/show 失败时 onError 通常已经同步派发过一次（那时 pending 已清空），
       * 这里只在「还没派发过」时兜底，避免同一次播放回调两次。
       */
      if (pending.has(h)) {
        pending.delete(h);
        if (h.onUnavailable) h.onUnavailable(err);
      }
    });
};

module.exports = { preloadAd, playAd };
