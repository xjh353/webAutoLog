# Web 日志异常与审计程序

一个在本机运行的离线日志分析工具。导入 Web 访问日志后，程序会规范化事件、隔离坏行、检测候选异常，并把告警关联到原始事件。使用者可以分诊、确认或排除告警，保留处置理由与状态变化。本项目对应《AI 原生软件工程实践》中的 P2：Web 日志异常、行为分析与审计。

## 快速开始

需要 Node.js 18 或更新版本，无需安装第三方依赖。

```powershell
git clone https://github.com/xjh353/webAutoLog.git
cd webAutoLog
npm start
```

打开 <http://127.0.0.1:3000>，点击「加载示例日志」体验导入、分析、查看证据和人工处置。也可以拖放或选择自己的 `.log`、`.txt`、`.jsonl` 文件。默认只监听本机；要更换端口，可设置 `PORT` 环境变量。

```powershell
npm test       # 解析、去重、时间窗口和证据关联测试
npm run eval   # 回放合成数据，输出逐会话评价与混淆矩阵
```

## 输入格式

推荐使用每行一条记录的 JSONL：

```json
{"event_id":"req-001","event_time":"2026-11-04T02:05:00Z","service":"web","route":"/login","status":401,"latency_ms":18,"session_id":"s-01"}
```

支持 `request_id` 代替 `event_id`，也兼容 Nginx/Apache Common、Combined 日志：

```text
203.0.113.10 - - [04/Nov/2026:10:05:00 +0800] "GET /login HTTP/1.1" 401 1532 "-" "Mozilla/5.0"
```

事件时间统一为 UTC。旧日志缺少事件 ID 时，程序根据数据集哈希和行号生成 ID；缺少会话 ID 时，聚合规则按来源 IP 分组。无效时间、坏行和重复事件 ID 会隔离在报告的 `rejected` 列表中，并保留原始行供复核。单次请求体上限为 10 MB，日志最多 100,000 行。

## 检测与审计

- 请求规则：疑似 SQL 注入、XSS、路径穿越、敏感路径探测和扫描器特征。
- 滚动 60 秒规则：同组内登录失败达 5 次、4xx 达 8 次、5xx 达 5 次或请求总数达 30 次时产生候选告警。
- 证据链：报告保存数据集 ID、运行 ID、规则版本、规范化事件与原始行；告警保存支持它的事件 ID。
- 人工处置：`NEW → TRIAGED → CONFIRMED/DISMISSED → CLOSED`，每步记录操作人、理由、时间和前后状态。告警可筛选，并导出完整 JSON 或 CSV。

阈值用于课程演示，尚未按真实业务流量校准。高频请求可能是获批压测；来源 IP 也不能直接代表个人。告警是待复核线索，不是自动定罪。当前本地版没有账号认证，填写的操作人标识需要结合团队流程核实。

## 项目结构

```text
analyzer.js       解析、规范化、规则检测、证据关联
server.js         本地 HTTP 接口、报告存储、人工处置
public/           页面与交互
eval.js           合成数据的会话级评价
analyzer.test.js  回归测试
docs/             契约、评价、交付和结对复核材料
data/             运行时生成的本地报告（不纳入 Git）
```

课程要求与具体口径见 [项目设计](docs/project.md)；评价分母和构造样本见 [评价记录](docs/evaluation.md)；部署恢复与版本边界见 [交付说明](docs/release.md)；结对互评可使用 [复核模板](docs/peer-review.md)。

报告仅保存在本机 `data/`，程序不向外部服务发送日志。真实日志和导出文件可能含敏感路径或会话标识，分享前应按团队要求处理。
