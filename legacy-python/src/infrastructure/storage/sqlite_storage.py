"""
SQLite数据存储层
"""
import sqlite3
import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path

from src.core.domain.session import Session, SessionStatus, ExecutionPosition
from src.core.domain.message import Message, MessageSender, MessageContentType
from src.core.domain.variable import VariableState, VariableScope, VariableUpdateMode
from src.core.domain.script import Script, ScriptType, ScriptStatus


class SQLiteStorage:
    """
    SQLite存储实现
    
    负责持久化：
    - 会话
    - 消息
    - 变量状态
    - 脚本
    """
    
    def __init__(self, db_path: str = "data/cbt_engine.db"):
        """
        初始化存储
        
        Args:
            db_path: 数据库文件路径
        """
        self.db_path = db_path
        
        # 确保目录存在
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        
        # 初始化数据库
        self._init_database()
    
    def _init_database(self) -> None:
        """初始化数据库表"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 会话表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                script_id TEXT NOT NULL,
                status TEXT NOT NULL,
                current_phase_index INTEGER DEFAULT 0,
                current_topic_index INTEGER DEFAULT 0,
                current_action_index INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                last_active_at TEXT NOT NULL,
                ended_at TEXT,
                metadata TEXT
            )
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)
        """)
        
        # 消息表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                message_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                sender TEXT NOT NULL,
                content TEXT NOT NULL,
                content_type TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                action_id TEXT,
                metadata TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions (session_id)
            )
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)
        """)
        
        # 变量状态表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS variable_states (
                variable_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                variable_name TEXT NOT NULL,
                scope TEXT NOT NULL,
                value TEXT,
                value_type TEXT NOT NULL,
                update_mode TEXT NOT NULL,
                source TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                version_history TEXT,
                metadata TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions (session_id)
            )
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_variable_states_session_id ON variable_states(session_id)
        """)
        
        # 脚本表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS scripts (
                script_id TEXT PRIMARY KEY,
                script_type TEXT NOT NULL,
                script_name TEXT NOT NULL,
                script_content TEXT NOT NULL,
                version INTEGER DEFAULT 1,
                status TEXT NOT NULL,
                author TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                published_at TEXT,
                description TEXT,
                tags TEXT,
                metadata TEXT
            )
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_scripts_script_type ON scripts(script_type)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_scripts_status ON scripts(status)
        """)
        
        conn.commit()
        conn.close()
    
    # ==================== Session Operations ====================
    
    async def save_session(self, session: Session) -> None:
        """保存会话"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT OR REPLACE INTO sessions
            (session_id, user_id, script_id, status,
             current_phase_index, current_topic_index, current_action_index,
             created_at, last_active_at, ended_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            session.session_id,
            session.user_id,
            session.script_id,
            session.status.value,
            session.current_position.phase_index if session.current_position else 0,
            session.current_position.topic_index if session.current_position else 0,
            session.current_position.action_index if session.current_position else 0,
            session.created_at.isoformat(),
            session.last_active_at.isoformat(),
            session.ended_at.isoformat() if session.ended_at else None,
            json.dumps(session.metadata)
        ))
        
        conn.commit()
        conn.close()
    
    async def get_session(self, session_id: str) -> Optional[Session]:
        """获取会话"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM sessions WHERE session_id = ?
        """, (session_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return self._row_to_session(row)
        return None
    
    async def list_user_sessions(self, user_id: str,
                                status: Optional[SessionStatus] = None) -> List[Session]:
        """列出用户的会话"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        if status:
            cursor.execute("""
                SELECT * FROM sessions 
                WHERE user_id = ? AND status = ?
                ORDER BY last_active_at DESC
            """, (user_id, status.value))
        else:
            cursor.execute("""
                SELECT * FROM sessions 
                WHERE user_id = ?
                ORDER BY last_active_at DESC
            """, (user_id,))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [self._row_to_session(row) for row in rows]
    
    def _row_to_session(self, row: sqlite3.Row) -> Session:
        """转换数据库行为Session对象"""
        return Session(
            session_id=row['session_id'],
            user_id=row['user_id'],
            script_id=row['script_id'],
            status=SessionStatus(row['status']),
            current_position=ExecutionPosition(
                phase_index=row['current_phase_index'],
                topic_index=row['current_topic_index'],
                action_index=row['current_action_index']
            ),
            created_at=datetime.fromisoformat(row['created_at']),
            last_active_at=datetime.fromisoformat(row['last_active_at']),
            ended_at=datetime.fromisoformat(row['ended_at']) if row['ended_at'] else None,
            metadata=json.loads(row['metadata']) if row['metadata'] else {}
        )
    
    # ==================== Message Operations ====================
    
    async def save_message(self, message: Message) -> None:
        """保存消息"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO messages
            (message_id, session_id, sender, content, content_type, timestamp, action_id, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            message.message_id,
            message.session_id,
            message.sender.value,
            message.content,
            message.content_type.value,
            message.timestamp.isoformat(),
            message.action_id,
            json.dumps(message.metadata)
        ))
        
        conn.commit()
        conn.close()
    
    async def get_session_messages(self, session_id: str) -> List[Message]:
        """获取会话的所有消息"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM messages 
            WHERE session_id = ?
            ORDER BY timestamp ASC
        """, (session_id,))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [self._row_to_message(row) for row in rows]
    
    def _row_to_message(self, row: sqlite3.Row) -> Message:
        """转换数据库行为Message对象"""
        return Message(
            message_id=row['message_id'],
            session_id=row['session_id'],
            sender=MessageSender(row['sender']),
            content=row['content'],
            content_type=MessageContentType(row['content_type']),
            timestamp=datetime.fromisoformat(row['timestamp']),
            action_id=row['action_id'] if row['action_id'] else None,
            metadata=json.loads(row['metadata']) if row['metadata'] else {}
        )
    
    # ==================== Variable Operations ====================
    
    async def save_variable_state(self, variable: VariableState) -> None:
        """保存变量状态"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT OR REPLACE INTO variable_states
            (variable_id, session_id, variable_name, scope, value, value_type,
             update_mode, source, created_at, updated_at, version_history, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            variable.variable_id,
            variable.session_id,
            variable.variable_name,
            variable.scope.value,
            json.dumps(variable.value),
            variable.value_type,
            variable.update_mode.value,
            variable.source,
            variable.created_at.isoformat(),
            variable.updated_at.isoformat(),
            json.dumps(variable.version_history),
            json.dumps(variable.metadata)
        ))
        
        conn.commit()
        conn.close()
    
    async def get_session_variables(self, session_id: str) -> List[VariableState]:
        """获取会话的所有变量"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM variable_states 
            WHERE session_id = ?
        """, (session_id,))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [self._row_to_variable(row) for row in rows]
    
    def _row_to_variable(self, row: sqlite3.Row) -> VariableState:
        """转换数据库行为VariableState对象"""
        return VariableState(
            variable_id=row['variable_id'],
            session_id=row['session_id'],
            variable_name=row['variable_name'],
            scope=VariableScope(row['scope']),
            value=json.loads(row['value']) if row['value'] else None,
            value_type=row['value_type'],
            update_mode=VariableUpdateMode(row['update_mode']),
            source=row['source'],
            created_at=datetime.fromisoformat(row['created_at']),
            updated_at=datetime.fromisoformat(row['updated_at']),
            version_history=json.loads(row['version_history']) if row['version_history'] else [],
            metadata=json.loads(row['metadata']) if row['metadata'] else {}
        )
    
    # ==================== Script Operations ====================
    
    async def save_script(self, script: Script) -> None:
        """保存脚本"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT OR REPLACE INTO scripts
            (script_id, script_type, script_name, script_content, version, status,
             author, created_at, updated_at, published_at, description, tags, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            script.script_id,
            script.script_type.value,
            script.script_name,
            script.script_content,
            script.version,
            script.status.value,
            script.author,
            script.created_at.isoformat(),
            script.updated_at.isoformat(),
            script.published_at.isoformat() if script.published_at else None,
            script.description,
            json.dumps(script.tags),
            json.dumps(script.metadata)
        ))
        
        conn.commit()
        conn.close()
    
    async def get_script(self, script_id: str) -> Optional[Script]:
        """获取脚本"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM scripts WHERE script_id = ?
        """, (script_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return self._row_to_script(row)
        return None
    
    async def list_scripts(self, script_type: Optional[ScriptType] = None,
                          status: Optional[ScriptStatus] = None) -> List[Script]:
        """列出脚本"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        query = "SELECT * FROM scripts WHERE 1=1"
        params = []
        
        if script_type:
            query += " AND script_type = ?"
            params.append(script_type.value)
        
        if status:
            query += " AND status = ?"
            params.append(status.value)
        
        query += " ORDER BY updated_at DESC"
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        return [self._row_to_script(row) for row in rows]
    
    def _row_to_script(self, row: sqlite3.Row) -> Script:
        """转换数据库行为Script对象"""
        return Script(
            script_id=row['script_id'],
            script_type=ScriptType(row['script_type']),
            script_name=row['script_name'],
            script_content=row['script_content'],
            version=row['version'],
            status=ScriptStatus(row['status']),
            author=row['author'],
            created_at=datetime.fromisoformat(row['created_at']),
            updated_at=datetime.fromisoformat(row['updated_at']),
            published_at=datetime.fromisoformat(row['published_at']) if row['published_at'] else None,
            description=row['description'],
            tags=json.loads(row['tags']) if row['tags'] else [],
            metadata=json.loads(row['metadata']) if row['metadata'] else {}
        )
