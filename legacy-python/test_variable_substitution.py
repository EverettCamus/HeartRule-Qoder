"""
测试变量替换问题
"""
import asyncio
import sys
from pathlib import Path

# 将项目根目录添加到Python路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# 加载环境变量
from dotenv import load_dotenv
load_dotenv(project_root / ".env")

from src.services.session_manager import SessionManager
from src.engines.script_execution.executor import ScriptExecutor
from src.engines.llm.mock_provider import MockLLMProvider
from src.engines.llm.base import LLMConfig
from src.infrastructure.storage.sqlite_storage import SQLiteStorage
from src.actions.registry import ACTION_REGISTRY


async def test_variable_substitution():
    """测试变量替换"""
    print("=== 测试变量替换功能 ===\n")
    
    # 初始化组件
    storage = SQLiteStorage("data/cbt_engine.db")
    llm_provider = MockLLMProvider(LLMConfig(model="mock-gpt-3.5"))
    script_executor = ScriptExecutor(ACTION_REGISTRY)
    session_manager = SessionManager(script_executor, storage)
    
    # 加载脚本
    print("1. 加载脚本...")
    script = await storage.get_script("cbt_depression_001")
    if not script:
        print("错误: 脚本不存在")
        return
    print(f"   ✓ 已加载脚本: {script.script_name}\n")
    
    # 创建会话
    print("2. 创建会话...")
    session = await session_manager.create_session(
        user_id="test_user_var",
        script=script
    )
    print(f"   ✓ 会话ID: {session.session_id}\n")
    
    # 第一轮：触发第一个 action
    print("3. 第一个问题（欢迎 + 询问姓名）")
    print("-" * 60)
    result = await session_manager.process_user_input(
        session_id=session.session_id,
        user_input="你好",
        script=script
    )
    if result['ai_message']:
        print(f"AI: {result['ai_message']}\n")
    
    # 第二轮：用户回答姓名
    print("用户: LEO")
    result = await session_manager.process_user_input(
        session_id=session.session_id,
        user_input="LEO",
        script=script
    )
    print(f"提取的变量: {result['variables']}")
    if result['ai_message']:
        print(f"AI: {result['ai_message']}\n")
    
    # 第三轮：用户回答年龄
    print("用户: 49")
    result = await session_manager.process_user_input(
        session_id=session.session_id,
        user_input="49",
        script=script
    )
    print(f"提取的变量: {result['variables']}")
    if result['ai_message']:
        print(f"AI: {result['ai_message']}")
        print(f"\n【检查】是否包含 '${{user_name}}': {'$' in result['ai_message']}")
        print(f"【检查】是否正确替换为 'LEO': {'LEO' in result['ai_message']}\n")
    
    print("-" * 60)
    print("\n=== 测试完成 ===")


if __name__ == "__main__":
    asyncio.run(test_variable_substitution())
