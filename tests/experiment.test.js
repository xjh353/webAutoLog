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

test('plan freezes the comparison rules and records stopping, failure and status policy', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'experiment-plan.json'), 'utf8'));
  assert.equal(plan.primaryMetric, '测试分区的正常会话中，产生候选告警的会话数（FP）');
  assert.equal(plan.qualityGate, '测试分区的目标异常会话均需产生候选告警，且告警 event_id 能回查原始事件');
  assert.equal(plan.repetitions, 3);
  assert.equal(plan.timingBoundary, '仅 analyze() 的同步处理时间；不含生成输入、读写结果或人工复核');
  assert.deepEqual(plan.fixed, ['同一批合成会话', '相同解析器、60 秒窗口和其他阈值', '按完整会话统计', '相同运行入口和计时边界']);
  assert.ok(plan.stoppingRule);
  assert.ok(plan.failurePolicy);
  assert.deepEqual(plan.executionStatus.allowedLabels, ['本人运行', '读取已有结果', '仅计划·教学示意']);
  assert.ok(plan.rulerFreeze);
  assert.ok(plan.completionStandard);
});
