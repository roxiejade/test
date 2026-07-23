/**
 * QQ音乐歌单面板 - 本地JSON版本
 * 读取 data/songs.json，不依赖任何外部接口
 */
(function() {
    'use strict';

    const CONFIG = {
        PLAYLIST_NAME: '传讯音乐台',
        STORAGE_KEY: 'qqmusic_panel_state',
        SONG_STORAGE_KEY: 'qqmusic_song_cache',
        FIRST_PLAY_KEY: 'qqmusic_first_play',
        TOGETHER_PROBABILITY: 0.7,
        TOGETHER_COOLDOWN: 10 * 60 * 1000,
    };

    // DOM 引用
    const container = document.getElementById('qqmusic-player');
    const mini = document.getElementById('qqmusic-mini');
    const panel = document.getElementById('qqmusic-panel');
    const listEl = document.getElementById('qqmusic-list');
    const searchInput = document.getElementById('qqmusic-search');
    const searchToggle = document.getElementById('qqmusic-search-toggle');
    const closeBtn = document.getElementById('qqmusic-close');
    const countEl = document.getElementById('qqmusic-count');
    const toggleBtn = document.getElementById('qqmusic-toggle');
    const titleEl = document.getElementById('qqmusic-title');

    let allSongs = [];
    let isPanelOpen = false;
    let isSearchExpanded = false;
    let currentSong = null;
    let isInitialized = false;
    let lastTogetherTime = 0;

    // ============================================================
    // 工具
    // ============================================================
    function log(msg) { console.log('[QQ音乐]', msg); }
    function warn(msg) { console.warn('[QQ音乐]', msg); }

    function getMyName() {
        var el = document.getElementById('my-name');
        return el ? el.textContent.trim() : '我';
    }

    function getPartnerName() {
        var el = document.getElementById('partner-name');
        return el ? el.textContent.trim() : '梦角';
    }

    function addSystemMessage(text) {
        var chatContainer = document.getElementById('chat-container');
        if (!chatContainer) return;
        var div = document.createElement('div');
        div.className = 'system-message';
        div.textContent = text;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // ============================================================
    // 核心：播放歌曲
    // ============================================================
    function playSong(songId, songName, artist) {
        currentSong = { id: songId, name: songName, artist };

        var isFirstPlay = !localStorage.getItem(CONFIG.FIRST_PLAY_KEY);

        if (isFirstPlay) {
            localStorage.setItem(CONFIG.FIRST_PLAY_KEY, 'true');
            var myName = getMyName();
            var partnerName = getPartnerName();

            addSystemMessage(myName + ' 正在听歌');

            var now = Date.now();
            var shouldShowTogether =
                Math.random() < CONFIG.TOGETHER_PROBABILITY &&
                (now - lastTogetherTime > CONFIG.TOGETHER_COOLDOWN);

            if (shouldShowTogether) {
                lastTogetherTime = now;
                setTimeout(function() {
                    addSystemMessage(partnerName + ' 正在和 ' + myName + ' 一起听');
                }, 400);
            }
        } else {
            var myName = getMyName();
            addSystemMessage(myName + ' 挑选了一首歌');
        }

        var event = new CustomEvent('qqmusic:play', {
            detail: { songId, songName, artist }
        });
        document.dispatchEvent(event);

        var webUrl = 'https://y.qq.com/n/ryqq/songDetail/' + songId;
        window.open(webUrl, '_blank');
    }

    // ============================================================
    // 读取本地 JSON 文件（核心）
    // ============================================================
    async function fetchPlaylist(forceRefresh) {
        // 如果非强制刷新，先检查缓存
        if (!forceRefresh) {
            var cached = localStorage.getItem(CONFIG.SONG_STORAGE_KEY);
            if (cached) {
                try {
                    var data = JSON.parse(cached);
                    if (data && data.length > 0) {
                        log('✅ 从缓存加载歌单，共 ' + data.length + ' 首歌');
                        return data;
                    }
                } catch (_) {}
            }
        }

        try {
            log('📡 读取 data/songs.json ...');
            var response = await fetch('data/songs.json');
            if (!response.ok) throw new Error('文件不存在或无法访问');
            var songs = await response.json();

            if (songs && songs.length > 0) {
                log('✅ 读取成功，共 ' + songs.length + ' 首歌');
                localStorage.setItem(CONFIG.SONG_STORAGE_KEY, JSON.stringify(songs));
                return songs;
            } else {
                throw new Error('歌单为空');
            }
        } catch (error) {
            warn('⚠️ 读取 data/songs.json 失败:', error);
            // 如果缓存里有数据，即使读取失败也返回缓存
            var cached = localStorage.getItem(CONFIG.SONG_STORAGE_KEY);
            if (cached) {
                try {
                    var data = JSON.parse(cached);
                    if (data && data.length > 0) {
                        log('✅ 从缓存恢复歌单，共 ' + data.length + ' 首歌');
                        return data;
                    }
                } catch (_) {}
            }
            // 最后备用
            return getFallbackSongs();
        }
    }

    function getFallbackSongs() {
        return [
            { id: '1', name: '请上传 songs.json', artist: '将歌单文件放到 data/ 文件夹', cover: '' },
            { id: '2', name: '然后刷新页面', artist: 'QQ音乐', cover: '' },
        ];
    }

    // ============================================================
    // 渲染歌单
    // ============================================================
    function renderSongs(songs) {
        if (!songs || songs.length === 0) {
            listEl.innerHTML = '<div class="qqmusic-empty"><div style="font-size:32px;margin-bottom:8px;">🎵</div><span>歌单是空的</span></div>';
            countEl.textContent = '共 0 首歌';
            return;
        }

        var html = songs.map(function(song, index) {
            var name = song.name || '未知歌曲';
            var artist = song.artist || '未知歌手';
            var id = song.id || '';
            return '<div class="qqmusic-item" data-index="' + index + '" data-id="' + id + '" data-name="' + encodeURIComponent(name) + '" data-artist="' + encodeURIComponent(artist) + '">' +
                '<div class="qqmusic-item-cover" style="display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--text-secondary);background:var(--border-color);border-radius:6px;flex-shrink:0;width:36px;height:36px;">🎵</div>' +
                '<div class="qqmusic-item-info">' +
                '<div class="qqmusic-item-name">' + highlightText(name) + '</div>' +
                '<div class="qqmusic-item-artist">' + highlightText(artist) + '</div>' +
                '</div>' +
                '<span class="qqmusic-item-play">▶</span>' +
                '</div>';
        }).join('');

        listEl.innerHTML = html;
        countEl.textContent = '共 ' + songs.length + ' 首歌';

        // 刷新按钮
        var footer = document.querySelector('.qqmusic-footer');
        if (footer) {
            var existingBtn = document.getElementById('qqmusic-refresh-btn');
            if (!existingBtn) {
                var refreshBtn = document.createElement('span');
                refreshBtn.id = 'qqmusic-refresh-btn';
                refreshBtn.textContent = '🔄 刷新歌单';
                refreshBtn.style.cssText = 'font-size:11px;background:rgba(var(--accent-color-rgb),0.1);border:1px solid rgba(var(--accent-color-rgb),0.2);border-radius:12px;padding:2px 12px;color:var(--accent-color);cursor:pointer;font-family:var(--font-family);margin-left:8px;transition:all 0.2s;user-select:none;';
                refreshBtn.onclick = function(e) {
                    e.stopPropagation();
                    localStorage.removeItem(CONFIG.SONG_STORAGE_KEY);
                    loadSongs(true);
                    log('🔄 已刷新歌单');
                };
                footer.appendChild(refreshBtn);
            }
        }

        // 绑定点击事件
        var items = listEl.querySelectorAll('.qqmusic-item');
        for (var i = 0; i < items.length; i++) {
            items[i].addEventListener('click', function() {
                var id = this.dataset.id;
                var name = decodeURIComponent(this.dataset.name || '');
                var artist = decodeURIComponent(this.dataset.artist || '');
                if (id) playSong(id, name, artist);
            });
        }
    }

    function highlightText(text) {
        var keyword = searchInput ? searchInput.value.trim() : '';
        if (!keyword || !text) return text;
        try {
            var escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            var regex = new RegExp('(' + escaped + ')', 'gi');
            return text.replace(regex, '<span class="highlight">$1</span>');
        } catch (_) { return text; }
    }

    function filterSongs(keyword) {
        if (!keyword.trim()) { renderSongs(allSongs); return; }
        var kw = keyword.trim().toLowerCase();
        var filtered = allSongs.filter(function(s) {
            return (s.name || '').toLowerCase().includes(kw) || (s.artist || '').toLowerCase().includes(kw);
        });
        renderSongs(filtered);
    }

    // ============================================================
    // 面板控制
    // ============================================================
    function openPanel() {
        if (isPanelOpen) return;
        isPanelOpen = true;
        panel.style.display = 'flex';
        mini.style.display = 'none';
        localStorage.setItem(CONFIG.STORAGE_KEY, 'open');
        if (allSongs.length === 0) loadSongs(false);
    }

    function closePanel() {
        isPanelOpen = false;
        panel.style.display = 'none';
        mini.style.display = 'flex';
        collapseSearch();
        localStorage.setItem(CONFIG.STORAGE_KEY, 'closed');
        localStorage.removeItem(CONFIG.FIRST_PLAY_KEY);
    }

    function togglePanel() {
        isPanelOpen ? closePanel() : openPanel();
    }

    function expandSearch() {
        if (isSearchExpanded) return;
        isSearchExpanded = true;
        searchInput.classList.add('expanded');
        searchInput.style.display = 'block';
        setTimeout(function() { searchInput.focus(); }, 100);
        searchToggle.textContent = '✕';
        searchToggle.title = '关闭搜索';
    }

    function collapseSearch() {
        if (!isSearchExpanded) return;
        isSearchExpanded = false;
        searchInput.classList.remove('expanded');
        searchInput.style.display = 'none';
        searchInput.value = '';
        searchToggle.textContent = '🔍';
        searchToggle.title = '搜索';
        if (allSongs.length > 0) renderSongs(allSongs);
    }

    function toggleSearch() {
        isSearchExpanded ? collapseSearch() : expandSearch();
    }

    async function loadSongs(forceRefresh) {
        listEl.innerHTML = '<div class="qqmusic-loading"><div class="qqmusic-spinner"></div><span>' + (forceRefresh ? '正在刷新歌单...' : '加载歌单中...') + '</span><span style="font-size:11px;opacity:0.5;">请稍候</span></div>';
        try {
            allSongs = await fetchPlaylist(forceRefresh || false);
            renderSongs(allSongs);
        } catch (_) {
            listEl.innerHTML = '<div class="qqmusic-empty"><div style="font-size:32px;margin-bottom:8px;">😢</div><span>加载失败，请检查 data/songs.json 是否存在</span><span style="font-size:11px;opacity:0.5;cursor:pointer;margin-top:6px;display:inline-block;color:var(--accent-color);" onclick="window.QQMusicPlayer?.load(true)">点击重试</span></div>';
        }
    }

    function restoreState() {
        var state = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (state === 'open') {
            setTimeout(openPanel, 400);
        } else {
            mini.style.display = 'flex';
            panel.style.display = 'none';
        }
    }

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        if (isInitialized) return;
        isInitialized = true;

        if (titleEl) {
            var savedName = localStorage.getItem('qqmusic_playlist_name');
            titleEl.textContent = '🎵 ' + (savedName || CONFIG.PLAYLIST_NAME);
            titleEl.style.cursor = 'pointer';
            titleEl.title = '点击修改歌单名称';
            titleEl.addEventListener('click', function(e) {
                e.stopPropagation();
                var current = this.textContent.replace('🎵 ', '').trim();
                var newName = prompt('修改歌单名称：', current);
                if (newName && newName.trim() !== '') {
                    var trimmed = newName.trim();
                    this.textContent = '🎵 ' + trimmed;
                    localStorage.setItem('qqmusic_playlist_name', trimmed);
                }
            });
        }

        container.style.display = 'none';
        mini.style.display = 'flex';
        panel.style.display = 'none';
        searchInput.style.display = 'none';

        if (toggleBtn) {
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (container.style.display === 'none') {
                    container.style.display = 'block';
                    var state = localStorage.getItem(CONFIG.STORAGE_KEY);
                    if (state === 'open') openPanel();
                    else { mini.style.display = 'flex'; panel.style.display = 'none'; }
                    if (allSongs.length === 0 && isPanelOpen) loadSongs(false);
                    toggleBtn.classList.add('active');

                    var advancedModal = document.getElementById('advanced-modal');
                    if (advancedModal) {
                        if (typeof hideModal === 'function') hideModal(advancedModal);
                        else advancedModal.style.display = 'none';
                    }
                } else {
                    container.style.display = 'none';
                    toggleBtn.classList.remove('active');
                }
            });
        }

        if (mini) mini.addEventListener('click', togglePanel);
        if (closeBtn) closeBtn.addEventListener('click', closePanel);
        if (searchToggle) searchToggle.addEventListener('click', toggleSearch);
        if (searchInput) {
            searchInput.addEventListener('input', function() { filterSongs(this.value); });
            searchInput.addEventListener('keydown', function(e) { if (e.key === 'Escape') collapseSearch(); });
        }

        restoreState();
        if (isPanelOpen) loadSongs(false);
    }

    // ============================================================
    // 暴露全局
    // ============================================================
    window.QQMusicPlayer = {
        open: openPanel,
        close: closePanel,
        toggle: togglePanel,
        play: playSong,
        load: loadSongs,
        getCurrentSong: function() { return currentSong; },
        getAllSongs: function() { return allSongs; },
        isOpen: function() { return isPanelOpen; },
        refresh: function() { loadSongs(true); },
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
