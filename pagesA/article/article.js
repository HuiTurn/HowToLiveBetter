const { getArticleById, getCategoryById, getRelatedArticles, fetchSteps } = require('../utils/content.js');
const { getStatusBarHeight, getNavBarHeight } = require('../../utils/util.js');
const store = require('../../utils/store.js');
const stepMap = require('../data/steps.js');
const localGlossary = require('../data/glossary.js');
const app = getApp();

/* 标签文案映射，与上游检索页 index.html 的 LABEL / LENS_LABEL 保持一致 */
const LENS_LABEL = { '死亡率': '换寿命', '金钱': '换钱', '时间': '换时间精力', '自由': '换人身自由' };
const COST_LABEL = {
  money: { '0': '不花钱', '少': '花少量钱', '多': '花不少钱' },
  time: { '少': '顺手', '中': '花几小时', '多': '每天占时间' },
  will: { '否': '不用毅力', '些': '要一点毅力', '是': '要很多毅力' }
};
const RATIO_KEY = { '极高': 3, '高': 2, '一般': 1 };

/*
 * 渲染层富文本解析（数据文件保留原文，不影响同步与全文检索）：
 * 1. 上游 md 的 **加粗** 标记：拆成 runs 交给 WXML 用嵌套 <text> 渲染，奇数下标是加粗段。
 * 2. 「（第 N 条）」式交叉引用 → 论文式数字上标，点击跳到对应条目。
 *    覆盖形态：
 *      （第 1 条）              → 上标 1
 *      （第 4 条，描述文字）     → 上标 4（描述文字）
 *      第 10 到 12 条（无括号）  → 上标 10-12
 *      第 8 节第 3 条（跨篇）    → 上标 8·3，点击跳到另一篇的对应条目
 *    指向无效目标的（如法条「第 705 条」、越界条号）不转换，保留原文。
 */
const SUP_RE = /（\s*(?:第\s*(\d+)\s*节)?\s*第\s*(\d+(?:\s*[到\-–—~]\s*\d+)?)\s*条\s*(?:，\s*([^）]+?)\s*)?）|(?:第\s*(\d+)\s*节)?\s*第\s*(\d+(?:\s*[到\-–—~]\s*\d+)?)\s*条/g;

/* 各篇条目数，用于校验引用是否指向真实存在的条目 */
const STEP_COUNTS = {};
Object.keys(stepMap).forEach((k) => { STEP_COUNTS[k] = (stepMap[k] || []).length; });

/*
 * 名词解释：词表由 tools/sync-articles.mjs 从上游 README 的「读懂数字（术语表）」
 * 抽取到 pagesA/data/glossary.js（照抄 index.html 的 parseGlossary：表格两列、
 * 术语按「、」拆别名、按长度倒序）。正文里命中的词标成可点，点击弹底部小窗看解释。
 * 同样是渲染层匹配，数据文件不动，不影响同步与全文检索。
 */
const TERM_MAP = {};
/* 术语表优先用接口缓存的那份（随索引一起更新），没有再用随包的基线 */
const cachedGlossary = store.getGlossary();
const glossary = (Array.isArray(cachedGlossary) && cachedGlossary.length) ? cachedGlossary : localGlossary;
glossary.forEach((t) => { TERM_MAP[t.k] = t; });
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* 拉丁术语（HR、RR、95% CI…）要求前后不是字母数字，避免把英文单词里的片段标出来。
   这里用捕获前导字符代替后行断言：小程序端 iOS 老版本 WebView 不支持 (?<=)。 */
const isLatin = (t) => /^[A-Za-z0-9%. ]+$/.test(t);
const TERM_RE = new RegExp(
  [
    `(?:^|[^A-Za-z0-9])(?:${glossary.filter(t => isLatin(t.k)).map(t => escRe(t.k)).join('|')})(?![A-Za-z0-9])`,
    `(?:${glossary.filter(t => !isLatin(t.k)).map(t => escRe(t.k)).join('|')})`
  ].join('|'),
  'g'
);

/* 「10 到 12」→「10-12」 */
const normNums = (s) => String(s).replace(/\s+/g, '').replace(/[到–—~]/g, '-');

/* 普通文本段：再按术语表切一刀，命中的标成可点 */
const pushText = (runs, text, b) => {
  if (!text) return;
  let last = 0;
  let m;
  TERM_RE.lastIndex = 0;
  while ((m = TERM_RE.exec(text)) !== null) {
    /* 拉丁术语命中时会带上前面的那个非字母数字字符，先把它吐回普通文本 */
    const key = TERM_MAP[m[0]] ? m[0] : m[0].slice(1);
    if (!TERM_MAP[key]) continue;
    const lead = m[0].length - key.length;
    if (m.index > last) runs.push({ t: text.slice(last, m.index), b });
    if (lead) runs.push({ t: m[0].slice(0, lead), b });
    runs.push({ t: key, b, term: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ t: text.slice(last), b });
};

/* 单段（不含 ** 加粗）里的引用拆解 */
const makeRuns = (text, maxStep) => {
  const runs = [];
  let last = 0;
  SUP_RE.lastIndex = 0;
  let m;
  while ((m = SUP_RE.exec(text)) !== null) {
    const sec = m[1] !== undefined ? Number(m[1]) : (m[4] !== undefined ? Number(m[4]) : null);
    const nums = normNums(m[2] !== undefined ? m[2] : m[5]);
    const desc = m[3];
    const list = nums.split('-').map(Number);
    let ref = null;
    if (sec !== null) {
      const to = 'b' + String(sec).padStart(2, '0');
      const max = STEP_COUNTS[to] || 0;
      if (max && list.every(n => n >= 1 && n <= max)) {
        ref = { step: list[0], to };
      }
    } else if (list.every(n => n >= 1 && n <= maxStep)) {
      ref = { step: list[0], to: '' };
    }
    if (m.index > last) pushText(runs, text.slice(last, m.index), false);
    if (ref) {
      if (desc) pushText(runs, `（${desc}）`, false);
      runs.push({ t: sec !== null ? `${sec}·${nums}` : nums, b: false, ref });
    } else {
      pushText(runs, m[0], false);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) pushText(runs, text.slice(last), false);
  return runs;
};

/* 加粗 + 引用一体解析：先按 ** 分段，再在段内拆引用 */
const parseRich = (text, maxStep) => {
  if (!text) return [{ t: '' }];
  const runs = [];
  String(text).split('**').forEach((seg, i) => {
    if (!seg) return;
    const b = i % 2 === 1;
    makeRuns(seg, maxStep).forEach((r) => runs.push(b ? { ...r, b: true } : r));
  });
  return runs.length ? runs : [{ t: '' }];
};

/*
 * 来源栏拆分：与上游 index.html 的 splitSrc 一致，「；」串起来的若干条文献，
 * 括号和引号里的分号不算分隔符（法条原文里有「……代理或者追认；……」）。
 * 只用来数「N 条文献」，展示仍是整段原文（与上游截图一致的流式排版）。
 */
const SRC_OPEN = '「『（';
const SRC_CLOSE = '」』）';
const splitSrc = (text) => {
  const parts = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (SRC_OPEN.includes(c)) depth++;
    if (SRC_CLOSE.includes(c)) depth = Math.max(0, depth - 1);
    const semi = c === '；' || (c === ';' && /\s/.test(text[i - 1] || '') && /\s/.test(text[i + 1] || ''));
    if (semi && depth === 0) { parts.push(buf); buf = ''; continue; }
    buf += c;
  }
  parts.push(buf);
  return parts.map(s => s.trim()).filter(Boolean);
};

/* 来源里的 URL 单独着色，点击复制（md 的 <URL> 自动链接先去掉尖括号） */
const URL_RE = /https?:\/\/[^\s）)；;；，,」』"'》]+/g;
const urlRuns = (text) => {
  const runs = [];
  let last = 0;
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) runs.push({ t: text.slice(last, m.index) });
    runs.push({ t: m[0], url: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ t: text.slice(last) });
  return runs;
};

/* 把数据层的档位翻成可直接渲染的文案，顺带挂上折叠状态 */
const decorateSteps = (steps, maxStep) => (steps || []).map(s => {
  const m = s.meta || {};
  const sourceText = String(s.source || '').replace(/<(https?:\/\/[^>]+)>/g, '$1');
  /* 逐条文献单独成行渲染，每条内部再给 URL 着色 */
  const srcParts = s.source ? splitSrc(sourceText) : [];
  return {
    ...s,
    flash: false,
    /* 成本、收益、备注各自独立展开/收起（默认都展开）；参考文献默认收起。
       （2026-10-06 用户确认的默认态，成本与收益/备注同款折叠交互） */
    costOpen: true,
    gainOpen: true,
    noteOpen: true,
    refsOpen: false,
    refCount: srcParts.length,
    refList: srcParts.map(t => ({ runs: urlRuns(t) })),
    lensText: LENS_LABEL[m.lens] || m.lens || '',
    costTags: [COST_LABEL.money[m.money], COST_LABEL.time[m.time], COST_LABEL.will[m.will]].filter(Boolean),
    ratioKey: RATIO_KEY[m.ratio] || 1,
    plainRuns: parseRich(s.plain, maxStep),
    costRuns: parseRich(s.cost, maxStep),
    gainRuns: parseRich(s.gain, maxStep),
    noteRuns: parseRich(s.note, maxStep)
  };
});

Page({
  data: {
    article: null,
    category: null,
    isFavorite: false,
    isLiked: false,
    burstShow: false,
    burstX: 0,
    burstY: 0,
    starPop: false,
    showGuide: false,
    ringTop: 0,
    ringLeft: 0,
    ringSize: 0,
    arrowTop: 0,
    arrowRight: 0,
    term: null,
    termShow: false,
    relatedArticles: []
  },

  onLoad(options) {
    const { id, step } = options || {};
    if (!id) {
      wx.showToast({ title: '缺少文章参数', icon: 'none' });
      return;
    }
    this.loadArticle(id);
    /* 跨篇引用跳转进来：等首屏渲染完再定位到目标条目 */
    if (Number(step) >= 1) {
      setTimeout(() => this.scrollToStep(Number(step)), 400);
    }
  },

  loadArticle(id) {
    const raw = getArticleById(id);
    if (!raw) {
      wx.showToast({ title: '文章不存在', icon: 'none' });
      return;
    }
    const maxStep = (raw.steps || []).length;
    /* 富文本解析（加粗 + 条号上标）只在渲染层做，抽出来供「拉到新正文」时复用 */
    const decorate = (raw) => {
      const maxStep = (raw.steps || []).length;
      return {
        ...raw,
        steps: decorateSteps(raw.steps, maxStep),
        summaryRuns: parseRich(raw.summary, maxStep),
        /* 导语段里的 **加粗** 与条号上标同样在渲染层解析 */
        content: (raw.content || []).map(t =>
          parseRich(
            String(t || '').replace('括号里是条号', '数字上标是条号，点一下可跳到对应条目'),
            maxStep
          )
        )
      };
    };
    const article = decorate(raw);

    const category = getCategoryById(article.categoryId);
    const favorites = app.globalData.favorites || [];
    const related = getRelatedArticles(id, 4).map(a => ({
      ...a,
      categoryName: getCategoryById(a.categoryId)?.name || '',
      categoryColor: getCategoryById(a.categoryId)?.color || '#333333',
      isFavorite: favorites.includes(a.id)
    }));

    app.addReadHistory(id);

    this.setData({
      article,
      category,
      isFavorite: favorites.includes(id),
      isLiked: (wx.getStorageSync('likedArticles') || []).includes(id),
      relatedArticles: related
    });

    /*
     * 先用缓存/基线把首屏渲染出来，再按 id 问一次接口；
     * rev 变了才替换（接口给的是本篇的 updatedAt，标题下的「更新」会跟着变）。
     */
    fetchSteps(id).then((r) => {
      if (!r || !r.changed || !r.steps || !r.steps.length) return;
      this.setData({
        article: decorate({ ...raw, steps: r.steps, updatedAt: r.updatedAt || raw.updatedAt })
      });
    });
  },

  /* 双击正文点赞：300ms 内两次 tap 视为双击 */
  onContentTap(e) {
    const now = Date.now();
    if (this._lastTap && now - this._lastTap < 300) {
      this._lastTap = 0;
      this.onDoubleLike(e);
    } else {
      this._lastTap = now;
    }
  },

  onDoubleLike(e) {
    const { article, isLiked } = this.data;
    if (!article) return;

    const p = (e.detail && e.detail.clientX != null) ? e.detail : ((e.touches && e.touches[0]) || {});
    this.setData({ burstShow: true, burstX: p.clientX || 0, burstY: p.clientY || 0 });
    setTimeout(() => this.setData({ burstShow: false }), 700);

    if (isLiked) return;
    const liked = wx.getStorageSync('likedArticles') || [];
    if (liked.includes(article.id)) return;
    liked.push(article.id);
    wx.setStorageSync('likedArticles', liked);

    this.setData({ isLiked: true });
  },

  /*
   * 展开/收起某条目的某一块，只更新这一条的那一个字段。
   * data-field 指定字段：costOpen（成本）/ gainOpen（收益）/ noteOpen（备注）/ refsOpen（来源）。
   * 各块互不影响，可以一个开一个关。
   */
  onToggleFold(e) {
    const { idx, field } = e.currentTarget.dataset;
    if (idx === undefined || !field || !this.data.article) return;
    const step = this.data.article.steps[idx];
    if (!step) return;
    this.setData({ [`article.steps[${idx}].${field}`]: !step[field] });
  },

  /* 点来源里的链接：复制到剪贴板（小程序内不宜直接跳外链） */
  onCopyRefUrl(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制', icon: 'none' })
    });
  },

  /* 点正文里的关键词：底部小窗展示名词解释 */
  onTermTap(e) {
    const k = e.currentTarget.dataset.k;
    const t = TERM_MAP[k];
    if (!t) return;
    this.setData({ term: t, termShow: true });
  },

  onCloseTerm() {
    this.setData({ termShow: false });
  },

  /* 弹窗内部与蒙层的点击兜底，阻止冒泡到关闭 */
  onNoop() {},

  /* 点击条号上标：同篇滚动定位，跨篇带 step 参数跳转 */
  onCiteTap(e) {
    const { step, to } = e.currentTarget.dataset;
    const n = Number(step);
    if (!n) return;
    if (to && to !== (this.data.article && this.data.article.id)) {
      wx.navigateTo({ url: `/pagesA/article/article?id=${to}&step=${n}` });
      return;
    }
    this.scrollToStep(n);
  },

  /* 滚动到目标条目并短暂高亮 */
  scrollToStep(step) {
    const q = wx.createSelectorQuery();
    q.select(`#step-${step}`).boundingClientRect();
    q.selectViewport().scrollOffset();
    q.exec((res) => {
      const rect = res && res[0];
      const scroll = res && res[1];
      if (!rect || !scroll || !this.data.article) return;
      const navH = getStatusBarHeight() + getNavBarHeight();
      wx.pageScrollTo({
        scrollTop: scroll.scrollTop + rect.top - navH - 12,
        duration: 300
      });
      const idx = (this.data.article.steps || []).findIndex(s => s.index === step);
      if (idx === -1) return;
      const key = `article.steps[${idx}].flash`;
      this.setData({ [key]: true });
      clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => this.setData({ [key]: false }), 1500);
    });
  },

  onCardFavorite(e) {
    const { id } = e.detail;
    const favorites = [...(app.globalData.favorites || [])];
    const idx = favorites.indexOf(id);
    if (idx > -1) {
      favorites.splice(idx, 1);
    } else {
      favorites.push(id);
    }
    app.saveFavorites(favorites);

    this.setData({
      relatedArticles: this.data.relatedArticles.map(a =>
        a.id === id ? { ...a, isFavorite: idx === -1 } : a
      )
    });
  },

  onFavorite() {
    const { article, isFavorite } = this.data;
    if (!article) return;

    const favorites = [...app.globalData.favorites];

    if (isFavorite) {
      const idx = favorites.indexOf(article.id);
      if (idx > -1) favorites.splice(idx, 1);
      wx.showToast({ title: '已取消收藏', icon: 'none' });
    } else {
      favorites.push(article.id);
      wx.showToast({ title: '已收藏', icon: 'none' });
    }

    app.saveFavorites(favorites);

    this.setData({
      isFavorite: !isFavorite,
      starPop: true
    });
    setTimeout(() => this.setData({ starPop: false }), 320);
  },

  onShowTimelineGuide() {
    const rect = wx.getMenuButtonBoundingClientRect();
    const { windowWidth } = wx.getSystemInfoSync();
    const centerX = rect.left + rect.height / 2;
    const ringSize = rect.height + 12;
    this.setData({
      showGuide: true,
      ringSize,
      ringTop: rect.top + rect.height / 2 - ringSize / 2,
      ringLeft: centerX - ringSize / 2,
      arrowTop: rect.top + rect.height + 42,
      arrowRight: windowWidth - centerX - 2
    });
  },

  onCloseGuide() {
    this.setData({ showGuide: false });
  },

  onShareAppMessage() {
    const { article } = this.data;
    if (!article) {
      return {
        title: '更好的生活，从每一个选择开始丨人生指南库',
        path: '/pages/index/index',
        imageUrl: '/assets/images/splash.jpg'
      };
    }
    return {
      title: `${article.title}丨人生指南库`,
      path: `/pagesA/article/article?id=${article.id}`,
      imageUrl: article.cover
    };
  },

  onShareTimeline() {
    const { article } = this.data;
    if (!article) return { title: '人生指南库' };
    return {
      title: `${article.title}丨人生指南库`,
      query: `id=${article.id}`,
      imageUrl: article.cover
    };
  }
});
