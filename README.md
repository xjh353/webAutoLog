# Web 日志异常与审计程序

一个无需安装依赖的本地 Web 工作台。导入 Nginx/Apache Common 或 Combined 格式日志，也支持每行一条的 JSON 访问日志；程序会解析请求、标记异常、汇总来源 IP，并保存最近的分析记录。

## 启动

```powershell
npm start
```

打开 <http://127.0.0.1:3000>。首次打开可点击「加载示例日志」查看完整流程。运行 `npm test` 执行解析和检测测试。需要更换端口时设置 `PORT` 环境变量。

## 支持的日志

Combined/Common 示例：

```text
203.0.113.10 - - [04/Nov/2026:10:05:00 +0800] "GET /login HTTP/1.1" 200 1532 "-" "Mozilla/5.0"
```

JSON Lines 示例：

```json
{"time":"2026-11-04T10:05:00+08:00","remote_addr":"203.0.113.10","request":"GET /login HTTP/1.1","status":200,"body_bytes_sent":1532}
```

支持拖放或选择 `.log`、`.txt`、`.jsonl` 文件，最大 10 MB。所有规则在 `analyzer.js` 中，可按实际业务调整。

## 检测范围

- SQL 注入、XSS、路径穿越、敏感文件探测、扫描器 User-Agent
- 单 IP 的 4xx 激增、登录失败激增、5xx 激增、高频请求
- 每条告警包含级别、规则、来源 IP、证据和建议；可按条件筛选并导出 JSON/CSV

激增规则使用滚动 60 秒窗口：4xx 达 8 次、登录失败或 5xx 达 5 次、高频请求达 30 次时触发。同一来源在同一分钟内的同类激增只显示一条告警。页面每次显示 100 条告警，导出包含完整结果。

这是基于规则的辅助审计工具。告警需要结合业务上下文复核；导入内容和分析记录仅保存在本机 `data/`，不会发送到外部服务。

课程 P2 的输入契约、窗口与证据口径见 [项目设计](docs/project.md)；合成数据的逐会话评价与分母见 [评价记录](docs/evaluation.md)。[交付与恢复](docs/release.md) 和 [结对评价模板](docs/peer-review.md) 供课堂验收使用。运行 `npm run eval` 可重新计算评价结果。
