# Documentation Archive

## Overview

This directory contains archived documentation from the old `docs/` directory structure, plus documents retired from the current structure. These documents are preserved for historical reference but are no longer actively maintained or considered authoritative.

## Archive Structure

```
docs-archive/
├── product/          # Archived product specifications
├── domain/           # Archived DDD designs
├── architecture/     # Archived architecture documents
├── research/         # Archived research papers
├── misc/             # Miscellaneous archived documents
├── bugfix/           # Bug fix records
├── test/             # Test reports
└── temp/             # Temporary documents
```

## Usage Guidelines

### When to Use Archived Documents

1. **Historical Context**: Understanding past design decisions or implementation approaches
2. **Reference**: Checking previous bug fixes or test results
3. **Research**: Reviewing historical research or analysis

### When NOT to Use Archived Documents

1. **Current Development**: 设计权威在 [`docs/design/`](../docs/design/README.md)（含 [`decisions/`](../docs/design/decisions/) ADR 注册表）——原 OpenSpec 方案已废弃，`openspec/` 目录不复存在
2. **Authoritative Reference**: `docs/design/` 是唯一设计真相源
3. **New Implementations**: 先查 `docs/design/` 现行文档与 ADR；本目录仅作历史参考。个别文档经人确认后复活至 `docs/design/`（复活文档带「演进注记」说明与现行设计的差异），档案副本保留作历史

### Metadata Fields

Each archived document carries a YAML frontmatter block:

- `document_id`: Unique identifier for the document
- `authority`: Always "historical" for archived documents
- `status`: Always "archived"
- `archived_date`: Date when document was archived
- `source`: Original source directory (e.g., "docs")
- `path`: Original path relative to docs/
- `tags`: Always includes "historical", "reference", "archived", plus the section name
- `search_priority`: "medium"

**2026-09-29 起不再写正文归档块。** 早期归档会在 frontmatter 之后再插一段 `# ⚠️ ARCHIVED DOCUMENT` 说明；它与 frontmatter 的信息重复，且引导读者去看 `openspec/`——那个目录早已删除。

清掉的残留，按 **2026-09-29 清理前 HEAD 上的实测口径**（当时全档 **84 篇**）：

| 残留形态                             | 篇数 | 处置                                                                          |
| ------------------------------------ | ---- | ----------------------------------------------------------------------------- |
| `# ⚠️ ARCHIVED DOCUMENT` 说明块      | 80   | 删块 + 删块后第二层老 frontmatter                                             |
| ↳ 其中**同时**带第二层老 frontmatter | 43   | 同上（其余 37 篇只有块，例：`architecture/memory-retrieval-types.md`）        |
| 第二层老 frontmatter（**无块者**）   | 1    | 删（`misc/legacy-script-definition-requirements.md`，带 `previous_location`） |
| HTML 注释形态（`<!-- ARCHIVED:`）    | 1    | 删（与说明块同类，同样指向已删 `openspec/`；该篇**同时**有说明块，故不另计）  |

**三类并非互斥，不能相加。** 84 篇的准确拆法是：**80 篇有说明块**（其中 43 篇块后还带第二层老 frontmatter，37 篇只带块）+ **4 篇本来就没有说明块**（其中 1 篇带第二层老 frontmatter，3 篇两者皆无——即 `research/` 那 3 篇）。

**84 → 86 的账**：清理前 84 篇 **+** 2026-09-29 新收 4 篇 **−** 同批去重删掉 2 篇 = **86 篇**。

> **「第二层老 frontmatter」这一档怎么数才不会错**（本 README 一度把 43 写成 79，教训记在这）：
> 它有两种形态——**10 字段旧 fm**，和**三键块**（`archived_date` + `archived_to` + `status`，少数 `architecture/` 篇用它）。因此：
> 按 `version:` 键判会**漏**（三键块没有这个键）；按「说明块之后还出现过 `---`」判会**几乎全中**——正文里的 `---` 分隔线到处都是，79 就是这么来的。
> 上表按**逐篇行级 diff 实际删掉的内容**数：删到 **≥3 条 `---`** = 说明块 + 第二层（43 篇）；**只删到 1 条** = 只有块（37 篇）。加不加 `-w` 读数一致。

**已废弃字段**：`migrated_to`（原 OpenSpec 迁移方案遗留；字段值要么为空、要么指向不存在的路径）、`ai_retrieval_hint`（内容统一是"请优先参考 OpenSpec 文档"，指向已删目录）。**另**：老 frontmatter 里的 `previous_location` / `archived_to` 同属这一类，已一并归并。全部字段已于 2026-09-29 移除，**全档 86 篇统一为上方 8 字段**。

**2026-09-29 新收 4 篇**（原先散在包根或仓库根、不属任何索引）：

| 文档                                              | 为什么收进来                                              |
| ------------------------------------------------- | --------------------------------------------------------- |
| `misc/SCRIPT_EXECUTOR_PHASE5_REFACTORING_PLAN.md` | 自述"已归档"却留在包根（MESS-A-05）                       |
| `misc/DDD_HEXAGONAL_REFACTORING_PLAN.md`          | 与 `superpowers/plans/` 那份并行的旧方案（MESS-B-07）     |
| `misc/DEPRECATED_CODE_CLEANUP_PLAN.md`            | 计划本身过期、未决项失去对象（MESS-D-03）                 |
| `misc/template-system-usage-guide.md`             | 原 `_system/README.md`；该目录除它外空无一物（MESS-A-06） |

前 3 篇的 `source` 是 `packages/core-engine`，第 4 篇是 `_system`（非 `docs`）；`path` 均记搬迁前的原路径。收进来时加了一段「归档说明」横幅，标明哪些内容已失效——**归档件仍会被读到，所以失效点直接写在文件里**，不靠读者另找。

同批删除：`research/SSAG介绍.md`、`research/VRM-Verbal-Response-Modes-Translation.md`（`misc/` 已有逐字节相同的另一份）。

> **正文里出现 `openspec` 是正常的**（如 `misc/2026-03-11-document-restructure-design.md` 本身就在讲 OpenSpec 方案）——要清的是**元数据层**的死引用，不是正文内容。

### 已知重复（去重记录）

| 文档                                                                                | 处置                                                                    |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `SSAG介绍.md`、`VRM-…Translation.md`                                                | `research/` 的裸副本已删，留 `misc/` 带归档包装那份（剥壳后逐字节相同） |
| `misc/Heart Rule脚本定义需求.md` vs `misc/legacy-script-definition-requirements.md` | **同一文档两份（正文逐字节相同）**，尚未去重，待裁                      |

## Related Documents

- [设计文档状态索引](../docs/design/README.md) - 当前设计权威（含 ADR 注册表）
- [产品待办](../docs/scrum/backlog.md) - 故事关联列挂有本目录旧稿引用（历史参考用）

---

**Version**: 1.1.1  
**Created**: 2026-03-12  
**Last Updated**: 2026-09-29（清完三层归档残留、全档统一 8 字段；去重 2 组；订正子目录清单）
