"""
FastAPI应用主入口
"""
import sys
from pathlib import Path

# 将项目根目录添加到Python路径
# legacy-python/src/api/main.py -> legacy-python/src/ -> legacy-python/ -> 根目录
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "legacy-python"))

# 加载环境变量
from dotenv import load_dotenv
load_dotenv(project_root / ".env")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Dict, Any
import uvicorn
import os
import yaml

from src.services.session_manager import SessionManager
from src.engines.script_execution.executor import ScriptExecutor
from src.engines.llm.mock_provider import MockLLMProvider
from src.engines.llm.openai_provider import OpenAIProvider
from src.engines.llm.volcano_deepseek_provider import VolcanoDeepSeekProvider
from src.engines.llm.base import LLMConfig
from src.engines.llm.orchestrator import LLMOrchestrator
from src.infrastructure.storage.sqlite_storage import SQLiteStorage
from src.actions.registry import ACTION_REGISTRY
from src.core.domain.script import Script, ScriptType, ScriptStatus

# 初始化应用
app = FastAPI(
    title="CBT AI咨询引擎",
    description="基于LLM和YAML脚本的认知行为疗法AI咨询系统",
    version="1.0.0"
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 加载配置
def load_config() -> Dict[str, Any]:
    """加载配置文件"""
    config_path = project_root / "config" / "dev.yaml"
    with open(config_path, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)
    
    # 替换环境变量
    def replace_env_vars(obj):
        if isinstance(obj, dict):
            return {k: replace_env_vars(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [replace_env_vars(item) for item in obj]
        elif isinstance(obj, str) and obj.startswith("${") and obj.endswith("}"):
            env_var = obj[2:-1]
            return os.getenv(env_var, "")
        return obj
    
    return replace_env_vars(config)

config = load_config()
llm_config = config.get('llm', {})

# 创建 LLM 提供者
def create_llm_provider():
    """根据配置创建 LLM 提供者"""
    provider_type = llm_config.get('provider', 'mock')
    
    # 创建 LLMConfig
    base_config = LLMConfig(
        model=llm_config.get('model', 'gpt-3.5-turbo'),
        temperature=llm_config.get('temperature', 0.7),
        max_tokens=llm_config.get('max_tokens', 2000),
        top_p=llm_config.get('top_p', 1.0),
        frequency_penalty=llm_config.get('frequency_penalty', 0.0),
        presence_penalty=llm_config.get('presence_penalty', 0.0),
        timeout=llm_config.get('timeout', 60)
    )
    
    if provider_type == 'mock':
        print("Using Mock LLM Provider")
        return MockLLMProvider(base_config)
    
    elif provider_type == 'openai':
        api_key = llm_config.get('api_key', '')
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set")
        print("Using OpenAI LLM Provider")
        return OpenAIProvider(
            config=base_config,
            api_key=api_key,
            base_url=None
        )
    
    elif provider_type == 'volcano_deepseek':
        volcano_config = llm_config.get('volcano', {})
        api_key = volcano_config.get('api_key', '')
        endpoint_id = volcano_config.get('endpoint_id', '')
        base_url = volcano_config.get('base_url', 'https://ark.cn-beijing.volces.com/api/v3')
        
        if not api_key:
            raise ValueError("VOLCANO_API_KEY not set")
        if not endpoint_id:
            raise ValueError("VOLCANO_ENDPOINT_ID not set")
        
        print(f"Using Volcano DeepSeek LLM Provider (endpoint: {endpoint_id})")
        
        # 使用端点 ID 作为模型名称
        base_config.model = endpoint_id
        
        return VolcanoDeepSeekProvider(
            config=base_config,
            api_key=api_key,
            endpoint_id=endpoint_id,
            base_url=base_url
        )
    
    else:
        raise ValueError(f"Unknown LLM provider type: {provider_type}")

# 初始化组件
storage = SQLiteStorage(str(project_root / "data" / "cbt_engine.db"))
llm_provider = create_llm_provider()
llm_orchestrator = LLMOrchestrator(llm_provider)
script_executor = ScriptExecutor(ACTION_REGISTRY)
session_manager = SessionManager(script_executor, storage)

# 请求模型
class CreateSessionRequest(BaseModel):
    user_id: str
    script_id: str
    initial_variables: Optional[Dict[str, Any]] = None

class SendMessageRequest(BaseModel):
    session_id: str
    script_id: str
    message: str

class CreateScriptRequest(BaseModel):
    script_name: str
    script_type: str
    script_content: str
    author: str
    description: Optional[str] = ""

# ==================== API端点 ====================

@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "CBT AI咨询引擎 API",
        "version": "1.0.0",
        "docs": "/docs"
    }

@app.post("/api/sessions")
async def create_session(request: CreateSessionRequest):
    """创建新会话"""
    try:
        # 加载脚本
        script = await storage.get_script(request.script_id)
        if not script:
            raise HTTPException(status_code=404, detail="Script not found")
        
        # 创建会话
        session = await session_manager.create_session(
            user_id=request.user_id,
            script=script,
            initial_variables=request.initial_variables
        )
        
        return {
            "session_id": session.session_id,
            "status": session.status.value,
            "created_at": session.created_at.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def send_message(request: SendMessageRequest):
    """发送消息"""
    try:
        # 加载脚本
        script = await storage.get_script(request.script_id)
        if not script:
            raise HTTPException(status_code=404, detail="Script not found")
        
        # 处理用户输入
        result = await session_manager.process_user_input(
            session_id=request.session_id,
            user_input=request.message,
            script=script
        )
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """获取会话信息"""
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return session.to_dict()

@app.get("/api/sessions/{session_id}/messages")
async def get_session_messages(session_id: str):
    """获取会话消息"""
    messages = await session_manager.get_session_messages(session_id)
    return [msg.to_dict() for msg in messages]

@app.get("/api/sessions/{session_id}/variables")
async def get_session_variables(session_id: str):
    """获取会话变量"""
    variables = await session_manager.get_session_variables(session_id)
    return variables

@app.get("/api/users/{user_id}/sessions")
async def list_user_sessions(user_id: str):
    """列出用户的会话"""
    sessions = await session_manager.list_user_sessions(user_id)
    return [session.to_dict() for session in sessions]

@app.post("/api/scripts")
async def create_script(request: CreateScriptRequest):
    """创建脚本"""
    try:
        script = Script(
            script_type=ScriptType(request.script_type),
            script_name=request.script_name,
            script_content=request.script_content,
            author=request.author,
            description=request.description,
            status=ScriptStatus.DRAFT
        )
        
        await storage.save_script(script)
        
        return script.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/scripts")
async def list_scripts(script_type: Optional[str] = None):
    """列出脚本"""
    type_filter = ScriptType(script_type) if script_type else None
    scripts = await storage.list_scripts(type_filter)
    return [script.to_dict() for script in scripts]

@app.get("/api/scripts/{script_id}")
async def get_script(script_id: str):
    """获取脚本"""
    script = await storage.get_script(script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    return script.to_dict()

# 挂载静态文件（前端）
# app.mount("/", StaticFiles(directory="web", html=True), name="web")

if __name__ == "__main__":
    # Python版本使用端口8001避免与TypeScript版本冲突
    uvicorn.run(app, host="0.0.0.0", port=8001)
