"""
Action注册表
"""
from src.actions.ai_say import AiSayAction
from src.actions.ai_ask import AiAskAction
from src.actions.ai_think import AiThinkAction
from src.actions.use_skill import UseSkillAction


# Action类型注册表
ACTION_REGISTRY = {
    'ai_say': AiSayAction,
    'ai_ask': AiAskAction,
    'ai_think': AiThinkAction,
    'use_skill': UseSkillAction,
}


def register_action(action_type: str, action_class: type):
    """
    注册新的Action类型
    
    Args:
        action_type: Action类型名称
        action_class: Action类
    """
    ACTION_REGISTRY[action_type] = action_class


def get_action_class(action_type: str):
    """
    获取Action类
    
    Args:
        action_type: Action类型名称
        
    Returns:
        Action类，如果不存在返回None
    """
    return ACTION_REGISTRY.get(action_type)
