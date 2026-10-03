const { getRandomQuote } = require('../../utils/data.js');

Page({
  data: {
    dateStr: '',
    weekday: '',
    year: '',
    quote: { text: '', author: '' }
  },

  onLoad() {
    this.setDate(new Date());
    this.refreshQuote();
  },

  setDate(date) {
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    this.setData({
      dateStr: `${String(month).padStart(2, '0')} / ${String(day).padStart(2, '0')}`,
      weekday: weekdays[date.getDay()],
      year: date.getFullYear()
    });
  },

  refreshQuote() {
    const quote = getRandomQuote();
    this.setData({ quote });
  },

  onChangeQuote() {
    this.refreshQuote();
  },

  onShareAppMessage() {
    const { quote } = this.data;
    return {
      title: `${quote.text}丨人生指南库`,
      path: '/pagesA/daily/daily',
      imageUrl: '/assets/images/daily.jpg'
    };
  },

  onShareTimeline() {
    const { quote } = this.data;
    return {
      title: `${quote.text}丨人生指南库`,
      imageUrl: '/assets/images/daily.jpg'
    };
  }
});
