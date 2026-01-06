"""
LLM编排引擎
负责管理LLM调用和上下文
"""
from typing import List, Dict, Any, Optional
from enum import Enum

from src.engines.llm.base import (
    BaseLLMProvider, LLMMessage, LLMResponse, MessageRole
)
from src.core.exceptions.exceptions import LLMError


class PromptTemplate(str, Enum):
    """预定义的提示模板"""
    # 概念化分析
    CONCEPTUALIZATION = """你是一个专业的CBT心理咨询师。基于以下对话历史，请分析用户的心理状态和核心问题。

对话历史：
{conversation_history}

当前变量：
{variables}

请提取以下信息：
{extract_instructions}

请以结构化的方式回答，每个信息单独一行。"""
    
    # 生成回复
    GENERATE_RESPONSE = """你是一个专业的CBT心理咨询师。基于以下信息，生成一个合适的回复。

对话历史：
{conversation_history}

当前阶段：{phase}
当前话题：{topic}
指导说明：{instruction}

请生成一个自然、专业、有同理心的回复。"""
    
    # 变量提取
    EXTRACT_VARIABLE = """基于以下对话，请提取变量"{variable_name}"的值。

对话历史：
{conversation_history}

变量描述：{variable_description}
变量类型：{variable_type}

只返回提取的值，不要其他内容。"""


class LLMOrchestrator:
    """
    LLM编排引擎
    
    负责：
    1. 管理LLM提供者
    2. 构建和管理对话上下文
    3. 应用提示模板
    4. 处理LLM响应
    """
    
    def __init__(self, provider: BaseLLMProvider, 
                 system_prompt: Optional[str] = None):
        """
        初始化编排器
        
        Args:
            provider: LLM提供者
            system_prompt: 系统提示（可选）
        """
        self.provider = provider
        self.system_prompt = system_prompt or self._default_system_prompt()
        
    def _default_system_prompt(self) -> str:
        """默认系统提示"""
        return """你是一个专业的认知行为疗法（CBT）心理咨询师。

你的特点：
1. 具有深厚的CBT理论知识和丰富的临床经验
2. 善于倾听和共情，能够建立良好的咨访关系
3. 运用苏格拉底式提问引导来访者自我探索
4. 帮助来访者识别和挑战非理性信念
5. 注重实践，为来访者设计行为实验和家庭作业

你的原则：
1. 保持专业边界，不提供医疗诊断
2. 尊重来访者的自主性和选择
3. 关注当下问题和未来解决方案
4. 使用清晰、易懂的语言
5. 保持中立、不评判的态度"""
    
    async def generate_response(self, 
                              conversation_history: List[Dict[str, Any]],
                              instruction: str,
                              variables: Dict[str, Any],
                              phase: str = "",
                              topic: str = "") -> str:
        """
        生成AI回复
        
        Args:
            conversation_history: 对话历史
            instruction: 指导说明
            variables: 当前变量
            phase: 当前阶段
            topic: 当前话题
            
        Returns:
            str: 生成的回复
        """
        try:
            # 构建消息列表
            messages = [
                LLMMessage(role=MessageRole.SYSTEM, content=self.system_prompt)
            ]
            
            # 添加对话历史
            for msg in conversation_history[-10:]:  # 只取最近10条
                role = MessageRole.USER if msg['role'] == 'user' else MessageRole.ASSISTANT
                messages.append(LLMMessage(
                    role=role,
                    content=msg['content']
                ))
            
            # 构建用户指令
            prompt = self._format_prompt(
                PromptTemplate.GENERATE_RESPONSE,
                conversation_history=self._format_conversation(conversation_history),
                instruction=instruction,
                phase=phase,
                topic=topic
            )
            
            messages.append(LLMMessage(
                role=MessageRole.USER,
                content=prompt
            ))
            
            # 调用LLM
            response = await self.provider.chat(messages)
            
            return response.content.strip()
            
        except Exception as e:
            raise LLMError(f"Failed to generate response: {str(e)}")
    
    async def extract_variables(self,
                               conversation_history: List[Dict[str, Any]],
                               variable_configs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        从对话中提取变量
        
        Args:
            conversation_history: 对话历史
            variable_configs: 变量配置列表
                [{"name": "var1", "description": "...", "type": "text"}, ...]
            
        Returns:
            Dict[str, Any]: 提取的变量
        """
        extracted = {}
        
        for var_config in variable_configs:
            try:
                value = await self._extract_single_variable(
                    conversation_history,
                    var_config['name'],
                    var_config.get('description', ''),
                    var_config.get('type', 'text')
                )
                extracted[var_config['name']] = value
            except Exception as e:
                # 提取失败，使用默认值
                extracted[var_config['name']] = None
        
        return extracted
    
    async def _extract_single_variable(self,
                                      conversation_history: List[Dict[str, Any]],
                                      variable_name: str,
                                      variable_description: str,
                                      variable_type: str) -> Any:
        """提取单个变量"""
        # 构建提示
        prompt = self._format_prompt(
            PromptTemplate.EXTRACT_VARIABLE,
            conversation_history=self._format_conversation(conversation_history),
            variable_name=variable_name,
            variable_description=variable_description,
            variable_type=variable_type
        )
        
        messages = [
            LLMMessage(role=MessageRole.SYSTEM, content=self.system_prompt),
            LLMMessage(role=MessageRole.USER, content=prompt)
        ]
        
        # 调用LLM
        response = await self.provider.chat(messages)
        
        # 解析响应
        content = response.content.strip()
        
        # 根据类型转换
        if variable_type == 'boolean':
            return content.lower() in ('true', 'yes', '是', '对')
        elif variable_type == 'number':
            try:
                return float(content)
            except:
                return 0
        elif variable_type == 'list':
            # 简单按行分割
            return [line.strip() for line in content.split('\n') if line.strip()]
        else:
            return content
    
    async def conceptualize(self,
                          conversation_history: List[Dict[str, Any]],
                          variables: Dict[str, Any],
                          extract_instructions: str) -> str:
        """
        进行概念化分析
        
        Args:
            conversation_history: 对话历史
            variables: 当前变量
            extract_instructions: 提取指令
            
        Returns:
            str: 概念化分析结果
        """
        prompt = self._format_prompt(
            PromptTemplate.CONCEPTUALIZATION,
            conversation_history=self._format_conversation(conversation_history),
            variables=self._format_variables(variables),
            extract_instructions=extract_instructions
        )
        
        messages = [
            LLMMessage(role=MessageRole.SYSTEM, content=self.system_prompt),
            LLMMessage(role=MessageRole.USER, content=prompt)
        ]
        
        response = await self.provider.chat(messages)
        return response.content.strip()
    
    def _format_prompt(self, template: PromptTemplate, **kwargs) -> str:
        """格式化提示模板"""
        return template.value.format(**kwargs)
    
    def _format_conversation(self, conversation: List[Dict[str, Any]]) -> str:
        """格式化对话历史"""
        lines = []
        for msg in conversation[-10:]:  # 只取最近10条
            role = "用户" if msg['role'] == 'user' else "咨询师"
            lines.append(f"{role}: {msg['content']}")
        return "\n".join(lines)
    
    def _format_variables(self, variables: Dict[str, Any]) -> str:
        """格式化变量"""
        if not variables:
            return "（暂无变量）"
        
        lines = []
        for key, value in variables.items():
            lines.append(f"- {key}: {value}")
        return "\n".join(lines)
