const formatNumber = n => {
  n = n.toString();
  return n[1] ? n : '0' + n;
};

const formatTime = date => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  return [year, month, day].map(formatNumber).join('/') + ' ' + [hour, minute, second].map(formatNumber).join(':');
};

const formatCount = num => {
  if (!num && num !== 0) return '0';
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
};

const formatDate = dateStr => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}-${formatNumber(month)}-${formatNumber(day)}`;
};

const debounce = (fn, delay = 300) => {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
};

const throttle = (fn, interval = 200) => {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= interval) {
      last = now;
      fn.apply(this, args);
    }
  };
};

const getSystemInfo = () => {
  try {
    return wx.getSystemInfoSync();
  } catch (e) {
    return {
      statusBarHeight: 20,
      screenWidth: 375,
      screenHeight: 667,
      safeArea: { bottom: 667 }
    };
  }
};

const getStatusBarHeight = () => {
  const info = getSystemInfo();
  return info.statusBarHeight || 20;
};

const getNavBarHeight = () => {
  const menuButtonInfo = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
  const statusBarHeight = getStatusBarHeight();
  if (menuButtonInfo) {
    const menuHeight = menuButtonInfo.height || 32;
    const menuTop = menuButtonInfo.top || statusBarHeight + 8;
    return (menuTop - statusBarHeight) * 2 + menuHeight;
  }
  return 44;
};

module.exports = {
  formatTime,
  formatCount,
  formatDate,
  debounce,
  throttle,
  getSystemInfo,
  getStatusBarHeight,
  getNavBarHeight
};
