// ========== 加号面板控制 ==========
(function() {
    var panelOverlay = document.getElementById('plus-panel-overlay');
    var plusBtn = document.getElementById('plus-btn');
    var isOpen = false;

    window.togglePlusPanel = function() {
        isOpen = !isOpen;
        panelOverlay.classList.toggle('active', isOpen);
        if (plusBtn) plusBtn.classList.toggle('active', isOpen);
        // 关闭其他弹出层
        if (isOpen) {
            var picker = document.getElementById('user-sticker-picker');
            if (picker) picker.classList.remove('active');
        }
    };

    window.closePlusPanel = function() {
        isOpen = false;
        panelOverlay.classList.remove('active');
        if (plusBtn) plusBtn.classList.remove('active');
    };

    // 面板按钮功能
    window.triggerImageUpload = function() {
        document.getElementById('image-input').click();
        closePlusPanel();
    };

    window.triggerRedPacket = function() {
        if (typeof window.showRedPacketSendModal === 'function') {
            window.showRedPacketSendModal();
        } else {
            console.warn('红包功能未加载');
            if (typeof window.showNotification === 'function') {
                window.showNotification('红包功能加载中，请稍后', 'info');
            }
        }
        closePlusPanel();
    };

    window.triggerGift = function() {
        if (typeof window.showNotification === 'function') {
            window.showNotification('🎁 礼物功能开发中，敬请期待', 'info');
        } else {
            alert('🎁 礼物功能开发中，敬请期待');
        }
        closePlusPanel();
    };

    // ESC 关闭
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && isOpen) closePlusPanel();
    });

    // 点击加号时阻止事件冒泡
    if (plusBtn) {
        plusBtn.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }
})();