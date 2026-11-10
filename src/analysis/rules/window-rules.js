const WINDOW_MS = 60_000;
const WINDOW_RULES = [
  { id: 'error_burst', name: '4xx 错误激增', severity: 'medium', threshold: 8, match: row => row.status >= 400 && row.status < 500, advice: '查看访问路径与返回码，判断是否在批量探测资源。' },
  { id: 'login_failure', name: '登录失败激增', severity: 'high', threshold: 5, match: row => /(?:login|signin|auth)/i.test(row.path) && [401, 403, 429].includes(row.status), advice: '核查账户登录记录，限制尝试频率并启用多因素认证。' },
  { id: 'server_error_burst', name: '5xx 错误激增', severity: 'high', threshold: 5, match: row => row.status >= 500, advice: '关联应用错误日志，检查服务健康状态与异常请求。' },
  { id: 'request_burst', name: '高频请求', severity: 'medium', threshold: 30, match: () => true, advice: '确认是否为正常爬虫或批量任务，评估限流策略。' },
];

function groupEvents(events) {
  const groups = new Map();
  for (const row of events) {
    if (!row.sessionId && row.ip === 'unknown') continue;
    const key = row.sessionId ? `${row.service}\0${row.sessionId}` : `ip\0${row.ip}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function findWindowMatches(events) {
  const matches = [];
  for (const rows of groupEvents(events).values()) {
    const sorted = [...rows].sort((a, b) => a.time.localeCompare(b.time));
    const counts = WINDOW_RULES.map(() => 0);
    const seen = new Set();
    let start = 0;
    for (let end = 0; end < sorted.length; end++) {
      const current = sorted[end];
      WINDOW_RULES.forEach((rule, index) => { if (rule.match(current)) counts[index]++; });
      while (Date.parse(current.time) - Date.parse(sorted[start].time) >= WINDOW_MS) {
        WINDOW_RULES.forEach((rule, index) => { if (rule.match(sorted[start])) counts[index]--; });
        start++;
      }
      WINDOW_RULES.forEach((rule, index) => {
        const key = `${rule.id}:${current.time.slice(0, 16)}`;
        if (counts[index] < rule.threshold || seen.has(key)) return;
        seen.add(key);
        matches.push({ rule, row: current, count: counts[index], eventIds: sorted.slice(start, end + 1).filter(rule.match).map(row => row.eventId) });
      });
    }
  }
  return matches;
}

module.exports = { WINDOW_MS, WINDOW_RULES, findWindowMatches };
