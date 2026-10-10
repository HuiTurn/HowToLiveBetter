const pay = require('../../utils/pay');

const ANIMATION_MS = 220;

Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
      observer(next) {
        if (next) this.open();
        else this.close();
      }
    }
  },

  data: {
    Render: false,
    Active: false,
    tiers: [],
    selectedId: '',
    selectedAmount: 0,
    loading: true,
    paying: false,
    done: false,
    tipCount: 0,
    errorMessage: '',
    payError: ''
  },

  methods: {
    open() {
      // 开发者工具与低版本 iOS 无法支付，打开时就说明原因，别等用户点了才报错
      const availability = pay.checkAvailability();
      if (this._closeTimer) {
        clearTimeout(this._closeTimer);
        this._closeTimer = null;
      }
      this.setData({
        Render: true,
        done: false,
        paying: false,
        errorMessage: '',
        payError: ''
      });
      // 等节点挂载后再加过渡类，否则进场动画不生效
      wx.nextTick(() => setTimeout(() => this.setData({ Active: true }), 20));
      if (!this.data.tiers.length) this.loadTiers();
    },

    close() {
      if (!this.data.Render) return;
      this.setData({ Active: false });
      this._closeTimer = setTimeout(() => {
        this._closeTimer = null;
        this.setData({ Render: false });
      }, ANIMATION_MS);
    },

    onClose() {
      if (this.data.paying) return;
      this.triggerEvent('close');
    },

    noop() {},

    async loadTiers() {
      this.setData({ loading: true, errorMessage: '' });
      try {
        const tiers = await pay.fetchTiers();
        if (!tiers.length) throw new Error('暂时没有可赞助的档位，请稍后再试');
        // 默认选中第一个档位
        const first = tiers[0];
        this.setData({
          tiers,
          loading: false,
          selectedId: first.id,
          selectedAmount: first.amount
        });
      } catch (err) {
        this.setData({ loading: false, errorMessage: err.message || '加载失败，请检查网络后重试' });
      }
    },

    onSelect(e) {
      if (this.data.paying) return;
      const { id, amount } = e.currentTarget.dataset;
      this.setData({ selectedId: id, selectedAmount: Number(amount) });
    },

    async onConfirm() {
      const { selectedId, paying } = this.data;
      if (!selectedId || paying) return;

      this.setData({ paying: true, payError: '' });
      try {
        const result = await pay.payTip(selectedId);
        this.setData({ paying: false, done: true, tipCount: result.tipCount || 0 });
      } catch (err) {
        // 用户主动取消不算失败，静默回到选择态
        this.setData({
          paying: false,
          payError: err.code === 'cancel' ? '' : (err.message || '支付未完成，请稍后重试')
        });
      }
    },

    onFinish() {
      this.triggerEvent('close');
    }
  }
});
