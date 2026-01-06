"""
运行 CBT 抑郁症评估会谈脚本
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.services.session_manager import SessionManager
from src.engines.script_execution.executor import ScriptExecutor
from src.engines.llm.mock_provider import MockLLMProvider
from src.engines.llm.base import LLMConfig
from src.infrastructure.storage.sqlite_storage import SQLiteStorage
from src.actions.registry import ACTION_REGISTRY


async def run_session():
    """运行会谈会话"""
    print("=" * 70)
    print("CBT 抑郁症初次评估会谈")
    print("=" * 70)
    print()
    
    # 初始化组件
    storage = SQLiteStorage("data/cbt_engine.db")
    llm_provider = MockLLMProvider(LLMConfig(model="mock-gpt-3.5"))
    script_executor = ScriptExecutor(ACTION_REGISTRY)
    session_manager = SessionManager(script_executor, storage)
    
    # 加载脚本
    print("正在加载脚本...")
    script = await storage.get_script("cbt_depression_001")
    if not script:
        print("❌ 错误: 脚本不存在")
        print("请先运行: python scripts/init_database.py")
        return
    
    print(f"✓ 已加载脚本: {script.script_name}")
    print()
    
    # 创建会话
    print("正在创建会话...")
    session = await session_manager.create_session(
        user_id="demo_user",
        script=script
    )
    print(f"✓ 会话ID: {session.session_id}")
    print()
    
    print("=" * 70)
    print("开始会谈（输入 'quit' 或 'exit' 退出）")
    print("=" * 70)
    print()
    
    # 开始对话循环
    turn = 0
    while True:
        turn += 1
        
        # 获取用户输入
        if turn == 1:
            # 第一轮，自动触发开场
            user_input = "[开始]"
            print(f">>> {user_input}")
        else:
            try:
                user_input = input("\n你: ").strip()
                if not user_input:
                    continue
                if user_input.lower() in ['quit', 'exit', '退出']:
                    print("\n再见！")
                    break
            except (KeyboardInterrupt, EOFError):
                print("\n\n再见！")
                break
        
        # 处理用户输入
        try:
            result = await session_manager.process_user_input(
                session_id=session.session_id,
                user_input=user_input,
                script=script
            )
            
            # 显示 AI 回复
            if result['ai_message']:
                print(f"\nAI: {result['ai_message']}")
            
            # 显示当前提取的变量（调试用）
            if result.get('variables'):
                important_vars = {k: v for k, v in result['variables'].items() 
                                 if not k.startswith('_')}
                if important_vars:
                    print(f"\n[已收集信息: {', '.join(important_vars.keys())}]")
            
            # 检查是否完成
            if result['completed']:
                print("\n" + "=" * 70)
                print("会谈已完成")
                print("=" * 70)
                
                # 显示最终收集的变量
                variables = await session_manager.get_session_variables(session.session_id)
                if variables:
                    print("\n收集到的信息:")
                    for var_name, var_value in variables.items():
                        if not var_name.startswith('_'):
                            print(f"  • {var_name}: {var_value}")
                
                break
                
        except Exception as e:
            print(f"\n❌ 错误: {e}")
            import traceback
            traceback.print_exc()
            break
    
    print()


async def quick_test():
    """快速测试（自动输入）"""
    print("=" * 70)
    print("CBT 抑郁症初次评估会谈 - 快速测试模式")
    print("=" * 70)
    print()
    
    # 初始化组件
    storage = SQLiteStorage("data/cbt_engine.db")
    llm_provider = MockLLMProvider(LLMConfig(model="mock-gpt-3.5"))
    script_executor = ScriptExecutor(ACTION_REGISTRY)
    session_manager = SessionManager(script_executor, storage)
    
    # 加载脚本
    script = await storage.get_script("cbt_depression_001")
    if not script:
        print("❌ 错误: 脚本不存在")
        return
    
    print(f"✓ 已加载脚本: {script.script_name}\n")
    
    # 创建会话
    session = await session_manager.create_session(
        user_id="test_user",
        script=script
    )
    
    # 预设的对话流程（第一轮传空字符串触发开场）
    test_inputs = [
        "",  # 触发第一个 ai_say
        "我叫小明",
        "28岁",
        "最近工作压力很大，经常感到很焦虑和低落",
        "心情一直很糟糕，有时候会特别悲观",
        "是的，很多以前喜欢的事情现在都不想做了"
    ]
    
    for i, user_input in enumerate(test_inputs, 1):
        print(f"\n--- 第 {i} 轮 ---")
        if user_input:
            print(f"用户: {user_input}")
        
        result = await session_manager.process_user_input(
            session_id=session.session_id,
            user_input=user_input,
            script=script
        )
        
        if result['ai_message']:
            print(f"AI: {result['ai_message']}")
        
        if result['completed']:
            print("\n" + "=" * 70)
            print("会谈已完成")
            print("=" * 70)
            
            variables = await session_manager.get_session_variables(session.session_id)
            if variables:
                print("\n最终收集到的信息:")
                for var_name, var_value in variables.items():
                    if not var_name.startswith('_'):
                        print(f"  • {var_name}: {var_value}")
            break
        
        await asyncio.sleep(0.3)
    
    print()


async def main():
    """主函数"""
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        # 快速测试模式
        await quick_test()
    else:
        # 交互模式
        await run_session()


if __name__ == "__main__":
    asyncio.run(main())
