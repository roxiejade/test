/**
 * together-listen-core.js — 一起听核心流程
 * 目录：js/features/together-listen-core.js
 * 包含：粘贴弹窗、卡片发送、黑屏动画、流程控制、全局拦截
 * 依赖：无（独立运行）
 * 接口：window._TL 命名空间
 */

(function() {
    'use strict';

    // ============================================================
    // 常量
    // ============================================================

    var ACCEPT_MESSAGES = [
        '好，我也想跟你一起听 🎧',
        '这首歌我也喜欢，一起听吧 💕',
        '你分享的音乐，我都有认真在听哦 ✦',
        '打开我们的专属歌单💕',
        '是你会喜欢的歌',
    ];

    var REJECT_MESSAGES = [
        '现在有点忙哦，你自己先听吧 🌙',
        '今天真的不行呢，抱歉啦 🥺',
        '对不起······',
    ];

    // ============================================================
    // 工具函数
    // ============================================================

    function getRandomItem(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

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

    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

        // ============================================================
    // 发送卡片（带重试机制，等待 messages 可用）
    // ============================================================

    function sendCard(song, artist, statusText, sender, cardType, retries) {
        retries = retries || 0;
        var songName = song || '未知歌曲';
        var artistName = artist || '未知歌手';
        var isUser = sender === 'user';

        // 如果 messages 还没准备好，等待 500ms 后重试（最多重试 20 次 = 10 秒）
        if (!window.messages || !Array.isArray(window.messages)) {
            if (retries < 20) {
                console.log('[TLCore] messages 未就绪，等待重试 (' + (retries + 1) + '/20)...');
                setTimeout(function() {
                    sendCard(song, artist, statusText, sender, cardType, retries + 1);
                }, 500);
                return;
            } else {
                console.error('[TLCore] messages 始终不可用，放弃发送卡片');
                return;
            }
        }

        var cardHtml = `
            <div class="tl-music-card">
                <div class="tl-card-top">
                    <div class="tl-card-cover">
                        <i class="fas fa-record-vinyl"></i>
                    </div>
                    <div class="tl-card-info">
                        <div class="tl-card-song">${escapeHtml(songName)}</div>
                        <div class="tl-card-artist">${escapeHtml(artistName)}</div>
                    </div>
                </div>
                <div class="tl-card-divider"></div>
                <div class="tl-card-status tl-status-text">${statusText}</div>
            </div>
        `;

        var msg = {
            id: Date.now() + Math.random(),
            sender: sender,
            text: '',
            timestamp: new Date(),
            status: isUser ? 'sent' : 'received',
            type: 'normal',
            html: cardHtml,
            isTogetherListenCard: true,
            cardType: cardType,
            song: songName,
            artist: artistName,
            favorited: false,
            note: null,
        };

        window.messages.push(msg);
        if (typeof window.renderMessages === 'function') {
            window.renderMessages();
        }
        if (typeof window.throttledSaveData === 'function') {
            window.throttledSaveData();
        }
        console.log('[TLCore] 卡片已发送:', cardType, sender);
         return msg;  
    }

    // ============================================================
    // 黑屏动画
    // ============================================================

    var rejectCount = 0;
    var feedbackCardId = null;

    window._TL = window._TL || {};

    window._TL.showBlackScreen = function(song, artist, isAccepted, onRetry, onExit, onAccept) {
        var partnerName = getPartnerName();
        var avatarSrc = getPartnerAvatarSrc();
        var avatarHtml = avatarSrc
            ? '<img src="' + avatarSrc + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
            : '<i class="fas fa-user" style="font-size:20px;color:rgba(255,255,255,0.6);"></i>';

        var messageText;
        if (isAccepted) {
            messageText = getRandomItem(ACCEPT_MESSAGES);
        } else {
            var idx = Math.min(rejectCount, REJECT_MESSAGES.length - 1);
            messageText = REJECT_MESSAGES[idx] || REJECT_MESSAGES[REJECT_MESSAGES.length - 1];
        }

        var showButtons = !isAccepted;

        var old = document.getElementById('tl-black-screen');
        if (old) old.remove();

        var transition = document.createElement('div');
        transition.id = 'tl-black-screen';
        transition.style.cssText = 'position:fixed;inset:0;z-index:999997;background:radial-gradient(ellipse at center,#1a1525 0%,#050308 70%,#000 100%);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.8s ease;';

        var stars = '';
        for (var i = 0; i < 80; i++) {
            var x = Math.random() * 100;
            var y = Math.random() * 100;
            var size = Math.random() * 2.5 + 0.5;
            var duration = Math.random() * 4 + 2;
            var delay = Math.random() * 6;
            stars += '<div style="position:absolute;left:' + x + '%;top:' + y + '%;width:' + size + 'px;height:' + size + 'px;background:rgba(255,255,255,0.8);border-radius:50%;animation:tlStarTwinkle ' + duration + 's ease-in-out ' + delay + 's infinite;"></div>';
        }

        var buttonsHtml = '';
        if (showButtons) {
            buttonsHtml = `
                <div style="display:flex;gap:16px;margin-top:20px;justify-content:center;">
                    <button id="tl-bs-retry" style="padding:10px 32px;border:none;border-radius:22px;font-size:14px;font-weight:600;cursor:pointer;background:var(--accent-color,#c5a47e);color:#fff;font-family:var(--font-family,sans-serif);">再试一次</button>
                    <button id="tl-bs-exit" style="padding:10px 32px;border:none;border-radius:22px;font-size:14px;font-weight:600;cursor:pointer;background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.7);font-family:var(--font-family,sans-serif);border:1px solid rgba(255,255,255,0.15);">退出</button>
                </div>
            `;
        }

        transition.innerHTML = `
            <style>
                @keyframes tlStarTwinkle {
                    0%, 100% { opacity: 0.1; transform: scale(0.6); }
                    50% { opacity: 1; transform: scale(1.4); }
                }
            </style>
            <div style="position:absolute;inset:0;overflow:hidden;">${stars}</div>
            <div style="position:absolute;inset:0;background:radial-gradient(circle at 30% 40%, rgba(120,100,200,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(200,150,100,0.1) 0%, transparent 50%);"></div>
            <div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:12px;padding:0 30px;opacity:0;transform:translateY(12px);transition:opacity 0.9s ease 0.3s, transform 0.9s ease 0.3s;">
                <div style="width:64px;height:64px;border-radius:50%;overflow:hidden;background:rgba(255,255,255,0.1);border:2px solid rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    ${avatarHtml}
                </div>
                <div style="background:rgba(255,255,255,0.14);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.95);padding:14px 22px;border-radius:18px;border-top-left-radius:4px;font-size:17px;line-height:1.6;letter-spacing:0.5px;text-shadow:0 0 12px rgba(255,255,255,0.1);text-align:center;max-width:340px;">
                    ${messageText}
                </div>
                ${buttonsHtml}
            </div>
        `;

        document.body.appendChild(transition);

        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                transition.style.opacity = '1';
                var content = transition.querySelector('div[style*="z-index:2"]');
                if (content) {
                    content.style.opacity = '1';
                    content.style.transform = 'translateY(0)';
                }
            });
        });

        if (isAccepted) {
            // 同意：3.5秒后自动消失
            setTimeout(function() {
                transition.style.opacity = '0';
                setTimeout(function() {
                    if (transition.parentNode) transition.remove();
                    console.log('[TLCore] 黑屏结束（同意）');
                    if (typeof onAccept === 'function') onAccept();
                }, 800);
            }, 3500);
        } else {
            // 拒绝：按钮事件
            var retryBtn = document.getElementById('tl-bs-retry');
            var exitBtn = document.getElementById('tl-bs-exit');

            if (retryBtn) {
                retryBtn.addEventListener('click', function() {
                    console.log('[TLCore] 点击再试一次');
                    if (transition.parentNode) transition.remove();
                    if (typeof onRetry === 'function') onRetry();
                });
            }

            if (exitBtn) {
                exitBtn.addEventListener('click', function() {
                    console.log('[TLCore] 点击退出');
                    if (transition.parentNode) transition.remove();
                    if (typeof onExit === 'function') onExit();
                });
            }
        }
    };

    // ============================================================
    // 主流程
    // ============================================================

    window._TL.startFlow = function(song, artist) {
        var partnerName = getPartnerName();
        var myName = getMyName();
        var songName = song || '未知歌曲';
        var artistName = artist || '未知歌手';

        console.log('[TLCore] 开始流程:', songName, artistName);

        // 重置拒绝计数
        rejectCount = 0;

        // 发送邀请卡片
        var inviteText = myName + ' 邀请你一起听';
        sendCard(songName, artistName, inviteText, 'user', 'invite');

        // 延迟触发反馈
        setTimeout(function() {
            triggerFeedback(songName, artistName);
        }, 800);
    };

    // ============================================================
    // 更新已有的反馈卡片
    // ============================================================

    function updateExistingCard(cardId, statusText) {
        console.log('[TLCore] 更新反馈卡片:', cardId, statusText);

        var container = document.getElementById('chat-container');
        if (!container) return;

        var wrapper = container.querySelector('[data-msg-id="' + cardId + '"]');
        if (!wrapper) return;

        var card = wrapper.querySelector('.tl-music-card');
        if (!card) return;

        var statusEl = card.querySelector('.tl-card-status');
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.className = 'tl-card-status tl-status-text';
        }

        if (window.messages && Array.isArray(window.messages)) {
            var msgIndex = window.messages.findIndex(function(m) {
                return String(m.id) === String(cardId);
            });
            if (msgIndex !== -1) {
                window.messages[msgIndex].accepted = false;
                window.messages[msgIndex].text = statusText;
            }
        }

        if (typeof window.throttledSaveData === 'function') {
            window.throttledSaveData();
        }
    }
    
    // ============================================================
    // 触发反馈
    // ============================================================

        function triggerFeedback(song, artist) {
        var partnerName = getPartnerName();
        var isAccepted = Math.random() < 0.7;

        console.log('[TLCore] 反馈:', isAccepted ? '✅ 同意' : '❌ 拒绝');

        var statusText = isAccepted ? partnerName + ' 同意邀请' : partnerName + ' 拒绝邀请';

        // ===== 判断是发送新卡片还是更新已有卡片 =====
        if (feedbackCardId) {
            // 已有反馈卡片 → 更新状态
            updateExistingCard(feedbackCardId, statusText);
        } else {
            // 没有反馈卡片 → 发送新卡片
            var cardData = sendCard(song, artist, statusText, partnerName, 'feedback');
            if (cardData && cardData.id) {
                feedbackCardId = cardData.id;
            }
        }

        // 显示黑屏动画
        window._TL.showBlackScreen(
            song,
            artist,
            isAccepted,
            // onRetry: 再试一次
            function() {
                rejectCount++;
                triggerFeedback(song, artist);
            },
            // onExit: 退出
            function() {
                rejectCount = 0;
                feedbackCardId = null;
                if (typeof window.addMessage === 'function') {
                    window.addMessage({
                        id: Date.now() + Math.random(),
                        sender: 'system',
                        text: '已退出一起听',
                        timestamp: new Date(),
                        type: 'system'
                    });
                }
            },
            // onAccept: 同意后启动标准弹窗
            function() {
                feedbackCardId = null;
                startBubble(song, artist);
            }
        );
    }

    // ============================================================
    // 启动标准弹窗（调用 bubble 模块）
    // ============================================================

    function startBubble(song, artist) {
        console.log('[TLCore] 启动标准弹窗');

        if (window._TLBubble && typeof window._TLBubble.start === 'function') {
            window._TLBubble.start(song, artist);
        } else {
            console.warn('[TLCore] bubble 模块未加载');
            if (typeof showNotification === 'function') {
                showNotification('🎵 一起听已开始！', 'success', 2000);
            }
        }
    }

    // ============================================================
    // 粘贴弹窗（含提取功能）
    // ============================================================

    window._TL.showPasteModal = function(onSuccess) {
        console.log('[TLCore] 显示粘贴弹窗');

        var old = document.getElementById('tl-paste-modal');
        if (old) old.remove();

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

        var overlay = document.createElement('div');
        overlay.id = 'tl-paste-modal';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';

        overlay.innerHTML = `
            <div style="background:${bgColor};border-radius:16px;padding:24px;width:420px;max-width:92vw;box-shadow:0 24px 80px rgba(0,0,0,0.4);border:1px solid ${borderColor};">
                <div style="font-size:17px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:10px;color:${textColor};">
                    <span style="font-size:20px;">🔗</span>
                    <span>粘贴一起听链接</span>
                </div>

                <!-- 粘贴框 + 提取按钮 -->
                <div style="position:relative;margin-bottom:12px;">
                    <textarea id="tl-paste-input" style="width:100%;padding:12px;padding-right:70px;border:1.5px solid ${borderColor};border-radius:10px;font-size:13px;font-family:var(--font-family, sans-serif);resize:vertical;min-height:60px;max-height:100px;outline:none;box-sizing:border-box;background:${inputBg};color:${textColor};transition:border-color 0.2s;line-height:1.5;" placeholder="粘贴QQ音乐分享内容，例如：&#10;#QQ音乐# 快来跟我一起听《Never Enough》 https://c6.y.qq.com/... @QQ音乐"></textarea>
                    <button id="tl-extract-btn" style="position:absolute;right:8px;bottom:8px;padding:5px 14px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;background:${accentColor};color:#fff;font-family:var(--font-family,sans-serif);">提取</button>
                </div>

                <!-- 歌曲名 -->
                <div style="margin-bottom:10px;">
                    <label style="font-size:13px;color:${subColor};display:block;margin-bottom:4px;font-weight:500;">🎵 歌曲名 <span style="color:${subColor};opacity:0.6;font-weight:400;">（必填）</span></label>
                    <input id="tl-song-input" style="width:100%;padding:10px 12px;border:1.5px solid ${borderColor};border-radius:8px;font-size:14px;font-family:var(--font-family, sans-serif);outline:none;box-sizing:border-box;background:${inputBg};color:${textColor};transition:border-color 0.2s;" placeholder="请输入歌曲名">
                </div>

                <!-- 歌手名 -->
                <div style="margin-bottom:16px;">
                    <label style="font-size:13px;color:${subColor};display:block;margin-bottom:4px;font-weight:500;">🎤 歌手名 <span style="color:${subColor};opacity:0.6;font-weight:400;">（选填）</span></label>
                    <input id="tl-artist-input" style="width:100%;padding:10px 12px;border:1.5px solid ${borderColor};border-radius:8px;font-size:14px;font-family:var(--font-family, sans-serif);outline:none;box-sizing:border-box;background:${inputBg};color:${textColor};transition:border-color 0.2s;" placeholder="未知歌手">
                </div>

                <!-- 按钮 -->
                <div style="display:flex;justify-content:flex-end;gap:12px;">
                    <button id="tl-paste-cancel" style="padding:10px 24px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:${cancelBg};color:${cancelText};transition:background 0.2s;font-family:var(--font-family,sans-serif);">取消</button>
                    <button id="tl-paste-confirm" style="padding:10px 24px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:${accentColor};color:#fff;transition:opacity 0.2s;font-family:var(--font-family,sans-serif);">确认</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // 聚焦
        setTimeout(function() {
            var inp = document.getElementById('tl-paste-input');
            if (inp) inp.focus();
        }, 100);

        // ===== 提取功能 =====
        var pasteInput = document.getElementById('tl-paste-input');
        var songInput = document.getElementById('tl-song-input');
        var artistInput = document.getElementById('tl-artist-input');
        var extractBtn = document.getElementById('tl-extract-btn');

        if (extractBtn) {
            extractBtn.addEventListener('click', function() {
                var text = pasteInput ? pasteInput.value : '';
                var match = text.match(/《([^》]+)》/);
                if (match) {
                    var song = match[1].trim();
                    if (songInput) {
                        songInput.value = song;
                        songInput.style.color = textColor;
                        console.log('[TLCore] 提取到歌名:', song);
                    }
                    if (artistInput) {
                        artistInput.value = '未知歌手';
                        artistInput.style.color = subColor;
                    }
                    if (typeof showNotification === 'function') {
                        showNotification('已提取歌曲名：' + song, 'success', 1500);
                    }
                } else {
                    if (typeof showNotification === 'function') {
                        showNotification('未识别到歌曲名（请检查《》中的内容）', 'warning', 2000);
                    }
                }
            });
        }

        // ===== 歌手名输入框：点击即输（灰色占位） =====
        if (artistInput) {
            artistInput.addEventListener('focus', function() {
                if (this.value === '未知歌手') {
                    this.value = '';
                    this.style.color = textColor;
                }
            });
            artistInput.addEventListener('blur', function() {
                if (this.value.trim() === '') {
                    this.value = '未知歌手';
                    this.style.color = subColor;
                }
            });
            // 初始灰色
            if (artistInput.value === '' || artistInput.value === '未知歌手') {
                artistInput.value = '未知歌手';
                artistInput.style.color = subColor;
            }
        }

        // ===== 取消 =====
        var cancelBtn = document.getElementById('tl-paste-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                if (overlay.parentNode) overlay.remove();
            });
        }

        // ===== 确认 =====
        var confirmBtn = document.getElementById('tl-paste-confirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
                var song = songInput ? songInput.value.trim() : '';
                var artist = artistInput ? artistInput.value.trim() : '';

                // 如果歌手名是"未知歌手"（灰色占位），当作空值处理
                if (artist === '未知歌手') {
                    artist = '';
                }

                if (!song) {
                    if (typeof showNotification === 'function') {
                        showNotification('请填写歌曲名', 'warning');
                    }
                    songInput.focus();
                    return;
                }

                if (overlay.parentNode) overlay.remove();
                if (typeof onSuccess === 'function') {
                    onSuccess(song, artist || '未知歌手');
                }
            });
        }

        // 点击遮罩关闭
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    };

    // ============================================================
    // 入口函数（点击顶部按钮）
    // ============================================================

    window._TL.entry = function() {
        console.log('[TLCore] 入口被调用');

        if (window._TL && typeof window._TL.showPasteModal === 'function') {
            window._TL.showPasteModal(window._TL.startFlow);
        } else {
            console.error('[TLCore] showPasteModal 未定义');
        }
    };

    // ============================================================
    // 全局拦截（保证按钮点击稳定）
    // ============================================================

    if (!window._tlInterceptorInstalled) {
        document.addEventListener('click', function(e) {
            var target = e.target.closest('#together-listen-btn');
            if (target) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[TLCore] 拦截到按钮点击');
                if (window._TL && typeof window._TL.entry === 'function') {
                    window._TL.entry();
                } else {
                    alert('一起听功能加载中，请稍后重试');
                }
            }
        }, true);
        window._tlInterceptorInstalled = true;
        console.log('[TLCore] ✅ 全局拦截已启用');
    }

    // ============================================================
    // 确保按钮图标正确
    // ============================================================

    function ensureButtonIcon() {
        var btn = document.getElementById('together-listen-btn');
        if (btn && !btn.innerHTML.includes('fa-headphones')) {
            btn.innerHTML = '<i class="fas fa-headphones"></i>';
            btn.setAttribute('title', '一起听');
            console.log('[TLCore] 修复了按钮图标');
        }
    }

    ensureButtonIcon();
    setInterval(ensureButtonIcon, 2000);

    console.log('[TLCore] 🎯 一起听核心模块已加载');
    console.log('[TLCore] 等待 bubble 模块加载...');

})();
