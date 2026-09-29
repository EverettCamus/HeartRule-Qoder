# scripts/

开发期的一次性脚本、运维动作与样例数据。**不是产品代码**——不属于任何 `packages/`，不参与构建，也不在根 `typecheck` 的强制范围内。

## 目录

| 路径            | 放什么                                                                   |
| --------------- | ------------------------------------------------------------------------ |
| `archive/`      | **退场层**——完成使命的脚本（见下方规则）                                 |
| `db/`           | 数据导入脚本与配套 SQL                                                   |
| `init-db/`      | 数据库初始化（扩展等），按编号顺序执行                                   |
| `sessions/`     | 样例会话 YAML（含各故事的验证用例）                                      |
| `techniques/`   | 咨询技法 YAML 样例                                                       |
| `verify-*.ts`   | 当前在用的验证脚本（如 `verify-hindsight.ts`、`verify-mental-model.ts`） |
| `start-dev.ps1` | Windows 启动脚本                                                         |

## 退场规则

**脚本完成使命后搬进 `archive/`，不要留在顶层。** `archive/` 是只进不出的历史层：里面的东西不再维护、不再运行，保留只为回答"当时是怎么做的"。

什么时候搬：

- **一次性排查/验证脚本用完就搬**——`check-*.ts`、`analyze-*.ts`、`compare-*.ts` 这类，问题查清了、结论落进文档或代码了，就搬走。`archive/` 里 76 个文件绝大多数是这一类。
- **被取代的验证脚本**——新版本落地后，旧版搬走（别两个都留在顶层）。
- **设计期的种子数据**——对应机制尚未落地，但格式仍有参考价值时。例：`archive/{contradiction-detection,emotion-detection}.yaml`（意识层的早期配置格式实验，2026-07-09 自述存档，2026-09-29 从 `scripts/consciousness/` 搬入）；格式规范已整合进 [`docs/design/consciousness/consciousness-system.md`](../docs/design/consciousness/consciousness-system.md) §4。

**不搬的情况**：还在被 README、文档或 CI 引用的脚本。搬之前先 `grep` 一下有没有引用点。

---

> 本规则由 2026-09-29 的编目处置补上（[mess-disposition](../docs/audit/mess-disposition.md) D-10）：退场动作在这个目录里发生过很多次，但规则一直没写下来，下一个人不知道该往哪放。
