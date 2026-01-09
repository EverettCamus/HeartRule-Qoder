"""
测试火山引擎 DeepSeek LLM 对接
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

from src.engines.llm.volcano_deepseek_provider import VolcanoDeepSeekProvider
from src.engines.llm.base import LLMConfig, LLMMessage, MessageRole
import os


async def test_volcano_llm():
    """测试火山引擎 DeepSeek LLM"""
    print("=== 测试火山引擎 DeepSeek LLM 对接 ===\n")
    
    # 获取配置
    api_key = os.getenv("VOLCANO_API_KEY")
    endpoint_id = os.getenv("VOLCANO_ENDPOINT_ID")
    base_url = os.getenv("VOLCANO_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
    
    print(f"API Key: {api_key[:20]}..." if api_key else "API Key: 未设置")
    print(f"Endpoint ID: {endpoint_id}")
    print(f"Base URL: {base_url}\n")
    
    if not api_key or not endpoint_id:
        print("❌ 错误: 环境变量未设置")
        return
    
    # 创建配置
    config = LLMConfig(
        model=endpoint_id,
        temperature=0.7,
        max_tokens=500
    )
    
    # 创建提供者
    provider = VolcanoDeepSeekProvider(
        config=config,
        api_key=api_key,
        endpoint_id=endpoint_id,
        base_url=base_url
    )
    
    # 测试简单对话
    print("测试 1: 简单问候")
    print("-" * 50)
    try:
        messages = [
            LLMMessage(role=MessageRole.SYSTEM, content="你是一个专业的心理咨询师，使用温暖、共情的语气与来访者交流。"),
            LLMMessage(role=MessageRole.USER, content="你好，我是新来的来访者。")
        ]
        response = await provider.chat(messages)
        print(f"✅ 成功!\n回复: {response.content}")
        print(f"Token使用: {response.usage}\n")
    except Exception as e:
        print(f"❌ 失败: {e}\n")
        return
    
    # 测试带上下文的对话
    print("测试 2: 带上下文的对话")
    print("-" * 50)
    try:
        messages = [
            LLMMessage(role=MessageRole.SYSTEM, content="你是一个专业的心理咨询师。"),
            LLMMessage(role=MessageRole.USER, content="你好，我是新来的来访者。"),
            LLMMessage(role=MessageRole.ASSISTANT, content="你好，很高兴见到你。请坐。今天是什么让你来到这里的呢？"),
            LLMMessage(role=MessageRole.USER, content="我最近工作压力很大，经常失眠。")
        ]
        response = await provider.chat(messages)
        print(f"✅ 成功!\n回复: {response.content}")
        print(f"Token使用: {response.usage}\n")
    except Exception as e:
        print(f"❌ 失败: {e}\n")
    
    print("=== 测试完成 ===")


if __name__ == "__main__":
    asyncio.run(test_volcano_llm())
