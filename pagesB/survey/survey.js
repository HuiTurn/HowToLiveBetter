const match = require('../../utils/match.js');

const TOTAL = 6;          // 年龄 → 性别 → 身份角色 → 关注领域 → 时间 → 期待效果
const AUTO_NEXT_MS = 280; // 选中后停留多久再自动进下一题（让选中态可见）

/** 给每个选项打上选中态。
 *  WXML 的 {{}} 不支持函数调用（picked.indexOf(...) 恒为 false），
 *  选中态必须在 JS 里算好再 setData。 */
function decorate(options, picked) {
  return options.map(o => ({
    id: o.id,
    label: o.label,
    desc: o.desc || '',
    on: picked.indexOf(o.id) > -1
  }));
}

Page({
  data: {
    step: 0,
    total: TOTAL,
    title: '',
    hint: '',
    multi: false,
    max: 1,
    isLast: false,
    options: [],
    picked: [],          // 当前题已选（多选时是数组）
    /* 主按钮：只在「需要显式确认」的题显示（多选题 / 最后一题），
       文案空串即隐藏。单选题靠 autoNext 自动前进，不给主按钮占位。 */
    primaryText: '',
    /* 底部浏览导航：没选中（或想回看）时在题目之间前后翻，不提交答案 */
    canPrev: false,
    canBrowseNext: false,
    tip: '',
    /* 问卷答案放 data 里：Page 的自定义属性（this.answers）在部分基础库不可靠，
       data 一定拿得到；答案不参与渲染，直接改 this.data.answers 即可 */
    answers: {
      age: '',
      gender: '',
      roles: [],
      concerns: [],
      budget: '',
      goals: []
    }
  },

  onLoad() {
    this.renderStep();
  },

  onUnload() {
    this.clearAutoNext();
  },

  /** 按当前 step 拼出对应题目；每题独立，不再依赖前面的选择 */
  renderStep() {
    const { step } = this.data;
    const a = this.data.answers;
    let title = '';
    let hint = '';
    let options = [];
    let multi = false;
    let max = 1;
    let picked = [];

    if (step === 0) {
      title = '你的年龄段是？';
      hint = '选一个，好挑出和你这个阶段相关的建议';
      options = match.AGE_BANDS.map(x => ({ id: x.id, label: x.label, desc: x.desc }));
      picked = a.age ? [a.age] : [];
    } else if (step === 1) {
      title = '你的性别是？';
      hint = '涉及性别的建议会更准，不方便可跳过';
      options = match.GENDERS.map(x => ({ id: x.id, label: x.label, desc: x.desc || '' }));
      picked = a.gender ? [a.gender] : [];
    } else if (step === 2) {
      title = '下面哪些身份符合现在的你？';
      hint = '可多选，最多 3 项';
      options = match.ROLES.map(x => ({ id: x.id, label: x.label, desc: x.desc }));
      multi = true;
      max = 3;
      picked = a.roles.slice();
    } else if (step === 3) {
      title = '你更在意生活里的哪些方面？';
      hint = '可多选，最多 5 项，会横跨好几个方面';
      options = match.CONCERNS.map(x => ({ id: x.id, label: x.label, desc: x.desc }));
      multi = true;
      max = 5;
      picked = a.concerns.slice();
    } else if (step === 4) {
      title = '每天大约能投入多少时间来改善？';
      hint = '决定先给你「顺手就能做」的还是需要投入的';
      options = match.TIME_BUDGET.map(x => ({ id: x.id, label: x.label, desc: x.desc }));
      picked = a.budget ? [a.budget] : [];
    } else {
      title = '你更希望这些建议带来什么？';
      hint = '可多选，最多 3 项';
      options = match.GOALS.map(x => ({ id: x.id, label: x.label, desc: x.desc }));
      multi = true;
      max = 3;
      picked = a.goals.slice();
    }

    /* 只保留当前题真实存在的选项：存档里的旧答案（题目选项变动）
       会被这里丢掉，不会白占多选名额 */
    const validPicked = picked.filter(pid => options.some(o => o.id === pid));

    const isLast = step >= TOTAL - 1;

    this.setData({
      title, hint, multi, max, isLast,
      picked: validPicked,
      options: decorate(options, validPicked),
      primaryText: (multi || isLast) ? (isLast ? '生成我的建议' : '下一步') : '',
      canPrev: step > 0,
      /* 年龄/性别/时间都可以跳过，末题靠主按钮生成，所以除末题外都允许往后翻 */
      canBrowseNext: !isLast,
      tip: multi
        ? '可只选一项，也可以直接进入下一题'
        : (isLast ? '选一个就会生成建议' : '选中后自动进入下一题，也可以先跳过')
    });
  },

  onOptionTap(e) {
    const { id } = e.currentTarget.dataset;
    const { multi, max, step } = this.data;
    if (!id) return;
    /* 只认当前这一题真实存在的选项：picked 里残留的失效 id 会白占多选名额，
       还会让界面误判成已作答 */
    if (!this.data.options.some(o => o.id === id)) return;

    let picked = this.data.picked.filter(pid => this.data.options.some(o => o.id === pid));

    if (!multi) {
      picked = [id];
    } else {
      const idx = picked.indexOf(id);
      if (idx > -1) {
        picked.splice(idx, 1);
      } else if (picked.length >= max) {
        wx.showToast({ title: `最多选 ${max} 项`, icon: 'none' });
        return;
      } else {
        picked.push(id);
      }
    }

    /* 选中即落答案：这样用底部导航回看/前进都不会丢选择 */
    this.commit(step, picked);

    this.setData({
      picked,
      options: decorate(this.data.options, picked)
    });

    /* 单选题自动进下一题；多选题和最后一题不自动跳
       （多选选 1 项就走等于没法多选，末题自动跳会跳过「生成」这一步） */
    if (!multi && !this.data.isLast) {
      this.scheduleAutoNext();
    }
  },

  scheduleAutoNext() {
    this.clearAutoNext();
    this._autoNextTimer = setTimeout(() => {
      this._autoNextTimer = null;
      this.enterStep(this.data.step + 1);
    }, AUTO_NEXT_MS);
  },

  clearAutoNext() {
    if (this._autoNextTimer) {
      clearTimeout(this._autoNextTimer);
      this._autoNextTimer = null;
    }
  },

  /** 前进一题；已到末题则出结果 */
  enterStep(step) {
    this.clearAutoNext();
    if (step >= TOTAL) {
      this.finish();
      return;
    }
    this.setData({ step }, () => this.renderStep());
  },

  /** 主按钮：只在多选题 / 最后一题出现，负责提交并前进 */
  onPrimary() {
    const { step, picked } = this.data;
    /* 末题还没选任何东西就不给生成，避免空 profile 出一堆无效推荐 */
    if (this.data.isLast && !picked.length) {
      wx.showToast({ title: '先选一项再生成建议', icon: 'none' });
      return;
    }
    /* 多选题选 0 项也允许「下一步」，当作跳过 */
    this.commit(step, picked);
    this.enterStep(step + 1);
  },

  /** 底部「下一题」：只翻页，不提交。用来跳过或先往后看看 */
  onBrowseNext() {
    if (!this.data.canBrowseNext) return;
    this.enterStep(this.data.step + 1);
  },

  onPrev() {
    this.clearAutoNext();
    const { step } = this.data;
    if (step <= 0) {
      wx.navigateBack();
      return;
    }
    this.setData({ step: step - 1 }, () => this.renderStep());
  },

  commit(step, picked) {
    if (step === 0) {
      this.data.answers.age = picked[0] || '';
    } else if (step === 1) {
      this.data.answers.gender = picked[0] || '';
    } else if (step === 2) {
      this.data.answers.roles = picked.slice();
    } else if (step === 3) {
      this.data.answers.concerns = picked.slice();
    } else if (step === 4) {
      this.data.answers.budget = picked[0] || 'tfree';
    } else {
      this.data.answers.goals = picked.slice();
    }
  },

  finish() {
    const a = this.data.answers;
    /* 关注领域是推荐的主要依据，至少要选一个，否则出不了有意义的结果 */
    if (!a.concerns.length) {
      wx.showToast({ title: '先选一个你在意的方面', icon: 'none' });
      this.setData({ step: 3 }, () => this.renderStep());
      return;
    }
    const profile = {
      age: a.age,
      gender: a.gender,
      roles: a.roles.slice(),
      concerns: a.concerns.slice(),
      budget: a.budget || 'tfree',
      goals: a.goals.slice(),
      ts: Date.now()
    };
    match.saveProfile(profile);
    wx.redirectTo({ url: '/pagesB/survey-result/survey-result?fresh=1' });
  }
});
