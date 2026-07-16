/**
 * virtual-clock-trigger.js - 虚拟时钟自动触发调度器
 * 功能：模拟“对方主动”提出修改时间/流速
 * 参照拍一拍的自动触发机制
 */

(function() {
    'use strict';

    // ============================================================
    // 配置
    // ============================================================
    const CONFIG = {
        CHECK_INTERVAL: 180000,        // 检查间隔 3 分钟
        TRIGGER_PROBABILITY: 0.04,     // 触发概率 4%（3%~5% 取中间值）
        COOLDOWN_TIME: 900000,         // 冷却时间 15 分钟
        TIME_RATIO: 0.85,              // 时间修改占比 85%
        AUTO_AGREE_DELAY: 15000,       // 自动同意倒计时 15 秒
    };

    // 存储 key
    const STORAGE_KEY = {
        LAST_TRIGGER_TIME: 'vc_last_trigger_time',      // 上次触发时间（同类型冷却）
        LAST_TIME_TRIGGER: 'vc_last_time_trigger',      // 上次时间修改触发时间
        LAST_SPEED_TRIGGER: 'vc_last_speed_trigger',    // 上次流速修改触发时间
        PENDING_REQUEST: 'vc_pending_request',          // 待处理的请求（用于页面刷新恢复）
    };

    // ============================================================
    // 状态
    // ============================================================
    let triggerTimer = null;
    let isTriggering = false;

    // ============================================================
    // 工具函数
    // ============================================================

    function getSettings() {
        return window.settings || {};
    }

    function getPartnerName() {
        var settings = getSettings();
        return settings.partnerName || '对方';
    }

    function getMyName() {
        var settings = getSettings();
        return settings.myName || '我';
    }

    function isVirtualTimeEnabled() {
        if (window.VirtualClock && typeof window.VirtualClock.isEnabled === 'function') {
            return window.VirtualClock.isEnabled();
        }
        var settings = getSettings();
        return settings.oppCustomTime !== false;
    }

    function isChatActive() {
        // 检查聊天窗口是否可见（用户正在聊天）
        var chatContainer = document.getElementById('chat-container');
        if (!chatContainer) return false;
        var style = window.getComputedStyle(chatContainer);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function isPageVisible() {
        return document.visibilityState === 'visible';
    }

    function getLastTriggerTime(type) {
        var key = type === 'time' ? STORAGE_KEY.LAST_TIME_TRIGGER : STORAGE_KEY.LAST_SPEED_TRIGGER;
        try {
            return parseInt(localStorage.getItem(key) || '0', 10);
        } catch (e) {
            return 0;
        }
    }

    function setLastTriggerTime(type) {
        var key = type === 'time' ? STORAGE_KEY.LAST_TIME_TRIGGER : STORAGE_KEY.LAST_SPEED_TRIGGER;
        try {
            localStorage.setItem(key, String(Date.now()));
        } catch (e) {
            // ignore
        }
    }

    function setLastTriggerTimeGlobal() {
        try {
            localStorage.setItem(STORAGE_KEY.LAST_TRIGGER_TIME, String(Date.now()));
        } catch (e) {
            // ignore
        }
    }

    function isInCooldown(type) {
        var last = getLastTriggerTime(type);
        if (last === 0) return false;
        return (Date.now() - last) < CONFIG.COOLDOWN_TIME;
    }

    // ============================================================
    // 核心触发逻辑
    // ============================================================

    function tryTrigger() {
        // 检查条件
        if (!isVirtualTimeEnabled()) {
            // console.log('[vc-trigger] 虚拟时间未启用，跳过');
            return;
        }

        if (!isPageVisible()) {
            // console.log('[vc-trigger] 页面不可见，跳过');
            return;
        }

        if (!isChatActive()) {
            // console.log('[vc-trigger] 聊天未激活，跳过');
            return;
        }

        if (isTriggering) {
            // console.log('[vc-trigger] 正在处理中，跳过');
            return;
        }

        // 检查是否有待处理的请求（页面刷新恢复）
        if (hasPendingRequest()) {
            // console.log('[vc-trigger] 检测到待处理请求，恢复弹窗');
            restorePendingRequest();
            return;
        }

        // 随机概率
        var rand = Math.random();
        if (rand > CONFIG.TRIGGER_PROBABILITY) {
            // console.log('[vc-trigger] 概率未命中，跳过');
            return;
        }

        // 决定触发类型（时间 85% / 流速 15%）
        var type = Math.random() < CONFIG.TIME_RATIO ? 'time' : 'speed';

        // 检查该类型是否在冷却中
        if (isInCooldown(type)) {
            // console.log('[vc-trigger] ' + type + ' 类型在冷却中，跳过');
            return;
        }

        // 执行触发
        isTriggering = true;
        triggerRequest(type);
    }

    // ============================================================
    // 执行触发
    // ============================================================

    function triggerRequest(type) {
        var vc = window.VirtualClock;
        if (!vc) {
            isTriggering = false;
            return;
        }

        // 获取当前虚拟时间
        var currentTime = vc.getVirtualTime();
        var currentDisplay = vc.getVirtualTimeDisplay();

        // 生成随机建议值
        var suggestedValue;
        var typeLabel;

        if (type === 'time') {
            suggestedValue = vc.generateRandomTime();
            typeLabel = '时间';
        } else {
            suggestedValue = vc.generateRandomSpeed();
            typeLabel = '流速';
        }

        // 保存待处理请求（用于页面刷新恢复）
        savePendingRequest({
            type: type,
            suggestedValue: suggestedValue,
            currentDisplay: currentDisplay,
            timestamp: Date.now()
        });

        // 更新冷却时间
        setLastTriggerTime(type);
        setLastTriggerTimeGlobal();

        // 显示弹窗
        showRequestModal(type, suggestedValue, currentDisplay, currentTime);

        // 记录日志
        console.log('[vc-trigger] 触发 ' + typeLabel + ' 修改请求，建议值：' + suggestedValue);
    }

    // ============================================================
    // 显示请求弹窗（调用 virtual-clock-ui 中的函数）
    // ============================================================

    function showRequestModal(type, suggestedValue, currentDisplay, currentTime) {
        // 调用 VirtualClockUI 中新增的函数
        if (window.VirtualClockUI && typeof window.VirtualClockUI.showPartnerRequest === 'function') {
            window.VirtualClockUI.showPartnerRequest(type, suggestedValue, currentDisplay, currentTime);
        } else {
            console.warn('[vc-trigger] VirtualClockUI.showPartnerRequest 未定义');
            // 降级：用简单 alert
            var typeLabel = type === 'time' ? '时间' : '流速';
            alert('对方想修改' + typeLabel + '为：' + suggestedValue);
            // 标记完成
            clearPendingRequest();
            isTriggering = false;
        }
    }

    // ============================================================
    // 待处理请求管理（页面刷新恢复）
    // ============================================================

    function savePendingRequest(data) {
        try {
            localStorage.setItem(STORAGE_KEY.PENDING_REQUEST, JSON.stringify(data));
        } catch (e) {
            // ignore
        }
    }

    function clearPendingRequest() {
        try {
            localStorage.removeItem(STORAGE_KEY.PENDING_REQUEST);
        } catch (e) {
            // ignore
        }
    }

    function hasPendingRequest() {
        try {
            var data = localStorage.getItem(STORAGE_KEY.PENDING_REQUEST);
            if (!data) return false;
            var parsed = JSON.parse(data);
            // 如果超过 5 分钟，视为过期
            if (Date.now() - parsed.timestamp > 300000) {
                clearPendingRequest();
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    function restorePendingRequest() {
        try {
            var data = localStorage.getItem(STORAGE_KEY.PENDING_REQUEST);
            if (!data) return;
            var parsed = JSON.parse(data);
            // 检查是否过期
            if (Date.now() - parsed.timestamp > 300000) {
                clearPendingRequest();
                return;
            }
            // 恢复弹窗
            if (window.VirtualClockUI && typeof window.VirtualClockUI.showPartnerRequest === 'function') {
                window.VirtualClockUI.showPartnerRequest(
                    parsed.type,
                    parsed.suggestedValue,
                    parsed.currentDisplay,
                    null
                );
            } else {
                // 降级：清除
                clearPendingRequest();
            }
        } catch (e) {
            clearPendingRequest();
        }
    }

    // ============================================================
    // 外部调用：请求完成回调（由 UI 调用）
    // ============================================================

    function onRequestComplete(agreed, type, value) {
        clearPendingRequest();
        isTriggering = false;

        var vc = window.VirtualClock;
        if (!vc) return;

        var partnerName = getPartnerName();
        var myName = getMyName();

        if (agreed) {
            // 应用修改
            if (type === 'time') {
                vc.setVirtualTime(value);
                // 发送系统消息：对方同意了
                insertSystemMessage(myName + ' 同意了 ' + partnerName + ' 的时间修改请求 ✨');
            } else {
                vc.setSpeed(value);
                insertSystemMessage(myName + ' 同意了 ' + partnerName + ' 的流速修改请求 ✨');
            }
            if (typeof window.showNotification === 'function') {
                window.showNotification('已应用修改 ✨', 'success', 1500);
            }
        } else {
            // 拒绝
            if (type === 'time') {
                insertSystemMessage(myName + ' 拒绝了 ' + partnerName + ' 的时间修改请求 💫');
            } else {
                insertSystemMessage(myName + ' 拒绝了 ' + partnerName + ' 的流速修改请求 💫');
            }
            if (typeof window.showNotification === 'function') {
                window.showNotification('已拒绝 💫', 'info', 1500);
            }
        }
    }

    // ============================================================
    // 插入系统消息
    // ============================================================

    function insertSystemMessage(text) {
        if (typeof window.addMessage === 'function') {
            window.addMessage({
                id: Date.now() + '_vc_' + Math.random().toString(36).slice(2, 6),
                sender: null,
                text: text,
                timestamp: new Date(),
                type: 'system'
            });
        } else {
            console.warn('[vc-trigger] addMessage 不可用');
        }
    }

    // ============================================================
    // 启动 / 停止调度器
    // ============================================================

    function start() {
        if (triggerTimer) {
            stop();
        }
        // 先检查是否有待处理请求
        if (hasPendingRequest()) {
            setTimeout(function() {
                restorePendingRequest();
            }, 500);
        }
        triggerTimer = setInterval(function() {
            tryTrigger();
        }, CONFIG.CHECK_INTERVAL);
        console.log('[vc-trigger] 调度器已启动，检查间隔 ' + (CONFIG.CHECK_INTERVAL / 1000) + ' 秒');
    }

    function stop() {
        if (triggerTimer) {
            clearInterval(triggerTimer);
            triggerTimer = null;
            console.log('[vc-trigger] 调度器已停止');
        }
    }

    function restart() {
        stop();
        start();
    }

    // ============================================================
    // 导出到全局
    // ============================================================

    window.VirtualClockTrigger = {
        start: start,
        stop: stop,
        restart: restart,
        tryTrigger: tryTrigger,
        onRequestComplete: onRequestComplete,
        CONFIG: CONFIG,
        isTriggering: function() { return isTriggering; },
    };

    // 兼容旧命名
    window._vcTriggerStart = start;
    window._vcTriggerStop = stop;

    console.log('[virtual-clock-trigger] 模块已加载');

})();
