"""
简单的测试脚本
测试核心功能
"""
import asyncio
import sys
from pathlib import Path

# 将项目根目录添加到Python路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.services.session_manager import SessionManager
from src.engines.script_execution.executor import ScriptExecutor
from src.engines.llm.mock_provider import MockLLMProvider
from src.engines.llm.base import LLMConfig
from src.infrastructure.storage.sqlite_storage import SQLiteStorage
from src.actions.registry import ACTION_REGISTRY
from src.core.domain.script import ScriptType


async def test_basic_flow():
    """测试基本对话流程"""
    print("=== 测试基本对话流程 ===\n")
    
    # 初始化组件
    storage = SQLiteStorage("data/cbt_engine.db")
    llm_provider = MockLLMProvider(LLMConfig(model="mock-gpt-3.5"))
    script_executor = ScriptExecutor(ACTION_REGISTRY)
    session_manager = SessionManager(script_executor, storage)
    
    # 加载脚本
    print("1. 加载脚本...")
    script = await storage.get_script("cbt_depression_001")
    if not script:
        print("错误: 脚本不存在，请先运行 init_database.py")
        return
    print(f"   ✓ 已加载脚本: {script.script_name}")
    
    # 创建会话
    print("\n2. 创建会话...")
    session = await session_manager.create_session(
        user_id="test_user_001",
        script=script
    )
    print(f"   ✓ 会话ID: {session.session_id}")
    
    # 模拟对话
    print("\n3. 开始对话:")
    print("-" * 60)
    
    # 第一轮：AI主动问候
    result = await session_manager.process_user_input(
        session_id=session.session_id,
        user_input="你好",  # 触发第一个Action
        script=script
    )
    
    if result['ai_message']:
        print(f"\nAI: {result['ai_message']}")
    
    # 继续几轮对话
    user_inputs = [
        "我最近感觉很低落",
        "大概持续了两个多星期了",
        "工作压力很大，总是睡不好",
        "嗯，确实是这样"
    ]
    
    for user_input in user_inputs:
        print(f"\n用户: {user_input}")
        
        result = await session_manager.process_user_input(
            session_id=session.session_id,
            user_input=user_input,
            script=script
        )
        
        if result['ai_message']:
            print(f"AI: {result['ai_message']}")
        
        if result['completed']:
            print("\n[会话已完成]")
            break
        
        # 简单延迟
        await asyncio.sleep(0.5)
    
    print("-" * 60)
    
    # 查看变量
    print("\n4. 查看提取的变量:")
    variables = await session_manager.get_session_variables(session.session_id)
    for var_name, var_value in variables.items():
        print(f"   - {var_name}: {var_value}")
    
    # 查看消息历史
    print("\n5. 查看消息历史:")
    messages = await session_manager.get_session_messages(session.session_id)
    print(f"   共 {len(messages)} 条消息")
    
    print("\n=== 测试完成 ===")


async def test_yaml_parser():
    """测试YAML解析器"""
    print("=== 测试YAML解析器 ===\n")
    
    from src.utils.yaml_parser import YAMLParser
    from pathlib import Path
    
    parser = YAMLParser()
    
    # 测试会谈流程脚本
    script_path = "scripts/sessions/cbt_depression_assessment.yaml"
    if Path(script_path).exists():
        print(f"1. 解析会谈流程脚本: {script_path}")
        try:
            parsed = parser.parse_file(script_path)
            parser.validate_session_script(parsed)
            print("   ✓ 解析成功")
            
            session_data = parsed['session']
            print(f"   - Session ID: {session_data['session_id']}")
            print(f"   - Phases: {len(session_data['phases'])}")
            
            total_topics = sum(len(phase['topics']) for phase in session_data['phases'])
            print(f"   - Topics: {total_topics}")
            
        except Exception as e:
            print(f"   ✗ 解析失败: {e}")
    
    # 测试技术脚本
    technique_path = "scripts/techniques/socratic_questioning.yaml"
    if Path(technique_path).exists():
        print(f"\n2. 解析技术脚本: {technique_path}")
        try:
            parsed = parser.parse_file(technique_path)
            parser.validate_technique_script(parsed)
            print("   ✓ 解析成功")
            print(f"   - Technique ID: {parsed['technique_id']}")
            print(f"   - Actions: {len(parsed['topic']['actions'])}")
            
        except Exception as e:
            print(f"   ✗ 解析失败: {e}")
    
    print("\n=== 测试完成 ===")


async def main():
    """主函数"""
    print("CBT AI咨询引擎 - 功能测试\n")
    
    # 测试YAML解析
    await test_yaml_parser()
    print("\n" + "=" * 60 + "\n")
    
    # 测试基本流程
    await test_basic_flow()


if __name__ == "__main__":
    asyncio.run(main())
