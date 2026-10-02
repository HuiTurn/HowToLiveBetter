/**
 * 重新截取小程序界面截图（写入 docs/images/screenshots/）
 *
 * 前置：
 *   1. 安装依赖（一次性）：npm i -D miniprogram-automator
 *   2. 开启开发者工具自动化端口：
 *        /Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
 *          --project . --auto-port 9420 --trust-project
 *
 * 用法：
 *   node tools/capture-screenshots.mjs                  # 全部 7 张
 *   node tools/capture-screenshots.mjs 06-article       # 只截指定页
 *   AUTOMATOR_ROOT=<装了依赖的目录> node tools/capture-screenshots.mjs
 *
 * 说明：
 *   - 截图取的是 IDE 模拟器当前机型（本项目用华为 Mate 80），
 *     输出尺寸 = 设备逻辑尺寸 × IDE 模拟器显示比例（当前 0.8224 → 301x664）。
 *   - 截图为小程序渲染内容 + 状态栏，不含 IDE 窗口外框。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(PROJECT_ROOT, 'docs/images/screenshots');
const WS = process.env.AUTOMATOR_WS || 'ws://127.0.0.1:9420';

const require = createRequire(path.join(process.env.AUTOMATOR_ROOT || PROJECT_ROOT, 'package.json'));
let automator;
try {
  automator = require('miniprogram-automator');
} catch {
  console.error('缺少依赖 miniprogram-automator。请先执行：npm i -D miniprogram-automator');
  process.exit(1);
}

/** 页面清单：顺序会影响导航栈，tabBar 页用 reLaunch/switchTab，分包页用 navigateTo */
const SHOTS = [
  { name: '02-home', url: '/pages/home/home', mode: 'reLaunch', wait: 1500 },
  { name: '03-classify', url: '/pages/classify/classify', mode: 'switchTab', wait: 1500 },
  { name: '04-favorite', url: '/pages/favorite/favorite', mode: 'switchTab', wait: 1500 },
  { name: '05-mine', url: '/pages/mine/mine', mode: 'switchTab', wait: 1500 },
  { name: '07-daily', url: '/pagesA/daily/daily', mode: 'navigateTo', wait: 1800 },
  { name: '06-article', url: '/pagesA/article/article?id=b01', mode: 'navigateTo', wait: 2000 },
  { name: '01-index', url: '/pages/index/index', mode: 'reLaunch', wait: 1500 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = only.length ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS;

if (!targets.length) {
  console.error('没有匹配的页面。可选：' + SHOTS.map((s) => s.name).join(', '));
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const miniProgram = await automator.connect({ wsEndpoint: WS });
const info = await miniProgram.systemInfo();
console.log(`已连接 ${WS} | 机型：${info.model} (${info.system}) ${info.screenWidth}x${info.screenHeight}`);

/** 预期路径：去掉前导斜杠和 query */
const expectPath = (url) => url.replace(/^\//, '').replace(/\?.*$/, '');

/** 导航并确认真的到了目标页，否则重试（偶发会停在启动页 index） */
async function goto(shot) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (shot.mode === 'reLaunch') await miniProgram.reLaunch(shot.url);
    else if (shot.mode === 'switchTab') await miniProgram.switchTab(shot.url);
    else await miniProgram.navigateTo(shot.url);

    await sleep(shot.wait);
    const page = await miniProgram.currentPage();
    if (page.path === expectPath(shot.url)) return page;
    console.warn(`  ! ${shot.name} 第 ${attempt} 次导航后停在 ${page.path}，重试`);
    await sleep(1000);
  }
  return null;
}

let ok = 0;
for (const shot of targets) {
  try {
    const landed = await goto(shot);
    if (!landed) {
      console.error(`✗ ${shot.name} 导航失败，跳过`);
      continue;
    }
    await miniProgram.pageScrollTo(0).catch(() => {});
    await sleep(400);

    const file = path.join(OUT_DIR, `${shot.name}.png`);
    await miniProgram.screenshot({ path: file });
    const page = await miniProgram.currentPage();
    console.log(`✓ ${shot.name.padEnd(12)} ${(fs.statSync(file).size / 1024).toFixed(1)} KB  (${page.path})`);
    ok++;
  } catch (e) {
    console.error(`✗ ${shot.name} 失败：${e && e.message}`);
  }
}

await miniProgram.disconnect();
console.log(`完成：${ok}/${targets.length} 张 → ${path.relative(PROJECT_ROOT, OUT_DIR)}/`);
process.exit(ok === targets.length ? 0 : 1);
