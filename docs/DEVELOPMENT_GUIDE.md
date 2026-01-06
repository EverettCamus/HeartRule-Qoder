# 开发指南

本文档为开发者提供HeartRule AI咨询引擎的开发指南。

## 环境准备

### 1. Python环境

确保安装Python 3.10或更高版本：

```bash
python --version
```

### 2. 创建虚拟环境

```bash
# Windows
python -m venv venv
.\venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

### 3. 安装依赖

```bash
pip install -r requirements.txt
```

### 4. 配置环境变量

复制`.env.example`为`.env`并填写必要的配置：

```bash
cp .env.example .env
```

编辑`.env`文件，设置LLM API密钥：

```
OPENAI_API_KEY=your_key_here
```

## 项目结构

```
src/
├── core/                # 核心领域层
│   ├── domain/          # 领域模型（Session, Message, Variable, Script）
│   └── exceptions/      # 异常定义
├── engines/             # 引擎层（6个核心引擎）
├── actions/             # Action实现
├── services/            # 应用服务层
├── storage/             # 存储层
├── api/                 # API层
└── utils/               # 工具类
```

## 核心概念

### 1. 领域模型

- **Session（会话）**: 一次完整的咨询会话
- **Message（消息）**: 会话中的单条消息
- **VariableState（变量状态）**: 会话中的变量
- **Script（脚本）**: YAML脚本定义

### 2. 脚本层次结构

```
Session（会谈）
  └── Phase（阶段）
      └── Topic（话题）
          └── Action（咨询动作）
```

### 3. Action类型（MVP阶段）

- `ai_say`: 向用户传达信息
- `ai_ask`: 引导式提问收集信息
- `ai_think`: 内部认知加工
- `use_skill`: 调用咨询技术脚本

## 开发工作流

### 1. 创建新的Action类型

在`src/actions/`目录下创建新文件：

```python
from src.actions.base import BaseAction

class MyAction(BaseAction):
    action_type = "my_action"
    
    async def execute(self, context):
        # 实现Action逻辑
        pass
```

### 2. 编写YAML脚本

会谈流程脚本示例（`scripts/sessions/`）：

```yaml
session:
  session_id: "my_session"
  phases:
    - phase_id: "phase_1"
      topics:
        - topic_id: "topic_1"
          actions:
            - action_type: "ai_say"
              action_id: "greeting"
              config:
                content_template: "你好！"
```

### 3. 运行测试

```bash
# 运行所有测试
pytest

# 运行特定测试
pytest tests/unit/test_session.py

# 生成覆盖率报告
pytest --cov=src tests/
```

### 4. 代码格式化

```bash
# 格式化代码
black src/ tests/

# 检查代码风格
flake8 src/ tests/

# 排序导入
isort src/ tests/
```

## 常用命令

### 启动开发服务器

```bash
python -m src.api.rest.main
```

### 运行示例会谈

```bash
python examples/run_session.py
```

### 调试模式

```bash
# 启用详细日志
export LOG_LEVEL=DEBUG
python -m src.api.rest.main
```

## 贡献指南

### 提交代码前的检查清单

- [ ] 代码通过所有测试
- [ ] 添加了必要的单元测试
- [ ] 代码符合PEP 8规范
- [ ] 添加了文档字符串
- [ ] 更新了相关文档

### Git工作流

```bash
# 创建特性分支
git checkout -b feature/my-feature

# 提交更改
git add .
git commit -m "feat: 添加新功能"

# 推送到远程
git push origin feature/my-feature
```

## 调试技巧

### 1. 查看执行日志

日志文件位于`logs/`目录（如果启用了文件日志）。

### 2. 使用调试器

在代码中设置断点：

```python
import pdb; pdb.set_trace()
```

### 3. 查看LLM调用

LLM调用日志包含完整的提示词和响应，可用于调试提示词工程。

## 常见问题

### Q: 如何添加新的LLM服务提供商？

在`src/engines/llm_orchestration/`中添加新的适配器。

### Q: 如何修改脚本Schema？

修改`src/utils/yaml_parser.py`中的Schema定义。

### Q: 如何调试脚本执行？

使用脚本调试服务，支持断点、单步执行、回滚等功能。

## 资源链接

- [设计文档](.qoder/quests/ai-consulting-engine-development.md)
- [API文档](docs/api/)
- [脚本编写指南](docs/scripts/)

## 获取帮助

如有问题，请：
1. 查阅本文档
2. 查看设计文档
3. 提交Issue
