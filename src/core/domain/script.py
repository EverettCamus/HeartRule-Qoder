"""
脚本（Script）领域模型
"""
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from uuid import uuid4


class ScriptType(str, Enum):
    """脚本类型"""
    SESSION = "session"  # 会谈流程脚本
    TECHNIQUE = "technique"  # 咨询技术脚本
    AWARENESS = "awareness"  # 意识脚本
    VARIABLE = "variable"  # 全局变量脚本
    FORM = "form"  # 表单脚本


class ScriptStatus(str, Enum):
    """脚本状态"""
    DRAFT = "draft"  # 草稿
    TESTING = "testing"  # 测试中
    PUBLISHED = "published"  # 已发布
    ARCHIVED = "archived"  # 已归档


@dataclass
class Script:
    """
    脚本实体
    
    表示一个YAML脚本定义，可以是会谈流程、咨询技术、意识等不同类型。
    """
    script_id: str = field(default_factory=lambda: str(uuid4()))
    script_type: ScriptType = ScriptType.SESSION
    script_name: str = ""
    script_content: str = ""  # YAML文本内容
    version: int = 1
    status: ScriptStatus = ScriptStatus.DRAFT
    author: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    published_at: Optional[datetime] = None
    description: str = ""
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # 解析后的脚本内容（缓存）
    _parsed_content: Optional[Dict[str, Any]] = field(default=None, repr=False)
    
    def publish(self, publisher: str) -> None:
        """发布脚本"""
        if self.status != ScriptStatus.TESTING:
            raise ValueError(f"Cannot publish script in status: {self.status}")
        
        self.status = ScriptStatus.PUBLISHED
        self.published_at = datetime.now()
        self.updated_at = datetime.now()
        self.metadata["publisher"] = publisher
    
    def archive(self) -> None:
        """归档脚本"""
        self.status = ScriptStatus.ARCHIVED
        self.updated_at = datetime.now()
    
    def create_new_version(self) -> "Script":
        """创建新版本"""
        return Script(
            script_type=self.script_type,
            script_name=self.script_name,
            script_content=self.script_content,
            version=self.version + 1,
            status=ScriptStatus.DRAFT,
            author=self.author,
            description=self.description,
            tags=self.tags.copy(),
            metadata=self.metadata.copy()
        )
    
    def is_published(self) -> bool:
        """判断是否已发布"""
        return self.status == ScriptStatus.PUBLISHED
    
    def can_edit(self) -> bool:
        """判断是否可编辑"""
        return self.status in (ScriptStatus.DRAFT, ScriptStatus.TESTING)
    
    def set_parsed_content(self, parsed: Dict[str, Any]) -> None:
        """设置解析后的内容（用于缓存）"""
        self._parsed_content = parsed
    
    def get_parsed_content(self) -> Optional[Dict[str, Any]]:
        """获取解析后的内容"""
        return self._parsed_content
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "script_id": self.script_id,
            "script_type": self.script_type.value,
            "script_name": self.script_name,
            "script_content": self.script_content,
            "version": self.version,
            "status": self.status.value,
            "author": self.author,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "description": self.description,
            "tags": self.tags,
            "metadata": self.metadata
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Script":
        """从字典创建"""
        return cls(
            script_id=data["script_id"],
            script_type=ScriptType(data["script_type"]),
            script_name=data["script_name"],
            script_content=data["script_content"],
            version=data["version"],
            status=ScriptStatus(data["status"]),
            author=data["author"],
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            published_at=datetime.fromisoformat(data["published_at"]) if data.get("published_at") else None,
            description=data.get("description", ""),
            tags=data.get("tags", []),
            metadata=data.get("metadata", {})
        )
