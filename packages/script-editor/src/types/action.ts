/**
 * Action 节点类型定义
 * 对应会谈脚本中的各种 Action 类型
 */

// 输出字段配置
export interface OutputField {
  get?: string;        // 提取变量名
  set?: string;        // 设置变量名
  define?: string;     // 变量定义说明
  value?: string;      // 直接设置的值
}

// 基础 Action 接口
export interface BaseAction {
  type: 'ai_say' | 'ai_ask' | 'ai_think' | 'say' | 'user_say' | 'use_skill' | 'show_form' | 'show_pic';
  condition?: string;  // 执行条件
  [key: string]: any;  // 允许其他属性
}

// AI 说话 Action
export interface AiSayAction extends BaseAction {
  type: 'ai_say';
  ai_say?: string;     // 提示词内容（向后兼容）
  content?: string;    // 讲解内容（新字段，优先使用）
  tone?: string;       // 语气风格
  require_acknowledgment?: boolean;  // 是否需要用户确认
  max_rounds?: number; // 最大轮数
  exit_criteria?: {    // 退出条件配置（新增）
    understanding_threshold?: number;  // 理解度阈值 (0-100)
    has_questions?: boolean;           // 是否允许有疑问时退出
  };
}

// AI 提问 Action
export interface AiAskAction extends BaseAction {
  type: 'ai_ask';
  ai_ask: string;      // 提示词内容
  tone?: string;       // 语气风格
  exit?: string;       // 退出条件
  output?: OutputField[];  // 输出变量配置
  tolist?: string;     // 添加到列表变量
  question_template?: string;  // 问题模板(与ai_ask同义)
  target_variable?: string;    // 目标变量名
  extraction_prompt?: string;  // 提取提示词
  required?: boolean;          // 是否必填
  max_rounds?: number;         // 最大轮数
}

// AI 思考 Action
export interface AiThinkAction extends BaseAction {
  type: 'ai_think';
  think: string;       // 思考提示词
  output?: OutputField[];  // 输出变量配置
}

// 简单说话 Action
export interface SayAction extends BaseAction {
  type: 'say';
  say: string;         // 说话内容
}

// 用户说话 Action
export interface UserSayAction extends BaseAction {
  type: 'user_say';
  user_say: string;    // 用户说话内容
}

// 使用技能 Action
export interface UseSkillAction extends BaseAction {
  type: 'use_skill';
  skill: string;       // 技能名称
  input?: OutputField[];   // 输入参数
  output?: OutputField[];  // 输出变量配置
}

// 展示表单 Action
export interface ShowFormAction extends BaseAction {
  type: 'show_form';
  form_id: string;     // 表单ID
  output?: OutputField[];  // 输出变量配置
}

// 展示图片 Action
export interface ShowPicAction extends BaseAction {
  type: 'show_pic';
  pic_url: string;     // 图片URL
  description?: string; // 图片说明
}

// 联合类型
export type Action = AiSayAction | AiAskAction | AiThinkAction | SayAction | UserSayAction | UseSkillAction | ShowFormAction | ShowPicAction;

// 会谈脚本结构
export interface SessionScript {
  sessions: SessionItem[];
}

export interface SessionItem {
  session: string;     // 会谈名称
  declare?: VariableDeclaration[];  // 变量声明
  stages: Stage[];     // 阶段列表
}

export interface VariableDeclaration {
  var: string;
  define?: string;
  value?: any;
}

export interface Stage {
  stage: string;       // 阶段名称
  steps: Step[];       // 步骤列表
}

export interface Step {
  scene?: string;      // 场景
  ai?: string;         // AI 角色
  human?: string;      // 人类角色
  goal?: string;       // 目标（Topic）
  actions?: Action[];  // 动作列表
}

// Action 节点的 UI 状态
export interface ActionNodeState {
  id: string;          // 节点唯一ID
  action: Action;      // Action 数据
  selected: boolean;   // 是否选中
  expanded: boolean;   // 是否展开详情
}
