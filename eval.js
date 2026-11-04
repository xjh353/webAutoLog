// Synthetic, session-level teaching fixture. Labels are read only after analysis.
const { analyze } = require('./analyzer');

const cases = [
  { id: 'normal', label: 'normal', count: 4, route: '/home', status: 200 },
  { id: 'login', label: 'anomaly', count: 5, route: '/login', status: 401 },
  { id: 'scan', label: 'anomaly', count: 8, route: '/missing', status: 404 },
  { id: 'load', label: 'normal', count: 30, route: '/health', status: 200, approvedLoad: true },
];

const lines = cases.flatMap((item, group) => Array.from({ length: item.count }, (_, i) => JSON.stringify({
  event_id: `${item.id}-${i}`,
  event_time: new Date(Date.parse('2026-11-04T02:00:00Z') + group * 120_000 + i * 1_000).toISOString(),
  service: 'demo', session_id: item.id, route: item.route, status: item.status,
  latency_ms: 15, source_label: item.label,
})));
const report = analyze(lines.join('\n'), 'synthetic-eval.jsonl');

function score(contextFilter) {
  const rows = cases.map(item => {
    const found = report.alerts.filter(alert => alert.eventIds.some(id => id.startsWith(`${item.id}-`)));
    const predicted = found.some(alert => !(contextFilter && item.approvedLoad && alert.ruleId === 'request_burst'));
    return { session: item.id, actual: item.label, predicted: predicted ? 'anomaly' : 'normal', alertRules: found.map(a => a.ruleId) };
  });
  const TP = rows.filter(r => r.actual === 'anomaly' && r.predicted === 'anomaly').length;
  const FP = rows.filter(r => r.actual === 'normal' && r.predicted === 'anomaly').length;
  const FN = rows.filter(r => r.actual === 'anomaly' && r.predicted === 'normal').length;
  const TN = rows.filter(r => r.actual === 'normal' && r.predicted === 'normal').length;
  return { rows, TP, FP, FN, TN, precision: TP + FP ? TP / (TP + FP) : null,
    recall: TP + FN ? TP / (TP + FN) : null, fpr: FP + TN ? FP / (FP + TN) : null };
}

if (require.main === module) console.log(JSON.stringify({
  datasetId: report.datasetId, ruleVersion: report.ruleVersion, unit: 'session',
  fixedRules: score(false), approvedLoadContext: score(true),
}, null, 2));

module.exports = { cases, score };
