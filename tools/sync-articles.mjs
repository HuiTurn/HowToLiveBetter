/**
 * 把上游 eternity4719/HowToLiveBetter 的 book/*.md 同步进小程序的数据文件
 *
 * 用法（在 miniprogram/ 目录下）：
 *   node tools/sync-articles.mjs          # 只对比，不写文件
 *   node tools/sync-articles.mjs --apply  # 写入两个数据文件
 *   node tools/sync-articles.mjs --emit-json [--out=dist/api]
 *                                         # 产出接口发布用的 JSON（publish.json + 分份文件），
 *                                         # 默认写到仓库上一级的 dist/api（不进小程序包），不写本地数据文件；
 *                                         # Actions 走这条
 *
 * --emit-json 产物（Actions 把 publish.json 整个 POST 给 /api/publish）：
 *   meta.json     {sha, sourceUpdatedAt, syncedAt, counts, articles:[{id,rev?,updatedAt,publishedAt}]}
 *   articles.json 索引数组（等同 data/articles.js）
 *   steps.json    { 文章 id → 条目数组 }
 *   glossary.json 术语表
 *   publish.json  {meta, articles, steps, glossary} —— 发布请求体
 *
 * 说明：
 *   - 需要先有 upstream 远程：git remote add upstream https://github.com/eternity4719/HowToLiveBetter.git
 *   - 解析规则与上游检索页 index.html 的 parseBook() 保持一致，不要自行改动判据
 *
 * 产物拆成两个文件，这是为了控制主包体积（微信主包上限 2 MB）：
 *   data/articles.js        主包索引：元信息 + 导语，不含条目正文（约 60 KB）
 *   pagesA/data/steps.js    分包正文：{ 文章 id → 条目数组 }（约 1.25 MB）
 *
 * 拆分的依据：主包的 4 个 tabBar 页面（首页/分类/收藏/我的）只需要列表元信息，
 * 只有详情页与搜索页要看条目正文，而这两个页面都在分包 pagesA。
 * 注意小程序只能「分包引用主包」，反向不行，所以正文必须放在分包侧。
 *
 * 字段映射：
 *   `# N. 标题`            → article.title
 *   导语第 1 段             → article.summary，第 2 段及以后 → article.content[]
 *   `### N. xxx`           → 一条 step
 *   `- 说人话：`            → step.plain   （详情页高亮块）
 *   `- 成本：`              → step.cost
 *   `- 收益：`              → step.gain    （收益行）
 *   `- 备注：`              → step.note    （备注行）
 *   `- 来源：`              → step.source  （参考文献，详情页默认收起）
 *   `- 证据等级： A/B/C`    → step.grade
 *   `<!-- 成本标签: … -->`  → step.meta 的 money/time/will/gain/lens
 *   id 按文件名序号匹配（book/01-xxx.md → b01）
 *   categoryId / subCategory / cover / date 等小程序自有字段保留不动
 *   publishedAt = 该篇在上游的首次提交时间（北京时间，YYYY-MM-DD HH:mm），详情页「发布」用
 *   updatedAt   = 该篇在上游的最后提交时间（北京时间，YYYY-MM-DD HH:mm），详情页/我的页「更新」用
 *
 * 性价比档 meta.ratio 由「收益量级 + 三项成本」合成，规则照抄上游 CLAUDE.md，
 * 与证据等级无关，也不跨口径比较。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const REPO = path.resolve(import.meta.dirname, '..');
const LOCAL = path.join(REPO, 'data', 'articles.js');
const LOCAL_STEPS = path.join(REPO, 'pagesA', 'data', 'steps.js');
const LOCAL_GLOSS = path.join(REPO, 'pagesA', 'data', 'glossary.js');
const REMOTE = 'upstream/main';
const apply = process.argv.includes('--apply');
const emitJson = process.argv.includes('--emit-json');
const outIdx = process.argv.indexOf('--out');
/*
 * 默认产出到仓库根的上一级（工作区/dist/api），不进小程序目录——
 * 微信打包会把目录里所有文件算进包体积，JSON 产出留在里面会顶爆主包。
 * CI 里 OUT 在 checkout 目录外也能写（同一工作区），路径不受影响。
 */
const OUT_DIR = path.resolve(REPO, '..', outIdx > 0 ? process.argv[outIdx + 1] : 'dist/api');

/* 成本分权重与性价比档，数值必须与上游 index.html 的 COST_W / e.ratio 两行一致 */
const COST_W = { money: { '0': 0, '少': 1, '多': 2 }, time: { '少': 0, '中': 1, '多': 2 }, will: { '否': 0, '些': 1, '是': 2 } };
function ratioOf(gain, money, time, will) {
  const cs = (COST_W.money[money] ?? 0) + (COST_W.time[time] ?? 0) + (COST_W.will[will] ?? 0);
  if (gain === '大') return cs === 0 ? '极高' : (cs <= 2 ? '高' : '一般');
  if (gain === '中') return cs === 0 ? '高' : '一般';
  return '一般';
}

/* ---------- 从 git 导出上游 book/ 与 README ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'htlb-'));
const bookDir = path.join(tmp, 'book');
execSync(`git archive ${REMOTE} book README.md | tar -x -C ${tmp}`, { cwd: REPO, stdio: 'pipe' });

/*
 * 术语表：上游 README 的「## 读懂数字（术语表）」章节，规则照抄 index.html 的
 * parseGlossary——表格两列、术语按「、」拆成多个别名共用一条释义、按长度倒序
 * （渲染层靠这个保证最长匹配）。产物给详情页的「点关键词弹解释」用。
 */
function parseGlossary(md) {
  const m = /^## 读懂数字[^\n]*\n([\s\S]*?)(?=^## )/m.exec(md);
  if (!m) return [];
  const rows = [];
  for (const line of m[1].split(/\r?\n/)) {
    const c = /^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/.exec(line);
    if (!c || c[1] === '术语' || /^-+$/.test(c[1])) continue;
    for (const t of c[1].split('、')) {
      const k = t.trim();
      if (!k) continue;
      rows.push({ k, d: c[2].trim() });
    }
  }
  return rows.sort((a, b) => b.k.length - a.k.length);
}

/* ---------- 解析 md ---------- */
function parseMd(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const base = path.basename(file, '.md');
  let title = '';
  const intro = [];
  const steps = [];
  let cur = null;
  let stage = 'head';
  const push = () => { if (cur) { steps.push(cur); cur = null; } };

  for (const line of lines) {
    if (line.startsWith('# ')) { title = line.replace(/^#\s*\d+\.\s*/, '').trim(); stage = 'intro'; continue; }
    if (line.startsWith('### ')) { push(); stage = 'step'; cur = { title: line.replace(/^###\s*\d+\.\s*/, '').trim(), plain: '', cost: '', gain: '', note: '', grade: '', src: '', tags: {} }; continue; }
    if (line.startsWith('## ')) { stage = 'other'; continue; }
    if (line.startsWith('<!--') && !/成本标签/.test(line)) continue;
    if (line.startsWith('[←')) continue;

    if (stage === 'intro') { if (line.trim()) intro.push(line.trim()); continue; }
    if (stage !== 'step' || !cur) continue;

    const s = line.trim();
    let m;
    if ((m = /^<!--\s*成本标签:\s*(.*?)\s*-->/.exec(s))) {
      for (const kv of m[1].split(/\s+/)) {
        const [k, v] = kv.split('=');
        if (k === '钱') cur.tags.money = v;
        else if (k === '时间') cur.tags.time = v;
        else if (k === '毅力') cur.tags.will = v;
        else if (k === '收益') cur.tags.gain = v;
        else if (k === '口径') cur.tags.lens = v;
      }
      continue;
    }
    if ((m = /^-\s*成本：\s*(.*)$/.exec(s))) cur.cost = m[1].trim();
    else if ((m = /^-\s*说人话：\s*(.*)$/.exec(s))) cur.plain = m[1].trim();
    else if ((m = /^-\s*收益：\s*(.*)$/.exec(s))) cur.gain = m[1].trim();
    else if ((m = /^-\s*证据等级：\s*([ABC])/.exec(s))) cur.grade = m[1];
    else if ((m = /^-\s*来源：\s*(.*)$/.exec(s))) cur.src = m[1].trim();
    else if ((m = /^-\s*备注：\s*(.*)$/.exec(s))) cur.note = m[1].trim();
  }
  push();
  return { base, title, intro, steps };
}

/** 复刻列表页摘要规则：40 字内最后一个句读且位置 >=20 就截到句读，否则截断加省略号 */
function makeBrief(summary) {
  const head = summary.slice(0, 40);
  let pos = -1;
  for (let i = head.length - 1; i >= 0; i--) {
    if ('。；！？'.includes(head[i])) { pos = i; break; }
  }
  return pos >= 20 ? head.slice(0, pos + 1) : head + '…';
}

/* ---------- 对比并生成 ---------- */
/* 本地数据是索引与正文两份，先合并成完整对象再对比，这样 diff 逻辑不用改 */
/* 外面必须套一层括号：steps.js 导出的是对象字面量，裸 eval 会把它当成代码块而报语法错 */
const readModule = (file) => eval(
  '(' + fs.readFileSync(file, 'utf8').replace(/^module\.exports\s*=/, '').replace(/;?\s*$/, '') + ')'
);
const localIndex = readModule(LOCAL);
const localStepMap = fs.existsSync(LOCAL_STEPS)
  ? readModule(LOCAL_STEPS)
  : (console.log(`提示：${LOCAL_STEPS} 不存在，按空正文处理`), {});
const local = localIndex.map(a => ({ ...a, steps: localStepMap[a.id] || [] }));
const files = fs.readdirSync(bookDir).filter(f => f.endsWith('.md')).sort();
const report = [];
const anomalies = [];
let changed = 0;

/*
 * 每篇的上游提交时间（发布时间 = 首次提交，更新时间 = 最后提交）：
 * 一次 git log 拿全 book/ 的「提交时间 + 文件」清单，git log 倒序输出，
 * 每个文件第一次出现就是它最新的提交、最后一次出现就是它的首次提交。
 * 前端「发布/更新于 X」展示 + 未来接口的 sourceUpdatedAt 都以它们为准
 * （方案见 docs/数据接口化改造方案.md）。
 * quotepath=false 是为了让中文文件名不被转义成八进制。
 */
const fileTimes = {};
const fileFirst = {};
{
  const log = execSync(
    'git -c core.quotepath=false log --format=%cI --name-only upstream/main -- book/',
    { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }
  ).toString();
  let cur = '';
  for (const line of log.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { cur = s; continue; }
    const m = /^book\/(.+\.md)$/.exec(s);
    if (m) {
      if (!fileTimes[m[1]]) fileTimes[m[1]] = cur;
      fileFirst[m[1]] = cur; // 倒序遍历不断覆盖，结束时留下的就是最早一次
    }
  }
}
/** ISO 时间 → 北京时区的 YYYY-MM-DD HH:mm（前端展示粒度到分钟） */
const bjTime = (iso) => new Date(iso).toLocaleString('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

const output = files.map(file => {
  const p = parseMd(path.join(bookDir, file));
  const id = 'b' + p.base.match(/^(\d+)/)[1].padStart(2, '0');
  const old = local.find(a => a.id === id);
  if (!old) { anomalies.push(`本地缺少 ${id}（${p.title}）`); return null; }

  const steps = p.steps.map((s, i) => {
    const t = s.tags;
    if (!s.plain || !s.cost || !s.grade) {
      anomalies.push(`${id} 第 ${i + 1} 条字段缺失 plain=${!!s.plain} cost=${!!s.cost} grade=${!!s.grade}`);
    }
    if (!t.money || !t.time || !t.will || !t.gain || !t.lens) {
      anomalies.push(`${id} 第 ${i + 1} 条成本标签缺失 ${JSON.stringify(t)}`);
    }
    return {
      index: i + 1,
      title: s.title,
      plain: s.plain,
      cost: s.cost,
      gain: s.gain,
      note: s.note,
      source: s.src,
      grade: s.grade,
      meta: {
        money: t.money || '', time: t.time || '', will: t.will || '',
        gain: t.gain || '', lens: t.lens || '',
        ratio: ratioOf(t.gain, t.money, t.time, t.will),
        dispute: /^争议/.test(s.note),
        todo: /待核实|TODO/.test(s.src + s.gain + s.note + s.cost),
      },
    };
  });

  const summary = p.intro[0] || '';
  const updatedAt = fileTimes[`${p.base}.md`] ? bjTime(fileTimes[`${p.base}.md`]) : old.updatedAt || '';
  if (!updatedAt) anomalies.push(`${id} 拿不到上游提交时间（git log 无记录）`);
  const publishedAt = fileFirst[`${p.base}.md`] ? bjTime(fileFirst[`${p.base}.md`]) : old.publishedAt || old.date || '';
  if (!publishedAt) anomalies.push(`${id} 拿不到上游首次提交时间（git log 无记录）`);
  const next = {
    ...old,
    title: p.title,
    summary,
    brief: summary === old.summary ? old.brief : makeBrief(summary),
    content: p.intro.slice(1),
    steps,
    source: `整理自 HowToLiveBetter《${p.title}》，完整证据与来源见 GitHub 原文 book/${p.base}.md`,
    publishedAt,
    updatedAt,
  };

  const diff = [];
  if (old.title !== next.title) diff.push(`标题 ${old.title} → ${next.title}`);
  if (old.summary !== next.summary) diff.push('导语更新');
  if (old.steps.length !== next.steps.length) diff.push(`条目 ${old.steps.length} → ${next.steps.length}`);
  const n = next.steps.filter((s, i) => !old.steps[i] || old.steps[i].title !== s.title || old.steps[i].plain !== s.plain).length;
  if (n) diff.push(`${n} 条内容改动`);
  if (diff.length) { changed++; report.push(`${id} 《${next.title}》  ${diff.join('；')}`); }
  return next;
}).filter(Boolean);

console.log(`上游 ${files.length} 篇，匹配本地 ${output.length} 篇`);
console.log(`\n=== 有变化 ${changed} 篇 ===`);
report.forEach(r => console.log('  ' + r));
if (anomalies.length) {
  console.log(`\n=== 异常 ${anomalies.length} 条 ===`);
  anomalies.slice(0, 40).forEach(a => console.log('  ' + a));
}
const allSteps = output.flatMap(a => a.steps);
const tally = (fn) => allSteps.reduce((m, s) => { const k = fn(s); m[k] = (m[k] || 0) + 1; return m; }, {});
console.log(`\n条目总数：${local.reduce((s, a) => s + a.steps.length, 0)} → ${allSteps.length}`);
console.log(`证据等级：${JSON.stringify(tally(s => s.grade))}`);
console.log(`性价比档：${JSON.stringify(tally(s => s.meta.ratio))}`);
console.log(`口径：${JSON.stringify(tally(s => s.meta.lens))}`);
console.log(`争议 ${allSteps.filter(s => s.meta.dispute).length} 条，含待核实 ${allSteps.filter(s => s.meta.todo).length} 条`);
const dates = output.map(a => a.updatedAt).filter(Boolean).sort();
if (dates.length) {
  console.log(`内容更新时间：最早 ${dates[0]}，最新 ${dates[dates.length - 1]}（我的页展示最新这个）`);
  const missing = output.filter(a => !a.updatedAt || !a.publishedAt).map(a => a.id);
  if (missing.length) console.log(`  ⚠️ 缺 updatedAt/publishedAt：${missing.join('、')}`);
}

/* 术语表：上游 README，分包详情页用 */
const glossary = parseGlossary(fs.readFileSync(path.join(tmp, 'README.md'), 'utf8'));
const oldGloss = fs.existsSync(LOCAL_GLOSS) ? require(LOCAL_GLOSS) : [];
console.log(`\n术语表：${oldGloss.length} → ${glossary.length} 条`);
if (!glossary.length) console.log('  ⚠️ 没解析到术语表，检查上游 README 的「## 读懂数字」章节是否改了标题');
const gone = oldGloss.filter(o => !glossary.some(g => g.k === o.k)).map(o => o.k);
const fresh = glossary.filter(g => !oldGloss.some(o => o.k === g.k)).map(g => g.k);
if (gone.length) console.log('  上游删掉：' + gone.join('、'));
if (fresh.length) console.log('  上游新增：' + fresh.join('、'));

/** 与既有文件的写法保持一致：整体 JSON 缩进后再统一缩进 2 空格 */
const render = (x) => 'module.exports = [\n' +
  x.map(a => JSON.stringify(a, null, 2).split('\n').map(l => '  ' + l).join('\n')).join(',\n') +
  '\n];\n';

/* ---------- --emit-json：产出接口发布用的 JSON ---------- */
if (emitJson) {
  /*
   * 三个时间口径（别混用，见 docs/数据接口化改造方案.md）：
   *   sourceUpdatedAt 上游内容最后变更的时刻（取全书最新一篇的最后提交时间）→ 前端展示用
   *   syncedAt        本次同步跑完的时刻 → 排查用
   *   publishedAt/updatedAt（每篇）上游首次/最后提交时间
   * 全部统一成 ISO 8601 带 +08:00 下发，避免客户端各自按本地时区解释。
   */
  const bj = (s) => s.replace(' ', 'T') + ':00+08:00';            // 'YYYY-MM-DD HH:mm' → ISO+08:00
  const nowIso = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, '+08:00');
  const dates2 = output.map(a => a.updatedAt).filter(Boolean).sort();
  const sourceUpdatedAt = dates2.length ? bj(dates2[dates2.length - 1]) : '';
  const sha = execSync(`git rev-parse ${REMOTE}`, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] })
    .toString().trim();

  const meta = {
    sha,
    sourceUpdatedAt,
    syncedAt: nowIso(),
    counts: {
      articles: output.length,
      steps: allSteps.length,
      grade: tally(s => s.grade),
      ratio: tally(s => s.meta.ratio),
      lens: tally(s => s.meta.lens),
      dispute: allSteps.filter(s => s.meta.dispute).length,
      todo: allSteps.filter(s => s.meta.todo).length,
      glossary: glossary.length,
    },
    articles: output.map(a => ({ id: a.id, updatedAt: a.updatedAt, publishedAt: a.publishedAt })),
  };

  /* 索引里的 steps 要剔掉（正文单独一份），与写入本地索引时的处理一致 */
  const index = output.map(({ steps, ...rest }) => ({ ...rest, stepCount: steps.length }));
  const stepMap = {};
  output.forEach(a => { stepMap[a.id] = a.steps; });
  const payload = { meta, articles: index, steps: stepMap, glossary };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dump = (name, obj) => {
    const f = path.join(OUT_DIR, name);
    fs.writeFileSync(f, JSON.stringify(obj));
    console.log(`已写入 ${f}（${(fs.statSync(f).size / 1024).toFixed(0)} KB）`);
  };
  dump('meta.json', meta);
  dump('articles.json', index);
  dump('steps.json', stepMap);
  dump('glossary.json', glossary);
  dump('publish.json', payload);
  console.log(`\n上游 ${sha.slice(0, 7)} · 内容更新于 ${sourceUpdatedAt || '未知'}`);
}

if (apply) {
  /* 索引：剔除 steps，其余字段原样保留；补一个 stepCount 供主包显示条目总数 */
  const index = output.map(({ steps, ...rest }) => ({ ...rest, stepCount: steps.length }));
  fs.writeFileSync(LOCAL, render(index));

  /* 正文：{ 文章 id → 条目数组 }，放分包 */
  const stepMap = {};
  output.forEach(a => { stepMap[a.id] = a.steps; });
  fs.mkdirSync(path.dirname(LOCAL_STEPS), { recursive: true });
  fs.writeFileSync(LOCAL_STEPS,
    'module.exports = ' + JSON.stringify(stepMap, null, 2).split('\n').map(l => '  ' + l).join('\n').trimStart() + ';\n');

  /* 术语表：分包，详情页点关键词弹解释用 */
  fs.mkdirSync(path.dirname(LOCAL_GLOSS), { recursive: true });
  fs.writeFileSync(LOCAL_GLOSS,
    'module.exports = ' + JSON.stringify(glossary, null, 2).split('\n').map(l => '  ' + l).join('\n').trimStart() + ';\n');

  const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
  console.log(`\n已写入 ${LOCAL}（${kb(LOCAL)}）`);
  console.log(`已写入 ${LOCAL_STEPS}（${kb(LOCAL_STEPS)}）`);
  console.log(`已写入 ${LOCAL_GLOSS}（${kb(LOCAL_GLOSS)}）`);
} else {
  console.log('\n（dry-run，加 --apply 才会写文件）');
}

fs.rmSync(tmp, { recursive: true, force: true });
