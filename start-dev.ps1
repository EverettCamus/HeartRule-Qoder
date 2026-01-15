# HeartRule 开发环境启动脚本
# 用于同时启动 API 服务器和脚本编辑器

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " HeartRule 开发环境启动工具" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# 检查 pnpm 是否安装
Write-Host "[检查] 检测 pnpm..." -ForegroundColor Yellow
if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] 未找到 pnpm，请先安装 pnpm" -ForegroundColor Red
    Write-Host "  安装命令: npm install -g pnpm" -ForegroundColor Yellow
    exit 1
}
Write-Host "[成功] pnpm 已安装" -ForegroundColor Green
Write-Host ""

# 检查依赖是否安装
Write-Host "[检查] 检测项目依赖..." -ForegroundColor Yellow
if (!(Test-Path "node_modules")) {
    Write-Host "[提示] 首次运行，正在安装依赖..." -ForegroundColor Yellow
    pnpm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[错误] 依赖安装失败" -ForegroundColor Red
        exit 1
    }
}
Write-Host "[成功] 依赖已就绪" -ForegroundColor Green
Write-Host ""

# 检查数据库连接
Write-Host "[检查] 检测数据库连接..." -ForegroundColor Yellow
if (!(Test-Path ".env")) {
    Write-Host "[警告] 未找到 .env 文件，请确保数据库配置正确" -ForegroundColor Yellow
} else {
    Write-Host "[成功] 配置文件已就绪" -ForegroundColor Green
}
Write-Host ""

# 显示启动信息
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " 正在启动服务..." -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  [API 服务器]     http://localhost:3000" -ForegroundColor Blue
Write-Host "  [脚本编辑器]     http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "  按 Ctrl+C 可停止所有服务" -ForegroundColor Yellow
Write-Host ""

# 启动服务
pnpm run dev:all
