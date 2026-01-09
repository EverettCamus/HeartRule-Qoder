# 快速启动指南

**更新**: 2026-01-06

---

## 🎯 当前状态

- ✅ **Python版本**：完全可用（端口8001）
- ⚠️ **TypeScript版本**：95%就绪，需数据库初始化

---

## 🚀 方式1：使用Python版本（立即可用）

### 启动服务器

```bash
# 进入Python目录
cd legacy-python

# 启动API服务器
python src\api\main.py
```

**成功标志**：
```
Using Volcano DeepSeek LLM Provider (endpoint: deepseek-v3-250324)
INFO:     Started server process [xxxx]
INFO:     Uvicorn running on http://0.0.0.0:8001
```

### 访问系统

1. **API文档**: http://localhost:8001/docs
2. **Web界面**: 在浏览器中打开 `web/index.html`
3. **测试对话**:
   - 点击"开始咨询"
   - 输入消息进行对话

---

## 🚀 方式2：使用TypeScript版本（需Docker）

### 前置条件
- ✅ Docker Desktop已安装
- ✅ Docker Desktop正在运行

### 启动步骤

```bash
# 1. 启动数据库服务
cd c:\CBT\HeartRule-Qcoder
pnpm docker:dev

# 2. 运行数据库迁移
cd packages\api-server
pnpm db:migrate

# 3. 启动API服务器
pnpm dev
```

### 修改Web客户端配置

编辑 `web/index.html`，修改API地址：

```javascript
// 从
const API_BASE = 'http://localhost:8001/api';

// 改为
const API_BASE = 'http://localhost:8000/api';
```

### 访问系统

1. **API文档**: http://localhost:8000/docs
2. **Web界面**: 在浏览器中打开 `web/index.html`

---

## 🔍 验证服务器状态

### Python版本（8001端口）

```bash
curl http://localhost:8001/
```

**预期响应**：
```json
{
  "message": "CBT AI咨询引擎 API",
  "version": "1.0.0",
  "docs": "/docs"
}
```

### TypeScript版本（8000端口）

```bash
curl http://localhost:8000/
```

**预期响应**：
```json
{
  "message": "HeartRule AI咨询引擎 API",
  "version": "2.0.0",
  "docs": "/docs",
  "health": "/health"
}
```

---

## 🧪 测试对话功能

### API方式测试

#### 1. 创建会话

```bash
curl -X POST http://localhost:8001/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "script_id": "cbt_depression_001"
  }'
```

**响应示例**：
```json
{
  "session_id": "abc-123-def",
  "status": "active",
  "created_at": "2026-01-06T..."
}
```

#### 2. 发送消息

```bash
curl -X POST http://localhost:8001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "abc-123-def",
    "script_id": "cbt_depression_001",
    "message": "你好"
  }'
```

**响应示例**：
```json
{
  "ai_message": "可以告诉我你的名字吗？我可以怎么称呼你？",
  "session_status": "active",
  "variables": {},
  "completed": false,
  "waiting_for_input": true
}
```

### Web界面测试

1. 打开 `web/index.html`
2. 点击"开始咨询"按钮
3. 等待AI首次问候
4. 输入回复，例如："我叫小明"
5. 观察AI继续提问

---

## ⚠️ 常见问题

### 问题1：端口被占用

**现象**：
```
Error: listen EADDRINUSE: address already in use :::8001
```

**解决**：
```bash
# 查找占用端口的进程
netstat -ano | findstr :8001

# 结束进程（替换PID）
taskkill /PID <进程ID> /F
```

### 问题2：Python服务器找不到模块

**现象**：
```
ModuleNotFoundError: No module named 'fastapi'
```

**解决**：
```bash
cd legacy-python
pip install -r requirements.txt
```

### 问题3：Docker未启动

**现象**：
```
error during connect: pipe/dockerDesktopLinuxEngine
```

**解决**：
1. 启动Docker Desktop
2. 等待Docker完全启动（图标变绿）
3. 重新执行 `pnpm docker:dev`

### 问题4：Web界面无法连接API

**现象**：浏览器控制台显示CORS错误

**检查**：
1. 确认API服务器正在运行
2. 确认 `web/index.html` 中的 `API_BASE` 地址正确
3. Python版本用8001，TypeScript版本用8000

---

## 📁 项目结构

```
HeartRule-Qcoder/
├── legacy-python/          # Python版本（8001端口）
│   └── src/api/main.py     # 启动入口
├── packages/
│   └── api-server/         # TypeScript版本（8000端口）
│       └── src/index.ts    # 启动入口
├── web/
│   └── index.html          # Web客户端
├── config/
│   └── dev.yaml            # 配置文件
├── scripts/
│   └── sessions/           # YAML脚本
└── data/
    └── cbt_engine.db       # SQLite数据库（Python版本）
```

---

## 🔗 相关文档

- [Python版本测试结果](PYTHON_VERSION_TEST_RESULTS.md)
- [TypeScript设置状态](TYPESCRIPT_SETUP_STATUS.md)
- [迁移完成总结](MIGRATION_COMPLETION_SUMMARY.md)
- [技术架构设计](.qoder/quests/ai-consulting-engine-architecture.md)

---

## 💡 推荐工作流

### 日常开发

1. **使用Python版本测试功能**（更稳定）
2. **在TypeScript版本开发新特性**
3. **两个版本保持功能同步**

### 生产部署

- **当前阶段**：推荐Python版本（已验证）
- **未来**：切换到TypeScript版本（更好的类型安全和性能）

---

**需要帮助？** 查看 [MIGRATION_COMPLETION_SUMMARY.md](MIGRATION_COMPLETION_SUMMARY.md) 获取完整信息。
