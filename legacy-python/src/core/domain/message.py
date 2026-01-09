"""
消息（Message）领域模型
"""
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
from uuid import uuid4


class MessageSender(str, Enum):
    """消息发送者"""
    USER = "user"  # 用户
    AI = "ai"  # AI咨询师
    SYSTEM = "system"  # 系统消息


class MessageContentType(str, Enum):
    """消息内容类型"""
    TEXT = "text"  # 纯文本
    CARD = "card"  # 卡片式信息
    FORM = "form"  # 表单
    IMAGE = "image"  # 图片
    AUDIO = "audio"  # 音频


@dataclass
class Message:
    """
    消息实体
    
    表示会话中的一条消息，可以是用户发送的，也可以是AI回复的。
    """
    message_id: str = field(default_factory=lambda: str(uuid4()))
    session_id: str = ""
    sender: MessageSender = MessageSender.USER
    content: str = ""
    content_type: MessageContentType = MessageContentType.TEXT
    timestamp: datetime = field(default_factory=datetime.now)
    action_id: Optional[str] = None  # 触发该消息的Action标识
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def is_from_user(self) -> bool:
        """判断是否为用户消息"""
        return self.sender == MessageSender.USER
    
    def is_from_ai(self) -> bool:
        """判断是否为AI消息"""
        return self.sender == MessageSender.AI
    
    def is_system(self) -> bool:
        """判断是否为系统消息"""
        return self.sender == MessageSender.SYSTEM
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "message_id": self.message_id,
            "session_id": self.session_id,
            "sender": self.sender.value,
            "content": self.content,
            "content_type": self.content_type.value,
            "timestamp": self.timestamp.isoformat(),
            "action_id": self.action_id,
            "metadata": self.metadata
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Message":
        """从字典创建"""
        return cls(
            message_id=data["message_id"],
            session_id=data["session_id"],
            sender=MessageSender(data["sender"]),
            content=data["content"],
            content_type=MessageContentType(data["content_type"]),
            timestamp=datetime.fromisoformat(data["timestamp"]),
            action_id=data.get("action_id"),
            metadata=data.get("metadata", {})
        )
    
    @classmethod
    def create_user_message(cls, session_id: str, content: str, **metadata) -> "Message":
        """创建用户消息"""
        return cls(
            session_id=session_id,
            sender=MessageSender.USER,
            content=content,
            metadata=metadata
        )
    
    @classmethod
    def create_ai_message(cls, session_id: str, content: str, action_id: Optional[str] = None, **metadata) -> "Message":
        """创建AI消息"""
        return cls(
            session_id=session_id,
            sender=MessageSender.AI,
            content=content,
            action_id=action_id,
            metadata=metadata
        )
    
    @classmethod
    def create_system_message(cls, session_id: str, content: str, **metadata) -> "Message":
        """创建系统消息"""
        return cls(
            session_id=session_id,
            sender=MessageSender.SYSTEM,
            content=content,
            metadata=metadata
        )
