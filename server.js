const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { analyze } = require('./analyzer');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const MAX_BODY = 10 * 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let tooLarge = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) tooLarge = true;
      else if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return reject(new Error('文件超过 10 MB 上限'));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('请求内容不是有效 JSON')); }
    });
    req.on('error', reject);
  });
}

function listHistory() {
  if (!fs.existsSync(DATA)) return [];
  return fs.readdirSync(DATA).filter(name => /^[a-f0-9-]{36}\.json$/.test(name))
    .map(name => { try { const { id, filename, createdAt, summary } = JSON.parse(fs.readFileSync(path.join(DATA, name))); return { id, filename, createdAt, summary }; } catch { return null; } })
    .filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
}

function demoLog() {
  const base = Date.parse('2026-11-04T10:00:00+08:00');
  const lines = [];
  const add = (offset, ip, method, url, status, agent = 'Mozilla/5.0') => {
    const d = new Date(base + offset * 1000);
    const stamp = `${String(d.getUTCDate()).padStart(2, '0')}/Nov/2026:${String(d.getUTCHours() + 8).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} +0800`;
    lines.push(`${ip} - - [${stamp}] "${method} ${url} HTTP/1.1" ${status} 1240 "-" "${agent}"`);
  };
  for (let i = 0; i < 70; i++) add(i * 14, ['192.0.2.14', '192.0.2.48', '198.51.100.9'][i % 3], 'GET', ['/','/products','/about','/docs'][i % 4], 200);
  for (let i = 0; i < 10; i++) add(120 + i * 4, '203.0.113.27', 'POST', '/login', 401);
  for (let i = 0; i < 11; i++) add(260 + i * 3, '203.0.113.88', 'GET', `/missing-${i}`, 404, 'gobuster/3.6');
  add(310, '203.0.113.88', 'GET', '/.env', 404, 'gobuster/3.6');
  add(318, '203.0.113.88', 'GET', '/admin', 403, 'gobuster/3.6');
  add(380, '198.51.100.77', 'GET', '/search?q=%27%20UNION%20SELECT%20password', 400);
  add(395, '198.51.100.77', 'GET', '/download?file=../../etc/passwd', 403);
  add(410, '198.51.100.77', 'GET', '/search?q=%3Cscript%3Ealert(1)%3C/script%3E', 400);
  for (let i = 0; i < 6; i++) add(500 + i * 7, '192.0.2.90', 'GET', '/api/report', 500);
  return lines.join('\n');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/history' && req.method === 'GET') return json(res, 200, listHistory());
    if (url.pathname === '/api/demo' && req.method === 'GET') return json(res, 200, { text: demoLog(), filename: '示例访问日志.log' });
    const detail = url.pathname.match(/^\/api\/history\/([a-f0-9-]{36})$/);
    if (detail && req.method === 'GET') {
      const file = path.join(DATA, `${detail[1]}.json`);
      return fs.existsSync(file) ? json(res, 200, JSON.parse(fs.readFileSync(file))) : json(res, 404, { error: '记录不存在' });
    }
    if (url.pathname === '/api/analyze' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body || typeof body.text !== 'string' || !body.text.trim()) return json(res, 400, { error: '请提供非空日志内容' });
      const report = analyze(body.text, body.filename || '手动输入日志');
      fs.mkdirSync(DATA, { recursive: true });
      fs.writeFileSync(path.join(DATA, `${report.id}.json`), JSON.stringify(report));
      return json(res, 200, report);
    }
    if (req.method !== 'GET') return json(res, 405, { error: '不支持的请求方法' });
    const files = { '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/app.js': 'app.js' };
    const file = files[url.pathname];
    if (!file) return json(res, 404, { error: '页面不存在' });
    const fullPath = path.join(ROOT, 'public', file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fullPath)], 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(fullPath).pipe(res);
  } catch (error) {
    if (!res.headersSent && !res.destroyed) json(res, /超过|未识别|无效/.test(error.message) ? 400 : 500, { error: error.message });
  }
});

if (require.main === module) server.listen(PORT, '127.0.0.1', () => console.log(`Web 日志审计工作台运行于 http://127.0.0.1:${PORT}`));
module.exports = { server, demoLog };
