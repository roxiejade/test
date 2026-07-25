/**
 * together-listen.js — 一起听功能核心逻辑
 * 依赖：core.js（addMessage, DOMElements, settings, getPartnerName, getMyName）
 * 目录：js/features/together-listen.js
 */

(function () {
    'use strict';

    // ─── 常量 ────────────────────────────────────────────────────────────────

    const STORAGE_KEY = 'togetherListenData';

    // 拒绝文案（按次数）
    const REJECT_MESSAGES = [
        '现在有点忙哦，你自己先听吧',
        '今天真的不行呢，抱歉啦 🥺',
        '对不起······',
    ];

    // 同意文案池
    const ACCEPT_MESSAGES = [
        '好，我也想跟你一起听 🎧',
        '这首歌我也好喜欢，一起听吧 💕',
        '你分享的音乐，我都有认真在听',
        '我们的专属歌单',
        '我听到了，果然是你会喜欢的',
    ];

    // ─── 状态 ────────────────────────────────────────────────────────────────

    let tlState = {
        isActive: false,
        startTime: null,
        elapsedSeconds: 0,
        rejectCount: 0,
        feedbackCardId: null,
        inviteCardId: null,
        isMinimized: false,
        bubbleBgImage: null,
    };

    let timerInterval = null;
    let animationFrame = null;
    let ecgCanvas = null;
    let ecgCtx = null;
    let ballCanvas = null;
    let ballCtx = null;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragOrigX = 0;
    let dragOrigY = 0;
    let dragMoved = false;

    let bubbleEl = null;
    let ballEl = null;
    let settingsPanel = null;

    // 防止重复触发
    let isProcessing = false;
    let pasteModalInstance = null;

    // ─── 工具函数 ────────────────────────────────────────────────────────────

    function getPartnerName() {
        return window.settings?.partnerName || '梦角';
    }

    function getMyName() {
        return window.settings?.myName || '我';
    }

    function getPartnerAvatarSrc() {
        const img = document.querySelector('#partner-avatar img, [id*="partner-avatar"] img, .partner-avatar img');
        return img ? img.src : null;
    }

    function getMyAvatarSrc() {
        const img = document.querySelector('#my-avatar img, [id*="my-avatar"] img, .my-avatar img');
        return img ? img.src : null;
    }

    function getRandomItem(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ─── 存储 ────────────────────────────────────────────────────────────────

    function getStorageKey() {
        const prefix = window.APP_PREFIX || 'CHAT_APP_V3_';
        const sid = window.SESSION_ID || 'default';
        return prefix + sid + '_' + STORAGE_KEY;
    }

    async function loadState() {
        try {
            const key = getStorageKey();
            const saved = await localforage.getItem(key);
            if (saved) {
                tlState = Object.assign(tlState, saved);
                if (tlState.isActive && tlState.startTime) {
                    const elapsed = (Date.now() - tlState.startTime) / 1000 + (tlState.elapsedSeconds || 0);
                    tlState.elapsedSeconds = elapsed;
                    return true;
                }
            }
        } catch (e) {
            console.warn('[together-listen] 加载状态失败:', e);
        }
        return false;
    }

    async function saveState() {
        try {
            const key = getStorageKey();
            const toSave = {
                isActive: tlState.isActive,
                startTime: tlState.startTime,
                elapsedSeconds: tlState.elapsedSeconds || 0,
                rejectCount: tlState.rejectCount || 0,
                feedbackCardId: tlState.feedbackCardId || null,
                inviteCardId: tlState.inviteCardId || null,
                bubbleBgImage: tlState.bubbleBgImage || null,
            };
            await localforage.setItem(key, toSave);
        } catch (e) {
            console.warn('[together-listen] 保存状态失败:', e);
        }
    }

    async function clearState() {
        try {
            const key = getStorageKey();
            await localforage.removeItem(key);
        } catch (e) {
            console.warn('[together-listen] 清除状态失败:', e);
        }
        tlState.isActive = false;
        tlState.startTime = null;
        tlState.elapsedSeconds = 0;
        tlState.rejectCount = 0;
        tlState.feedbackCardId = null;
        tlState.inviteCardId = null;
        tlState.isMinimized = false;
    }

    // ─── 通知 ────────────────────────────────────────────────────────────────

    function notify(msg, type, duration) {
        if (typeof showNotification === 'function') {
            showNotification(msg, type, duration || 3000);
        } else {
            console.log('[together-listen]', msg);
        }
    }

    // ─── 解析链接 ────────────────────────────────────────────────────────────

    function parseQQMusicLink(text) {
        const songMatch = text.match(/《([^》]+)》/);
        const song = songMatch ? songMatch[1].trim() : null;
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        const url = urlMatch ? urlMatch[0] : null;
        return { song, url };
    }

    function isValidQQMusicUrl(url) {
        if (!url) return false;
        return url.includes('c6.y.qq.com') || url.includes('y.qq.com');
    }

    // ─── 添加聊天消息 ──────────────────────────────────────────────────────

    function addChatMessage(data) {
        if (typeof window.addMessage === 'function') {
            window.addMessage(data);
        } else if (window.messages && Array.isArray(window.messages)) {
            window.messages.push(data);
            if (typeof window.renderMessages === 'function') {
                window.renderMessages();
            }
            if (typeof window.throttledSaveData === 'function') {
                window.throttledSaveData();
            }
        }
    }

    // ─── 生成音乐卡片 HTML ─────────────────────────────────────────────────

    function createMusicCardHTML(song, artist, statusText, statusClass) {
        const artistDisplay = artist || '未知歌手';
        const songDisplay = song || '未知歌曲';
        return `
            <div class="tl-music-card">
                <div class="tl-card-top">
                    <div class="tl-card-cover">
                        <i class="fas fa-record-vinyl"></i>
                    </div>
                    <div class="tl-card-info">
                        <div class="tl-card-song">${escapeHtml(songDisplay)}</div>
                        <div class="tl-card-artist">${escapeHtml(artistDisplay)}</div>
                    </div>
                </div>
                <div class="tl-card-divider"></div>
                <div class="tl-card-status ${statusClass || ''}">${statusText}</div>
            </div>
        `;
    }

    // ─── 生成邀请卡片 ──────────────────────────────────────────────────────

    function createInviteCard(song, artist) {
        const partnerName = getPartnerName();
        const statusText = partnerName + ' 邀请你一起听';
        const cardHtml = createMusicCardHTML(song, artist, statusText);

        const msg = {
            id: Date.now() + Math.random(),
            sender: 'system',
            text: '',
            timestamp: new Date(),
            status: 'received',
            type: 'normal',
            html: cardHtml,
            isTogetherListenCard: true,
            cardType: 'invite',
            song: song,
            artist: artist,
            favorited: false,
            note: null,
        };
        tlState.inviteCardId = msg.id;
        return msg;
    }

    // ─── 生成反馈卡片 ──────────────────────────────────────────────────────

    function createFeedbackCard(song, artist, accepted) {
        const statusText = accepted ? '✅ 同意邀请' : '❌ 拒绝邀请';
        const statusClass = accepted ? 'tl-status-accepted' : 'tl-status-rejected';
        const cardHtml = createMusicCardHTML(song, artist, statusText, statusClass);

        const msg = {
            id: Date.now() + Math.random(),
            sender: 'system',
            text: '',
            timestamp: new Date(),
            status: 'received',
            type: 'normal',
            html: cardHtml,
            isTogetherListenCard: true,
            cardType: 'feedback',
            accepted: accepted,
            song: song,
            artist: artist,
            favorited: false,
            note: null,
        };
        tlState.feedbackCardId = msg.id;
        return msg;
    }

    // ─── 更新反馈卡片状态 ──────────────────────────────────────────────────

    function updateFeedbackCard(accepted) {
        if (!tlState.feedbackCardId) return;
        const statusText = accepted ? '✅ 同意邀请' : '❌ 拒绝邀请';
        const statusClass = accepted ? 'tl-status-accepted' : 'tl-status-rejected';

        const container = document.getElementById('chat-container');
        if (!container) return;

        const wrapper = container.querySelector('[data-msg-id="' + tlState.feedbackCardId + '"]');
        if (!wrapper) return;

        const card = wrapper.querySelector('.tl-music-card');
        if (!card) return;

        const statusEl = card.querySelector('.tl-card-status');
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.className = 'tl-card-status ' + statusClass;
        }

        const msgIndex = window.messages ? window.messages.findIndex(function(m) { return String(m.id) === String(tlState.feedbackCardId); }) : -1;
        if (msgIndex !== -1 && window.messages) {
            window.messages[msgIndex].accepted = accepted;
        }
    }

    // ─── 删除卡片 ──────────────────────────────────────────────────────────

    function removeTogetherListenCards() {
        var container = document.getElementById('chat-container');
        if (!container) return;

        var ids = [tlState.inviteCardId, tlState.feedbackCardId].filter(Boolean);
        ids.forEach(function(id) {
            var wrapper = container.querySelector('[data-msg-id="' + id + '"]');
            if (wrapper) wrapper.remove();
        });

        if (window.messages && Array.isArray(window.messages)) {
            window.messages = window.messages.filter(function(m) {
                return ids.indexOf(m.id) === -1;
            });
        }

        tlState.inviteCardId = null;
        tlState.feedbackCardId = null;
    }

    // ─── 发送聊天事件 ──────────────────────────────────────────────────────

    function sendChatEvent(icon, label, detail) {
        if (typeof window._addCallEvent === 'function') {
            window._addCallEvent(icon, label, detail);
        }
    }

    // ─── 全屏反馈弹窗 ──────────────────────────────────────────────────────

    function showFeedbackOverlay(accepted, song, artist, onRetry, onExit) {
        var existing = document.querySelector('.tl-feedback-overlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.className = 'tl-feedback-overlay active';

        var partnerName = getPartnerName();
        var avatarSrc = getPartnerAvatarSrc();

        var text, buttonsHtml;

        if (accepted) {
            text = getRandomItem(ACCEPT_MESSAGES);
            buttonsHtml = '';
            // 同意：1.5 秒后自动关闭
            setTimeout(function() {
                if (overlay.isConnected) {
                    overlay.classList.remove('active');
                    setTimeout(function() { overlay.remove(); }, 350);
                }
                onAcceptConfirmed(song, artist);
            }, 1500);
        } else {
            var rejectIdx = Math.min(tlState.rejectCount || 0, REJECT_MESSAGES.length - 1);
            text = REJECT_MESSAGES[rejectIdx] || REJECT_MESSAGES[REJECT_MESSAGES.length - 1];
            buttonsHtml = `
                <button class="modal-btn modal-btn-primary" id="tl-retry-btn">再试一次</button>
                <button class="modal-btn modal-btn-secondary" id="tl-exit-btn">退出</button>
            `;
        }

        var avatarHtml = avatarSrc
            ? '<img src="' + avatarSrc + '" alt="">'
            : '<i class="fas fa-user"></i>';

        overlay.innerHTML = `
            <div class="tl-feedback-card">
                <div class="tl-fb-avatar">${avatarHtml}</div>
                <div class="tl-fb-text">${text}</div>
                <div class="tl-fb-buttons">${buttonsHtml}</div>
            </div>
        `;

        document.body.appendChild(overlay);

        if (!accepted) {
            var retryBtn = overlay.querySelector('#tl-retry-btn');
            var exitBtn = overlay.querySelector('#tl-exit-btn');

            if (retryBtn) {
                retryBtn.addEventListener('click', function() {
                    overlay.remove();
                    if (typeof onRetry === 'function') onRetry();
                });
            }
            if (exitBtn) {
                exitBtn.addEventListener('click', function() {
                    overlay.remove();
                    if (typeof onExit === 'function') onExit();
                });
            }
        }
    }

    // ─── 同意确认后的流程 ──────────────────────────────────────────────────

    function onAcceptConfirmed(song, artist) {
        var feedbackMsg = createFeedbackCard(song, artist, true);
        addChatMessage(feedbackMsg);
        startTogetherListen(song, artist);
    }

    // ─── 启动计时器和气泡 ──────────────────────────────────────────────────

    function startTogetherListen(song, artist) {
        if (tlState.isActive) return;

        tlState.isActive = true;
        tlState.startTime = Date.now();
        tlState.elapsedSeconds = 0;

        createBubble(song, artist);
        saveState();
        startTimer();
        showBubble();

        sendChatEvent('fa-headphones', getPartnerName() + ' 同意了你的一起听邀请', '🎵 正在一起听');
    }

    // ─── 创建气泡 DOM ──────────────────────────────────────────────────────

    function createBubble(song, artist) {
        var existing = document.querySelector('.tl-bubble');
        if (existing) existing.remove();
        var existingBall = document.querySelector('.tl-float-ball');
        if (existingBall) existingBall.remove();

        // 标准弹窗
        bubbleEl = document.createElement('div');
        bubbleEl.className = 'tl-bubble';
        bubbleEl.id = 'tl-bubble';

        var partnerAvatar = getPartnerAvatarSrc() || '';
        var myAvatar = getMyAvatarSrc() || '';

        bubbleEl.innerHTML = `
            <div class="tl-bubble-toolbar">
                <button class="tl-tool-btn" id="tl-upload-btn" title="上传背景图片"><i class="fas fa-image"></i></button>
                <button class="tl-tool-btn" id="tl-minimize-btn" title="最小化"><i class="fas fa-minus"></i></button>
                <button class="tl-tool-btn tl-close-btn" id="tl-close-btn" title="关闭"><i class="fas fa-power-off"></i></button>
            </div>
            <div class="tl-avatars">
                <div class="tl-avatar-item tl-avatar-left">
                    ${partnerAvatar ? '<img src="' + partnerAvatar + '">' : '<i class="fas fa-user"></i>'}
                    <div class="tl-earphone tl-earphone-left"></div>
                </div>
                <div class="tl-avatar-item tl-avatar-right">
                    ${myAvatar ? '<img src="' + myAvatar + '">' : '<i class="fas fa-user"></i>'}
                    <div class="tl-earphone tl-earphone-right"></div>
                </div>
                <div class="tl-cord tl-cord-left"></div>
                <div class="tl-cord tl-cord-right"></div>
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

        // 初始化 Canvas
        var canvas = bubbleEl.querySelector('#tl-ecg-canvas');
        if (canvas) {
            ecgCanvas = canvas;
            ecgCtx = canvas.getContext('2d');
            setupEcgCanvas(canvas);
        }

        bindBubbleEvents();

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
    }

    // ─── 设置 Canvas ──────────────────────────────────────────────────────

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
        return { w: w, h: h, ctx: ctx };
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
        return { size: size, ctx: ctx };
    }

    // ─── 心电图波形数据 ────────────────────────────────────────────────────

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

    // ─── 绘制心电图 ──────────────────────────────────────────────────────

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

    // ─── 绘制彩虹心电图 ──────────────────────────────────────────────────

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

    // ─── 动画循环 ──────────────────────────────────────────────────────────

    var ecgProgress = 0;
    var lastTimestamp = 0;
    var hueOffset = 0;

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

    // ─── 计时器 ─────────────────────────────────────────────────────────────

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

    // ─── 显示/隐藏气泡 ─────────────────────────────────────────────────────

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

    // ─── 绑定气泡事件 ──────────────────────────────────────────────────────

    function bindBubbleEvents() {
        if (!bubbleEl) return;

        var closeBtn = bubbleEl.querySelector('#tl-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                exitTogetherListen();
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
                        notify('背景图片已更新', 'success');
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
                notify('已恢复原本样式', 'info');
            });
        }

        makeDraggable(bubbleEl);
    }

    // ─── 应用气泡背景 ──────────────────────────────────────────────────────

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

    // ─── 绑定小球事件 ──────────────────────────────────────────────────────

    function bindBallEvents() {
        if (!ballEl) return;

        ballEl.addEventListener('click', function(e) {
            if (ballEl._wasDragged) return;
            hideBall();
            showBubble();
        });

        makeDraggable(ballEl);
    }

    // ─── 拖动功能 ──────────────────────────────────────────────────────────

    function makeDraggable(el) {
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

    // ─── 退出一起听 ──────────────────────────────────────────────────────

    function exitTogetherListen() {
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

        removeTogetherListenCards();

        tlState.isActive = false;
        tlState.startTime = null;
        tlState.elapsedSeconds = 0;
        tlState.rejectCount = 0;
        tlState.isMinimized = false;

        clearState();
        sendChatEvent('fa-headphones', '一起听已结束', '🎵');
        notify('已退出一起听', 'info', 2000);
    }

    // ─── 粘贴链接弹窗 ──────────────────────────────────────────────────────

    function showPasteModal(onSuccess) {
        // 如果已有弹窗，先移除
        var existing = document.getElementById('tl-paste-modal');
        if (existing) {
            existing.remove();
            pasteModalInstance = null;
        }

        // 如果正在处理，防止重复
        if (isProcessing) return;
        isProcessing = true;

        var modal = document.createElement('div');
        modal.className = 'modal tl-paste-modal';
        modal.id = 'tl-paste-modal';
        modal.style.display = 'flex';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-title">
                    <i class="fas fa-link"></i>
                    <span>粘贴一起听链接</span>
                </div>
                <textarea class="tl-paste-textarea" id="tl-paste-input" placeholder="粘贴QQ音乐分享内容，例如：&#10;#QQ音乐# 快来跟我一起听《爱，宇宙，诗王座》 https://c6.y.qq.com/... @QQ音乐"></textarea>
                <div class="tl-extract-hint" id="tl-extract-hint" style="display:none;">
                    <i class="fas fa-check-circle"></i>
                    已识别歌曲：<span id="tl-extract-song">—</span>
                </div>
                <div class="tl-manual-fields" id="tl-manual-fields" style="display:none;">
                    <label class="tl-label">🎵 歌曲名</label>
                    <input class="tl-input" id="tl-song-input" placeholder="请输入歌曲名">
                    <label class="tl-label">🎤 歌手名</label>
                    <input class="tl-input" id="tl-artist-input" placeholder="请输入歌手名（可选）">
                    <div class="tl-hint-text">未识别到歌名，请手动填写</div>
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn modal-btn-secondary" id="tl-paste-cancel">取消</button>
                    <button class="modal-btn modal-btn-primary" id="tl-paste-confirm">确认</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        pasteModalInstance = modal;

        // 自动聚焦
        setTimeout(function() {
            var input = document.getElementById('tl-paste-input');
            if (input) input.focus();
        }, 300);

        // 实时解析
        var pasteInput = document.getElementById('tl-paste-input');
        var extractHint = document.getElementById('tl-extract-hint');
        var extractSong = document.getElementById('tl-extract-song');
        var manualFields = document.getElementById('tl-manual-fields');
        var songInput = document.getElementById('tl-song-input');
        var artistInput = document.getElementById('tl-artist-input');

        var currentSong = null;
        var currentUrl = null;

        function parseInput() {
            var text = pasteInput ? pasteInput.value : '';
            var parsed = parseQQMusicLink(text);
            currentSong = parsed.song;
            currentUrl = parsed.url;

            if (currentSong) {
                extractHint.style.display = 'flex';
                if (extractSong) extractSong.textContent = currentSong;
                manualFields.style.display = 'none';
            } else {
                extractHint.style.display = 'none';
                if (text.trim()) {
                    manualFields.style.display = 'block';
                } else {
                    manualFields.style.display = 'none';
                }
            }
        }

        if (pasteInput) {
            pasteInput.addEventListener('input', parseInput);
        }

        // 取消
        var cancelBtn = document.getElementById('tl-paste-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                if (modal.isConnected) modal.remove();
                pasteModalInstance = null;
                isProcessing = false;
            });
        }

        // 确认
        var confirmBtn = document.getElementById('tl-paste-confirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
                var text = pasteInput ? pasteInput.value : '';

                var song = currentSong;
                var artist = '未知歌手';

                if (!song) {
                    var manualSong = songInput ? songInput.value.trim() : '';
                    var manualArtist = artistInput ? artistInput.value.trim() : '';
                    if (manualSong) {
                        song = manualSong;
                        artist = manualArtist || '未知歌手';
                    } else {
                        notify('请粘贴QQ音乐分享内容，或手动输入歌曲名', 'warning');
                        return;
                    }
                }

                if (currentUrl && !isValidQQMusicUrl(currentUrl)) {
                    notify('请粘贴有效的QQ音乐链接', 'warning');
                    return;
                }

                if (modal.isConnected) modal.remove();
                pasteModalInstance = null;
                isProcessing = false;

                if (typeof onSuccess === 'function') {
                    onSuccess(song, artist, currentUrl);
                }
            });
        }

        // 点击遮罩关闭
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
                pasteModalInstance = null;
                isProcessing = false;
            }
        });

        // 确保在弹窗关闭时释放锁
        var observer = new MutationObserver(function() {
            if (!modal.isConnected) {
                pasteModalInstance = null;
                isProcessing = false;
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true });
    }

    // ─── 手机端：尝试唤起 QQ音乐 ──────────────────────────────────────────

    function tryOpenQQMusicWithFallback(callback) {
        var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        if (!isMobile) {
            if (typeof callback === 'function') callback();
            return;
        }

        try {
            var iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = 'qqmusic://today';
            document.body.appendChild(iframe);
            setTimeout(function() {
                if (iframe.parentNode) iframe.remove();
            }, 3000);

            // 3秒超时检测
            var timeoutId = setTimeout(function() {
                if (!document.hidden) {
                    notify('未能打开QQ音乐，请手动打开APP复制"一起听"链接后返回', 'info', 4000);
                    if (typeof callback === 'function') callback();
                }
            }, 3000);

            // 页面可见时（用户从QQ音乐切回）
            var onVisibilityChange = function() {
                if (document.visibilityState === 'visible') {
                    clearTimeout(timeoutId);
                    document.removeEventListener('visibilitychange', onVisibilityChange);
                    if (typeof callback === 'function') callback();
                }
            };
            document.addEventListener('visibilitychange', onVisibilityChange);

        } catch (e) {
            console.warn('[together-listen] 唤起QQ音乐失败:', e);
            if (typeof callback === 'function') callback();
        }
    }

    // ─── 入口：处理顶部按钮点击 ──────────────────────────────────────────

    function handleEntryClick() {
        if (tlState.isActive) {
            notify('已在一起听中', 'info', 1500);
            return;
        }

        // 防止快速重复点击
        if (isProcessing) return;

        var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

        if (isMobile) {
            // 手机端：先尝试唤起 QQ音乐
            tryOpenQQMusicWithFallback(function() {
                // 用户从 QQ音乐返回 或 超时后，显示粘贴弹窗
                showPasteModal(startTogetherListenFlow);
            });
        } else {
            // 电脑端
            alert('请使用手机QQ音乐复制"一起听"链接，然后回到本页面继续操作。');
            // 延迟显示弹窗，确保 alert 完全关闭
            setTimeout(function() {
                showPasteModal(startTogetherListenFlow);
            }, 150);
        }
    }

    // ─── 开始一起听流程 ──────────────────────────────────────────────────

    function startTogetherListenFlow(song, artist, url) {
        var songName = song || '未知歌曲';
        var artistName = artist || '未知歌手';

        var inviteMsg = createInviteCard(songName, artistName);
        addChatMessage(inviteMsg);

        triggerFeedback(songName, artistName);
    }

    // ─── 触发梦角反馈 ──────────────────────────────────────────────────────

    function triggerFeedback(song, artist) {
        var accepted = Math.random() < 0.7;

        if (accepted) {
            showFeedbackOverlay(true, song, artist, null, null);
        } else {
            tlState.rejectCount = (tlState.rejectCount || 0) + 1;
            var feedbackMsg = createFeedbackCard(song, artist, false);
            addChatMessage(feedbackMsg);

            showFeedbackOverlay(false, song, artist, function() {
                tlState.rejectCount = (tlState.rejectCount || 0) + 1;
                updateFeedbackCard(false);
                triggerFeedback(song, artist);
            }, function() {
                removeTogetherListenCards();
                tlState.rejectCount = 0;
                saveState();
                notify('已退出一起听', 'info', 2000);
            });
        }
    }

    // ─── 恢复计时 ──────────────────────────────────────────────────────────

    async function restoreTogetherListen() {
        var hasState = await loadState();
        if (!hasState || !tlState.isActive) return;

        if (tlState.startTime && (Date.now() - tlState.startTime) > 24 * 60 * 60 * 1000) {
            await clearState();
            return;
        }

        var song = '未知歌曲';
        var artist = '未知歌手';

        if (window.messages && Array.isArray(window.messages)) {
            var feedbackMsg = window.messages.find(function(m) { return m.id === tlState.feedbackCardId; });
            if (feedbackMsg) {
                song = feedbackMsg.song || '未知歌曲';
                artist = feedbackMsg.artist || '未知歌手';
            }
        }

        createBubble(song, artist);
        showBubble();
        tlState.startTime = Date.now();
        startTimer();
        notify('已恢复一起听', 'info', 2000);
    }

    // ─── 初始化 ─────────────────────────────────────────────────────────────

    function init() {
        restoreTogetherListen();

        document.addEventListener('click', function(e) {
            var btn = e.target.closest('#together-listen-btn');
            if (btn) {
                e.preventDefault();
                e.stopPropagation();
                handleEntryClick();
            }
        }, true);

        console.log('[together-listen] 模块已加载');
    }

    // ─── 暴露到全局 ─────────────────────────────────────────────────────────

    window.togetherListen = {
        init: init,
        handleEntryClick: handleEntryClick,
        showPasteModal: showPasteModal,
        startTogetherListenFlow: startTogetherListenFlow,
        exitTogetherListen: exitTogetherListen,
        restoreTogetherListen: restoreTogetherListen,
        testAccept: function() {
            var originalRandom = Math.random;
            Math.random = function() { return 0.8; };
            handleEntryClick();
            setTimeout(function() { Math.random = originalRandom; }, 3000);
        },
        testReject: function() {
            var originalRandom = Math.random;
            Math.random = function() { return 0.2; };
            handleEntryClick();
            setTimeout(function() { Math.random = originalRandom; }, 3000);
        },
        exit: exitTogetherListen,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }

// ============================================================
// 一起听功能 - 核心入口（稳定版）
// ============================================================

(function() {
    'use strict';

    // ─── 初始化命名空间 ──────────────────────────────────────
    if (!window._TL) {
        window._TL = {};
    }

    // ─── 弹窗函数 ──────────────────────────────────────────────
    window._TL.showModal = function(onSuccess) {
        console.log('[TL] 显示弹窗');

        var old = document.getElementById('tl-final-modal');
        if (old) old.remove();

        var overlay = document.createElement('div');
        overlay.id = 'tl-final-modal';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';

        // 检测主题
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        var bgColor = isDark ? '#1e1e1e' : '#ffffff';
        var textColor = isDark ? '#e5e5e5' : '#1a1a1a';
        var subColor = isDark ? '#8c8c8c' : '#7a7a7a';
        var borderColor = isDark ? '#2f2f2f' : '#ebebeb';
        var inputBg = isDark ? '#121212' : '#f9f9f9';
        var cancelBg = isDark ? '#2a2a2a' : '#f0f0f0';
        var cancelText = isDark ? '#e5e5e5' : '#333';
        var accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#c5a47e';

        overlay.innerHTML = `
            <div style="background:${bgColor};border-radius:16px;padding:24px;width:400px;max-width:92vw;box-shadow:0 24px 80px rgba(0,0,0,0.4);border:1px solid ${borderColor};">
                <div style="font-size:17px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:10px;color:${textColor};">
                    <span style="font-size:20px;">🔗</span>
                    <span>粘贴一起听链接</span>
                </div>
                <textarea id="tl-final-input" style="width:100%;padding:12px;border:1.5px solid ${borderColor};border-radius:10px;font-size:14px;font-family:var(--font-family, sans-serif);resize:vertical;min-height:80px;outline:none;box-sizing:border-box;background:${inputBg};color:${textColor};transition:border-color 0.2s;" placeholder="粘贴QQ音乐分享内容，例如：&#10;#QQ音乐# 快来跟我一起听《爱，宇宙，诗王座》 https://c6.y.qq.com/... @QQ音乐"></textarea>
                <div id="tl-final-hint" style="display:none;font-size:13px;color:${accentColor};margin:8px 0 4px;">✅ 已识别歌曲：<span id="tl-final-song">—</span></div>
                <div id="tl-final-manual" style="display:none;margin-top:12px;padding-top:12px;border-top:1px dashed ${borderColor};">
                    <label style="font-size:13px;color:${subColor};display:block;margin-bottom:4px;">🎵 歌曲名</label>
                    <input id="tl-final-song-input" style="width:100%;padding:10px 12px;border:1.5px solid ${borderColor};border-radius:8px;font-size:14px;font-family:var(--font-family, sans-serif);margin-bottom:10px;outline:none;box-sizing:border-box;background:${inputBg};color:${textColor};" placeholder="请输入歌曲名">
                    <label style="font-size:13px;color:${subColor};display:block;margin-bottom:4px;">🎤 歌手名</label>
                    <input id="tl-final-artist-input" style="width:100%;padding:10px 12px;border:1.5px solid ${borderColor};border-radius:8px;font-size:14px;font-family:var(--font-family, sans-serif);margin-bottom:10px;outline:none;box-sizing:border-box;background:${inputBg};color:${textColor};" placeholder="请输入歌手名">
                    <div style="font-size:12px;color:${subColor};opacity:0.7;">未识别到歌名，请手动填写</div>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:16px;">
                    <button id="tl-final-cancel" style="padding:10px 24px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:${cancelBg};color:${cancelText};transition:background 0.2s;">取消</button>
                    <button id="tl-final-confirm" style="padding:10px 24px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:${accentColor};color:#fff;transition:opacity 0.2s;">确认</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        console.log('[TL] 弹窗已添加到页面');

        setTimeout(function() {
            var inp = document.getElementById('tl-final-input');
            if (inp) inp.focus();
        }, 100);

        var input = document.getElementById('tl-final-input');
        var hint = document.getElementById('tl-final-hint');
        var songSpan = document.getElementById('tl-final-song');
        var manual = document.getElementById('tl-final-manual');
        var songInput = document.getElementById('tl-final-song-input');
        var artistInput = document.getElementById('tl-final-artist-input');
        var cancelBtn = document.getElementById('tl-final-cancel');
        var confirmBtn = document.getElementById('tl-final-confirm');

        var currentSong = null;

        function parseInput() {
            var text = input ? input.value : '';
            var match = text.match(/《([^》]+)》/);
            var song = match ? match[1].trim() : null;
            currentSong = song;

            if (song) {
                hint.style.display = 'block';
                if (songSpan) songSpan.textContent = song;
                manual.style.display = 'none';
            } else {
                hint.style.display = 'none';
                manual.style.display = text.trim() ? 'block' : 'none';
            }
        }

        if (input) {
            input.addEventListener('input', parseInput);
            setTimeout(parseInput, 50);
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                console.log('[TL] 取消');
                if (overlay.parentNode) overlay.remove();
            });
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
                console.log('[TL] 确认');
                var text = input ? input.value : '';
                var song = currentSong;
                var artist = '未知歌手';

                if (!song) {
                    var ms = songInput ? songInput.value.trim() : '';
                    var ma = artistInput ? artistInput.value.trim() : '';
                    if (ms) {
                        song = ms;
                        artist = ma || '未知歌手';
                    } else {
                        if (typeof showNotification === 'function') {
                            showNotification('请粘贴QQ音乐分享内容，或手动输入歌曲名', 'warning');
                        } else {
                            alert('请粘贴QQ音乐分享内容，或手动输入歌曲名');
                        }
                        return;
                    }
                }

                if (overlay.parentNode) overlay.remove();
                if (typeof onSuccess === 'function') {
                    onSuccess(song, artist);
                }
            });
        }

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                console.log('[TL] 点击遮罩关闭');
                overlay.remove();
            }
        });
    };

    // ─── 流程函数 ──────────────────────────────────────────────
    window._TL.startFlow = function(song, artist) {
        console.log('[TL] 流程开始:', song, artist);
        var partnerName = window.settings && window.settings.partnerName ? window.settings.partnerName : '梦角';
        var msg = {
            id: Date.now() + Math.random(),
            sender: 'system',
            text: '',
            timestamp: new Date(),
            type: 'system',
            html: '<div style="padding:12px;background:var(--primary-bg,#f5f5f5);border-radius:12px;text-align:center;color:var(--text-primary,#1a1a1a);">🎵 ' + partnerName + ' 邀请你一起听《' + song + '》</div>'
        };
        if (typeof window.addMessage === 'function') {
            window.addMessage(msg);
        } else if (window.messages) {
            window.messages.push(msg);
            if (typeof window.renderMessages === 'function') window.renderMessages();
        }
        if (typeof showNotification === 'function') {
            showNotification('✅ 已发送邀请！', 'success', 2000);
        }
    };

    // ─── 全局拦截（核心稳定机制） ─────────────────────────────
    if (!window._tlInterceptorInstalled) {
        document.addEventListener('click', function(e) {
            var target = e.target.closest('#together-listen-btn');
            if (target) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[TL] 拦截到按钮点击');
                if (window._TL && typeof window._TL.showModal === 'function') {
                    window._TL.showModal(window._TL.startFlow);
                }
            }
        }, true);
        window._tlInterceptorInstalled = true;
        console.log('[TL] ✅ 全局拦截已启用');
    }

    // ─── 确保按钮图标正确 ──────────────────────────────────────
    function ensureButtonIcon() {
        var btn = document.getElementById('together-listen-btn');
        if (btn) {
            // 如果按钮内容不包含耳机图标，修复它
            if (!btn.innerHTML.includes('fa-headphones')) {
                btn.innerHTML = '<i class="fas fa-headphones"></i>';
                btn.setAttribute('title', '一起听');
                console.log('[TL] 修复了按钮图标');
            }
        }
    }

    // 立即执行一次
    ensureButtonIcon();

    // 每2秒检查一次（防止图标被重置）
    setInterval(ensureButtonIcon, 2000);

    console.log('[TL] 🎯 一起听功能已就绪');
    console.log('[TL] 点击顶部"一起听"按钮测试');

})();
    
})();
