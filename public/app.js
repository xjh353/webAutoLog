const $ = id => document.getElementById(id);
let report = null;
let view = 'overview';
let history = [];
let visibleAlerts = 100;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '时间未知';
}

function message(text, error = false) {
  $('message').hidden = !text;
  $('message').textContent = text || '';
  $('message').classList.toggle('error', error);
}

async function api(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败');
  return result;
}

function setView(next) {
  view = next;
  for (const name of ['overview', 'alerts', 'history']) $('nav-' + name).classList.toggle('active', name === next);
  $('report').hidden = next !== 'overview' || !report;
  $('alerts-view').hidden = next !== 'alerts';
  $('history-view').hidden = next !== 'history';
  $('upload-card').hidden = next !== 'overview';
  $('import-button').hidden = next !== 'overview';
  const titles = { overview: 'Web 日志安全总览', alerts: '异常事件', history: '分析记录' };
  $('main-title').textContent = titles[next];
  $('page-name').textContent = { overview: '安全总览', alerts: '异常事件', history: '分析记录' }[next];
  $('subtitle').textContent = { overview: '导入访问日志，快速发现异常行为并追踪审计线索。', alerts: '定位可疑请求，查看证据并制定下一步排查动作。', history: '查看保存在本机的近期分析报告。' }[next];
  if (next === 'history') loadHistory();
  if (next === 'alerts') renderAlerts();
}

function renderReport() {
  if (!report) return;
  visibleAlerts = 100;
  const { summary, statusGroups, timeline, topIps, alerts } = report;
  $('report-filename').textContent = report.filename;
  $('report-time').textContent = formatTime(report.createdAt);
  $('metric-total').textContent = summary.total.toLocaleString();
  $('metric-alerts').textContent = summary.alertCount.toLocaleString();
  $('metric-high').textContent = summary.highCount.toLocaleString();
  $('metric-error').textContent = `${summary.errorRate}%`;
  $('nav-alert-count').textContent = summary.alertCount;
  $('donut-total').textContent = summary.total.toLocaleString();

  const chart = $('traffic-chart'); chart.replaceChildren();
  const points = timeline.length > 70 ? timeline.filter((_, i) => i % Math.ceil(timeline.length / 70) === 0) : timeline;
  const max = Math.max(1, ...points.map(p => p.count));
  for (const point of points) {
    const bar = el('div', 'bar');
    bar.style.height = `${Math.max(3, point.count / max * 100)}%`;
    bar.title = `${formatTime(point.time)} · ${point.count} 次`;
    chart.append(bar);
  }
  if (!points.length) chart.append(el('div', 'muted', '日志中没有可识别的时间信息'));
  $('chart-axis').replaceChildren(el('span', '', points.length ? formatTime(points[0].time) : ''), el('span', '', points.length ? formatTime(points.at(-1).time) : ''));

  const segments = [
    ['2xx 成功', statusGroups.success, '#4e95ec'], ['3xx 跳转', statusGroups.redirect, '#8ab8f4'],
    ['4xx 客户端错误', statusGroups.clientError, '#f0b462'], ['5xx 服务端错误', statusGroups.serverError, '#ed7474'],
  ];
  let current = 0;
  $('status-donut').style.background = `conic-gradient(${segments.map(([, count, color]) => { const start = current; current += count / summary.total * 100; return `${color} ${start}% ${current}%`; }).join(',')})`;
  const legend = $('status-legend'); legend.replaceChildren();
  for (const [label, count, color] of segments) {
    const row = el('div', 'legend-row'); const name = el('span'); const dot = el('i', 'legend-dot'); dot.style.background = color;
    name.append(dot, document.createTextNode(label)); row.append(name, el('b', '', count.toLocaleString())); legend.append(row);
  }

  $('ip-count').textContent = `${summary.uniqueIps} 个 IP`;
  const ipList = $('ip-list'); ipList.replaceChildren();
  for (const ip of topIps.slice(0, 5)) {
    const row = el('div', 'ip-row'); row.append(el('strong', '', ip.ip), el('span', '', `${ip.requests} 次请求`), el('span', 'ip-alert', `${ip.alerts} 条告警`)); ipList.append(row);
  }
  const findings = $('findings'); findings.replaceChildren();
  const findingData = [
    ['⚑', `${summary.highCount} 条高危事件`, summary.highCount ? '建议优先核查注入、脚本攻击及异常登录来源。' : '当前日志未命中高危规则。'],
    ['◎', `${summary.uniqueIps} 个独立来源`, '结合重点来源 IP 查看集中访问和错误请求。'],
    ['▤', `${summary.invalidCount} 行未解析`, summary.invalidCount ? `行号：${report.invalidLines.join('、')}${summary.invalidCount > 20 ? '…' : ''}` : '全部非空日志行均已成功解析。'],
  ];
  for (const [icon, title, desc] of findingData) { const row = el('div', 'finding'); const box = el('div', 'finding-icon', icon); const body = el('div'); body.append(el('strong', '', title), el('p', '', desc)); row.append(box, body); findings.append(row); }
  if (summary.invalidCount) message(`有 ${summary.invalidCount} 行无法解析，已跳过。`);
  else message('');
  renderAlerts();
  setView('overview');
}

function renderAlerts() {
  const body = $('alerts-body'); body.replaceChildren();
  const severity = $('severity-filter').value;
  const query = $('alert-search').value.trim().toLowerCase();
  const rows = (report?.alerts || []).filter(a => (severity === 'all' || a.severity === severity) && (!query || [a.ip, a.rule, a.path, a.evidence].join(' ').toLowerCase().includes(query)));
  for (const alert of rows.slice(0, visibleAlerts)) {
    const tr = el('tr'); const level = el('td'); level.append(el('span', `severity ${alert.severity}`, alert.severity === 'high' ? '高危' : '中危'));
    const rule = el('td'); rule.append(el('span', 'rule-name', alert.rule), el('span', 'evidence', alert.evidence), el('span', 'advice', alert.advice));
    tr.append(level, rule, el('td', '', alert.ip), el('td', '', formatTime(alert.time)), el('td', '', String(alert.status))); body.append(tr);
  }
  $('alerts-empty').hidden = rows.length > 0;
  $('more-alerts').hidden = rows.length <= visibleAlerts;
  $('more-alerts').textContent = `已显示 ${Math.min(visibleAlerts, rows.length)} / ${rows.length} 条 · 显示更多`;
}

async function loadHistory() {
  try { history = await api('/api/history'); } catch (error) { message(error.message, true); return; }
  const list = $('history-list'); list.replaceChildren();
  if (!history.length) { list.append(el('div', 'muted', '暂无分析记录。导入日志后会保存在这里。')); return; }
  for (const item of history) {
    const button = el('button', 'history-item'); const info = el('div');
    info.append(el('strong', '', item.filename), el('small', '', `${formatTime(item.createdAt)} · ${item.summary.total} 次请求 · ${item.summary.uniqueIps} 个来源 IP`));
    button.append(info, el('span', '', `${item.summary.alertCount} 条告警  →`));
    button.addEventListener('click', async () => { try { report = await api(`/api/history/${item.id}`); renderReport(); } catch (error) { message(error.message, true); } });
    list.append(button);
  }
}

async function analyzeText(text, filename) {
  message('正在分析日志…'); $('import-button').disabled = true;
  try { report = await api('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, filename }) }); renderReport(); }
  catch (error) { message(error.message, true); }
  finally { $('import-button').disabled = false; $('file-input').value = ''; }
}

async function handleFile(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return message('文件超过 10 MB 上限。', true);
  await analyzeText(await file.text(), file.name);
}

function download(format) {
  if (!report) return message('请先导入日志。', true);
  let content, type;
  if (format === 'json') { content = JSON.stringify(report, null, 2); type = 'application/json'; }
  else {
    const columns = ['severity', 'rule', 'time', 'ip', 'method', 'path', 'status', 'count', 'evidence', 'advice'];
    const csvCell = value => {
      const text = String(value ?? '');
      const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    content = '\ufeff' + [columns.join(','), ...report.alerts.map(a => columns.map(c => csvCell(a[c])).join(','))].join('\r\n');
    type = 'text/csv';
  }
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `audit-${report.id.slice(0, 8)}.${format}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

for (const name of ['overview', 'alerts', 'history']) $('nav-' + name).addEventListener('click', () => setView(name));
$('import-button').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', event => handleFile(event.target.files[0]));
$('demo-button').addEventListener('click', async () => { try { const demo = await api('/api/demo'); await analyzeText(demo.text, demo.filename); } catch (error) { message(error.message, true); } });
$('severity-filter').addEventListener('change', () => { visibleAlerts = 100; renderAlerts(); });
$('alert-search').addEventListener('input', () => { visibleAlerts = 100; renderAlerts(); });
$('more-alerts').addEventListener('click', () => { visibleAlerts += 100; renderAlerts(); });
$('export-json').addEventListener('click', () => download('json'));
$('export-csv').addEventListener('click', () => download('csv'));
const drop = $('upload-card');
drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('dragging'); handleFile(event.dataTransfer.files[0]); });
