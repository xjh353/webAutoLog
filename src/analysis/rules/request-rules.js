const { decodePath } = require('../parser');

const REQUEST_RULES = [
  { id: 'sql_injection', name: '疑似 SQL 注入', severity: 'high', pattern: /(?:\bunion\s+(?:all\s+)?select\b|\b(?:or|and)\s+['"\d]+\s*=\s*['"\d]+|\binformation_schema\b|\bsleep\s*\(|\bbenchmark\s*\()/i, advice: '核查参数与数据库访问记录，使用参数化查询。' },
  { id: 'xss', name: '疑似跨站脚本', severity: 'high', pattern: /(?:<\s*script\b|javascript\s*:|\bonerror\s*=|<\s*img\b[^>]*\bonload\s*=)/i, advice: '检查输入校验与输出转义，并复核相关页面。' },
  { id: 'path_traversal', name: '路径穿越尝试', severity: 'high', pattern: /(?:\.\.\/|\.\.\\|\/etc\/passwd|\\windows\\win\.ini)/i, advice: '检查文件访问接口的路径规范化及授权控制。' },
  { id: 'sensitive_path', name: '敏感路径探测', severity: 'medium', pattern: /(?:^|\/)(?:\.env|\.git|wp-admin|phpmyadmin|admin|actuator|server-status)(?:[/?#.]|$)/i, advice: '确认敏感路径未公开，并检查来源 IP 的其他请求。' },
];
const SCANNER_RULE = { id: 'scanner', name: '自动化扫描工具', severity: 'medium', advice: '核查扫描来源及授权情况，必要时限制访问。' };

function matchingRequestRules(row) {
  const matches = REQUEST_RULES.filter(rule => rule.pattern.test(decodePath(row.path)));
  if (/(?:sqlmap|nikto|nmap|masscan|gobuster|dirbuster)/i.test(row.agent)) {
    matches.push({ ...SCANNER_RULE, evidence: `User-Agent: ${row.agent.slice(0, 120)}` });
  }
  return matches;
}

module.exports = { matchingRequestRules, REQUEST_RULES };
