/**
 * 更新时间的格式化（三态文案 + 相对/绝对时间）
 *
 * 三个时间口径别混用（见 docs/数据接口化改造方案.md）：
 *   sourceUpdatedAt 上游内容最后变更时刻 → 展示用这个（用户关心的是内容新鲜度）
 *   syncedAt        我们同步跑完的时刻   → 排查用
 *   cachedAt        客户端写缓存的时刻   → 判断缓存过期用
 *
 * 输入两种格式都要吃：
 *   接口 ISO  2026-10-06T10:59:00+08:00
 *   本地基线  2026-10-06 10:59（同步脚本写的北京时间字符串）
 */
const BJ_OFFSET = 8 * 3600 * 1000;

/** 统一解析成 Date；解析不出来返回 null，调用方负责兜底 */
function parse(t) {
  if (!t) return null;
  /* 本地基线格式：YYYY-MM-DD HH:mm（北京时间，补时区再解析） */
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/.exec(t);
  if (m && !/[+-]\d{2}:?\d{2}$/.test(t)) {
    const d = new Date(`${m[1]}T${m[2]}:${m[3] || '00'}+08:00`);
    return isNaN(d) ? null : d;
  }
  const d = new Date(t);
  return isNaN(d) ? null : d;
}

/** Date → 北京时间的可读串：'2026-10-06 10:59'（withYear=false 时省略年份） */
function absolute(t, withYear = true) {
  const d = parse(t);
  if (!d) return '';
  const bj = new Date(d.getTime() + BJ_OFFSET);
  const p = (n) => String(n).padStart(2, '0');
  const s = `${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())} ${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}`;
  return withYear ? `${bj.getUTCFullYear()}-${s}` : s;
}

/** 相对时间：<1 分钟「刚刚」/ <1 小时「N 分钟前」/ <24 小时「N 小时前」/ <7 天「N 天前」/ 更早返回 null */
function relative(t) {
  const d = parse(t);
  if (!d) return null;
  const diff = Date.now() - d.getTime();
  if (diff < 0) return '刚刚';
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} 天前`;
  return null;
}

/** 展示文案：7 天内用相对时间，更早用「10月6日」；同年省略年份 */
function shortLabel(t) {
  const rel = relative(t);
  if (rel) return rel;
  const d = parse(t);
  if (!d) return '';
  const bj = new Date(d.getTime() + BJ_OFFSET);
  const nowBj = new Date(Date.now() + BJ_OFFSET);
  const s = `${bj.getUTCMonth() + 1}月${bj.getUTCDate()}日`;
  return bj.getUTCFullYear() === nowBj.getUTCFullYear() ? s : `${bj.getUTCFullYear()}年${s}`;
}

/**
 * 三态文案（我的页 / 详情页共用）
 *   api   接口刚拉到，或缓存命中的版本与线上一致 → 「更新于 X」
 *   cache 缓存较旧但接口不可达 → 沿用缓存里记的时间，不加警示
 *   local 回落到本地冻结基线 → 「离线数据 · 封存于 X」，明确告知不是最新
 */
function statusLabel(status) {
  const t = status && status.updatedAt;
  if (!t) return '';
  if (status.source === 'local') return `离线数据 · 封存于 ${absolute(t, true)}`;
  return `更新于 ${absolute(t, true)}`;
}

module.exports = { parse, absolute, relative, shortLabel, statusLabel };
