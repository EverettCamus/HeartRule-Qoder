"""
脚本执行引擎核心执行器
"""
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from enum import Enum

from src.core.domain.script import Script, ScriptType
from src.core.domain.session import Session, ExecutionPosition
from src.core.exceptions.exceptions import ScriptExecutionError
from src.actions.base import BaseAction, ActionContext, ActionResult
from src.utils.yaml_parser import YAMLParser


class ExecutionStatus(str, Enum):
    """执行状态"""
    RUNNING = "running"
    WAITING_INPUT = "waiting_input"  # 等待用户输入
    PAUSED = "paused"
    COMPLETED = "completed"
    ERROR = "error"


@dataclass
class ExecutionState:
    """执行状态"""
    status: ExecutionStatus = ExecutionStatus.RUNNING
    current_phase_idx: int = 0
    current_topic_idx: int = 0
    current_action_idx: int = 0
    current_action: Optional[BaseAction] = None
    variables: Dict[str, Any] = field(default_factory=dict)
    conversation_history: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    last_ai_message: Optional[str] = None  # 最后一次生成的 AI 消息
    
    def get_position(self) -> ExecutionPosition:
        """获取当前执行位置"""
        return ExecutionPosition(
            phase_index=self.current_phase_idx,
            topic_index=self.current_topic_idx,
            action_index=self.current_action_idx
        )


class ScriptExecutor:
    """
    脚本执行引擎
    
    负责执行YAML脚本，编排Phase、Topic、Action的执行流程。
    """
    
    def __init__(self, action_registry: Dict[str, type]):
        """
        初始化执行器
        
        Args:
            action_registry: Action类型注册表 {action_type: ActionClass}
        """
        self.action_registry = action_registry
        self.parser = YAMLParser()
        
    async def execute_session(self, 
                             script: Script,
                             session: Session,
                             execution_state: ExecutionState,
                             user_input: Optional[str] = None) -> ExecutionState:
        """
        执行会谈流程脚本
        
        Args:
            script: 脚本对象
            session: 会话对象
            execution_state: 执行状态
            user_input: 用户输入（如果需要）
            
        Returns:
            ExecutionState: 更新后的执行状态
        """
        try:
            # 解析脚本
            if script.get_parsed_content() is None:
                parsed = self.parser.parse_string(script.script_content)
                self.parser.validate_session_script(parsed)
                script.set_parsed_content(parsed)
            
            parsed = script.get_parsed_content()
            session_data = parsed['session']
            phases = session_data['phases']
            
            # 如果有当前Action正在执行，继续执行
            if execution_state.current_action is not None:
                result = await self._continue_action(
                    execution_state.current_action,
                    execution_state,
                    session,
                    user_input
                )
                
                if not result.completed:
                    # Action未完成，继续等待
                    execution_state.status = ExecutionStatus.WAITING_INPUT
                    return execution_state
                
                # Action完成，处理结果
                if result.success:
                    # 更新变量
                    if result.extracted_variables:
                        execution_state.variables.update(result.extracted_variables)
                    
                    # 添加AI消息到对话历史
                    if result.ai_message:
                        execution_state.conversation_history.append({
                            'role': 'assistant',
                            'content': result.ai_message,
                            'action_id': execution_state.current_action.action_id,
                            'metadata': result.metadata
                        })
                        execution_state.last_ai_message = result.ai_message
                else:
                    # Action执行失败
                    execution_state.status = ExecutionStatus.ERROR
                    execution_state.metadata['error'] = result.error
                    return execution_state
                
                # 继续下一个
                execution_state.current_action = None
                execution_state.current_action_idx += 1
            
            # 执行脚本流程
            while execution_state.current_phase_idx < len(phases):
                phase = phases[execution_state.current_phase_idx]
                
                # 执行Phase
                state = await self._execute_phase(
                    phase,
                    session,
                    execution_state,
                    user_input
                )
                
                if state.status == ExecutionStatus.WAITING_INPUT:
                    return state
                
                # Phase完成，进入下一个
                execution_state.current_phase_idx += 1
                execution_state.current_topic_idx = 0
                execution_state.current_action_idx = 0
            
            # 所有Phase执行完成
            execution_state.status = ExecutionStatus.COMPLETED
            return execution_state
            
        except Exception as e:
            execution_state.status = ExecutionStatus.ERROR
            execution_state.metadata['error'] = str(e)
            raise ScriptExecutionError(f"Script execution failed: {e}")
    
    async def _execute_phase(self,
                            phase: Dict[str, Any],
                            session: Session,
                            execution_state: ExecutionState,
                            user_input: Optional[str] = None) -> ExecutionState:
        """执行Phase"""
        phase_id = phase['phase_id']
        topics = phase['topics']
        
        # 检查Phase进入条件
        if 'entry_condition' in phase:
            if not self._check_condition(phase['entry_condition'], execution_state.variables):
                # 条件不满足，跳过此Phase
                execution_state.current_phase_idx += 1
                execution_state.current_topic_idx = 0
                execution_state.current_action_idx = 0
                return execution_state
        
        # 执行Topics
        while execution_state.current_topic_idx < len(topics):
            topic = topics[execution_state.current_topic_idx]
            
            state = await self._execute_topic(
                topic,
                phase_id,
                session,
                execution_state,
                user_input
            )
            
            if state.status == ExecutionStatus.WAITING_INPUT:
                return state
            
            # Topic完成，进入下一个
            execution_state.current_topic_idx += 1
            execution_state.current_action_idx = 0
        
        return execution_state
    
    async def _execute_topic(self,
                            topic: Dict[str, Any],
                            phase_id: str,
                            session: Session,
                            execution_state: ExecutionState,
                            user_input: Optional[str] = None) -> ExecutionState:
        """执行Topic"""
        topic_id = topic['topic_id']
        actions = topic['actions']
        
        # 执行Actions
        while execution_state.current_action_idx < len(actions):
            action_config = actions[execution_state.current_action_idx]
            
            # 创建或获取Action实例
            if execution_state.current_action is None:
                action = self._create_action(action_config)
                execution_state.current_action = action
            else:
                action = execution_state.current_action
            
            # 执行Action
            result = await self._execute_action(
                action,
                phase_id,
                topic_id,
                session,
                execution_state,
                user_input
            )
            
            # user_input 只用一次，后续 Actions 应该用 None
            user_input = None
            
            # 处理执行结果
            if not result.completed:
                # Action未完成，但可能有 AI 消息（如 ai_ask 的问题）
                if result.ai_message:
                    execution_state.last_ai_message = result.ai_message
                    # 也添加到对话历史
                    execution_state.conversation_history.append({
                        'role': 'assistant',
                        'content': result.ai_message,
                        'action_id': action.action_id,
                        'metadata': result.metadata
                    })
                # 需要等待用户输入
                execution_state.status = ExecutionStatus.WAITING_INPUT
                return execution_state
            
            # Action完成，处理结果
            if result.success:
                # 更新变量
                if result.extracted_variables:
                    execution_state.variables.update(result.extracted_variables)
                
                # 添加到对话历史
                if result.ai_message:
                    execution_state.conversation_history.append({
                        'role': 'assistant',
                        'content': result.ai_message,
                        'action_id': action.action_id,
                        'metadata': result.metadata
                    })
                    # 更新最后一次 AI 消息
                    execution_state.last_ai_message = result.ai_message
                
                # 检查是否需要跳转
                if result.next_action:
                    # 查找目标Action
                    next_idx = self._find_action_index(actions, result.next_action)
                    if next_idx >= 0:
                        execution_state.current_action_idx = next_idx
                        execution_state.current_action = None
                        continue
            else:
                # Action执行失败
                execution_state.status = ExecutionStatus.ERROR
                execution_state.metadata['error'] = result.error
                return execution_state
            
            # 移动到下一个Action
            execution_state.current_action = None
            execution_state.current_action_idx += 1
        
        # Topic 所有 Actions 已执行完成，设置为 RUNNING 以便继续下一个 Topic
        execution_state.status = ExecutionStatus.RUNNING
        return execution_state
    
    async def _execute_action(self,
                             action: BaseAction,
                             phase_id: str,
                             topic_id: str,
                             session: Session,
                             execution_state: ExecutionState,
                             user_input: Optional[str] = None) -> ActionResult:
        """执行Action"""
        # 构建执行上下文
        context = ActionContext(
            session_id=session.session_id,
            phase_id=phase_id,
            topic_id=topic_id,
            action_id=action.action_id,
            variables=execution_state.variables.copy(),
            conversation_history=execution_state.conversation_history.copy(),
            metadata=execution_state.metadata.copy()
        )
        
        # 执行Action
        result = await action.execute(context, user_input)
        
        return result
    
    async def _continue_action(self,
                              action: BaseAction,
                              execution_state: ExecutionState,
                              session: Session,
                              user_input: Optional[str] = None) -> ActionResult:
        """继续执行未完成的Action"""
        # 构建执行上下文
        context = ActionContext(
            session_id=session.session_id,
            phase_id=f"phase_{execution_state.current_phase_idx}",
            topic_id=f"topic_{execution_state.current_topic_idx}",
            action_id=action.action_id,
            variables=execution_state.variables.copy(),
            conversation_history=execution_state.conversation_history.copy(),
            metadata=execution_state.metadata.copy()
        )
        
        # 继续执行
        result = await action.execute(context, user_input)
        
        # 更新对话历史（用户输入）
        if user_input:
            execution_state.conversation_history.append({
                'role': 'user',
                'content': user_input,
                'action_id': action.action_id
            })
        
        return result
    
    def _create_action(self, action_config: Dict[str, Any]) -> BaseAction:
        """创建Action实例"""
        action_type = action_config['action_type']
        action_id = action_config['action_id']
        config = action_config.get('config', {})  # 只传递 config 部分
        
        if action_type not in self.action_registry:
            raise ScriptExecutionError(f"Unknown action type: {action_type}")
        
        action_class = self.action_registry[action_type]
        action = action_class(action_id, config)  # 传递 config 而不是 action_config
        
        return action
    
    def _check_condition(self, condition: Dict[str, Any], 
                        variables: Dict[str, Any]) -> bool:
        """检查条件是否满足"""
        # 简单实现：检查变量是否存在且为True
        if 'variable' in condition:
            var_name = condition['variable']
            expected = condition.get('value', True)
            actual = variables.get(var_name)
            return actual == expected
        
        return True
    
    def _find_action_index(self, actions: List[Dict[str, Any]], 
                          action_id: str) -> int:
        """查找Action在列表中的索引"""
        for idx, action in enumerate(actions):
            if action['action_id'] == action_id:
                return idx
        return -1
    
    async def execute_technique(self,
                               script: Script,
                               session: Session,
                               execution_state: ExecutionState,
                               user_input: Optional[str] = None) -> ExecutionState:
        """
        执行咨询技术脚本
        
        Args:
            script: 技术脚本对象
            session: 会话对象
            execution_state: 执行状态
            user_input: 用户输入
            
        Returns:
            ExecutionState: 更新后的执行状态
        """
        try:
            # 解析脚本
            if script.get_parsed_content() is None:
                parsed = self.parser.parse_string(script.script_content)
                self.parser.validate_technique_script(parsed)
                script.set_parsed_content(parsed)
            
            parsed = script.get_parsed_content()
            topic = parsed['topic']
            
            # 执行Topic（技术脚本只有一个Topic）
            state = await self._execute_topic(
                topic,
                "technique",
                session,
                execution_state,
                user_input
            )
            
            if state.status == ExecutionStatus.RUNNING:
                state.status = ExecutionStatus.COMPLETED
            
            return state
            
        except Exception as e:
            execution_state.status = ExecutionStatus.ERROR
            execution_state.metadata['error'] = str(e)
            raise ScriptExecutionError(f"Technique execution failed: {e}")
