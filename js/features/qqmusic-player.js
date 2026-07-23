/**
 * QQ音乐歌单面板 - 完整版
 * 歌单ID: 9751402623
 * 功能：系统提示 + 概率一起听 + 首次/后续区分
 */
(function() {
    'use strict';

    const CONFIG = {
        PLAYLIST_ID: '9751402623',
        PLAYLIST_NAME: '传讯音乐台',
        API_URL: 'https://api.vvhan.com/api/qqplaylist',
        STORAGE_KEY: 'qqmusic_panel_state',
        SONG_STORAGE_KEY: 'qqmusic_song_cache',
        CACHE_DURATION: 10 * 60 * 1000,
        TOGETHER_PROBABILITY: 0.7,        // 70% 概率显示“一起听”
        TOGETHER_COOLDOWN: 10 * 60 * 1000, // 10分钟冷却
        FIRST_PLAY_KEY: 'qqmusic_first_play', // 记录是否第一次播放
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
    // 工具：获取名字
    // ============================================================
    function getMyName() {
        const el = document.getElementById('my-name');
        return el ? el.textContent.trim() : '我';
    }

    function getPartnerName() {
        const el = document.getElementById('partner-name');
        return el ? el.textContent.trim() : '梦角';
    }

    // ============================================================
    // 工具：系统提示
    // ============================================================
    function addSystemMessage(text) {
        const chatContainer = document.getElementById('chat-container');
        if (!chatContainer) return;

        const div = document.createElement('div');
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

        // ---- 判断是否第一次播放 ----
        const isFirstPlay = !localStorage.getItem(CONFIG.FIRST_PLAY_KEY);

        if (isFirstPlay) {
            // 首次播放：显示“正在听歌” + 概率“一起听”
            localStorage.setItem(CONFIG.FIRST_PLAY_KEY, 'true');

            const myName = getMyName();
            const partnerName = getPartnerName();

            // 1. 系统提示：My name 正在听歌
            addSystemMessage(`${myName} 正在听歌`);

            // 2. 概率触发“一起听”
            const now = Date.now();
            const shouldShowTogether = 
                Math.random() < CONFIG.TOGETHER_PROBABILITY &&
                (now - lastTogetherTime > CONFIG.TOGETHER_COOLDOWN);

            if (shouldShowTogether) {
                lastTogetherTime = now;
                // 延迟一点点显示，形成“先后”层次感
                setTimeout(() => {
                    addSystemMessage(`${partnerName} 正在和 ${myName} 一起听`);
                }, 400);
            }
        } else {
            // 后续播放：只显示“挑选了一首歌”
            const myName = getMyName();
            addSystemMessage(`${myName} 挑选了一首歌`);
        }

        // ---- 触发梦角感知事件（供其他扩展使用） ----
        const event = new CustomEvent('qqmusic:play', {
            detail: { songId, songName, artist }
        });
        document.dispatchEvent(event);

        // ---- 跳转QQ音乐 ----
        const webUrl = `https://y.qq.com/n/ryqq/songDetail/${songId}`;
        window.open(webUrl, '_blank');
    }

    // ============================================================
    // 以下为面板控制、歌单加载、搜索、状态恢复等（无改动）
    // ============================================================
    async function fetchPlaylist() {
        const cached = localStorage.getItem(CONFIG.SONG_STORAGE_KEY);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                if (data.timestamp && Date.now() - data.timestamp < CONFIG.CACHE_DURATION) {
                    return data.songs;
                }
            } catch (_) {}
        }

        try {
            const url = `${CONFIG.API_URL}?id=${CONFIG.PLAYLIST_ID}`;
            const response = await fetch(url);
            const result = await response.json();

            if (result.code === 200 && result.data && result.data.list) {
                const songs = result.data.list.map(item => ({
                    id: item.songid || item.id,
                    name: item.songname || item.name || '未知歌曲',
                    artist: item.singer || item.artist || '未知歌手',
                    cover: item.albumurl || item.cover || '',
                }));
                localStorage.setItem(CONFIG.SONG_STORAGE_KEY, JSON.stringify({
                    songs: songs,
                    timestamp: Date.now()
                }));
                return songs;
            }
        } catch (_) {}

        // 备用接口
        try {
            const fallbackUrl = `https://api.qsqq.tk/api/qqmusic?type=playlist&id=${CONFIG.PLAYLIST_ID}`;
            const response = await fetch(fallbackUrl);
            const result = await response.json();
            if (result.code === 200 && result.data) {
                const songs = result.data.map(item => ({
                    id: item.id || item.song_id,
                    name: item.name || item.title || '未知歌曲',
                    artist: item.singer || item.author || '未知歌手',
                    cover: item.pic || item.cover || '',
                }));
                localStorage.setItem(CONFIG.SONG_STORAGE_KEY, JSON.stringify({
                    songs: songs,
                    timestamp: Date.now()
                }));
                return songs;
            }
        } catch (_) {}

        return [
            { id: '001', name: '歌单加载失败', artist: '请检查网络后刷新', cover: '' },
            { id: '002', name: '或稍后重试', artist: 'QQ音乐', cover: '' },
        ];
    }

    function renderSongs(songs) {
        if (!songs || songs.length === 0) {
            listEl.innerHTML = `<div class="qqmusic-empty"><div style="font-size:32px;margin-bottom:8px;">🎵</div><span>歌单是空的，或者加载失败了</span></div>`;
            countEl.textContent = '共 0 首歌';
            return;
        }

        const html = songs.map((song, index) => `
            <div class="qqmusic-item" data-index="${index}" data-id="${song.id}" data-name="${encodeURIComponent(song.name)}" data-artist="${encodeURIComponent(song.artist)}">
                ${song.cover ? `<img class="qqmusic-item-cover" src="${song.cover}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : ''}
                <div class="qqmusic-item-cover" style="${song.cover ? 'display:none;' : ''}display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--text-secondary);background:var(--border-color);border-radius:6px;flex-shrink:0;width:36px;height:36px;">🎵</div>
                <div class="qqmusic-item-info">
                    <div class="qqmusic-item-name">${highlightText(song.name)}</div>
                    <div class="qqmusic-item-artist">${highlightText(song.artist)}</div>
                </div>
                <span class="qqmusic-item-play">▶</span>
            </div>
        `).join('');

        listEl.innerHTML = html;
        countEl.textContent = `共 ${songs.length} 首歌`;

        listEl.querySelectorAll('.qqmusic-item').forEach(el => {
            el.addEventListener('click', function(e) {
                const id = this.dataset.id;
                const name = decodeURIComponent(this.dataset.name || '');
                const artist = decodeURIComponent(this.dataset.artist || '');
                if (id) playSong(id, name, artist);
            });
        });
    }

    function highlightText(text) {
        const keyword = searchInput.value.trim();
        if (!keyword || !text) return text;
        try {
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escaped})`, 'gi');
            return text.replace(regex, '<span class="highlight">$1</span>');
        } catch (_) { return text; }
    }

    function filterSongs(keyword) {
        if (!keyword.trim()) { renderSongs(allSongs); return; }
        const kw = keyword.trim().toLowerCase();
        const filtered = allSongs.filter(s =>
            s.name.toLowerCase().includes(kw) || s.artist.toLowerCase().includes(kw)
        );
        renderSongs(filtered);
    }

    function openPanel() {
        if (isPanelOpen) return;
        isPanelOpen = true;
        panel.style.display = 'flex';
        mini.style.display = 'none';
        localStorage.setItem(CONFIG.STORAGE_KEY, 'open');
        if (allSongs.length === 0) loadSongs();
    }

    function closePanel() {
        isPanelOpen = false;
        panel.style.display = 'none';
        mini.style.display = 'flex';
        collapseSearch();
        localStorage.setItem(CONFIG.STORAGE_KEY, 'closed');
        // 关闭面板时，重置首次播放标记，以便下次打开重新触发“正在听歌”
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
        setTimeout(() => searchInput.focus(), 100);
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

    async function loadSongs() {
        listEl.innerHTML = `<div class="qqmusic-loading"><div class="qqmusic-spinner"></div><span>加载歌单中...</span><span style="font-size:11px;opacity:0.5;">请稍候</span></div>`;
        try {
            allSongs = await fetchPlaylist();
            renderSongs(allSongs);
        } catch (_) {
            listEl.innerHTML = `<div class="qqmusic-empty"><div style="font-size:32px;margin-bottom:8px;">😢</div><span>歌单加载失败，请检查网络</span><span style="font-size:11px;opacity:0.5;cursor:pointer;margin-top:6px;display:inline-block;color:var(--accent-color);" onclick="window.QQMusicPlayer?.load()">点击重试</span></div>`;
        }
    }

    function restoreState() {
        const state = localStorage.getItem(CONFIG.STORAGE_KEY);
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

        // 歌单名称
        if (titleEl) {
            const savedName = localStorage.getItem('qqmusic_playlist_name');
            titleEl.textContent = `🎵 ${savedName || CONFIG.PLAYLIST_NAME}`;
            titleEl.style.cursor = 'pointer';
            titleEl.title = '点击修改歌单名称';
            titleEl.addEventListener('click', function(e) {
                e.stopPropagation();
                const current = this.textContent.replace('🎵 ', '').trim();
                const newName = prompt('修改歌单名称：', current);
                if (newName && newName.trim() !== '') {
                    const trimmed = newName.trim();
                    this.textContent = `🎵 ${trimmed}`;
                    localStorage.setItem('qqmusic_playlist_name', trimmed);
                }
            });
        }

        container.style.display = 'none';
        mini.style.display = 'flex';
        panel.style.display = 'none';
        searchInput.style.display = 'none';

        // 开关
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (container.style.display === 'none') {
                    container.style.display = 'block';
                    const state = localStorage.getItem(CONFIG.STORAGE_KEY);
                    if (state === 'open') openPanel();
                    else { mini.style.display = 'flex'; panel.style.display = 'none'; }
                    if (allSongs.length === 0 && isPanelOpen) loadSongs();
                    this.classList.add('active');

                    const advancedModal = document.getElementById('advanced-modal');
                    if (advancedModal) {
                        if (typeof hideModal === 'function') hideModal(advancedModal);
                        else advancedModal.style.display = 'none';
                    }
                } else {
                    container.style.display = 'none';
                    this.classList.remove('active');
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
        if (isPanelOpen) loadSongs();
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
        getCurrentSong: () => currentSong,
        getAllSongs: () => allSongs,
        isOpen: () => isPanelOpen,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
