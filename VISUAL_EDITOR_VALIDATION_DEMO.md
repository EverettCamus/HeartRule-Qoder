# Visual Editor 验证功能演示指南

## 快速演示（5分钟）

### 准备工作

1. **启动开发环境**

   ```powershell
   cd C:\CBT\HeartRule-Qcoder
   pnpm dev
   ```

2. **打开编辑器**
   - 访问 `http://localhost:5173`
   - 或打开 `web/script_editor.html`

---

## 演示步骤

### 步骤 1: 打开测试脚本 (30秒)

1. 在编辑器中打开项目
2. 在文件树中找到：
   ```
   📁 Sessions
     📄 test_deprecated_fields.yaml  ← 点击这个文件
   ```

### 步骤 2: 查看 YAML Mode 错误 (30秒)

1. 默认会在 **YAML Mode** 下打开
2. 编辑器下方会看到红色的 **ValidationErrorPanel**
3. 显示类似：

   ```
   ⚠️ 发现 13 个验证错误

   错误列表:
   1. [session.phases[0].topics[0].actions[0].config]
      缺少必填字段 'content'

   2. [session.phases[0].topics[0].actions[0].config]
      包含不允许的额外字段 'content_template'
      💡 字段 'content_template' 已废弃，请使用 'content' 代替

   3. [session.phases[0].topics[0].actions[1].config]
      包含不允许的额外字段 'question_template'
      💡 请使用 'content' 代替

   ... 更多错误
   ```

### 步骤 3: 切换到 Visual Editor (30秒)

1. 点击顶部的 **Visual Editor** 按钮
2. 立即看到顶部的**全局错误摘要**：
   ```
   ┌─────────────────────────────────────────────────────┐
   │ ⚠️ 发现 13 个脚本验证错误                             │
   │ 请检查并修复错误后保存。点击有错误的 Action 查看详情。│
   └─────────────────────────────────────────────────────┘
   ```

### 步骤 4: 查看 Action 详细错误 (2分钟)

1. 在左侧 Action 列表中，找到 **action_1**
2. 点击选中
3. 右侧属性面板顶部显示：

   ```
   ┌─────────────────────────────────────────────────────┐
   │ ❌ 此 Action 存在 2 个验证错误                        │
   │                                                       │
   │ • 缺少必填字段 'content'                              │
   │   💡 请添加 content 字段                             │
   │                                                       │
   │ • 包含不允许的额外字段 'content_template'             │
   │   💡 字段 'content_template' 已废弃（该字段已重命名）。│
   │      请使用 'content' 代替。                          │
   │      请将 content_template 重命名为 content          │
   └─────────────────────────────────────────────────────┘
   ```

4. 同样，选中 **action_2**
5. 右侧显示：

   ```
   ┌─────────────────────────────────────────────────────┐
   │ ❌ 此 Action 存在 6 个验证错误                        │
   │                                                       │
   │ • 缺少必填字段 'content'                              │
   │ • 包含不允许的额外字段 'content_template'             │
   │ • 包含不允许的额外字段 'question_template'            │
   │   💡 请使用 'content' 代替                           │
   │ • 包含不允许的额外字段 'target_variable'              │
   │   💡 请使用 'output' 代替                            │
   │ • 包含不允许的额外字段 'extraction_prompt'            │
   │   💡 请在 output 数组中使用 instruction 字段         │
   │ • 包含不允许的额外字段 'required'                     │
   │   💡 请直接移除该字段                                │
   └─────────────────────────────────────────────────────┘
   ```

6. 选中 **action_3**（正确格式）
7. 没有错误提示，正常显示属性面板

### 步骤 5: 修复错误 (1分钟)

1. 切换回 **YAML Mode**
2. 找到 action_1，修改：

   ```yaml
   # 修复前
   - action_type: 'ai_say'
     action_id: 'action_1'
     config:
       content_template: '这是一个废弃字段，应该被检测到'

   # 修复后
   - action_type: 'ai_say'
     action_id: 'action_1'
     config:
       content: '这是一个废弃字段，应该被检测到'
   ```

3. 等待 500ms（防抖）
4. 错误数量从 13 减少到 11

### 步骤 6: 验证修复效果 (30秒)

1. 切换回 **Visual Editor**
2. 顶部摘要更新为：

   ```
   ⚠️ 发现 11 个脚本验证错误
   ```

3. 选中 action_1
4. 错误消失，只显示正常的属性面板

---

## 测试文件内容说明

`test_deprecated_fields.yaml` 包含 3 个 Action：

| Action ID | Action Type | 废弃字段                                                                          | 错误数 |
| --------- | ----------- | --------------------------------------------------------------------------------- | ------ |
| action_1  | ai_say      | content_template                                                                  | 2      |
| action_2  | ai_ask      | content_template, question_template, target_variable, extraction_prompt, required | 6      |
| action_3  | ai_ask      | 无（正确格式）                                                                    | 0      |

---

## 预期结果验证

### ✅ 功能验证清单

- [ ] YAML Mode 下看到 ValidationErrorPanel
- [ ] Visual Editor 顶部看到全局错误摘要
- [ ] 全局摘要显示正确的错误总数
- [ ] 选中 action_1 看到 2 个错误
- [ ] 选中 action_2 看到 6 个错误
- [ ] 选中 action_3 没有错误
- [ ] 错误提示包含修复建议（💡）
- [ ] 修复错误后，错误数量减少
- [ ] 所有错误修复后，警告框消失

### ✅ 废弃字段检测清单

- [ ] content_template (ai_say)
- [ ] content_template (ai_ask)
- [ ] question_template (ai_ask)
- [ ] target_variable (ai_ask)
- [ ] extraction_prompt (ai_ask)
- [ ] required (ai_ask)

---

## 常见问题

### Q: 看不到错误提示？

**A**:

1. 确认已切换到 Visual Editor 模式
2. 检查错误面板是否被关闭（点击 X）
3. 尝试刷新页面重新加载文件

### Q: 错误数量不对？

**A**:

- 除了废弃字段，还会检测其他错误（如缺少必填字段）
- 每个废弃字段会产生 1 个错误
- action_1: 2 个错误（缺 content + 废弃 content_template）
- action_2: 6 个错误（缺 content + 5 个废弃字段）

---

## 下一步

完成演示后，可以：

1. 阅读[用户指南](./docs/design/visual-editor-validation-user-guide.md)了解详细用法
2. 查看[实现总结](./docs/design/visual-editor-validation-implementation-summary.md)了解技术细节
3. 打开实际项目脚本进行验证和修复

---

**预计演示时间**: 5 分钟  
**难度**: ⭐⭐ (简单)  
**最后更新**: 2026-01-29
