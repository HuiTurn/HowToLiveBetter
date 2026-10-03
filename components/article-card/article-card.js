Component({
  properties: {
    article: { type: Object, value: {} },
    layout: { type: String, value: 'horizontal' }, // horizontal | vertical
    showCategory: { type: Boolean, value: false },
    categoryBelow: { type: Boolean, value: false },
    showSummary: { type: Boolean, value: true },
    showStar: { type: Boolean, value: true },
    disableTap: { type: Boolean, value: false }
  },

  data: {
    starPop: false
  },

  methods: {
    onTap() {
      if (this.data.disableTap) return;
      const { article } = this.data;
      if (!article || !article.id) return;
      wx.navigateTo({
        url: `/pagesA/article/article?id=${article.id}`
      });
    },

    onStar() {
      const { article } = this.data;
      if (!article || !article.id) return;
      this.setData({ starPop: true });
      setTimeout(() => this.setData({ starPop: false }), 320);
      this.triggerEvent('favorite', { id: article.id });
    }
  }
});
