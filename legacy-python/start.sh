#!/bin/bash
# CBT AI咨询引擎 - Linux/Mac启动脚本

echo "========================================"
echo "  CBT AI咨询引擎"
echo "  认知行为疗法智能咨询系统"
echo "========================================"
echo ""

# 检查Python
if ! command -v python3 &> /dev/null; then
    echo "[错误] 未找到Python，请先安装Python 3.10+"
    exit 1
fi

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "[提示] 虚拟环境不存在，正在创建..."
    python3 -m venv venv
    echo "[完成] 虚拟环境已创建"
fi

# 激活虚拟环境
source venv/bin/activate

# 检查依赖
echo "[检查] 检查依赖包..."
if ! pip show fastapi &> /dev/null; then
    echo "[安装] 正在安装依赖包..."
    pip install -r requirements.txt
    echo "[完成] 依赖包安装完成"
fi

# 检查数据库
if [ ! -f "data/cbt_engine.db" ]; then
    echo "[初始化] 数据库不存在，正在初始化..."
    python scripts/init_database.py
    echo "[完成] 数据库初始化完成"
fi

echo ""
echo "[启动] 正在启动API服务器..."
echo "[访问] API文档: http://localhost:8000/docs"
echo "[访问] Web界面: 打开 web/index.html"
echo ""
echo "按 Ctrl+C 停止服务器"
echo "========================================"
echo ""

# 启动服务器
python src/api/main.py
