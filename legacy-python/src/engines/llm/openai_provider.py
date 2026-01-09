"""
OpenAI LLM提供者实现
"""
from typing import List, Optional
import asyncio
from openai import AsyncOpenAI

from src.engines.llm.base import (
    BaseLLMProvider, LLMMessage, LLMResponse, LLMConfig, MessageRole
)
from src.core.exceptions.exceptions import LLMError


class OpenAIProvider(BaseLLMProvider):
    """OpenAI LLM提供者"""
    
    def __init__(self, config: LLMConfig, api_key: str, 
                 base_url: Optional[str] = None):
        """
        初始化OpenAI提供者
        
        Args:
            config: LLM配置
            api_key: OpenAI API密钥
            base_url: 可选的API基础URL（用于代理）
        """
        super().__init__(config)
        self.api_key = api_key
        self.base_url = base_url
        
        # 初始化OpenAI客户端
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url
        )
    
    async def chat(self, messages: List[LLMMessage], 
                   config: Optional[LLMConfig] = None) -> LLMResponse:
        """
        发送聊天请求
        
        Args:
            messages: 消息列表
            config: 可选的配置覆盖
            
        Returns:
            LLMResponse: LLM响应
        """
        try:
            # 使用覆盖配置或默认配置
            cfg = config if config else self.config
            
            # 转换消息格式
            openai_messages = [
                {
                    "role": msg.role.value,
                    "content": msg.content
                }
                for msg in messages
            ]
            
            # 调用OpenAI API
            response = await self.client.chat.completions.create(
                model=cfg.model,
                messages=openai_messages,
                temperature=cfg.temperature,
                max_tokens=cfg.max_tokens,
                top_p=cfg.top_p,
                frequency_penalty=cfg.frequency_penalty,
                presence_penalty=cfg.presence_penalty,
                stop=cfg.stop,
                timeout=cfg.timeout
            )
            
            # 提取响应
            choice = response.choices[0]
            content = choice.message.content
            finish_reason = choice.finish_reason
            
            # 提取使用情况
            usage = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            }
            
            return LLMResponse(
                content=content,
                model=response.model,
                usage=usage,
                finish_reason=finish_reason,
                metadata={
                    "response_id": response.id,
                    "created": response.created
                }
            )
            
        except Exception as e:
            raise LLMError(f"OpenAI API call failed: {str(e)}")
    
    async def chat_stream(self, messages: List[LLMMessage],
                         config: Optional[LLMConfig] = None):
        """
        发送流式聊天请求
        
        Args:
            messages: 消息列表
            config: 可选的配置覆盖
            
        Yields:
            str: 流式内容片段
        """
        try:
            # 使用覆盖配置或默认配置
            cfg = config if config else self.config
            
            # 转换消息格式
            openai_messages = [
                {
                    "role": msg.role.value,
                    "content": msg.content
                }
                for msg in messages
            ]
            
            # 调用OpenAI流式API
            stream = await self.client.chat.completions.create(
                model=cfg.model,
                messages=openai_messages,
                temperature=cfg.temperature,
                max_tokens=cfg.max_tokens,
                top_p=cfg.top_p,
                frequency_penalty=cfg.frequency_penalty,
                presence_penalty=cfg.presence_penalty,
                stop=cfg.stop,
                stream=True,
                timeout=cfg.timeout
            )
            
            # 流式返回
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
                    
        except Exception as e:
            raise LLMError(f"OpenAI streaming API call failed: {str(e)}")
    
    def validate_config(self) -> bool:
        """验证配置是否有效"""
        if not self.api_key:
            return False
        if not self.config.model:
            return False
        return True
