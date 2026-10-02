const { formatCount } = require('../../utils/util.js');

Component({
  properties: {
    article: { type: Object, value: {} },
    layout: { type: String, value: 'horizontal' }, // horizontal | vertical
    showCategory: { type: Boolean, value: false },
    categoryBelow: { type: Boolean, value: false },
    showSummary: { type: Boolean, value: true },
    showLikes: { type: Boolean, value: true },
    showViews: { type: Boolean, value: true },
    showStar: { type: Boolean, value: true },
    disableTap: { type: Boolean, value: false }
  },

  data: {
    formattedViews: '',
    formattedLikes: '',
    starPop: false
  },

  observers: {
    'article.views, article.likes': function (views, likes) {
      this.setData({
        formattedViews: formatCount(views),
        formattedLikes: formatCount(likes)
      });
    }
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
