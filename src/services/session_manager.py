"""
会话管理服务
"""
from typing import Dict, Any, Optional, List
from datetime import datetime
from uuid import uuid4

from src.core.domain.session import Session, SessionStatus, ExecutionPosition
from src.core.domain.script import Script, ScriptType
from src.core.domain.message import Message, MessageSender, MessageContentType
from src.core.domain.variable import VariableState
from src.engines.script_execution.executor import ScriptExecutor, ExecutionState, ExecutionStatus
from src.core.exceptions.exceptions import SessionError, ScriptExecutionError


class SessionManager:
    """
    会话管理服务
    
    负责：
    1. 创建和管理会话生命周期
    2. 协调脚本执行
    3. 管理会话状态
    4. 处理用户交互
    """
    
    def __init__(self, 
                 script_executor: ScriptExecutor,
                 storage=None):  # storage将在存储层实现后添加
        """
        初始化会话管理器
        
        Args:
            script_executor: 脚本执行器
            storage: 存储层（可选）
        """
        self.script_executor = script_executor
        self.storage = storage
        
        # 内存中的会话缓存
        self.active_sessions: Dict[str, Session] = {}
        self.execution_states: Dict[str, ExecutionState] = {}
    
    async def create_session(self,
                           user_id: str,
                           script: Script,
                           initial_variables: Optional[Dict[str, Any]] = None) -> Session:
        """
        创建新会话
        
        Args:
            user_id: 用户ID
            script: 脚本对象
            initial_variables: 初始变量
            
        Returns:
            Session: 创建的会话
        """
        try:
            # 创建会话
            session = Session(
                session_id=str(uuid4()),
                user_id=user_id,
                script_id=script.script_id,
                status=SessionStatus.ACTIVE,
                current_position=ExecutionPosition(0, 0, 0),
                created_at=datetime.now(),
                last_active_at=datetime.now()
            )
            
            # 创建执行状态
            execution_state = ExecutionState(
                status=ExecutionStatus.RUNNING,
                variables=initial_variables or {}
            )
            
            # 缓存
            self.active_sessions[session.session_id] = session
            self.execution_states[session.session_id] = execution_state
            
            # 持久化（如果有存储层）
            if self.storage:
                await self.storage.save_session(session)
            
            return session
            
        except Exception as e:
            raise SessionError(f"Failed to create session: {str(e)}")
    
    async def process_user_input(self,
                                session_id: str,
                                user_input: str,
                                script: Script) -> Dict[str, Any]:
        """
        处理用户输入
        
        Args:
            session_id: 会话ID
            user_input: 用户输入
            script: 脚本对象
            
        Returns:
            Dict[str, Any]: 响应结果
                - ai_message: AI回复
                - session_status: 会话状态
                - variables: 当前变量
                - completed: 是否完成
        """
        try:
            # 获取会话和执行状态
            session = self.active_sessions.get(session_id)
            execution_state = self.execution_states.get(session_id)
            
            if not session or not execution_state:
                raise SessionError(f"Session not found: {session_id}")
            
            if session.status != SessionStatus.ACTIVE:
                raise SessionError(f"Session is not active: {session.status}")
            
            # 清空上一轮的 AI 消息
            execution_state.last_ai_message = None
            
            # 执行脚本
            if script.script_type == ScriptType.SESSION:
                execution_state = await self.script_executor.execute_session(
                    script,
                    session,
                    execution_state,
                    user_input
                )
            elif script.script_type == ScriptType.TECHNIQUE:
                execution_state = await self.script_executor.execute_technique(
                    script,
                    session,
                    execution_state,
                    user_input
                )
            else:
                raise SessionError(f"Unsupported script type: {script.script_type}")
            
            # 更新会话位置
            session.current_position = execution_state.get_position()
            session.last_active_at = datetime.now()
            
            # 检查是否完成
            if execution_state.status == ExecutionStatus.COMPLETED:
                session.complete()
            elif execution_state.status == ExecutionStatus.ERROR:
                session.interrupt(execution_state.metadata.get('error', 'Unknown error'))
            
            # 更新缓存
            self.execution_states[session_id] = execution_state
            
            # 持久化
            if self.storage:
                await self.storage.save_session(session)
                
                # 保存消息
                if user_input:
                    user_msg = Message(
                        session_id=session_id,
                        sender=MessageSender.USER,
                        content=user_input,
                        content_type=MessageContentType.TEXT
                    )
                    await self.storage.save_message(user_msg)
                
                # 获取最后一条AI消息
                if execution_state.conversation_history:
                    last_msg = execution_state.conversation_history[-1]
                    if last_msg.get('role') == 'assistant':
                        ai_msg = Message(
                            session_id=session_id,
                            sender=MessageSender.AI,
                            content=last_msg['content'],
                            content_type=MessageContentType.TEXT,
                            metadata=last_msg.get('metadata', {})
                        )
                        await self.storage.save_message(ai_msg)
            
            # 构建响应（使用 last_ai_message，即本轮最后一次生成的消息）
            ai_message = execution_state.last_ai_message
            
            return {
                'ai_message': ai_message,
                'session_status': session.status.value,
                'variables': execution_state.variables,
                'completed': execution_state.status == ExecutionStatus.COMPLETED,
                'waiting_for_input': execution_state.status == ExecutionStatus.WAITING_INPUT
            }
            
        except ScriptExecutionError as e:
            # 脚本执行错误
            raise SessionError(f"Script execution failed: {str(e)}")
        except Exception as e:
            raise SessionError(f"Failed to process user input: {str(e)}")
    
    async def pause_session(self, session_id: str) -> None:
        """
        暂停会话
        
        Args:
            session_id: 会话ID
        """
        session = self.active_sessions.get(session_id)
        if session:
            session.pause()
            if self.storage:
                await self.storage.save_session(session)
    
    async def resume_session(self, session_id: str) -> None:
        """
        恢复会话
        
        Args:
            session_id: 会话ID
        """
        session = self.active_sessions.get(session_id)
        if session:
            session.resume()
            if self.storage:
                await self.storage.save_session(session)
    
    async def complete_session(self, session_id: str) -> None:
        """
        完成会话
        
        Args:
            session_id: 会话ID
        """
        session = self.active_sessions.get(session_id)
        if session:
            session.complete()
            if self.storage:
                await self.storage.save_session(session)
            
            # 从活跃会话中移除
            del self.active_sessions[session_id]
            del self.execution_states[session_id]
    
    async def get_session(self, session_id: str) -> Optional[Session]:
        """
        获取会话
        
        Args:
            session_id: 会话ID
            
        Returns:
            Optional[Session]: 会话对象
        """
        # 先从缓存获取
        if session_id in self.active_sessions:
            return self.active_sessions[session_id]
        
        # 从存储获取
        if self.storage:
            session = await self.storage.get_session(session_id)
            if session:
                # 加载到缓存
                self.active_sessions[session_id] = session
                # TODO: 加载执行状态
            return session
        
        return None
    
    async def get_session_messages(self, session_id: str) -> List[Message]:
        """
        获取会话的所有消息
        
        Args:
            session_id: 会话ID
            
        Returns:
            List[Message]: 消息列表
        """
        if self.storage:
            return await self.storage.get_session_messages(session_id)
        return []
    
    async def get_session_variables(self, session_id: str) -> Dict[str, Any]:
        """
        获取会话的当前变量
        
        Args:
            session_id: 会话ID
            
        Returns:
            Dict[str, Any]: 变量字典
        """
        execution_state = self.execution_states.get(session_id)
        if execution_state:
            return execution_state.variables
        return {}
    
    async def list_user_sessions(self, user_id: str, 
                                status: Optional[SessionStatus] = None) -> List[Session]:
        """
        列出用户的会话
        
        Args:
            user_id: 用户ID
            status: 可选的状态过滤
            
        Returns:
            List[Session]: 会话列表
        """
        if self.storage:
            return await self.storage.list_user_sessions(user_id, status)
        
        # 从缓存筛选
        sessions = [
            s for s in self.active_sessions.values()
            if s.user_id == user_id and (status is None or s.status == status)
        ]
        return sessions
