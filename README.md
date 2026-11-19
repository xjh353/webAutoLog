# Web 日志异常与审计程序

> 一个在本机运行的离线日志审计工具：导入 Web 访问日志，规范化事件、隔离坏行、检测候选异常，把每条告警关联回原始事件，再由人分诊、确认或排除并留下理由与状态变化。对应《AI 原生软件工程实践》P2：Web 日志异常、行为分析与审计。

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
![零运行依赖](https://img.shields.io/badge/依赖-零第三方-4c1)
![范围](https://img.shields.io/badge/运行-本机离线-blue)
![测试](https://img.shields.io/badge/测试-15%2F15%20通过-brightgreen)

## 能做什么

- **多格式导入**：JSONL、Nginx/Apache Common 与 Combined；时间统一 UTC，坏行与重复 ID 显式隔离而非静默丢弃。
- **可回查的证据链**：告警带 `eventIds`、规则版本与分组依据，能从一条告警回溯到原始日志行。
- **规则检测**：5 类单条请求规则 + 4 类滚动 60 秒窗口规则，覆盖注入特征、路径探测、登录失败与异常状态码。
- **人工处置闭环**：`NEW → TRIAGED → CONFIRMED/DISMISSED → CLOSED`，每步记录操作人、理由与前后状态。
- **可重复评价**：固定合成会话 + 双版本实验（P2-R1 默认 / P2-R2 获批压测候选），会话级 TP/FP/FN/TN 与逐次记录。
- **本机安全**：仅监听 `127.0.0.1`，不发送日志到外部；导出覆盖完整告警，CSV 做公式注入防护。

## 快速开始

需要 Node.js 18 或更新版本，**无需安装第三方依赖**。

```powershell
git clone https://github.com/xjh353/webAutoLog.git
cd webAutoLog
npm start
```

浏览器打开 <http://127.0.0.1:3000>，点击「加载示例日志」体验完整流程；也可拖放或选择自己的 `.log`、`.txt`、`.jsonl` 文件。默认只监听本机；换端口可设 `PORT` 环境变量。

## 用法

**页面**：导入日志 → 查看总览统计与状态码分布 → 在告警列表按级别、IP、规则或路径筛选 → 点开证据回查原始事件 → 分诊/确认/排除 → 查看历史报告并导出 JSON 或 CSV。

**命令行**：

```powershell
npm test              # 15 个测试：解析、去重、时间窗口、证据关联、实验约定
npm run eval          # 回放合成数据，输出会话级评价与混淆矩阵
npm run experiment    # 双版各 3 轮，产物写入本机 data/experiments/（不入库）
```

## 输入格式

每行一条 JSONL：

```json
{"event_id":"req-001","event_time":"2026-11-04T02:05:00Z","service":"web","route":"/login","status":401,"latency_ms":18,"session_id":"s-01"}
```

也兼容 Nginx/Apache Common 与 Combined 日志：

```text
203.0.113.10 - - [04/Nov/2026:10:05:00 +0800] "GET /login HTTP/1.1" 401 1532 "-" "Mozilla/5.0"
```

`request_id` 可代替 `event_id`；缺事件 ID 时按数据集哈希和行号生成，缺会话 ID 时窗口聚合按来源 IP 分组并在告警中标注。无效时间、坏行、重复 ID 进入报告 `rejected` 列表并保留原文。单次请求体上限 10 MB、最多 100,000 行。完整字段契约见[项目设计](docs/project.md)。

## 检测规则

- **单条请求**：疑似 SQL 注入、XSS、路径穿越、敏感路径探测、扫描器特征。
- **滚动 60 秒窗口**：同组内登录失败 ≥5 次、4xx ≥8 次、5xx ≥5 次或总请求 ≥30 次产生候选告警。
- **证据与版本**：报告保存数据集 ID、运行 ID、规则版本、规范化事件与原始行；旧报告不随规则代码更新而改写。

阈值是课程演示值，未按真实业务基线校准。详见[规则卡](docs/rules.md)与[接口说明](docs/api.md)。

## 项目结构

```text
src/analysis/     日志解析、规则检测、统计与证据关联
src/server/       本地 HTTP 接口、报告存储、人工处置
public/           页面与交互
tests/            回归测试（15 项）
scripts/          合成数据的会话级评价脚本
fixtures/         固定合成情境、外部批准清单和实验约定
docs/             契约、评价、讲解、实验与交付材料
evidence/         已固化的一次真实运行逐次记录、执行状态与成本表
data/             运行时生成的本地报告（不纳入 Git）
```

## 验证结果

`npm test` **15/15 通过**，`npm run eval` 与 `npm run experiment` 正常。一次真实运行（8 个合成会话／94 条记录，测试分区）的结果：

| 版本 | TP | FP | FN | TN | Precision | Recall | FPR | 待复核 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P2-R1 固定规则（默认） | 2 | 1 | 0 | 1 | 66.7% | 100% | 50% | 3 |
| P2-R2 获批压测候选 | 2 | 0 | 0 | 2 | 100% | 100% | 0% | 2 |

**当前决定**：保留 P2-R1 为网页默认，P2-R2 列为"值得用独立真实样本继续验证"；不宣称候选更快或真实业务准确率提升。逐次耗时、证据链、成本与边界见[运行证据](evidence/README.md)、[评价记录](docs/evaluation.md)与[选择说明](docs/decision.md)。

## 文档导航

**找材料请先去 [材料索引](docs/材料索引.md)**——按用途分组，逐项给出入口、内容摘要和当前状态。几个常用直达：

- 演示：[启动与演示指南](docs/启动与演示指南.md) · [工具讲解稿](docs/项目结构与数据流程讲解稿.md) · [实验讲解稿](docs/工程实验讲解稿.md)
- 实验：[工程实验与交接](docs/experiment.md) · [数据集与训练说明](docs/数据集与训练说明.md) · [四项量规自评](docs/课程要求对照.md)
- 复现：[结对复核模板](docs/peer-review.md)（填写栏由伙伴本人完成，不代填代签）

## 边界与数据

单机离线、教学规模；**不提供**账号认证、加密存储、实时采集、自动封禁或生产级并发。操作人是填写值，不能证明真实身份；IP 不代表个人，告警是待复核线索而非自动定罪。报告仅保存在本机 `data/`，不向外部发送日志；真实日志与导出文件含敏感路径或会话标识，分享前按团队要求处理。数据源与训练边界见[数据集与训练说明](docs/数据集与训练说明.md)，目标与责任见 [Global](docs/Global.md)，开发约定见 [Harness](AGENTS.md)。
