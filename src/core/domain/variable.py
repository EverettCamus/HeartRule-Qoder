"""
变量状态（VariableState）领域模型
"""
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from uuid import uuid4


class VariableScope(str, Enum):
    """变量作用域"""
    GLOBAL = "global"  # 全局作用域（跨会话持久化）
    SESSION = "session"  # 会话作用域（单次会话内有效）
    PHASE = "phase"  # 阶段作用域（当前阶段内有效）
    TOPIC = "topic"  # 话题作用域（当前话题内有效）


class VariableUpdateMode(str, Enum):
    """变量更新模式"""
    OVERWRITE = "overwrite"  # 覆盖模式（直接替换）
    APPEND = "append"  # 追加模式（列表追加）
    MERGE_UNIQUE = "merge_unique"  # 合并唯一模式（去重合并）
    VERSIONED = "versioned"  # 版本化模式（保留历史版本）


@dataclass
class VariableHistory:
    """变量更新历史记录"""
    timestamp: datetime
    old_value: Any
    new_value: Any
    source: str  # 更新来源（action_id或system）
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp.isoformat(),
            "old_value": self.old_value,
            "new_value": self.new_value,
            "source": self.source
        }


@dataclass
class VariableState:
    """
    变量状态实体
    
    管理会话中的变量值，支持不同作用域和更新模式。
    """
    variable_id: str = field(default_factory=lambda: str(uuid4()))
    session_id: str = ""
    variable_name: str = ""
    variable_value: Any = None
    scope: VariableScope = VariableScope.SESSION
    update_mode: VariableUpdateMode = VariableUpdateMode.OVERWRITE
    updated_at: datetime = field(default_factory=datetime.now)
    updated_by: str = ""  # 更新来源（action_id或system）
    history: List[VariableHistory] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def update_value(self, new_value: Any, source: str) -> None:
        """
        更新变量值
        
        根据update_mode采用不同的更新策略
        """
        # 记录历史
        if self.update_mode == VariableUpdateMode.VERSIONED:
            self.history.append(VariableHistory(
                timestamp=datetime.now(),
                old_value=self.variable_value,
                new_value=new_value,
                source=source
            ))
        
        # 根据更新模式处理
        if self.update_mode == VariableUpdateMode.OVERWRITE:
            self.variable_value = new_value
        
        elif self.update_mode == VariableUpdateMode.APPEND:
            if not isinstance(self.variable_value, list):
                self.variable_value = []
            self.variable_value.append(new_value)
        
        elif self.update_mode == VariableUpdateMode.MERGE_UNIQUE:
            if not isinstance(self.variable_value, list):
                self.variable_value = []
            if new_value not in self.variable_value:
                self.variable_value.append(new_value)
        
        elif self.update_mode == VariableUpdateMode.VERSIONED:
            # 保留历史，当前值为最新值
            self.variable_value = new_value
        
        self.updated_at = datetime.now()
        self.updated_by = source
    
    def get_history(self) -> List[VariableHistory]:
        """获取变量更新历史"""
        return self.history
    
    def is_global(self) -> bool:
        """判断是否为全局变量"""
        return self.scope == VariableScope.GLOBAL
    
    def is_session_scoped(self) -> bool:
        """判断是否为会话作用域"""
        return self.scope == VariableScope.SESSION
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "variable_id": self.variable_id,
            "session_id": self.session_id,
            "variable_name": self.variable_name,
            "variable_value": self.variable_value,
            "scope": self.scope.value,
            "update_mode": self.update_mode.value,
            "updated_at": self.updated_at.isoformat(),
            "updated_by": self.updated_by,
            "history": [h.to_dict() for h in self.history],
            "metadata": self.metadata
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "VariableState":
        """从字典创建"""
        history = []
        for h in data.get("history", []):
            history.append(VariableHistory(
                timestamp=datetime.fromisoformat(h["timestamp"]),
                old_value=h["old_value"],
                new_value=h["new_value"],
                source=h["source"]
            ))
        
        return cls(
            variable_id=data["variable_id"],
            session_id=data["session_id"],
            variable_name=data["variable_name"],
            variable_value=data["variable_value"],
            scope=VariableScope(data["scope"]),
            update_mode=VariableUpdateMode(data.get("update_mode", "overwrite")),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            updated_by=data["updated_by"],
            history=history,
            metadata=data.get("metadata", {})
        )
