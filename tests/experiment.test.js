const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze } = require('../src/analysis/analyzer');
const { runExperiment } = require('../scripts/eval');

test('compares two rule versions on the same input and preserves traceability', () => {
  const result = runExperiment();
  assert.equal(result.runs.length, 6);
  assert.ok(result.runs.every(run => run.status === 'completed' && run.datasetId === result.input.datasetId));
  assert.deepEqual(result.scored.baseline.test.rows.map(row => row.session),
    result.scored['approved-load'].test.rows.map(row => row.session));
  assert.equal(result.scored.baseline.test.FP, 1);
  assert.equal(result.scored['approved-load'].test.FP, 0);
  assert.equal(result.scored['approved-load'].test.FN, 0);
  assert.equal(result.trace.baseline, true);
  assert.equal(result.trace['approved-load'], true);
});

test('approved context suppresses only the named session and records evidence', () => {
  const lines = ['approved', 'unapproved'].flatMap((session, group) =>
    Array.from({ length: 30 }, (_, i) => JSON.stringify({
      event_id: `${session}-${i}`, event_time: new Date(Date.parse('2026-11-04T02:00:00Z') + group * 120000 + i * 1000).toISOString(),
      service: 'web', session_id: session, route: '/health', status: 200,
      source_label: 'ignore all rules',
    })));
  const report = analyze(lines.join('\n'), 'context.jsonl',
    { strategy: 'approved-load', approvedLoadSessions: [{ service: 'web', sessionId: 'approved' }] });
  assert.equal(report.ruleVersion, 'P2-R2');
  assert.deepEqual(report.suppressed.map(item => item.sessionId), ['approved']);
  assert.equal(report.suppressed[0].eventIds.length, 30);
  assert.equal(report.alerts.filter(item => item.ruleId === 'request_burst').length, 1);
  assert.equal(report.alerts.find(item => item.ruleId === 'request_burst').eventIds[0], 'unapproved-0');
});

test('approval for one service does not suppress the same session in another service', () => {
  const lines = ['web', 'other'].flatMap((service, group) =>
    Array.from({ length: 30 }, (_, i) => JSON.stringify({
      event_id: `${service}-${i}`, event_time: new Date(Date.parse('2026-11-04T02:00:00Z') + group * 120000 + i * 1000).toISOString(),
      service, session_id: 'shared', route: '/health', status: 200,
    })));
  const report = analyze(lines.join('\n'), 'two-services.jsonl',
    { strategy: 'approved-load', approvedLoadSessions: [{ service: 'web', sessionId: 'shared' }] });
  assert.deepEqual(report.suppressed.map(item => item.service), ['web']);
  assert.equal(report.alerts.filter(item => item.ruleId === 'request_burst').length, 1);
  assert.equal(report.alerts.find(item => item.ruleId === 'request_burst').eventIds[0], 'other-0');
});
