"""
初始化脚本
加载示例脚本到数据库
"""
import asyncio
import sys
from pathlib import Path

# 将项目根目录添加到Python路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.infrastructure.storage.sqlite_storage import SQLiteStorage
from src.core.domain.script import Script, ScriptType, ScriptStatus


async def init_database():
    """初始化数据库并加载示例脚本"""
    print("初始化数据库...")
    storage = SQLiteStorage("data/cbt_engine.db")
    
    # 加载示例脚本
    script_files = [
        {
            "file": "scripts/sessions/cbt_depression_assessment.yaml",
            "id": "cbt_depression_001",
            "name": "CBT抑郁症初步评估",
            "type": ScriptType.SESSION,
            "author": "系统",
            "description": "用于CBT抑郁症初步评估的会谈流程脚本"
        },
        {
            "file": "scripts/techniques/socratic_questioning.yaml",
            "id": "socratic_questioning_001",
            "name": "苏格拉底式提问技术",
            "type": ScriptType.TECHNIQUE,
            "author": "系统",
            "description": "帮助来访者通过引导性提问进行自我探索和反思"
        }
    ]
    
    for script_info in script_files:
        file_path = Path(script_info["file"])
        
        if not file_path.exists():
            print(f"警告: 脚本文件不存在: {file_path}")
            continue
        
        # 读取脚本内容
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 创建脚本对象
        script = Script(
            script_id=script_info["id"],
            script_type=script_info["type"],
            script_name=script_info["name"],
            script_content=content,
            author=script_info["author"],
            description=script_info["description"],
            status=ScriptStatus.PUBLISHED  # 直接发布
        )
        
        # 保存到数据库
        await storage.save_script(script)
        print(f"✓ 已加载脚本: {script_info['name']} (ID: {script_info['id']})")
    
    print("\n数据库初始化完成！")
    print(f"数据库位置: {Path('data/cbt_engine.db').absolute()}")


if __name__ == "__main__":
    asyncio.run(init_database())
