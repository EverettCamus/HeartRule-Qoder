/**
 * 消消乐游戏核心逻辑
 */

// 游戏配置
const CONFIG = {
    BOARD_SIZE: 8,           // 游戏板大小 8x8
    TILE_SIZE: 40,           // 色块大小（像素）
    TILE_PADDING: 2,         // 色块间距
    COLORS: [                // 色块颜色（6种）
        '#FF6B6B', // 红色
        '#4ECDC4', // 蓝色
        '#95E1D3', // 绿色
        '#FFEAA7', // 黄色
        '#A29BFE', // 紫色
        '#FDCB6E'  // 橙色
    ],
    INITIAL_MOVES: 30,       // 初始移动次数
    GAME_TIME: 180,          // 游戏时间（秒）
    SCORE_3_MATCH: 10,       // 3连消分数
    SCORE_4_MATCH: 20,       // 4连消分数
    SCORE_5_MATCH: 30,       // 5连消分数
    CHAIN_BONUS: 5           // 连锁消除额外分数
};

// 游戏状态
const gameState = {
    board: [],              // 游戏板二维数组
    score: 0,               // 当前分数
    movesLeft: CONFIG.INITIAL_MOVES, // 剩余移动次数
    timeLeft: CONFIG.GAME_TIME,      // 剩余时间
    selectedTile: null,     // 当前选中的色块 {row, col}
    isPlaying: false,       // 游戏是否进行中
    isPaused: false,        // 游戏是否暂停
    gameOver: false,        // 游戏是否结束
    chainCount: 0,          // 当前连锁次数
    canvas: null,           // Canvas元素
    ctx: null,              // Canvas上下文
    lastTime: 0,            // 上一帧时间
    animationId: null       // 动画ID
};

// DOM元素引用
const domElements = {
    score: null,
    timer: null,
    moves: null,
    gameBoard: null,
    gameOverlay: null,
    overlayTitle: null,
    overlayMessage: null,
    playAgainBtn: null,
    restartBtn: null,
    pauseBtn: null,
    soundBtn: null,
    helpBtn: null
};

/**
 * 初始化游戏
 */
function initGame() {
    console.log('初始化游戏...');
    
    // 获取DOM元素
    domElements.score = document.getElementById('score');
    domElements.timer = document.getElementById('timer');
    domElements.moves = document.getElementById('moves');
    domElements.gameBoard = document.getElementById('game-board');
    domElements.gameOverlay = document.getElementById('game-overlay');
    domElements.overlayTitle = document.getElementById('game-overlay-title');
    domElements.overlayMessage = document.getElementById('game-overlay-message');
    domElements.playAgainBtn = document.getElementById('play-again-btn');
    domElements.restartBtn = document.getElementById('restart-btn');
    domElements.pauseBtn = document.getElementById('pause-btn');
    domElements.soundBtn = document.getElementById('sound-btn');
    domElements.helpBtn = document.getElementById('help-btn');
    
    // 初始化Canvas
    gameState.canvas = domElements.gameBoard;
    gameState.ctx = gameState.canvas.getContext('2d');
    
    // 设置Canvas尺寸
    const boardSize = CONFIG.BOARD_SIZE * (CONFIG.TILE_SIZE + CONFIG.TILE_PADDING) + CONFIG.TILE_PADDING;
    gameState.canvas.width = boardSize;
    gameState.canvas.height = boardSize;
    
    // 初始化游戏板
    initBoard();
    
    // 绑定事件监听器
    bindEvents();
    
    // 开始游戏
    startGame();
    
    console.log('游戏初始化完成');
}

/**
 * 初始化游戏板
 */
function initBoard() {
    console.log('初始化游戏板...');
    
    // 创建空游戏板
    gameState.board = Array(CONFIG.BOARD_SIZE).fill().map(() => 
        Array(CONFIG.BOARD_SIZE).fill(null)
    );
    
    // 填充随机色块，确保无初始消除
    for (let row = 0; row < CONFIG.BOARD_SIZE; row++) {
        for (let col = 0; col < CONFIG.BOARD_SIZE; col++) {
            let tileType;
            let attempts = 0;
            const maxAttempts = 10;
            
            do {
                tileType = Math.floor(Math.random() * CONFIG.COLORS.length);
                attempts++;
                
                if (attempts >= maxAttempts) {
                    console.warn(`达到最大尝试次数，使用随机值: row=${row}, col=${col}`);
                    break;
                }
            } while (createsInitialMatch(row, col, tileType));
            
            gameState.board[row][col] = tileType;
        }
    }
    
    console.log('游戏板初始化完成');
}

/**
 * 检查放置色块是否会创建初始消除
 */
function createsInitialMatch(row, col, tileType) {
    // 临时设置色块
    const original = gameState.board[row][col];
    gameState.board[row][col] = tileType;
    
    // 检查水平方向
    let horizontalMatch = false;
    if (col >= 2) {
        if (gameState.board[row][col - 2] === tileType && 
            gameState.board[row][col - 1] === tileType) {
            horizontalMatch = true;
        }
    }
    if (col <= CONFIG.BOARD_SIZE - 3) {
        if (gameState.board[row][col + 1] === tileType && 
            gameState.board[row][col + 2] === tileType) {
            horizontalMatch = true;
        }
    }
    if (col >= 1 && col <= CONFIG.BOARD_SIZE - 2) {
        if (gameState.board[row][col - 1] === tileType && 
            gameState.board[row][col + 1] === tileType) {
            horizontalMatch = true;
        }
    }
    
    // 检查垂直方向
    let verticalMatch = false;
    if (row >= 2) {
        if (gameState.board[row - 2][col] === tileType && 
            gameState.board[row - 1][col] === tileType) {
            verticalMatch = true;
        }
    }
    if (row <= CONFIG.BOARD_SIZE - 3) {
        if (gameState.board[row + 1][col] === tileType && 
            gameState.board[row + 2][col] === tileType) {
            verticalMatch = true;
        }
    }
    if (row >= 1 && row <= CONFIG.BOARD_SIZE - 2) {
        if (gameState.board[row - 1][col] === tileType && 
            gameState.board[row + 1][col] === tileType) {
            verticalMatch = true;
        }
    }
    
    // 恢复原始值
    gameState.board[row][col] = original;
    
    return horizontalMatch || verticalMatch;
}

/**
 * 绑定事件监听器
 */
function bindEvents() {
    console.log('绑定事件监听器...');
    
    // Canvas点击事件
    gameState.canvas.addEventListener('click', handleCanvasClick);
    
    // 控制按钮事件
    domElements.restartBtn.addEventListener('click', restartGame);
    domElements.pauseBtn.addEventListener('click', togglePause);
    domElements.soundBtn.addEventListener('click', toggleSound);
    domElements.helpBtn.addEventListener('click', showHelp);
    domElements.playAgainBtn.addEventListener('click', restartGame);
    
    // 键盘事件
    document.addEventListener('keydown', handleKeyDown);
    
    console.log('事件监听器绑定完成');
}

/**
 * 开始游戏
 */
function startGame() {
    console.log('开始游戏...');
    
    // 重置游戏状态
    gameState.score = 0;
    gameState.movesLeft = CONFIG.INITIAL_MOVES;
    gameState.timeLeft = CONFIG.GAME_TIME;
    gameState.selectedTile = null;
    gameState.isPlaying = true;
    gameState.isPaused = false;
    gameState.gameOver = false;
    gameState.chainCount = 0;
    
    // 更新UI
    updateUI();
    
    // 隐藏游戏结束遮罩
    domElements.gameOverlay.style.display = 'none';
    
    // 开始游戏循环
    gameState.lastTime = performance.now();
    gameState.animationId = requestAnimationFrame(gameLoop);
    
    console.log('游戏开始');
}

// 占位函数，将在后续任务中实现
function handleCanvasClick(event) {
    console.log('Canvas点击事件:', event);
}

function restartGame() {
    console.log('重新开始游戏');
    startGame();
}

function togglePause() {
    console.log('切换暂停状态');
}

function toggleSound() {
    console.log('切换音效');
}

function showHelp() {
    console.log('显示帮助');
}

function handleKeyDown(event) {
    console.log('键盘事件:', event.key);
}

function updateUI() {
    // 更新分数
    domElements.score.textContent = gameState.score;
    
    // 更新时间
    const minutes = Math.floor(gameState.timeLeft / 60);
    const seconds = Math.floor(gameState.timeLeft % 60);
    domElements.timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // 更新移动次数
    domElements.moves.textContent = `${gameState.movesLeft}/${CONFIG.INITIAL_MOVES}`;
}

/**
 * 游戏主循环
 */
function gameLoop(currentTime) {
    if (!gameState.isPlaying || gameState.gameOver) {
        return;
    }
    
    // 计算时间差
    const deltaTime = currentTime - gameState.lastTime;
    gameState.lastTime = currentTime;
    
    // 更新游戏状态（如果不是暂停状态）
    if (!gameState.isPaused) {
        updateGame(deltaTime);
    }
    
    // 渲染游戏
    renderGame();
    
    // 继续循环
    gameState.animationId = requestAnimationFrame(gameLoop);
}

/**
 * 更新游戏状态
 */
function updateGame(deltaTime) {
    // 更新计时器
    if (gameState.timeLeft > 0) {
        gameState.timeLeft -= deltaTime / 1000; // 转换为秒
        
        if (gameState.timeLeft <= 0) {
            gameState.timeLeft = 0;
            endGame('时间到！');
        }
    }
    
    // 更新UI
    updateUI();
}

/**
 * 渲染游戏
 */
function renderGame() {
    // 清空Canvas
    gameState.ctx.clearRect(0, 0, gameState.canvas.width, gameState.canvas.height);
    
    // 绘制游戏板背景
    gameState.ctx.fillStyle = '#ffffff';
    gameState.ctx.fillRect(0, 0, gameState.canvas.width, gameState.canvas.height);
    
    // 绘制网格线
    gameState.ctx.strokeStyle = '#e2e8f0';
    gameState.ctx.lineWidth = 1;
    
    for (let i = 0; i <= CONFIG.BOARD_SIZE; i++) {
        const pos = i * (CONFIG.TILE_SIZE + CONFIG.TILE_PADDING) + CONFIG.TILE_PADDING / 2;
        
        // 垂直线
        gameState.ctx.beginPath();
        gameState.ctx.moveTo(pos, 0);
        gameState.ctx.lineTo(pos, gameState.canvas.height);
        gameState.ctx.stroke();
        
        // 水平线
        gameState.ctx.beginPath();
        gameState.ctx.moveTo(0, pos);
        gameState.ctx.lineTo(gameState.canvas.width, pos);
        gameState.ctx.stroke();
    }
    
    // 绘制色块
    for (let row = 0; row < CONFIG.BOARD_SIZE; row++) {
        for (let col = 0; col < CONFIG.BOARD_SIZE; col++) {
            const tileType = gameState.board[row][col];
            
            if (tileType !== null) {
                drawTile(row, col, tileType);
            }
        }
    }
    
    // 绘制选中效果
    if (gameState.selectedTile) {
        drawSelection(gameState.selectedTile.row, gameState.selectedTile.col);
    }
}

/**
 * 绘制单个色块
 */
function drawTile(row, col, tileType) {
    const x = col * (CONFIG.TILE_SIZE + CONFIG.TILE_PADDING) + CONFIG.TILE_PADDING;
    const y = row * (CONFIG.TILE_SIZE + CONFIG.TILE_PADDING) + CONFIG.TILE_PADDING;
    
    // 绘制圆角矩形
    const radius = 8;
    
    gameState.ctx.save();
    gameState.ctx.beginPath();
    gameState.ctx.moveTo(x + radius, y);
    gameState.ctx.lineTo(x + CONFIG.TILE_SIZE - radius, y);
    gameState.ctx.quadraticCurveTo(x + CONFIG.TILE_SIZE, y, x + CONFIG.TILE_SIZE, y + radius);
    gameState.ctx.lineTo(x + CONFIG.TILE_SIZE, y + CONFIG.TILE_SIZE - radius);
    gameState.ctx.quadraticCurveTo(x + CONFIG.TILE_SIZE, y + CONFIG.TILE_SIZE, x + CONFIG.TILE_SIZE - radius, y + CONFIG.TILE_SIZE);
    gameState.ctx.lineTo(x + radius, y + CONFIG.TILE_SIZE);
    gameState.ctx.quadraticCurveTo(x, y + CONFIG.TILE_SIZE, x, y + CONFIG.TILE_SIZE - radius);
    gameState.ctx.lineTo(x, y + radius);
    gameState.ctx.quadraticCurveTo(x, y, x + radius, y);
    gameState.ctx.closePath();
    
    // 填充颜色
    gameState.ctx.fillStyle = CONFIG.COLORS[tileType];
    gameState.ctx.fill();
    
    // 添加内阴影效果
    gameState.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    gameState.ctx.lineWidth = 2;
    gameState.ctx.stroke();
    
    gameState.ctx.restore();
}

/**
 * 绘制选中效果
 */
function drawSelection(row, col) {
    const x = col * (CONFIG.TILE_SIZE + CONFIG.TILE_PADDING) + CONFIG.TILE_PADDING;
    const y = row * (CONFIG.TILE_SIZE + CONFIG.TILE_PADDING) + CONFIG.TILE_PADDING;
    
    gameState.ctx.save();
    gameState.ctx.strokeStyle = '#667eea';
    gameState.ctx.lineWidth = 3;
    gameState.ctx.setLineDash([5, 3]);
    
    gameState.ctx.beginPath();
    gameState.ctx.rect(x - 2, y - 2, CONFIG.TILE_SIZE + 4, CONFIG.TILE_SIZE + 4);
    gameState.ctx.stroke();
    
    gameState.ctx.restore();
}

/**
 * 游戏结束
 */
function endGame(message) {
    gameState.isPlaying = false;
    gameState.gameOver = true;
    
    // 显示游戏结束遮罩
    domElements.overlayTitle.textContent = '游戏结束';
    domElements.overlayMessage.textContent = message;
    domElements.gameOverlay.style.display = 'flex';
    
    console.log(`游戏结束: ${message}`);
}

// 页面加载完成后初始化游戏
document.addEventListener('DOMContentLoaded', initGame);