const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze, parseLine } = require('../src/analysis/analyzer');
const { demoLog } = require('../src/server/server');

test('parses Combined and JSON Lines access logs', () => {
  const combined = parseLine('203.0.113.10 - - [04/Nov/2026:10:05:00 +0800] "GET /login HTTP/1.1" 200 1532 "-" "Mozilla/5.0"', 1);
  assert.equal(combined.ip, '203.0.113.10');
  assert.equal(combined.time, '2026-11-04T02:05:00.000Z');
  assert.equal(combined.status, 200);
  const json = parseLine(JSON.stringify({ time: '2026-11-04T10:05:00+08:00', remote_addr: '192.0.2.1', request: 'POST /login HTTP/1.1', status: 401 }), 2);
  assert.equal(json.method, 'POST');
  assert.equal(json.status, 401);
});

test('detects sample attack types and summarizes invalid rows', () => {
  const result = analyze(demoLog() + '\ninvalid row', 'demo.log');
  assert.equal(result.summary.total, 102);
  assert.equal(result.summary.invalidCount, 1);
  assert.equal(result.invalidLines[0], 103);
  for (const id of ['sql_injection', 'xss', 'path_traversal', 'sensitive_path', 'scanner', 'login_failure', 'server_error_burst']) {
    assert.ok(result.alerts.some(alert => alert.ruleId === id), `missing ${id}`);
  }
});

test('rejects logs without valid records', () => {
  assert.throws(() => analyze('not an access log'), /未识别到有效访问日志/);
});

test('isolates malformed JSON objects while keeping valid evidence', () => {
  const valid = JSON.stringify({ event_id: 'ok-1', event_time: '2026-11-04T02:00:00Z', route: '/home', status: 200 });
  const report = analyze([valid, '{}', '{"event_id":{},"event_time":"2026-11-04T02:00:01Z","route":"/home","status":200}', '{broken'].join('\n'));
  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.invalidCount, 3);
  assert.deepEqual(report.rejected.map(item => item.line), [2, 3, 4]);
  assert.equal(report.events[0].eventId, 'ok-1');
});

test('does not treat an untrusted forwarded header as the source address', () => {
  const report = analyze(JSON.stringify({
    event_id: 'forwarded-1', event_time: '2026-11-04T02:00:00Z',
    session_id: 'session-1', route: '/home', status: 200, http_x_forwarded_for: '203.0.113.9',
  }));
  assert.equal(report.events[0].ip, 'unknown');
  assert.equal(report.events[0].sourceField, 'missing');
});

test('retains records without a reliable group but does not aggregate them', () => {
  const valid = JSON.stringify({ event_id: 'valid', event_time: '2026-11-04T02:00:00Z', session_id: 'known', route: '/home', status: 200 });
  const ungrouped = JSON.stringify({ event_id: 'ungrouped', event_time: '2026-11-04T02:00:01Z', route: '/home', status: 200, http_x_forwarded_for: '203.0.113.9' });
  const report = analyze(`${valid}\n${ungrouped}`);
  assert.equal(report.summary.total, 2);
  assert.equal(report.summary.invalidCount, 0);
  assert.equal(report.alerts.length, 0);
});

test('detects a burst spanning two clock minutes', () => {
  const lines = Array.from({ length: 8 }, (_, i) => `203.0.113.5 - - [04/Nov/2026:10:${i < 4 ? '00' : '01'}:${String(i < 4 ? 54 + i : i - 4).padStart(2, '0')} +0800] "GET /missing HTTP/1.1" 404 0`);
  const report = analyze(lines.join('\n'));
  assert.equal(report.alerts.filter(a => a.ruleId === 'error_burst').length, 1);
});

test('uses an open left endpoint for the 60-second login window', () => {
  const make = seconds => seconds.map((second, i) => JSON.stringify({
    event_id: `window-${i}`, event_time: new Date(Date.parse('2026-11-04T02:00:00Z') + second * 1000).toISOString(),
    service: 'web', session_id: 'window', route: '/login', status: 401,
  })).join('\n');
  assert.equal(analyze(make([0, 1, 2, 3, 60])).alerts.some(a => a.ruleId === 'login_failure'), false);
  assert.equal(analyze(make([0, 1, 2, 3, 59])).alerts.some(a => a.ruleId === 'login_failure'), true);
});

test('isolates duplicate IDs and keeps traceable evidence without trusting labels', () => {
  const base = { event_time: '2026-11-04T10:00:00+08:00', service: 'web', route: '/login', status: 401, session_id: 's1', source_label: 'normal' };
  const lines = Array.from({ length: 5 }, (_, i) => JSON.stringify({ ...base, event_id: `evt-${i}`, event_time: `2026-11-04T10:00:0${i}+08:00` }));
  lines.push(lines[0]);
  const report = analyze(lines.join('\n'));
  assert.equal(report.summary.total, 5);
  assert.equal(report.rejected[0].reason, '重复 event_id');
  const alert = report.alerts.find(a => a.ruleId === 'login_failure');
  assert.deepEqual(alert.eventIds, ['evt-0', 'evt-1', 'evt-2', 'evt-3', 'evt-4']);
  assert.equal(alert.ruleVersion, report.ruleVersion);
  assert.equal(alert.disposition, 'NEW');
});

test('accepts v2 request_id and UTC time while retaining legacy import', () => {
  const legacy = '203.0.113.10 - - [04/Nov/2026:10:05:00 +0800] "GET /home HTTP/1.1" 200 10';
  const v2 = JSON.stringify({ request_id: 'req-1', event_time: '2026-11-04T02:05:00Z', service: 'web', route: '/home', status: 200 });
  const report = analyze(`${legacy}\n${v2}`);
  assert.equal(report.summary.total, 2);
  assert.equal(report.events[0].time, report.events[1].time);
  assert.equal(report.events[1].eventId, 'req-1');
});
