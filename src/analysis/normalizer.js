const { MAX_LINES } = require('../core/constants');
const { shortHash } = require('../core/hash');
const { parseLine } = require('./parser');

function normalizeLog(text) {
  const lines = String(text).split(/\r?\n/);
  if (lines.length > MAX_LINES) throw new Error(`日志超过 ${MAX_LINES.toLocaleString()} 行上限`);
  const datasetId = shortHash(text);
  const events = [];
  const rejected = [];
  const seenIds = new Set();
  lines.forEach((raw, index) => {
    if (!raw.trim()) return;
    const row = parseLine(raw, index + 1);
    if (!row || !row.time) {
      rejected.push({ line: index + 1, reason: !row ? '格式或必需字段无效' : '事件时间无效', raw });
      return;
    }
    row.eventId = row.eventId ? String(row.eventId) : `${datasetId}-${index + 1}`;
    if (seenIds.has(row.eventId)) {
      rejected.push({ line: index + 1, reason: '重复 event_id', raw });
      return;
    }
    seenIds.add(row.eventId);
    events.push({ ...row, raw });
  });
  if (!events.length) throw new Error('未识别到有效访问日志；请使用 Common/Combined 或 JSON Lines 格式');
  return { datasetId, events, rejected };
}

module.exports = { normalizeLog };
