"""
YAML脚本解析器
"""
import yaml
from typing import Dict, Any, Optional
from pathlib import Path

from src.core.exceptions.exceptions import ScriptParseError, ScriptValidationError


class YAMLParser:
    """YAML脚本解析器"""
    
    @staticmethod
    def parse_file(file_path: str) -> Dict[str, Any]:
        """
        解析YAML文件
        
        Args:
            file_path: YAML文件路径
            
        Returns:
            解析后的字典
            
        Raises:
            ScriptParseError: 解析失败
        """
        try:
            path = Path(file_path)
            if not path.exists():
                raise ScriptParseError(f"Script file not found: {file_path}")
            
            with open(path, 'r', encoding='utf-8') as f:
                content = yaml.safe_load(f)
                
            if content is None:
                raise ScriptParseError(f"Empty script file: {file_path}")
                
            return content
            
        except yaml.YAMLError as e:
            raise ScriptParseError(f"Failed to parse YAML: {e}")
        except Exception as e:
            raise ScriptParseError(f"Error reading script file: {e}")
    
    @staticmethod
    def parse_string(yaml_content: str) -> Dict[str, Any]:
        """
        解析YAML字符串
        
        Args:
            yaml_content: YAML内容字符串
            
        Returns:
            解析后的字典
            
        Raises:
            ScriptParseError: 解析失败
        """
        try:
            content = yaml.safe_load(yaml_content)
            if content is None:
                raise ScriptParseError("Empty YAML content")
            return content
        except yaml.YAMLError as e:
            raise ScriptParseError(f"Failed to parse YAML: {e}")
    
    @staticmethod
    def validate_session_script(parsed: Dict[str, Any]) -> None:
        """
        验证会谈流程脚本结构
        
        Args:
            parsed: 解析后的脚本内容
            
        Raises:
            ScriptValidationError: 验证失败
        """
        # 检查必需的顶层字段
        if 'session' not in parsed:
            raise ScriptValidationError("Missing required field: session")
        
        session = parsed['session']
        
        # 检查session必需字段
        required_fields = ['session_id', 'session_name', 'phases']
        for field in required_fields:
            if field not in session:
                raise ScriptValidationError(f"Missing required field in session: {field}")
        
        # 检查phases
        phases = session['phases']
        if not isinstance(phases, list) or len(phases) == 0:
            raise ScriptValidationError("Session must have at least one phase")
        
        # 验证每个phase
        for idx, phase in enumerate(phases):
            YAMLParser._validate_phase(phase, idx)
    
    @staticmethod
    def _validate_phase(phase: Dict[str, Any], phase_idx: int) -> None:
        """验证Phase结构"""
        required_fields = ['phase_id', 'phase_name', 'topics']
        for field in required_fields:
            if field not in phase:
                raise ScriptValidationError(
                    f"Missing required field in phase[{phase_idx}]: {field}"
                )
        
        # 检查topics
        topics = phase['topics']
        if not isinstance(topics, list) or len(topics) == 0:
            raise ScriptValidationError(f"Phase[{phase_idx}] must have at least one topic")
        
        # 验证每个topic
        for topic_idx, topic in enumerate(topics):
            YAMLParser._validate_topic(topic, phase_idx, topic_idx)
    
    @staticmethod
    def _validate_topic(topic: Dict[str, Any], phase_idx: int, topic_idx: int) -> None:
        """验证Topic结构"""
        required_fields = ['topic_id', 'topic_name', 'actions']
        for field in required_fields:
            if field not in topic:
                raise ScriptValidationError(
                    f"Missing required field in phase[{phase_idx}].topic[{topic_idx}]: {field}"
                )
        
        # 检查actions
        actions = topic['actions']
        if not isinstance(actions, list) or len(actions) == 0:
            raise ScriptValidationError(
                f"Topic[{phase_idx}.{topic_idx}] must have at least one action"
            )
        
        # 验证每个action
        for action_idx, action in enumerate(actions):
            YAMLParser._validate_action(action, phase_idx, topic_idx, action_idx)
    
    @staticmethod
    def _validate_action(action: Dict[str, Any], phase_idx: int, 
                        topic_idx: int, action_idx: int) -> None:
        """验证Action结构"""
        required_fields = ['action_type', 'action_id']
        for field in required_fields:
            if field not in action:
                raise ScriptValidationError(
                    f"Missing required field in action[{phase_idx}.{topic_idx}.{action_idx}]: {field}"
                )
        
        # 验证action_type
        valid_action_types = ['ai_say', 'ai_ask', 'ai_think', 'use_skill', 
                             'set_var', 'ai_guide', 'show_form', 'show_pic', 
                             'ai_pic', 'parallel_actions']
        if action['action_type'] not in valid_action_types:
            raise ScriptValidationError(
                f"Invalid action_type in action[{phase_idx}.{topic_idx}.{action_idx}]: "
                f"{action['action_type']}"
            )
    
    @staticmethod
    def validate_technique_script(parsed: Dict[str, Any]) -> None:
        """
        验证咨询技术脚本结构
        
        Args:
            parsed: 解析后的脚本内容
            
        Raises:
            ScriptValidationError: 验证失败
        """
        # 检查必需字段
        required_fields = ['technique_id', 'technique_name', 'topic']
        for field in required_fields:
            if field not in parsed:
                raise ScriptValidationError(f"Missing required field: {field}")
        
        # 验证topic
        topic = parsed['topic']
        if not isinstance(topic, dict):
            raise ScriptValidationError("technique.topic must be a dictionary")
        
        YAMLParser._validate_topic(topic, 0, 0)
