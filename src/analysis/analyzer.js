const { RULE_VERSIONS } = require('../core/constants');
const { createAlert } = require('../domain/alert');
const { normalizeLog } = require('./normalizer');
const { matchingRequestRules } = require('./rules/request-rules');
const { findWindowMatches } = require('./rules/window-rules');
const { buildReport } = require('./report-builder');
const { parseLine, decodePath } = require('./parser');

function optionsFor(strategy, approvedLoadSessions) {
  if (!RULE_VERSIONS[strategy]) throw new Error('未知规则策略');
  if (strategy === 'approved-load' && (!Array.isArray(approvedLoadSessions) || approvedLoadSessions.some(item =>
    !item || typeof item.service !== 'string' || !item.service || typeof item.sessionId !== 'string' || !item.sessionId))) {
    throw new Error('已批准压测会话清单无效');
  }
  return { ruleVersion: RULE_VERSIONS[strategy], approvedKeys: new Set((approvedLoadSessions || []).map(item => `${item.service}\0${item.sessionId}`)) };
}

function analyze(text, filename = '未命名日志', options = {}) {
  const strategy = options.strategy || 'baseline';
  const config = optionsFor(strategy, options.approvedLoadSessions);
  const { datasetId, events, rejected } = normalizeLog(text);
  const alerts = [];
  const suppressed = [];
  for (const row of events) {
    for (const rule of matchingRequestRules(row)) {
      alerts.push(createAlert(rule, row, config.ruleVersion, rule.evidence ? { evidence: rule.evidence } : {}));
    }
  }
  for (const match of findWindowMatches(events)) {
    const isApproved = strategy === 'approved-load' && match.rule.id === 'request_burst' && match.row.sessionId &&
      config.approvedKeys.has(`${match.row.service}\0${match.row.sessionId}`);
    if (isApproved) {
      suppressed.push({ ruleId: match.rule.id, service: match.row.service, sessionId: match.row.sessionId,
        time: match.row.time, eventIds: match.eventIds, reason: '外部清单标明该会话为已批准压测' });
    } else {
      alerts.push(createAlert(match.rule, match.row, config.ruleVersion, {
        count: match.count, eventIds: match.eventIds, evidence: `60 秒内 ${match.count} 次相关请求`,
      }));
    }
  }
  const rank = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || String(b.time).localeCompare(String(a.time)));
  return buildReport({ datasetId, filename, ruleVersion: config.ruleVersion, strategy, events, rejected, alerts, suppressed });
}

module.exports = { analyze, parseLine, decodePath };
