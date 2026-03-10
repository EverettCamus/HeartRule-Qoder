# 决策记录 - Scene Solution文档更新

## 架构决策
### 1. scene_solution结构
- **一对一映射**：每个action_type有专属的scene_solution集合
- **字段定义**：id, name, description, category, main_prompt_template, monitor_prompt_template, monitor_frequency, classification_prompt
- **monitor_frequency语义**：always, high, medium, low, on_error, periodic, first_round_only, never

### 2. 智能预处理接口
- **分类机制**：LLM根据action目标提示词进行分类
- **分类类型**：ai_say分为advice(建议方案), knowledge(介绍知识), persuasion(说服)；ai_ask分为open_question(开放式提问), closed_question(封闭式提问)
- **实施阶段**：本期定义框架（手动指定），下期实现智能选择

### 3. 向后兼容策略
- **默认scene_solution**：原有action_type配置作为默认scene_solution
- **迁移路径**：现有脚本无需修改，自动使用默认方案
- **渐进升级**：脚本工程师可逐步采用场景化方案

## 范围决策
- **更新范围**：仅第1.2节（行号55-94）
- **保护范围**：第1.3节（监控层架构）保持不变
- **文档风格**：保持现有YAML示例格式和标题层级