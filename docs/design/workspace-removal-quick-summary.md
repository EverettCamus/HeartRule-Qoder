# 磁盘依赖移除重构 - 快速总结

## 任务分析

### 用户提出的两个需求

```
1. DatabaseTemplateProvider 完全替代磁盘读取
2. 清理 workspace 依赖（PROJECTS_WORKSPACE 等）
```

### 我们的决策：分为两个 Story

| 需求   | 对应 Story                       | 所在 Sprint | 优先级 | 工作量 |
| ------ | -------------------------------- | ----------- | ------ | ------ |
| 需求 1 | **Story 0.4** (已存在，现已优化) | Sprint 0    | P0     | 8 SP   |
| 需求 2 | **Story 0.5** (新增)             | Sprint 0    | P0     | 8 SP   |

---

## 关键对比

### Story 0.4 (DatabaseTemplateProvider 数据库优先)

**现状**：DatabaseTemplateProvider 已实现，TemplateResolver 支持两种模式  
**工作**：完成数据库模式的充分验证和生产就位  
**验收**：数据库加载模板可用，兼容旧模式

**具体内容**（productbacklog.md 第 90-109 行）：

- ✅ 提示词模板系统默认使用数据库
- ✅ SessionManager 为 ScriptExecutor 注入 projectId + TemplateProvider
- ✅ workspace 从"唯一真相来源"变为"运行时临时文件"
- ✅ 旧工程保留兼容模式

---

### Story 0.5 (移除磁盘同步与初始化) - **新增重构**

**目的**：当 Story 0.4 完成后，彻底清理磁盘依赖  
**工作**：删除临时方案和磁盘初始化逻辑  
**验收**：系统可在无 workspace 目录下完全运行

**具体内容**（productbacklog.md 新增第 111-159 行）：

1. **删除 SessionManager.syncTemplatesToDisk()**
   - 当前临时方案，将数据库模板同步到磁盘
   - Story 0.4 就位后不再需要

2. **重构 ProjectInitializer**
   - ❌ 不再创建 `_system/config/default` 等物理目录
   - ❌ 不再复制系统模板到工程目录
   - ✅ 改为纯数据库操作：记录工程元数据、复制数据库模板文件

3. **移除 PROJECTS_WORKSPACE 依赖**
   - 移除环境变量使用
   - 更新基础代码
   - import-disk-templates-to-db.ts 标注为"遗留迁移工具"

4. **调整工程创建 API 流程**
   - 新流程：insert project → import templates to DB → 完成
   - 无需 workspace 目录

---

## 为什么分两个 Story？

### 原因 1：关注点分离

- Story 0.4：引入新能力（数据库加载）
- Story 0.5：移除旧依赖（磁盘同步）

### 原因 2：可控风险

- 若 Story 0.4 发现问题，可快速修复
- Story 0.5 是 0.4 的"信心检查"

### 原因 3：MVP 稳定性

- 0.4 完成后可独立验证数据库模式
- 0.5 执行时无需担心"新旧混用"问题

---

## 对 MVP 的影响

### ✅ 正面影响

**问题解决**：

```
问题：当前混合架构（磁盘+数据库）
→ 多会话隔离不清晰
→ 部署复杂（需要 workspace 初始化）
→ AI 链路不稳定（syncTemplatesToDisk 可能失败）
→ 可复现性问题

解决：完全数据库架构
→ 单一真相来源
→ 部署简化（无需 workspace）
→ AI 链路稳定（DB 操作有保障）
→ 可复现（所有资源可备份恢复）
```

**后续收益**：

- Sprint 1-2：Action/Topic 层无需关心文件系统兼容性
- Sprint 3-4：Phase/Session 版本快照机制可靠
- 测试环境：本地/CI/生产流程统一

### ❌ 风险（若跳过 Story 0.5）

```
现象：Action/Topic 开发中，模板加载偶发失败

根因：
  - syncTemplatesToDisk 在并发时失败
  - 磁盘权限/满盘问题
  - 版本切换时新旧模板混搭

结果：需要回溯 Sprint 0 修复 → 项目延期 1-2 周
```

---

## 技术亮点

### 为什么这个设计聪明？

1. **现有基础充分**
   - DatabaseTemplateProvider 已完成 ✅
   - TemplateResolver 支持两种模式 ✅
   - 仅需"清理"而非"重构"

2. **渐进式迁移**
   - Story 0.4：打通数据库路径
   - Story 0.5：关闭磁盘回退
   - 留出验证时间，降低风险

3. **代码量可控**
   - Story 0.4：8 SP（主要是验证）
   - Story 0.5：8 SP（删除代码 + 调整初始化流程）
   - 总计 16 SP，在 Sprint 0 预算内

---

## 实施时间表

### Sprint 0 (2-3 周)

| 周   | 任务                               | 交付                  |
| ---- | ---------------------------------- | --------------------- |
| 周 1 | Story 0.1-0.3 + Story 0.2 (简化版) | 基础架构              |
| 周 2 | Story 0.4 充分验证                 | 数据库模板完全就位    |
| 周 3 | Story 0.5 清理磁盘依赖             | 系统无 workspace 依赖 |

### 关键检查点

- [ ] Story 0.4 完成且 E2E 验证通过
- [ ] 所有测试在无 workspace 环境下运行
- [ ] 文档更新（移除 PROJECTS_WORKSPACE 说明）
- [ ] 准备 Sprint 1（Action 层开发不依赖磁盘）

---

## 查看详细分析

→ 完整文档：`docs/design/workspace-removal-refactor-analysis.md`  
→ Product Backlog：`docs/product/productbacklog.md` (第 1075-1100 行)

---

**结论**：两个重构任务已妥善整合，Story 0.5 新增到 Sprint 0，确保 MVP 的"数据库脚本工程"架构完整性。✅
