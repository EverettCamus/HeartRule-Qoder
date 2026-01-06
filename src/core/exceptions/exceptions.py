"""
核心异常定义
"""


class HeartRuleException(Exception):
    """AI咨询引擎基础异常类"""
    pass


class ScriptException(HeartRuleException):
    """脚本相关异常"""
    pass


class ScriptNotFoundError(ScriptException):
    """脚本未找到"""
    pass


class ScriptParseError(ScriptException):
    """脚本解析错误"""
    pass


class ScriptValidationError(ScriptException):
    """脚本验证错误"""
    pass


class ScriptExecutionError(ScriptException):
    """脚本执行错误"""
    pass


class SessionException(HeartRuleException):
    """会话相关异常"""
    pass


class SessionNotFoundError(SessionException):
    """会话未找到"""
    pass


class SessionStateError(SessionException):
    """会话状态错误"""
    pass


class SessionError(SessionException):
    """会话通用错误"""
    pass


class ActionException(HeartRuleException):
    """Action执行异常"""
    pass


class ActionExecutionError(ActionException):
    """Action执行错误"""
    pass


class ActionTimeoutError(ActionException):
    """Action超时"""
    pass


class VariableException(HeartRuleException):
    """变量相关异常"""
    pass


class VariableNotFoundError(VariableException):
    """变量未找到"""
    pass


class VariableExtractionError(VariableException):
    """变量提取失败"""
    pass


class LLMException(HeartRuleException):
    """LLM相关异常"""
    pass


class LLMError(LLMException):
    """LLM通用错误"""
    pass


class LLMCallError(LLMException):
    """LLM调用错误"""
    pass


class LLMTimeoutError(LLMException):
    """LLM超时"""
    pass


class LLMResponseError(LLMException):
    """LLM响应解析错误"""
    pass


class StorageException(HeartRuleException):
    """存储相关异常"""
    pass


class StorageConnectionError(StorageException):
    """存储连接错误"""
    pass


class StorageOperationError(StorageException):
    """存储操作错误"""
    pass
