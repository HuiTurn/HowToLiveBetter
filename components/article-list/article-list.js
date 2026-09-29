Component({
  properties: {
    list: { type: Array, value: [] },
    loading: { type: Boolean, value: false },
    hasMore: { type: Boolean, value: true },
    layout: { type: String, value: 'horizontal' },
    showStar: { type: Boolean, value: true },
    emptyIcon: { type: String, value: '/assets/icons/favorite.png' },
    emptyText: { type: String, value: '暂无数据' },
    emptyButton: { type: String, value: '' }
  },

  methods: {
    onLoadMore() {
      this.triggerEvent('loadMore');
    },

    onEmptyAction() {
      this.triggerEvent('emptyAction');
    },

    onFavorite(e) {
      this.triggerEvent('favorite', e.detail);
    }
  }
});
