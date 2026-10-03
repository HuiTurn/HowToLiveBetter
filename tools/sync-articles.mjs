/**
 * 把上游 eternity4719/HowToLiveBetter 的 book/*.md 同步进小程序的数据文件
 *
 * 用法（在 miniprogram/ 目录下）：
 *   node tools/sync-articles.mjs          # 只对比，不写文件
 *   node tools/sync-articles.mjs --apply  # 写入两个数据文件
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
 *   `- 收益：`              → step.gain    （折叠区）
 *   `- 备注：`              → step.note    （折叠区）
 *   `- 证据等级： A/B/C`    → step.grade
 *   `<!-- 成本标签: … -->`  → step.meta 的 money/time/will/gain/lens
 *   id 按文件名序号匹配（book/01-xxx.md → b01）
 *   categoryId / subCategory / cover / date 等小程序自有字段保留不动
 *
 * 性价比档 meta.ratio 由「收益量级 + 三项成本」合成，规则照抄上游 CLAUDE.md，
 * 与证据等级无关，也不跨口径比较。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..');
const LOCAL = path.join(REPO, 'data', 'articles.js');
const LOCAL_STEPS = path.join(REPO, 'pagesA', 'data', 'steps.js');
const REMOTE = 'upstream/main';
const apply = process.argv.includes('--apply');

/* 成本分权重与性价比档，数值必须与上游 index.html 的 COST_W / e.ratio 两行一致 */
const COST_W = { money: { '0': 0, '少': 1, '多': 2 }, time: { '少': 0, '中': 1, '多': 2 }, will: { '否': 0, '些': 1, '是': 2 } };
function ratioOf(gain, money, time, will) {
  const cs = (COST_W.money[money] ?? 0) + (COST_W.time[time] ?? 0) + (COST_W.will[will] ?? 0);
  if (gain === '大') return cs === 0 ? '极高' : (cs <= 2 ? '高' : '一般');
  if (gain === '中') return cs === 0 ? '高' : '一般';
  return '一般';
}

/* ---------- 从 git 导出上游 book/ ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'htlb-'));
const bookDir = path.join(tmp, 'book');
execSync(`git archive ${REMOTE} book | tar -x -C ${tmp}`, { cwd: REPO, stdio: 'pipe' });

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
  const next = {
    ...old,
    title: p.title,
    summary,
    brief: summary === old.summary ? old.brief : makeBrief(summary),
    content: p.intro.slice(1),
    steps,
    source: `整理自 HowToLiveBetter《${p.title}》，完整证据与来源见 GitHub 原文 book/${p.base}.md`,
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

/** 与既有文件的写法保持一致：整体 JSON 缩进后再统一缩进 2 空格 */
const render = (x) => 'module.exports = [\n' +
  x.map(a => JSON.stringify(a, null, 2).split('\n').map(l => '  ' + l).join('\n')).join(',\n') +
  '\n];\n';

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

  const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
  console.log(`\n已写入 ${LOCAL}（${kb(LOCAL)}）`);
  console.log(`已写入 ${LOCAL_STEPS}（${kb(LOCAL_STEPS)}）`);
} else {
  console.log('\n（dry-run，加 --apply 才会写文件）');
}

fs.rmSync(tmp, { recursive: true, force: true });
