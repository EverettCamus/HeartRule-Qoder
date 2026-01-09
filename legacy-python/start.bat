@echo off
REM CBT AI咨询引擎 - Windows启动脚本

echo ========================================
echo   CBT AI咨询引擎
echo   认知行为疗法智能咨询系统
echo ========================================
echo.

REM 检查Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到Python，请先安装Python 3.10+
    pause
    exit /b 1
)

REM 检查虚拟环境
if not exist "venv\Scripts\activate.bat" (
    echo [提示] 虚拟环境不存在，正在创建...
    python -m venv venv
    echo [完成] 虚拟环境已创建
)

REM 激活虚拟环境
call venv\Scripts\activate.bat

REM 检查依赖
echo [检查] 检查依赖包...
pip show fastapi >nul 2>&1
if %errorlevel% neq 0 (
    echo [安装] 正在安装依赖包...
    pip install -r requirements.txt
    echo [完成] 依赖包安装完成
)

REM 检查数据库
if not exist "..\data\cbt_engine.db" (
    echo [初始化] 数据库不存在，正在初始化...
    python ..\scripts\init_database.py
    echo [完成] 数据库初始化完成
)

echo.
echo [启动] 正在启动API服务器...
echo [访问] API文档: http://localhost:8001/docs
echo [访问] Web界面: 打开 ..\web\index.html （需修改API地址为8001）
echo.
echo 按 Ctrl+C 停止服务器
echo ========================================
echo.

REM 启动服务器
python src\api\main.py

pause
