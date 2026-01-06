"""
LLM基础接口定义
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum


class MessageRole(str, Enum):
    """消息角色"""
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


@dataclass
class LLMMessage:
    """LLM消息"""
    role: MessageRole
    content: str
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


@dataclass
class LLMResponse:
    """LLM响应"""
    content: str
    model: str
    usage: Dict[str, int]  # token使用情况
    finish_reason: str  # 完成原因
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


@dataclass
class LLMConfig:
    """LLM配置"""
    model: str
    temperature: float = 0.7
    max_tokens: int = 2000
    top_p: float = 1.0
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0
    stop: Optional[List[str]] = None
    timeout: int = 60  # 超时时间（秒）


class BaseLLMProvider(ABC):
    """
    LLM提供者基类
    
    定义了与LLM交互的标准接口
    """
    
    def __init__(self, config: LLMConfig):
        """
        初始化LLM提供者
        
        Args:
            config: LLM配置
        """
        self.config = config
    
    @abstractmethod
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
        pass
    
    @abstractmethod
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
        pass
    
    def validate_config(self) -> bool:
        """
        验证配置是否有效
        
        Returns:
            bool: 配置是否有效
        """
        return True
