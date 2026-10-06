// 离线下载配置：激励视频广告位 + GitHub Release 直链
//
// 两个关键前提（改动前先看，避免踩坑）：
// 1. 不调用 wx.downloadFile。小程序 downloadFile 要求域名已 ICP 备案且加入后台白名单，
//    github.com 及其资产实际跳转的 objects.githubusercontent.com 都无法备案，
//    所以沿用「复制链接 → 到浏览器打开」的方式，不受域名限制。
// 2. 上游用固定 tag `epub-latest` 发布电子书，每次发布覆盖同名资产，
//    因此下面的直链永久有效：上游更新内容后，这里不用改，链接拿到的就是最新版。
const RELEASE_BASE =
  'https://github.com/eternity4719/HowToLiveBetter/releases/download/epub-latest';

/*
 * Cloudflare Worker 反代（tools/mp-jump 的 /pdf 、/epub 、/html）。
 *
 * ⚠️ 为什么主力必须是加速源而不是 GitHub 直链：
 *    wx.downloadFile 在真机会校验「downloadFile 合法域名」，github.com 和它跳转到的
 *    objects.githubusercontent.com 都没法加进白名单（境外域名、无法备案），
 *    所以真机上用 GitHub 直链调 downloadFile 一定失败。dl.aipalnet.cn 是自己的域名，
 *    备案后能加进白名单，是唯一能在小程序内真正下载成功的通道。
 *
 * 已部署验证（2026-10-06）：https://dl.aipalnet.cn/epub → 200 + attachment + 1051573 bytes。
 * 若哪天 Worker 挂了，把它改成 false 即可整体回退到「复制链接到浏览器」，功能不断。
 */
const MIRROR_BASE = 'https://dl.aipalnet.cn';
const USE_MIRROR = true;

/*
 * openType：能否在小程序里用 wx.openDocument 直接打开。
 * 官方只支持 doc/docx/xls/xlsx/ppt/pptx/pdf：
 *   - pdf  → 下载后直接打开
 *   - 其余 → 下载后用 wx.shareFileMessage 转发出去（发给文件传输助手即可存到本地），
 *            小程序没有把文件落盘到手机存储的 API，转发是唯一能交付文件的方式
 */
const files = [
  {
    key: 'pdf',
    label: 'PDF',
    name: 'HowToLiveBetter.pdf',
    size: '7.3 MB',
    desc: '适合电脑阅读或打印，可直接在小程序里打开',
    openType: 'pdf'
  },
  {
    key: 'epub',
    label: 'EPUB',
    name: 'HowToLiveBetter.epub',
    size: '1.0 MB',
    desc: '适合电子书阅读器、微信读书，下载后转发保存',
    openType: ''
  },
  {
    key: 'html',
    label: 'HTML',
    name: 'HowToLiveBetter.html',
    size: '2.1 MB',
    desc: '单个文件，浏览器打开即可离线阅读，下载后转发保存',
    openType: ''
  }
];

module.exports = {
  // 激励视频广告位 ID（微信广告后台获取）
  REWARDED_AD_UNIT_ID: 'adunit-13c02d90420f2000',

  // 按体积从小到大排列
  //   url       —— GitHub 直链，永远可用，作为兜底
  //   mirrorUrl —— Cloudflare 反代：小程序内下载（downloadFile）走它，也是复制链接的首选
  //   copyUrl   —— 复制链接/浏览器打开时用：优先加速源，没启用才退回 GitHub
  DOWNLOAD_FILES: files.map(f => {
    const url = `${RELEASE_BASE}/${f.name}`;
    const mirrorUrl = USE_MIRROR ? `${MIRROR_BASE}/${f.key}` : '';
    return { ...f, url, mirrorUrl, copyUrl: mirrorUrl || url };
  })
};
