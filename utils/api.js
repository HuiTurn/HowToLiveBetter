/**
 * 接口请求层：https://dl.aipalnet.cn/api/*
 *
 * 后端是同一个 Cloudflare Worker（tools/mp-jump），数据接口挂在 /api/* 分支上。
 * ⚠️ 硬前置：dl.aipalnet.cn 必须同时出现在小程序后台「request 合法域名」里——
 *    它现在能下载文件（downloadFile 白名单）不代表能发 wx.request，两者是分开配的。
 *    没配的话真机一律失败，代码会静默回落到缓存/本地数据，不会崩，但也拿不到更新。
 *
 * 设计取舍：
 *   - 失败静默：请求层绝不抛错给页面，页面永远有数据可渲染（缓存 → 本地基线）
 *   - 连续失败 3 次后本会话内停止请求：域名没配白名单时避免每次开页面都白等 8 秒
 *   - 只用 GET，发布走 GitHub Actions，不在小程序里做写操作
 */
const BASE = 'https://dl.aipalnet.cn';
const TIMEOUT = 8000;
const MAX_FAIL = 3;

let failCount = 0;
let disabled = false;

/** 手动关掉接口（比如域名还没配好、或要临时冻结成纯离线） */
const setEnabled = (on) => { disabled = !on; if (on) failCount = 0; };
const isEnabled = () => !disabled;

function request(path, params) {
  if (disabled) return Promise.reject({ reason: 'disabled' });

  let url = BASE + path;
  if (params) {
    const qs = Object.keys(params)
      .filter(k => params[k] !== undefined && params[k] !== '')
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join('&');
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      timeout: TIMEOUT,
      dataType: 'json',
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
          failCount = 0;
          resolve(res.data);
        } else {
          reject({ status: res.statusCode, data: res.data });
        }
      },
      fail: (err) => {
        failCount++;
        if (failCount >= MAX_FAIL) disabled = true;
        reject({ err });
      }
    });
  });
}

const getMeta = () => request('/api/meta');
const getArticles = () => request('/api/articles');
const getGlossary = () => request('/api/glossary');
const getSteps = (id) => request(`/api/steps/${encodeURIComponent(id)}`);
const search = (q) => request('/api/search', { q });

module.exports = {
  BASE,
  setEnabled, isEnabled,
  getMeta, getArticles, getGlossary, getSteps, search
};
