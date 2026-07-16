/**
 * virtual-clock.js - 虚拟时钟核心逻辑
 * 对方虚拟时间戳：所有对方消息共用同一个虚拟时钟
 * 支持：时间同步、申请修改、流速控制
 */

(function() {
    'use strict';

    // ============================================================
    // 配置键名（存入 settings）
    // ============================================================
    const CONFIG = {
        // 虚拟时间基础配置
        OPP_TIME: 'oppTime',              // 基准时间 "HH:mm:ss"
        OPP_TIME_SET_AT: 'oppTimeSetAt',  // 基准时间设置时的真实时间戳
        OPP_TIME_SPEED: 'oppTimeSpeed',   // 流速（默认 1.0）
        OPP_CUSTOM_TIME: 'oppCustomTime', // 是否启用虚拟时间（默认 true）
        OPP_TIME_LAST_MSG_ID: 'oppTimeLastMsgId', // 上次附着的最新消息ID（用于判断是否需要移动位置）

        // 默认值
        DEFAULT_TIME: '00:00:00',
        DEFAULT_SPEED: 1.0,
        DEFAULT_ENABLED: true,
    };

    // ============================================================
    // 虚拟时间计算核心
    // ============================================================

    /**
     * 获取当前虚拟时间对象（包含时、分、秒）
     * @returns {Object} { hours, minutes, seconds, totalSeconds, display }
     */
    function getVirtualTime() {
        const settings = window.settings || {};
        const oppTime = settings.oppTime || CONFIG.DEFAULT_TIME;
        const oppTimeSetAt = settings.oppTimeSetAt || Date.now();
        const speed = parseFloat(settings.oppTimeSpeed) || CONFIG.DEFAULT_SPEED;

        // 解析基准时间
        const parts = oppTime.split(':').map(Number);
        const baseHours = parts[0] || 0;
        const baseMinutes = parts[1] || 0;
        const baseSeconds = parts[2] || 0;
        const baseTotal = baseHours * 3600 + baseMinutes * 60 + baseSeconds;

        // 计算经过的秒数（乘以流速）
        const elapsed = (Date.now() - oppTimeSetAt) / 1000;
        const totalSeconds = baseTotal + elapsed * speed;

        // 归一化到 0-86399 秒（24小时）
        const normalized = ((totalSeconds % 86400) + 86400) % 86400;
        const hours = Math.floor(normalized / 3600);
        const minutes = Math.floor((normalized % 3600) / 60);
        const seconds = Math.floor(normalized % 60);

        return {
            hours,
            minutes,
            seconds,
            totalSeconds: normalized,
            display: function(withSeconds) {
                if (withSeconds) {
                    return String(hours).padStart(2, '0') + ':' +
                           String(minutes).padStart(2, '0') + ':' +
                           String(seconds).padStart(2, '0');
                }
                return String(hours).padStart(2, '0') + ':' +
                       String(minutes).padStart(2, '0');
            }
        };
    }

    /**
     * 获取虚拟时间显示字符串（遵循时间格式设置）
     */
    function getVirtualTimeDisplay() {
    const settings = window.settings || {};
    // 优先使用虚拟时间独立样式，如果没有则回退到全局时间格式
    const timeFormat = settings.oppTimeFormat || settings.timeFormat || 'HH:mm';
    const vt = getVirtualTime();

    if (timeFormat === 'off') return null;

    const withSeconds = timeFormat === 'HH:mm:ss' || timeFormat === 'h:mm:ss AM/PM';

    if (timeFormat === 'HH:mm' || timeFormat === 'HH:mm:ss') {
        return vt.display(withSeconds);
    }

    let h = vt.hours;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    if (withSeconds) {
        return h + ':' + String(vt.minutes).padStart(2, '0') + ':' + String(vt.seconds).padStart(2, '0') + ' ' + ampm;
    }
    return h + ':' + String(vt.minutes).padStart(2, '0') + ' ' + ampm;
}

    /**
     * 获取当前流速
     */
    function getSpeed() {
        const settings = window.settings || {};
        return parseFloat(settings.oppTimeSpeed) || CONFIG.DEFAULT_SPEED;
    }

    /**
     * 获取虚拟时间是否启用
     */
    function isVirtualTimeEnabled() {
        const settings = window.settings || {};
        // 如果未定义，默认启用
        if (settings.oppCustomTime === undefined) return true;
        return settings.oppCustomTime;
    }

    /**
     * 生成随机时间（HH:mm:ss 格式）
     */
    function generateRandomTime() {
        const h = Math.floor(Math.random() * 24);
        const m = Math.floor(Math.random() * 60);
        const s = Math.floor(Math.random() * 60);
        return String(h).padStart(2, '0') + ':' +
               String(m).padStart(2, '0') + ':' +
               String(s).padStart(2, '0');
    }

    /**
     * 生成随机流速（0.3 ~ 30.0，保留1位小数）
     */
    function generateRandomSpeed() {
    return Math.round((0.3 + Math.random() * 49.7) * 10) / 10;  // 0.3~50.0
}

    /**
     * 设置虚拟时间（基准时间 + 起始时刻）
     */
    function setVirtualTime(timeStr) {
    if (!window.settings) return;
    window.settings.oppTime = timeStr || generateRandomTime();
    window.settings.oppTimeSetAt = Date.now();
    if (typeof window.saveData === 'function') {
        window.saveData();
    }
    if (typeof window._updateVirtualTimeDisplay === 'function') {
        window._updateVirtualTimeDisplay();
    }
}

    /**
     * 同步到真实时间
     */
    function syncToRealTime() {
    if (!window.settings) return;
    const now = new Date();
    const timeStr = String(now.getHours()).padStart(2, '0') + ':' +
                    String(now.getMinutes()).padStart(2, '0') + ':' +
                    String(now.getSeconds()).padStart(2, '0');
    window.settings.oppTime = timeStr;
    window.settings.oppTimeSetAt = Date.now();
    window.settings.oppTimeSpeed = 1.0;
    if (typeof window.saveData === 'function') {
        window.saveData();
    }
    if (typeof window._updateVirtualTimeDisplay === 'function') {
        window._updateVirtualTimeDisplay();
    }
}

    /**
     * 设置流速
     */
    function setSpeed(value) {
    if (!window.settings) return;
    // 重新计算基准时间，保持当前显示时间不变
    const current = getVirtualTime();
    const currentTotal = current.totalSeconds;
    const now = Date.now();

    // 反向计算：新的基准时间 = 当前显示时间 - 已流逝时间（按新流速）
    // 但我们直接设置基准时间为当前显示时间，起始时刻为现在
    const timeStr = String(current.hours).padStart(2, '0') + ':' +
                    String(current.minutes).padStart(2, '0') + ':' +
                    String(current.seconds).padStart(2, '0');

    window.settings.oppTime = timeStr;
    window.settings.oppTimeSetAt = now;
    window.settings.oppTimeSpeed = parseFloat(value) || 1.0;
    if (typeof window.saveData === 'function') {
        window.saveData();
    }
    if (typeof window._updateVirtualTimeDisplay === 'function') {
        window._updateVirtualTimeDisplay();
    }
}

    /**
     * 获取当前真实时间的 HH:mm:ss 字符串
     */
    function getRealTimeStr() {
        const now = new Date();
        return String(now.getHours()).padStart(2, '0') + ':' +
               String(now.getMinutes()).padStart(2, '0') + ':' +
               String(now.getSeconds()).padStart(2, '0');
    }

    // ============================================================
    // 导出到全局
    // ============================================================

    window.VirtualClock = {
        getVirtualTime: getVirtualTime,
        getVirtualTimeDisplay: getVirtualTimeDisplay,
        getSpeed: getSpeed,
        isEnabled: isVirtualTimeEnabled,
        generateRandomTime: generateRandomTime,
        generateRandomSpeed: generateRandomSpeed,
        setVirtualTime: setVirtualTime,
        syncToRealTime: syncToRealTime,
        setSpeed: setSpeed,
        getRealTimeStr: getRealTimeStr,
        CONFIG: CONFIG,
    };

    // 兼容旧命名
    window._getOppTime = getVirtualTimeDisplay;
    window._setOppTime = setVirtualTime;
    window._syncOppTime = syncToRealTime;
    window._setOppSpeed = setSpeed;
    window._getOppSpeed = getSpeed;

    console.log('[virtual-clock] 核心模块已加载');
})();
