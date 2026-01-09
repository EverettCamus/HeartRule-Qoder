# 快速启动指南

**更新**: 2026-01-09

---

## 🎯 当前状态

- ✅ **TypeScript版本**：已就绪，全功能可用

---

## 🚀 快速启动（需Docker）

### 前置条件

- ✅ Docker Desktop已安装
- ✅ Docker Desktop正在运行
- ✅ pnpm 已安装

### 启动步骤

```bash
# 1. 启动数据库服务
cd c:\CBT\HeartRule-Qcoder
pnpm docker:dev

# 2. 运行数据库迁移
cd packages\api-server
pnpm db:migrate

# 3. 启动API服务器
cd packages\api-server
pnpm dev
```

**成功标志**：

```
Server listening on http://localhost:8000
Database connected successfully
```

### 访问系统

1. **API文档**: http://localhost:8000/docs
2. **Web界面**: 在浏览器中打开 `web/index.html`
3. **测试对话**：
   - 点击“开始咨询”
   - 输入消息进行对话

---

## 🔍 验证服务器状态

```bash
curl http://localhost:8000/health
```

**预期响应**：

```json
{
  "status": "ok",
  "timestamp": "2026-01-09T...",
  "database": "connected"
}
```

---

## 🧪 测试对话功能

### 使用CLI测试脚本

```bash
# 运行完整流程测试
cd packages\api-server
pnpm test:flow
```

### API方式测试

#### 1. 创建会话

```bash
curl -X POST http://localhost:8000/api/sessions \
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
curl -X POST http://localhost:8000/api/chat \
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
Error: listen EADDRINUSE: address already in use :::8000
```

**解决**：

```bash
# 查找占用端口的进程
netstat -ano | findstr :8000

# 结束进程（替换PID）
taskkill /PID <进程ID> /F
```

### 问题2：Docker未启动

**现象**：

```
error during connect: pipe/dockerDesktopLinuxEngine
```

**解决**：

1. 启动Docker Desktop
2. 等待Docker完全启动（图标变绿）
3. 重新执行 `pnpm docker:dev`

### 问题3：Web界面无法连接API

**现象**：浏览器控制台显示CORS错误

**检查**：

1. 确认API服务器正在运行
2. 确认 `web/index.html` 中的 `API_BASE` 地址为 `http://localhost:8000/api`
3. 检查浏览器控制台的具体错误信息

### 问题4：数据库连接失败

**现象**：

```
Database connection error
```

**解决**：

1. 确认Docker正在运行
2. 检查PostgreSQL容器状态：`docker ps`
3. 查看数据库日志：`docker logs heartrule-postgres`
4. 重启数据库：`pnpm docker:down; pnpm docker:dev`

---

## 📁 项目结构

```
HeartRule-Qcoder/
├── packages/
│   ├── api-server/         # TypeScript API服务器 (8000端口)
│   │   └── src/index.ts    # 启动入口
│   ├── core-engine/        # 核心引擎
│   └── shared-types/       # 共享类型
├── web/
│   └── index.html          # Web客户端
├── config/
│   └── dev.yaml            # 配置文件
├── scripts/
│   ├── sessions/           # YAML会话脚本
│   └── techniques/         # YAML技术脚本
└── docker-compose.dev.yml  # Docker配置
```

---

## 🔗 相关文档

- [开发指南](docs/DEVELOPMENT_GUIDE.md)
- [MVP实现状态](docs/MVP_IMPLEMENTATION_STATUS.md)
- [技术架构设计](docs/design/SEQUENCE_DIAGRAMS.md)

---

## 💡 推荐工作流

### 日常开发

1. **使用CLI测试脚本验证功能**：`pnpm test:flow`
2. **通过Web界面进行交互测试**
3. **查看服务器日志调试问题**

### 生产部署

- 基于TypeScript技术栈
- 使用Docker Compose进行部署
- PostgreSQL作为数据存储

---
