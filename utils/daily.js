/**
 * 日更数据聚合（主包）
 *
 * 口径：取自每篇文章的 updatedAt，即「上游那个文件最后一次被改动的时刻」，
 * 按本机时区归到「天」。它反映的是「哪一天有内容更新过」，不是逐条建议的发布流水
 * ——上游一次提交动了 14 个文件，这一天就显示 14 篇。
 *
 * 只有零星几天有数据，所以「今日已更新」经常是 0，页面会自动降级成
 * 「今日暂无更新 + 最近更新 MM-DD · N 条」，别把它当 bug。
 */
const data = require('./data.js');
/* 条目级精简索引（主包）：[文章id, 条号, 标题, 摘要片段, ...] */
const matchIndex = require('../data/match-index.js');

const dayOf = (a) => {
  const s = a.updatedAt || a.date || '';
  return s.slice(0, 10);
};

/** 阅读时长：中文约 400 字/分钟。用索引里的正文字数（r[10]）折算，至少 1 分钟。 */
const minutesOf = (chars) => Math.max(1, Math.round(Number(chars || 0) / 400));

/**
 * 首页列表要一行放得下的短标题。
 * 数据里不少条目标题是长句（如「人在家里或外面没了，先分清正常死亡还是非正常死亡…」），
 * 直接用会被 CSS 截成半句，读起来莫名其妙。这里按标点切成首句，仍太长再按逗号切。
 */
const shortTitle = (t, limit = 20) => {
  const s = String(t || '').trim();
  if (s.length <= limit) return s;
  const cut = s.slice(0, limit + 6);
  const segs = cut.split(/[，,。；;：:]/).filter(Boolean);
  let out = segs[0] || cut;
  if (out.length > limit) out = out.slice(0, limit);
  return out.length < s.length ? `${out}…` : out;
};

/** 按天聚合，返回 [{ date, count, articles[] }]，日期倒序 */
const getByDay = () => {
  const map = {};
  data.getArticles().forEach((a) => {
    const d = dayOf(a);
    if (!d) return;
    if (!map[d]) map[d] = { date: d, count: 0, articles: [] };
    map[d].count += 1;
    map[d].articles.push(a);
  });
  return Object.values(map).sort((x, y) => (x.date < y.date ? 1 : -1));
};

/** 首页头部用：今日更新条数 + 兜底文案 */
const getSummary = () => {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const days = getByDay();
  const todayRow = days.find(d => d.date === todayStr);
  const latest = days[0] || null;
  return {
    today: todayStr,
    todayCount: todayRow ? todayRow.count : 0,
    latestDate: latest ? latest.date : '',
    latestCount: latest ? latest.count : 0,
    totalDays: days.length
  };
};

/** 最近更新的几篇，首页列表用 */
const getLatest = (limit = 3) => {
  const withDay = data.getArticles()
    .filter(a => dayOf(a))
    .map(a => ({ ...a, day: dayOf(a) }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return withDay.slice(0, limit).map(a => ({
    id: a.id,
    title: a.title,
    day: a.day.slice(5),          // MM-DD
    subCategory: a.subCategory,
    stepCount: a.stepCount || 0,
    categoryName: (data.getCategoryById(a.categoryId) || {}).name || ''
  }));
};

/**
 * 首页「今日更新」用的条目级列表
 *
 * 口径：取 updatedAt 最新的几篇，每篇取前若干条建议。
 * 注意条级没有自己的时间戳（上游只有文件级 updatedAt），
 * 所以这里的「新增/更新」标记是**篇章级**的判断，不是逐条判断。
 */
const getLatestSteps = (articleLimit = 3, perArticle = 1) => {
  const arts = data.getArticles()
    .filter(a => dayOf(a))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, articleLimit);

  const out = [];
  /* 「新增」= 更新日期就在最近两天内（内容刚动过）；更早动的标「更新」。
     条级没有自己的时间戳，只能用篇章级的 updatedAt 近似。 */
  const today = new Date();
  const daysAgo = (s) => {
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? 9999 : Math.round((today - d) / 86400000);
  };

  arts.forEach(a => {
    const rows = matchIndex.filter(r => r[0] === a.id).slice(0, perArticle);
    rows.forEach(r => {
      const brief = String(r[3] || '').replace(/…$/, '');
      out.push({
        key: `${a.id}#${r[1]}`,
        aid: a.id,
        index: r[1],
        title: shortTitle(r[2]),
        brief,
        cover: a.cover,
        day: dayOf(a).slice(5),
        isNew: daysAgo(dayOf(a)) <= 1,
        categoryName: (data.getCategoryById(a.categoryId) || {}).name || '',
        minutes: minutesOf(r[10])
      });
    });
  });
  return out;
};

/** 本周趋势（pagesB/daily-data 用） */
const getWeekTrend = (days = 7) => getByDay().slice(0, days).reverse();

const getMonth = () => getByDay();

module.exports = { getSummary, getLatest, getLatestSteps, getWeekTrend, getMonth, getByDay };
