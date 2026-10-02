/**
 * 检查小程序包体积是否在微信限制内
 *
 * 用法（在 miniprogram/ 目录下）：
 *   node tools/check-size.mjs
 *
 * 限制：主包 2 MB、单个分包 2 MB、所有分包合计 20 MB。
 *
 * 说明：
 *   - 忽略规则取自 project.config.json 的 packOptions.ignore，
 *     分包 root 取自 app.json —— 两个配置不在同一个文件里，别搞混。
 *   - 数据正文在分包 pagesA/data/steps.js，会随上游更新增长，
 *     同步之后跑一下这个脚本，接近上限时提前处理。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LIMIT = 2 * 1048576;
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '');

const cfg = JSON.parse(strip(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8')));
const app = JSON.parse(strip(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')));

const IGNORE = ['node_modules', '.git', ...(cfg.packOptions?.ignore || []).map((i) => i.value)];
const SUBROOTS = (app.subpackages || app.subPackages || []).map((s) => s.root);

const files = [];
(function walk(dir, inSub) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.includes(e.name)) continue;
    const p = path.join(dir, e.name);
    const isSub = inSub || (dir === ROOT && SUBROOTS.includes(e.name));
    if (e.isDirectory()) walk(p, isSub);
    else files.push({ rel: path.relative(ROOT, p), size: fs.statSync(p).size, isSub });
  }
})(ROOT, false);

const kb = (x) => (x / 1024).toFixed(0) + ' KB';
const mb = (x) => (x / 1048576).toFixed(2) + ' MB';
const main = files.filter((f) => !f.isSub).reduce((s, f) => s + f.size, 0);
const sub = files.filter((f) => f.isSub).reduce((s, f) => s + f.size, 0);

const verdict = (size) => size <= LIMIT
  ? `✓ 通过，余量 ${kb(LIMIT - size)}`
  : `✗ 超出 ${kb(size - LIMIT)}`;

console.log(`分包 root：${SUBROOTS.join(', ') || '(无)'}\n`);
console.log(`主包  ${kb(main).padStart(9)}  ${verdict(main)}`);
console.log(`分包  ${kb(sub).padStart(9)}  ${verdict(sub)}`);
console.log(`总计  ${mb(main + sub).padStart(9)}  / 20 MB`);

console.log('\n主包 Top 8：');
files.filter((f) => !f.isSub).sort((a, b) => b.size - a.size).slice(0, 8)
  .forEach((f) => console.log(`  ${kb(f.size).padStart(9)}  ${f.rel}`));

if (main > LIMIT || sub > LIMIT) {
  console.log('\n提示：正文在分包 pagesA/data/steps.js，图片已压到极限，');
  console.log('      空间只能继续从数据侧省（例如把 steps.js 改为紧凑 JSON，可省约 20%）。');
  process.exit(1);
}
