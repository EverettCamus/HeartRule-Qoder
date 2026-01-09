"""
use_skill Action实现
调用咨询技术脚本
"""
from typing import Optional, Dict, Any
from src.actions.base import BaseAction, ActionContext, ActionResult


class UseSkillAction(BaseAction):
    """
    调用咨询技术
    
    配置参数:
    - technique_id: 技术脚本ID
    - technique_name: 技术名称
    - parameters: 传递给技术的参数（变量映射）
    - return_variables: 技术执行后返回的变量映射
    - prompt_template: 技术调用的提示模板
      - 若为字符串：作为开始执行时对用户的提示文本
      - 若为字典：
        {
          "start": "开始提示模板",
          "complete": "结束提示模板（可选）"
        }
      模板支持 ${var_name} 形式的变量替换
    """
    
    action_type = "use_skill"
    
    def __init__(self, action_id: str, config: Dict[str, Any]):
        super().__init__(action_id, config)
        self.technique_execution_state = None
    
    async def execute(self, context: ActionContext, 
                     user_input: Optional[str] = None) -> ActionResult:
        """
        执行use_skill
        
        Args:
            context: 执行上下文
            user_input: 用户输入（传递给技术脚本）
            
        Returns:
            ActionResult: 执行结果
        """
        try:
            # 获取配置
            technique_id = self.config.get('technique_id', '')
            technique_name = self.config.get('technique_name', '')
            parameters = self.config.get('parameters', {})
            return_variables = self.config.get('return_variables', {})
            prompt_tpl = self.config.get('prompt_template')
            
            # TODO: 在后续实现中，这里应该：
            # 1. 加载技术脚本
            # 2. 创建技术执行状态
            # 3. 执行技术脚本的Topic
            # 4. 映射返回变量
            
            # 目前返回模拟结果
            if self.current_round == 0:
                # 第一轮：开始执行技术
                self.current_round += 1
                
                # 选择开始提示模板
                if isinstance(prompt_tpl, dict):
                    raw_start = prompt_tpl.get('start')
                else:
                    raw_start = prompt_tpl if isinstance(prompt_tpl, str) else None
                
                if not raw_start:
                    raw_start = f"[正在使用技术: {technique_name}]"
                
                start_message = self.substitute_variables(raw_start, context)
                
                return ActionResult(
                    success=True,
                    completed=False,  # 技术可能需要多轮交互
                    ai_message=start_message,
                    metadata={
                        'action_type': self.action_type,
                        'technique_id': technique_id,
                        'technique_name': technique_name,
                        'status': 'started'
                    }
                )
            else:
                # 后续轮次：技术执行完成（简化实现）
                self.current_round = 0
                
                # 模拟返回变量
                extracted_variables = {}
                for return_var, source_var in return_variables.items():
                    extracted_variables[return_var] = f"[来自技术 {technique_name}]"
                
                # 选择结束提示模板（如果提供）
                complete_message = None
                if isinstance(prompt_tpl, dict):
                    raw_complete = prompt_tpl.get('complete')
                    if raw_complete:
                        complete_message = self.substitute_variables(raw_complete, context)
                
                return ActionResult(
                    success=True,
                    completed=True,
                    ai_message=complete_message,
                    extracted_variables=extracted_variables,
                    metadata={
                        'action_type': self.action_type,
                        'technique_id': technique_id,
                        'technique_name': technique_name,
                        'status': 'completed'
                    }
                )
            
        except Exception as e:
            return ActionResult(
                success=False,
                completed=True,
                error=f"use_skill execution error: {str(e)}"
            )
