/**
 * red-packet.js - 红包功能模块
 * 集成到同心账单项目，使用 transferData 全局状态
 */

(function () {
    'use strict';

    // ========== 工具函数 ==========

    /** 金额格式化：分 -> 元 */
    function fmt(n) {
        return (n / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    /** 生成唯一 ID */
    function genId() {
        return 'rp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    /** 获取对方昵称 */
    function getPartnerName() {
        return (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '对方';
    }

    /** 获取我的昵称 */
    function getMyName() {
        return (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
    }

    /** 红包袋 SVG 图标 */
    var RP_SVG = '<svg width="36" height="44" viewBox="0 0 20 28" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="16" height="18" rx="2"/><path d="M2 8l8 6 8-6"/><circle cx="10" cy="14" r="2.5" fill="#fff" stroke="none"/></svg>';

    // ========== 节日检测 ==========

window.getFestivals = function getFestivals() {
    var now = new Date();
    var todayMonth = now.getMonth() + 1;
    var todayDay = now.getDate();
    
    // ---- 获取农历日期（使用 lunar-javascript 库） ----
    var lunarMonth = 0;
    var lunarDay = 0;
    
    try {
        // lunar-javascript 的 API：Lunar.fromDate()
        if (typeof Lunar !== 'undefined') {
            var lunar = Lunar.fromDate(now);
            lunarMonth = lunar.getMonth();
            lunarDay = lunar.getDay();
        } else {
            console.warn('农历库未加载，无法检测农历节日');
        }
    } catch (e) {
        console.warn('农历日期计算失败:', e);
    }
    
    // ---- 农历节日列表 ----
    var lunarFestivals = [
        { month: 1, day: 1, name: '春节', messages: ['新年快乐', '万事如意', '恭喜发财', '阖家欢乐'] },
        { month: 1, day: 15, name: '元宵节', messages: ['元宵节快乐', '团团圆圆', '今天吃汤圆了吗', '好事连连'] },
        { month: 5, day: 5, name: '端午节', messages: ['端午安康', '吃粽子', '平安顺遂'] },
        { month: 7, day: 7, name: '七夕', messages: ['七夕快乐', '星河万里不如你', '鹊桥相会', '愿得一心人'] },
        { month: 8, day: 15, name: '中秋节', messages: ['中秋快乐', '吃月饼了吗', '花好月圆', '千里共婵娟'] },
        { month: 9, day: 9, name: '重阳节', messages: ['重阳安康', '登高望远', '久久相伴'] },
        { month: 12, day: 8, name: '腊八节', messages: ['腊八节快乐', '万事粥全', '温暖过冬', '平安喜乐'] },
        { month: 12, day: 23, name: '北方小年', messages: ['小年快乐', '辞旧迎新', '万事顺遂', '灶神保佑'] },
        { month: 12, day: 24, name: '南方小年', messages: ['小年快乐', '迎祥纳福', '年年有余', '平安喜乐'] }
    ];
    
    // 检查农历节日
    if (lunarMonth > 0 && lunarDay > 0) {
        for (var i = 0; i < lunarFestivals.length; i++) {
            var f = lunarFestivals[i];
            if (f.month === lunarMonth && f.day === lunarDay) {
                return [f];
            }
        }
        
        // 特殊处理：除夕（腊月最后一天）
        try {
            if (typeof Lunar !== 'undefined') {
                var lunar = Lunar.fromDate(now);
                // 获取农历月的天数
                var lunarMonthDays = lunar.getDayCount();
                // 如果是腊月（12月）且是最后一天
                if (lunarMonth === 12 && lunarDay === lunarMonthDays) {
                    return [{ month: 12, day: lunarDay, name: '除夕', messages: ['除夕快乐', '辞旧迎新', '团圆年夜饭', '新的一年万事如意'] }];
                }
            }
        } catch (e) {
            // 忽略错误
        }
    }
    
    // ---- 公历节日 ----
    var solarFestivals = [
        { month: 1, day: 1, name: '元旦', messages: ['新年快乐!', '元旦快乐', '新的一年依然爱你', '万事如意'] },
        { month: 2, day: 14, name: '情人节', messages: ['情人节快乐', '永远爱你', '你是我最珍贵的', '附赠亲吻'] },
        { month: 3, day: 8, name: '妇女节', messages: ['妇女节快乐', '世界上第一厉害的小玉节日快乐', '你特别棒'] },
        { month: 4, day: 1, name: '愚人节', messages: ['愚人节快乐', '红包是真的'] },
        { month: 5, day: 1, name: '劳动节', messages: ['劳动节快乐', '辛苦了~', '好好休息一下吧'] },
        { month: 5, day: 20, name: '520', messages: ['520快乐', '我爱你', '一生一世', '你是我心中唯一'] },
        { month: 6, day: 1, name: '儿童节', messages: ['儿童节快乐', '给夏以昼永远的宝贝小朋友'] },
        { month: 10, day: 1, name: '国庆节', messages: ['国庆快乐', '假期愉快'] },
        { month: 10, day: 31, name: '万圣节', messages: ['万圣节快乐', 'Trick or Treat!', '不给糖就捣蛋'] },
        { month: 11, day: 11, name: '双十一', messages: ['哥哥的卡', '清空购物车'] },
        { month: 12, day: 24, name: '平安夜', messages: ['平安夜快乐', '平平安安', '苹果'] },
        { month: 12, day: 25, name: '圣诞节', messages: ['圣诞快乐', 'Merry Christmas!'] },
        { month: 12, day: 31, name: '跨年', messages: ['跨年快乐', '爱你', '辞旧迎新'] }
    ];
    
    for (var i = 0; i < solarFestivals.length; i++) {
        var f = solarFestivals[i];
        if (f.month === todayMonth && f.day === todayDay) {
            return [f];
        }
    }
    
    return [];
}
    
    // ========== 初始化余额数据 ==========

    window.initTransferData = function () {
    if (typeof window.transferData === 'undefined' || window.transferData === null) {
        window.transferData = { myBalance: 100000, systemBalance: 100000, records: [] };
    }
    if (!window.transferData.records) window.transferData.records = [];
    if (typeof window.transferData.myBalance !== 'number') window.transferData.myBalance = 100000;
    if (typeof window.transferData.systemBalance !== 'number') window.transferData.systemBalance = 100000;
};

    // ========== 红包主菜单弹窗（发红包 / 查看余额）==========

    window.showRedPacketSendModal = function () {
        window.initTransferData();

        var overlay = document.createElement('div');
       overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;';
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

        overlay.innerHTML =
          '<div style="width:100%;max-width:420px;background:var(--primary-bg,#fff);border-radius:20px;padding:0;animation:slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1);">' +
                '<div style="width:36px;height:4px;border-radius:2px;background:var(--border-color,#e8e8e8);margin:10px auto 0;"></div>' +
                '<div style="padding:20px 20px 16px;font-size:17px;font-weight:600;text-align:center;color:var(--text-primary,#1a1a1a);">红包</div>' +
                '<div style="padding:0 20px 24px;display:flex;gap:16px;">' +
                    // 发红包按钮
                    '<button id="rp-menu-send" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px;border:1.5px solid var(--border-color,#e8e8e8);border-radius:16px;background:var(--secondary-bg,#f5f5f5);cursor:pointer;transition:all 0.2s;">' +
                        '<div style="width:48px;height:48px;border-radius:50%;background:#c4453c;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;">' +
                            '<svg width="24" height="28" viewBox="0 0 20 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="16" height="18" rx="2"/><path d="M2 8l8 6 8-6"/><circle cx="10" cy="14" r="2" fill="currentColor" stroke="none"/></svg>' +
                        '</div>' +
                        '<span style="font-size:14px;font-weight:500;color:var(--text-primary,#1a1a1a);">发红包</span>' +
                    '</button>' +
                    // 查看余额按钮
                    '<button id="rp-menu-balance" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px;border:1.5px solid var(--border-color,#e8e8e8);border-radius:16px;background:var(--secondary-bg,#f5f5f5);cursor:pointer;transition:all 0.2s;">' +
                        '<div style="width:48px;height:48px;border-radius:50%;background:var(--accent-color,#b8a9c9);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;">' +
                            '<i class="fas fa-wallet"></i>' +
                        '</div>' +
                        '<span style="font-size:14px;font-weight:500;color:var(--text-primary,#1a1a1a);">查看余额</span>' +
                    '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        // 发红包
        overlay.querySelector('#rp-menu-send').onclick = function () {
            overlay.remove();
            showRedPacketSendForm();
        };

        // 查看余额
        overlay.querySelector('#rp-menu-balance').onclick = function () {
            overlay.remove();
            showTransferBalanceSettings();
        };
    };

    // ========== 发红包表单弹窗 ==========

    function showRedPacketSendForm() {
        window.initTransferData();

        var festivals = getFestivals();
        var isFestival = festivals.length > 0;
        var festival = isFestival ? festivals[0] : null;

        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:flex-end;justify-content:center;animation:fadeIn 0.2s;';
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

        var quickMsgs = isFestival
            ? festival.messages
            : ['恭喜发财', '奖励', '大吉大利', '财神哥哥驾到', '哥哥的卡随便刷', '买杯奶茶'];

        var defaultMsg = isFestival ? festival.messages[0] : '';

        overlay.innerHTML =
            '<div style="width:100%;max-width:420px;background:var(--primary-bg,#fff);border-radius:20px 20px 0 0;padding:0;animation:slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1);max-height:85vh;overflow-y:auto;">' +
                '<div style="width:36px;height:4px;border-radius:2px;background:var(--border-color,#e8e8e8);margin:10px auto 0;"></div>' +
                '<div style="padding:16px 20px 12px;font-size:17px;font-weight:600;text-align:center;color:var(--text-primary,#1a1a1a);">' +
    (isFestival
        ? '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:10px;border:1px solid var(--accent-color);color:var(--accent-color);font-size:11px;font-weight:500;">' + festival.name + '</span>'
        : '发红包') +
'</div>' +
                '<div style="padding:0 20px 24px;">' +
                    // 金额输入区
                    '<div style="text-align:center;padding:20px 0 24px;">' +
                        '<div style="display:flex;align-items:baseline;justify-content:center;gap:2px;">' +
                            '<span style="font-size:28px;font-weight:500;color:var(--text-primary,#1a1a1a);">&yen;</span>' +
                            '<input type="number" placeholder="0.00" step="0.01" min="0.01" id="rp-send-amount" style="width:180px;font-size:42px;font-weight:700;border:none;outline:none;text-align:center;background:none;color:var(--text-primary,#1a1a1a);border-bottom:2px solid var(--border-color,#e8e8e8);padding-bottom:4px;transition:border-color 0.2s;" />' +
                        '</div>' +
                        '<div style="margin-top:10px;font-size:12px;color:var(--text-secondary,#888);">余额: &yen;' + fmt(window.transferData.myBalance) + '</div>' +
                    '</div>' +
                    // 留言输入
                    '<input type="text" placeholder="添加留言..." id="rp-send-message" maxlength="50" value="' + defaultMsg + '" style="width:100%;height:40px;border:1.5px solid var(--border-color,#e8e8e8);border-radius:10px;padding:0 14px;font-size:14px;outline:none;background:var(--secondary-bg,#f5f5f5);color:var(--text-primary,#1a1a1a);transition:border-color 0.2s;box-sizing:border-box;" />' +
                    // 快捷留言
                    '<div id="rp-quick-msgs" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">' +
                        quickMsgs.map(function (m, i) {
                            return '<span data-msg="' + m + '" style="padding:6px 14px;border-radius:16px;border:1px solid var(--border-color,#e8e8e8);background:var(--secondary-bg,#f5f5f5);font-size:12px;color:var(--text-secondary,#888);cursor:pointer;transition:all 0.15s;' + (i === 0 ? 'border-color:var(--accent-color,#b8a9c9);background:rgba(184,169,201,0.08);color:var(--accent-dark,#9b8ab5);' : '') + '">' + m + '</span>';
                        }).join('') +
                    '</div>' +
                    // 发送按钮
                    '<button id="rp-send-btn" disabled style="width:100%;height:48px;border:none;border-radius:12px;background:#c4453c;color:#fff;font-size:16px;font-weight:600;cursor:pointer;margin-top:24px;transition:opacity 0.15s;opacity:0.4;">发送红包</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        var amountInput = overlay.querySelector('#rp-send-amount');
        var msgInput = overlay.querySelector('#rp-send-message');
        var submitBtn = overlay.querySelector('#rp-send-btn');

        // 快捷留言点击
        overlay.querySelectorAll('#rp-quick-msgs span').forEach(function (btn) {
            btn.onclick = function () {
                overlay.querySelectorAll('#rp-quick-msgs span').forEach(function (b) {
                    b.style.borderColor = 'var(--border-color,#e8e8e8)';
                    b.style.background = 'var(--secondary-bg,#f5f5f5)';
                    b.style.color = 'var(--text-secondary,#888)';
                });
                btn.style.borderColor = 'var(--accent-color,#b8a9c9)';
                btn.style.background = 'rgba(184,169,201,0.08)';
                btn.style.color = 'var(--accent-dark,#9b8ab5)';
                msgInput.value = btn.dataset.msg;
            };
        });

        // 金额输入校验
        amountInput.oninput = function () {
            var val = parseFloat(amountInput.value);
            var valid = val && val > 0 && val * 100 <= window.transferData.myBalance;
            submitBtn.disabled = !valid;
            submitBtn.style.opacity = valid ? '1' : '0.4';
        };

        // 聚焦金额输入框
        setTimeout(function () { amountInput.focus(); }, 100);

        // 发送
        submitBtn.onclick = function () {
            var amount = Math.round(parseFloat(amountInput.value) * 100);
            if (!amount || amount <= 0) return;
            if (amount > window.transferData.myBalance) {
                if (typeof window.showNotification === 'function') window.showNotification('余额不足', 'warning');
                return;
            }

            var message = msgInput.value.trim() || '恭喜发财';

            // 扣除余额
            window.transferData.myBalance -= amount;

            // 创建记录
            var record = {
                id: genId(),
                from: 'me',
                to: 'system',
                amount: amount,
                message: message,
                status: 'pending',
                createdAt: Date.now()
            };
            window.transferData.records.push(record);

            // 保存
            if (typeof window.throttledSaveData === 'function') window.throttledSaveData();

            // 添加红包消息到聊天
            if (typeof addMessage === 'function') {
                addMessage({
                    id: record.id,
                    sender: 'user',
                    text: message,
                    timestamp: new Date(),
                    status: 'sent',
                    type: 'red-packet',
                    redPacket: record
                });
            }

            // 播放声音
            if (typeof window.playSound === 'function') window.playSound('send');

            // 通知
            if (typeof window.showNotification === 'function') window.showNotification('红包已发送', 'success');

            overlay.remove();

            // 系统自动处理用户发出的红包
            // 获取回复延迟设置范围
            var delayMin = (typeof settings !== 'undefined' && settings.replyDelayMin) ? settings.replyDelayMin : 3000;
            var delayMax = (typeof settings !== 'undefined' && settings.replyDelayMax) ? settings.replyDelayMax : 7000;
            var sysDelay = delayMin + Math.random() * (delayMax - delayMin);

            setTimeout(function () {
                window.initTransferData();
                var rpRecord = window.transferData.records.find(function (r) { return r.id === record.id; });
                if (!rpRecord || rpRecord.status !== 'pending') return;

                // 独立判定退回：20%概率退回
                if (Math.random() < 0.2) {
                    rpRecord.status = 'returned';
                    rpRecord.returnedAt = Date.now();
                    window.transferData.myBalance += rpRecord.amount;

                    if (typeof window.throttledSaveData === 'function') window.throttledSaveData();

                    setTimeout(function () {
                        if (typeof addMessage === 'function') {
                            addMessage({
                                id: 'rp_sys_ret_' + Date.now(),
                                sender: 'system',
                                text: '红包已被退回',
                                timestamp: new Date(),
                                status: 'sent',
                                type: 'system'
                            });
                        }
                        if (typeof renderMessages === 'function') renderMessages();
                        if (typeof window.playSound === 'function') window.playSound('message');
                    }, delayMin + Math.random() * (delayMax - delayMin));
                    return;
                }

                // 剩余80%：70%立即收取，10%后续随机收取
                if (Math.random() < 0.7 / 0.8) {
                    // 70%：立即收取
                    rpRecord.status = 'received';
                    rpRecord.receivedAt = Date.now();
                    window.transferData.systemBalance += rpRecord.amount;

                    if (typeof window.throttledSaveData === 'function') window.throttledSaveData();

                    setTimeout(function () {
    // 发送「对方领取了你的红包」文字消息
    if (typeof addMessage === 'function') {
        addMessage({
            id: 'rp_recv_text_' + Date.now(),
            sender: 'system',
            text: getPartnerName() + ' 领取了你的红包',
            timestamp: new Date(),
            status: 'sent',
            type: 'system'
        });
    }
    if (typeof renderMessages === 'function') renderMessages();
    if (typeof window.playSound === 'function') window.playSound('message');
}, delayMin + Math.random() * (delayMax - delayMin));
                }
                // 10%：保持 pending，后续聊天中随机收取（由 tryCollectPendingRedPacket 处理）
            }, sysDelay);
        };
    };

    // ========== 领取红包弹窗 ==========

    window.showRedPacketReceiveModal = function (recordId) {
        window.initTransferData();

        var record = null;
        if (window.transferData.records) {
            record = window.transferData.records.find(function (r) { return r.id === recordId; });
        }
        if (!record) {
            if (typeof window.showNotification === 'function') window.showNotification('红包不存在', 'warning');
            return;
        }

        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;';
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

        var isPending = record.status === 'pending';
        var isReceived = record.status === 'received';
        var isReturned = record.status === 'returned';
        var isOpened = !isPending;

        // 自己发的红包不能领取
        var isSentByMe = record.from === 'me';
        if (isSentByMe && isPending) {
            if (typeof window.showNotification === 'function') window.showNotification('自己发的红包无法领取', 'info');
            return;
        }

        var senderName = record.from === 'me' ? getMyName() : getPartnerName();

                // ===== preview45B() 配色：拉丝银葱 + 暖金色中和 =====
        var decorLine = isPending ? '#ffd700' : '#C4A882';
        
        var panelBg = isPending
            ? 'background:#c4453c;'  // 待领取：红色喜庆
            : 'background: ' +
              'radial-gradient(ellipse at 20% 15%, rgba(245,225,180,0.06) 0%, transparent 50%), ' +
              'radial-gradient(ellipse at 80% 85%, rgba(200,180,150,0.04) 0%, transparent 45%), ' +
              'repeating-linear-gradient(15deg, ' +
                'transparent 0px, ' +
                'transparent 2px, ' +
                'rgba(190,195,210,0.04) 2px, ' +
                'rgba(190,195,210,0.04) 2.5px, ' +
                'transparent 2.5px, ' +
                'transparent 4px, ' +
                'rgba(220,225,240,0.08) 4px, ' +
                'rgba(220,225,240,0.08) 4.5px, ' +
                'transparent 4.5px, ' +
                'transparent 6px' +
              '), ' +
              'radial-gradient(ellipse at 30% 20%, rgba(245,215,142,0.04) 0%, transparent 60%), ' +
              'linear-gradient(180deg, #FDFBF7 0%, #F5F0EB 100%);';

        var btnBg = isPending
            ? 'background:#ffd700;color:#c4453c;box-shadow:0 2px 10px rgba(255,215,0,0.5);cursor:pointer;'
            : 'background:#d5cdcd;color:#888;box-shadow:none;cursor:default;';

        var btnText = isPending ? '開' : (isReceived ? '已领取' : '已退回');
        var titleColor = isPending ? 'color:#ffd700;' : 'color:#7A5C1A;';  // 已领取/已退回用深棕色，与米色背景和谐
        var titleText = isReturned ? '已过期' : record.message;

        // 判断是否为系统发出的红包（我方领取），添加退回按钮
        var isSystemSender = record.from === 'system';
        var returnBtnHtml = (isPending && isSystemSender)
            ? '<button id="rp-return-btn" style="width:100%;max-width:200px;padding:10px 16px;border:none;border-radius:10px;background:linear-gradient(135deg,#ff6b35,#f7931e);color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-top:12px;transition:all 0.25s cubic-bezier(0.4,0,0.2,1);box-shadow:0 2px 8px rgba(255,107,53,0.35);">退回红包</button>'
            : '';

        var html =
            '<div id="rp-receive-panel" style="text-align:center;position:relative;overflow:hidden;border-radius:16px;width:260px;min-height:380px;' + panelBg + 'display:flex;flex-direction:column;">' +
                // 顶部金色装饰线
                '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,' + decorLine + ' 20%,' + decorLine + ' 80%,transparent);"></div>' +
                // 发送者区域
                '<div style="padding:30px 16px 20px;display:flex;flex-direction:column;align-items:center;flex:1;justify-content:center;">' +
                    '<div style="width:48px;height:48px;border-radius:50%;background:var(--accent-color,#b8a9c9);border:2px solid rgba(255,215,0,0.5);margin-bottom:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;">' +
                        (record.from === 'me' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-heart"></i>') +
                    '</div>' +
                    '<div style="font-size:13px;color:' + (isPending ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.5)') + ';margin-bottom:6px;">' + senderName + ' 发来的红包</div>' +
                    '<div style="font-size:18px;font-weight:700;' + titleColor + '">' + titleText + '</div>' +
                '</div>' +
                // 底部按钮区域
                '<div style="padding:30px 20px 40px;display:flex;flex-direction:column;align-items:center;justify-content:center;' + (isPending ? 'background:#c4453c;' : 'background:rgba(255,255,255,0.15);') + '">' +
                    '<button id="rp-open-btn" style="width:60px;height:60px;border-radius:50%;' + btnBg + 'font-size:22px;font-weight:700;border:none;transition:all 0.15s;">' + btnText + '</button>' +
                    returnBtnHtml +
                '</div>' +
            '</div>';

        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        // 绑定退回按钮事件（领取前）
        if (isPending && isSystemSender) {
            var returnBtn = overlay.querySelector('#rp-return-btn');
            if (returnBtn) {
                returnBtn.onmouseenter = function () { this.style.filter = 'brightness(1.1)'; this.style.transform = 'translateY(-1px)'; this.style.boxShadow = '0 4px 16px rgba(255,107,53,0.5)'; };
                returnBtn.onmouseleave = function () { this.style.filter = 'none'; this.style.transform = 'translateY(0)'; this.style.boxShadow = '0 2px 8px rgba(255,107,53,0.35)'; };
                returnBtn.onclick = function () {
                    // 退回红包：金额退回系统，不更新用户余额
                    window.transferData.systemBalance += record.amount;
                    record.status = 'returned';
                    record.returnedAt = Date.now();

                    if (typeof window.throttledSaveData === 'function') window.throttledSaveData();

                    // 更新弹窗为已退回状态
                    var panel = overlay.querySelector('#rp-receive-panel');
                    panel.style.background = 'background: ' +
    'radial-gradient(ellipse at 20% 15%, rgba(245,225,180,0.06) 0%, transparent 50%), ' +
    'radial-gradient(ellipse at 80% 85%, rgba(200,180,150,0.04) 0%, transparent 45%), ' +
    'repeating-linear-gradient(15deg, ' +
        'transparent 0px, ' +
        'transparent 2px, ' +
        'rgba(190,195,210,0.04) 2px, ' +
        'rgba(190,195,210,0.04) 2.5px, ' +
        'transparent 2.5px, ' +
        'transparent 4px, ' +
        'rgba(220,225,240,0.08) 4px, ' +
        'rgba(220,225,240,0.08) 4.5px, ' +
        'transparent 4.5px, ' +
        'transparent 6px' +
    '), ' +
    'radial-gradient(ellipse at 30% 20%, rgba(245,215,142,0.04) 0%, transparent 60%), ' +
    'linear-gradient(180deg, #FDFBF7 0%, #F5F0EB 100%);';

panel.innerHTML =
    '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#C4A882 20%,#C4A882 80%,transparent);"></div>' +
    '<div style="padding:30px 16px 20px;display:flex;flex-direction:column;align-items:center;flex:1;justify-content:center;">' +
        '<div style="width:48px;height:48px;border-radius:50%;background:#d5cdcd;border:2px solid rgba(0,0,0,0.06);margin-bottom:10px;display:flex;align-items:center;justify-content:center;color:#888;font-size:20px;">' +
            '<i class="fas fa-undo"></i>' +
        '</div>' +
        '<div style="font-size:13px;color:rgba(0,0,0,0.5);margin-bottom:6px;">' + senderName + ' 发来的红包</div>' +
        '<div style="font-size:18px;font-weight:700;color:#7A5C1A;">已退回</div>' +
        '<div style="font-size:28px;font-weight:700;color:#7A5C1A;margin-top:8px;">&yen;' + fmt(record.amount) + '</div>' +
    '</div>' +
    '<div style="padding:20px 20px 30px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.15);">' +
        '<button style="width:60px;height:60px;border-radius:50%;background:#d5cdcd;color:#888;font-size:22px;font-weight:700;border:none;box-shadow:none;cursor:default;">已退回</button>' +
    '</div>';

                    if (typeof window.showNotification === 'function') window.showNotification('红包已退回', 'info');

                    // 发送「红包已被退回」文字消息
if (typeof addMessage === 'function') {
    addMessage({
        id: 'rp_returned_' + Date.now(),
        sender: 'system',
        text: '红包已被退回',
        timestamp: new Date(),
        status: 'sent',
        type: 'system'
    });
}

                    if (typeof renderMessages === 'function') renderMessages();
                };
            }
        }

        // 点击開按钮
        var openBtn = overlay.querySelector('#rp-open-btn');
        if (openBtn && isPending) {
            openBtn.onmouseenter = function () { this.style.transform = 'scale(1.1)'; this.style.boxShadow = '0 4px 16px rgba(255,215,0,0.6)'; };
            openBtn.onmouseleave = function () { this.style.transform = 'scale(1)'; this.style.boxShadow = '0 2px 10px rgba(255,215,0,0.5)'; };
            openBtn.onmousedown = function () { this.style.transform = 'scale(0.95)'; };
            openBtn.onmouseup = function () { this.style.transform = 'scale(1.1)'; };

            openBtn.onclick = function () {
                // 用户领取系统发出的红包时，永远不退回
                // 系统领取用户发出的红包时，20%概率退回（在自动处理路径中已实现）

                // 正常领取：更新余额
                if (record.from === 'system') {
                    window.transferData.myBalance += record.amount;
                    window.transferData.systemBalance -= record.amount;
                }
                // 更新记录状态
                record.status = 'received';
                record.receivedAt = Date.now();

                // 保存
                if (typeof window.throttledSaveData === 'function') window.throttledSaveData();

                                                // 更新弹窗为已领取状态（preview45B 拉丝银葱风格）
                var panel = overlay.querySelector('#rp-receive-panel');
                panel.style.background = 'radial-gradient(ellipse at 20% 15%, rgba(245,225,180,0.06) 0%, transparent 50%), radial-gradient(ellipse at 80% 85%, rgba(200,180,150,0.04) 0%, transparent 45%), repeating-linear-gradient(15deg, transparent 0px, transparent 2px, rgba(190,195,210,0.04) 2px, rgba(190,195,210,0.04) 2.5px, transparent 2.5px, transparent 4px, rgba(220,225,240,0.08) 4px, rgba(220,225,240,0.08) 4.5px, transparent 4.5px, transparent 6px), radial-gradient(ellipse at 30% 20%, rgba(245,215,142,0.04) 0%, transparent 60%), linear-gradient(180deg, #FDFBF7 0%, #F5F0EB 100%)';

                panel.innerHTML =
                    '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#C4A882 20%,#C4A882 80%,transparent);"></div>' +
                    '<div style="padding:30px 16px 20px;display:flex;flex-direction:column;align-items:center;flex:1;justify-content:center;">' +
                        '<div style="width:48px;height:48px;border-radius:50%;background:#d5cdcd;border:2px solid rgba(0,0,0,0.06);margin-bottom:10px;display:flex;align-items:center;justify-content:center;color:#888;font-size:20px;">' +
                            '<i class="fas fa-check-circle"></i>' +
                        '</div>' +
                        '<div style="font-size:13px;color:rgba(0,0,0,0.5);margin-bottom:6px;">' + senderName + ' 发来的红包</div>' +
                        '<div style="font-size:18px;font-weight:700;color:#7A5C1A;">' + record.message + '</div>' +
                        '<div style="font-size:28px;font-weight:700;color:#7A5C1A;margin-top:8px;">&yen;' + fmt(record.amount) + '</div>' +
                    '</div>' +
                    '<div style="padding:20px 20px 30px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.15);">' +
                        '<button style="width:60px;height:60px;border-radius:50%;background:#d5cdcd;color:#888;font-size:22px;font-weight:700;border:none;box-shadow:none;cursor:default;">已领取</button>' +
                    '</div>';
                
                // 播放声音
                if (typeof window.playSound === 'function') window.playSound('message');

                // 通知
                if (typeof window.showNotification === 'function') window.showNotification('红包已领取 &yen;' + fmt(record.amount), 'success');

                // 发送「你领取了对方的红包」文字消息
if (typeof addMessage === 'function') {
    addMessage({
        id: 'rp_recv_text_' + Date.now(),
        sender: 'system',
        text: '你领取了 ' + getPartnerName() + ' 的红包',
        timestamp: new Date(),
        status: 'sent',
        type: 'system'
    });
}

                // 刷新聊天消息列表（触发重新渲染以更新卡片状态）
                if (typeof renderMessages === 'function') renderMessages();
            };
        }
    };

    // ========== 系统随机发红包 ==========

    // 特殊金额池（单位：元，转分时 * 100）
    var SPECIAL_AMOUNTS = [5.2, 52, 520, 5200, 13.14, 1314];

    // 单日发送计数器
    var _lastRPSendDate = '';
    var _rpSendCountToday = 0;

    window.trySystemRedPacket = function () {
        window.initTransferData();

        // 单日上限检查（5次）
        var today = new Date().toISOString().slice(0, 10);
        if (today !== _lastRPSendDate) {
            _lastRPSendDate = today;
            _rpSendCountToday = 0;
        }
        if (_rpSendCountToday >= 5) return false;

        var festivals = getFestivals();
        var isFestival = festivals.length > 0;
        var festival = isFestival ? festivals[0] : null;

        // 触发概率：平日 5%，节日 80%
        var chance = isFestival ? 0.8 : 0.05;
        if (Math.random() > chance) return false;

        // 决定金额：节日90% / 平日40% 使用特殊金额
        var useSpecial = Math.random() < (isFestival ? 0.9 : 0.4);
        var amount;
        if (useSpecial) {
            var specialYuan = SPECIAL_AMOUNTS[Math.floor(Math.random() * SPECIAL_AMOUNTS.length)];
            amount = Math.round(specialYuan * 100); // 转为分
        } else {
            // 80%在0-200元内随机，20%在0-余额内随机
            var maxBalance = Math.floor(window.transferData.systemBalance / 100); // 余额（元）
            if (maxBalance <= 0) return false;
            if (Math.random() < 0.8) {
                var max200 = Math.min(200, maxBalance);
                amount = Math.floor(Math.random() * (max200 * 100)) + 1; // 0.01~200元
            } else {
                amount = Math.floor(Math.random() * window.transferData.systemBalance) + 1;
            }
        }

        // 检查系统余额
        if (window.transferData.systemBalance < amount) return false;

        // 扣除系统余额
        window.transferData.systemBalance -= amount;

        // 留言
        var message;
        if (isFestival && festival) {
            var msgs = festival.messages;
            message = msgs[Math.floor(Math.random() * msgs.length)];
        } else {
            var normalMsgs = ['给你一个小红包~', '惊喜红包', '好运红包', '开心一下~', '一点心意'];
            message = normalMsgs[Math.floor(Math.random() * normalMsgs.length)];
        }

        // 创建记录
        var record = {
            id: genId(),
            from: 'system',
            to: 'me',
            amount: amount,
            message: message,
            status: 'pending',
            createdAt: Date.now()
        };
        window.transferData.records.push(record);

        // 计数
        _rpSendCountToday++;

        // 保存
        if (typeof window.throttledSaveData === 'function') window.throttledSaveData();

        // 添加红包消息到聊天
        if (typeof addMessage === 'function') {
            addMessage({
                id: record.id,
                sender: 'partner',
                text: message,
                timestamp: new Date(),
                status: 'sent',
                type: 'red-packet',
                redPacket: record
            });
        }

        // 播放声音
        if (typeof window.playSound === 'function') window.playSound('message');

        // 通知
        if (typeof window.showNotification === 'function') {
            var notifyMsg = isFestival
                ? festival.name + '红包来啦! &yen;' + fmt(amount)
                : '收到一个红包 &yen;' + fmt(amount);
            window.showNotification(notifyMsg, 'success');
        }

        return true;
    };

    // ========== 后续随机领取待领取红包 ==========

    window.tryCollectPendingRedPacket = function () {
        window.initTransferData();
        if (!window.transferData.records) return;

        var pending = window.transferData.records.filter(function (r) {
            return r.status === 'pending' && r.from === 'me';
        });
        if (pending.length === 0) return;

        // 每次有 8% 概率随机收取一个 pending 红包
        if (Math.random() > 0.08) return;

        var target = pending[Math.floor(Math.random() * pending.length)];

        // 先检查是否已超过24小时（由过期检查处理）
        if (Date.now() - target.createdAt > 24 * 3600 * 1000) return;

        // 系统收取
        target.status = 'received';
        target.receivedAt = Date.now();
        window.transferData.systemBalance += target.amount;

        if (typeof window.throttledSaveData === 'function') window.throttledSaveData();

        // 收取方发送已领取样式的红包卡片
        if (typeof addMessage === 'function') {
            addMessage({
                id: 'rp_recv_card_' + Date.now(),
                sender: 'partner',
                text: target.message || '恭喜发财',
                timestamp: new Date(),
                status: 'received',
                type: 'red-packet',
                redPacket: target
            });
        }
        if (typeof renderMessages === 'function') renderMessages();
        if (typeof window.playSound === 'function') window.playSound('message');
    };

    // ========== 24小时过期自动退回 ==========

    window.checkRedPacketExpiry = function () {
        window.initTransferData();
        if (!window.transferData.records) return;

        var now = Date.now();
        var expired = window.transferData.records.filter(function (r) {
            return r.status === 'pending' && (now - r.createdAt) > 24 * 3600 * 1000;
        });

        expired.forEach(function (r) {
            r.status = 'returned';
            r.returnedAt = now;
            // 退回发送方余额
            if (r.from === 'me') {
                window.transferData.myBalance += r.amount;
            } else if (r.from === 'system') {
                window.transferData.systemBalance += r.amount;
            }
        });

        if (expired.length > 0) {
            if (typeof window.throttledSaveData === 'function') window.throttledSaveData();

            // 发送过期提示
            if (typeof addMessage === 'function') {
                addMessage({
                    id: 'rp_expired_' + Date.now(),
                    sender: 'system',
                    text: expired.length > 1
                        ? expired.length + '个红包已超过24小时未领取，已自动退回'
                        : '一个红包已超过24小时未领取，已自动退回',
                    timestamp: new Date(),
                    status: 'sent',
                    type: 'system'
                });
            }
            if (typeof renderMessages === 'function') renderMessages();
        }
    };

    // ========== 余额设置弹窗 ==========

    window.showTransferBalanceSettings = function () {
    window.initTransferData();

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s;';
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML =
        '<div style="width:min(360px,88vw);background:var(--primary-bg,#fff);border-radius:20px;padding:0;animation:popIn 0.25s cubic-bezier(0.34,1.56,0.64,1);box-shadow:0 20px 60px rgba(0,0,0,0.28);border:1px solid var(--border-color,#e8e8e8);">' +
            '<div style="width:36px;height:4px;border-radius:2px;background:var(--border-color,#e8e8e8);margin:10px auto 0;"></div>' +
            '<div style="padding:16px 20px 12px;font-size:17px;font-weight:600;text-align:center;color:var(--text-primary,#1a1a1a);">余额设置</div>' +
            '<div style="padding:0 20px 24px;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:0.5px solid var(--border-color,#e8e8e8);">' +
                    '<div style="font-size:14px;color:var(--text-primary,#1a1a1a);"><span>我的余额</span><small style="display:block;font-size:11px;color:var(--text-secondary,#888);margin-top:2px;">当前会话</small></div>' +
                    '<input type="number" id="rp-bal-my" value="' + (window.transferData.myBalance / 100).toFixed(2) + '" style="width:120px;height:36px;border:1.5px solid var(--border-color,#e8e8e8);border-radius:8px;padding:0 10px;font-size:15px;text-align:right;outline:none;font-weight:600;background:var(--secondary-bg,#f5f5f5);color:var(--text-primary,#1a1a1a);box-sizing:border-box;" />' +
                '</div>' +
                '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;">' +
                    '<div style="font-size:14px;color:var(--text-primary,#1a1a1a);"><span>对方余额</span><small style="display:block;font-size:11px;color:var(--text-secondary,#888);margin-top:2px;">当前会话</small></div>' +
                    '<input type="number" id="rp-bal-sys" value="' + (window.transferData.systemBalance / 100).toFixed(2) + '" style="width:120px;height:36px;border:1.5px solid var(--border-color,#e8e8e8);border-radius:8px;padding:0 10px;font-size:15px;text-align:right;outline:none;font-weight:600;background:var(--secondary-bg,#f5f5f5);color:var(--text-primary,#1a1a1a);box-sizing:border-box;" />' +
                '</div>' +
                '<button id="rp-bal-save" style="width:100%;height:48px;border:none;border-radius:12px;background:var(--accent-color,#b8a9c9);color:#fff;font-size:16px;font-weight:600;cursor:pointer;margin-top:16px;transition:opacity 0.15s;">保存</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    overlay.querySelector('#rp-bal-save').onclick = function () {
        window.transferData.myBalance = Math.round((parseFloat(overlay.querySelector('#rp-bal-my').value) || 0) * 100);
        window.transferData.systemBalance = Math.round((parseFloat(overlay.querySelector('#rp-bal-sys').value) || 0) * 100);
        if (typeof window.throttledSaveData === 'function') window.throttledSaveData();
        if (typeof window.showNotification === 'function') window.showNotification('余额已保存', 'success');
        overlay.remove();
    };
};
    // ========== 渲染红包消息卡片 ==========

    window.renderRedPacketMessage = function (msg) {
    var rp = msg.redPacket || {};
    var recordId = rp.id || msg.id;
    var amount = rp.amount || 0;
    var message = rp.message || msg.text || '恭喜发财';
    var status = rp.status || 'pending';
    var isSentByMe = (msg.sender === 'user');
    var isOpened = status !== 'pending';

    // 从全局 transferData 获取最新状态
    if (typeof window.transferData !== 'undefined' && window.transferData && window.transferData.records) {
        var latestRecord = window.transferData.records.find(function (r) { return r.id === recordId; });
        if (latestRecord) {
            status = latestRecord.status;
            amount = latestRecord.amount;
            message = latestRecord.message || message;
            isOpened = status !== 'pending';
        }
    }

    var timeStr = '';
    if (msg.timestamp) {
        var ts = new Date(msg.timestamp);
        var now = new Date();
        var diff = now - ts;
        if (diff < 60000) {
            timeStr = '刚刚';
        } else if (diff < 3600000) {
            timeStr = Math.floor(diff / 60000) + '分钟前';
        } else if (diff < 86400000) {
            timeStr = ts.getHours().toString().padStart(2, '0') + ':' + ts.getMinutes().toString().padStart(2, '0');
        } else {
            timeStr = (ts.getMonth() + 1) + '/' + ts.getDate();
        }
    }

    // ===== 状态文字样式 =====
    var statusHtml = '';
   // ===== 状态文字样式（已领取绿色，已退回灰色）=====
if (status === 'pending') {
    statusHtml = '<span style="display:flex;align-items:center;gap:3px;font-weight:500;color:#c4453c;font-size:10px;"><i class="fas fa-clock" style="font-size:9px;"></i> ' + (isSentByMe ? '对方待领取' : '待领取') + '</span>';
} else if (status === 'received') {
    statusHtml = '<span style="display:flex;align-items:center;gap:4px;font-weight:600;color:#2d7d46;font-size:10px;background:rgba(45,125,70,0.10);padding:2px 10px;border-radius:12px;"><i class="fas fa-check-circle" style="font-size:9px;color:#2d7d46;"></i> 已领取</span>';
} else {
    // 已退回：统一灰色（与卡片风格一致）
    statusHtml = '<span style="display:flex;align-items:center;gap:4px;font-weight:500;color:#999;font-size:10px;background:rgba(153,153,153,0.10);padding:2px 10px;border-radius:12px;"><i class="fas fa-undo" style="font-size:9px;color:#999;"></i> 已退回</span>';
}

    // ===== 卡片配色（灰色风格）=====
var bodyBg = '';
var svgStroke = '';
var svgCircleFill = '';
var amountColor = '';
var titleColor = '';
var msgColor = '';

if (status === 'pending') {
    // 待领取：红色喜庆
    bodyBg = 'background:linear-gradient(180deg,#D57C6F 0%,#b5655a 100%);';
    svgStroke = 'stroke="#fff"';
    svgCircleFill = 'fill="#fff"';
    amountColor = '#fff';
    titleColor = 'rgba(255,255,255,0.85)';
    msgColor = 'rgba(255,255,255,0.8)';
} else {
    // 已领取 & 已退回：微信灰色风格
    bodyBg = 'background:linear-gradient(180deg,#e8e0e0 0%,#d5cdcd 100%);';
    svgStroke = 'stroke="#aaa"';
    svgCircleFill = 'fill="#aaa"';
    amountColor = '#888';
    titleColor = 'rgba(0,0,0,0.35)';
    msgColor = 'rgba(0,0,0,0.35)';
}

    var rpSvgCustom = '<svg width="27" height="33" viewBox="0 0 20 28" fill="none" ' + svgStroke + ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="16" height="18" rx="2"/><path d="M2 8l8 6 8-6"/><circle cx="10" cy="14" r="2.5" ' + svgCircleFill + ' stroke="none"/></svg>';

    var card =
    '<div class="red-packet-card' + (isOpened ? ' opened' : '') + '" data-rp-id="' + recordId + '" style="width:195px;border-radius:8px;overflow:hidden;cursor:pointer;transition:transform 0.15s,box-shadow 0.2s;position:relative;box-shadow:0 2px 8px rgba(0,0,0,0.08);">' +
        '<div class="rp-body" style="' + bodyBg + 'padding:10px 12px 12px;color:#fff;position:relative;display:flex;align-items:center;gap:10px;">' +
            '<div class="rp-icon" style="width:33px;height:33px;flex-shrink:0;display:flex;align-items:center;justify-content:center;">' +
                rpSvgCustom +
            '</div>' +
            '<div class="rp-content" style="flex:1;min-width:0;">' +
                '<div class="rp-title" style="font-size:10px;font-weight:600;margin-bottom:1px;color:' + titleColor + ';">红包</div>' +
                '<div class="rp-amount-text" style="font-size:18px;font-weight:700;line-height:1.2;color:' + amountColor + ';">¥' + fmt(amount) + '</div>' +
                '<div class="rp-msg-text" style="font-size:9px;opacity:0.8;margin-top:1px;color:' + msgColor + ';">' + message + '</div>' +
            '</div>' +
        '</div>' +
        '<div class="rp-footer" style="background:#fff;padding:5px 12px;display:flex;align-items:center;justify-content:space-between;font-size:9px;border-top:1px solid rgba(196,69,60,0.08);min-height:28px;">' +
            statusHtml +
            '<span style="color:#bbb;font-size:9px;">' + timeStr + '</span>' +
        '</div>' +
    '</div>';

    return card;
};

    // ===== 完整修复版 =====
window.showRedPacketReceiveModal = function (recordId) {
    function fmt(n) {
        return (n / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function getPartnerName() {
        return (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '对方';
    }
    function getMyName() {
        return (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
    }

    window.initTransferData();

    var record = null;
    if (window.transferData.records) {
        record = window.transferData.records.find(function (r) { return r.id === recordId; });
    }
    if (!record) {
        if (typeof window.showNotification === 'function') window.showNotification('红包不存在', 'warning');
        return;
    }

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;';
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

    var isPending = record.status === 'pending';
    var isReceived = record.status === 'received';
    var isReturned = record.status === 'returned';

    var isSentByMe = record.from === 'me';
    if (isSentByMe && isPending) {
        if (typeof window.showNotification === 'function') window.showNotification('自己发的红包无法领取', 'info');
        return;
    }

    var senderName = record.from === 'me' ? getMyName() : getPartnerName();

    // 获取发送者头像
    // ===== 修改后 =====
var senderAvatar = '';
try {
    // 获取头像的辅助函数
    function getAvatarSrc(containerSelector) {
        var container = document.querySelector(containerSelector);
        if (!container) return '';
        
        // 1. 先找 img 标签
        var img = container.querySelector('img');
        if (img && img.src) return img.src;
        
        // 2. 再找 background-image
        var el = container.querySelector('.avatar') || container;
        var bg = el.style.backgroundImage || getComputedStyle(el).backgroundImage;
        if (bg && bg !== 'none' && bg.includes('url(')) {
            var url = bg.replace(/url\(["']?|["']?\)/g, '');
            if (url && url !== '') return url;
        }
        
        return '';
    }
    
    if (record.from === 'me') {
        senderAvatar = getAvatarSrc('#my-avatar-container');
    } else {
        // 使用正确的选择器：partner-avatar-container
        senderAvatar = getAvatarSrc('#partner-avatar-container');
    }
} catch(e) {
    console.warn('获取头像失败:', e);
}

    var avatarHtml = senderAvatar
        ? '<img src="' + senderAvatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
        : '<i class="fas fa-user" style="color:#B8A9C9;font-size:18px;"></i>';

    // ===== 拉丝银葱背景（已领取/已退回使用） =====
    var silkBg = 'background: ' +
        'radial-gradient(ellipse at 20% 15%, rgba(245,225,180,0.07) 0%, transparent 50%), ' +
'radial-gradient(ellipse at 80% 85%, rgba(200,180,150,0.05) 0%, transparent 45%), ' +
'repeating-linear-gradient(15deg, ' +
  'transparent 0px, ' +
  'transparent 2px, ' +
  'rgba(190,195,210,0.08) 2px, ' +
  'rgba(190,195,210,0.08) 2.5px, ' +
  'transparent 2.5px, ' +
  'transparent 4px, ' +
  'rgba(220,225,240,0.13) 4px, ' +
  'rgba(220,225,240,0.13) 4.5px, ' +
  'transparent 4.5px, ' +
  'transparent 6px' +
'), ' +
'radial-gradient(ellipse at 30% 20%, rgba(245,215,142,0.05) 0%, transparent 60%), ' +
        'linear-gradient(180deg, #FDFBF7 0%, #F5F0EB 100%);';

    var bottomBg = 'background: #FAF6F2; box-shadow: inset 0 6px 8px -4px rgba(0,0,0,0.04);';

    // ===== 构建已领取弹窗 =====
    function buildReceivedPanel() {
        var resultDecorLine = '#A5D6A7';
        var resultMetalBorder = 'radial-gradient(circle at 30% 30%, rgba(165,214,167,0.9) 0%, rgba(200,230,201,0.6) 50%, rgba(165,214,167,0.9) 100%)';
        var resultInnerColor = '#5D8A5E';
        var resultIcon = 'fa-check';
        var resultLabel = '已领取';

        return '<div style="text-align:center;position:relative;overflow:hidden;border-radius:16px;width:260px;min-height:380px;box-shadow:0 20px 60px rgba(0,0,0,0.15);display:flex;flex-direction:column;">' +
            '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,' + resultDecorLine + ' 20%,' + resultDecorLine + ' 80%,transparent);z-index:2;"></div>' +
            '<div style="' + silkBg + 'padding:30px 20px 16px;display:flex;flex-direction:column;align-items:center;flex:1;justify-content:center;position:relative;overflow:hidden;">' +
                '<div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
                    '<div style="width:48px;height:48px;border-radius:50%;background:#D7CCC8;margin-bottom:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:18px;color:#fff;">' +
                        avatarHtml +
                    '</div>' +
                    '<div style="font-size:13px;color:rgba(0,0,0,0.5);margin-bottom:4px;">' + senderName + ' 发来的红包</div>' +
                    '<div style="font-size:16px;color:#5D4037;font-weight:500;margin-bottom:6px;">' + record.message + '</div>' +
                    '<div style="font-size:36px;font-weight:700;color:#5D4037;">&yen;' + fmt(record.amount) + '</div>' +
                '</div>' +
            '</div>' +
            '<div style="' + bottomBg + 'padding:16px 20px 24px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:0 0 16px 16px;position:relative;">' +
                '<div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(255,255,255,0.3) 0%, transparent 50%);border-radius:0 0 16px 16px;pointer-events:none;"></div>' +
                '<div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
                    '<div style="width:56px;height:56px;border-radius:50%;background:' + resultMetalBorder + ';display:flex;align-items:center;justify-content:center;padding:3px;">' +
                        '<div style="width:100%;height:100%;border-radius:50%;background:#F5F0EB;display:flex;align-items:center;justify-content:center;">' +
                            '<div style="width:28px;height:28px;border-radius:50%;background:' + resultInnerColor + ';display:flex;align-items:center;justify-content:center;">' +
                                '<i class="fas ' + resultIcon + '" style="font-size:12px;color:#fff;"></i>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div style="font-size:14px;color:#5D4037;font-weight:500;margin-top:8px;">' + resultLabel + '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // ===== 构建已退回弹窗 =====
    function buildReturnedPanel() {
        var resultDecorLine = '#D7CCC8';
        var resultMetalBorder = 'radial-gradient(circle at 30% 30%, rgba(180,170,165,0.9) 0%, rgba(210,200,195,0.6) 50%, rgba(180,170,165,0.9) 100%)';
        var resultInnerColor = '#A69B94';
        var resultIcon = 'fa-undo';
        var resultLabel = '已退回';

        return '<div style="text-align:center;position:relative;overflow:hidden;border-radius:16px;width:260px;min-height:380px;box-shadow:0 20px 60px rgba(0,0,0,0.15);display:flex;flex-direction:column;">' +
            '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,' + resultDecorLine + ' 20%,' + resultDecorLine + ' 80%,transparent);z-index:2;"></div>' +
            '<div style="' + silkBg + 'padding:30px 20px 16px;display:flex;flex-direction:column;align-items:center;flex:1;justify-content:center;position:relative;overflow:hidden;">' +
                '<div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
                    '<div style="width:48px;height:48px;border-radius:50%;background:#D7CCC8;margin-bottom:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:18px;color:#fff;">' +
                        avatarHtml +
                    '</div>' +
                    '<div style="font-size:13px;color:rgba(0,0,0,0.5);margin-bottom:4px;">' + senderName + ' 发来的红包</div>' +
                    '<div style="font-size:16px;color:#5D4037;font-weight:500;margin-bottom:6px;">已退回</div>' +
                    '<div style="font-size:36px;font-weight:700;color:#5D4037;">&yen;' + fmt(record.amount) + '</div>' +
                '</div>' +
            '</div>' +
            '<div style="' + bottomBg + 'padding:16px 20px 24px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:0 0 16px 16px;position:relative;">' +
                '<div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(255,255,255,0.3) 0%, transparent 50%);border-radius:0 0 16px 16px;pointer-events:none;"></div>' +
                '<div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
                    '<div style="width:56px;height:56px;border-radius:50%;background:' + resultMetalBorder + ';display:flex;align-items:center;justify-content:center;padding:3px;">' +
                        '<div style="width:100%;height:100%;border-radius:50%;background:#F5F0EB;display:flex;align-items:center;justify-content:center;">' +
                            '<div style="width:28px;height:28px;border-radius:50%;background:' + resultInnerColor + ';display:flex;align-items:center;justify-content:center;">' +
                                '<i class="fas ' + resultIcon + '" style="font-size:12px;color:#fff;"></i>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div style="font-size:14px;color:#5D4037;font-weight:500;margin-top:8px;">' + resultLabel + '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // ===== 构建待领取弹窗 =====
    function buildPendingPanel() {
        var isSystemSender = record.from === 'system';
        var returnBtnHtml = (isSystemSender)
            ? '<button id="rp-return-btn" style="width:100%;max-width:200px;padding:10px 16px;border:none;border-radius:10px;background:linear-gradient(135deg,#ff6b35,#f7931e);color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-top:12px;transition:all 0.25s cubic-bezier(0.4,0,0.2,1);box-shadow:0 2px 8px rgba(255,107,53,0.35);">退回红包</button>'
            : '';

        return '<div style="text-align:center;position:relative;overflow:hidden;border-radius:16px;width:260px;min-height:380px;box-shadow:0 20px 60px rgba(0,0,0,0.15);display:flex;flex-direction:column;">' +
            '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#ffd700 20%,#ffd700 80%,transparent);z-index:2;"></div>' +
            '<div style="background:#c4453c;padding:30px 20px 16px;display:flex;flex-direction:column;align-items:center;flex:1;justify-content:center;position:relative;overflow:hidden;">' +
                '<div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
                    '<div style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.2);margin-bottom:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:18px;color:#fff;">' +
                        avatarHtml +
                    '</div>' +
                    '<div style="font-size:13px;color:rgba(255,255,255,0.9);margin-bottom:4px;">' + senderName + ' 发来的红包</div>' +
                    '<div style="font-size:16px;color:#fff;font-weight:500;margin-bottom:6px;">' + record.message + '</div>' +
                '</div>' +
            '</div>' +
            '<div style="background:#c4453c;padding:16px 20px 24px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:0 0 16px 16px;position:relative;">' +
                '<div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">' +
                    '<button id="rp-open-btn" style="width:60px;height:60px;border-radius:50%;background:#ffd700;color:#c4453c;font-size:22px;font-weight:700;border:none;cursor:pointer;box-shadow:0 2px 10px rgba(255,215,0,0.5);">開</button>' +
                    returnBtnHtml +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // 初始渲染
    if (isPending) {
        overlay.innerHTML = buildPendingPanel();
    } else if (isReceived) {
        overlay.innerHTML = buildReceivedPanel();
    } else if (isReturned) {
        overlay.innerHTML = buildReturnedPanel();
    }
    document.body.appendChild(overlay);

    // 绑定开按钮
    if (isPending) {
        var openBtn = overlay.querySelector('#rp-open-btn');
        if (openBtn) {
            openBtn.onclick = function () {
                if (record.from === 'system') {
                    window.transferData.myBalance += record.amount;
                    window.transferData.systemBalance -= record.amount;
                }
                record.status = 'received';
                record.receivedAt = Date.now();
                if (typeof window.throttledSaveData === 'function') window.throttledSaveData();

                overlay.innerHTML = buildReceivedPanel();

                if (typeof renderMessages === 'function') renderMessages();
                if (typeof window.showNotification === 'function') window.showNotification('红包已领取 &yen;' + fmt(record.amount), 'success');
            };
        }
    }

    // 绑定退回按钮
    if (isPending && record.from === 'system') {
        var returnBtn = overlay.querySelector('#rp-return-btn');
        if (returnBtn) {
            returnBtn.onclick = function () {
                window.transferData.systemBalance += record.amount;
                record.status = 'returned';
                record.returnedAt = Date.now();
                if (typeof window.throttledSaveData === 'function') window.throttledSaveData();

                overlay.innerHTML = buildReturnedPanel();

                if (typeof renderMessages === 'function') renderMessages();
                if (typeof window.showNotification === 'function') window.showNotification('红包已退回', 'info');
            };
        }
    }
};

console.log('✅ 修复版已生效！已领取/已退回弹窗使用拉丝银葱背景');

// ===== 覆盖：待领取红包弹窗 - 最终版（直接粘贴到文件末尾） =====

// 保存原函数引用
var _originalShowRedPacket = window.showRedPacketReceiveModal;

// 覆盖
window.showRedPacketReceiveModal = function (recordId) {
    function fmt(n) {
        return (n / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function getPartnerName() {
        return (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '对方';
    }
    function getMyName() {
        return (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
    }

    window.initTransferData();

    var record = null;
    if (window.transferData.records) {
        record = window.transferData.records.find(function (r) { return r.id === recordId; });
    }
    if (!record) {
        if (typeof window.showNotification === 'function') window.showNotification('红包不存在', 'warning');
        return;
    }

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

    var isPending = record.status === 'pending';
    var isReceived = record.status === 'received';
    var isReturned = record.status === 'returned';

    var isSentByMe = record.from === 'me';
    if (isSentByMe && isPending) {
        if (typeof window.showNotification === 'function') window.showNotification('自己发的红包无法领取', 'info');
        return;
    }

    var senderName = record.from === 'me' ? getMyName() : getPartnerName();

    // 获取发送者头像
    var senderAvatar = '';
    try {
        if (record.from === 'me') {
            var myImg = document.querySelector('#avatar-my img') || document.querySelector('.avatar-me img');
            if (myImg) senderAvatar = myImg.src;
        } else {
            var partnerImg = document.querySelector('#partner-avatar-container img') || 
                             document.querySelector('#avatar-partner img') || 
                             document.querySelector('.avatar-partner img');
            if (partnerImg) senderAvatar = partnerImg.src;
            if (!senderAvatar) {
                var container = document.querySelector('#partner-avatar-container');
                if (container) {
                    var avatarEl = container.querySelector('.avatar') || container;
                    var bg = avatarEl.style.backgroundImage || getComputedStyle(avatarEl).backgroundImage;
                    if (bg && bg !== 'none' && bg.includes('url(')) {
                        senderAvatar = bg.replace(/url\(["']?|["']?\)/g, '');
                    }
                }
            }
        }
    } catch(e) {}

    var avatarHtml = senderAvatar
        ? '<img src="' + senderAvatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
        : '<i class="fas fa-user" style="color:rgba(255,255,255,0.4);font-size:22px;"></i>';

    // ===== 待领取弹窗 =====
    if (isPending) {
        var isSystemSender = record.from === 'system';
        var returnBtnHtml = (isSystemSender)
            ? '<button id="rp-return-btn" style="margin-top:12px;padding:4px 14px;border:1px solid rgba(255,248,240,0.15);border-radius:14px;background:transparent;color:rgba(255,248,240,0.35);font-size:10px;cursor:pointer;transition:all 0.3s;font-family:inherit;letter-spacing:0.5px;flex-shrink:0;">退回红包</button>'
            : '';

        overlay.innerHTML = `
            <div id="rp-test-panel" style="text-align:center;position:relative;overflow:hidden;border-radius:16px;width:260px;height:380px;box-shadow:0 20px 60px rgba(0,0,0,0.25);display:flex;flex-direction:column;animation:scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1);">
                <style>
                    @keyframes scaleIn {
                        from { transform: scale(0.85); opacity: 0; }
                        to { transform: scale(1); opacity: 1; }
                    }
                </style>
                <div id="top-section" style="flex:2;background:#b13b2e;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px 20px 16px;border-radius:16px 16px 0 0;position:relative;border-bottom:0.5px solid rgba(255,248,240,0.20);">
                    <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,rgba(255,215,0,0.50) 20%,rgba(255,215,0,0.50) 80%,transparent);z-index:2;"></div>
                    <div style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.08);border:1.5px solid rgba(210,190,165,0.12);margin-bottom:12px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
                        ${avatarHtml}
                    </div>
                    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:6px;letter-spacing:0.3px;flex-shrink:0;">${senderName} 发来的红包</div>
                    <div style="font-size:16px;color:rgba(255,255,255,0.9);font-weight:500;letter-spacing:0.3px;flex-shrink:0;">${record.message}</div>
                </div>
                <div id="bottom-section" style="flex:1;background:#b13b2e;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 20px 20px;border-radius:0 0 16px 16px;">
                    <button id="rp-open-test" style="width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;background:#e8c8a0;box-shadow:0 3px 12px rgba(0,0,0,0.12), inset 0 1px 2px rgba(255,255,255,0.2);transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);display:flex;align-items:center;justify-content:center;padding:0;margin:0;flex-shrink:0;">
                        <span style="color:#614f4d;font-size:22px;font-weight:600;letter-spacing:2px;margin-top:-1px;margin-left:1.5px;user-select:none;">開</span>
                    </button>
                    ${returnBtnHtml}
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        var openBtn = overlay.querySelector('#rp-open-test');
        if (openBtn) {
            openBtn.onmouseenter = function() {
                this.style.transform = 'scale(1.05)';
                this.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15), inset 0 1px 2px rgba(255,255,255,0.25)';
            };
            openBtn.onmouseleave = function() {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = '0 3px 12px rgba(0,0,0,0.12), inset 0 1px 2px rgba(255,255,255,0.2)';
            };
            openBtn.onmousedown = function() {
                this.style.transform = 'scale(0.94)';
            };
            openBtn.onmouseup = function() {
                this.style.transform = 'scale(1.05)';
            };
            openBtn.onclick = function() {
                if (record.from === 'system') {
                    window.transferData.myBalance += record.amount;
                    window.transferData.systemBalance -= record.amount;
                }
                record.status = 'received';
                record.receivedAt = Date.now();
                if (typeof window.throttledSaveData === 'function') window.throttledSaveData();
                overlay.remove();
                if (typeof renderMessages === 'function') renderMessages();
                if (typeof window.showNotification === 'function') window.showNotification('红包已领取 ¥' + fmt(record.amount), 'success');
            };
        }

        if (isSystemSender) {
            var returnBtn = overlay.querySelector('#rp-return-btn');
            if (returnBtn) {
                returnBtn.onmouseenter = function() {
                    this.style.color = 'rgba(255,248,240,0.55)';
                    this.style.borderColor = 'rgba(255,248,240,0.25)';
                };
                returnBtn.onmouseleave = function() {
                    this.style.color = 'rgba(255,248,240,0.35)';
                    this.style.borderColor = 'rgba(255,248,240,0.15)';
                };
                returnBtn.onclick = function() {
                    window.transferData.systemBalance += record.amount;
                    record.status = 'returned';
                    record.returnedAt = Date.now();
                    if (typeof window.throttledSaveData === 'function') window.throttledSaveData();
                    overlay.remove();
                    if (typeof renderMessages === 'function') renderMessages();
                    if (typeof window.showNotification === 'function') window.showNotification('红包已退回', 'info');
                };
            }
        }

        return;
    }

    // ===== 已领取 / 已退回：调用原函数 =====
    if (typeof _originalShowRedPacket === 'function') {
        _originalShowRedPacket(recordId);
    } else {
        // 兜底：简单显示
        var statusText = isReceived ? '已领取' : '已退回';
        overlay.innerHTML = `
            <div style="text-align:center;background:#fff;padding:30px;border-radius:16px;width:260px;">
                <div style="font-size:18px;font-weight:600;margin-bottom:10px;">${statusText}</div>
                <div style="font-size:14px;color:#888;">¥${fmt(record.amount)}</div>
                <button onclick="this.closest('div[style*="position:fixed"]').remove()" style="margin-top:16px;padding:8px 24px;border:none;border-radius:8px;background:#c4453c;color:#fff;cursor:pointer;">关闭</button>
            </div>
        `;
        document.body.appendChild(overlay);
    }
};

console.log('✅ 待领取红包弹窗已更新为最终版');
    
})();
