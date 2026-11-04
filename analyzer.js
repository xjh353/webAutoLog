const crypto = require('node:crypto');

const COMBINED = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([^"\r\n]*)"\s+(\d{3})\s+(\S+)(?:\s+"([^"\r\n]*)"\s+"([^"\r\n]*)")?/;
const MAX_LINES = 100000;
const RULE_VERSION = 'P2-R1';

function parseTime(value) {
  if (!value) return null;
  const apache = String(value).match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}:\d{2}:\d{2})\s+([+-]\d{4})$/);
  if (apache) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months.indexOf(apache[2]);
    if (month < 0) return null;
    const offset = apache[5].replace(/(\d{2})(\d{2})$/, '$1:$2');
    value = `${apache[3]}-${String(month + 1).padStart(2, '0')}-${apache[1]}T${apache[4]}${offset}`;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseLine(line, lineNumber) {
  let row;
  if (line.trimStart().startsWith('{')) {
    try { row = JSON.parse(line); } catch { return null; }
    const request = String(row.request || `${row.request_method || row.method || 'GET'} ${row.request_uri || row.route || row.path || '/'} HTTP/1.1`);
    const parts = request.match(/^(\S+)\s+(\S+)/);
    const status = Number(row.status ?? row.status_code ?? row.response?.status);
    if (!parts || !Number.isInteger(status) || status < 100 || status > 599) return null;
    return {
      line: lineNumber, eventId: row.event_id || row.request_id || null,
      time: parseTime(row.event_time || row.time || row.timestamp || row.time_local || row['@timestamp']),
      ip: String(row.remote_addr || row.client_ip || row.ip || row.http_x_forwarded_for || 'unknown').split(',')[0].trim(),
      method: parts[1].toUpperCase(), path: parts[2], route: String(row.route || parts[2]), status,
      service: String(row.service || 'web'), sessionId: row.session_id ? String(row.session_id) : null,
      actorHint: row.actor_hint ? String(row.actor_hint) : null,
      sourceLabel: row.source_label ?? null, latencyMs: row.latency_ms ?? null,
      bytes: Math.max(0, Number(row.body_bytes_sent ?? row.bytes_sent ?? row.bytes ?? 0) || 0),
      referrer: String(row.http_referer || row.referrer || '-'),
      agent: String(row.http_user_agent || row.user_agent || row.agent || '-'),
    };
  }
  const match = line.match(COMBINED);
  if (!match) return null;
  const parts = match[3].match(/^(\S+)\s+(\S+)/);
  if (!parts) return null;
  return {
    line: lineNumber, eventId: null, time: parseTime(match[2]), ip: match[1], method: parts[1].toUpperCase(),
    path: parts[2], route: parts[2], status: Number(match[4]), bytes: Number(match[5]) || 0,
    service: 'web', sessionId: null, actorHint: null, sourceLabel: null, latencyMs: null,
    referrer: match[6] || '-', agent: match[7] || '-',
  };
}

function decodePath(value) {
  let decoded = value;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { break; }
  }
  return decoded;
}

const rules = [
  { id: 'sql_injection', name: '疑似 SQL 注入', severity: 'high', pattern: /(?:\bunion\s+(?:all\s+)?select\b|\b(?:or|and)\s+['"\d]+\s*=\s*['"\d]+|\binformation_schema\b|\bsleep\s*\(|\bbenchmark\s*\()/i, advice: '核查参数与数据库访问记录，使用参数化查询。' },
  { id: 'xss', name: '疑似跨站脚本', severity: 'high', pattern: /(?:<\s*script\b|javascript\s*:|\bonerror\s*=|<\s*img\b[^>]*\bonload\s*=)/i, advice: '检查输入校验与输出转义，并复核相关页面。' },
  { id: 'path_traversal', name: '路径穿越尝试', severity: 'high', pattern: /(?:\.\.\/|\.\.\\|\/etc\/passwd|\\windows\\win\.ini)/i, advice: '检查文件访问接口的路径规范化及授权控制。' },
  { id: 'sensitive_path', name: '敏感路径探测', severity: 'medium', pattern: /(?:^|\/)(?:\.env|\.git|wp-admin|phpmyadmin|admin|actuator|server-status)(?:[/?#.]|$)/i, advice: '确认敏感路径未公开，并检查来源 IP 的其他请求。' },
];

function makeAlert(rule, row, extra = {}) {
  return {
    id: crypto.randomUUID(), ruleId: rule.id, rule: rule.name, severity: rule.severity,
    ruleVersion: RULE_VERSION, eventIds: extra.eventIds || [row.eventId],
    groupBy: row.sessionId ? 'session_id' : 'source_ip',
    time: row.time, ip: row.ip, method: row.method, path: row.path, status: row.status,
    line: row.line, evidence: extra.evidence || `${row.method} ${row.path} · HTTP ${row.status}`,
    advice: rule.advice, count: extra.count || 1,
    disposition: 'NEW', reviews: [],
  };
}

function analyze(text, filename = '未命名日志') {
  const lines = String(text).split(/\r?\n/);
  if (lines.length > MAX_LINES) throw new Error(`日志超过 ${MAX_LINES.toLocaleString()} 行上限`);
  const entries = [];
  const rejected = [];
  const seenIds = new Set();
  const datasetId = crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 16);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = parseLine(lines[i], i + 1);
    if (!row || !row.time) { rejected.push({ line: i + 1, reason: !row ? '格式或必需字段无效' : '事件时间无效', raw: lines[i] }); continue; }
    row.eventId = row.eventId ? String(row.eventId) : `${datasetId}-${i + 1}`;
    if (seenIds.has(row.eventId)) { rejected.push({ line: i + 1, reason: '重复 event_id', raw: lines[i] }); continue; }
    seenIds.add(row.eventId);
    row.raw = lines[i];
    entries.push(row);
  }
  if (!entries.length) throw new Error('未识别到有效访问日志；请使用 Common/Combined 或 JSON Lines 格式');

  const alerts = [];
  const byIp = new Map();
  const byMinute = new Map();
  const alertCounts = new Map();
  const addAlert = alert => {
    alerts.push(alert);
    alertCounts.set(alert.ip, (alertCounts.get(alert.ip) || 0) + 1);
  };
  const statusGroups = { success: 0, redirect: 0, clientError: 0, serverError: 0 };
  for (const row of entries) {
    if (row.status >= 500) statusGroups.serverError++;
    else if (row.status >= 400) statusGroups.clientError++;
    else if (row.status >= 300) statusGroups.redirect++;
    else statusGroups.success++;
    const group = row.sessionId ? `${row.service}:${row.sessionId}` : `ip:${row.ip}`;
    if (!byIp.has(group)) byIp.set(group, []);
    byIp.get(group).push(row);
    if (row.time) {
      const minute = row.time.slice(0, 16) + ':00Z';
      byMinute.set(minute, (byMinute.get(minute) || 0) + 1);
    }
    const decoded = decodePath(row.path);
    for (const rule of rules) if (rule.pattern.test(decoded)) addAlert(makeAlert(rule, row));
    if (/(?:sqlmap|nikto|nmap|masscan|gobuster|dirbuster)/i.test(row.agent)) {
      addAlert(makeAlert({ id: 'scanner', name: '自动化扫描工具', severity: 'medium', advice: '核查扫描来源及授权情况，必要时限制访问。' }, row, { evidence: `User-Agent: ${row.agent.slice(0, 120)}` }));
    }
  }

  for (const [, rows] of byIp) {
    const sorted = rows.filter(r => r.time).sort((a, b) => a.time.localeCompare(b.time));
    const checks = [
      { id: 'error_burst', name: '4xx 错误激增', severity: 'medium', threshold: 8, match: r => r.status >= 400 && r.status < 500, advice: '查看访问路径与返回码，判断是否在批量探测资源。' },
      { id: 'login_failure', name: '登录失败激增', severity: 'high', threshold: 5, match: r => /(?:login|signin|auth)/i.test(r.path) && [401, 403, 429].includes(r.status), advice: '核查账户登录记录，限制尝试频率并启用多因素认证。' },
      { id: 'server_error_burst', name: '5xx 错误激增', severity: 'high', threshold: 5, match: r => r.status >= 500, advice: '关联应用错误日志，检查服务健康状态与异常请求。' },
      { id: 'request_burst', name: '高频请求', severity: 'medium', threshold: 30, match: () => true, advice: '确认是否为正常爬虫或批量任务，评估限流策略。' },
    ];
    const counts = checks.map(() => 0);
    const seen = new Set();
    let start = 0;
    for (let end = 0; end < sorted.length; end++) {
      const current = sorted[end];
      for (let i = 0; i < checks.length; i++) if (checks[i].match(current)) counts[i]++;
      while (Date.parse(current.time) - Date.parse(sorted[start].time) >= 60_000) {
        for (let i = 0; i < checks.length; i++) if (checks[i].match(sorted[start])) counts[i]--;
        start++;
      }
      for (let i = 0; i < checks.length; i++) {
        const check = checks[i];
        const key = `${check.id}:${current.time.slice(0, 16)}`;
        if (counts[i] < check.threshold || seen.has(key)) continue;
        seen.add(key);
        const matched = sorted.slice(start, end + 1).filter(check.match);
        addAlert(makeAlert(check, current, { count: counts[i], eventIds: matched.map(r => r.eventId), evidence: `60 秒内 ${counts[i]} 次相关请求` }));
      }
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || String(b.time).localeCompare(String(a.time)));
  const ipRows = new Map();
  for (const row of entries) {
    const stat = ipRows.get(row.ip) || { ip: row.ip, requests: 0, errors: 0, alerts: 0 };
    stat.requests++;
    if (row.status >= 400) stat.errors++;
    ipRows.set(row.ip, stat);
  }
  for (const [ip, count] of alertCounts) ipRows.get(ip).alerts = count;
  const ipStats = [...ipRows.values()].sort((a, b) => b.alerts - a.alerts || b.requests - a.requests).slice(0, 10);
  const times = entries.map(r => r.time).filter(Boolean).sort();
  return {
    id: crypto.randomUUID(), datasetId, ruleVersion: RULE_VERSION,
    filename: String(filename).slice(0, 180), createdAt: new Date().toISOString(),
    summary: {
      total: entries.length, uniqueIps: ipRows.size, alertCount: alerts.length,
      highCount: alerts.filter(a => a.severity === 'high').length,
      errorRate: Math.round((statusGroups.clientError + statusGroups.serverError) / entries.length * 1000) / 10,
      invalidCount: rejected.length, from: times[0] || null, to: times.at(-1) || null,
    },
    statusGroups, timeline: [...byMinute].sort(([a], [b]) => a.localeCompare(b)).map(([time, count]) => ({ time, count })),
    topIps: ipStats, alerts, invalidLines: rejected.slice(0, 20).map(r => r.line),
    rejected, events: entries,
  };
}

module.exports = { analyze, parseLine, decodePath };
