/**
 * QQ音乐歌单面板 - 功能模块
 * 歌单ID: 9751402623
 * 支持：本地缓存 + 一键刷新歌单
 */
(function() {
    'use strict';

    const CONFIG = {
        PLAYLIST_ID: '9751402623',
        PLAYLIST_NAME: '传讯音乐台',
        API_URL: 'https://api.qqsuu.cn/api/qqmusic/playlist',
        STORAGE_KEY: 'qqmusic_panel_state',
        SONG_STORAGE_KEY: 'qqmusic_song_cache',
        CACHE_DURATION: 10 * 60 * 1000,
        TOGETHER_PROBABILITY: 0.7,
        TOGETHER_COOLDOWN: 10 * 60 * 1000,
        FIRST_PLAY_KEY: 'qqmusic_first_play',
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

        const isFirstPlay = !localStorage.getItem(CONFIG.FIRST_PLAY_KEY);

        if (isFirstPlay) {
            localStorage.setItem(CONFIG.FIRST_PLAY_KEY, 'true');
            const myName = getMyName();
            const partnerName = getPartnerName();

            addSystemMessage(`${myName} 正在听歌`);

            const now = Date.now();
            const shouldShowTogether = 
                Math.random() < CONFIG.TOGETHER_PROBABILITY &&
                (now - lastTogetherTime > CONFIG.TOGETHER_COOLDOWN);

            if (shouldShowTogether) {
                lastTogetherTime = now;
                setTimeout(() => {
                    addSystemMessage(`${partnerName} 正在和 ${myName} 一起听`);
                }, 400);
            }
        } else {
            const myName = getMyName();
            addSystemMessage(`${myName} 挑选了一首歌`);
        }

        const event = new CustomEvent('qqmusic:play', {
            detail: { songId, songName, artist }
        });
        document.dispatchEvent(event);

        const webUrl = `https://y.qq.com/n/ryqq/songDetail/${songId}`;
        window.open(webUrl, '_blank');
    }

    // ============================================================
    // 获取歌单（支持强制刷新）
    // ============================================================
    async function fetchPlaylist(forceRefresh = false) {
        // 如果不是强制刷新，先检查缓存
        if (!forceRefresh) {
            const cached = localStorage.getItem(CONFIG.SONG_STORAGE_KEY);
            if (cached) {
                try {
                    const data = JSON.parse(cached);
                    if (data.songs && data.songs.length > 0) {
                        log('✅ 从缓存加载歌单，共 ' + data.songs.length + ' 首歌');
                        return data.songs;
                    }
                } catch (_) {}
            }
        }

        // 强制刷新或缓存为空时，从接口拉取
        const proxyUrls = [
            `https://api.qqsuu.cn/api/qqmusic/playlist?id=${CONFIG.PLAYLIST_ID}`,
            `https://api.uomg.com/api/qq.music?url=https://y.qq.com/n/ryqq/playlist/${CONFIG.PLAYLIST_ID}`,
            `https://api.66mz8.com/api/qqplaylist.php?id=${CONFIG.PLAYLIST_ID}`
        ];

        for (const url of proxyUrls) {
            try {
                log('📡 尝试拉取歌单: ' + url);
                const response = await fetch(url, {
                    signal: AbortSignal.timeout(8000)
                });
                const result = await response.json();

                if (result.code === 200 && result.data && result.data.list && result.data.list.length > 0) {
                    const songs = result.data.list.map(item => ({
                        id: item.songid || item.id || String(Math.random()),
                        name: item.songname || item.name || '未知歌曲',
                        artist: item.singer || item.artist || '未知歌手',
                        cover: item.albumurl || item.cover || '',
                    }));
                    log('✅ 接口拉取成功，共 ' + songs.length + ' 首歌');
                    
                    localStorage.setItem(CONFIG.SONG_STORAGE_KEY, JSON.stringify({
                        songs: songs,
                        timestamp: Date.now()
                    }));
                    return songs;
                }
            } catch (error) {
                warn('⚠️ 接口请求失败: ' + url, error);
            }
        }

        warn('⚠️ 所有接口均不可用，使用内置备用歌单');
        const fallbackSongs = [
            { id: '1', name: '晴天', artist: '周杰伦', cover: '' },
            { id: '2', name: '七里香', artist: '周杰伦', cover: '' },
            { id: '3', name: '夜曲', artist: '周杰伦', cover: '' },
            { id: '4', name: '稻香', artist: '周杰伦', cover: '' },
            { id: '5', name: '告白气球', artist: '周杰伦', cover: '' },
            { id: '6', name: '等你下课', artist: '周杰伦', cover: '' },
            { id: '7', name: 'Mojito', artist: '周杰伦', cover: '' },
            { id: '8', name: '说好不哭', artist: '周杰伦', cover: '' },
        ];
        localStorage.setItem(CONFIG.SONG_STORAGE_KEY, JSON.stringify({
            songs: fallbackSongs,
            timestamp: Date.now()
        }));
        return fallbackSongs;
    }

    // ============================================================
    // 渲染歌单（带刷新按钮）
    // ============================================================
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

        // ===== 新增：底部刷新按钮 =====
        const existingRefreshBtn = document.getElementById('qqmusic-refresh-btn');
        if (!existingRefreshBtn) {
            const footer = document.querySelector('.qqmusic-footer');
            if (footer) {
                const refreshBtn = document.createElement('span');
                refreshBtn.id = 'qqmusic-refresh-btn';
                refreshBtn.textContent = '🔄 刷新歌单';
                refreshBtn.style.cssText = `
                    font-size: 11px;
                    background: rgba(var(--accent-color-rgb), 0.1);
                    border: 1px solid rgba(var(--accent-color-rgb), 0.2);
                    border-radius: 12px;
                    padding: 2px 12px;
                    color: var(--accent-color);
                    cursor: pointer;
                    font-family: var(--font-family);
                    margin-left: 8px;
                    transition: all 0.2s;
                    user-select: none;
                `;
                refreshBtn.onmouseenter = function() {
                    this.style.background = 'rgba(var(--accent-color-rgb), 0.2)';
                };
                refreshBtn.onmouseleave = function() {
                    this.style.background = 'rgba(var(--accent-color-rgb), 0.1)';
                };
                refreshBtn.onclick = function(e) {
                    e.stopPropagation();
                    // 清除缓存，强制刷新
                    localStorage.removeItem(CONFIG.SONG_STORAGE_KEY);
                    // 重新加载
                    loadSongs(true);
                    log('🔄 已清除缓存，重新加载歌单');
                };
                footer.appendChild(refreshBtn);
            }
        }

        // 绑定点击事件
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

    async function loadSongs(forceRefresh = false) {
        listEl.innerHTML = `<div class="qqmusic-loading"><div class="qqmusic-spinner"></div><span>${forceRefresh ? '正在刷新歌单...' : '加载歌单中...'}</span><span style="font-size:11px;opacity:0.5;">请稍候</span></div>`;
        try {
            allSongs = await fetchPlaylist(forceRefresh);
            renderSongs(allSongs);
        } catch (_) {
            listEl.innerHTML = `<div class="qqmusic-empty"><div style="font-size:32px;margin-bottom:8px;">😢</div><span>歌单加载失败，请检查网络</span><span style="font-size:11px;opacity:0.5;cursor:pointer;margin-top:6px;display:inline-block;color:var(--accent-color);" onclick="window.QQMusicPlayer?.load(true)">点击重试</span></div>`;
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

        if (toggleBtn) {
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (container.style.display === 'none') {
                    container.style.display = 'block';
                    const state = localStorage.getItem(CONFIG.STORAGE_KEY);
                    if (state === 'open') openPanel();
                    else { mini.style.display = 'flex'; panel.style.display = 'none'; }
                    if (allSongs.length === 0 && isPanelOpen) loadSongs(false);
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
        getCurrentSong: () => currentSong,
        getAllSongs: () => allSongs,
        isOpen: () => isPanelOpen,
        refresh: () => loadSongs(true),
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
