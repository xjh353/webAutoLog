# 仓库内运行证据

> **这份文档回答**：一次真实运行的原始结果放在哪、逐次与汇总数据是什么、证据链怎么抽查、如何复现——回答「这行实际结果在哪里」。

本目录回答课件「这行实际结果在哪里」，以及结对交接里的「原始结果位置」。

`AGENTS.md` 第 4、23 条规定 `data/` 不纳入 Git、复核者须自行运行并保存证据。这条约定带来的问题是：项目组在 `docs/experiment.md` 写着「已运行一次」，但伙伴 clone 仓库后找不到那次结果。本目录把**一次真实运行的逐次记录**固化进仓库，同时不破坏该约定。

## 执行状态

| 项 | 值 |
| --- | --- |
| 执行状态 | **本人运行** |
| 不是 | 读取已有结果 / 仅计划·教学示意 / 伙伴复现结果 |
| 运行时间 | 2026-11-12 19:51:07 UTC+8（`result.json` 的 `createdAt` 为 `2026-11-12T11:51:07.201Z`） |
| Git 提交号 | `91ecf2b58facc35b4cc57d7b1f26852ba721d94e`（分支 `main`，运行时工作区干净） |
| 环境 | Node.js v22.22.2 / win32 / x64 |
| 命令 | `npm test`、`npm run eval`、`npm run experiment`，三条退出码均为 0 |
| 运行号 | `1794484267202-57b7e25e-406a-459d-b251-7fce5058dfd8` |

命令由项目组会话在本机终端实际执行，AI 助手负责调用终端与整理材料；`result.json` 是那次运行生成的原始文件，不是新跑一次得到的，也不是复制旧输出伪装成新结果。

## 目录内容

```text
evidence/
  README.md                    本说明
  cost.md                      结构化成本记录
  run-2026-11-12/
    result.json                逐次运行记录（原样复制，未改动任何数值）
    manifest.json              事后补记：提交号、执行状态、命令、环境、哈希清单
```

`result.json` 的 sha256 为 `90b3a9aa8e02386b7461219399e3a5888b055d16fa8f861804bf9e4bb572786f`，可用 `sha256sum evidence/run-2026-11-12/result.json` 核对。补记信息与原始记录分开放置，避免把人工追记混进运行结果。

### 为什么没有把另外三个文件放进仓库

一次 `npm run experiment` 会产生四个文件。`AGENTS.md` 明确不把 `data/` 中的**运行报告**提交进仓库，因此这里只固化逐次运行记录；其余三个留在运行者本机，并在 `manifest.json` 中登记哈希与保留原因：

| 文件 | sha256 | 保留原因 |
| --- | --- | --- |
| `input.jsonl` | `4e48dbecaf992777…` | 合成输入，可由仓库内 `fixtures/experiment-cases.json` 经同一入口确定性重生成 |
| `baseline.json` | `6232acd0f1605802…` | P2-R1 完整报告，属 `data/` 运行报告，不入库 |
| `candidate.json` | `5175f1d600a3334a…` | P2-R2 完整报告，同上 |

伙伴可用下方命令在自己的 `data/` 里重生成，并用 `manifest.json` 里的完整哈希核对是否得到同一份输入与报告。**这三份文件不入库不是删证据**，而是遵守项目自己先写下的约定。

### 约定文件在本次运行之后补过字段

`fixtures/experiment-plan.json` 于 2026-11-14 按课件补齐了五个文档性字段（`stoppingRule`、`failurePolicy`、`executionStatus`、`rulerFreeze`、`completionStandard`），sha256 由 `dc3b9292…` 变为 `3cbf0fcf…`。**`result.json` 内嵌的是运行当时的约定快照与旧哈希**，这是历史事实，保持原样不动；因此用当前文件去算哈希会与 `result.json` 不一致，这不代表结果被改过。

`manifest.json` 的 `planRevisionAfterRun` 记录了新旧哈希与 `appliesToThisRun: false`：九个影响结果的字段（问题、两版定义、共同条件、主指标、质量门槛、轮次、计时边界、判断规则）逐字段核对未改动，新增字段不追溯适用于本次结果。旧版约定可从提交 `91ecf2b` 检出。本次没有重跑、没有改写任何结果，也没有更换尺子。

## 逐次结果：预先约定的 3 轮 × 2 版全部摆出

表格数值来自 `result.json` 的 `runs[]`，展示时保留 4 位小数，完整精度以原始文件为准。

| 轮次 | 版本 | 策略 | 状态 | `elapsedMs` | 有效行 | 告警数 | 抑制数 |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: |
| 1 | P2-R1 | baseline | completed | 13.4951 | 94 | 6 | 0 |
| 1 | P2-R2 | approved-load | completed | 0.9123 | 94 | 4 | 2 |
| 2 | P2-R1 | baseline | completed | 1.1590 | 94 | 6 | 0 |
| 2 | P2-R2 | approved-load | completed | 0.6807 | 94 | 4 | 2 |
| 3 | P2-R1 | baseline | completed | **0.6583** | 94 | 6 | 0 |
| 3 | P2-R2 | approved-load | completed | **0.6687** | 94 | 4 | 2 |

六轮全部 `completed`，`validRows` 均为 94、`rejectedRows` 均为 0，失败 0 次、重跑 0 次（这里只覆盖 `analyze()` 内部，命令级失败未单独记录）。**没有删去任何一轮，也没有只挑最快的一次**：第 1 轮 P2-R1 的 13.4951 ms 明显含运行时预热，而第 3 轮 P2-R1 反而比 P2-R2 快 0.0104 ms。因此本记录不据此宣称候选更快，甚至不把「速度」列为结论。

计时边界见 `fixtures/experiment-plan.json`：仅 `analyze()` 的同步处理时间，不含生成输入、读写结果或人工复核。

## 指标汇总（测试分区，统计单位为完整会话）

| 版本 | TP | FP | FN | TN | Precision | Recall | FPR | 待复核会话 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P2-R1 固定规则 | 2 | 1 | 0 | 1 | 66.7% | 100% | 50% | 3 |
| P2-R2 外部批准清单 | 2 | 0 | 0 | 2 | 100% | 100% | 0% | 2 |

质量门槛（目标异常无漏报、告警 `event_id` 可回查）在本构造数据上通过，FP 由 1 降为 0。按事先写好的 `decisionRule`，结论只是「候选值得用独立真实样本继续验证」，不是部署决定；默认网页仍使用 P2-R1。详细口径见 `docs/evaluation.md`。

## 证据链抽查：`test-load` 会话

以下值在本次运行时从本机文件实际读出，用于说明「一个数字怎样追到原始行」：

1. `result.json` → `scored.baseline.test.rows` 中 `test-load` 为 `predicted: anomaly`、`alertRules: ["request_burst"]`；`scored["approved-load"].test.rows` 中为 `predicted: normal`、规则数组为空。
2. `baseline.json` → `alerts` 中 `ruleId: "request_burst"` 的告警 `id` 为 `3683d98d-b1c8-41e1-85c5-9ef83517d680`，`eventIds` 为 `test-load-0` … `test-load-29` 共 30 个，`groupBy: session_id`，`evidence: "60 秒内 30 次相关请求"`，`ruleVersion: P2-R1`。
3. `input.jsonl` → 按 `event_id` 可找到对应的 30 条原始行，时间从 `2026-11-04T02:14:00.000Z` 到 `02:14:29.000Z`，`route: /api/items`，`status: 200`。
4. `fixtures/approved-load.json`（仓库内，sha256 `8997c90e454fd559…`）→ 该会话在外部批准清单内；清单不由日志内容推断。
5. `candidate.json` → `suppressed` 中同一 `ruleId` 与 `sessionId: "test-load"`，`reason: "外部清单标明该会话为已批准压测"`，`eventIds` 与上面 30 个一致；`alertCount` 由 6 降为 4，`suppressedCount` 为 2。
6. 其他规则未变：`test-login`（`login_failure`）与 `test-scan`（`error_burst`）在两版中均判为异常。

第 2、3、5 步的文件未入库，需先按下面的命令重生成再核对；`manifest.json` 中的哈希可用于确认重生成结果是否与本次一致。

## 校验与复现

```bash
sha256sum evidence/run-2026-11-12/result.json
npm test              # 当前 15 个测试全部通过（2026-11-12 那次运行为 14 项）
npm run eval          # 终端输出与 docs/evaluation.md 一致
npm run experiment    # 在 data/experiments/<新运行号>/ 生成四个文件
```

`npm run experiment` 每次创建新目录，不覆盖旧记录。伙伴的新结果必须保存在伙伴自己的新目录；本目录只用于核对项目组这次运行，**不能代替伙伴实际执行**。

## 边界

- 输入是 8 个教学构造会话的合成数据，不含真实访问日志；指标不代表真实流量准确率或泛化能力。
- 成本与人工投入见 [`cost.md`](cost.md)，多项为「未知」，不以零代替。
- 伙伴独立复现、差异处理与人工签署仍待执行，见 `docs/peer-review.md`；本目录不替伙伴填写任何结论。
- 本轮的条件／结果／决定／边界与重新比较的触发条件见 [`docs/decision.md`](../docs/decision.md)。
- 若后续改动规则、输入或约定，应新建证据目录并重跑，不要改写 `run-2026-11-12/` 里的任何数值。
