/**
 * together-listen-bubble.js — 一起听标准弹窗
 * 目录：js/features/together-listen-bubble.js
 * 包含：标准弹窗（头像+耳机+心电图+计时+最小化+背景上传）、持久化
 * 依赖：无（独立运行）
 * 接口：window._TLBubble 命名空间
 */

(function() {
    'use strict';

    // ============================================================
    // 状态
    // ============================================================

    var STORAGE_KEY = 'togetherListenData';

    var tlState = {
        isActive: false,
        startTime: null,
        elapsedSeconds: 0,
        isMinimized: false,
        bubbleBgImage: null,
        song: '',
        artist: '',
    };

    var timerInterval = null;
    var animationFrame = null;
    var ecgCanvas = null;
    var ecgCtx = null;
    var ballCanvas = null;
    var ballCtx = null;

    var bubbleEl = null;
    var ballEl = null;

    // 心电图进度
    var ecgProgress = 0;
    var lastTimestamp = 0;
    var hueOffset = 0;

    // ============================================================
    // 工具函数
    // ============================================================

    function getPartnerName() {
        return window.settings && window.settings.partnerName ? window.settings.partnerName : '梦角';
    }

    function getMyName() {
        return window.settings && window.settings.myName ? window.settings.myName : '我';
    }

    function getPartnerAvatarSrc() {
        var img = document.querySelector('#partner-avatar img');
        return img ? img.src : null;
    }

    function getMyAvatarSrc() {
        var img = document.querySelector('#my-avatar img');
        return img ? img.src : null;
    }

    function formatTime(seconds) {
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = Math.floor(seconds % 60);
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    // ============================================================
    // 存储
    // ============================================================

    function getStorageKey() {
        var prefix = window.APP_PREFIX || 'CHAT_APP_V3_';
        var sid = window.SESSION_ID || 'default';
        return prefix + sid + '_' + STORAGE_KEY;
    }

    function saveState() {
        try {
            var key = getStorageKey();
            var toSave = {
                isActive: tlState.isActive,
                startTime: tlState.startTime,
                elapsedSeconds: tlState.elapsedSeconds || 0,
                bubbleBgImage: tlState.bubbleBgImage || null,
                song: tlState.song || '',
                artist: tlState.artist || '',
            };
            localforage.setItem(key, toSave).catch(function() {});
        } catch (e) {
            console.warn('[TLBubble] 保存状态失败:', e);
        }
    }

    function loadState() {
        try {
            var key = getStorageKey();
            return localforage.getItem(key).then(function(saved) {
                if (saved) {
                    tlState.isActive = saved.isActive || false;
                    tlState.startTime = saved.startTime || null;
                    tlState.elapsedSeconds = saved.elapsedSeconds || 0;
                    tlState.bubbleBgImage = saved.bubbleBgImage || null;
                    tlState.song = saved.song || '';
                    tlState.artist = saved.artist || '';
                    if (tlState.isActive && tlState.startTime) {
                        var elapsed = (Date.now() - tlState.startTime) / 1000 + (tlState.elapsedSeconds || 0);
                        tlState.elapsedSeconds = elapsed;
                        return true;
                    }
                }
                return false;
            });
        } catch (e) {
            console.warn('[TLBubble] 加载状态失败:', e);
            return Promise.resolve(false);
        }
    }

    function clearState() {
        try {
            var key = getStorageKey();
            localforage.removeItem(key).catch(function() {});
        } catch (e) {}
        tlState.isActive = false;
        tlState.startTime = null;
        tlState.elapsedSeconds = 0;
        tlState.isMinimized = false;
    }

    // ============================================================
    // 创建标准弹窗
    // ============================================================

    function createBubble(song, artist) {
        var existing = document.querySelector('.tl-bubble');
        if (existing) existing.remove();
        var existingBall = document.querySelector('.tl-float-ball');
        if (existingBall) existingBall.remove();

        tlState.song = song || '';
        tlState.artist = artist || '';

        bubbleEl = document.createElement('div');
        bubbleEl.className = 'tl-bubble';
        bubbleEl.id = 'tl-bubble';

        var partnerAvatar = getPartnerAvatarSrc() || '';
        var myAvatar = getMyAvatarSrc() || '';

                bubbleEl.innerHTML = `
            <div class="tl-bubble-toolbar" style="display:flex;justify-content:space-between;align-items:center;width:100%;padding:0 2px;margin-bottom:4px;">
                <span style="display:flex;align-items:center;">
                    <button class="tl-tool-btn" id="tl-upload-btn" title="上传背景图片" style="color:rgba(255,255,255,0.5);font-size:12px;padding:2px 4px;background:none;border:none;cursor:pointer;"><i class="fas fa-image"></i></button>
                </span>
                <span style="display:flex;align-items:center;gap:6px;">
                    <button class="tl-tool-btn" id="tl-minimize-btn" title="最小化" style="color:rgba(255,255,255,0.5);font-size:12px;padding:2px 4px;background:none;border:none;cursor:pointer;"><i class="fas fa-minus"></i></button>
                    <button class="tl-tool-btn tl-close-btn" id="tl-close-btn" title="关闭" style="color:rgba(255,255,255,0.5);font-size:12px;padding:2px 4px;background:none;border:none;cursor:pointer;"><i class="fas fa-power-off"></i></button>
                </span>
            </div>
            <div class="tl-avatars" id="tl-avatars-container" style="position:relative;overflow:visible;display:flex;align-items:center;justify-content:center;height:60px;width:100%;">
    <div class="tl-avatar-item tl-avatar-left" style="width:44px;height:44px;border-radius:50%;overflow:hidden;flex-shrink:0;position:relative;transform:translateX(5px);z-index:2;">
        ${partnerAvatar ? '<img src="' + partnerAvatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' : '<i class="fas fa-user" style="font-size:20px;display:flex;align-items:center;justify-content:center;width:100%;height:100%;"></i>'}
    </div>
    <div class="tl-avatar-item tl-avatar-right" style="width:44px;height:44px;border-radius:50%;overflow:hidden;flex-shrink:0;position:relative;transform:translateX(-5px);z-index:1;">
        ${myAvatar ? '<img src="' + myAvatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' : '<i class="fas fa-user" style="font-size:20px;display:flex;align-items:center;justify-content:center;width:100%;height:100%;"></i>'}
    </div>
    <!-- 左耳机 -->
    <div class="tl-earphone" style="position:absolute;left:18px;top:50%;transform:translateY(-50%);width:7px;height:9px;border-radius:50%/55%;border:2px solid rgba(200,200,205,0.85);background:rgba(220,220,225,0.3);box-shadow:0 1px 4px rgba(0,0,0,0.1);pointer-events:none;z-index:10;box-sizing:border-box;"></div>
    <!-- 右耳机 -->
    <div class="tl-earphone" style="position:absolute;right:18px;top:50%;transform:translateY(-50%);width:7px;height:9px;border-radius:50%/55%;border:2px solid rgba(200,200,205,0.85);background:rgba(220,220,225,0.3);box-shadow:0 1px 4px rgba(0,0,0,0.1);pointer-events:none;z-index:10;box-sizing:border-box;"></div>
    <!-- 左耳机线 -->
    <div class="tl-cord" style="position:absolute;left:20px;top:calc(50% + 3px);width:2px;height:40px;background:linear-gradient(to bottom,rgba(180,180,190,0.6) 0%,rgba(180,180,190,0.1) 70%,transparent 100%);border-radius:2px;transform:rotate(6deg);transform-origin:top center;pointer-events:none;z-index:10;box-sizing:border-box;"></div>
    <!-- 右耳机线 -->
    <div class="tl-cord" style="position:absolute;right:20px;top:calc(50% + 3px);width:2px;height:40px;background:linear-gradient(to bottom,rgba(180,180,190,0.6) 0%,rgba(180,180,190,0.1) 70%,transparent 100%);border-radius:2px;transform:rotate(-6deg);transform-origin:top center;pointer-events:none;z-index:10;box-sizing:border-box;"></div>
</div>
            <div class="tl-wave-container">
                <canvas id="tl-ecg-canvas"></canvas>
            </div>
            <div class="tl-timer" id="tl-timer-display">00:00:00</div>
            <div class="tl-settings-panel" id="tl-settings-panel">
                <button class="tl-settings-btn" id="tl-upload-bg-btn"><i class="fas fa-upload"></i> 上传图片</button>
                <div class="tl-settings-divider"></div>
                <button class="tl-settings-btn tl-restore-btn" id="tl-restore-bg-btn"><i class="fas fa-undo"></i> 恢复原本样式</button>
            </div>
        `;

        document.body.appendChild(bubbleEl);

        // 初始化 ECG Canvas
        var canvas = bubbleEl.querySelector('#tl-ecg-canvas');
        if (canvas) {
            ecgCanvas = canvas;
            ecgCtx = canvas.getContext('2d');
            setupEcgCanvas(canvas);
        }

        // 绑定气泡事件
        bindBubbleEvents();

        // 应用背景
        if (tlState.bubbleBgImage) {
            applyBubbleBg(tlState.bubbleBgImage);
        }

        // 最小化悬浮球
        ballEl = document.createElement('div');
        ballEl.className = 'tl-float-ball';
        ballEl.id = 'tl-float-ball';
        ballEl.innerHTML = `
            <canvas id="tl-ball-canvas"></canvas>
            <div class="tl-ball-timer" id="tl-ball-timer">00:00:00</div>
        `;
        document.body.appendChild(ballEl);

        var ballCanvasEl = ballEl.querySelector('#tl-ball-canvas');
        if (ballCanvasEl) {
            ballCanvas = ballCanvasEl;
            ballCtx = ballCanvasEl.getContext('2d');
            setupBallCanvas(ballCanvasEl);
        }

        bindBallEvents();
        ballEl.classList.remove('active');
        tlState.isMinimized = false;

        console.log('[TLBubble] 标准弹窗已创建');
    }

    // ============================================================
    // Canvas 设置
    // ============================================================

    function setupEcgCanvas(canvas) {
        var container = canvas.parentElement;
        var dpr = window.devicePixelRatio || 1;
        var w = container.clientWidth || 200;
        var h = container.clientHeight || 48;

        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';

        var ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        canvas._w = w;
        canvas._h = h;
    }

    function setupBallCanvas(canvas) {
        var container = canvas.parentElement;
        var size = container.clientWidth || 56;
        var dpr = window.devicePixelRatio || 1;

        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';

        var ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        canvas._size = size;
    }

    // ============================================================
    // 心电图波形数据
    // ============================================================

    var ECG_WAVE_POINTS = [
        { x: 0.00, y: 0.00 },
        { x: 0.02, y: 0.00 },
        { x: 0.06, y: 0.08 },
        { x: 0.10, y: 0.25 },
        { x: 0.14, y: 0.35 },
        { x: 0.18, y: 0.25 },
        { x: 0.22, y: 0.08 },
        { x: 0.26, y: 0.00 },
        { x: 0.30, y: 0.00 },
        { x: 0.34, y: -0.08 },
        { x: 0.38, y: -0.95 },
        { x: 0.42, y: 0.20 },
        { x: 0.46, y: 0.00 },
        { x: 0.50, y: 0.00 },
        { x: 0.54, y: 0.00 },
        { x: 0.58, y: 0.10 },
        { x: 0.64, y: 0.30 },
        { x: 0.70, y: 0.45 },
        { x: 0.76, y: 0.30 },
        { x: 0.82, y: 0.10 },
        { x: 0.88, y: 0.00 },
        { x: 0.94, y: 0.00 },
        { x: 1.00, y: 0.00 },
    ];

    // ============================================================
    // 绘制心电图
    // ============================================================

    function drawECG(ctx, w, h, progress, isBall) {
        var padding = isBall ? 4 : 6;
        var drawW = w - padding * 2;
        var drawH = h - padding * 2;
        var midY = padding + drawH / 2;
        var amp = drawH / 2 * 0.85;

        ctx.clearRect(0, 0, w, h);

        ctx.shadowColor = 'rgba(100, 180, 255, 0.35)';
        ctx.shadowBlur = isBall ? 4 : 8;
        ctx.lineWidth = isBall ? 1.5 : 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        var visiblePoints = ECG_WAVE_POINTS.filter(function(p) { return p.x <= progress; });

        if (visiblePoints.length < 2) {
            ctx.beginPath();
            ctx.moveTo(padding, midY);
            ctx.lineTo(w - padding, midY);
            ctx.stroke();
            return;
        }

        ctx.beginPath();
        ctx.moveTo(padding, midY);

        for (var i = 0; i < visiblePoints.length; i++) {
            var pt = visiblePoints[i];
            var x = padding + pt.x * drawW;
            var y = midY + pt.y * amp;
            ctx.lineTo(x, y);
        }

        if (progress < 1) {
            var lastPt = visiblePoints[visiblePoints.length - 1];
            var lastX = padding + lastPt.x * drawW;
            ctx.lineTo(lastX, midY);
            ctx.lineTo(w - padding, midY);
        } else {
            ctx.lineTo(w - padding, midY);
        }

        ctx.stroke();

        // 发光层
        if (!isBall) {
            ctx.shadowColor = 'rgba(100, 180, 255, 0.15)';
            ctx.shadowBlur = 16;
            ctx.lineWidth = 4;
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath();
            ctx.moveTo(padding, midY);
            for (var j = 0; j < visiblePoints.length; j++) {
                var p = visiblePoints[j];
                var x2 = padding + p.x * drawW;
                var y2 = midY + p.y * amp;
                ctx.lineTo(x2, y2);
            }
            if (progress < 1) {
                var lastP = visiblePoints[visiblePoints.length - 1];
                var lastX2 = padding + lastP.x * drawW;
                ctx.lineTo(lastX2, midY);
                ctx.lineTo(w - padding, midY);
            } else {
                ctx.lineTo(w - padding, midY);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
        }

        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
    }

    // ============================================================
    // 绘制彩虹心电图（悬浮球）
    // ============================================================

    function drawRainbowECG(ctx, size, progress, hueOffset) {
        var padding = 4;
        var drawW = size - padding * 2;
        var drawH = size - padding * 2;
        var midY = padding + drawH / 2;
        var amp = drawH / 2 * 0.8;

        ctx.clearRect(0, 0, size, size);

        var visiblePoints = ECG_WAVE_POINTS.filter(function(p) { return p.x <= progress; });

        if (visiblePoints.length < 2) {
            ctx.beginPath();
            ctx.moveTo(padding, midY);
            ctx.lineTo(size - padding, midY);
            ctx.stroke();
            return;
        }

        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        var first = true;
        var prevX = padding;
        var prevY = midY;

        for (var i = 0; i < visiblePoints.length; i++) {
            var pt = visiblePoints[i];
            var x = padding + pt.x * drawW;
            var y = midY + pt.y * amp;
            var hue = (pt.x * 360 + hueOffset) % 360;
            ctx.strokeStyle = 'hsl(' + hue + ', 80%, 65%)';
            ctx.shadowColor = 'hsla(' + hue + ', 80%, 65%, 0.4)';
            ctx.shadowBlur = 6;

            if (first) {
                ctx.beginPath();
                ctx.moveTo(prevX, prevY);
                first = false;
            }
            ctx.lineTo(x, y);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(x, y);
            prevX = x;
            prevY = y;
        }

        if (progress < 1) {
            var lastPt = visiblePoints[visiblePoints.length - 1];
            var lastX = padding + lastPt.x * drawW;
            ctx.strokeStyle = 'hsl(' + ((lastPt.x * 360 + hueOffset) % 360) + ', 70%, 50%)';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.moveTo(lastX, prevY);
            ctx.lineTo(size - padding, midY);
            ctx.stroke();
        } else {
            var lastP2 = visiblePoints[visiblePoints.length - 1];
            var lastX2 = padding + lastP2.x * drawW;
            ctx.strokeStyle = 'hsl(' + ((lastP2.x * 360 + hueOffset) % 360) + ', 70%, 50%)';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.moveTo(lastX2, prevY);
            ctx.lineTo(size - padding, midY);
            ctx.stroke();
        }

        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
    }

    // ============================================================
    // 动画循环
    // ============================================================

    function startAnimation() {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
        lastTimestamp = 0;
        ecgProgress = 0;
        animateECG();
    }

    function animateECG(timestamp) {
        if (!tlState.isActive) {
            animationFrame = null;
            return;
        }

        if (!timestamp) timestamp = performance.now();

        var cycleDuration = 1000;
        if (lastTimestamp === 0) lastTimestamp = timestamp;
        var delta = timestamp - lastTimestamp;
        lastTimestamp = timestamp;

        ecgProgress = (ecgProgress + delta / cycleDuration) % 1;
        hueOffset = (hueOffset + delta * 0.003) % 360;

        if (ecgCanvas && ecgCtx) {
            var w = ecgCanvas._w || ecgCanvas.width / (window.devicePixelRatio || 1);
            var h = ecgCanvas._h || ecgCanvas.height / (window.devicePixelRatio || 1);
            drawECG(ecgCtx, w, h, ecgProgress, false);
        }

        if (ballCanvas && ballCtx && ballEl && ballEl.classList.contains('active')) {
            var size = ballCanvas._size || 56;
            drawRainbowECG(ballCtx, size, ecgProgress, hueOffset);
        }

        animationFrame = requestAnimationFrame(animateECG);
    }

    // ============================================================
    // 计时器
    // ============================================================

    function startTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        var startOffset = tlState.elapsedSeconds || 0;

        timerInterval = setInterval(function() {
            if (!tlState.isActive) {
                clearInterval(timerInterval);
                timerInterval = null;
                return;
            }
            var elapsed = (Date.now() - tlState.startTime) / 1000 + startOffset;
            tlState.elapsedSeconds = elapsed;
            updateTimerDisplay(elapsed);
            saveState();
        }, 1000);

        var initialElapsed = (Date.now() - tlState.startTime) / 1000 + startOffset;
        updateTimerDisplay(initialElapsed);
    }

    function updateTimerDisplay(seconds) {
        var display = document.getElementById('tl-timer-display');
        if (display) display.textContent = formatTime(seconds);
        var ballDisplay = document.getElementById('tl-ball-timer');
        if (ballDisplay) ballDisplay.textContent = formatTime(seconds);
    }

    // ============================================================
    // 显示/隐藏气泡
    // ============================================================

    function showBubble() {
        if (bubbleEl) {
            bubbleEl.classList.add('active');
        }
        if (ballEl) {
            ballEl.classList.remove('active');
        }
        tlState.isMinimized = false;
        startAnimation();
    }

    function showBall() {
        if (ballEl) {
            ballEl.classList.add('active');
            var canvas = ballEl.querySelector('#tl-ball-canvas');
            if (canvas) setupBallCanvas(canvas);
        }
        if (bubbleEl) {
            bubbleEl.classList.remove('active');
        }
        tlState.isMinimized = true;
    }

    function hideBall() {
        if (ballEl) {
            ballEl.classList.remove('active');
        }
        tlState.isMinimized = false;
    }

    // ============================================================
    // 绑定气泡事件
    // ============================================================

    function bindBubbleEvents() {
        if (!bubbleEl) return;

        var closeBtn = bubbleEl.querySelector('#tl-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                exitBubble();
            });
        }

        var minBtn = bubbleEl.querySelector('#tl-minimize-btn');
        if (minBtn) {
            minBtn.addEventListener('click', function() {
                showBall();
            });
        }

        var uploadBtn = bubbleEl.querySelector('#tl-upload-btn');
        var panel = bubbleEl.querySelector('#tl-settings-panel');
        if (uploadBtn && panel) {
            uploadBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                panel.classList.toggle('open');
            });
            document.addEventListener('click', function(e) {
                if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== uploadBtn) {
                    panel.classList.remove('open');
                }
            });
        }

        var uploadBgBtn = bubbleEl.querySelector('#tl-upload-bg-btn');
        if (uploadBgBtn) {
            uploadBgBtn.addEventListener('click', function() {
                var input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = function(e) {
                    var file = e.target.files[0];
                    if (!file) return;
                    var reader = new FileReader();
                    reader.onload = function(ev) {
                        var data = ev.target.result;
                        tlState.bubbleBgImage = data;
                        applyBubbleBg(data);
                        saveState();
                        var panel2 = bubbleEl.querySelector('#tl-settings-panel');
                        if (panel2) panel2.classList.remove('open');
                        if (typeof showNotification === 'function') {
                            showNotification('背景图片已更新', 'success');
                        }
                    };
                    reader.readAsDataURL(file);
                };
                input.click();
            });
        }

        var restoreBtn = bubbleEl.querySelector('#tl-restore-bg-btn');
        if (restoreBtn) {
            restoreBtn.addEventListener('click', function() {
                tlState.bubbleBgImage = null;
                applyBubbleBg(null);
                saveState();
                var panel2 = bubbleEl.querySelector('#tl-settings-panel');
                if (panel2) panel2.classList.remove('open');
                if (typeof showNotification === 'function') {
                    showNotification('已恢复原本样式', 'info');
                }
            });
        }

        makeDraggable(bubbleEl);
    }

    function applyBubbleBg(data) {
        if (!bubbleEl) return;
        if (data) {
            bubbleEl.style.backgroundImage = 'url(' + data + ')';
            bubbleEl.style.backgroundSize = 'cover';
            bubbleEl.style.backgroundPosition = 'center';
            bubbleEl.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            bubbleEl.style.backdropFilter = 'blur(12px)';
            bubbleEl.style.webkitBackdropFilter = 'blur(12px)';
        } else {
            bubbleEl.style.backgroundImage = '';
            bubbleEl.style.backgroundSize = '';
            bubbleEl.style.backgroundPosition = '';
            bubbleEl.style.backgroundColor = 'rgba(0, 0, 0, 0.55)';
            bubbleEl.style.backdropFilter = 'blur(24px) saturate(1.2)';
            bubbleEl.style.webkitBackdropFilter = 'blur(24px) saturate(1.2)';
        }
    }

    // ============================================================
    // 绑定小球事件
    // ============================================================

    function bindBallEvents() {
        if (!ballEl) return;

        ballEl.addEventListener('click', function(e) {
            if (ballEl._wasDragged) return;
            hideBall();
            showBubble();
        });

        makeDraggable(ballEl);
    }

    // ============================================================
    // 拖动功能
    // ============================================================

    function makeDraggable(el) {
        var dragStartX, dragStartY, dragOrigX, dragOrigY, dragMoved = false;

        el.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            var rect = el.getBoundingClientRect();
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            dragOrigX = rect.left;
            dragOrigY = rect.top;
            dragMoved = false;
            el.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('mousemove', function(e) {
            if (!el.classList.contains('dragging')) return;
            var dx = e.clientX - dragStartX;
            var dy = e.clientY - dragStartY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                dragMoved = true;
            }
            el.style.left = (dragOrigX + dx) + 'px';
            el.style.top = (dragOrigY + dy) + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', function() {
            if (el.classList.contains('dragging')) {
                el.classList.remove('dragging');
                if (dragMoved) {
                    el._wasDragged = true;
                    setTimeout(function() { el._wasDragged = false; }, 100);
                }
                dragMoved = false;
            }
        });

        el.addEventListener('touchstart', function(e) {
            var touch = e.touches[0];
            if (!touch) return;
            var rect = el.getBoundingClientRect();
            dragStartX = touch.clientX;
            dragStartY = touch.clientY;
            dragOrigX = rect.left;
            dragOrigY = rect.top;
            dragMoved = false;
            el.classList.add('dragging');
        }, { passive: true });

        el.addEventListener('touchmove', function(e) {
            if (!el.classList.contains('dragging')) return;
            var touch = e.touches[0];
            if (!touch) return;
            var dx = touch.clientX - dragStartX;
            var dy = touch.clientY - dragStartY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                dragMoved = true;
            }
            el.style.left = (dragOrigX + dx) + 'px';
            el.style.top = (dragOrigY + dy) + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            e.preventDefault();
        }, { passive: false });

        el.addEventListener('touchend', function() {
            if (el.classList.contains('dragging')) {
                el.classList.remove('dragging');
                if (dragMoved) {
                    el._wasDragged = true;
                    setTimeout(function() { el._wasDragged = false; }, 100);
                }
                dragMoved = false;
            }
        });
    }

        // ============================================================
    // 退出气泡（带时长通知）
    // ============================================================

    function exitBubble() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }

        if (bubbleEl) {
            bubbleEl.classList.remove('active');
            bubbleEl.remove();
            bubbleEl = null;
        }
        if (ballEl) {
            ballEl.classList.remove('active');
            ballEl.remove();
            ballEl = null;
        }

        // 计算时长
        var durationSeconds = tlState.elapsedSeconds || 0;
        var durationText = formatTime(durationSeconds);

        tlState.isActive = false;
        tlState.startTime = null;
        tlState.elapsedSeconds = 0;
        tlState.isMinimized = false;

        clearState();

                // 系统消息到聊天对话框（带时长）
        if (typeof window.addMessage === 'function') {
            window.addMessage({
                id: Date.now() + Math.random(),
                sender: 'system',
                text: '🎵 一起听已结束 · 陪伴了 ' + durationText,
                timestamp: new Date(),
                type: 'system'
            });
        }
        console.log('[TLBubble] 已退出一起听，时长:', durationText);
    }

    // ============================================================
    // 恢复（刷新页面后恢复计时）
    // ============================================================

    function restoreBubble() {
        loadState().then(function(hasState) {
            if (!hasState || !tlState.isActive) {
                return;
            }

            // 检查是否过期（超过24小时自动失效）
            if (tlState.startTime && (Date.now() - tlState.startTime) > 24 * 60 * 60 * 1000) {
                clearState();
                return;
            }

            var song = tlState.song || '未知歌曲';
            var artist = tlState.artist || '未知歌手';

            createBubble(song, artist);
            showBubble();

            // 重新设置开始时间，保持累计秒数
            tlState.startTime = Date.now();
            startTimer();

            console.log('[TLBubble] 已恢复一起听');
            if (typeof showNotification === 'function') {
                showNotification('已恢复一起听', 'info', 2000);
            }
        });
    }

    // ============================================================
    // 启动（对外接口）
    // ============================================================

    function start(song, artist) {
        console.log('[TLBubble] start 被调用:', song, artist);

        if (tlState.isActive) {
            console.log('[TLBubble] 已激活，不重复启动');
            return;
        }

        tlState.isActive = true;
        tlState.startTime = Date.now();
        tlState.elapsedSeconds = 0;
        tlState.song = song || '';
        tlState.artist = artist || '';

        createBubble(song, artist);
        saveState();
        startTimer();
        showBubble();

        console.log('[TLBubble] 标准弹窗已启动');
    }

    // ============================================================
    // 对外接口
    // ============================================================

    window._TLBubble = {
        start: start,
        exit: exitBubble,
        restore: restoreBubble,
        // 暴露状态供调试
        getState: function() {
            return {
                isActive: tlState.isActive,
                elapsedSeconds: tlState.elapsedSeconds,
                isMinimized: tlState.isMinimized,
                song: tlState.song,
                artist: tlState.artist,
            };
        },
    };

    // ============================================================
    // 自动恢复
    // ============================================================

    // 延迟启动恢复，确保页面完全加载
    setTimeout(function() {
        restoreBubble();
    }, 1500);

    console.log('[TLBubble] 🎯 标准弹窗模块已加载');
    console.log('[TLBubble] 接口: window._TLBubble.start(song, artist)');
    console.log('[TLBubble] 接口: window._TLBubble.exit()');

})();
