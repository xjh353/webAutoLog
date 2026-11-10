const crypto = require('node:crypto');
const { buildMetrics } = require('./metrics');

function buildReport({ datasetId, filename, ruleVersion, strategy, events, rejected, alerts, suppressed }) {
  const metrics = buildMetrics(events, alerts);
  const times = events.map(row => row.time).sort();
  return {
    id: crypto.randomUUID(), datasetId, ruleVersion, strategy, filename: String(filename).slice(0, 180), createdAt: new Date().toISOString(),
    summary: { total: events.length, uniqueIps: metrics.uniqueIps, alertCount: alerts.length,
      highCount: alerts.filter(alert => alert.severity === 'high').length,
      errorRate: Math.round((metrics.statusGroups.clientError + metrics.statusGroups.serverError) / events.length * 1000) / 10,
      invalidCount: rejected.length, from: times[0] || null, to: times.at(-1) || null },
    statusGroups: metrics.statusGroups, timeline: metrics.timeline, topIps: metrics.topIps,
    alerts, suppressed, invalidLines: rejected.slice(0, 20).map(row => row.line), rejected, events,
  };
}

module.exports = { buildReport };
