// 离线下载相关配置：激励视频广告位 + 网盘外链
// 说明：本方案不调用 wx.downloadFile，仅复制网盘链接引导用户到浏览器下载，
// 因此无需域名备案、无需 downloadFile 合法域名白名单。
module.exports = {
  // 激励视频广告位 ID（微信广告后台获取）
  REWARDED_AD_UNIT_ID: 'adunit-13c02d90420f2000',
  // 蓝奏云外链（整本合集，含 PDF / HTML / epub 三种格式）
  DOWNLOAD_URL: 'https://hlikex.lanzouv.com/b0j1rws8b',
  DOWNLOAD_PASSWORD: 'atqp'
};
