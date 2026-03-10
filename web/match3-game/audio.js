/**
 * 音效管理器
 * 使用Web Audio API播放游戏音效
 */
class AudioManager {
    constructor() {
        this.audioContext = null;
        this.sounds = new Map();
        this.enabled = true;
        this.init();
    }

    /**
     * 初始化音频上下文
     */
    init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('音频上下文初始化成功');
        } catch (error) {
            console.warn('Web Audio API不支持，音效将被禁用:', error);
            this.enabled = false;
        }
    }

    /**
     * 加载音效
     * @param {string} name - 音效名称
     * @param {string} url - 音效文件URL
     * @returns {Promise} 加载完成的Promise
     */
    async loadSound(name, url) {
        if (!this.enabled || !this.audioContext) {
            console.warn(`音效已禁用，跳过加载: ${name}`);
            return;
        }

        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            this.sounds.set(name, audioBuffer);
            console.log(`音效加载成功: ${name}`);
        } catch (error) {
            console.error(`加载音效失败 ${name}:`, error);
        }
    }

    /**
     * 播放音效
     * @param {string} name - 音效名称
     * @param {object} options - 播放选项
     */
    playSound(name, options = {}) {
        if (!this.enabled || !this.audioContext || !this.sounds.has(name)) {
            return;
        }

        try {
            const source = this.audioContext.createBufferSource();
            source.buffer = this.sounds.get(name);
            
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = options.volume || 0.5;
            
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            source.start(0);
            
            // 清理资源
            source.onended = () => {
                source.disconnect();
                gainNode.disconnect();
            };
        } catch (error) {
            console.error(`播放音效失败 ${name}:`, error);
        }
    }

    /**
     * 切换音效开关
     * @returns {boolean} 新的音效状态
     */
    toggleSound() {
        this.enabled = !this.enabled;
        
        if (this.enabled && this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        console.log(`音效 ${this.enabled ? '开启' : '关闭'}`);
        return this.enabled;
    }

    /**
     * 获取音效状态
     * @returns {boolean} 音效是否启用
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * 预加载所有音效
     */
    async loadAllSounds() {
        const soundFiles = {
            click: 'assets/sounds/click.mp3',
            swap: 'assets/sounds/swap.mp3',
            match: 'assets/sounds/match.mp3',
            chain: 'assets/sounds/chain.mp3',
            gameOver: 'assets/sounds/game-over.mp3',
            background: 'assets/sounds/background.mp3'
        };

        const loadPromises = [];
        for (const [name, url] of Object.entries(soundFiles)) {
            loadPromises.push(this.loadSound(name, url));
        }

        await Promise.all(loadPromises);
        console.log('所有音效加载完成');
    }
}

// 创建全局音效管理器实例
const audioManager = new AudioManager();

// 导出音效管理器
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AudioManager, audioManager };
}