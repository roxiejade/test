/* ============================================================
   js/pinyin-engine.js
   异世界恋人盲打引擎
   - Trie 真字母级：每层按子节点拼音数加权，每个完整拼音等概率
   - 两种模式：自由组句（手动开始/换一句）、对话回复（我发消息自动触发）
   - 浮层可拖动、可最小化、无遮罩
   - 梦角发消息：直接 addMessage，sender=settings.partnerName，带 meta.source='pinyin'
   依赖：window.PINYIN_DICT / window.PINYIN_WORD_DICT（pinyin-dict.js）
   ============================================================ */
(function () {
    'use strict';

    // ---------- 配置 ----------
        var CONFIG = {
        DELAY_LETTER: 300,
        DELAY_STOP: 800,
        DELAY_WORD: 900,
        DELAY_SEGMENT: 1300,
        MAX_SEGMENTS: 12,
        MAX_CHARS: 20,
        COMMA_PROB: 0.15,
        EGG_PROB: 0.10,
        WORD_PROB: 0.10,
        DIRECT_WORD_PROB: 0.50,
        REPLY_MERGE_WINDOW: 3000,
        REPLY_TWO_PROB: 0.30,
        REPLY_GAP_MIN: 2000,
        REPLY_GAP_MAX: 4000
    };

    function stopProb(seg) {
        if (seg <= 0) return 0;
        if (seg === 1) return 0.10;
        if (seg <= 3) return 0.15;
        if (seg <= 6) return 0.05;
        return Math.min(0.95, 0.05 + (seg - 6) * 0.10);
    }

    // ---------- 状态 ----------
    var state = {
        isOpen: false,
        isMinimized: false,
        mode: 'free',
        isTyping: false,
        currentSentence: [],
        segmentCount: 0,
        abortToken: 0,
        trieRoot: null,
        singleKeys: [],
        doubleKeys: [],
        replyMergeTimer: null,
        replyPending: false
    };

    var el = {};

    // ---------- 工具 ----------
    function weightedRandom(items) {
        var total = 0, i;
        for (i = 0; i < items.length; i++) total += items[i][1];
        if (total <= 0) return items[0][0];
        var r = Math.random() * total;
        for (i = 0; i < items.length; i++) {
            if (r < items[i][1]) return items[i][0];
            r -= items[i][1];
        }
        return items[items.length - 1][0];
    }

    function sleep(ms, token) {
        return new Promise(function (resolve) {
            setTimeout(function () {
                resolve(token === state.abortToken);
            }, ms);
        });
    }

    // ---------- Trie ----------
    function buildTrie(dict) {
        var root = { children: {}, leafCount: 0, subtreeCount: 0 };
        Object.keys(dict).forEach(function (py) {
            if (!/^[a-z]+$/.test(py)) return;
            var node = root;
            for (var i = 0; i < py.length; i++) {
                var ch = py[i];
                if (!node.children[ch]) {
                    node.children[ch] = { children: {}, leafCount: 0, subtreeCount: 0 };
                }
                node = node.children[ch];
                node.subtreeCount++;
            }
            node.leafCount++;
            root.subtreeCount++;
        });
        return root;
    }

    async function walkTriePinyin(token) {
        var node = state.trieRoot;
        var letters = [];
        while (true) {
            if (token !== state.abortToken) return null;
            if (node.leafCount > 0) {
                var pStop = node.leafCount / node.subtreeCount;
                if (Math.random() < pStop) break;
            }
            var childKeys = Object.keys(node.children);
            if (childKeys.length === 0) break;
            var totalSub = 0;
            childKeys.forEach(function (k) { totalSub += node.children[k].subtreeCount; });
            var r = Math.random() * totalSub;
            var picked = childKeys[childKeys.length - 1];
            for (var i = 0; i < childKeys.length; i++) {
                var c = node.children[childKeys[i]];
                if (r < c.subtreeCount) { picked = childKeys[i]; break; }
                r -= c.subtreeCount;
            }
            node = node.children[picked];
            letters.push(picked);
            el.pinyinDisplay.textContent += picked;
            var ok = await sleep(CONFIG.DELAY_LETTER, token);
            if (!ok) return null;
        }
        return letters.join('');
    }

    // ---------- 选字 ----------
        function pickChar(pinyin) {
        var rawPool = window.PINYIN_DICT[pinyin];
        if (!rawPool || !rawPool.length) return '？';
        // 过滤掉频次 < 1 的极冷门字（婺、鹜、翳这种聊天里不会出现的）
        var pool = rawPool.filter(function (x) { return x[1] >= 50; });
        if (!pool.length) pool = rawPool;  // 兜底：全被过滤了就用原池
        var normal = weightedRandom(pool);
        if (Math.random() < CONFIG.EGG_PROB && pool.length > 1) {
            // 彩蛋也只从过滤后的池里抽，排除冷门字
            var others = pool.filter(function (x) { return x[0] !== normal; });
            if (others.length) {
                return others[Math.floor(Math.random() * others.length)][0];
            }
        }
        return normal;
    }
    function updateCandidates(pinyin, finalChar) {
        el.candidates.innerHTML = '';
        var pool = window.PINYIN_DICT[pinyin];
        if (!pool || !pool.length) return;
        var chars = pool.map(function (x) { return x[0]; }).filter(function (c) { return c !== finalChar; });
        chars.sort(function () { return 0.5 - Math.random(); });
        var display = chars.slice(0, 4);
        display.push(finalChar);
        display.sort(function () { return 0.5 - Math.random(); });
        display.forEach(function (c) {
            var d = document.createElement('div');
            d.className = 'pinyin-candidate' + (c === finalChar ? ' active' : '');
            d.textContent = c;
            el.candidates.appendChild(d);
        });
    }

    // ---------- 拼句 ----------
    function renderSentence() {
        var s = '';
        state.currentSentence.forEach(function (item, idx) {
            s += item.text;
            if (item.hasComma && idx < state.currentSentence.length - 1) s += '，';
        });
        el.result.textContent = s;
    }

    function currentText() {
        var s = '';
        state.currentSentence.forEach(function (item, idx) {
            s += item.text;
            if (item.hasComma && idx < state.currentSentence.length - 1) s += '，';
        });
        return s;
    }

    function charCount() {
        var n = 0;
        state.currentSentence.forEach(function (item) { n += item.text.length; });
        return n;
    }

    // ---------- 单段 ----------
    async function typeOneSegment(token) {
        var isDouble = Math.random() < CONFIG.WORD_PROB && state.doubleKeys.length > 0;

        if (isDouble) {
            var pinyinStr = state.doubleKeys[Math.floor(Math.random() * state.doubleKeys.length)];
            el.pinyinDisplay.textContent = '';
            el.pinyinDisplay.classList.add('active');
            for (var i = 0; i < pinyinStr.length; i++) {
                var ch = pinyinStr[i];
                el.pinyinDisplay.textContent += ch;
                var ok = await sleep(ch === ' ' ? CONFIG.DELAY_LETTER * 3 : CONFIG.DELAY_LETTER, token);
                if (!ok) return null;
            }
            if (Math.random() < CONFIG.DIRECT_WORD_PROB && window.PINYIN_WORD_DICT[pinyinStr]) {
                var word = window.PINYIN_WORD_DICT[pinyinStr];
                var firstSyl = pinyinStr.split(' ')[0];
                updateCandidates(firstSyl, word[0]);
                var okw = await sleep(CONFIG.DELAY_WORD, token);
                if (!okw) return null;
                el.pinyinDisplay.textContent = '';
                el.pinyinDisplay.classList.remove('active');
                return word;
            } else {
                var sylls = pinyinStr.split(' ');
                var text = '';
                for (var j = 0; j < sylls.length; j++) {
                    if (token !== state.abortToken) return null;
                    var syl = sylls[j];
                    var c = pickChar(syl);
                    text += c;
                    updateCandidates(syl, c);
                    var okc = await sleep(CONFIG.DELAY_WORD, token);
                    if (!okc) return null;
                }
                el.pinyinDisplay.textContent = '';
                el.pinyinDisplay.classList.remove('active');
                return text;
            }
        }

        el.pinyinDisplay.textContent = '';
        el.pinyinDisplay.classList.add('active');
        var pinyin = await walkTriePinyin(token);
        if (!pinyin) return null;
        var okStop = await sleep(CONFIG.DELAY_STOP, token);
        if (!okStop) return null;
        var finalChar = pickChar(pinyin);
        updateCandidates(pinyin, finalChar);
        var okWord = await sleep(CONFIG.DELAY_WORD, token);
        if (!okWord) return null;
        el.pinyinDisplay.textContent = '';
        el.pinyinDisplay.classList.remove('active');
        return finalChar;
    }

    // ---------- 组句主循环 ----------
    async function runSentence(token) {
        state.currentSentence = [];
        state.segmentCount = 0;
        state.isTyping = true;
        el.result.textContent = '';
        el.candidates.innerHTML = '';
        updateStatus('正在组句...');
        updateButton();

        while (state.segmentCount < CONFIG.MAX_SEGMENTS && charCount() < CONFIG.MAX_CHARS) {
            if (token !== state.abortToken) return;
            var text = await typeOneSegment(token);
            if (text === null) return;

            var hasComma = Math.random() < CONFIG.COMMA_PROB;
            state.currentSentence.push({ text: text, hasComma: hasComma });
            state.segmentCount++;
            renderSentence();

            if (charCount() >= CONFIG.MAX_CHARS) break;
            if (Math.random() < stopProb(state.segmentCount)) break;

            var okGap = await sleep(CONFIG.DELAY_SEGMENT, token);
            if (!okGap) return;
        }

        state.isTyping = false;
        updateStatus('组句完成');
        updateButton();

        if (el.autoMode && el.autoMode.checked) {
            await sleep(600, token);
            if (token !== state.abortToken) return;
            sendToChat();
        }
    }

    // ---------- UI 刷新 ----------
    function updateStatus(text) {
        if (el.status) el.status.textContent = text;
    }

    function updateButton() {
        if (!el.startBtn) return;
        if (state.mode === 'free') {
            el.startBtn.textContent = (state.isTyping || state.currentSentence.length > 0) ? '换一句' : '开始组句';
        } else {
            el.startBtn.textContent = '换一句';
        }
    }

    // ---------- 发送（梦角发消息） ----------
    function sendToChat() {
        if (state.currentSentence.length === 0) return;
        var text = currentText();

        if (typeof window.addMessage === 'function') {
            window.addMessage({
                id: Date.now() + Math.random(),
                sender: (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '对方',
                text: text,
                timestamp: new Date(),
                status: 'received',
                favorited: false,
                note: null,
                type: 'normal',
                meta: { source: 'pinyin' }
            });
        }

        state.currentSentence = [];
        state.segmentCount = 0;
        state.isTyping = false;
        el.result.textContent = '';
        el.candidates.innerHTML = '';
        el.pinyinDisplay.textContent = '';
        el.pinyinDisplay.classList.remove('active');
        updateStatus('等待开始');
        updateButton();
    }

    // ---------- 中止 ----------
    function abortTyping() {
        state.abortToken++;
        state.isTyping = false;
        state.currentSentence = [];
        state.segmentCount = 0;
        el.result.textContent = '';
        el.candidates.innerHTML = '';
        el.pinyinDisplay.textContent = '';
        el.pinyinDisplay.classList.remove('active');
        updateStatus('等待开始');
        updateButton();
    }

    function startOrRedraw() {
        abortTyping();
        var token = ++state.abortToken;
        runSentence(token);
    }

    // ---------- 显隐/最小化 ----------
    function openModal() {
        el.modal.classList.add('visible');
        state.isOpen = true;
        updateButton();
    }

    function closeModal() {
        abortTyping();
        el.modal.classList.remove('visible');
        state.isOpen = false;
        if (state.replyMergeTimer) { clearTimeout(state.replyMergeTimer); state.replyMergeTimer = null; }
        if (el.toggleBtn) el.toggleBtn.classList.remove('active');
        if (typeof settings !== 'undefined') {
            settings.pinyinEngineEnabled = false;
            if (typeof window.saveData === 'function') window.saveData();
        }
    }

    function minimize() {
        state.isMinimized = true;
        el.modal.classList.add('minimized');
        el.minBtn.innerHTML = '<i class="fas fa-plus"></i>';
        el.minBtn.title = '展开';
    }

    function expand() {
        state.isMinimized = false;
        el.modal.classList.remove('minimized');
        el.minBtn.innerHTML = '<i class="fas fa-minus"></i>';
        el.minBtn.title = '最小化';
    }

    // ---------- 模式切换 ----------
    function switchMode(mode) {
        if (state.mode === mode) return;
        abortTyping();
        state.mode = mode;
        el.modal.classList.toggle('mode-reply', mode === 'reply');
        el.modeBtns.forEach(function (b) {
            b.classList.toggle('active', b.dataset.mode === mode);
        });
        updateStatus(mode === 'free' ? '等待开始' : '等待你的消息...');
        updateButton();
    }

    // ---------- 对话回复 ----------
    function onUserMessage() {
        if (!state.isOpen) return;
        if (state.mode !== 'reply') return;
        if (state.replyPending) return;
        state.replyPending = true;
        state.replyMergeTimer = setTimeout(function () {
            state.replyMergeTimer = null;
            state.replyPending = false;
            triggerReplyRun();
        }, CONFIG.REPLY_MERGE_WINDOW);
    }

        async function triggerReplyRun() {
        if (!state.isOpen || state.mode !== 'reply') return;
        abortTyping();
        var token = ++state.abortToken;
        await runSentence(token);
        if (token !== state.abortToken) return;

        // 只有第一句已经发出去（勾了自动发送，currentSentence 已清空）时，
        // 才考虑补第二句。第一句还停在拼句区时，不触发第二句。
        if (state.currentSentence.length > 0) return;

        if (Math.random() < CONFIG.REPLY_TWO_PROB) {
            var gap = CONFIG.REPLY_GAP_MIN + Math.random() * (CONFIG.REPLY_GAP_MAX - CONFIG.REPLY_GAP_MIN);
            var ok = await sleep(gap, token);
            if (!ok || token !== state.abortToken) return;
            await runSentence(token);
        }
    }
    // ---------- 拖拽 ----------
    function setupDrag() {
        var dragging = false, moved = false, sx = 0, sy = 0, sl = 0, st = 0;
        var handle = el.header;
        handle.addEventListener('pointerdown', function (e) {
            if (e.target.closest('.pinyin-icon-btn') || e.target.closest('.pinyin-mode-btn')) return;
            var rect = el.modal.getBoundingClientRect();
            dragging = true; moved = false;
            sx = e.clientX; sy = e.clientY;
            sl = rect.left; st = rect.top;
            el.modal.style.transform = 'none';
            el.modal.style.left = sl + 'px';
            el.modal.style.top = st + 'px';
            el.modal.style.right = 'auto';
            el.modal.style.bottom = 'auto';
            handle.classList.add('dragging');
            try { handle.setPointerCapture(e.pointerId); } catch (err) {}
        });
        handle.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var dx = e.clientX - sx, dy = e.clientY - sy;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
            var nl = Math.max(0, Math.min(window.innerWidth - el.modal.offsetWidth, sl + dx));
            var nt = Math.max(0, Math.min(window.innerHeight - el.modal.offsetHeight, st + dy));
            el.modal.style.left = nl + 'px';
            el.modal.style.top = nt + 'px';
        });
        handle.addEventListener('pointerup', function (e) {
            dragging = false;
            handle.classList.remove('dragging');
            try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
            if (moved) {
                try {
                    localStorage.setItem('pinyinModalPos', JSON.stringify({
                        left: el.modal.style.left, top: el.modal.style.top
                    }));
                } catch (err) {}
            }
        });
        try {
            var saved = JSON.parse(localStorage.getItem('pinyinModalPos') || 'null');
            if (saved && saved.left && saved.top) {
                el.modal.style.transform = 'none';
                el.modal.style.left = saved.left;
                el.modal.style.top = saved.top;
                el.modal.style.right = 'auto';
            }
        } catch (err) {}
    }

    // ---------- 入口按钮 ----------
    function setupToggleBtn() {
        if (!el.toggleBtn) return;
        if (typeof settings !== 'undefined' && settings.pinyinEngineEnabled) {
            el.toggleBtn.classList.add('active');
            openModal();
        }
        el.toggleBtn.addEventListener('click', function () {
            var on = !el.toggleBtn.classList.contains('active');
            el.toggleBtn.classList.toggle('active', on);
            if (on) {
                if (typeof settings !== 'undefined') {
                    settings.pinyinEngineEnabled = true;
                    if (typeof window.saveData === 'function') window.saveData();
                }
                openModal();
            } else {
                closeModal();
            }
        });
    }

        // ---------- 监听用户发送（不依赖原站 _onUserMessage 钩子） ----------
            function setupUserSendListener() {
        var sendBtn = document.getElementById('send-btn');
        if (sendBtn && !sendBtn._pinyinBound) {
            sendBtn._pinyinBound = true;
            sendBtn.addEventListener('click', function () {
                onUserMessage();
            });
        }
        if (!document._pinyinKeyBound) {
            document._pinyinKeyBound = true;
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    var input = document.getElementById('message-input');
                    if (input && e.target === input) {
                        onUserMessage();
                    }
                }
            });
        }
    }
    // ---------- 初始化 ----------
    function init() {
        if (!window.PINYIN_DICT || !window.PINYIN_WORD_DICT) {
            console.warn('[pinyin-engine] PINYIN_DICT 未加载，引擎不启动');
            return;
        }
        state.trieRoot = buildTrie(window.PINYIN_DICT);
        state.singleKeys = Object.keys(window.PINYIN_DICT).filter(function (k) { return /^[a-z]+$/.test(k); });
        state.doubleKeys = Object.keys(window.PINYIN_WORD_DICT);

        el.modal = document.getElementById('pinyin-modal');
        el.toggleBtn = document.getElementById('pinyin-toggle-btn');
        el.header = document.getElementById('pinyin-drag-handle');
        el.status = document.getElementById('pinyin-status');
        el.pinyinDisplay = document.getElementById('pinyin-display');
        el.candidates = document.getElementById('pinyin-candidates');
        el.result = document.getElementById('pinyin-result');
        el.startBtn = document.getElementById('pinyin-start');
        el.sendBtn = document.getElementById('pinyin-send');
        el.autoMode = document.getElementById('pinyin-auto-mode');
        el.minBtn = document.getElementById('pinyin-minimize');
        el.closeBtn = document.getElementById('pinyin-close');
        el.modeBtns = document.querySelectorAll('.pinyin-mode-btn');

        if (!el.modal) { console.warn('[pinyin-engine] #pinyin-modal 不存在'); return; }

        el.startBtn.addEventListener('click', startOrRedraw);
        el.sendBtn.addEventListener('click', sendToChat);
        el.minBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            state.isMinimized ? expand() : minimize();
        });
        el.closeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            closeModal();
        });
        el.modeBtns.forEach(function (b) {
            b.addEventListener('click', function () { switchMode(b.dataset.mode); });
        });

                setupDrag();
        setupToggleBtn();
        setupUserSendListener();
        updateButton();
    }

    window.PinyinEngine = {
        onUserMessage: onUserMessage,
        isOpen: function () { return state.isOpen; },
        getMode: function () { return state.mode; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
