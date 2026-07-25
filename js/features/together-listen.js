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
                <button class="modal-btn modal-btn-secondary" id="
