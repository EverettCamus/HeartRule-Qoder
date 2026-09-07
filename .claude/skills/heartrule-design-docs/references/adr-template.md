# ADR 模板（HeartRule 格式）

> 文件名：`docs/design/decisions/NNN-slug.md`（NNN = 现有最大编号 +1）。**无 frontmatter**。实测结构（参照 003/004）：

```markdown
# NNN — 标题（决策主题一句话）

## 背景

为什么需要这个决策：现状、错位、痛点。

## 决策

### 决策 1：<子决策名>

**结论**：……

**理由**：……

（多个子决策依次列出）

## 后果

正/负后果：哪些变简单了、哪些债务留下了、后续需要跟进什么。

## 关联

- 相关文档（相对链接）
- 相关 ADR（`NNN-slug`）
- 相关 backlog 故事 / 探索项
```

**流程**：AI 起草 → 人批准 → 落 `docs/design/decisions/` → 更新 `docs/design/README.md` 已记录决策列 → 更新架构约束清单（`architecture-constraints.md`，红线增删需人确认）。
