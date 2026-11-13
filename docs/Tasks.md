# Tasks：任务分解与证据

任务状态只表示仓库内已完成的工作或明确的外部待办。每个任务有验收方式；新增任务沿用 `T-编号`，写清依赖、负责人、状态、证据与失败记录。未指定的外部负责人保持“待确定”，不虚构分工。

| ID | 任务与依赖 | 验收方式与证据 | 状态 |
| --- | --- | --- | --- |
| T-01 | 需求、输入与规则契约 | [README](../README.md)、[项目设计](project.md)、[规则卡](rules.md)、[接口](api.md) | 已完成 |
| T-02 | 日志解析、UTC 规范化、坏行和重复 ID 隔离；依赖 T-01 | `src/analysis/parser.js`、`normalizer.js`；`tests/analyzer.test.js` | 已完成 |
| T-03 | 请求/窗口检测和证据关联；依赖 T-02 | `src/analysis/rules/`、`analyzer.js`、`report-builder.js`；测试覆盖跨分钟窗口与事件 ID | 已完成 |
| T-04 | 本机接口、页面、报告保存与人工处置；依赖 T-03 | `src/server/server.js`、`public/`、`tests/server.test.js` | 已完成 |
| T-05 | 固定合成数据与双版本实验；依赖 T-03 | `fixtures/`、`scripts/eval.js`、[实验约定](experiment.md)、[评价记录](evaluation.md)、[固化运行证据](../evidence/README.md)、[成本记录](../evidence/cost.md)与[选择说明](decision.md)；运行 `npm run eval` | 已完成合成样本验证 |
| T-06 | 项目级 Harness、ADR 与阶段计划；依赖 T-01 至 T-05 | 根目录 `AGENTS.md`、[ADR-0001](adr/0001-offline-audit-architecture.md)、[ADR-0002](adr/0002-approved-load-experiment.md)、[Global](Global.md)、[Plan](Plan.md) | 已完成文档整理 |
| T-07 | 伙伴独立复现与对抗；依赖 T-05、T-06 | 伙伴按[交接说明](experiment.md)运行并填写[复核模板](peer-review.md)，保留自己的结果目录和签署 | 待伙伴执行，负责人待确定 |
| T-08 | 真实业务校准与治理；依赖授权样本和业务方 | 独立会话标签、阈值与批准清单责任、权限/存储评估、人工结论 | 未启动，负责人待确定 |

## 本机核对命令

在仓库根目录运行 `npm test`、`npm run eval`。需要完整输入、报告和逐次结果时运行 `npm run experiment`，其产物写入忽略的 `data/experiments/`。记录所用 Git 提交号、Node 版本、命令结果和运行日期。评价结论仅限于当前合成数据；具体分母与局限见[评价记录](evaluation.md)。

2026-11-12 已在本机核对一次运行入口：提交 `91ecf2b`、Node v22.22.2 / win32 / x64，`npm test` 14 项全部通过，`npm run eval` 与 `npm run experiment` 退出码均为 0。提交号、命令结果、运行日期与执行状态固定在[运行证据的 manifest](../evidence/run-2026-11-12/manifest.json)，六条逐次结果见 [result.json](../evidence/run-2026-11-12/result.json)。这份记录只说明本机构造数据上的入口可用，不代表伙伴复现、人工签署或真实业务校准。
