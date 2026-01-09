"""
Mock LLM提供者（用于测试和开发）
"""
from typing import List, Optional
import asyncio

from src.engines.llm.base import (
    BaseLLMProvider, LLMMessage, LLMResponse, LLMConfig, MessageRole
)


class MockLLMProvider(BaseLLMProvider):
    """Mock LLM提供者，用于测试和开发"""
    
    def __init__(self, config: LLMConfig):
        """
        初始化Mock提供者
        
        Args:
            config: LLM配置
        """
        super().__init__(config)
        self.call_count = 0
    
    async def chat(self, messages: List[LLMMessage], 
                   config: Optional[LLMConfig] = None) -> LLMResponse:
        """
        发送聊天请求（Mock实现）
        
        Args:
            messages: 消息列表
            config: 可选的配置覆盖
            
        Returns:
            LLMResponse: Mock响应
        """
        # 模拟延迟
        await asyncio.sleep(0.1)
        
        self.call_count += 1
        
        # 获取最后一条用户消息
        user_messages = [msg for msg in messages if msg.role == MessageRole.USER]
        last_user_msg = user_messages[-1].content if user_messages else ""
        
        # 生成Mock响应
        content = self._generate_mock_response(last_user_msg)
        
        return LLMResponse(
            content=content,
            model=self.config.model,
            usage={
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150
            },
            finish_reason="stop",
            metadata={
                "mock": True,
                "call_count": self.call_count
            }
        )
    
    async def chat_stream(self, messages: List[LLMMessage],
                         config: Optional[LLMConfig] = None):
        """
        发送流式聊天请求（Mock实现）
        
        Args:
            messages: 消息列表
            config: 可选的配置覆盖
            
        Yields:
            str: 流式内容片段
        """
        # 获取最后一条用户消息
        user_messages = [msg for msg in messages if msg.role == MessageRole.USER]
        last_user_msg = user_messages[-1].content if user_messages else ""
        
        # 生成Mock响应
        content = self._generate_mock_response(last_user_msg)
        
        # 模拟流式输出
        words = content.split()
        for word in words:
            await asyncio.sleep(0.05)
            yield word + " "
    
    def _generate_mock_response(self, user_input: str) -> str:
        """
        生成Mock响应
        
        Args:
            user_input: 用户输入
            
        Returns:
            str: Mock响应内容
        """
        # 简单的响应策略
        if "你好" in user_input or "hello" in user_input.lower():
            return "你好！我是AI咨询师助手，很高兴为您服务。请问有什么可以帮助您的吗？"
        
        if "感觉" in user_input or "情绪" in user_input:
            return "我理解您的感受。能详细说说最近是什么让您有这样的感觉吗？"
        
        if "谢谢" in user_input or "thank" in user_input.lower():
            return "不客气！如果您还有其他需要讨论的，随时告诉我。"
        
        # 默认响应
        return f"我听到您说：'{user_input[:50]}...'。这是一个重要的话题。能再多分享一些吗？"
    
    def validate_config(self) -> bool:
        """验证配置（Mock总是返回True）"""
        return True
