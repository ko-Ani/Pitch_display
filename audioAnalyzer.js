// audioAnalyzer.js
document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const micButton = document.getElementById('micButton');
    const waveCanvas = document.getElementById('waveCanvas');
    const volumeDisplay = document.getElementById('volumeDisplay');
    const pitchDisplay = document.getElementById('pitchDisplay');
    const noteDisplay = document.getElementById('noteDisplay');
    const volumeMeter = document.getElementById('volumeMeter');
    const errorDisplay = document.getElementById('errorDisplay');
    const micStatus = document.getElementById('micStatus');
    const micStatusText = document.getElementById('micStatusText');
    const placeholderText = document.getElementById('placeholderText');
    
    let audioContext;
    let analyser;
    let microphone;
    let canvasCtx;
    let detectingPitch = false;
    let pitchDetector;
    let buffer;
    let animationFrameId;
    
    // 音符映射表
    const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    // 初始化Canvas
    function initCanvas() {
        canvasCtx = waveCanvas.getContext('2d');
        waveCanvas.width = waveCanvas.offsetWidth;
        waveCanvas.height = waveCanvas.offsetHeight;
    }
    
    // 绘制音频波形
    function drawWaveform(data) {
        canvasCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
        
        // 创建渐变的背景效果
        const gradient = canvasCtx.createLinearGradient(0, 0, waveCanvas.width, 0);
        gradient.addColorStop(0, 'rgba(26, 42, 108, 0.7)');
        gradient.addColorStop(0.5, 'rgba(178, 31, 31, 0.7)');
        gradient.addColorStop(1, 'rgba(26, 42, 108, 0.7)');
        
        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(0, 0, waveCanvas.width, waveCanvas.height);
        
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = '#00c9ff';
        canvasCtx.beginPath();
        
        const sliceWidth = waveCanvas.width / buffer.length;
        let x = 0;
        
        for (let i = 0; i < buffer.length; i++) {
            const v = data[i] / 128.0;
            const y = v * waveCanvas.height / 2;
            
            if (i === 0) {
                canvasCtx.moveTo(x, y);
            } else {
                canvasCtx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        canvasCtx.stroke();
    }
    
    // 将频率转换为音符
    function frequencyToNote(frequency) {
        if (!frequency) return null;
        
        // 计算最接近的半音指数
        const A4 = 440;
        const noteIndex = Math.round(12 * Math.log2(frequency / A4)) + 69;
        
        if (noteIndex < 0 || noteIndex > 127) return null;
        
        // 计算音符名称和八度
        const octave = Math.floor(noteIndex / 12) - 1;
        const noteName = NOTES[noteIndex % 12];
        
        return {
            name: noteName,
            octave: octave,
            full: `${noteName}${octave}`
        };
    }
    
    // 处理音频数据
    function processAudio() {
        if (!analyser) return;
        
        // 获取时间域数据
        analyser.getByteTimeDomainData(buffer);
        
        // 绘制波形
        drawWaveform(buffer);
        
        // 计算音量（RMS）
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            const value = (buffer[i] - 128) / 128;
            sum += value * value;
        }
        
        const rms = Math.sqrt(sum / buffer.length);
        const db = Math.max(0, Math.round(20 * Math.log10(rms)));
        
        // 更新音量显示
        volumeDisplay.textContent = `${db} dB`;
        volumeMeter.style.width = `${Math.min(db, 100)}%`;
        
        // 检测音高
        if (detectingPitch) {
            // 获取浮动数组数据用于音高检测
            const floatBuffer = new Float32Array(buffer.length);
            for (let i = 0; i < buffer.length; i++) {
                floatBuffer[i] = (buffer[i] - 128) / 128;
            }
            
            const pitch = pitchDetector(floatBuffer);
            
            if (pitch) {
                // 更新音高显示
                pitchDisplay.textContent = `${pitch.toFixed(2)} Hz`;
                
                // 获取并显示音符
                const note = frequencyToNote(pitch);
                noteDisplay.textContent = note ? note.full : '-';
            }
        }
        
        // 继续处理音频
        animationFrameId = requestAnimationFrame(processAudio);
    }
    
    // 停止音频处理
    function stopAudioProcessing() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        
        if (microphone) {
            microphone.disconnect();
            microphone = null;
        }
        
        if (analyser) {
            analyser.disconnect();
            analyser = null;
        }
        
        if (audioContext) {
            audioContext.close().catch(console.error);
            audioContext = null;
        }
        
        // 清除视觉元素
        canvasCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
        placeholderText.style.display = 'block';
    }
    
    // 显示权限错误
    function showPermissionError(errorMessage) {
        errorDisplay.textContent = `无法访问麦克风：${errorMessage || '请检查浏览器设置并确认已授予麦克风权限'}`;
        errorDisplay.style.display = 'block';
        
        micStatusText.textContent = '未启用';
        micStatus.classList.remove('active');
    }
    
    // 更新UI状态
    function updateUIStatus(enabled) {
        if (enabled) {
            micButton.textContent = '停止分析';
            micButton.classList.add('enabled');
            micStatus.classList.add('active');
            micStatusText.textContent = '启用中';
            placeholderText.style.display = 'none';
            errorDisplay.style.display = 'none';
        } else {
            micButton.textContent = '启动麦克风';
            micButton.classList.remove('enabled');
            micStatus.classList.remove('active');
            micStatusText.textContent = '未启用';
            placeholderText.style.display = 'block';
        }
        
        micButton.disabled = false;
    }
    
    // 开始音频分析
    async function startAudioAnalysis() {
        try {
            // 检查浏览器支持
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('您的浏览器不支持麦克风功能');
            }
            
            // 更新UI状态为加载中
            micButton.textContent = '正在连接...';
            micButton.disabled = true;
            
            // 请求麦克风权限
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                },
                video: false 
            });
            
            updateUIStatus(true);
            
            // 创建音频上下文
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 创建音高检测器
            pitchDetector = pitchfinder.YIN({ sampleRate: audioContext.sampleRate });
            detectingPitch = true;
            
            // 创建分析节点
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            buffer = new Uint8Array(analyser.fftSize);
            
            // 初始化Canvas
            initCanvas();
            
            // 连接麦克风输入
            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            
            // 开始处理音频
            processAudio();
            
        } catch (err) {
            console.error('无法访问麦克风:', err);
            
            let errorMessage = err.message || '未知错误';
            if (err.name === 'NotAllowedError') {
                errorMessage = '麦克风权限被拒绝。请在浏览器设置中启用麦克风权限。';
            } else if (err.name === 'NotFoundError') {
                errorMessage = '未找到麦克风设备。请确认麦克风已连接。';
            } else if (err.name === 'NotSupportedError') {
                errorMessage = '您的浏览器不支持此功能';
            }
            
            showPermissionError(errorMessage);
            
            // 恢复到初始状态
            stopAudioProcessing();
            updateUIStatus(false);
        }
    }
    
    // 切换麦克风状态
    function toggleMicrophone() {
        if (audioContext && audioContext.state === 'running') {
            stopAudioProcessing();
            updateUIStatus(false);
        } else {
            startAudioAnalysis();
        }
    }
    
    // 初始化页面
    initCanvas();
    micButton.addEventListener('click', toggleMicrophone);
    window.addEventListener('resize', initCanvas);
});