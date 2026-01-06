"""
ai_think Action实现
AI进行内部思考和分析，不向用户展示
"""
from typing import Optional, Dict, Any, List
from src.actions.base import BaseAction, ActionContext, ActionResult


class AiThinkAction(BaseAction):
    """
    AI内部思考
    
    配置参数:
    - prompt / prompt_template: 思考提示（支持变量替换）
      - 若为字符串：所有analysis_type共用
      - 若为字典：按analysis_type区分，例如：
        {
          "conceptualization": "...",
          "pattern_recognition": "...",
          "evaluation": "...",
          "planning": "...",
          "default": "..."  # 可选
        }
    - extract_variables: 要提取的变量列表
      - name: 变量名
      - description: 变量描述（用于LLM理解）
      - type: 变量类型（text, number, boolean, list）
    - output_variables: 仅给出变量名列表时使用，会自动转换为extract_variables
    - analysis_type: 分析类型
      - conceptualization: 概念化
      - pattern_recognition: 模式识别
      - evaluation: 评估
      - planning: 规划
    """
    
    action_type = "ai_think"
    
    async def execute(self, context: ActionContext, 
                     user_input: Optional[str] = None) -> ActionResult:
        """
        执行ai_think
        
        Args:
            context: 执行上下文
            user_input: 用户输入（通常不需要）
            
        Returns:
            ActionResult: 执行结果
        """
        try:
            # 分析类型
            analysis_type = self.config.get('analysis_type', 'conceptualization')
            
            # 输入/输出变量配置（用于后续变量提取）
            input_variables = self.config.get('input_variables', [])
            
            extract_variables_config = self.config.get('extract_variables')
            if not extract_variables_config:
                output_vars = self.config.get('output_variables', [])
                extract_variables_config = [
                    {'name': name, 'type': 'text'} for name in output_vars
                ]
            
            # 选择原始prompt（按analysis_type映射）
            raw_prompt = self._select_prompt_template(analysis_type)
            
            # 如果仍为空，构造一个简单的默认prompt
            if not raw_prompt:
                raw_prompt = self._build_default_prompt(analysis_type, input_variables)
            
            # 变量替换
            prompt = self.substitute_variables(raw_prompt, context)
            
            # TODO: 在LLM集成后，这里将调用LLM进行分析
            # 目前返回模拟结果
            
            # 模拟变量提取
            extracted_variables = {}
            for var_config in extract_variables_config:
                var_name = var_config['name']
                var_type = var_config.get('type', 'text')
                
                # 从对话历史或上下文中提取（简化实现）
                # 实际应该调用LLM或变量提取引擎
                extracted_variables[var_name] = self._mock_extract_variable(
                    var_name,
                    var_type,
                    context
                )
            
            # 思考完成
            return ActionResult(
                success=True,
                completed=True,
                ai_message=None,  # 思考不产生用户可见消息
                extracted_variables=extracted_variables,
                metadata={
                    'action_type': self.action_type,
                    'analysis_type': analysis_type,
                    'thought_prompt': prompt,
                    'variables_extracted': list(extracted_variables.keys())
                }
            )
            
        except Exception as e:
            return ActionResult(
                success=False,
                completed=True,
                error=f"ai_think execution error: {str(e)}"
            )
    
    def _select_prompt_template(self, analysis_type: str) -> str:
        """
        根据analysis_type选择prompt_template
        
        支持：
        - prompt_template为字符串：直接使用
        - prompt_template为字典：按analysis_type取对应模板，或使用"default"
        - 若无prompt_template，则退回prompt字段
        """
        prompt_tpl = self.config.get('prompt_template')
        
        if isinstance(prompt_tpl, dict):
            # 先按分析类型取，再退回default
            value = prompt_tpl.get(analysis_type) or prompt_tpl.get('default', '')
            if value:
                return value
        
        elif isinstance(prompt_tpl, str):
            return prompt_tpl
        
        # 没有prompt_template时，退回旧字段prompt
        return self.config.get('prompt', '')
    
    def _build_default_prompt(self, analysis_type: str, input_variables: list) -> str:
        """
        构造一个简易默认prompt，保证ai_think在未配置prompt时仍可工作
        """
        vars_str = ", ".join(input_variables) if input_variables else "（无显式输入变量）"
        return (
            f"[内部思考 - {analysis_type}] "
            f"请基于当前会谈上下文及输入变量({vars_str})进行分析，并给出相应的内部结论。"
        )
    
    def _mock_extract_variable(self, var_name: str, var_type: str, 
                              context: ActionContext) -> Any:
        """
        模拟变量提取（临时实现）
        实际应该调用LLM或变量提取引擎
        """
        # 从对话历史中查找相关信息
        conversation = context.conversation_history
        
        if var_type == 'boolean':
            return False
        elif var_type == 'number':
            return 0
        elif var_type == 'list':
            return []
        else:
            # text类型
            return f"[提取自对话: {var_name}]"
