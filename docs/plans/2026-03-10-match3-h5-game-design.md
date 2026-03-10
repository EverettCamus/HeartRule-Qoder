# H5消消乐小游戏设计文档

## 项目概述

创建一个简单的H5消消乐（Match-3）小游戏，使用色块实现，包含基本音效。

## 设计决策

### 方案选择：独立HTML游戏

**理由**：

1. 简单直接，符合"简单H5游戏"要求
2. 快速交付，不干扰现有AI咨询引擎项目
3. 独立部署，易于测试和分享
4. 技术栈简单，维护成本低

### 文件位置

```
web/match3-game/
├── index.html          # 主HTML文件
├── style.css          # 样式文件
├── game.js           # 游戏核心逻辑
├── audio.js          # 音效管理
└── assets/
    ├── sounds/       # 音效文件
    └── images/       # 图片资源（可选）
```

## 技术架构

### 技术栈

- **HTML5 Canvas**：游戏渲染
- **纯JavaScript**：游戏逻辑
- **CSS3**：UI样式和动画
- **Web Audio API**：音效播放

### 游戏规格

- **游戏板**：8x8网格
- **色块类型**：6种颜色（红、蓝、绿、黄、紫、橙）
- **移动限制**：30次移动机会
- **时间限制**：3分钟倒计时
- **计分系统**：3连消10分，4连消20分，5连消30分，连锁消除额外加分

## 详细设计

### 1. 游戏状态管理

```javascript
const gameState = {
  board: [], // 8x8游戏板数组，存储色块类型
  score: 0, // 当前分数
  movesLeft: 30, // 剩余移动次数
  timeLeft: 180, // 剩余时间（秒）
  selectedTile: null, // 当前选中的色块 {row, col}
  isPlaying: true, // 游戏进行中
  isPaused: false, // 暂停状态
  soundEnabled: true, // 音效开关
};
```

### 2. 游戏板数据结构

```javascript
// 色块类型定义
const TILE_TYPES = {
  RED: 0,
  BLUE: 1,
  GREEN: 2,
  YELLOW: 3,
  PURPLE: 4,
  ORANGE: 5,
};

// 游戏板初始化
const BOARD_SIZE = 8;
const board = Array(BOARD_SIZE)
  .fill()
  .map(() =>
    Array(BOARD_SIZE)
      .fill()
      .map(() => Math.floor(Math.random() * Object.keys(TILE_TYPES).length))
  );
```

### 3. 核心算法

#### 3.1 消除检测算法

```javascript
function findMatches(board) {
  const matches = [];

  // 水平检测
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE - 2; col++) {
      if (
        board[row][col] !== null &&
        board[row][col] === board[row][col + 1] &&
        board[row][col] === board[row][col + 2]
      ) {
        matches.push({ row, col, direction: 'horizontal', length: 3 });
      }
    }
  }

  // 垂直检测
  for (let col = 0; col < BOARD_SIZE; col++) {
    for (let row = 0; row < BOARD_SIZE - 2; row++) {
      if (
        board[row][col] !== null &&
        board[row][col] === board[row + 1][col] &&
        board[row][col] === board[row + 2][col]
      ) {
        matches.push({ row, col, direction: 'vertical', length: 3 });
      }
    }
  }

  return matches;
}
```

#### 3.2 交换验证算法

```javascript
function isValidSwap(board, tile1, tile2) {
  // 检查是否相邻
  const rowDiff = Math.abs(tile1.row - tile2.row);
  const colDiff = Math.abs(tile1.col - tile2.col);
  if ((rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1)) {
    // 临时交换
    const temp = board[tile1.row][tile1.col];
    board[tile1.row][tile1.col] = board[tile2.row][tile2.col];
    board[tile2.row][tile2.col] = temp;

    // 检查是否能形成消除
    const hasMatch = findMatches(board).length > 0;

    // 恢复交换
    board[tile2.row][tile2.col] = board[tile1.row][tile1.col];
    board[tile1.row][tile1.col] = temp;

    return hasMatch;
  }
  return false;
}
```

#### 3.3 下落填充算法

```javascript
function applyGravity(board) {
  for (let col = 0; col < BOARD_SIZE; col++) {
    let emptySpaces = 0;

    // 从底部向上扫描
    for (let row = BOARD_SIZE - 1; row >= 0; row--) {
      if (board[row][col] === null) {
        emptySpaces++;
      } else if (emptySpaces > 0) {
        // 下落色块
        board[row + emptySpaces][col] = board[row][col];
        board[row][col] = null;
      }
    }

    // 顶部生成新色块
    for (let i = 0; i < emptySpaces; i++) {
      board[i][col] = Math.floor(Math.random() * Object.keys(TILE_TYPES).length);
    }
  }
}
```

### 4. 音效系统设计

#### 4.1 音效类型

```javascript
const SOUNDS = {
  CLICK: 'click', // 点击色块
  SWAP: 'swap', // 交换色块
  MATCH: 'match', // 消除成功
  CHAIN: 'chain', // 连锁消除
  GAME_OVER: 'game_over', // 游戏结束
  BACKGROUND: 'background', // 背景音乐（可选）
};
```

#### 4.2 音效管理器

```javascript
class AudioManager {
  constructor() {
    this.sounds = new Map();
    this.enabled = true;
  }

  loadSound(name, url) {
    // 使用Web Audio API加载音效
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    // ... 音效加载逻辑
  }

  playSound(name) {
    if (this.enabled && this.sounds.has(name)) {
      this.sounds.get(name).play();
    }
  }

  toggleSound() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}
```

### 5. 用户界面设计

#### 5.1 界面布局

```html
<div class="game-container">
  <header class="game-header">
    <h1>Match3 Game - 消消乐</h1>
  </header>

  <div class="game-info">
    <div class="score">Score: <span id="score">0</span></div>
    <div class="timer">Time: <span id="timer">03:00</span></div>
    <div class="moves">Moves: <span id="moves">30/30</span></div>
  </div>

  <div class="game-board-container">
    <canvas id="game-board" width="400" height="400"></canvas>
  </div>

  <div class="game-controls">
    <button id="restart-btn">重新开始</button>
    <button id="pause-btn">暂停</button>
    <button id="sound-btn">音效开关</button>
  </div>
</div>
```

#### 5.2 视觉设计规范

- **色块尺寸**：40x40像素，圆角8像素
- **色块颜色**：
  - 红色：#FF6B6B
  - 蓝色：#4ECDC4
  - 绿色：#95E1D3
  - 黄色：#FFEAA7
  - 紫色：#A29BFE
  - 橙色：#FDCB6E
- **网格间距**：2像素
- **动画时长**：
  - 交换动画：200ms
  - 消除动画：300ms
  - 下落动画：400ms

### 6. 游戏流程

#### 6.1 初始化流程

1. 加载HTML、CSS、JavaScript资源
2. 初始化Canvas上下文
3. 预加载音效文件
4. 生成初始游戏板（确保无初始消除）
5. 启动游戏循环和计时器

#### 6.2 游戏主循环

```javascript
function gameLoop() {
  if (!gameState.isPaused && gameState.isPlaying) {
    // 更新游戏状态
    updateGameState();

    // 渲染游戏板
    renderBoard();

    // 检查游戏结束条件
    checkGameEnd();
  }

  requestAnimationFrame(gameLoop);
}
```

#### 6.3 玩家交互流程

1. 玩家点击色块A → 高亮显示
2. 玩家点击相邻色块B → 验证交换有效性
3. 如果有效 → 执行交换动画 → 检查消除
4. 如果有消除 → 播放消除动画 → 计分 → 下落填充 → 检查连锁消除
5. 如果无效 → 取消选择 → 播放错误提示音

#### 6.4 游戏结束条件

1. **时间耗尽**：倒计时归零
2. **移动次数用完**：剩余移动次数为0
3. **无有效移动**：棋盘上无任何可能的交换能形成消除

## 实施计划

### 阶段1：基础框架（预计2小时）

1. 创建项目目录结构
2. 编写基础HTML和CSS
3. 实现Canvas初始化和基本绘制
4. 创建游戏状态管理

### 阶段2：核心游戏逻辑（预计3小时）

1. 实现游戏板数据结构和初始化
2. 实现消除检测算法
3. 实现交换验证算法
4. 实现下落填充算法

### 阶段3：用户交互（预计2小时）

1. 实现鼠标/触摸事件处理
2. 实现色块选择和交换动画
3. 实现消除动画效果
4. 实现计分和状态更新

### 阶段4：音效系统（预计1小时）

1. 实现音效管理器
2. 添加基本音效文件
3. 集成音效到游戏事件
4. 实现音效开关控制

### 阶段5：完善和测试（预计2小时）

1. 添加游戏控制按钮（重新开始、暂停）
2. 实现响应式设计
3. 测试不同浏览器兼容性
4. 优化性能和用户体验

## 验收标准

### 功能要求

- [ ] 8x8游戏板正常显示6种颜色色块
- [ ] 点击交换相邻色块功能正常
- [ ] 三连消检测和消除功能正常
- [ ] 计分系统准确计算分数
- [ ] 倒计时和移动限制功能正常
- [ ] 音效在相应事件触发时播放
- [ ] 重新开始和暂停功能正常

### 性能要求

- [ ] 游戏运行流畅，无卡顿
- [ ] 动画效果平滑
- [ ] 音效播放无延迟
- [ ] 内存使用合理

### 用户体验要求

- [ ] 界面清晰易用
- [ ] 操作反馈及时
- [ ] 游戏规则明确
- [ ] 适配不同屏幕尺寸

## 风险与缓解

### 技术风险

1. **Canvas性能问题**
   - 缓解：使用双缓冲技术，优化绘制逻辑
2. **音效兼容性问题**
   - 缓解：提供多种格式音效文件，使用Web Audio API降级方案
3. **移动端触摸支持**
   - 缓解：同时支持鼠标和触摸事件，测试主流移动浏览器

### 时间风险

1. **算法复杂度超出预期**
   - 缓解：先实现基础功能，再逐步优化
2. **浏览器兼容性问题**
   - 缓解：使用现代JavaScript特性，提供polyfill

## 后续优化建议

### 短期优化（v1.1）

1. 添加更多色块类型和特殊道具
2. 实现关卡系统
3. 添加高分排行榜
4. 优化视觉效果和动画

### 长期优化（v2.0）

1. 集成到现有项目架构中
2. 添加用户账户系统
3. 实现多人在线对战
4. 添加成就系统

## 文档版本历史

| 版本 | 日期       | 作者     | 变更说明               |
| ---- | ---------- | -------- | ---------------------- |
| 1.0  | 2026-03-10 | Sisyphus | 初始设计文档           |
| 1.1  | 2026-03-10 | Sisyphus | 添加详细算法和实现计划 |

---

**设计批准**：✅ 已通过头脑风暴阶段  
**下一步**：调用writing-plans技能创建详细实施计划
