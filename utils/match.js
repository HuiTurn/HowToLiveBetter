/**
 * 个性化匹配引擎（主包）
 *
 * 全部计算在端上完成，不发任何请求、不上传答案。
 *
 * ── 边界 ──────────────────────────────────────────────
 * 引擎在主包，条目正文在分包 pagesA（只能分包引主包，反过来不行），
 * 所以这里读 data/match-index.js——由 tools/build-match-index.mjs 生成的
 * 条目级精简索引，含标题、摘要片段和六个决策字段，够排序和展示用。
 *
 * ── 思路（v2：基本信息驱动，不再分类切入）────────────
 * 问卷采「人群画像（年龄 / 性别 / 身份角色）+ 跨领域关注点」，题目全部从 676
 * 条建议正文里提炼：每个关注点/角色映射到命中的文章章节（b01-b34）和关键词。
 * 打分不再给单一分类加分，而是按章节命中 + 关键词命中 + 成本/收益/证据排序，
 * 最后按章节去重，结果自然横跨多个分类，做到「相对全」。
 *
 * 纯规则排序，文案只能写「为你推荐」，不能写成效果承诺。
 */
const INDEX = require('../data/match-index.js');
const data = require('./data.js');
const store = require('./store.js');

const PROFILE_KEY = 'surveyProfile';

/* 索引行 → 对象，首屏只解析一次（676 条，成本可忽略） */
let _items = null;
const items = () => {
  if (_items) return _items;
  _items = INDEX.map(r => ({
    aid: r[0], index: r[1], title: r[2], plain: r[3],
    money: r[4], time: r[5], will: r[6], gain: r[7], ratio: r[8], grade: r[9],
    chars: r[10]
  }));
  return _items;
};

let _catOf = null;
const categoryOf = () => {
  if (_catOf) return _catOf;
  _catOf = {};
  data.getArticles().forEach(a => { _catOf[a.id] = a.categoryId; });
  return _catOf;
};

/* ---------- 题目定义 ---------- */
/*
 * 题目全部从 676 条建议正文里提炼：
 * - 人群画像（年龄 / 性别 / 身份角色）对应条目里的硬性条件信号
 *   （女性 HPV、60 岁防跌倒、婴儿安全座椅、孕产检查…）
 * - 关注领域横跨全部 8 分类，每项映射到命中的文章章节（b01-b34）与关键词。
 * 章节→分类的归属由 categoryOf() 决定，推荐时按章节加权、按章节去重，结果自然分散。
 */

/** Q1 年龄段：软性关键词加权，不做硬过滤 */
const AGE_BANDS = [
  { id: 'a-under18', label: '18 岁以下', desc: '还是学生', kw: ['孩子', '学生', '青少年', '疫苗'] },
  { id: 'a-18-29', label: '18-29 岁', desc: '读书或刚工作', kw: ['升学', '就业', '攒', '熬夜'] },
  { id: 'a-30-44', label: '30-44 岁', desc: '上有老下有小', kw: ['孩子', '体检', '房贷', '血压'] },
  { id: 'a-45-59', label: '45-59 岁', desc: '慢病开始冒头', kw: ['血压', '血糖', '筛查', '体检', '癌'] },
  { id: 'a-60up', label: '60 岁以上', desc: '重点防跌倒和慢病', kw: ['老人', '老年', '跌倒', '骨折', '疫苗'] }
];

/** Q2 性别：加权与性别相关的条目 */
const GENDERS = [
  { id: 'g-female', label: '女', desc: '', kw: ['女性', 'HPV', '乳腺', '宫颈', '孕', '怀孕'] },
  { id: 'g-male', label: '男', desc: '', kw: ['男性', '前列腺'] },
  { id: 'g-na', label: '不便填写', desc: '', kw: [] }
];

/** Q3 身份角色（多选 ≤3）：命中的章节 + 关键词 */
const ROLES = [
  { id: 'r-student', label: '在校学生', desc: '学习、升学、考试', chapters: ['b23', 'b31'], kw: ['学', '技能', '升学', '复习'] },
  { id: 'r-office', label: '上班族', desc: '工作、效率、职场权益', chapters: ['b11', 'b19', 'b26'], kw: ['合同', '离职', '效率', '加班'] },
  { id: 'r-biz', label: '自由职业 / 创业', desc: '副业、做生意、合伙', chapters: ['b12'], kw: ['创业', '合伙', '注册', '生意'] },
  { id: 'r-parent', label: '家长（有未成年孩子）', desc: '带娃、教育、儿童安全', chapters: ['b20', 'b30', 'b01'], kw: ['孩子', '婴儿', '儿童', '作业', '安全座椅'] },
  { id: 'r-pregnant', label: '备孕 / 怀孕', desc: '孕检、生产、母婴', chapters: ['b27', 'b20'], kw: ['怀孕', '孕', '产检', '疫苗'] },
  { id: 'r-elder-care', label: '需要照顾老人', desc: '照护、养老、陪伴', chapters: ['b17'], kw: ['老人', '照护', '养老', '护工', '跌倒'] },
  { id: 'r-retired', label: '已退休', desc: '养生、体检、防骗', chapters: ['b01', 'b08'], kw: ['退休', '老人', '血压', '筛查', '骗'] }
];

/**
 * Q4 关注领域（多选 ≤5，核心题）：横跨 8 大分类，选项由 34 章真实内容提炼。
 * chapters 指向命中的文章 id（b 编号），用于章节加权；kw 用于标题/摘要命中加权。
 */
const CONCERNS = [
  { id: 'c-sleep', label: '睡眠和作息', desc: '入睡难、熬夜、睡不够', chapters: ['b03'], kw: ['睡', '作息', '熬夜', '失眠', '咖啡'] },
  { id: 'c-diet', label: '饮食和身材', desc: '吃什么、体重、锻炼', chapters: ['b02', 'b28'], kw: ['吃', '盐', '油', '蔬菜', '体重', '运动', '健身'] },
  { id: 'c-chronic', label: '慢病和体检', desc: '三高、筛查、疫苗', chapters: ['b01', 'b16'], kw: ['血压', '血糖', '体检', '筛查', '疫苗'] },
  { id: 'c-safety', label: '居家·应急·出行安全', desc: '意外、急救、旅途', chapters: ['b01', 'b13', 'b21'], kw: ['安全', '火', '急救', '报警', '出行', '头盔'] },
  { id: 'c-save', label: '攒钱和消费', desc: '存钱、预算、别乱花', chapters: ['b05', 'b07'], kw: ['攒', '存', '应急', '预算', '消费', '省'] },
  { id: 'c-asset', label: '租房买房和防骗', desc: '贷款、押金、财产安全', chapters: ['b08', 'b15'], kw: ['租', '买房', '贷款', '押金', '骗', '借条'] },
  { id: 'c-career', label: '职场权益和效率', desc: '合同、离职、少加班', chapters: ['b11', 'b19', 'b26'], kw: ['合同', '离职', '竞业', '工伤', '效率', '会议'] },
  { id: 'c-startup', label: '创业和副业', desc: '投入、风险、注册', chapters: ['b12'], kw: ['创业', '生意', '合伙', '注册'] },
  { id: 'c-learn', label: '学习和自我提升', desc: '技能、升学、出国', chapters: ['b23', 'b31', 'b32'], kw: ['学', '技能', '练习', '升学', '就业', '出国'] },
  { id: 'c-love', label: '婚恋和家庭关系', desc: '恋爱、结婚、相处', chapters: ['b10', 'b18'], kw: ['恋爱', '结婚', '伴侣', '分手', '夫妻'] },
  { id: 'c-parenting', label: '孕产和育儿', desc: '带娃、教育、花费', chapters: ['b20', 'b27', 'b30'], kw: ['怀孕', '产检', '婴儿', '奶', '孩子', '作业'] },
  { id: 'c-elder', label: '养老和长辈照护', desc: '照护、费用、沟通', chapters: ['b17'], kw: ['老人', '照护', '养老', '护工'] },
  { id: 'c-emotion', label: '情绪和减压', desc: '焦虑、压力、低谷', chapters: ['b22', 'b29', 'b33'], kw: ['焦虑', '压力', '情绪', '放松', '减压', '低谷'] },
  { id: 'c-law', label: '生活法律常识', desc: '边界、责任、公证', chapters: ['b09'], kw: ['违法', '拘留', '责任', '公证', '合同'] },
  { id: 'c-account', label: '账号和信息安全', desc: '密码、隐私、诈骗', chapters: ['b14'], kw: ['密码', '账号', '隐私', '验证', '诈骗'] },
  { id: 'c-doctor', label: '看病就医', desc: '挂号、检查、少花冤枉钱', chapters: ['b24'], kw: ['看病', '挂号', '医生', '检查', '急诊'] },
  { id: 'c-final', label: '身后事的安排', desc: '手续、遗嘱、交代', chapters: ['b25'], kw: ['身后', '遗嘱', '丧', '手续'] }
];

/** Q5 每天能投入的时间 → 允许的 meta.time（硬过滤） */
const TIME_BUDGET = [
  { id: 't5', label: '5-10 分钟', desc: '顺手就能做完的那种', allow: ['少'] },
  { id: 't15', label: '10-30 分钟', desc: '每天能挤出一小段', allow: ['少', '中'] },
  { id: 't30', label: '30 分钟以上', desc: '愿意认真投入', allow: ['少', '中', '多'] },
  { id: 'tfree', label: '时间不固定', desc: '有空就做，别限我', allow: null }
];

/** Q6 期望效果 → 命中字段加权 */
const GOALS = [
  { id: 'fast', label: '见效快', desc: '性价比高的先来', field: 'ratio', hit: ['极高', '高'], score: 12 },
  { id: 'free', label: '几乎不花钱', desc: '成本越低越好', field: 'money', hit: ['0'], score: 12 },
  { id: 'easy', label: '不太靠意志力', desc: '容易坚持下来的', field: 'will', hit: ['否', '些'], score: 10 },
  { id: 'solid', label: '证据够硬', desc: '只要被验证过的', field: 'grade', hit: ['A'], score: 12 }
];

const QUESTIONS = { AGE_BANDS, GENDERS, ROLES, CONCERNS, TIME_BUDGET, GOALS };

/* 章节加权：关注点每项 40、角色每项 20（同章节累加） */
const CONCERN_W = 40;
const ROLE_W = 20;

/* ---------- profile ---------- */

const getProfile = () => store.get(PROFILE_KEY) || null;
const saveProfile = (p) => store.set(PROFILE_KEY, p);
const clearProfile = () => store.del(PROFILE_KEY);

/** 做过问卷 = 至少选了一个关注领域（旧数据结构里的 direction 已废弃） */
const hasProfile = (p) => !!(p && Array.isArray(p.concerns) && p.concerns.length);

/* ---------- 推荐 ---------- */

const GRADE_SCORE = { A: 10, B: 4, C: 0 };
const RATIO_SCORE = { 极高: 10, 高: 5, 一般: 0 };

/** 把答案展开成「章节 → 权重」「字段 → 加分」和一张关键词表 */
const buildWeights = (profile) => {
  const chapterW = {};
  const add = (id, w) => { chapterW[id] = (chapterW[id] || 0) + w; };
  const keywords = [];
  const pushKw = (arr) => {
    (arr || []).forEach(k => { if (keywords.indexOf(k) === -1) keywords.push(k); });
  };

  (profile.concerns || []).forEach((cid) => {
    const c = CONCERNS.find(x => x.id === cid);
    if (!c) return;
    c.chapters.forEach(ch => add(ch, CONCERN_W));
    pushKw(c.kw);
  });

  (profile.roles || []).forEach((rid) => {
    const r = ROLES.find(x => x.id === rid);
    if (!r) return;
    r.chapters.forEach(ch => add(ch, ROLE_W));
    pushKw(r.kw);
  });

  const age = AGE_BANDS.find(a => a.id === profile.age);
  if (age) pushKw(age.kw);
  const gender = GENDERS.find(g => g.id === profile.gender);
  if (gender) pushKw(gender.kw);

  const budget = TIME_BUDGET.find(t => t.id === profile.budget) || TIME_BUDGET[3];
  const goals = (profile.goals || [])
    .map(gid => GOALS.find(g => g.id === gid))
    .filter(Boolean);

  return { chapterW, budget, goals, keywords };
};

/** 关键词命中：标题/摘要里出现用户画像相关的词，说明这条更贴题。最多算 3 个词 */
const keywordBoost = (it, keywords) => {
  if (!keywords || !keywords.length) return 0;
  const text = `${it.title}${it.plain}`;
  let n = 0;
  for (let i = 0; i < keywords.length; i++) {
    if (text.indexOf(keywords[i]) > -1) n += 1;
  }
  return Math.min(n, 3) * 16;
};

const KW_MAX = 48;

/**
 * 按 profile 跨分类推荐条目
 * @param {object} profile { age, gender, roles[], concerns[], budget, goals[] }
 * @param {number} limit 返回条数
 * @returns {Array} 每项含 title/plain/meta/score/percent/categoryName 等展示字段
 */
const recommend = (profile, limit = 8) => {
  if (!hasProfile(profile)) return [];
  const { chapterW, budget, goals, keywords } = buildWeights(profile);
  const catMap = categoryOf();
  const artMap = {};
  data.getArticles().forEach(a => { artMap[a.id] = a; });

  const scoreOf = (it) => {
    let s = 0;
    if (chapterW[it.aid]) s += chapterW[it.aid];
    s += GRADE_SCORE[it.grade] || 0;
    s += RATIO_SCORE[it.ratio] || 0;
    s += keywordBoost(it, keywords);
    goals.forEach((g) => { if (g.hit.indexOf(it[g.field]) > -1) s += g.score; });
    /* 收益大的往前排：同一处境下先给回报高的 */
    if (it.gain === '大') s += 4;
    return s;
  };

  /* 匹配度的基准：最理想的一条能拿到的分，用它做绝对归一化 */
  const maxChapterW = Math.max(CONCERN_W, ...Object.values(chapterW));
  const refScore = maxChapterW + 10 + 10 + (keywords.length ? KW_MAX : 0)
    + goals.reduce((s, g) => s + g.score, 0) + 4;

  const pool = items().filter(it => catMap[it.aid]);
  /* 时间预算是硬过滤；剩下不够就不放宽，去重阶段再回填 */
  let candidates = budget.allow
    ? pool.filter(it => budget.allow.indexOf(it.time) > -1)
    : pool.slice();
  if (candidates.length < limit) candidates = pool.slice();

  const ranked = candidates
    .map(it => ({ ...it, score: scoreOf(it) }))
    .sort((a, b) => b.score - a.score);

  /* 跨分类去重：每个章节最多 2 条，保证结果分散在多个章节/分类；不足再回填高分项 */
  const PER_CHAPTER = 2;
  const seen = {};
  const picked = [];
  ranked.forEach((it) => {
    if (picked.length >= limit) return;
    seen[it.aid] = seen[it.aid] || 0;
    if (seen[it.aid] < PER_CHAPTER) {
      picked.push(it);
      seen[it.aid] += 1;
    }
  });
  if (picked.length < limit) {
    ranked.forEach((it) => {
      if (picked.length >= limit) return;
      if (picked.indexOf(it) === -1) picked.push(it);
    });
  }

  const top = picked.slice(0, limit);
  if (!top.length) return [];

  return top.map((it, i) => {
    const article = artMap[it.aid] || {};
    /* 首选压一压：并列第一也让它独占最高档，其余按真实分算 */
    const percent = i === 0
      ? Math.min(98, Math.max(80, Math.round((it.score / refScore) * 100)))
      : Math.min(96, Math.max(56, Math.round((it.score / refScore) * 100)));
    return {
      id: `${it.aid}-${it.index}`,
      aid: it.aid,
      index: it.index,
      title: it.title,
      plain: it.plain,
      grade: it.grade,
      ratio: it.ratio,
      time: it.time,
      money: it.money,
      articleTitle: article.title || '',
      categoryName: (data.getCategoryById(article.categoryId) || {}).name || '',
      percent
    };
  });
};

/**
 * 没做过问卷时的「今日 · 推荐」：按日期取高性价比条目，稳定不抖动
 * @returns {Array} 4 条
 */
const getDailyRecommend = (limit = 4) => {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seed = parseInt(day, 10) || 1;
  const catMap = categoryOf();
  const artMap = {};
  data.getArticles().forEach(a => { artMap[a.id] = a; });

  const pool = items()
    .filter(it => it.ratio === '极高' || (it.ratio === '高' && it.grade === 'A'))
    .filter(it => catMap[it.aid]);
  const list = pool.length >= limit ? pool : items().filter(it => catMap[it.aid]);

  const picked = [];
  for (let i = 0; i < limit; i++) {
    picked.push(list[(seed * 7 + i * 37) % list.length]);
  }
  return picked.map((it) => {
    const article = artMap[it.aid] || {};
    return {
      id: `${it.aid}-${it.index}`,
      aid: it.aid,
      index: it.index,
      title: it.title,
      plain: it.plain,
      grade: it.grade,
      ratio: it.ratio,
      time: it.time,
      money: it.money,
      articleTitle: article.title || '',
      categoryName: (data.getCategoryById(article.categoryId) || {}).name || '',
      percent: 0
    };
  });
};

/** 建议库总条数：取自条目索引，随上游同步变化，界面文案用它而非写死 */
const totalCount = () => items().length;

/** 一句话概括关注点，结果页顶部用 */
const summarize = (profile) => {
  const labels = (profile.concerns || [])
    .map(cid => {
      const c = CONCERNS.find(x => x.id === cid);
      return c ? c.label : '';
    })
    .filter(Boolean);
  const budget = TIME_BUDGET.find(t => t.id === profile.budget);
  const bTxt = budget ? budget.label : '时间不固定';
  const head = labels.length
    ? `你在意的是「${labels.slice(0, 3).join('、')}${labels.length > 3 ? ' 等' : ''}」`
    : '按你的情况';
  return `${head}，每天约 ${bTxt}。下面几条横跨生活的多个方面，按性价比和证据强度排过。`;
};

module.exports = {
  QUESTIONS, AGE_BANDS, GENDERS, ROLES, CONCERNS, TIME_BUDGET, GOALS,
  hasProfile,
  recommend,
  getDailyRecommend,
  totalCount,
  summarize,
  getProfile, saveProfile, clearProfile
};
