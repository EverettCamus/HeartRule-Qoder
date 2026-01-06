"""
会话（Session）领域模型
"""
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
from uuid import uuid4


class SessionStatus(str, Enum):
    """会话状态"""
    ACTIVE = "active"  # 活跃中
    PAUSED = "paused"  # 短暂离线
    SUSPENDED = "suspended"  # 长期挂起
    COMPLETED = "completed"  # 正常结束
    INTERRUPTED = "interrupted"  # 异常中断
    ARCHIVED = "archived"  # 已归档


@dataclass
class ExecutionPosition:
    """当前执行位置"""
    phase_index: int = 0
    topic_index: int = 0
    action_index: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "phase_index": self.phase_index,
            "topic_index": self.topic_index,
            "action_index": self.action_index
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ExecutionPosition":
        return cls(
            phase_index=data.get("phase_index", 0),
            topic_index=data.get("topic_index", 0),
            action_index=data.get("action_index", 0)
        )


@dataclass
class Session:
    """
    会话实体
    
    表示一次完整的咨询会话，从开始到结束。
    """
    session_id: str = field(default_factory=lambda: str(uuid4()))
    user_id: str = ""
    script_id: str = ""
    status: SessionStatus = SessionStatus.ACTIVE
    current_position: Optional[ExecutionPosition] = None
    created_at: datetime = field(default_factory=datetime.now)
    last_active_at: datetime = field(default_factory=datetime.now)
    ended_at: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def update_position(self, phase_index: int, topic_index: int, action_index: int) -> None:
        """更新执行位置"""
        self.current_position = ExecutionPosition(
            phase_index=phase_index,
            topic_index=topic_index,
            action_index=action_index
        )
        self.last_active_at = datetime.now()
    
    def pause(self) -> None:
        """暂停会话（短暂离线）"""
        if self.status != SessionStatus.ACTIVE:
            raise ValueError(f"Cannot pause session in status: {self.status}")
        self.status = SessionStatus.PAUSED
        self.last_active_at = datetime.now()
    
    def suspend(self) -> None:
        """挂起会话（长期离线）"""
        if self.status not in (SessionStatus.ACTIVE, SessionStatus.PAUSED):
            raise ValueError(f"Cannot suspend session in status: {self.status}")
        self.status = SessionStatus.SUSPENDED
        self.last_active_at = datetime.now()
    
    def resume(self) -> None:
        """恢复会话"""
        if self.status not in (SessionStatus.PAUSED, SessionStatus.SUSPENDED):
            raise ValueError(f"Cannot resume session in status: {self.status}")
        self.status = SessionStatus.ACTIVE
        self.last_active_at = datetime.now()
    
    def complete(self) -> None:
        """正常结束会话"""
        if self.status != SessionStatus.ACTIVE:
            raise ValueError(f"Cannot complete session in status: {self.status}")
        self.status = SessionStatus.COMPLETED
        self.ended_at = datetime.now()
        self.last_active_at = datetime.now()
    
    def interrupt(self) -> None:
        """异常中断会话"""
        self.status = SessionStatus.INTERRUPTED
        self.ended_at = datetime.now()
        self.last_active_at = datetime.now()
    
    def archive(self) -> None:
        """归档会话"""
        if self.status not in (SessionStatus.COMPLETED, SessionStatus.INTERRUPTED, SessionStatus.SUSPENDED):
            raise ValueError(f"Cannot archive session in status: {self.status}")
        self.status = SessionStatus.ARCHIVED
    
    def is_active(self) -> bool:
        """判断会话是否活跃"""
        return self.status == SessionStatus.ACTIVE
    
    def can_resume(self) -> bool:
        """判断会话是否可恢复"""
        return self.status in (SessionStatus.PAUSED, SessionStatus.SUSPENDED)
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "script_id": self.script_id,
            "status": self.status.value,
            "current_position": self.current_position.to_dict() if self.current_position else None,
            "created_at": self.created_at.isoformat(),
            "last_active_at": self.last_active_at.isoformat(),
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "metadata": self.metadata
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Session":
        """从字典创建"""
        position_data = data.get("current_position")
        return cls(
            session_id=data["session_id"],
            user_id=data["user_id"],
            script_id=data["script_id"],
            status=SessionStatus(data["status"]),
            current_position=ExecutionPosition.from_dict(position_data) if position_data else None,
            created_at=datetime.fromisoformat(data["created_at"]),
            last_active_at=datetime.fromisoformat(data["last_active_at"]),
            ended_at=datetime.fromisoformat(data["ended_at"]) if data.get("ended_at") else None,
            metadata=data.get("metadata", {})
        )
