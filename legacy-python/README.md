# ⚠️ LEGACY PYTHON VERSION（待弃用）

**重要提示**：本目录包含的Python版本已停止维护，仅用于参考和过渡。

---

## 📌 状态说明

| 项目 | 说明 |
|------|------|
| **当前状态** | 功能冻结，仅修复严重Bug |
| **最后更新** | 2025-01-06 |
| **维护级别** | 最低限度维护 |
| **计划弃用时间** | TypeScript版本稳定后（约2025-Q2） |

---

## 🚀 新版本（TypeScript）

**强烈推荐使用根目录的TypeScript版本进行所有新开发！**

### 主要改进
- ✅ 类型安全：TypeScript编译时检查
- ✅ 高性能：Fastify框架比FastAPI快2-3倍
- ✅ 现代化：Monorepo架构 + pnpm
- ✅ AI友好：Vercel AI SDK集成
- ✅ 前后端统一：全栈TypeScript

### 快速切换到TypeScript版本
```bash
cd ..  # 返回项目根目录
pnpm install
pnpm dev
```

详细文档：[../README.md](../README.md)

---

## 📖 Python版本快速启动（仅供参考）

### 环境要求
- Python 3.10+
- pip

### 启动步骤

#### Windows
```cmd
cd legacy-python
.\start.bat
```

#### Linux/Mac
```bash
cd legacy-python
chmod +x start.sh
./start.sh
```

### 手动启动
```bash
cd legacy-python

# 1. 创建虚拟环境
python -m venv venv

# 2. 激活虚拟环境
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate     # Windows

# 3. 安装依赖
pip install -r requirements.txt

# 4. 初始化数据库
python scripts/init_database.py

# 5. 启动API服务器
python src/api/main.py
```

### 访问
- API文档：http://localhost:8000/docs
- Web界面：打开 ../web/index.html

---

## 📂 目录结构

```
legacy-python/
├── src/                          # Python源代码
│   ├── core/                     # 核心领域层
│   ├── engines/                  # 六大引擎
│   ├── actions/                  # Action实现
│   ├── services/                 # 应用服务层
│   └── api/                      # FastAPI接口
│
├── tests/                        # Python测试
│   └── test_basic_flow.py
│
├── scripts/                      # 工具脚本（已移到根目录）
├── requirements.txt              # Python依赖
├── start.bat                     # Windows启动脚本
├── start.sh                      # Linux/Mac启动脚本
├── run_session.py                # 运行会话示例
├── test_variable_substitution.py # 测试脚本
└── venv/                         # Python虚拟环境
```

---

## 🔄 迁移指南

### 从Python迁移到TypeScript

如果你正在维护Python版本的功能，需要迁移到TypeScript版本：

#### 1. 概念对应关系

| Python | TypeScript | 说明 |
|--------|-----------|------|
| `src/core/domain/session.py` | `packages/core-engine/src/domain/session.ts` | 领域模型 |
| `src/engines/` | `packages/core-engine/src/engines/` | 核心引擎 |
| `src/api/main.py` (FastAPI) | `packages/api-server/src/app.ts` (Fastify) | API入口 |
| `requirements.txt` | `package.json` | 依赖管理 |
| `tests/` | `packages/*/src/**/__tests__/` | 测试代码 |

#### 2. 数据库迁移

**Python版本**：SQLite (`data/cbt_engine.db`)
```python
# src/infrastructure/storage/sqlite_storage.py
```

**TypeScript版本**：PostgreSQL + Drizzle ORM
```typescript
// packages/api-server/src/db/schema.ts
```

迁移数据：参考 [../docs/migration/data-migration.md](../docs/migration/data-migration.md)（待创建）

#### 3. API接口变更

大部分API保持兼容，但有细微调整：

**Python**（FastAPI）:
```python
@app.post("/api/sessions")
async def create_session(request: CreateSessionRequest):
    ...
```

**TypeScript**（Fastify）:
```typescript
app.post('/api/sessions', {
  schema: { body: CreateSessionRequestSchema }
}, async (request, reply) => {
  ...
});
```

---

## ⚠️ 已知问题

### Python版本不再修复的问题
1. **性能问题**：GIL限制并发性能
2. **类型安全**：动态类型导致运行时错误
3. **前端集成**：需要单独的前端技术栈

### 如遇到严重Bug
请在GitHub Issues中报告，但优先考虑在TypeScript版本中修复。

---

## 📞 支持

### 获取帮助
1. **优先**：查看TypeScript版本文档 [../README.md](../README.md)
2. 查看设计文档 [../.qoder/quests/](../.qoder/quests/)
3. 提交Issue（标记为`legacy-python`）

### 社区讨论
- GitHub Discussions
- 开发者交流群

---

## 🗑️ 弃用时间表

| 阶段 | 时间 | 说明 |
|------|------|------|
| **Phase 1** | 2025-01 | ✅ TypeScript版本发布，Python进入维护模式 |
| **Phase 2** | 2025-Q1 | 迁移指南完善，鼓励迁移 |
| **Phase 3** | 2025-Q2 | 停止Python版本更新（除严重Bug） |
| **Phase 4** | 2025-Q3 | 计划删除Python版本 |

---

## 📝 最后更新

- **文档创建时间**：2025-01-07
- **Python版本**：1.0.0 (Frozen)
- **TypeScript版本**：2.0.0 (Active Development)

**再次强烈建议：所有新功能开发请使用TypeScript版本！**
