# HeartRule AI咨询引擎

基于"LLM + YAML脚本"的智能咨询框架，首个应用场景为CBT心理咨询。

## 项目概述

AI咨询引擎采用混合架构，结合大语言模型的语言理解与生成能力，以及结构化脚本的流程控制能力，将专业咨询师的经验、技术、流程和数据沉淀为可执行、可维护的脚本化知识库。

## 核心特性

- **经验结构化沉淀**：通过YAML脚本将咨询师经验转化为可复用知识资产
- **灵活性与可控性平衡**：LLM提供自然语言交互，脚本保证流程专业性
- **领域知识可扩展**：支持不同咨询领域的专业化脚本定制
- **质量可追溯**：脚本化流程便于审计、优化和质量管理

## 系统架构

系统采用分层架构设计，从下至上分为五层：

- **基础设施层**：LLM服务集群、状态存储、脚本仓库、消息队列
- **脚本层**：会谈流程脚本、咨询技术脚本、意识脚本、全局变量脚本、表单脚本
- **引擎层**：脚本执行引擎、话题调度引擎、意识触发引擎、记忆引擎、变量提取引擎、LLM编排引擎
- **应用层**：会话管理服务、脚本调试服务、脚本编辑服务
- **表现层**：用户前端、领域工程师工作台

## 目录结构

```
HeartRule-Qcoder/
├── src/                          # 源代码目录
│   ├── core/                     # 核心领域层
│   │   ├── domain/               # 领域模型
│   │   │   ├── session.py        # 会话实体
│   │   │   ├── message.py        # 消息实体
│   │   │   ├── variable.py       # 变量状态实体
│   │   │   └── script.py         # 脚本实体
│   │   └── exceptions/           # 异常定义
│   │
│   ├── engines/                  # 引擎层
│   │   ├── script_execution/     # 脚本执行引擎
│   │   ├── topic_scheduling/     # 话题调度引擎
│   │   ├── awareness_trigger/    # 意识触发引擎
│   │   ├── memory/               # 记忆引擎
│   │   ├── variable_extraction/  # 变量提取引擎
│   │   └── llm_orchestration/    # LLM编排引擎
│   │
│   ├── actions/                  # Action实现
│   │   ├── base.py               # Action基类
│   │   ├── ai_say.py             # ai_say实现
│   │   ├── ai_ask.py             # ai_ask实现
│   │   ├── ai_think.py           # ai_think实现
│   │   └── use_skill.py          # use_skill实现
│   │
│   ├── services/                 # 应用服务层
│   │   ├── session_manager.py    # 会话管理服务
│   │   ├── script_editor.py      # 脚本编辑服务
│   │   └── debugger.py           # 调试服务
│   │
│   ├── storage/                  # 存储层
│   │   ├── repositories/         # 仓储接口
│   │   └── adapters/             # 存储适配器
│   │
│   ├── api/                      # API层
│   │   ├── rest/                 # REST API
│   │   └── websocket/            # WebSocket API
│   │
│   └── utils/                    # 工具类
│       ├── yaml_parser.py        # YAML解析器
│       └── logger.py             # 日志工具
│
├── scripts/                      # YAML脚本目录
│   ├── sessions/                 # 会谈流程脚本
│   ├── techniques/               # 咨询技术脚本
│   ├── awareness/                # 意识脚本
│   ├── variables/                # 全局变量脚本
│   └── forms/                    # 表单脚本
│
├── frontend/                     # 前端代码
│   ├── user/                     # 用户端
│   └── engineer/                 # 工程师工作台
│
├── tests/                        # 测试目录
│   ├── unit/                     # 单元测试
│   ├── integration/              # 集成测试
│   └── fixtures/                 # 测试数据
│
├── docs/                         # 文档目录
│   ├── design/                   # 设计文档
│   ├── api/                      # API文档
│   └── scripts/                  # 脚本编写指南
│
├── config/                       # 配置文件
│   ├── dev.yaml                  # 开发环境配置
│   ├── test.yaml                 # 测试环境配置
│   └── prod.yaml                 # 生产环境配置
│
├── requirements.txt              # Python依赖
├── setup.py                      # 安装脚本
└── README.md                     # 项目说明
```

## MVP阶段目标

当前处于MVP阶段（第一期），目标是验证核心架构可行性，实现基础的CBT评估性会谈。

### ✅ MVP已完成功能

- ✅ 脚本执行引擎（支持会谈流程脚本、咨询技术脚本）
- ✅ 基础Action类型（ai_say、ai_ask、ai_think、use_skill）
- ✅ 变量提取引擎（支持多种提取方法）
- ✅ LLM编排引擎（支持OpenAI和Mock提供者）
- ✅ 会话管理服务（创建、活跃、暂停、恢复、完成）
- ✅ 数据存储层（SQLite持久化）
- ✅ 记忆引擎基础功能（短期记忆）
- ✅ Web脚本编辑器（YAML编辑+基础验证）
- ✅ 调试工具（对话模拟、变量查看、执行日志）
- ✅ 聊天前端（用户侧Web界面）
- ✅ 示例脚本（CBT评估、苏格拉底式提问）
- ✅ RESTful API（完整的后端接口）

### 🎯 完成度：15/15 (100%)

### 📋 后续增强方向

- 意识触发引擎（事件监听和规则匹配）
- 话题调度引擎（智能话题切换）
- 长期记忆（知识图谱）
- LLM并行调用（多模型协作）
- 可视化脚本编辑器
- 快照回滚功能
- 跨会话记忆共享

## 快速开始

### 环境要求

- Python 3.10+
- 建议使用虚拟环境

### 方式一：使用启动脚本（推荐）

Windows:
```cmd
start.bat
```

Linux/Mac:
```bash
chmod +x start.sh
./start.sh
```

启动脚本会自动：
1. 检查并创建虚拟环境
2. 安装所需依赖
3. 初始化数据库
4. 启动API服务器

### 方式二：手动启动

1. 创建虚拟环境
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate     # Windows
```

2. 安装依赖
```bash
pip install -r requirements.txt
```

3. 初始化数据库
```bash
python scripts/init_database.py
```

4. 启动服务器
```bash
python src/api/main.py
```

5. 访问系统
- API文档: http://localhost:8000/docs
- Web界面: 打开 web/index.html

### 运行测试

```bash
python tests/test_basic_flow.py
```

## 技术栈

- **后端**：Python 3.10+
- **Web框架**：FastAPI
- **LLM集成**：OpenAI API / 其他LLM服务
- **数据存储**：SQLite (MVP) → PostgreSQL + MongoDB (生产)
- **脚本解析**：PyYAML
- **前端**：React + TypeScript (计划)

## 开发指南

更多信息请参考：
- [快速开始指南](QUICKSTART.md) - 详细的安装和使用说明
- [开发文档](docs/DEVELOPMENT_GUIDE.md) - 开发者指南
- [项目完成报告](PROJECT_COMPLETION_REPORT.md) - MVP阶段完成情况

## 许可证

待定
