const COMBINED = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"([^"\r\n]*)"\s+(\d{3})\s+(\S+)(?:\s+"([^"\r\n]*)"\s+"([^"\r\n]*)")?/;
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
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const request = String(row.request || `${row.request_method || row.method || 'GET'} ${row.request_uri || row.route || row.path || '/'} HTTP/1.1`);
    const parts = request.match(/^(\S+)\s+(\S+)/);
    const status = Number(row.status ?? row.status_code ?? row.response?.status);
    const eventId = row.event_id ?? row.request_id ?? null;
    const sourceField = ['remote_addr', 'client_ip', 'ip'].find(field => typeof row[field] === 'string' && row[field].trim());
    if (!parts || !Number.isInteger(status) || status < 100 || status > 599 ||
      (eventId !== null && ((typeof eventId !== 'string' && typeof eventId !== 'number') || !String(eventId).trim())) ||
      (row.session_id != null && !['string', 'number'].includes(typeof row.session_id)) ||
      (row.service != null && typeof row.service !== 'string') ||
      (row.route != null && typeof row.route !== 'string')) return null;
    return {
      line: lineNumber, eventId,
      time: parseTime(row.event_time || row.time || row.timestamp || row.time_local || row['@timestamp']),
      ip: sourceField ? row[sourceField].trim() : 'unknown', sourceField: sourceField || 'missing',
      method: parts[1].toUpperCase(), path: parts[2], route: String(row.route || parts[2]), status,
      service: row.service || 'web', sessionId: row.session_id == null || String(row.session_id).trim() === '' ? null : String(row.session_id),
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
    line: lineNumber, eventId: null, time: parseTime(match[2]), ip: match[1], sourceField: 'log_ip', method: parts[1].toUpperCase(),
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

module.exports = { parseLine, decodePath };
