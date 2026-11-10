# 本地接口与报告格式

服务由 `npm start` 启动，默认监听 `http://127.0.0.1:3000`。接口只供本机页面与离线复核使用，当前没有账号认证。以下示例中的 ID 均为示意值。

## 导入与分析

`POST /api/analyze`，请求体为 JSON：

```json
{"filename":"access.jsonl","text":"{\"event_id\":\"e-1\",\"event_time\":\"2026-11-04T02:00:00Z\",\"route\":\"/home\",\"status\":200}"}
```

成功时返回完整报告，包含 `id`（本次运行 ID）、`datasetId`（输入内容哈希的短值）、`ruleVersion`、`summary`、`events`、`rejected`、`alerts` 和 `suppressed`。默认网页使用 P2-R1。分析失败或没有有效日志时返回错误对象 `{ "error": "原因" }`；请求体上限为 10 MB，单份日志最多 100,000 行。

`GET /api/demo` 返回示例文件名和日志文本，可直接作为分析接口的输入。

## 历史报告

`GET /api/history` 返回最近 20 份报告的摘要，包含报告 ID、文件名、分析时间和统计值。`GET /api/history/{reportId}` 返回一份完整报告。报告保存在本机 `data/{reportId}.json`；不存在的 ID 返回 404。

一个有效事件保留 `eventId`、规范化的 UTC 时间、请求字段、原始行号和 `raw` 文本。`sourceField` 标明来源地址来自哪个日志字段；只有转发头而没有直接来源地址时记为 `missing`，也不会用该头做窗口分组。一个隔离项保留 `line`、`reason` 与 `raw`。告警的 `eventIds` 指向同一报告 `events` 中的事件，`ruleVersion` 固定为告警产生时的规则版本。原始字段是非可信输入，复核时应作为数据展示。

## 人工处置

`POST /api/history/{reportId}/alerts/{alertId}/review` 的请求体示例：

```json
{"status":"TRIAGED","actor":"复核员A","reason":"已核对触发事件，等待业务确认"}
```

允许的状态路径为 `NEW → TRIAGED → CONFIRMED/DISMISSED → CLOSED`。每次请求必须提供非空操作人和理由。成功时返回更新后的完整报告；状态转换不合法或字段缺失时返回 400。`reviews` 数组按顺序保存每次操作的 `from`、`to`、`actor`、`reason` 和 `at`。操作人只是输入文本，当前系统无法验证其真实身份。

## 复核建议

用报告 ID 找到完整报告后，先检查 `summary.invalidCount` 与 `rejected`，再根据某条告警的 `eventIds` 回查 `events`。最后核对告警的 `ruleVersion`、证据摘要及 `reviews`。不要仅凭路径字符串、IP 或告警数量推断个人身份或实际攻击结果。
