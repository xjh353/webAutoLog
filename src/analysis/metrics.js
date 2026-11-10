function buildMetrics(events, alerts) {
  const statusGroups = { success: 0, redirect: 0, clientError: 0, serverError: 0 };
  const byMinute = new Map();
  const byIp = new Map();
  for (const row of events) {
    if (row.status >= 500) statusGroups.serverError++;
    else if (row.status >= 400) statusGroups.clientError++;
    else if (row.status >= 300) statusGroups.redirect++;
    else statusGroups.success++;
    const minute = row.time.slice(0, 16) + ':00Z';
    byMinute.set(minute, (byMinute.get(minute) || 0) + 1);
    const stat = byIp.get(row.ip) || { ip: row.ip, requests: 0, errors: 0, alerts: 0 };
    stat.requests++;
    if (row.status >= 400) stat.errors++;
    byIp.set(row.ip, stat);
  }
  for (const alert of alerts) byIp.get(alert.ip).alerts++;
  return { statusGroups, timeline: [...byMinute].sort(([a], [b]) => a.localeCompare(b)).map(([time, count]) => ({ time, count })),
    topIps: [...byIp.values()].sort((a, b) => b.alerts - a.alerts || b.requests - a.requests).slice(0, 10), uniqueIps: byIp.size };
}

module.exports = { buildMetrics };
