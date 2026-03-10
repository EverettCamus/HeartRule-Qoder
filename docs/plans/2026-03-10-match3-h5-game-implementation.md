# H5消消乐小游戏实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 创建一个简单的H5消消乐小游戏，使用Canvas渲染色块，包含基本音效和游戏逻辑。

**Architecture:** 独立HTML游戏，使用纯JavaScript + Canvas实现游戏逻辑，Web Audio API处理音效，响应式设计适配移动端。

**Tech Stack:** HTML5 Canvas, JavaScript (ES6+), CSS3, Web Audio API

---

## 项目初始化

### Task 1: 创建项目目录结构

**Files:**

- Create: `web/match3-game/index.html`
- Create: `web/match3-game/style.css`
- Create: `web/match3-game/game.js`
- Create: `web/match3-game/audio.js`
- Create: `web/match3-game/assets/sounds/` (目录)
- Create: `web/match3-game/assets/images/` (目录)

**Step 1: 创建目录结构**

```bash
mkdir -p web/match3-game/assets/sounds web/match3-game/assets/images
```

**Step 2: 验证目录创建**

```bash
ls -la web/match3-game/
```

Expected: 看到index.html, style.css, game.js, audio.js文件和assets目录

**Step 3: 提交初始结构**

```bash
git add web/match3-game/
git commit -m "feat: 创建消消乐游戏目录结构"
```

---

### Task 2: 创建基础HTML文件

**Files:**

- Create: `web/match3-game/index.html`

**Step 1: 编写HTML基础结构**

创建包含游戏界面基本结构的HTML文件。

**Step 2: 验证HTML文件**

```bash
cat web/match3-game/index.html | head -20
```

Expected: 看到正确的HTML结构

**Step 3: 提交HTML文件**

```bash
git add web/match3-game/index.html
git commit -m "feat: 创建游戏基础HTML结构"
```

---

### Task 3: 创建CSS样式文件

**Files:**

- Create: `web/match3-game/style.css`

**Step 1: 编写基础样式**

创建游戏界面样式，包括响应式设计。

**Step 2: 验证CSS文件**

```bash
cat web/match3-game/style.css | wc -l
```

Expected: 大约150行左右

**Step 3: 提交CSS文件**

```bash
git add web/match3-game/style.css
git commit -m "feat: 添加游戏CSS样式"
```

---

### Task 4: 创建音效管理器

**Files:**

- Create: `web/match3-game/audio.js`

**Step 1: 编写音效管理器基础类**

创建AudioManager类，使用Web Audio API管理音效。

**Step 2: 创建占位音效文件**

```bash
# 创建简单的占位音效文件
echo 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI1LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg' | base64 -d > web/match3-game/assets/sounds/click.mp3

# 复制相同文件作为其他音效
cp web/match3-game/assets/sounds/click.mp3 web/match3-game/assets/sounds/swap.mp3
cp web/match3-game/assets/sounds/click.mp3 web/match3-game/assets/sounds/match.mp3
cp web/match3-game/assets/sounds/click.mp3 web/match3-game/assets/sounds/chain.mp3
cp web/match3-game/assets/sounds/click.mp3 web/match3-game/assets/sounds/game-over.mp3
cp web/match3-game/assets/sounds/click.mp3 web/match3-game/assets/sounds/background.mp3
```

**Step 3: 验证音效文件**

```bash
ls -la web/match3-game/assets/sounds/*.mp3 | wc -l
```

Expected: 6个MP3文件

**Step 4: 提交音效管理器**

```bash
git add web/match3-game/audio.js web/match3-game/assets/sounds/
git commit -m "feat: 添加音效管理器和占位音效文件"
```

---

### Task 5: 创建游戏核心逻辑 - 游戏状态管理

**Files:**

- Create: `web/match3-game/game.js`

**Step 1: 编写游戏状态管理模块**

创建游戏配置、状态管理和初始化函数。

**Step 2: 实现游戏板初始化**

实现initBoard()函数，创建8x8游戏板，确保无初始消除。

**Step 3: 实现事件绑定**

实现bindEvents()函数，绑定Canvas点击和按钮事件。

**Step 4: 提交游戏核心逻辑**

```bash
git add web/match3-game/game.js
git commit -m "feat: 添加游戏核心逻辑和状态管理"
```

---

### Task 6: 实现游戏渲染系统

**Files:**

- Modify: `web/match3-game/game.js`

**Step 1: 实现游戏主循环**

创建gameLoop()函数，使用requestAnimationFrame实现游戏循环。

**Step 2: 实现渲染函数**

实现renderGame()函数，绘制游戏板、网格和色块。

**Step 3: 实现色块绘制**

实现drawTile()函数，绘制圆角矩形色块。

**Step 4: 提交渲染系统**

```bash
git add web/match3-game/game.js
git commit -m "feat: 实现游戏渲染系统"
```

---

### Task 7: 实现游戏交互逻辑

**Files:**

- Modify: `web/match3-game/game.js`

**Step 1: 实现Canvas点击处理**

实现handleCanvasClick()函数，处理色块选择和交换。

**Step 2: 实现交换验证**

实现isValidSwap()函数，验证交换是否有效。

**Step 3: 实现消除检测**

实现findMatches()函数，检测水平/垂直三连消。

**Step 4: 提交交互逻辑**

```bash
git add web/match3-game/game.js
git commit -m "feat: 实现游戏交互逻辑"
```

---

### Task 8: 实现游戏逻辑和计分系统

**Files:**

- Modify: `web/match3-game/game.js`

**Step 1: 实现消除处理**

实现processMatches()函数，处理消除逻辑和计分。

**Step 2: 实现下落填充**

实现applyGravity()函数，处理消除后的色块下落。

**Step 3: 实现游戏结束检测**

实现checkGameEnd()函数，检测游戏结束条件。

**Step 4: 提交游戏逻辑**

```bash
git add web/match3-game/game.js
git commit -m "feat: 实现游戏逻辑和计分系统"
```

---

### Task 9: 集成音效系统

**Files:**

- Modify: `web/match3-game/game.js`
- Modify: `web/match3-game/audio.js`

**Step 1: 完善音效管理器**

添加音效预加载和播放控制。

**Step 2: 集成音效到游戏事件**

在点击、交换、消除等事件中播放相应音效。

**Step 3: 实现音效开关**

实现toggleSound()函数，控制音效开关。

**Step 4: 提交音效集成**

```bash
git add web/match3-game/game.js web/match3-game/audio.js
git commit -m "feat: 集成音效系统到游戏"
```

---

### Task 10: 完善游戏功能和测试

**Files:**

- Modify: `web/match3-game/game.js`
- Modify: `web/match3-game/style.css`

**Step 1: 实现暂停/继续功能**

实现togglePause()函数，控制游戏暂停。

**Step 2: 实现重新开始功能**

实现restartGame()函数，重置游戏状态。

**Step 3: 添加游戏说明**

完善游戏界面和说明文字。

**Step 4: 测试游戏功能**

在浏览器中打开游戏，测试所有功能。

**Step 5: 提交最终版本**

```bash
git add web/match3-game/
git commit -m "feat: 完成消消乐游戏所有功能"
```

---

## 执行选项

**Plan complete and saved to `docs/plans/2026-03-10-match3-h5-game-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
