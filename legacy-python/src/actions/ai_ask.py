"""
ai_ask Action实现
向用户提问并提取答案
"""
from typing import Optional, Dict, Any
from src.actions.base import BaseAction, ActionContext, ActionResult


class AiAskAction(BaseAction):
    """
    AI向用户提问
    
    配置参数(兼容两种写法):
    - question / question_template: 问题内容（支持变量替换）
    - prompt_template: 提问内容模板（支持变量替换，优先级最高）
    - extract_to / target_variable: 提取答案到哪个变量
    - validation: 验证规则（字典，可选）
      - required: 是否必填
      - min_length: 最小长度
      - max_length: 最大长度
      - pattern: 正则表达式
    - required: 顶层必填标记（如果未提供validation时使用）
    - retry_message: 验证失败时的提示消息
    - follow_up_questions: 追问列表（可选）
    - extraction_prompt: 提取提示（暂存于metadata，后续可接入变量提取引擎）
    """
    
    action_type = "ai_ask"
    
    def __init__(self, action_id: str, config: Dict[str, Any]):
        super().__init__(action_id, config)
        self.max_rounds = config.get('max_rounds', 3)  # 最多重试3次
        self.extracted_value = None
    
    async def execute(self, context: ActionContext, 
                     user_input: Optional[str] = None) -> ActionResult:
        """
        执行ai_ask
        
        Args:
            context: 执行上下文
            user_input: 用户输入
            
        Returns:
            ActionResult: 执行结果
        """
        try:
            # 1. 选择问题模板（优先 prompt_template，其次 question_template，再次 question）
            question_template = self.config.get('prompt_template')
            if question_template is None:
                question_template = (
                    self.config.get('question_template')
                    or self.config.get('question', '')
                )
            
            # 2. 变量提取目标
            extract_to = (
                self.config.get('target_variable')
                or self.config.get('extract_to', '')
            )
            
            # 3. 校验配置：优先使用validation，没有则根据顶层字段构造
            validation = self.config.get('validation')
            if validation is None:
                validation = {}
                if 'required' in self.config:
                    validation['required'] = self.config['required']
                if 'min_length' in self.config:
                    validation['min_length'] = self.config['min_length']
                if 'max_length' in self.config:
                    validation['max_length'] = self.config['max_length']
                if 'pattern' in self.config:
                    validation['pattern'] = self.config['pattern']
            
            retry_message = self.config.get('retry_message', '请提供有效的回答。')
            extraction_prompt = self.config.get('extraction_prompt', '')
            
            # 第一轮：发送问题
            if self.current_round == 0:
                question = self.substitute_variables(question_template, context)
                self.current_round += 1
                
                return ActionResult(
                    success=True,
                    completed=False,  # 等待用户回答
                    ai_message=question,
                    metadata={
                        'action_type': self.action_type,
                        'waiting_for': 'answer',
                        'extract_to': extract_to,
                        'extraction_prompt': extraction_prompt
                    }
                )
            
            # 后续轮次：处理用户回答
            if user_input is None or user_input.strip() == '':
                # 用户没有提供输入
                if validation.get('required', True):
                    self.current_round += 1
                    
                    if self.is_completed():
                        # 达到最大重试次数
                        return ActionResult(
                            success=False,
                            completed=True,
                            error=f"Failed to get valid answer after {self.max_rounds} attempts"
                        )
                    
                    # 要求用户重新输入
                    return ActionResult(
                        success=True,
                        completed=False,
                        ai_message=retry_message,
                        metadata={
                            'action_type': self.action_type,
                            'validation_failed': True,
                            'retry_count': self.current_round - 1
                        }
                    )
            
            # 验证用户输入
            is_valid, error_msg = self._validate_input(user_input, validation)
            
            if not is_valid:
                self.current_round += 1
                
                if self.is_completed():
                    # 达到最大重试次数
                    return ActionResult(
                        success=False,
                        completed=True,
                        error=f"Failed to get valid answer: {error_msg}"
                    )
                
                # 验证失败，要求重新输入
                return ActionResult(
                    success=True,
                    completed=False,
                    ai_message=f"{retry_message} {error_msg}",
                    metadata={
                        'action_type': self.action_type,
                        'validation_failed': True,
                        'error': error_msg,
                        'retry_count': self.current_round - 1
                    }
                )
            
            # 验证成功，提取变量（目前直接用原始用户输入，后续可接变量提取引擎）
            extracted_variables = {}
            if extract_to:
                extracted_variables[extract_to] = user_input.strip()
            
            # 重置状态
            self.current_round = 0
            self.extracted_value = user_input.strip()
            
            return ActionResult(
                success=True,
                completed=True,
                ai_message=None,  # 不发送新消息
                extracted_variables=extracted_variables,
                metadata={
                    'action_type': self.action_type,
                    'answer_received': True,
                    'extract_to': extract_to,
                    'extraction_prompt': extraction_prompt
                }
            )
            
        except Exception as e:
            return ActionResult(
                success=False,
                completed=True,
                error=f"ai_ask execution error: {str(e)}"
            )
    
    def _validate_input(self, user_input: str, 
                       validation: Dict[str, Any]) -> tuple[bool, str]:
        """
        验证用户输入
        
        Returns:
            (is_valid, error_message)
        """
        if not validation:
            return True, ""
        
        # 检查是否为空
        if validation.get('required', True):
            if not user_input or user_input.strip() == '':
                return False, "回答不能为空。"
        
        # 检查长度
        if 'min_length' in validation:
            min_len = validation['min_length']
            if len(user_input) < min_len:
                return False, f"回答长度至少需要{min_len}个字符。"
        
        if 'max_length' in validation:
            max_len = validation['max_length']
            if len(user_input) > max_len:
                return False, f"回答长度不能超过{max_len}个字符。"
        
        # 检查正则表达式
        if 'pattern' in validation:
            import re
            pattern = validation['pattern']
            if not re.match(pattern, user_input):
                return False, "回答格式不正确。"
        
        return True, ""
