# 快速启动指南

**更新**: 2026-01-11

---

## 🎯 当前状态

- ✅ **TypeScript版本**：已就绪，全功能可用
- ✅ **脚本编辑器**：可视化编辑器已上线，支持工程管理和版本控制

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

# 3. 启动API服务器（端口8000）
cd packages\api-server
pnpm dev

# 4. （可选）启动脚本编辑器前端（端口3000）
cd packages\script-editor
pnpm dev
```

**成功标志**：

```
Server listening on http://localhost:8000
Database connected successfully
```

### 访问系统

1. **API文档**: http://localhost:8000/docs
2. **脚本编辑器启动向导**: 在浏览器中打开 `启动编辑器.html`
3. **脚本编辑器**: http://localhost:3000 （需先启动前端服务）
4. **测试对话界面**: 在浏览器中打开 `web/index.html`

### 推荐启动方式

**方式一：完整开发环境**（推荐用于脚本开发）

```bash
# Terminal 1: 启动API服务器
cd packages\api-server
pnpm dev

# Terminal 2: 启动脚本编辑器
cd packages\script-editor
pnpm dev

# 然后打开浏览器访问 http://localhost:3000
```

**方式二：仅API测试**（用于后端调试）

```bash
# 只启动API服务器
cd packages\api-server
pnpm dev

# 使用 web/index.html 或 CLI 测试脚本
```

---

## 🔍 验证服务器状态

```bash
curl.exe http://localhost:8000/health
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
# 方式1: 使用package.json中定义的命令
cd packages\api-server
pnpm test:flow

# 方式2: 直接运行根目录下的测试脚本
cd c:\CBT\HeartRule-Qcoder
pnpm tsx test-session-flow.ts
```

### API方式测试

> **注意**：Windows PowerShell 用户请使用 `curl.exe` 而不是 `curl`，或使用下方的 PowerShell 原生命令。

#### 1. 创建会话

**Linux/macOS (Bash)**:

```bash
curl -X POST http://localhost:8000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user",
    "scriptId": "550e8400-e29b-41d4-a716-446655440001"
  }'
```

**Windows (PowerShell)**:

```powershell
# 方式1: 使用 curl.exe
curl.exe -X POST http://localhost:8000/api/sessions `
  -H "Content-Type: application/json" `
  -d '{"userId":"test_user","scriptId":"550e8400-e29b-41d4-a716-446655440001"}'

# 方式2: 使用 PowerShell 原生命令
$body = @'
{
  "userId": "test_user",
  "scriptId": "550e8400-e29b-41d4-a716-446655440001"
}
'@

Invoke-RestMethod -Uri "http://localhost:8000/api/sessions" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

**响应示例**：

```json
{
  "sessionId": "d6c375d7-de06-47e3-9ab2-b36f91fda21e",
  "status": "active",
  "createdAt": "2026-01-09T14:10:23.456Z",
  "aiMessage": "可以告诉我你的名字吗？我可以怎么称呼你？",
  "executionStatus": "waiting_input"
}
```

#### 2. 发送消息

**Linux/macOS (Bash)**:

```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "d6c375d7-de06-47e3-9ab2-b36f91fda21e",
    "message": "我叫 LEO"
  }'
```

**Windows (PowerShell)**:

```powershell
# 方式1: 使用 curl.exe
curl.exe -X POST http://localhost:8000/api/chat `
  -H "Content-Type: application/json" `
  -d '{"sessionId":"d6c375d7-de06-47e3-9ab2-b36f91fda21e","message":"我叫 LEO"}'

# 方式2: 使用 PowerShell 原生命令
$chatBody = @'
{
  "sessionId": "d6c375d7-de06-47e3-9ab2-b36f91fda21e",
  "message": "我叫 LEO"
}
'@

Invoke-RestMethod -Uri "http://localhost:8000/api/chat" `
  -Method Post `
  -ContentType "application/json" `
  -Body $chatBody
```

**响应示例**：

```json
{
  "aiMessage": "你今年多大了？",
  "sessionStatus": "active",
  "executionStatus": "waiting_input",
  "extractedVariables": {
    "user_name": "我叫 LEO"
  }
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
├── packages/                  # TypeScript Monorepo 工作区
│   ├── api-server/           # API服务器 (端口8000)
│   │   └── src/index.ts      # 启动入口
│   ├── core-engine/          # 核心引擎包
│   └── shared-types/         # 共享类型定义
│
├── web/                       # 开发者Web调试工具（当前使用）
│   ├── index.html            # Web客户端（测试对话）
│   ├── debug.html            # 调试控制台
│   └── script_editor.html    # 脚本编辑器
│
├── frontend/                  # 【预留】正式前端工程目录（暂未启用）
│
├── config/
│   └── dev.yaml              # 开发环境配置
│
├── scripts/                   # YAML脚本文件
│   ├── sessions/             # 会话脚本（如CBT评估）
│   └── techniques/           # 咨询技术脚本（如苏格拉底提问）
│
├── docs/                      # 项目文档
│   ├── DEVELOPMENT_GUIDE.md
│   └── design/               # 设计文档（时序图等）
│
└── docker-compose.dev.yml     # Docker服务编排配置
```

**目录说明**：

- **`packages/*`**：正式TypeScript包，纳入pnpm workspace管理
- **`web/`**：轻量级静态Web客户端，供开发者快速测试API和对话流程
- **`frontend/`**：预留给未来正式H5/Mobile前端工程（当前为空）
- **`scripts/`**：YAML格式的会话脚本和咨询技术定义

---

## 🔗 相关文档

- [开发指南](docs/DEVELOPMENT_GUIDE.md)
- [技术架构设计](docs/design/SEQUENCE_DIAGRAMS.md)
- [脚本编辑器使用指南](packages/script-editor/USAGE_GUIDE.md)
- [可视化编辑功能](packages/script-editor/README_VISUAL_EDITING.md)

---

## 💡 推荐工作流

### 脚本开发流程

1. **打开启动向导**：双击 `启动编辑器.html`，检查系统状态
2. **启动完整环境**：API服务器 + 脚本编辑器前端
3. **可视化编辑脚本**：使用 http://localhost:3000 进行工程管理
4. **CLI测试验证**：使用 `pnpm tsx test-session-flow.ts` 测试会话流程
5. **查看服务器日志**：定位和调试问题

### 快速测试工具

- **test-session-flow.ts** - CLI会话流程测试
- **test-frontend-api.html** - API连接测试
- **create-sample-project.ps1** - 创建示例工程
- **web/index.html** - 简单对话界面测试

### 生产部署

- 基于TypeScript技术栈
- 使用Docker Compose进行部署
- PostgreSQL作为数据存储

---
