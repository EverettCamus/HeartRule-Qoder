# MVP实施状态

## 已完成

### ✅ 项目基础架构
- [x] 创建项目目录结构
- [x] 设置Python包结构（所有`__init__.py`）
- [x] 配置依赖文件（`requirements.txt`）
- [x] 创建README文档

### ✅ 核心领域模型（部分）
- [x] 异常定义体系（`src/core/exceptions/exceptions.py`）
- [x] Session会话实体（`src/core/domain/session.py`）
  - 会话状态管理
  - 执行位置追踪
  - 生命周期方法

## 下一步实施计划

### 1. 完成核心领域模型
需要实现：
- [ ] Message消息实体（`src/core/domain/message.py`）
- [ ] VariableState变量状态实体（`src/core/domain/variable.py`）
- [ ] Script脚本实体（`src/core/domain/script.py`）

### 2. 实现脚本执行引擎
- [ ] YAML脚本解析器
- [ ] Phase/Topic/Action执行器
- [ ] 执行栈管理

### 3. 实现基础Action类型
- [ ] Action基类
- [ ] ai_say（向用户传达信息）
- [ ] ai_ask（引导式提问收集信息）
- [ ] ai_think（内部认知加工）
- [ ] use_skill（调用技术脚本）

### 4. 实现LLM编排引擎
- [ ] LLM服务抽象层
- [ ] OpenAI集成
- [ ] 串行调用支持
- [ ] 超时重试机制

### 5. 实现变量提取引擎
- [ ] 文本类型变量提取
- [ ] 提取失败处理
- [ ] 变量作用域管理

### 6. 实现记忆引擎基础功能
- [ ] 短期记忆（滑动窗口）
- [ ] 对话历史管理
- [ ] 记忆API

### 7. 实现会话管理服务
- [ ] 会话创建
- [ ] 会话状态管理
- [ ] 会话恢复

### 8. 实现数据存储层
- [ ] SQLite适配器
- [ ] 消息持久化
- [ ] 变量状态持久化
- [ ] 会话元信息持久化

### 9. 实现简单聊天前端
- [ ] 基础对话界面
- [ ] WebSocket通信
- [ ] 消息展示

### 10. 实现脚本编辑器基础功能
- [ ] YAML编辑界面
- [ ] 语法高亮
- [ ] Schema校验

### 11. 实现调试功能
- [ ] 对话模拟
- [ ] 变量监控
- [ ] 执行日志查看

### 12. 创建示例脚本
- [ ] 示例会谈流程脚本
- [ ] 示例技术脚本
- [ ] 变量定义示例

### 13. 测试与文档
- [ ] 单元测试
- [ ] 集成测试
- [ ] API文档
- [ ] 脚本编写指南

## 技术栈确认

- **后端**: Python 3.10+, FastAPI
- **数据存储**: SQLite (MVP阶段)
- **LLM集成**: OpenAI API
- **YAML解析**: PyYAML
- **前端**: 简单HTML+JavaScript (MVP阶段)

## 预期时长

根据设计文档，MVP阶段预期时长为 **8-10周**

当前进度：**5%** (基础架构完成)
