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
        '现在有点忙哦，你自己先听吧 🌙',
        '今天真的不行呢，抱歉啦 🥺',
        '对不起······',
    ];

    // 同意文案池
    const ACCEPT_MESSAGES = [
        '好，我也想跟你一起听 🎧',
        '嗯！这首歌我也好喜欢，一起听吧 💕',
        '你分享的音乐，我都有认真在听哦 ✦',
        '好的呀，我也正好想听这首歌呢',
        '我听到了，是温柔的声音呢 🌙',
    ];

    // ─── 状态 ────────────────────────────────────────────────────────────────

    let tlState = {
        isActive: false,          // 是否正在一起听
        startTime: null,          // 开始时间戳（毫秒）
        elapsedSeconds: 0,        // 累计秒数（用于恢复）
        rejectCount: 0,           // 当前流程拒绝次数
        feedbackCardId: null,     // 反馈卡片的 ID
        inviteCardId: null,       // 邀请卡片的 ID
        isMinimized: false,       // 是否已最小化
        bubbleBgImage: null,      // 用户上传的背景图片（base64 或 URL）
    };

    let timerInterval = null;
    let animationFrame = null;
    let ecgCanvas = null;
    let ecgCtx = null;
    let ballCanvas = null;
    let ballCtx = null;
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    // ─── DOM 引用 ────────────────────────────────────────────────────────────

    let bubbleEl = null;
    let ballEl = null;
    let settingsPanel = null;

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
                // 如果 isActive 为 true 且 startTime 存在，说明需要恢复计时
                if (tlState.isActive && tlState.startTime) {
                    // 计算已流逝的时间
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
        // 不清理 bubbleBgImage，保留用户上传的背景
    }

    // ─── 通知 ────────────────────────────────────────────────────────────────

    function notify(msg, type = 'info', duration = 3000) {
        if (typeof showNotification === 'function') {
            showNotification(msg, type, duration);
        } else {
            console.log('[together-listen]', msg);
        }
    }

    // ─── 解析链接 ────────────────────────────────────────────────────────────

    function parseQQMusicLink(text) {
        // 匹配《》中的内容作为歌名
        const songMatch = text.match(/《([^》]+)》/);
        const song = songMatch ? songMatch[1].trim() : null;

        // 匹配 URL
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
        } else {
            // 降级：直接推入 messages 数组
            if (window.messages && Array.isArray(window.messages)) {
                window.messages.push(data);
                if (typeof window.renderMessages === 'function') {
                    window.renderMessages();
                }
                if (typeof window.throttledSaveData === 'function') {
                    window.throttledSaveData();
                }
            }
        }
    }

    // ─── 生成音乐卡片 HTML ─────────────────────────────────────────────────

    function createMusicCardHTML(song, artist, statusText, statusClass = '') {
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
                <div class="tl-card-status ${statusClass}">${statusText}</div>
            </div>
        `;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ─── 生成邀请卡片 ──────────────────────────────────────────────────────

    function createInviteCard(song, artist) {
        const partnerName = getPartnerName();
        const statusText = `${partnerName} 邀请你一起听`;
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

        // 在 DOM 中查找并更新
        const container = document.getElementById('chat-container');
        if (!container) return;

        const wrapper = container.querySelector(`[data-msg-id="${tlState.feedbackCardId}"]`);
        if (!wrapper) return;

        const card = wrapper.querySelector('.tl-music-card');
        if (!card) return;

        const statusEl = card.querySelector('.tl-card-status');
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.className = `tl-card-status ${statusClass}`;
        }

        // 更新内存中的数据
        const msgIndex = window.messages ? window.messages.findIndex(m => String(m.id) === String(tlState.feedbackCardId)) : -1;
        if (msgIndex !== -1 && window.messages) {
            window.messages[msgIndex].accepted = accepted;
        }
    }

    // ─── 删除卡片（重置时） ──────────────────────────────────────────────

    function removeTogetherListenCards() {
        const container = document.getElementById('chat-container');
        if (!container) return;

        const ids = [tlState.inviteCardId, tlState.feedbackCardId].filter(Boolean);
        ids.forEach(id => {
            const wrapper = container.querySelector(`[data-msg-id="${id}"]`);
            if (wrapper) wrapper.remove();
        });

        // 从 messages 数组中移除
        if (window.messages && Array.isArray(window.messages)) {
            window.messages = window.messages.filter(m => !ids.includes(m.id));
        }

        tlState.inviteCardId = null;
        tlState.feedbackCardId = null;
    }

    // ─── 显示全屏反馈弹窗 ──────────────────────────────────────────────────

    function showFeedbackOverlay(accepted, song, artist, onRetry, onExit) {
        // 移除已有弹窗
        const existing = document.querySelector('.tl-feedback-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'tl-feedback-overlay active';

        const partnerName = getPartnerName();
        const avatarSrc = getPartnerAvatarSrc();

        let text, subText, buttonsHtml;

        if (accepted) {
            text = getRandomItem(ACCEPT_MESSAGES);
            subText = '';
            buttonsHtml = '';
            // 同意：1.5 秒后自动关闭
            setTimeout(() => {
                if (overlay.isConnected) {
                    overlay.classList.remove('active');
                    setTimeout(() => overlay.remove(), 350);
                }
                // 触发后续流程
                onAcceptConfirmed(song, artist);
            }, 1500);
        } else {
            const rejectIdx = Math.min(tlState.rejectCount || 0, REJECT_MESSAGES.length - 1);
            text = REJECT_MESSAGES[rejectIdx] || REJECT_MESSAGES[REJECT_MESSAGES.length - 1];
            subText = '';
            buttonsHtml = `
                <button class="modal-btn modal-btn-primary" id="tl-retry-btn">再试一次</button>
                <button class="modal-btn modal-btn-secondary" id="tl-exit-btn">退出</button>
            `;
        }

        const avatarHtml = avatarSrc
            ? `<img src="${avatarSrc}" alt="">`
            : `<i class="fas fa-user"></i>`;

        overlay.innerHTML = `
            <div class="tl-feedback-card">
                <div class="tl-fb-avatar">${avatarHtml}</div>
                <div class="tl-fb-text">${text}</div>
                ${subText ? `<div class="tl-fb-sub">${subText}</div>` : ''}
                <div class="tl-fb-buttons">${buttonsHtml}</div>
            </div>
        `;

        document.body.appendChild(overlay);

        if (!accepted) {
            const retryBtn = overlay.querySelector('#tl-retry-btn');
            const exitBtn = overlay.querySelector('#tl-exit-btn');

            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    overlay.remove();
                    if (typeof onRetry === 'function') onRetry();
                });
            }
            if (exitBtn) {
                exitBtn.addEventListener('click', () => {
                    overlay.remove();
                    if (typeof onExit === 'function') onExit();
                });
            }
        }
    }

    // ─── 同意确认后的流程 ──────────────────────────────────────────────────

    function onAcceptConfirmed(song, artist) {
        // 生成反馈卡片（同意）
        const feedbackMsg = createFeedbackCard(song, artist, true);
        addChatMessage(feedbackMsg);

        // 启动计时器和气泡
        startTogetherListen(song, artist);
    }

    // ─── 启动计时器和气泡 ──────────────────────────────────────────────────

    function startTogetherListen(song, artist) {
        if (tlState.isActive) {
            // 如果已经激活，不重复启动
            return;
        }

        tlState.isActive = true;
        tlState.startTime = Date.now();
        tlState.elapsedSeconds = 0;

        // 创建气泡
        createBubble(song, artist);
        saveState();

        // 启动计时器
        startTimer();

        // 显示气泡
        showBubble();

        // 发送聊天事件
        sendChatEvent('fa-headphones', `${getPartnerName()} 同意了你的一起听邀请`, '🎵 正在一起听');
    }

    // ─── 发送聊天事件 ──────────────────────────────────────────────────────

    function sendChatEvent(icon, label, detail) {
        if (typeof window._addCallEvent === 'function') {
            window._addCallEvent(icon, label, detail);
        }
    }

    // ─── 创建气泡 DOM ──────────────────────────────────────────────────────

    function createBubble(song, artist) {
        // 移除已有气泡
        const existing = document.querySelector('.tl-bubble');
        if (existing) existing.remove();
        const existingBall = document.querySelector('.tl-float-ball');
        if (existingBall) existingBall.remove();

        // 标准弹窗
        bubbleEl = document.createElement('div');
        bubbleEl.className = 'tl-bubble';
        bubbleEl.id = 'tl-bubble';

        const partnerAvatar = getPartnerAvatarSrc() || '';
        const myAvatar = getMyAvatarSrc() || '';

        bubbleEl.innerHTML = `
            <div class="tl-bubble-toolbar">
                <button class="tl-tool-btn" id="tl-upload-btn" title="上传背景图片"><i class="fas fa-image"></i></button>
                <button class="tl-tool-btn" id="tl-minimize-btn" title="最小化"><i class="fas fa-minus"></i></button>
                <button class="tl-tool-btn tl-close-btn" id="tl-close-btn" title="关闭"><i class="fas fa-power-off"></i></button>
            </div>
            <div class="tl-avatars">
                <div class="tl-avatar-item tl-avatar-left">
                    ${partnerAvatar ? `<img src="${partnerAvatar}">` : '<i class="fas fa-user"></i>'}
                    <div class="tl-earphone tl-earphone-left"></div>
                </div>
                <div class="tl-avatar-item tl-avatar-right">
                    ${myAvatar ? `<img src="${myAvatar}">` : '<i class="fas fa-user"></i>'}
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
        const canvas = bubbleEl.querySelector('#tl-ecg-canvas');
        if (canvas) {
            ecgCanvas = canvas;
            ecgCtx = canvas.getContext('2d');
            setupEcgCanvas(canvas);
        }

        // 绑定事件
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

        // 初始化小球 Canvas
        const ballCanvasEl = ballEl.querySelector('#tl-ball-canvas');
        if (ballCanvasEl) {
            ballCanvas = ballCanvasEl;
            ballCtx = ballCanvasEl.getContext('2d');
            setupBallCanvas(ballCanvasEl);
        }

        // 小球拖动事件
        bindBallEvents();

        // 默认隐藏小球
        ballEl.classList.remove('active');
        tlState.isMinimized = false;
    }

    // ─── 设置 ECG Canvas ───────────────────────────────────────────────────

    function setupEcgCanvas(canvas) {
        const container = canvas.parentElement;
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = container.clientWidth || 200;
        const h = container.clientHeight || 48;

        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        // 存下逻辑尺寸供绘制使用
        canvas._w = w;
        canvas._h = h;

        return { w, h, ctx };
    }

    function setupBallCanvas(canvas) {
        const container = canvas.parentElement;
        const size = container.clientWidth || 56;
        const dpr = window.devicePixelRatio || 1;

        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        canvas._size = size;

        return { size, ctx };
    }

    // ─── 心电图波形数据 ────────────────────────────────────────────────────

    // 归一化波形数据（x: 0~1, y: -1~1）
    // 标准 P-QRS-T 波群
    const ECG_WAVE_POINTS = [
        // 水平基线（P波前延伸）
        { x: 0.00, y: 0.00 },
        { x: 0.02, y: 0.00 },
        // P 波（小隆起）
        { x: 0.06, y: 0.08 },
        { x: 0.10, y: 0.25 },
        { x: 0.14, y: 0.35 },
        { x: 0.18, y: 0.25 },
        { x: 0.22, y: 0.08 },
        // 水平段（P波后）
        { x: 0.26, y: 0.00 },
        { x: 0.30, y: 0.00 },
        // Q 波（R波前的小下探）
        { x: 0.34, y: -0.08 },
        // R 波（主峰）
        { x: 0.38, y: -0.95 },
        // S 波（R波后的下探）
        { x: 0.42, y: 0.20 },
        { x: 0.46, y: 0.00 },
        // 水平段（S波后）
        { x: 0.50, y: 0.00 },
        { x: 0.54, y: 0.00 },
        // T 波（较宽缓的隆起）
        { x: 0.58, y: 0.10 },
        { x: 0.64, y: 0.30 },
        { x: 0.70, y: 0.45 },
        { x: 0.76, y: 0.30 },
        { x: 0.82, y: 0.10 },
        // 水平段（T波后延伸）
        { x: 0.88, y: 0.00 },
        { x: 0.94, y: 0.00 },
        { x: 1.00, y: 0.00 },
    ];

    // ─── 绘制心电图（白色 + 淡蓝色发光） ──────────────────────────────────

    function drawECG(ctx, w, h, progress, isBall = false) {
        const padding = isBall ? 4 : 6;
        const drawW = w - padding * 2;
        const drawH = h - padding * 2;
        const midY = padding + drawH / 2;
        const amp = drawH / 2 * 0.85;

        ctx.clearRect(0, 0, w, h);

        // 发光设置（淡蓝色）
        ctx.shadowColor = 'rgba(100, 180, 255, 0.35)';
        ctx.shadowBlur = isBall ? 4 : 8;
        ctx.lineWidth = isBall ? 1.5 : 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // 计算当前可见的波形范围（0 ~ progress）
        const visiblePoints = ECG_WAVE_POINTS.filter(p => p.x <= progress);

        if (visiblePoints.length < 2) {
            // 如果还没开始绘制，画一条水平线
            ctx.beginPath();
            ctx.moveTo(padding, midY);
            ctx.lineTo(w - padding, midY);
            ctx.stroke();
            return;
        }

        // 绘制波形
        ctx.beginPath();
        let first = true;

        // 从左侧水平线开始
        ctx.moveTo(padding, midY);

        for (const pt of visiblePoints) {
            const x = padding + pt.x * drawW;
            const y = midY + pt.y * amp;
            ctx.lineTo(x, y);
        }

        // 如果 progress < 1，从最后一个可见点画水平线到右侧
        if (progress < 1) {
            const lastPt = visiblePoints[visiblePoints.length - 1];
            const lastX = padding + lastPt.x * drawW;
            ctx.lineTo(lastX, midY);
            ctx.lineTo(w - padding, midY);
        } else {
            // progress >= 1，画到最右
            ctx.lineTo(w - padding, midY);
        }

        ctx.stroke();

        // 额外发光层（更柔和的辉光）
        if (!isBall) {
            ctx.shadowColor = 'rgba(100, 180, 255, 0.15)';
            ctx.shadowBlur = 16;
            ctx.lineWidth = 4;
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            // 重新绘制一遍相同的路径作为辉光
            ctx.beginPath();
            ctx.moveTo(padding, midY);
            for (const pt of visiblePoints) {
                const x = padding + pt.x * drawW;
                const y = midY + pt.y * amp;
                ctx.lineTo(x, y);
            }
            if (progress < 1) {
                const lastPt = visiblePoints[visiblePoints.length - 1];
                const lastX = padding + lastPt.x * drawW;
                ctx.lineTo(lastX, midY);
                ctx.lineTo(w - padding, midY);
            } else {
                ctx.lineTo(w - padding, midY);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
        }

        // 重置阴影
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
    }

    // ─── 绘制彩虹心电图（悬浮球用） ──────────────────────────────────────

    function drawRainbowECG(ctx, size, progress, hueOffset) {
        const padding = 4;
        const drawW = size - padding * 2;
        const drawH = size - padding * 2;
        const midY = padding + drawH / 2;
        const amp = drawH / 2 * 0.8;

        ctx.clearRect(0, 0, size, size);

        const visiblePoints = ECG_WAVE_POINTS.filter(p => p.x <= progress);

        if (visiblePoints.length < 2) {
            ctx.beginPath();
            ctx.moveTo(padding, midY);
            ctx.lineTo(size - padding, midY);
            ctx.stroke();
            return;
        }

        // 逐段绘制，每段颜色不同（彩虹渐变）
        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        let first = true;
        let prevX = padding;
        let prevY = midY;

        for (let i = 0; i < visiblePoints.length; i++) {
            const pt = visiblePoints[i];
            const x = padding + pt.x * drawW;
            const y = midY + pt.y * amp;

            // 计算颜色：基于 progress 位置 + 时间偏移
            const hue = (pt.x * 360 + hueOffset) % 360;
            ctx.strokeStyle = `hsl(${hue}, 80%, 65%)`;
            ctx.shadowColor = `hsla(${hue}, 80%, 65%, 0.4)`;
            ctx.shadowBlur = 6;

            if (first) {
                ctx.beginPath();
                ctx.moveTo(prevX, prevY);
                first = false;
            }
            ctx.lineTo(x, y);
            ctx.stroke();

            // 重新开始下一段的路径
            ctx.beginPath();
            ctx.moveTo(x, y);
            prevX = x;
            prevY = y;
        }

        // 画到右侧水平线
        if (progress < 1) {
            const lastPt = visiblePoints[visiblePoints.length - 1];
            const lastX = padding + lastPt.x * drawW;
            ctx.strokeStyle = `hsl(${(lastPt.x * 360 + hueOffset) % 360}, 70%, 50%)`;
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.moveTo(lastX, prevY);
            ctx.lineTo(size - padding, midY);
            ctx.stroke();
        } else {
            // 画到最右
            const lastPt = visiblePoints[visiblePoints.length - 1];
            const lastX = padding + lastPt.x * drawW;
            ctx.strokeStyle = `hsl(${(lastPt.x * 360 + hueOffset) % 360}, 70%, 50%)`;
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.moveTo(lastX, prevY);
            ctx.lineTo(size - padding, midY);
            ctx.stroke();
        }

        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
    }

    // ─── 动画循环 ──────────────────────────────────────────────────────────

    let ecgProgress = 0;
    let lastTimestamp = 0;
    let hueOffset = 0;

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

        // 每 1 秒完成一个完整周期
        const cycleDuration = 1000;
        if (lastTimestamp === 0) lastTimestamp = timestamp;
        const delta = timestamp - lastTimestamp;
        lastTimestamp = timestamp;

        ecgProgress = (ecgProgress + delta / cycleDuration) % 1;

        // 更新彩虹色相偏移（每秒 3°，缓慢流动）
        hueOffset = (hueOffset + delta * 0.003) % 360;

        // 绘制标准弹窗的心电图
        if (ecgCanvas && ecgCtx) {
            const w = ecgCanvas._w || ecgCanvas.width / (window.devicePixelRatio || 1);
            const h = ecgCanvas._h || ecgCanvas.height / (window.devicePixelRatio || 1);
            drawECG(ecgCtx, w, h, ecgProgress, false);
        }

        // 绘制悬浮球的彩虹心电图（如果可见）
        if (ballCanvas && ballCtx && ballEl && ballEl.classList.contains('active')) {
            const size = ballCanvas._size || 56;
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

        // 如果有保存的 elapsedSeconds，从那里开始
        let startOffset = tlState.elapsedSeconds || 0;

        timerInterval = setInterval(() => {
            if (!tlState.isActive) {
                clearInterval(timerInterval);
                timerInterval = null;
                return;
            }

            // 计算总秒数
            const elapsed = (Date.now() - tlState.startTime) / 1000 + startOffset;
            tlState.elapsedSeconds = elapsed;

            // 更新显示
            updateTimerDisplay(elapsed);
            saveState();

        }, 1000);

        // 立即更新一次
        const initialElapsed = (Date.now() - tlState.startTime) / 1000 + startOffset;
        updateTimerDisplay(initialElapsed);
    }

    function updateTimerDisplay(seconds) {
        const display = document.getElementById('tl-timer-display');
        if (display) {
            display.textContent = formatTime(seconds);
        }
        const ballDisplay = document.getElementById('tl-ball-timer');
        if (ballDisplay) {
            ballDisplay.textContent = formatTime(seconds);
        }
    }

    // ─── 显示/隐藏气泡 ─────────────────────────────────────────────────────

    function showBubble() {
        if (bubbleEl) {
            bubbleEl.classList.add('active');
        }
        // 默认不显示小球
        if (ballEl) {
            ballEl.classList.remove('active');
        }
        tlState.isMinimized = false;
        startAnimation();
    }

    function hideBubble() {
        if (bubbleEl) {
            bubbleEl.classList.remove('active');
        }
    }

    function showBall() {
        if (ballEl) {
            ballEl.classList.add('active');
            // 重新设置 Canvas 尺寸（因为显示后尺寸才确定）
            const canvas = ballEl.querySelector('#tl-ball-canvas');
            if (canvas) {
                setupBallCanvas(canvas);
            }
        }
        if (bubbleEl) {
            bubbleEl.classList.remove('active');
        }
        tlState.isMinimized = true;
        // 动画已经在运行，不需要重启
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

        // 关闭按钮
        const closeBtn = bubbleEl.querySelector('#tl-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                exitTogetherListen();
            });
        }

        // 最小化按钮
        const minBtn = bubbleEl.querySelector('#tl-minimize-btn');
        if (minBtn) {
            minBtn.addEventListener('click', () => {
                showBall();
            });
        }

        // 上传按钮（切换设置面板）
        const uploadBtn = bubbleEl.querySelector('#tl-upload-btn');
        const panel = bubbleEl.querySelector('#tl-settings-panel');
        if (uploadBtn && panel) {
            uploadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                panel.classList.toggle('open');
            });
            // 点击面板外部关闭
            document.addEventListener('click', (e) => {
                if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== uploadBtn) {
                    panel.classList.remove('open');
                }
            });
        }

        // 设置面板：上传图片
        const uploadBgBtn = bubbleEl.querySelector('#tl-upload-bg-btn');
        if (uploadBgBtn) {
            uploadBgBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const data = ev.target.result;
                        tlState.bubbleBgImage = data;
                        applyBubbleBg(data);
                        saveState();
                        const panel = bubbleEl.querySelector('#tl-settings-panel');
                        if (panel) panel.classList.remove('open');
                        notify('背景图片已更新', 'success');
                    };
                    reader.readAsDataURL(file);
                };
                input.click();
            });
        }

        // 设置面板：恢复原本样式
        const restoreBtn = bubbleEl.querySelector('#tl-restore-bg-btn');
        if (restoreBtn) {
            restoreBtn.addEventListener('click', () => {
                tlState.bubbleBgImage = null;
                applyBubbleBg(null);
                saveState();
                const panel = bubbleEl.querySelector('#tl-settings-panel');
                if (panel) panel.classList.remove('open');
                notify('已恢复原本样式', 'info');
            });
        }

        // 气泡拖动
        makeDraggable(bubbleEl);
    }

    // ─── 应用气泡背景 ──────────────────────────────────────────────────────

    function applyBubbleBg(data) {
        if (!bubbleEl) return;
        if (data) {
            bubbleEl.style.backgroundImage = `url(${data})`;
            bubbleEl.style.backgroundSize = 'cover';
            bubbleEl.style.backgroundPosition = 'center';
            // 保留磨砂效果，在图片上加一层半透黑
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

        // 点击小球恢复标准弹窗
        ballEl.addEventListener('click', (e) => {
            // 如果正在拖动，不触发
            if (isDragging) return;
            hideBall();
            showBubble();
        });

        // 拖动
        makeDraggable(ballEl);
    }

    // ─── 拖动功能 ──────────────────────────────────────────────────────────

    function makeDraggable(el) {
        let startX, startY, origX, origY;
        let isDrag = false;

        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDrag = false;
            const rect = el.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            origX = rect.left;
            origY = rect.top;
            el.classList.add('dragging');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!el.classList.contains('dragging')) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                isDrag = true;
            }
            el.style.left = (origX + dx) + 'px';
            el.style.top = (origY + dy) + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (el.classList.contains('dragging')) {
                el.classList.remove('dragging');
                // 如果是拖动，阻止点击事件
                if (isDrag) {
                    // 用一个标志让点击事件忽略这次点击
                    el._wasDragged = true;
                    setTimeout(() => { el._wasDragged = false; }, 100);
                }
                isDrag = false;
            }
        });

        // 触屏支持
        el.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            if (!touch) return;
            isDrag = false;
            const rect = el.getBoundingClientRect();
            startX = touch.clientX;
            startY = touch.clientY;
            origX = rect.left;
            origY = rect.top;
            el.classList.add('dragging');
        }, { passive: true });

        el.addEventListener('touchmove', (e) => {
            if (!el.classList.contains('dragging')) return;
            const touch = e.touches[0];
            if (!touch) return;
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                isDrag = true;
            }
            el.style.left = (origX + dx) + 'px';
            el.style.top = (origY + dy) + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            e.preventDefault();
        }, { passive: false });

        el.addEventListener('touchend', () => {
            if (el.classList.contains('dragging')) {
                el.classList.remove('dragging');
                if (isDrag) {
                    el._wasDragged = true;
                    setTimeout(() => { el._wasDragged = false; }, 100);
                }
                isDrag = false;
            }
        });
    }

    // ─── 退出一起听 ──────────────────────────────────────────────────────

    async function exitTogetherListen() {
        // 停止计时器
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        // 停止动画
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }

        // 移除气泡
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

        // 移除聊天卡片
        removeTogetherListenCards();

        // 清除状态
        tlState.isActive = false;
        tlState.startTime = null;
        tlState.elapsedSeconds = 0;
        tlState.rejectCount = 0;
        tlState.isMinimized = false;

        await clearState();

        // 发送聊天事件
        sendChatEvent('fa-headphones', '一起听已结束', '🎵');

        notify('已退出一起听', 'info', 2000);
    }

    // ─── 入口：粘贴链接弹窗 ──────────────────────────────────────────────

    function showPasteModal(onSuccess) {
        // 移除已有弹窗
        const existing = document.getElementById('tl-paste-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
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

        // 自动聚焦
        setTimeout(() => {
            const input = document.getElementById('tl-paste-input');
            if (input) input.focus();
        }, 300);

        // 实时解析
        const pasteInput = document.getElementById('tl-paste-input');
        const extractHint = document.getElementById('tl-extract-hint');
        const extractSong = document.getElementById('tl-extract-song');
        const manualFields = document.getElementById('tl-manual-fields');
        const songInput = document.getElementById('tl-song-input');
        const artistInput = document.getElementById('tl-artist-input');

        let currentSong = null;
        let currentUrl = null;

        function parseInput() {
            const text = pasteInput ? pasteInput.value : '';
            const parsed = parseQQMusicLink(text);
            currentSong = parsed.song;
            currentUrl = parsed.url;

            if (currentSong) {
                extractHint.style.display = 'flex';
                extractSong.textContent = currentSong;
                manualFields.style.display = 'none';
            } else {
                extractHint.style.display = 'none';
                // 如果用户已经输入了内容但没识别到，显示手动输入
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
        const cancelBtn = document.getElementById('tl-paste-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modal.remove();
            });
        }

        // 确认
        const confirmBtn = document.getElementById('tl-paste-confirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                const text = pasteInput ? pasteInput.value : '';

                // 如果没有提取到歌名，使用手动输入
                let song = currentSong;
                let artist = '未知歌手';

                if (!song) {
                    // 检查手动输入
                    const manualSong = songInput ? songInput.value.trim() : '';
                    const manualArtist = artistInput ? artistInput.value.trim() : '';
                    if (manualSong) {
                        song = manualSong;
                        artist = manualArtist || '未知歌手';
                    } else {
                        // 完全没填
                        notify('请粘贴QQ音乐分享内容，或手动输入歌曲名', 'warning');
                        return;
                    }
                }

                // 检查 URL 是否有效（至少包含 qq.com）
                if (currentUrl && !isValidQQMusicUrl(currentUrl)) {
                    notify('请粘贴有效的QQ音乐链接', 'warning');
                    return;
                }

                modal.remove();

                if (typeof onSuccess === 'function') {
                    onSuccess(song, artist, currentUrl);
                }
            });
        }

        // 点击遮罩关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // ─── 入口：处理顶部按钮点击 ──────────────────────────────────────────

    function handleEntryClick() {
        // 检查是否已激活
        if (tlState.isActive) {
            notify('已在一起听中', 'info', 1500);
            return;
        }

        // 判断设备
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

        if (isMobile) {
            // 尝试唤起 QQ音乐
            const appStarted = tryOpenQQMusic();

            if (!appStarted) {
                // 如果无法唤起，直接显示粘贴弹窗
                showPasteModal(startTogetherListenFlow);
            } else {
                // 3秒超时检测
                let timeoutId = setTimeout(() => {
                    // 如果页面仍然可见（APP未成功唤起）
                    if (!document.hidden) {
                        notify('未能打开QQ音乐，请手动打开APP复制"一起听"链接后返回', 'info', 4000);
                        // 进入粘贴弹窗
                        showPasteModal(startTogetherListenFlow);
                    }
                }, 3000);

                // 页面变为可见时（用户从QQ音乐切回）
                const onVisibilityChange = () => {
                    if (document.visibilityState === 'visible') {
                        clearTimeout(timeoutId);
                        document.removeEventListener('visibilitychange', onVisibilityChange);
                        // 自动弹出粘贴弹窗
                        showPasteModal(startTogetherListenFlow);
                    }
                };
                document.addEventListener('visibilitychange', onVisibilityChange);

                // 如果用户手动关闭了超时提示，清理监听
                const cleanup = () => {
                    clearTimeout(timeoutId);
                    document.removeEventListener('visibilitychange', onVisibilityChange);
                };
                // 弹窗取消时清理
                // 在 showPasteModal 里会触发 cleanup
                const origShow = showPasteModal;
                showPasteModal = function(onSuccess) {
                    cleanup();
                    origShow.call(this, onSuccess);
                };
            }
        } else {
            // 电脑端：alert 提示
            alert('请使用手机QQ音乐复制"一起听"链接，然后回到本页面继续操作。');
            showPasteModal(startTogetherListenFlow);
        }
    }

    // ─── 尝试唤起 QQ音乐 ──────────────────────────────────────────────────

    function tryOpenQQMusic() {
        try {
            // 尝试多种 URL Scheme
            const schemes = ['qqmusic://today', 'qqmusic://'];
            for (const scheme of schemes) {
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = scheme;
                document.body.appendChild(iframe);
                setTimeout(() => {
                    if (iframe.parentNode) iframe.remove();
                }, 3000);
                return true;
            }
        } catch (e) {
            console.warn('[together-listen] 唤起QQ音乐失败:', e);
            return false;
        }
        return false;
    }

    // ─── 开始一起听流程（从粘贴弹窗确认后） ──────────────────────────────

    function startTogetherListenFlow(song, artist, url) {
        // 保存歌曲信息
        const songName = song || '未知歌曲';
        const artistName = artist || '未知歌手';

        // 1. 生成邀请卡片
        const inviteMsg = createInviteCard(songName, artistName);
        addChatMessage(inviteMsg);

        // 2. 触发梦角反馈
        triggerFeedback(songName, artistName);
    }

    // ─── 触发梦角反馈 ──────────────────────────────────────────────────────

    function triggerFeedback(song, artist) {
        // 70% 同意，30% 拒绝
        const accepted = Math.random() < 0.7;

        if (accepted) {
            // 同意：直接走同意流程
            showFeedbackOverlay(true, song, artist, null, null);
        } else {
            // 拒绝：显示拒绝弹窗
            tlState.rejectCount = (tlState.rejectCount || 0) + 1;
            // 生成反馈卡片（拒绝）
            const feedbackMsg = createFeedbackCard(song, artist, false);
            addChatMessage(feedbackMsg);

            showFeedbackOverlay(false, song, artist, () => {
                // 再试一次
                tlState.rejectCount = (tlState.rejectCount || 0) + 1;
                // 更新反馈卡片状态（拒绝）
                updateFeedbackCard(false);
                // 重新触发反馈
                triggerFeedback(song, artist);
            }, () => {
                // 退出
                // 移除卡片
                removeTogetherListenCards();
                tlState.rejectCount = 0;
                saveState();
                notify('已退出一起听', 'info', 2000);
            });
        }
    }

    // ─── 恢复计时（从 localStorage 恢复） ──────────────────────────────────

    async function restoreTogetherListen() {
        const hasState = await loadState();
        if (!hasState || !tlState.isActive) {
            return;
        }

        // 检查是否已经有过期（超过24小时自动失效）
        if (tlState.startTime && (Date.now() - tlState.startTime) > 24 * 60 * 60 * 1000) {
            await clearState();
            return;
        }

        // 恢复气泡
        // 需要知道歌曲信息，从反馈卡片中获取
        let song = '未知歌曲';
        let artist = '未知歌手';

        // 尝试从 messages 中找反馈卡片
        if (window.messages && Array.isArray(window.messages)) {
            const feedbackMsg = window.messages.find(m => m.id === tlState.feedbackCardId);
            if (feedbackMsg) {
                song = feedbackMsg.song || '未知歌曲';
                artist = feedbackMsg.artist || '未知歌手';
            }
        }

        createBubble(song, artist);
        showBubble();

        // 启动计时器（从保存的 elapsedSeconds 继续）
        tlState.startTime = Date.now(); // 重新设置开始时间为现在，但保留已累计的秒数
        startTimer();

        // 发送恢复通知
        notify('已恢复一起听', 'info', 2000);
    }

    // ─── 初始化 ─────────────────────────────────────────────────────────────

    function init() {
        // 检查是否应该恢复
        restoreTogetherListen();

        // 监听顶部"一起听"按钮点击（使用事件委托）
        document.addEventListener('click', function(e) {
            const btn = e.target.closest('#together-listen-btn');
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
        init,
        handleEntryClick,
        showPasteModal,
        startTogetherListenFlow,
        exitTogetherListen,
        restoreTogetherListen,
        // 测试接口
        testAccept: () => {
            // 强制同意（测试用）
            const originalRandom = Math.random;
            Math.random = () => 0.8;
            handleEntryClick();
            setTimeout(() => { Math.random = originalRandom; }, 3000);
        },
        testReject: () => {
            // 强制拒绝（测试用）
            const originalRandom = Math.random;
            Math.random = () => 0.2;
            handleEntryClick();
            setTimeout(() => { Math.random = originalRandom; }, 3000);
        },
        exit: exitTogetherListen,
    };

    // DOM 就绪后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }

})();
