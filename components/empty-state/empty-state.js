Component({
  properties: {
    icon: { type: String, value: '/assets/icons/favorite.png' },
    text: { type: String, value: '暂无数据' },
    buttonText: { type: String, value: '' }
  },

  methods: {
    onAction() {
      this.triggerEvent('action');
    }
  }
});
