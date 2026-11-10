// Reproducible teaching experiment. Labels stay outside the log passed to the analyzer.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { analyze } = require('../src/analysis/analyzer');

const ROOT = path.join(__dirname, '..');
const CASES = path.join(ROOT, 'fixtures', 'experiment-cases.json');
const PLAN = path.join(ROOT, 'fixtures', 'experiment-plan.json');
const APPROVALS = path.join(ROOT, 'fixtures', 'approved-load.json');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function makeInput(cases) {
  return cases.flatMap((item, group) => Array.from({ length: item.count }, (_, i) => JSON.stringify({
    event_id: `${item.id}-${i}`,
    event_time: new Date(Date.parse('2026-11-04T02:00:00Z') + group * 120_000 + i * 1_000).toISOString(),
    service: 'teaching', session_id: item.id,
    route: item.varyRoute ? `${item.route}-${i}` : item.route,
    status: item.status, latency_ms: 15,
  }))).join('\n');
}

function score(report, cases, split) {
  const rows = cases.filter(item => item.split === split).map(item => {
    const alerts = report.alerts.filter(alert => alert.eventIds.some(id => id.startsWith(`${item.id}-`)));
    return { session: item.id, actual: item.label, predicted: alerts.length ? 'anomaly' : 'normal',
      alertRules: alerts.map(alert => alert.ruleId) };
  });
  const TP = rows.filter(r => r.actual === 'anomaly' && r.predicted === 'anomaly').length;
  const FP = rows.filter(r => r.actual === 'normal' && r.predicted === 'anomaly').length;
  const FN = rows.filter(r => r.actual === 'anomaly' && r.predicted === 'normal').length;
  const TN = rows.filter(r => r.actual === 'normal' && r.predicted === 'normal').length;
  return { unit: 'session', rows, TP, FP, FN, TN,
    precision: TP + FP ? TP / (TP + FP) : null,
    recall: TP + FN ? TP / (TP + FN) : null,
    fpr: FP + TN ? FP / (FP + TN) : null,
    reviewSessions: TP + FP };
}

function runExperiment({ save = false } = {}) {
  const casesText = fs.readFileSync(CASES, 'utf8');
  const planText = fs.readFileSync(PLAN, 'utf8');
  const cases = JSON.parse(casesText);
  const plan = JSON.parse(planText);
  const input = makeInput(cases);
  const approvedText = fs.readFileSync(APPROVALS, 'utf8');
  const approvedLoadSessions = JSON.parse(approvedText).groups;
  const strategies = [
    { name: 'baseline', options: { strategy: 'baseline' } },
    { name: 'approved-load', options: { strategy: 'approved-load', approvedLoadSessions } },
  ];
  const runs = [];
  const reports = {};
  for (let round = 1; round <= plan.repetitions; round++) {
    for (const strategy of strategies) {
      try {
        const start = performance.now();
        const report = analyze(input, 'experiment.jsonl', strategy.options);
        const elapsedMs = performance.now() - start;
        reports[strategy.name] = report;
        runs.push({ round, strategy: strategy.name, status: 'completed', elapsedMs,
          datasetId: report.datasetId, ruleVersion: report.ruleVersion,
          validRows: report.summary.total, rejectedRows: report.summary.invalidCount,
          alertCount: report.alerts.length, suppressedCount: report.suppressed.length });
      } catch (error) {
        runs.push({ round, strategy: strategy.name, status: 'failed', error: error.message });
      }
    }
  }
  if (!reports.baseline || !reports['approved-load']) throw new Error('至少一个规则版本未能运行');
  const scored = Object.fromEntries(strategies.map(strategy => [strategy.name, {
    development: score(reports[strategy.name], cases, 'development'),
    test: score(reports[strategy.name], cases, 'test'),
  }]));
  const trace = Object.fromEntries(strategies.map(strategy => {
    const report = reports[strategy.name];
    const ids = new Set(report.events.map(event => event.eventId));
    return [strategy.name, report.alerts.every(alert => alert.eventIds.length > 0 && alert.eventIds.every(id => ids.has(id))) &&
      report.suppressed.every(item => item.eventIds.length > 0 && item.eventIds.every(id => ids.has(id)))];
  }));
  const testA = scored.baseline.test;
  const testB = scored['approved-load'].test;
  const gatePassed = runs.every(run => run.status === 'completed') && testB.FN === 0 &&
    trace.baseline && trace['approved-load'];
  const result = {
    status: 'executed', createdAt: new Date().toISOString(),
    input: { source: 'fixtures/experiment-cases.json', sha256: sha256(input), datasetId: reports.baseline.datasetId,
      sessions: cases.length, rows: input.split('\n').length, splitUnit: 'complete session',
      approvedContextSource: 'fixtures/approved-load.json', approvedContextSha256: sha256(approvedText) },
    plan: { source: 'fixtures/experiment-plan.json', sha256: sha256(planText), ...plan },
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    sourceHashes: Object.fromEntries(['src/analysis/analyzer.js', 'src/analysis/parser.js',
      'scripts/eval.js', 'fixtures/experiment-cases.json', 'fixtures/approved-load.json'].map(file =>
      [file, sha256(fs.readFileSync(path.join(ROOT, file)))])),
    runs, scored, trace,
    decision: gatePassed && testB.FP < testA.FP ? '候选在此合成测试分区值得继续验证' : '当前证据不足以采用候选',
    limits: ['每个分区只有四个构造会话，指标不代表真实流量准确率',
      '计时仅包含同步分析，人工复核和开发耗时未测',
      'AI 运行调用为 0；历史 AI 开发成本未知',
      '批准清单来自外部构造情境，不由日志内容推断'],
  };
  if (save) {
    const dir = path.join(ROOT, 'data', 'experiments', `${Date.now()}-${crypto.randomUUID()}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'input.jsonl'), input);
    fs.writeFileSync(path.join(dir, 'baseline.json'), JSON.stringify(reports.baseline, null, 2));
    fs.writeFileSync(path.join(dir, 'candidate.json'), JSON.stringify(reports['approved-load'], null, 2));
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
    result.outputDirectory = dir;
  }
  return result;
}

if (require.main === module) {
  const result = runExperiment({ save: process.argv.includes('--save') });
  console.log(JSON.stringify({ input: result.input, runs: result.runs, scored: result.scored,
    trace: result.trace, decision: result.decision, limits: result.limits,
    outputDirectory: result.outputDirectory || null }, null, 2));
}

module.exports = { makeInput, score, runExperiment };
