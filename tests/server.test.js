const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { server, demoLog } = require('../src/server/server');

test('persists an analysis and validates alert review transitions', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let reportId;
  const post = (url, body) => fetch(base + url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    const created = await post('/api/analyze', { text: demoLog(), filename: 'fixture.log' });
    assert.equal(created.status, 200);
    const report = await created.json();
    reportId = report.id;
    assert.equal(report.summary.total, 102);
    const alert = report.alerts[0];
    const route = `/api/history/${report.id}/alerts/${alert.id}/review`;
    const invalid = await post(route, { status: 'CONFIRMED', actor: 'reviewer', reason: '跳过分诊' });
    assert.equal(invalid.status, 400);
    const reviewed = await post(route, { status: 'TRIAGED', actor: 'reviewer', reason: '核对原始事件' });
    assert.equal(reviewed.status, 200);
    const saved = await fetch(base + `/api/history/${report.id}`).then(response => response.json());
    assert.equal(saved.alerts[0].disposition, 'TRIAGED');
    assert.deepEqual(saved.alerts[0].reviews.map(item => [item.from, item.to]), [['NEW', 'TRIAGED']]);
    assert.ok(saved.alerts[0].eventIds.every(id => saved.events.some(event => event.eventId === id)));
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (reportId) fs.rmSync(path.join(__dirname, '..', 'data', `${reportId}.json`), { force: true });
  }
});
