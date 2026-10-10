// 赞助（微信虚拟支付：个人）前端封装。
// 只负责调用自己的服务端（Cloudflare Worker）与 wx.requestVirtualPayment，不做任何签名计算——
// AppKey / AppSecret / sessionKey 一律只存在于服务端。
//
// 支付后端走数据 API 同域 dl.aipalnet.cn 的 /pay/* 路由（由独立 vpay Worker 处理），
// 因此只需在 MP 后台把 dl.aipalnet.cn 加进「request 合法域名」一处即可。

const API_BASE = 'https://dl.aipalnet.cn';

// iOS 端虚拟支付要求微信客户端 8.0.68 及以上
const IOS_MIN_WECHAT_VERSION = '8.0.68';
const REQUEST_TIMEOUT = 15000;

function fail(message, code) {
  return Object.assign(new Error(message), { code: code || 'unknown' });
}

function compareVersion(left, right) {
  const a = String(left).split('.').map(Number);
  const b = String(right).split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

function getSystem() {
  if (wx.getDeviceInfo && wx.getAppBaseInfo) {
    return { platform: wx.getDeviceInfo().platform, version: wx.getAppBaseInfo().version };
  }
  const info = wx.getSystemInfoSync();
  return { platform: info.platform, version: info.version };
}

// 支付前置校验：开发者工具不支持虚拟支付，iOS 有客户端版本门槛
function checkAvailability() {
  const { platform, version } = getSystem();

  if (platform === 'devtools') {
    return { ok: false, message: '开发者工具不支持虚拟支付，请用真机预览或体验版验证' };
  }
  if (!wx.requestVirtualPayment) {
    return { ok: false, message: '当前微信版本不支持虚拟支付，请升级到最新版微信' };
  }
  if (platform === 'ios' && compareVersion(version, IOS_MIN_WECHAT_VERSION) < 0) {
    return {
      ok: false,
      message: `iOS 端需微信 ${IOS_MIN_WECHAT_VERSION} 及以上版本，当前为 ${version}，请升级微信后再试`
    };
  }
  return { ok: true, platform };
}

function request(path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + path,
      method: data ? 'POST' : 'GET',
      data,
      timeout: REQUEST_TIMEOUT,
      success(res) {
        const body = res.data || {};
        if (res.statusCode === 200 && body.ok) {
          resolve(body.data);
          return;
        }
        reject(fail(body.message || `服务异常（${res.statusCode}）`, 'server'));
      },
      fail(err) {
        reject(fail(err.errMsg || '网络异常，请检查网络后重试', 'network'));
      }
    });
  });
}

function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        // code 只能用一次，每次下单 / 查单都要重新获取
        if (res.code) resolve(res.code);
        else reject(fail('获取登录凭证失败，请重试', 'login'));
      },
      fail() {
        reject(fail('获取登录凭证失败，请重试', 'login'));
      }
    });
  });
}

function fetchTiers() {
  return request('/pay/ping').then((data) => data.tiers || []);
}

async function createOrder(tierId) {
  const code = await login();
  return request('/pay/order', { code, tierId });
}

function requestPayment(payData) {
  return new Promise((resolve, reject) => {
    wx.requestVirtualPayment({
      // signData 是服务端签好名的原始字符串，展开后不能再解析或重新序列化
      ...payData,
      success: resolve,
      fail(err) {
        const message = err.errMsg || '';
        if (message.indexOf('cancel') >= 0) {
          reject(fail('已取消支付', 'cancel'));
          return;
        }
        reject(fail(message || '支付未完成，请稍后重试', 'pay'));
      }
    });
  });
}

async function confirmOrder(outTradeNo) {
  const code = await login();
  return request('/pay/query', { code, outTradeNo });
}

// 完整链路：下单 → 拉起支付 → 回查订单状态。
// success 回调可能丢失，所以支付后一律以服务端订单状态为准。
async function payTip(tierId) {
  const availability = checkAvailability();
  if (!availability.ok) throw fail(availability.message, 'unavailable');

  const { outTradeNo, payData } = await createOrder(tierId);
  await requestPayment(payData);
  const result = await confirmOrder(outTradeNo);

  if (result.status !== 'DELIVERED') {
    throw fail('支付结果确认中，稍后可在赞助记录里查看，请勿重复支付', 'confirming');
  }
  return result;
}

module.exports = {
  IOS_MIN_WECHAT_VERSION,
  checkAvailability,
  compareVersion,
  fetchTiers,
  payTip
};
