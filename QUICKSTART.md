# CBT AI咨询引擎 - 快速开始指南

## 系统要求

- Python 3.10+
- 建议使用虚拟环境

## 安装步骤

### 1. 克隆项目（如果尚未克隆）

```bash
cd C:\CBT\HeartRule-Qcoder
```

### 2. 创建虚拟环境

```bash
python -m venv venv
```

### 3. 激活虚拟环境

Windows (PowerShell):
```powershell
.\venv\Scripts\Activate.ps1
```

Windows (CMD):
```cmd
.\venv\Scripts\activate.bat
```

Linux/Mac:
```bash
source venv/bin/activate
```

### 4. 安装依赖

```bash
pip install -r requirements.txt
```

## 初始化系统

### 1. 初始化数据库并加载示例脚本

```bash
python scripts/init_database.py
```

这将：
- 创建SQLite数据库（`data/cbt_engine.db`）
- 加载两个示例脚本：
  - CBT抑郁症初步评估会谈流程
  - 苏格拉底式提问技术

### 2. 运行测试（可选）

```bash
python tests/test_basic_flow.py
```

这将测试：
- YAML脚本解析
- 会话创建和管理
- 对话交互流程
- 变量提取

## 启动系统

### 方式一：启动API服务器

```bash
cd src
python -m api.main
```

或者：

```bash
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
```

服务器将在 `http://localhost:8000` 启动。

访问 API 文档：
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 方式二：使用Web界面

1. 启动API服务器（见上方）

2. 在浏览器打开：`C:\CBT\HeartRule-Qcoder\web\index.html`

3. 点击"开始咨询"按钮，开始与AI咨询师对话

## 核心API端点

### 会话管理

#### 创建会话
```
POST /api/sessions
{
  "user_id": "user_123",
  "script_id": "cbt_depression_001"
}
```

#### 发送消息
```
POST /api/chat
{
  "session_id": "session_xxx",
  "script_id": "cbt_depression_001",
  "message": "我最近感觉很低落"
}
```

#### 获取会话信息
```
GET /api/sessions/{session_id}
```

#### 获取会话消息
```
GET /api/sessions/{session_id}/messages
```

#### 获取会话变量
```
GET /api/sessions/{session_id}/variables
```

### 脚本管理

#### 列出所有脚本
```
GET /api/scripts
```

#### 获取特定脚本
```
GET /api/scripts/{script_id}
```

#### 创建新脚本
```
POST /api/scripts
{
  "script_name": "我的脚本",
  "script_type": "session",
  "script_content": "...",
  "author": "作者名"
}
```

## 项目结构

```
HeartRule-Qcoder/
├── src/
│   ├── core/               # 核心领域模型
│   │   ├── domain/         # Session, Message, Variable, Script
│   │   └── exceptions/     # 异常定义
│   ├── engines/            # 引擎层
│   │   ├── script_execution/  # 脚本执行引擎
│   │   ├── llm/            # LLM编排引擎
│   │   └── variable_extraction/  # 变量提取引擎
│   ├── actions/            # Action实现
│   │   ├── ai_say.py       # 传达信息
│   │   ├── ai_ask.py       # 提问
│   │   ├── ai_think.py     # 内部思考
│   │   └── use_skill.py    # 调用技术
│   ├── services/           # 应用服务
│   │   └── session_manager.py  # 会话管理
│   ├── infrastructure/     # 基础设施
│   │   └── storage/        # 数据存储
│   ├── api/                # API接口
│   │   └── main.py         # FastAPI应用
│   └── utils/              # 工具类
│       └── yaml_parser.py  # YAML解析
├── scripts/                # YAML脚本
│   ├── sessions/           # 会谈流程脚本
│   └── techniques/         # 咨询技术脚本
├── web/                    # Web前端
│   └── index.html          # 聊天界面
├── tests/                  # 测试
│   └── test_basic_flow.py  # 基础流程测试
└── data/                   # 数据文件（自动创建）
    └── cbt_engine.db       # SQLite数据库
```

## 配置LLM（可选）

系统默认使用Mock LLM提供者进行开发和测试。要使用真实的LLM服务：

### 使用OpenAI

1. 在 `src/api/main.py` 中修改LLM提供者：

```python
from src.engines.llm.openai_provider import OpenAIProvider

# 替换
# llm_provider = MockLLMProvider(LLMConfig(model="mock-gpt-3.5"))

# 为
llm_provider = OpenAIProvider(
    config=LLMConfig(model="gpt-3.5-turbo"),
    api_key="your-api-key-here",
    base_url="https://api.openai.com/v1"  # 可选，用于代理
)
```

2. 重启服务器

## 开发与调试

### 查看日志

服务器会输出请求和错误日志到控制台。

### 调试模式

FastAPI自动启用调试模式（`--reload`参数），代码修改后自动重启。

### 数据库查看

使用SQLite客户端查看数据库：
```bash
sqlite3 data/cbt_engine.db
```

查询示例：
```sql
-- 查看所有脚本
SELECT script_id, script_name, script_type, status FROM scripts;

-- 查看所有会话
SELECT session_id, user_id, status, created_at FROM sessions;

-- 查看某会话的消息
SELECT role, content, created_at FROM messages 
WHERE session_id = 'xxx' 
ORDER BY created_at;
```

## 创建新脚本

### 会谈流程脚本示例

参考 `scripts/sessions/cbt_depression_assessment.yaml`

基本结构：
```yaml
session:
  session_id: "my_session_001"
  session_name: "我的会谈流程"
  description: "描述"
  phases:
    - phase_id: "phase_01"
      phase_name: "第一阶段"
      topics:
        - topic_id: "topic_01"
          topic_name: "话题1"
          actions:
            - action_type: "ai_say"
              action_id: "action_01"
              content: "你好，欢迎来到咨询..."
            - action_type: "ai_ask"
              action_id: "action_02"
              question: "你最近感觉如何？"
              extract_to: "mood_description"
```

### 咨询技术脚本示例

参考 `scripts/techniques/socratic_questioning.yaml`

## 常见问题

### Q: 导入模块错误
A: 确保从项目根目录运行，并且PYTHONPATH正确设置

### Q: 数据库锁定错误
A: 确保没有其他进程在访问数据库

### Q: 前端无法连接API
A: 检查CORS设置，确保API服务器正在运行

### Q: 脚本解析失败
A: 检查YAML语法，使用在线YAML验证器

## 下一步

- 查看 `README.md` 了解项目概述
- 查看 `docs/DEVELOPMENT_GUIDE.md` 了解开发细节
- 探索示例脚本了解脚本编写方法
- 尝试创建自己的咨询脚本

## 获取帮助

- 查看API文档：`http://localhost:8000/docs`
- 查看项目文档：`docs/` 目录
- 运行测试了解系统行为

祝您使用愉快！
