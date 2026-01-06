"""
记忆引擎 - 短期记忆实现
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from collections import deque


@dataclass
class MemoryItem:
    """记忆项"""
    memory_id: str
    session_id: str
    content: str
    memory_type: str  # conversation, insight, pattern, event
    importance: float  # 0-1
    created_at: datetime = field(default_factory=datetime.now)
    accessed_at: datetime = field(default_factory=datetime.now)
    access_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def access(self) -> None:
        """访问记忆，更新统计"""
        self.accessed_at = datetime.now()
        self.access_count += 1


class ShortTermMemory:
    """
    短期记忆管理
    
    负责管理会话内的短期记忆，包括：
    - 对话历史
    - 关键洞察
    - 模式识别
    - 重要事件
    """
    
    def __init__(self, max_size: int = 100, retention_hours: int = 24):
        """
        初始化短期记忆
        
        Args:
            max_size: 最大记忆数量
            retention_hours: 记忆保留时间（小时）
        """
        self.max_size = max_size
        self.retention_hours = retention_hours
        
        # 会话记忆存储 {session_id: [MemoryItem]}
        self.session_memories: Dict[str, deque] = {}
        
        # 重要记忆索引（按重要性排序）
        self.important_memories: Dict[str, List[MemoryItem]] = {}
    
    def add_memory(self, session_id: str, content: str, 
                   memory_type: str = "conversation",
                   importance: float = 0.5,
                   metadata: Optional[Dict[str, Any]] = None) -> MemoryItem:
        """
        添加记忆
        
        Args:
            session_id: 会话ID
            content: 记忆内容
            memory_type: 记忆类型
            importance: 重要性（0-1）
            metadata: 元数据
            
        Returns:
            MemoryItem: 创建的记忆项
        """
        from uuid import uuid4
        
        # 创建记忆项
        memory = MemoryItem(
            memory_id=str(uuid4()),
            session_id=session_id,
            content=content,
            memory_type=memory_type,
            importance=importance,
            metadata=metadata or {}
        )
        
        # 添加到会话记忆
        if session_id not in self.session_memories:
            self.session_memories[session_id] = deque(maxlen=self.max_size)
        
        self.session_memories[session_id].append(memory)
        
        # 如果重要性高，添加到重要记忆索引
        if importance >= 0.7:
            if session_id not in self.important_memories:
                self.important_memories[session_id] = []
            self.important_memories[session_id].append(memory)
            # 按重要性排序
            self.important_memories[session_id].sort(
                key=lambda m: m.importance, 
                reverse=True
            )
        
        return memory
    
    def get_recent_memories(self, session_id: str, 
                           count: int = 10,
                           memory_type: Optional[str] = None) -> List[MemoryItem]:
        """
        获取最近的记忆
        
        Args:
            session_id: 会话ID
            count: 数量
            memory_type: 可选的类型过滤
            
        Returns:
            List[MemoryItem]: 记忆列表
        """
        if session_id not in self.session_memories:
            return []
        
        memories = list(self.session_memories[session_id])
        
        # 类型过滤
        if memory_type:
            memories = [m for m in memories if m.memory_type == memory_type]
        
        # 返回最近的N条
        return memories[-count:]
    
    def get_important_memories(self, session_id: str,
                              min_importance: float = 0.7) -> List[MemoryItem]:
        """
        获取重要记忆
        
        Args:
            session_id: 会话ID
            min_importance: 最低重要性阈值
            
        Returns:
            List[MemoryItem]: 重要记忆列表
        """
        if session_id not in self.important_memories:
            return []
        
        return [
            m for m in self.important_memories[session_id]
            if m.importance >= min_importance
        ]
    
    def search_memories(self, session_id: str, 
                       query: str,
                       limit: int = 5) -> List[MemoryItem]:
        """
        搜索记忆（简单关键词匹配）
        
        Args:
            session_id: 会话ID
            query: 搜索查询
            limit: 返回数量限制
            
        Returns:
            List[MemoryItem]: 匹配的记忆
        """
        if session_id not in self.session_memories:
            return []
        
        query_lower = query.lower()
        matches = []
        
        for memory in self.session_memories[session_id]:
            if query_lower in memory.content.lower():
                memory.access()  # 更新访问统计
                matches.append(memory)
        
        # 按重要性和访问次数排序
        matches.sort(
            key=lambda m: (m.importance, m.access_count),
            reverse=True
        )
        
        return matches[:limit]
    
    def summarize_session(self, session_id: str) -> Dict[str, Any]:
        """
        总结会话记忆
        
        Args:
            session_id: 会话ID
            
        Returns:
            Dict: 会话记忆摘要
        """
        if session_id not in self.session_memories:
            return {
                "total_memories": 0,
                "important_memories": 0,
                "memory_types": {},
                "summary": "无记忆"
            }
        
        memories = list(self.session_memories[session_id])
        
        # 统计各类型记忆
        memory_types = {}
        for memory in memories:
            memory_types[memory.memory_type] = \
                memory_types.get(memory.memory_type, 0) + 1
        
        # 提取重要洞察
        important = self.get_important_memories(session_id)
        insights = [m.content for m in important if m.memory_type == "insight"]
        
        return {
            "total_memories": len(memories),
            "important_memories": len(important),
            "memory_types": memory_types,
            "key_insights": insights[:3],  # 最多3条关键洞察
            "time_range": {
                "start": memories[0].created_at.isoformat() if memories else None,
                "end": memories[-1].created_at.isoformat() if memories else None
            }
        }
    
    def cleanup_old_memories(self) -> int:
        """
        清理过期记忆
        
        Returns:
            int: 清理的记忆数量
        """
        cutoff_time = datetime.now() - timedelta(hours=self.retention_hours)
        cleaned_count = 0
        
        for session_id in list(self.session_memories.keys()):
            memories = self.session_memories[session_id]
            original_size = len(memories)
            
            # 过滤掉过期的记忆
            self.session_memories[session_id] = deque(
                [m for m in memories if m.created_at > cutoff_time],
                maxlen=self.max_size
            )
            
            cleaned_count += original_size - len(self.session_memories[session_id])
            
            # 如果会话记忆为空，移除
            if not self.session_memories[session_id]:
                del self.session_memories[session_id]
                if session_id in self.important_memories:
                    del self.important_memories[session_id]
        
        return cleaned_count
    
    def clear_session(self, session_id: str) -> None:
        """
        清除会话记忆
        
        Args:
            session_id: 会话ID
        """
        if session_id in self.session_memories:
            del self.session_memories[session_id]
        if session_id in self.important_memories:
            del self.important_memories[session_id]
