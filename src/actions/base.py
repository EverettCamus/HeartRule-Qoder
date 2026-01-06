"""
Action基类定义
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class ActionContext:
    """Action执行上下文"""
    session_id: str
    phase_id: str
    topic_id: str
    action_id: str
    variables: Dict[str, Any]  # 当前可用的变量
    conversation_history: list  # 对话历史
    metadata: Dict[str, Any]  # 额外元数据
    

@dataclass
class ActionResult:
    """Action执行结果"""
    success: bool
    completed: bool  # Action是否完成（可能需要多轮）
    ai_message: Optional[str] = None  # AI生成的消息
    extracted_variables: Optional[Dict[str, Any]] = None  # 提取的变量
    next_action: Optional[str] = None  # 下一个要执行的Action ID
    error: Optional[str] = None  # 错误信息
    metadata: Dict[str, Any] = None  # 额外元数据
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class BaseAction(ABC):
    """
    Action基类
    
    所有Action类型都需要继承此基类并实现execute方法。
    """
    
    action_type: str = "base"
    
    def __init__(self, action_id: str, config: Dict[str, Any]):
        """
        初始化Action
        
        Args:
            action_id: Action唯一标识
            config: Action配置参数
        """
        self.action_id = action_id
        self.config = config
        self.current_round = 0  # 当前轮次
        self.max_rounds = config.get('max_rounds', 5)  # 最大轮次
    
    @abstractmethod
    async def execute(self, context: ActionContext, 
                     user_input: Optional[str] = None) -> ActionResult:
        """
        执行Action
        
        Args:
            context: 执行上下文
            user_input: 用户输入（某些Action需要）
            
        Returns:
            ActionResult: 执行结果
        """
        pass
    
    def reset(self) -> None:
        """重置Action状态"""
        self.current_round = 0
    
    def is_completed(self) -> bool:
        """判断Action是否完成"""
        return self.current_round >= self.max_rounds
    
    def get_variable(self, context: ActionContext, var_name: str, 
                    default: Any = None) -> Any:
        """从上下文获取变量值"""
        return context.variables.get(var_name, default)
    
    def substitute_variables(self, template: str, 
                            context: ActionContext) -> str:
        """
        替换模板中的变量
        
        支持 ${variable_name} 格式
        """
        result = template
        for var_name, var_value in context.variables.items():
            placeholder = f"${{{var_name}}}"
            if placeholder in result:
                result = result.replace(placeholder, str(var_value))
        return result
