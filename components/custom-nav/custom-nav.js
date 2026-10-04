const { getStatusBarHeight, getNavBarHeight } = require('../../utils/util.js');

Component({
  options: {
    multipleSlots: true
  },

  properties: {
    title: { type: String, value: '' },
    align: { type: String, value: 'center' }, // center | left
    back: { type: Boolean, value: false },
    home: { type: Boolean, value: false },
    bgColor: { type: String, value: 'var(--color-surface, #ffffff)' },
    textColor: { type: String, value: 'var(--color-text, #22262b)' },
    fixed: { type: Boolean, value: true },
    placeholder: { type: Boolean, value: true },
    shadow: { type: Boolean, value: true }
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44
  },

  lifetimes: {
    attached() {
      this.setData({
        statusBarHeight: getStatusBarHeight(),
        navBarHeight: getNavBarHeight()
      });
    }
  },

  methods: {
    onBack() {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack();
      } else {
        wx.switchTab({ url: '/pages/home/home' });
      }
    },

    onHome() {
      wx.switchTab({ url: '/pages/home/home' });
    },

    onRightTap() {
      this.triggerEvent('rightTap');
    }
  }
});
