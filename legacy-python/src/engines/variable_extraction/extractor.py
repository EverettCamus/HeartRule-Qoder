"""
变量提取引擎
"""
from typing import Dict, Any, List, Optional
import re
from datetime import datetime

from src.core.domain.variable import VariableState, VariableScope, VariableUpdateMode
from src.engines.llm.orchestrator import LLMOrchestrator


class VariableExtractor:
    """
    变量提取引擎
    
    负责从对话中提取和更新变量
    """
    
    def __init__(self, llm_orchestrator: Optional[LLMOrchestrator] = None):
        """
        初始化变量提取器
        
        Args:
            llm_orchestrator: LLM编排器（用于智能提取）
        """
        self.llm_orchestrator = llm_orchestrator
    
    async def extract(self,
                     user_input: str,
                     conversation_history: List[Dict[str, Any]],
                     variable_configs: List[Dict[str, Any]],
                     current_variables: Dict[str, VariableState]) -> Dict[str, Any]:
        """
        从用户输入中提取变量
        
        Args:
            user_input: 用户输入
            conversation_history: 对话历史
            variable_configs: 变量配置列表
            current_variables: 当前变量状态
            
        Returns:
            Dict[str, Any]: 提取的变量值
        """
        extracted = {}
        
        for var_config in variable_configs:
            var_name = var_config['name']
            var_type = var_config.get('type', 'text')
            extraction_method = var_config.get('extraction_method', 'direct')
            
            # 根据提取方法选择策略
            if extraction_method == 'direct':
                # 直接提取（用户输入就是值）
                value = self._extract_direct(user_input, var_type)
            elif extraction_method == 'pattern':
                # 正则匹配
                pattern = var_config.get('pattern', '')
                value = self._extract_pattern(user_input, pattern, var_type)
            elif extraction_method == 'llm':
                # 使用LLM智能提取
                if self.llm_orchestrator:
                    value = await self._extract_llm(
                        user_input,
                        conversation_history,
                        var_config
                    )
                else:
                    value = self._extract_direct(user_input, var_type)
            else:
                value = self._extract_direct(user_input, var_type)
            
            if value is not None:
                extracted[var_name] = value
        
        return extracted
    
    def _extract_direct(self, user_input: str, var_type: str) -> Any:
        """直接提取"""
        if var_type == 'text':
            return user_input.strip()
        elif var_type == 'number':
            # 尝试提取数字
            numbers = re.findall(r'-?\d+\.?\d*', user_input)
            return float(numbers[0]) if numbers else None
        elif var_type == 'boolean':
            # 判断是否为肯定回答
            positive = ['是', '对', '嗯', 'yes', 'yeah', 'ok', '好', '确实']
            return any(word in user_input.lower() for word in positive)
        elif var_type == 'list':
            # 按逗号或顿号分割
            items = re.split(r'[,，、]', user_input)
            return [item.strip() for item in items if item.strip()]
        else:
            return user_input.strip()
    
    def _extract_pattern(self, user_input: str, pattern: str, 
                        var_type: str) -> Optional[Any]:
        """正则匹配提取"""
        match = re.search(pattern, user_input)
        if match:
            value = match.group(1) if match.groups() else match.group(0)
            return self._convert_type(value, var_type)
        return None
    
    async def _extract_llm(self,
                          user_input: str,
                          conversation_history: List[Dict[str, Any]],
                          var_config: Dict[str, Any]) -> Any:
        """使用LLM提取"""
        result = await self.llm_orchestrator.extract_variables(
            conversation_history + [{'role': 'user', 'content': user_input}],
            [var_config]
        )
        return result.get(var_config['name'])
    
    def _convert_type(self, value: str, var_type: str) -> Any:
        """类型转换"""
        try:
            if var_type == 'number':
                return float(value)
            elif var_type == 'boolean':
                return value.lower() in ('true', 'yes', '1', '是', '对')
            elif var_type == 'list':
                return [v.strip() for v in value.split(',')]
            else:
                return value
        except:
            return value
    
    def update_variables(self,
                        current_variables: Dict[str, VariableState],
                        new_values: Dict[str, Any],
                        source: str) -> Dict[str, VariableState]:
        """
        更新变量
        
        Args:
            current_variables: 当前变量状态
            new_values: 新值
            source: 来源（action_id等）
            
        Returns:
            Dict[str, VariableState]: 更新后的变量状态
        """
        updated = current_variables.copy()
        
        for var_name, new_value in new_values.items():
            if var_name in updated:
                # 更新现有变量
                var_state = updated[var_name]
                var_state.update_value(new_value, source)
            else:
                # 创建新变量（默认为SESSION作用域）
                updated[var_name] = VariableState(
                    variable_id=var_name,
                    variable_name=var_name,
                    scope=VariableScope.SESSION,
                    value=new_value,
                    value_type=self._infer_type(new_value),
                    update_mode=VariableUpdateMode.OVERWRITE,
                    source=source
                )
        
        return updated
    
    def _infer_type(self, value: Any) -> str:
        """推断值类型"""
        if isinstance(value, bool):
            return 'boolean'
        elif isinstance(value, (int, float)):
            return 'number'
        elif isinstance(value, list):
            return 'list'
        elif isinstance(value, dict):
            return 'object'
        else:
            return 'text'
    
    def get_variables_by_scope(self,
                              variables: Dict[str, VariableState],
                              scope: VariableScope) -> Dict[str, Any]:
        """
        获取指定作用域的变量
        
        Args:
            variables: 变量状态字典
            scope: 作用域
            
        Returns:
            Dict[str, Any]: 变量值字典
        """
        return {
            name: var.value
            for name, var in variables.items()
            if var.scope == scope
        }
    
    def filter_variables_for_context(self,
                                     variables: Dict[str, VariableState],
                                     current_scope: VariableScope) -> Dict[str, Any]:
        """
        筛选当前上下文可用的变量
        
        根据作用域规则，返回当前上下文中可访问的变量
        
        Args:
            variables: 所有变量
            current_scope: 当前作用域
            
        Returns:
            Dict[str, Any]: 可访问的变量
        """
        scope_hierarchy = {
            VariableScope.GLOBAL: 0,
            VariableScope.SESSION: 1,
            VariableScope.PHASE: 2,
            VariableScope.TOPIC: 3
        }
        
        current_level = scope_hierarchy[current_scope]
        
        accessible = {}
        for name, var in variables.items():
            var_level = scope_hierarchy[var.scope]
            # 只有当前作用域及更高级别的变量可访问
            if var_level <= current_level:
                accessible[name] = var.value
        
        return accessible
