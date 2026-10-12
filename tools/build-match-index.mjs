/**
 * 生成主包条目级索引 data/match-index.js
 *
 * 为什么要有这份索引：匹配引擎（utils/match.js）在主包，而条目正文
 * pagesA/data/steps.js 在分包——小程序只允许分包引用主包，反过来不行，
 * 所以主包读不到正文。这里把「匹配用得到的字段」抽成一份精简索引放进主包，
 * 结果页才能精确到条目级（标题 + 摘要片段 + 成本/收益/证据档位）。
 *
 * 用法：node tools/build-match-index.mjs
 * 上游同步后（tools/sync-articles.mjs --apply）会自动跑一次，不要手改产物。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stepsPath = path.join(root, 'pagesA/data/steps.js');
const outPath = path.join(root, 'data/match-index.js');

/* 摘要截断长度：结果页只显示一行，36 字够排版；调小可省体积（每减 8 字约省 16 KB） */
const CLIP = 36;

const clip = (s) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > CLIP ? `${t.slice(0, CLIP)}…` : t;
};

const src = fs.readFileSync(stepsPath, 'utf8');
/* 正文是 CommonJS 大对象，用一次性求值拿到数据结构（构建期脚本，不进小程序包） */
const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const steps = mod.exports;

const rows = [];
for (const articleId of Object.keys(steps)) {
  for (const it of steps[articleId]) {
    const m = it.meta || {};
    rows.push([
      articleId,
      it.index,
      String(it.title || ''),
      clip(it.plain || it.title || ''),
      String(m.money ?? ''),
      String(m.time ?? ''),
      String(m.will ?? ''),
      String(m.gain ?? ''),
      String(m.ratio ?? ''),
      String(it.grade || ''),
      /* 正文长度（plain+gain+note）：主包读不到正文，靠它估阅读时长。
         只存字数不存内容，676 条合计约 +3 KB。 */
      [it.plain, it.gain, it.note, it.cost].reduce(
        (n, s) => n + String(s || '').replace(/\s+/g, '').length, 0
      )
    ]);
  }
}

/* 用数组而非对象存字段：省掉 676 × 8 个 key 的体积（约 30 KB） */
const body = rows
  .map(r => `  [${r.map(v => JSON.stringify(v)).join(',')}]`)
  .join(',\n');

const out = `/**
 * 条目级精简索引（自动生成，勿手改）
 *
 * 来源：pagesA/data/steps.js（正文在分包，主包读不到，故抽这份索引）
 * 生成：node tools/build-match-index.mjs
 * 字段：[文章id, 条号, 标题, 摘要片段, 花钱, 花时间, 意志力, 收益, 性价比, 证据等级, 正文字数]
 * 条目数：${rows.length}
 */
module.exports = [
${body}
];
`;

fs.writeFileSync(outPath, out, 'utf8');
const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
console.log(`✔ match-index.js：${rows.length} 条，${kb} KB → data/match-index.js`);
