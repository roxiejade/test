/**
 * virtual-clock-ui.js - 虚拟时钟弹窗 UI
 * 包含：时刻弹窗 + 流速修改弹窗
 */

(function() {
    'use strict';

    // ============================================================
    // 弹窗 ID
    // ============================================================
    const MODAL_IDS = {
        TIME_MODAL: 'vc-time-modal',
        SPEED_MODAL: 'vc-speed-modal',
    };

    // ============================================================
    // 工具函数
    // ============================================================

    function getPartnerName() {
        var settings = window.settings || {};
        return settings.partnerName || '对方';
    }

    function getMyName() {
        var settings = window.settings || {};
        return settings.myName || '我';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ============================================================
    // 系统消息（插入聊天）
    // ============================================================

    function insertVirtualClockMessage(text, emoji, status) {
        if (typeof window.addMessage !== 'function') {
            console.warn('[vc-ui] addMessage 不可用');
            return;
        }

        var finalText = text;
        if (emoji) {
            finalText = emoji + ' ' + text;
        }

        if (status === 'waiting') {
            finalText += ' <span class="vc-waiting-dots"></span>';
        }

        window.addMessage({
            id: Date.now() + '_vc_' + Math.random().toString(36).slice(2, 6),
            sender: null,
            text: finalText,
            timestamp: new Date(),
            type: 'system',
            _vcStatus: status,
        });
    }

    function sendWaitingMessage(action) {
    var myName = getMyName();
    var label = action === 'time' ? '申请修改时间' : '申请修改流速';
    insertVirtualClockMessage('✏️ ' + myName + ' ' + label, null, 'waiting');
}

    function sendSuccessMessage(action) {
    var partnerName = getPartnerName();
    var text = '';
    var emoji = '';

    if (action === 'time') {
        text = partnerName + ' 修改了时间';
        emoji = '✨';
    } else if (action === 'speed') {
        text = partnerName + ' 修改了流速';
        emoji = '⚡';
    } else if (action === 'save-speed') {
        text = '已更新流速';
        emoji = '⚡';
    }
    insertVirtualClockMessage(text, emoji, 'success');
}

    function sendFailMessage(action) {
    var partnerName = getPartnerName();
    insertVirtualClockMessage(partnerName + ' 拒绝了请求', '💫', 'fail');
}

    // ============================================================
    // 【时刻】弹窗
    // ============================================================

    function createTimeModal() {
        var modal = document.getElementById(MODAL_IDS.TIME_MODAL);
        if (modal) {
            modal.style.display = 'flex';
            updateTimeModalContent();
            return;
        }

        modal = document.createElement('div');
        modal.id = MODAL_IDS.TIME_MODAL;
        modal.className = 'vc-modal vc-time-modal';
        modal.style.cssText = [
            'display: flex;',
            'position: fixed;',
            'inset: 0;',
            'z-index: 9999;',
            'background: rgba(0,0,0,0.55);',
            'backdrop-filter: blur(8px);',
            '-webkit-backdrop-filter: blur(8px);',
            'align-items: flex-end;',
            'justify-content: center;',
            'animation: vcModalFadeIn 0.3s ease;',
            'padding: 0 16px;',
        ].join(' ');

        modal.innerHTML = [
            '<div class="vc-modal-sheet vc-time-sheet" onclick="event.stopPropagation();" style="',
                'background: var(--secondary-bg, #fff);',
                'border-radius: 24px 24px 0 0;',
                'width: 100%;',
                'max-width: 420px;',
                'padding: 8px 20px 32px;',
                'animation: vcSheetSlideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);',
                'box-shadow: 0 -8px 40px rgba(0,0,0,0.12);',
                'border: 1px solid var(--border-color, rgba(0,0,0,0.06));',
                'border-bottom: none;',
                'position: relative;',
                'max-height: 88vh;',
                'overflow-y: auto;',
                'display: flex;',
                'flex-direction: column;',
                'gap: 8px;',
            '">',
                '<div style="width:40px;height:3px;border-radius:2px;background:var(--border-color,#ddd);margin:12px auto 8px;flex-shrink:0;"></div>',
                '<div style="display:flex;justify-content:space-between;align-items:center;padding:0 4px 4px;flex-shrink:0;">',
                    '<span style="font-size:16px;font-weight:700;color:var(--text-primary);font-family:var(--font-family);">时刻</span>',
                    '<button class="vc-modal-close" onclick="VirtualClockUI.closeTimeModal()" style="',
                        'background:none;border:none;font-size:20px;color:var(--text-secondary);',
                        'cursor:pointer;width:32px;height:32px;border-radius:50%;',
                        'display:flex;align-items:center;justify-content:center;',
                        'transition:background 0.15s;',
                    '">×</button>',
                '</div>',
                '<div id="vc-speed-display-area" onclick="VirtualClockUI.openSpeedModal()" style="',
                    'display:flex;align-items:center;gap:6px;padding:6px 12px;',
                    'border-radius:10px;cursor:pointer;transition:background 0.15s;',
                    'align-self:flex-start;',
                    'background:rgba(var(--accent-color-rgb, 197,164,126), 0.06);',
                    'border:1px solid rgba(var(--accent-color-rgb, 197,164,126), 0.12);',
                '" onmouseover="this.style.background=\'rgba(var(--accent-color-rgb), 0.12)\'" onmouseout="this.style.background=\'rgba(var(--accent-color-rgb), 0.06)\'">',
                    '<span style="font-size:12px;color:var(--text-secondary);">⏱</span>',
                    '<span id="vc-speed-display" style="font-size:13px;font-weight:600;color:var(--text-primary);">1.0x</span>',
                    '<span style="font-size:11px;color:var(--text-secondary);opacity:0.6;margin-left:2px;">点击修改</span>',
                '</div>',
                '<div style="padding:12px 0 16px;text-align:center;flex-shrink:0;">',
                    '<div id="vc-time-big-display" style="',
                        'font-size:44px;font-weight:300;font-family:"Courier New",monospace;',
                        'letter-spacing:3px;color:var(--text-primary);',
                        'line-height:1.2;',
                        'text-shadow:0 2px 4px rgba(0,0,0,0.03);',
                    '">00:00:00</div>',
                '</div>',
                                                '<div style="display:flex;gap:10px;flex-shrink:0;padding:4px 0 8px;">',
                    '<button id="vc-btn-sync" onclick="VirtualClockUI.handleSync()" style="',
                        'flex:1;padding:12px 0;border:1px solid var(--border-color);',
                        'border-radius:12px;background:#f0f0f0;',
                        'color:var(--text-secondary);font-size:14px;font-weight:600;',
                        'cursor:pointer;font-family:var(--font-family);',
                        'transition:all 0.2s;',
                    '">时间同步</button>',
                    '<button onclick="VirtualClockUI.openManualModal()" style="',
                        'flex:1;padding:12px 0;border:1px solid rgba(var(--accent-color-rgb),0.3);',
                        'border-radius:12px;background:rgba(var(--accent-color-rgb),0.14);',
                        'color:var(--accent-color);font-size:14px;font-weight:600;',
                        'cursor:pointer;font-family:var(--font-family);',
                        'transition:all 0.2s;',
                    '">手动设定</button>',
                    '<button id="vc-btn-request" onclick="VirtualClockUI.handleRequestTime()" style="',
                        'flex:1;padding:12px 0;border:1px solid rgba(0,0,0,0.15);',
                        'border-radius:12px;background:var(--accent-color,#c5a47e);',
                        'color:#fff;font-size:14px;font-weight:600;',
                        'cursor:pointer;font-family:var(--font-family);',
                        'transition:all 0.2s;box-shadow:0 4px 14px rgba(var(--accent-color-rgb,197,164,126),0.25);',
                    '">申请修改</button>',
                '</div>',
                '<div id="vc-time-status" style="',
                    'text-align:center;font-size:13px;color:var(--text-secondary);',
                    'min-height:20px;padding:4px 0;flex-shrink:0;',
                    'transition:all 0.3s;',
                '"></div>',
            '</div>'
        ].join('');

        document.body.appendChild(modal);

        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                VirtualClockUI.closeTimeModal();
            }
        });

        updateTimeModalContent();

        var escHandler = function(e) {
            if (e.key === 'Escape') {
                VirtualClockUI.closeTimeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        modal._escHandler = escHandler;
    }

    function updateTimeModalContent() {
        var timeDisplay = document.getElementById('vc-time-big-display');
        var speedDisplay = document.getElementById('vc-speed-display');
        var statusEl = document.getElementById('vc-time-status');

        if (timeDisplay) {
            var vt = window.VirtualClock ? window.VirtualClock.getVirtualTimeDisplay() : '--:--:--';
            timeDisplay.textContent = vt || '--:--:--';
        }

        if (speedDisplay) {
            var speed = window.VirtualClock ? window.VirtualClock.getSpeed() : 1.0;
            speedDisplay.textContent = speed.toFixed(1) + 'x';
        }

        if (statusEl) {
            statusEl.textContent = '';
            statusEl.style.color = 'var(--text-secondary)';
        }

        var requestBtn = document.getElementById('vc-btn-request');
        if (requestBtn) {
            requestBtn.disabled = false;
            requestBtn.textContent = '申请修改';
            requestBtn.style.opacity = '1';
            requestBtn.style.cursor = 'pointer';
        }

        var syncBtn = document.getElementById('vc-btn-sync');
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.style.opacity = '1';
            syncBtn.style.cursor = 'pointer';
        }
    }

    function closeTimeModal() {
        var modal = document.getElementById(MODAL_IDS.TIME_MODAL);
        if (modal) {
            // 如果有等待状态，不关闭（防止用户误触背景关闭）
            if (TIME_MODAL_STATE.waiting) return;
            modal.style.display = 'none';
        }
    }

    // ============================================================
    // 【流速修改】弹窗
    // ============================================================

    function createSpeedModal() {
        var modal = document.getElementById(MODAL_IDS.SPEED_MODAL);
        if (modal) {
            modal.style.display = 'flex';
            updateSpeedModalContent();
            return;
        }

        var currentSpeed = window.VirtualClock ? window.VirtualClock.getSpeed() : 1.0;

        modal = document.createElement('div');
        modal.id = MODAL_IDS.SPEED_MODAL;
        modal.className = 'vc-modal vc-speed-modal';
        modal.style.cssText = [
            'display: flex;',
            'position: fixed;',
            'inset: 0;',
            'z-index: 10000;',
            'background: rgba(0,0,0,0.5);',
            'backdrop-filter: blur(6px);',
            '-webkit-backdrop-filter: blur(6px);',
            'align-items: flex-end;',
            'justify-content: center;',
            'animation: vcModalFadeIn 0.25s ease;',
            'padding: 0 16px;',
        ].join(' ');

        modal.innerHTML = [
            '<div class="vc-modal-sheet vc-speed-sheet" onclick="event.stopPropagation();" style="',
                'background: var(--secondary-bg, #fff);',
                'border-radius: 24px 24px 0 0;',
                'width: 100%;',
                'max-width: 420px;',
                'padding: 8px 20px 32px;',
                'animation: vcSheetSlideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);',
                'box-shadow: 0 -8px 40px rgba(0,0,0,0.12);',
                'border: 1px solid var(--border-color, rgba(0,0,0,0.06));',
                'border-bottom: none;',
                'position: relative;',
                'max-height: 88vh;',
                'overflow-y: auto;',
                'display: flex;',
                'flex-direction: column;',
                'gap: 8px;',
            '">',
                '<div style="width:40px;height:3px;border-radius:2px;background:var(--border-color,#ddd);margin:12px auto 8px;flex-shrink:0;"></div>',
                '<div style="display:flex;justify-content:space-between;align-items:center;padding:0 4px 4px;flex-shrink:0;">',
                    '<span style="font-size:16px;font-weight:700;color:var(--text-primary);font-family:var(--font-family);">⏳ 时间流速</span>',
                    '<button class="vc-modal-close" onclick="VirtualClockUI.closeSpeedModal()" style="',
                        'background:none;border:none;font-size:20px;color:var(--text-secondary);',
                        'cursor:pointer;width:32px;height:32px;border-radius:50%;',
                        'display:flex;align-items:center;justify-content:center;',
                        'transition:background 0.15s;',
                    '">×</button>',
                '</div>',
                '<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:4px 0 8px;flex-shrink:0;">',
                    '<span style="font-size:14px;color:var(--text-secondary);">当前</span>',
                    '<span id="vc-speed-current-display" style="font-size:20px;font-weight:700;color:var(--accent-color,#c5a47e);">' + currentSpeed.toFixed(1) + 'x</span>',
                    '<span style="font-size:14px;color:var(--text-secondary);">→</span>',
                    '<span id="vc-speed-target-display" style="font-size:20px;font-weight:700;color:var(--text-primary);">' + currentSpeed.toFixed(1) + 'x</span>',
                '</div>',
                '<div style="display:flex;flex-direction:column;gap:10px;padding:4px 0;flex-shrink:0;">',
                    '<div style="display:flex;align-items:center;gap:12px;background:var(--primary-bg,#f5f5f5);border-radius:12px;padding:8px 14px;border:1px solid var(--border-color,#ddd);">',
                        '<span style="font-size:12px;color:var(--text-secondary);white-space:nowrap;">我的时间流速</span>',
                        '<span style="font-size:15px;font-weight:700;color:var(--text-primary);">1.0x</span>',
                    '</div>',
                    '<div style="display:flex;align-items:center;gap:12px;background:var(--primary-bg,#f5f5f5);border-radius:12px;padding:6px 14px;border:1px solid var(--border-color,#ddd);">',
                        '<span style="font-size:12px;color:var(--text-secondary);white-space:nowrap;">他的时间流速</span>',
                        '<input id="vc-speed-input" type="number" step="0.1" min="0.3" max="30" value="' + currentSpeed.toFixed(1) + '" style="',
                            'flex:1;border:none;background:transparent;',
                            'font-size:16px;font-weight:700;color:var(--text-primary);',
                            'outline:none;text-align:right;font-family:var(--font-family);',
                            'min-width:60px;',
                        '">',
                        '<span style="font-size:14px;font-weight:700;color:var(--text-secondary);">x</span>',
                    '</div>',
                '</div>',
                '<div style="display:flex;gap:10px;flex-shrink:0;padding:4px 0 8px;">',
                    '<button id="vc-btn-random" onclick="VirtualClockUI.handleRandomSpeed()" style="',
                        'flex:1;padding:11px 0;border:1.5px solid var(--border-color,#ddd);',
                        'border-radius:12px;background:var(--primary-bg,#f5f5f5);',
                        'color:var(--text-primary);font-size:13px;font-weight:600;',
                        'cursor:pointer;font-family:var(--font-family);',
                        'transition:all 0.2s;',
                    '">🎲 随机</button>',
                    '<button id="vc-btn-speed-request" onclick="VirtualClockUI.handleRequestSpeed()" style="',
                        'flex:1;padding:11px 0;border:1.5px solid transparent;',
                        'border-radius:12px;background:var(--accent-color,#c5a47e);',
                        'color:#fff;font-size:13px;font-weight:600;',
                        'cursor:pointer;font-family:var(--font-family);',
                        'transition:all 0.2s;box-shadow:0 4px 14px rgba(var(--accent-color-rgb,197,164,126),0.2);',
                    '">修改流速</button>',
                    '<button id="vc-btn-speed-save" onclick="VirtualClockUI.handleSaveSpeed()" style="',
                        'flex:1;padding:11px 0;border:1.5px solid var(--border-color,#ddd);',
                        'border-radius:12px;background:var(--primary-bg,#f5f5f5);',
                        'color:var(--text-primary);font-size:13px;font-weight:600;',
                        'cursor:pointer;font-family:var(--font-family);',
                        'transition:all 0.2s;',
                    '">保存</button>',
                '</div>',
                '<div id="vc-speed-status" style="',
                    'text-align:center;font-size:13px;color:var(--text-secondary);',
                    'min-height:20px;padding:4px 0;flex-shrink:0;',
                    'transition:all 0.3s;',
                '"></div>',
            '</div>'
        ].join('');

        document.body.appendChild(modal);

        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                VirtualClockUI.closeSpeedModal();
            }
        });

        updateSpeedModalContent();

        var escHandler = function(e) {
            if (e.key === 'Escape') {
                VirtualClockUI.closeSpeedModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        modal._escHandler = escHandler;
    }

    function updateSpeedModalContent() {
        var speed = window.VirtualClock ? window.VirtualClock.getSpeed() : 1.0;
        var currentDisplay = document.getElementById('vc-speed-current-display');
        var targetDisplay = document.getElementById('vc-speed-target-display');
        var input = document.getElementById('vc-speed-input');

        if (currentDisplay) currentDisplay.textContent = speed.toFixed(1) + 'x';
        if (targetDisplay) targetDisplay.textContent = speed.toFixed(1) + 'x';
        if (input) input.value = speed.toFixed(1);

        var statusEl = document.getElementById('vc-speed-status');
        if (statusEl) {
            statusEl.textContent = '';
            statusEl.style.color = 'var(--text-secondary)';
        }

        var reqBtn = document.getElementById('vc-btn-speed-request');
        if (reqBtn) {
            reqBtn.disabled = false;
            reqBtn.textContent = '修改流速';
            reqBtn.style.opacity = '1';
            reqBtn.style.cursor = 'pointer';
        }

        var saveBtn = document.getElementById('vc-btn-speed-save');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.style.opacity = '1';
            saveBtn.style.cursor = 'pointer';
        }

        var randomBtn = document.getElementById('vc-btn-random');
        if (randomBtn) {
            randomBtn.disabled = false;
            randomBtn.style.opacity = '1';
            randomBtn.style.cursor = 'pointer';
        }
    }

    function closeSpeedModal() {
        var modal = document.getElementById(MODAL_IDS.SPEED_MODAL);
        if (modal) {
            if (SPEED_MODAL_STATE.waiting) return;
            modal.style.display = 'none';
        }
    }

    // ============================================================
    // 状态管理
    // ============================================================

    var TIME_MODAL_STATE = { waiting: false };
    var SPEED_MODAL_STATE = { waiting: false };

    // ============================================================
    // 交互处理函数
    // ============================================================

    function handleSync() {
        if (TIME_MODAL_STATE.waiting) return;

        var vc = window.VirtualClock;
        if (!vc) return;

        vc.syncToRealTime();
        updateTimeModalContent();

        if (typeof window.showNotification === 'function') {
            window.showNotification('时间已同步到当前真实时间', 'success', 2000);
        }

        closeTimeModal();
    }

    function handleRequestTime() {
        if (TIME_MODAL_STATE.waiting) return;

        var statusEl = document.getElementById('vc-time-status');
        var reqBtn = document.getElementById('vc-btn-request');
        var syncBtn = document.getElementById('vc-btn-sync');

        TIME_MODAL_STATE.waiting = true;

        if (reqBtn) {
            reqBtn.disabled = true;
            reqBtn.textContent = '等待回应中…';
            reqBtn.style.opacity = '0.6';
            reqBtn.style.cursor = 'not-allowed';
        }
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.style.opacity = '0.6';
            syncBtn.style.cursor = 'not-allowed';
        }
        if (statusEl) {
            statusEl.textContent = '⏳ 等待对方回应…';
            statusEl.style.color = 'var(--accent-color, #c5a47e)';
        }

        sendWaitingMessage('time');

        var delay = 1300 + Math.random() * 900;
        setTimeout(function() {
            var success = Math.random() < 0.62;
            TIME_MODAL_STATE.waiting = false;

            if (success) {
                var vc = window.VirtualClock;
                if (vc) {
                    var newTime = vc.generateRandomTime();
                    vc.setVirtualTime(newTime);
                }
                if (statusEl) {
                    statusEl.textContent = '✅ 对方同意了';
                    statusEl.style.color = '#4caf50';
                }
                sendSuccessMessage('time');
                if (typeof window.showNotification === 'function') {
                    window.showNotification('对方同意了 ✨', 'success', 2000);
                }
                setTimeout(function() {
                    closeTimeModal();
                }, 800);
            } else {
                if (statusEl) {
                    statusEl.textContent = '❌ 对方拒绝了';
                    statusEl.style.color = '#ef5350';
                }
                sendFailMessage('time');
                if (typeof window.showNotification === 'function') {
                    window.showNotification('对方拒绝了 💫', 'error', 2000);
                }
                if (reqBtn) {
                    reqBtn.disabled = false;
                    reqBtn.textContent = '再试一次';
                    reqBtn.style.opacity = '1';
                    reqBtn.style.cursor = 'pointer';
                }
                if (syncBtn) {
                    syncBtn.disabled = false;
                    syncBtn.style.opacity = '1';
                    syncBtn.style.cursor = 'pointer';
                }
            }
        }, delay);
    }

    function openSpeedModal() {
        if (TIME_MODAL_STATE.waiting) return;
        createSpeedModal();
    }

    function handleRandomSpeed() {
        if (SPEED_MODAL_STATE.waiting) return;
        var vc = window.VirtualClock;
        if (!vc) return;

        var randomSpeed = vc.generateRandomSpeed();
        var input = document.getElementById('vc-speed-input');
        var targetDisplay = document.getElementById('vc-speed-target-display');

        if (input) input.value = randomSpeed.toFixed(1);
        if (targetDisplay) targetDisplay.textContent = randomSpeed.toFixed(1) + 'x';

        if (typeof window.showNotification === 'function') {
            window.showNotification('随机生成流速: ' + randomSpeed.toFixed(1) + 'x', 'info', 1500);
        }
    }

    function handleRequestSpeed() {
        if (SPEED_MODAL_STATE.waiting) return;

        var input = document.getElementById('vc-speed-input');
        if (!input) return;

        var targetSpeed = parseFloat(input.value);
        if (isNaN(targetSpeed) || targetSpeed < 0.3 || targetSpeed > 30) {
            if (typeof window.showNotification === 'function') {
                window.showNotification('请输入 0.3 ~ 30.0 之间的数值', 'error', 2000);
            }
            return;
        }

        var statusEl = document.getElementById('vc-speed-status');
        var reqBtn = document.getElementById('vc-btn-speed-request');
        var saveBtn = document.getElementById('vc-btn-speed-save');
        var randomBtn = document.getElementById('vc-btn-random');

        SPEED_MODAL_STATE.waiting = true;

        if (reqBtn) {
            reqBtn.disabled = true;
            reqBtn.textContent = '等待回应中…';
            reqBtn.style.opacity = '0.6';
            reqBtn.style.cursor = 'not-allowed';
        }
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.style.opacity = '0.6';
            saveBtn.style.cursor = 'not-allowed';
        }
        if (randomBtn) {
            randomBtn.disabled = true;
            randomBtn.style.opacity = '0.6';
            randomBtn.style.cursor = 'not-allowed';
        }
        if (statusEl) {
            statusEl.textContent = '⏳ 等待对方回应…';
            statusEl.style.color = 'var(--accent-color, #c5a47e)';
        }

        sendWaitingMessage('speed');

        var delay = 1300 + Math.random() * 900;
        setTimeout(function() {
            var success = Math.random() < 0.62;
            SPEED_MODAL_STATE.waiting = false;

            if (success) {
                var vc = window.VirtualClock;
                if (vc) {
                   // ===== 修改这里：生成随机流速，而不是用输入框的值 =====
                var randomSpeed = vc.generateRandomSpeed();
                vc.setSpeed(randomSpeed);
                // ===================================================
                }
                if (statusEl) {
                    statusEl.textContent = '✅ 对方同意了';
                    statusEl.style.color = '#4caf50';
                }
                sendSuccessMessage('speed');
                if (typeof window.showNotification === 'function') {
                    window.showNotification('对方同意了 ⚡', 'success', 2000);
                }
                setTimeout(function() {
                    closeSpeedModal();
                }, 800);
            } else {
                if (statusEl) {
                    statusEl.textContent = '❌ 对方拒绝了';
                    statusEl.style.color = '#ef5350';
                }
                sendFailMessage('speed');
                if (typeof window.showNotification === 'function') {
                    window.showNotification('对方拒绝了 💫', 'error', 2000);
                }
                if (reqBtn) {
                    reqBtn.disabled = false;
                    reqBtn.textContent = '再试一次';
                    reqBtn.style.opacity = '1';
                    reqBtn.style.cursor = 'pointer';
                }
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.style.opacity = '1';
                    saveBtn.style.cursor = 'pointer';
                }
                if (randomBtn) {
                    randomBtn.disabled = false;
                    randomBtn.style.opacity = '1';
                    randomBtn.style.cursor = 'pointer';
                }
            }
        }, delay);
    }

    function handleSaveSpeed() {
        if (SPEED_MODAL_STATE.waiting) return;

        var input = document.getElementById('vc-speed-input');
        if (!input) return;

        var targetSpeed = parseFloat(input.value);
        if (isNaN(targetSpeed) || targetSpeed < 0.3 || targetSpeed > 30) {
            if (typeof window.showNotification === 'function') {
                window.showNotification('请输入 0.3 ~ 30.0 之间的数值', 'error', 2000);
            }
            return;
        }

        var vc = window.VirtualClock;
        if (vc) {
            vc.setSpeed(targetSpeed);
        }

        sendSuccessMessage('save-speed');

        if (typeof window.showNotification === 'function') {
            window.showNotification('流速已更新 ⚡', 'success', 2000);
        }

        closeSpeedModal();
    }

    // ============================================================
    // 导出到全局
    // ============================================================

    window.VirtualClockUI = {
        // 时刻弹窗
        openTimeModal: function() {
            if (!window.VirtualClock) return;
            if (!window.VirtualClock.isEnabled()) {
                if (typeof window.showNotification === 'function') {
                    window.showNotification('虚拟时间戳已关闭，请在设置中开启', 'info', 2000);
                }
                return;
            }
            createTimeModal();
            updateTimeModalContent();
        },
        closeTimeModal: closeTimeModal,
        updateTimeModal: updateTimeModalContent,

        // 流速弹窗
        openSpeedModal: openSpeedModal,
        closeSpeedModal: closeSpeedModal,
        updateSpeedModal: updateSpeedModalContent,

        // 交互
        handleSync: handleSync,
        handleRequestTime: handleRequestTime,
        handleRandomSpeed: handleRandomSpeed,
        handleRequestSpeed: handleRequestSpeed,
        handleSaveSpeed: handleSaveSpeed,

                // 手动设定时间
        openManualModal: openManualModal,
        closeManualModal: closeManualModal,
        adjManual: adjManual,
        confirmManual: confirmManual,
        
        // 内部状态（只读）
        isTimeWaiting: function() { return TIME_MODAL_STATE.waiting; },
        isSpeedWaiting: function() { return SPEED_MODAL_STATE.waiting; },
    };

    // ============================================================
// 手动设定时间
// ============================================================

var _manualModal = null;

function getCurrentTimeForManual() {
    // 从 DOM 读取当前显示的虚拟时间
    var el = document.querySelector('.virtual-timestamp .vt-time');
    if (el) {
        var text = el.textContent.trim();
        var parts = text.split(':').map(Number);
        if (parts.length === 3) {
            return { hours: parts[0] || 0, minutes: parts[1] || 0, seconds: parts[2] || 0 };
        }
        if (parts.length === 2) {
            return { hours: parts[0] || 0, minutes: parts[1] || 0, seconds: 0 };
        }
    }
    // 备选：从 settings.oppTime 读取
    var settings = window.settings || {};
    var parts = (settings.oppTime || '00:00:00').split(':').map(Number);
    return {
        hours: parts[0] || 0,
        minutes: parts[1] || 0,
        seconds: parts[2] || 0
    };
}

function updateManualPreview() {
    var h = parseInt(document.getElementById('manual-h')?.value) || 0;
    var m = parseInt(document.getElementById('manual-m')?.value) || 0;
    var s = parseInt(document.getElementById('manual-s')?.value) || 0;
    var p = document.getElementById('manual-preview');
    if (p) {
        p.textContent =
            String(h).padStart(2, '0') + ':' +
            String(m).padStart(2, '0') + ':' +
            String(s).padStart(2, '0');
    }
}

function openManualModal() {
    if (_manualModal) {
        _manualModal.style.display = 'flex';
        // 刷新显示当前时间
        var now = getCurrentTimeForManual();
        var hInput = document.getElementById('manual-h');
        var mInput = document.getElementById('manual-m');
        var sInput = document.getElementById('manual-s');
        if (hInput) hInput.value = now.hours;
        if (mInput) mInput.value = now.minutes;
        if (sInput) sInput.value = now.seconds;
        updateManualPreview();
        return;
    }

    var now = getCurrentTimeForManual();

    var modal = document.createElement('div');
    modal.id = 'vc-manual-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:0 20px;';

    modal.innerHTML = [
        '<style>',
        '#vc-manual-modal input[type=number]::-webkit-inner-spin-button,',
        '#vc-manual-modal input[type=number]::-webkit-outer-spin-button {',
        '-webkit-appearance:none !important;margin:0 !important;display:none !important;}',
        '#vc-manual-modal input[type=number] {',
        '-moz-appearance:textfield !important;appearance:textfield !important;}',
        '</style>',
        '<div onclick="event.stopPropagation();" style="',
            'background:var(--secondary-bg,#fff);',
            'border-radius:20px;',
            'width:100%;',
            'max-width:340px;',
            'padding:8px 20px 24px;',
            'box-shadow:0 12px 40px rgba(0,0,0,0.2);',
            'border:1px solid var(--border-color,rgba(0,0,0,0.06));',
            'display:flex;',
            'flex-direction:column;',
            'gap:6px;',
            'animation:vcSheetSlideUp 0.3s cubic-bezier(0.34,1.56,0.64,1);',
        '">',
            '<div style="width:40px;height:3px;border-radius:2px;background:var(--border-color,#ddd);margin:12px auto 6px;"></div>',
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:0 2px 4px;">',
                '<span style="font-size:16px;font-weight:700;color:var(--text-primary);">✏️ 手动设定时间</span>',
                '<button onclick="window.VirtualClockUI.closeManualModal()" style="',
                    'background:none;border:none;font-size:20px;color:var(--text-secondary);',
                    'cursor:pointer;width:32px;height:32px;border-radius:50%;',
                    'display:flex;align-items:center;justify-content:center;',
                '">×</button>',
            '</div>',
            '<div style="display:flex;gap:6px;justify-content:center;padding:4px 0 10px;">',
                '<div style="text-align:center;flex:1;min-width:0;">',
                    '<div style="font-size:11px;color:var(--text-secondary);letter-spacing:2px;margin-bottom:6px;">时</div>',
                    '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">',
                        '<button onclick="window.VirtualClockUI.adjManual(\'h\',1)" style="width:40px;height:26px;border:none;border-radius:6px;background:rgba(197,164,126,0.1);cursor:pointer;font-size:12px;">▲</button>',
                        '<input id="manual-h" type="number" min="0" max="23" value="0" style="width:40px;height:38px;border:1.5px solid var(--border-color);border-radius:8px;text-align:right;font-size:20px;font-weight:700;font-family:var(--font-family);color:var(--text-primary);background:var(--primary-bg);outline:none;padding-right:8px;">',
                        '<button onclick="window.VirtualClockUI.adjManual(\'h\',-1)" style="width:40px;height:26px;border:none;border-radius:6px;background:rgba(197,164,126,0.1);cursor:pointer;font-size:12px;">▼</button>',
                    '</div>',
                '</div>',
                '<div style="font-size:28px;color:var(--text-secondary);display:flex;align-items:center;padding:0 2px;font-weight:300;">:</div>',
                '<div style="text-align:center;flex:1;min-width:0;">',
                    '<div style="font-size:11px;color:var(--text-secondary);letter-spacing:2px;margin-bottom:6px;">分</div>',
                    '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">',
                        '<button onclick="window.VirtualClockUI.adjManual(\'m\',1)" style="width:40px;height:26px;border:none;border-radius:6px;background:rgba(197,164,126,0.1);cursor:pointer;font-size:12px;">▲</button>',
                        '<input id="manual-m" type="number" min="0" max="59" value="0" style="width:40px;height:38px;border:1.5px solid var(--border-color);border-radius:8px;text-align:right;font-size:20px;font-weight:700;font-family:var(--font-family);color:var(--text-primary);background:var(--primary-bg);outline:none;padding-right:8px;">',
                        '<button onclick="window.VirtualClockUI.adjManual(\'m\',-1)" style="width:40px;height:26px;border:none;border-radius:6px;background:rgba(197,164,126,0.1);cursor:pointer;font-size:12px;">▼</button>',
                    '</div>',
                '</div>',
                '<div style="font-size:28px;color:var(--text-secondary);display:flex;align-items:center;padding:0 2px;font-weight:300;">:</div>',
                '<div style="text-align:center;flex:1;min-width:0;">',
                    '<div style="font-size:11px;color:var(--text-secondary);letter-spacing:2px;margin-bottom:6px;">秒</div>',
                    '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">',
                        '<button onclick="window.VirtualClockUI.adjManual(\'s\',1)" style="width:40px;height:26px;border:none;border-radius:6px;background:rgba(197,164,126,0.1);cursor:pointer;font-size:12px;">▲</button>',
                        '<input id="manual-s" type="number" min="0" max="59" value="0" style="width:40px;height:38px;border:1.5px solid var(--border-color);border-radius:8px;text-align:right;font-size:20px;font-weight:700;font-family:var(--font-family);color:var(--text-primary);background:var(--primary-bg);outline:none;padding-right:8px;">',
                        '<button onclick="window.VirtualClockUI.adjManual(\'s\',-1)" style="width:40px;height:26px;border:none;border-radius:6px;background:rgba(197,164,126,0.1);cursor:pointer;font-size:12px;">▼</button>',
                    '</div>',
                '</div>',
            '</div>',
            '<div style="text-align:center;font-size:13px;color:var(--text-secondary);padding:4px 0 6px;">',
                '当前设定：<span id="manual-preview" style="font-weight:600;color:var(--text-primary);font-family:monospace;">00:00:00</span>',
            '</div>',
            '<div style="display:flex;gap:10px;padding:4px 0 0;">',
                '<button onclick="window.VirtualClockUI.closeManualModal()" style="',
                    'flex:1;padding:11px 0;border:1.5px solid var(--border-color);',
                    'border-radius:12px;background:var(--primary-bg);',
                    'color:var(--text-primary);font-size:14px;font-weight:600;',
                    'cursor:pointer;',
                '">取消</button>',
                '<button onclick="window.VirtualClockUI.confirmManual()" style="',
                    'flex:2;padding:11px 0;border:1.5px solid transparent;',
                    'border-radius:12px;background:var(--accent-color,#c5a47e);',
                    'color:#fff;font-size:14px;font-weight:600;',
                    'cursor:pointer;box-shadow:0 4px 14px rgba(var(--accent-color-rgb,197,164,126),0.25);',
                '">确认</button>',
            '</div>',
        '</div>'
    ].join('');

    document.body.appendChild(modal);
    _manualModal = modal;

    // 填充当前时间
    setTimeout(function() {
        var current = getCurrentTimeForManual();
        document.getElementById('manual-h').value = current.hours;
        document.getElementById('manual-m').value = current.minutes;
        document.getElementById('manual-s').value = current.seconds;
        updateManualPreview();
    }, 50);

    // 点击外部关闭
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            window.VirtualClockUI.closeManualModal();
        }
    });

    // 输入框事件
    ['h', 'm', 's'].forEach(function(id) {
        var el = document.getElementById('manual-' + id);
        if (el) {
            el.addEventListener('input', updateManualPreview);
            el.addEventListener('focus', function() { this.select(); });
        }
    });

    // ESC 关闭
    var escHandler = function(e) {
        if (e.key === 'Escape') {
            window.VirtualClockUI.closeManualModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
    modal._escHandler = escHandler;
}

function closeManualModal() {
    if (_manualModal) {
        _manualModal.style.display = 'none';
    }
}

function adjManual(target, dir) {
    var el = document.getElementById('manual-' + target);
    if (!el) return;
    var val = parseInt(el.value) || 0;
    var max = target === 'h' ? 24 : 60;
    var newVal = ((val + dir) % max + max) % max;
    el.value = newVal;
    updateManualPreview();
}

function confirmManual() {
    var h = parseInt(document.getElementById('manual-h').value) || 0;
    var m = parseInt(document.getElementById('manual-m').value) || 0;
    var s = parseInt(document.getElementById('manual-s').value) || 0;
    h = ((h % 24) + 24) % 24;
    m = ((m % 60) + 60) % 60;
    s = ((s % 60) + 60) % 60;
    var timeStr = String(h).padStart(2, '0') + ':' +
                  String(m).padStart(2, '0') + ':' +
                  String(s).padStart(2, '0');

    var settings = window.settings || {};
    settings.oppTime = timeStr;
    settings.oppTimeSetAt = Date.now();
    // 流速保持不变
    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window._updateVirtualTimeDisplay === 'function') {
        window._updateVirtualTimeDisplay();
    }
    if (typeof window.VirtualClockUI !== 'undefined' && window.VirtualClockUI.updateTimeModal) {
        window.VirtualClockUI.updateTimeModal();
    }
    if (typeof window.showNotification === 'function') {
        window.showNotification('✅ 时间已设定为 ' + timeStr, 'success', 2000);
    }
    closeManualModal();
}

// ============================================================
// 手动设定时间结束
// ============================================================
    
    console.log('[virtual-clock-ui] UI 模块已加载');
})();
