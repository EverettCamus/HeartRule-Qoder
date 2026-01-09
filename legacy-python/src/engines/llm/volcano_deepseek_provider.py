"""
火山引擎 DeepSeek LLM提供者实现
"""
from typing import List, Optional
from openai import AsyncOpenAI

from src.engines.llm.base import (
    BaseLLMProvider, LLMMessage, LLMResponse, LLMConfig, MessageRole
)
from src.core.exceptions.exceptions import LLMError


class VolcanoDeepSeekProvider(BaseLLMProvider):
    """火山引擎 DeepSeek LLM提供者"""
    
    def __init__(self, config: LLMConfig, api_key: str, endpoint_id: str,
                 base_url: str = "https://ark.cn-beijing.volces.com/api/v3"):
        """
        初始化火山引擎 DeepSeek 提供者
        
        Args:
            config: LLM配置
            api_key: 火山引擎 API密钥
            endpoint_id: DeepSeek 端点 ID（格式：ep-xxxxx）
            base_url: API基础URL（默认为火山引擎地址）
        """
        super().__init__(config)
        self.api_key = api_key
        self.endpoint_id = endpoint_id
        self.base_url = base_url
        
        # 初始化 OpenAI 兼容客户端
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
            api_messages = [
                {
                    "role": msg.role.value,
                    "content": msg.content
                }
                for msg in messages
            ]
            
            # 调用火山引擎 API
            response = await self.client.chat.completions.create(
                model=self.endpoint_id,  # 使用端点 ID 作为模型标识
                messages=api_messages,
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
                    "created": response.created,
                    "provider": "volcano_deepseek"
                }
            )
            
        except Exception as e:
            raise LLMError(f"Volcano DeepSeek API call failed: {str(e)}")
    
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
            api_messages = [
                {
                    "role": msg.role.value,
                    "content": msg.content
                }
                for msg in messages
            ]
            
            # 调用火山引擎流式API
            stream = await self.client.chat.completions.create(
                model=self.endpoint_id,  # 使用端点 ID 作为模型标识
                messages=api_messages,
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
            raise LLMError(f"Volcano DeepSeek streaming API call failed: {str(e)}")
    
    def validate_config(self) -> bool:
        """
        验证配置是否有效
        
        Returns:
            bool: 配置是否有效
        """
        # 验证 API Key
        if not self.api_key:
            return False
        
        # 验证端点 ID
        if not self.endpoint_id:
            return False
        
        # 验证端点 ID 格式（应以 ep- 开头）
        if not self.endpoint_id.startswith("ep-"):
            return False
        
        # 验证模型配置
        if not self.config.model:
            return False
        
        # 验证 base_url
        if not self.base_url:
            return False
        
        return True
