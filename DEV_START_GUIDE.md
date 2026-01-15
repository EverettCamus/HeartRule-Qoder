# 开发环境启动指南

## 快速启动

### 方法一：使用 npm 脚本（推荐）

在项目根目录运行以下命令即可同时启动 API 服务和脚本编辑器：

```bash
pnpm run dev:all
```

该命令会并行启动：

- **API 服务器**: http://localhost:8000
  - API 文档: http://localhost:8000/docs
- **脚本编辑器**: http://localhost:3000

按 `Ctrl+C` 可同时停止所有服务。

### 方法二：使用 PowerShell 脚本（Windows）

双击运行 `start-dev.ps1` 或在 PowerShell 中执行：

```powershell
.\start-dev.ps1
```

该脚本会：

1. 检查 pnpm 是否安装
2. 检查并安装项目依赖
3. 验证配置文件
4. 启动所有服务

### 方法三：单独启动服务

如果需要单独启动某个服务：

```bash
# 仅启动 API 服务器
pnpm run dev

# 仅启动脚本编辑器
pnpm run dev:editor
```

## 可用的脚本命令

| 命令                  | 说明                            |
| --------------------- | ------------------------------- |
| `pnpm run dev:all`    | 同时启动 API 服务器和脚本编辑器 |
| `pnpm run dev`        | 仅启动 API 服务器               |
| `pnpm run dev:editor` | 仅启动脚本编辑器                |
| `pnpm run build`      | 构建所有包                      |
| `pnpm run docker:dev` | 启动 Docker 开发环境            |
| `pnpm run db:migrate` | 运行数据库迁移                  |
| `pnpm run db:studio`  | 打开 Drizzle Studio             |

## 服务端口说明

- **API 服务器**: 8000
- **脚本编辑器**: 3000
- **PostgreSQL**: 5432 (Docker)
- **Redis**: 6379 (Docker)

## 故障排除

### 端口被占用

如果启动失败提示端口被占用，可以：

1. 查找占用端口的进程：

```powershell
# 查找占用 8000 端口的进程
netstat -ano | findstr :8000

# 查找占用 3000 端口的进程
netstat -ano | findstr :3000
```

2. 终止进程：

```powershell
taskkill /PID <进程ID> /F
```

### 数据库连接失败

确保 Docker 容器正在运行：

```bash
pnpm run docker:dev
```

或手动启动：

```bash
docker-compose -f docker-compose.dev.yml up -d
```

### 依赖安装问题

如果遇到依赖问题，尝试重新安装：

```bash
# 清理依赖
pnpm clean

# 重新安装
pnpm install
```

## 开发工作流

1. **首次启动**：

   ```bash
   # 启动 Docker 服务
   pnpm run docker:dev

   # 运行数据库迁移
   pnpm run db:migrate

   # 启动开发服务
   pnpm run dev:all
   ```

2. **日常开发**：

   ```bash
   # 直接启动所有服务
   pnpm run dev:all
   ```

3. **停止服务**：
   - 按 `Ctrl+C` 停止开发服务
   - 使用 `pnpm run docker:down` 停止 Docker 容器

## 技术实现说明

本项目使用 [concurrently](https://www.npmjs.com/package/concurrently) 工具实现多服务并行启动。

配置详情见 [package.json](./package.json#L16):

```json
{
  "scripts": {
    "dev:all": "concurrently -n API,Editor -c blue,green \"pnpm --filter api-server dev\" \"pnpm --filter script-editor dev\""
  }
}
```

参数说明：

- `-n API,Editor`: 为每个服务设置标签名称
- `-c blue,green`: 为每个服务的输出设置不同颜色
- 引号内为各个服务的启动命令

## 相关文档

- [项目快速启动指南](./QUICK_START_GUIDE.md)
- [开发指南](./docs/DEVELOPMENT_GUIDE.md)
