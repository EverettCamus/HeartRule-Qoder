"""
ai_say Action实现
向用户传达信息，不需要用户回应
"""
from typing import Optional
from src.actions.base import BaseAction, ActionContext, ActionResult


class AiSayAction(BaseAction):
    """
    AI向用户传达信息
    
    配置参数:
    - content: 要传达的内容（支持变量替换）
    - content_template: 要传达的内容（支持变量替换）
    - prompt_template: 最终要对用户展示的文本模板（支持变量替换，优先级最高）
    - require_acknowledgment: 是否需要用户确认（默认False）
    """
    
    action_type = "ai_say"
    
    async def execute(self, context: ActionContext, 
                     user_input: Optional[str] = None) -> ActionResult:
        """
        执行ai_say
        
        Args:
            context: 执行上下文
            user_input: 用户输入（如果需要确认）
            
        Returns:
            ActionResult: 执行结果
        """
        try:
            # 1. 选择原始模板（优先 prompt_template，其次 content_template，再次 content）
            raw_content = self.config.get('prompt_template')
            if raw_content is None:
                raw_content = self.config.get('content_template')
            if raw_content is None:
                raw_content = self.config.get('content', '')
            
            require_acknowledgment = self.config.get('require_acknowledgment', False)
            
            # 2. 变量替换
            content = self.substitute_variables(raw_content, context)
            
            # 如果不需要确认，直接完成
            if not require_acknowledgment:
                return ActionResult(
                    success=True,
                    completed=True,
                    ai_message=content,
                    metadata={
                        'action_type': self.action_type,
                        'require_acknowledgment': False
                    }
                )
            
            # 需要确认的情况
            if self.current_round == 0:
                # 第一轮：发送消息并等待确认
                self.current_round += 1
                return ActionResult(
                    success=True,
                    completed=False,  # 等待用户确认
                    ai_message=content,
                    metadata={
                        'action_type': self.action_type,
                        'require_acknowledgment': True,
                        'waiting_for': 'acknowledgment'
                    }
                )
            else:
                # 第二轮：用户已确认（无论用户说什么都算确认）
                self.current_round = 0  # 重置
                return ActionResult(
                    success=True,
                    completed=True,
                    ai_message=None,  # 不再发送新消息
                    metadata={
                        'action_type': self.action_type,
                        'user_acknowledged': True
                    }
                )
                
        except Exception as e:
            return ActionResult(
                success=False,
                completed=True,
                error=f"ai_say execution error: {str(e)}"
            )
