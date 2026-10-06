/**
 * 发布前的回归闸门：校验 --emit-json 产出的 JSON，防止上游改了 md 格式导致静默产出空数据
 *
 * 用法（在 miniprogram/ 目录下）：
 *   node tools/verify-payload.mjs [--dir dist/api] [--prev-steps 667] [--prev-meta meta.json]
 *
 * 判据（任一不满足即 exit 1，Actions 会停在发布之前）：
 *   1. 篇数、条目总数在合理区间，且相对上一版不得大幅缩水（>5%）
 *   2. 证据等级 A/B/C 都有，且计数之和 == 条目总数
 *   3. 每篇都有正文，每条都有 plain / cost / grade 三个必填字段
 *   4. 术语表不少于 40 条（上游 README 那张表，少了解释弹窗会大面积失效）
 *   5. meta 的三个时间都能解析成合法时间，且 sourceUpdatedAt 不为空
 *
 * 为什么单独一个脚本：闸门是「上游结构变动」的最后一道防线，必须能本地单独跑，
 * 也不能和同步逻辑混在一起——混在一起的话脚本一出错，闸门就跟着失效了。
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const DIR = path.resolve(REPO, '..', arg('dir', 'dist/api'));   // 与 sync --emit-json 的默认产出位置一致（仓库上一级）
const PREV_STEPS = Number(arg('prev-steps', 0) || 0);

const fail = (msg) => { console.error('✗ ' + msg); process.exitCode = 1; };
const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

const meta = read('meta.json');
const articles = read('articles.json');
const steps = read('steps.json');
const glossary = read('glossary.json');

/* 1. 规模 */
const total = Object.values(steps).reduce((s, arr) => s + arr.length, 0);
if (articles.length < 30) fail(`篇数异常少：${articles.length}（上游是不是删了大半？）`);
if (total < 300) fail(`条目总数异常少：${total}`);
if (PREV_STEPS && total < PREV_STEPS * 0.95) {
  fail(`条目数相对上一版（${PREV_STEPS}）掉了超过 5%：${total}，多半是解析规则失配，拒绝发布`);
}

/* 2. 证据等级 */
const g = meta.counts?.grade || {};
if (!(g.A > 0 && g.B > 0 && g.C > 0)) fail(`证据等级分布异常：${JSON.stringify(g)}`);
const gsum = Object.values(g).reduce((s, n) => s + n, 0);
if (gsum !== total) fail(`等级计数之和 ${gsum} != 条目总数 ${total}`);

/* 3. 每篇正文与必填字段 */
const missingBody = articles.filter(a => !Array.isArray(steps[a.id]) || !steps[a.id].length).map(a => a.id);
if (missingBody.length) fail(`这些篇没有正文：${missingBody.join('、')}`);
let bad = 0;
for (const a of articles) {
  for (const s of steps[a.id] || []) {
    if (!s.plain || !s.cost || !s.grade) bad++;
  }
}
if (bad) fail(`${bad} 条缺 plain / cost / grade`);

/* 4. 术语表 */
if (!Array.isArray(glossary) || glossary.length < 40) fail(`术语表只有 ${glossary?.length || 0} 条`);

/* 5. 时间 */
for (const k of ['sourceUpdatedAt', 'syncedAt']) {
  const t = meta[k];
  if (!t || Number.isNaN(Date.parse(t))) fail(`meta.${k} 不是合法时间：${t}`);
}
if (!/^\+08:00$/.test(meta.sourceUpdatedAt?.slice(-6) || '')) {
  fail(`meta.sourceUpdatedAt 必须带 +08:00 时区：${meta.sourceUpdatedAt}`);
}
if (!meta.sha || !/^[0-9a-f]{40}$/.test(meta.sha)) fail(`meta.sha 不是 40 位 commit sha：${meta.sha}`);

if (process.exitCode) {
  console.error('\n闸门未通过，不发布。');
} else {
  console.log(`✓ 闸门通过：${articles.length} 篇 / ${total} 条 / 术语 ${glossary.length} 条` +
    (PREV_STEPS ? `（上一版 ${PREV_STEPS} 条）` : ''));
}
