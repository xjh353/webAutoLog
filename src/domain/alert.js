const crypto = require('node:crypto');

function createAlert(rule, row, ruleVersion, extra = {}) {
  return {
    id: crypto.randomUUID(), ruleId: rule.id, rule: rule.name, severity: rule.severity,
    ruleVersion, eventIds: extra.eventIds || [row.eventId],
    groupBy: row.sessionId ? 'session_id' : 'source_ip',
    time: row.time, ip: row.ip, method: row.method, path: row.path, status: row.status,
    line: row.line, evidence: extra.evidence || `${row.method} ${row.path} · HTTP ${row.status}`,
    advice: rule.advice, count: extra.count || 1, disposition: 'NEW', reviews: [],
  };
}

module.exports = { createAlert };
