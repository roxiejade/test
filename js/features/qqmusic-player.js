/**
 * QQ音乐歌单面板 - 功能模块
 * 歌单ID: 9751402623
 * 放在 js/features/ 目录下
 */

(function() {
    'use strict';

    // ============================================================
    // 配置
    // ============================================================
    const CONFIG = {
        PLAYLIST_ID: '9751402623',
        API_URL: 'https://api.uomg.com/api/qq.music',
        STORAGE_KEY: 'qqmusic_panel_state',
        SONG_STORAGE_KEY: 'qqmusic_song_cache',
        CACHE_DURATION: 10 * 60 * 1000, // 10分钟
    };

    // ============================================================
    // DOM 引用
    // ============================================================
    const container = document.getElementById('qqmusic-player');
    const mini = document.getElementById('qqmusic-mini');
    const panel = document.getElementById('qqmusic-panel');
    const listEl = document.getElementById('qqmusic-list');
    const searchInput = document.getElementById('qqmusic-search');
    const searchToggle = document.getElementById('qqmusic-search-toggle');
    const closeBtn = document.getElementById('qqmusic-close');
    const countEl = document.getElementById('qqmusic-count');
    const toggleBtn = document.getElementById('qqmusic-toggle');

    let allSongs = [];
    let filteredSongs = [];
    let isPanelOpen = false;
    let isSearchExpanded = false;
    let currentSong = null;
    let isInitialized = false;

    // ============================================================
    // 工具函数
    // ============================================================
    function log(msg, data) {
        if (data) {
            console.log(`[QQ音乐] ${msg}`, data);
        } else {
            console.log(`[QQ音乐] ${msg}`);
        }
    }

    function warn(msg, err) {
        console.warn(`[QQ音乐] ${msg}`, err || '');
    }

    // ============================================================
    // 获取歌单数据
    // ============================================================
    async function fetchPlaylist() {
        // 检查缓存
        const cached = localStorage.getItem(CONFIG.SONG_STORAGE_KEY);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                if (data.timestamp && Date.now() - data.timestamp < CONFIG.CACHE_DURATION) {
                    log('使用缓存歌单，共 ' + data.songs.length + ' 首歌');
                    return data.songs;
                }
            } catch (_) {}
        }

        try {
            // 使用新的可用接口
const url = `https://api.vvhan.com/api/qqplaylist?id=${CONFIG.PLAYLIST_ID}`;
            log('正在拉取歌单...');
            const response = await fetch(url);
            const result = await response.json();

            if (result.code === 200 && result.data && result.data.list) {
                const songs = result.data.list.map(item => ({
                    id: item.songid || item.id,
                    name: item.songname || item.name || '未知歌曲',
                    artist: item.singer || item.artist || '未知歌手',
                    cover: item.albumurl || item.cover || '',
                }));
                log('歌单拉取成功，共 ' + songs.length + ' 首歌');
                localStorage.setItem(CONFIG.SONG_STORAGE_KEY, JSON.stringify({
                    songs: songs,
                    timestamp: Date.now()
                }));
                return songs;
            } else {
                throw new Error('接口返回异常: ' + JSON.stringify(result));
            }
        } catch (error) {
            warn('主接口请求失败，尝试备用接口...', error);
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
                    log('备用接口拉取成功，共 ' + songs.length + ' 首歌');
                    localStorage.setItem(CONFIG.SONG_STORAGE_KEY, JSON.stringify({
                        songs: songs,
                        timestamp: Date.now()
                    }));
                    return songs;
                }
            } catch (_) {}

            // 所有接口失败，使用内置示例数据
            warn('所有接口失败，使用示例数据');
            return getFallbackSongs();
        }
    }

    function getFallbackSongs() {
        return [
            { id: '001', name: '歌单加载失败', artist: '请检查网络后刷新', cover: '' },
            { id: '002', name: '或稍后重试', artist: 'QQ音乐', cover: '' },
        ];
    }

    // ============================================================
    // 渲染歌单
    // ============================================================
    function renderSongs(songs) {
        if (!songs || songs.length === 0) {
            listEl.innerHTML = `
                <div class="qqmusic-empty">
                    <div style="font-size:32px;margin-bottom:8px;">🎵</div>
                    <span>歌单是空的，或者加载失败了</span>
                </div>
            `;
            countEl.textContent = '共 0 首歌';
            return;
        }

        filteredSongs = songs;
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

        // 绑定点击事件
        listEl.querySelectorAll('.qqmusic-item').forEach(el => {
            el.addEventListener('click', function(e) {
                const id = this.dataset.id;
                const name = decodeURIComponent(this.dataset.name || '');
                const artist = decodeURIComponent(this.dataset.artist || '');
                if (id) {
                    playSong(id, name, artist);
                }
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
        } catch (_) {
            return text;
        }
    }

    function filterSongs(keyword) {
        if (!keyword.trim()) {
            renderSongs(allSongs);
            return;
        }
        const kw = keyword.trim().toLowerCase();
        const filtered = allSongs.filter(s =>
            s.name.toLowerCase().includes(kw) ||
            s.artist.toLowerCase().includes(kw)
        );
        renderSongs(filtered);
    }

    // ============================================================
    // 播放歌曲
    // ============================================================
    function playSong(songId, songName, artist) {
        currentSong = { id: songId, name: songName, artist: artist };
        log('播放歌曲: ' + songName + ' - ' + artist);

        // 触发自定义事件，供梦角监听
        const event = new CustomEvent('qqmusic:play', {
            detail: { songId, songName, artist }
        });
        document.dispatchEvent(event);

        // 跳转到QQ音乐
        const webUrl = `https://y.qq.com/n/ryqq/songDetail/${songId}`;
        // 使用新窗口打开，手机端会自动唤起APP
        window.open(webUrl, '_blank');
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
        if (allSongs.length === 0) {
            loadSongs();
        }
    }

    function closePanel() {
        isPanelOpen = false;
        panel.style.display = 'none';
        mini.style.display = 'flex';
        collapseSearch();
        localStorage.setItem(CONFIG.STORAGE_KEY, 'closed');
    }

    function togglePanel() {
        if (isPanelOpen) {
            closePanel();
        } else {
            openPanel();
        }
    }

    // ============================================================
    // 搜索控制
    // ============================================================
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
        if (allSongs.length > 0) {
            renderSongs(allSongs);
        }
    }

    function toggleSearch() {
        if (isSearchExpanded) {
            collapseSearch();
        } else {
            expandSearch();
        }
    }

    // ============================================================
    // 加载歌单
    // ============================================================
    async function loadSongs() {
        listEl.innerHTML = `
            <div class="qqmusic-loading">
                <div class="qqmusic-spinner"></div>
                <span>加载歌单中...</span>
                <span style="font-size:11px;opacity:0.5;">请稍候</span>
            </div>
        `;

        try {
            allSongs = await fetchPlaylist();
            renderSongs(allSongs);
        } catch (error) {
            warn('加载失败:', error);
            listEl.innerHTML = `
                <div class="qqmusic-empty">
                    <div style="font-size:32px;margin-bottom:8px;">😢</div>
                    <span>歌单加载失败，请检查网络</span>
                    <span style="font-size:11px;opacity:0.5;cursor:pointer;margin-top:6px;display:inline-block;color:var(--accent-color);" onclick="window.QQMusicPlayer?.load()">点击重试</span>
                </div>
            `;
        }
    }

    // ============================================================
    // 状态恢复
    // ============================================================
    function restoreState() {
        const state = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (state === 'open') {
            setTimeout(() => {
                openPanel();
            }, 400);
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

        log('初始化...');

        // 默认隐藏整个容器（由开关控制）
        container.style.display = 'none';
        mini.style.display = 'flex';
        panel.style.display = 'none';
        searchInput.style.display = 'none';

        // --- 开关控制 ---
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (container.style.display === 'none') {
                    container.style.display = 'block';
                    // 恢复之前的状态
                    const state = localStorage.getItem(CONFIG.STORAGE_KEY);
                    if (state === 'open') {
                        openPanel();
                    } else {
                        mini.style.display = 'flex';
                        panel.style.display = 'none';
                    }
                    // 如果歌单未加载，预加载
                    if (allSongs.length === 0 && isPanelOpen) {
                        loadSongs();
                    }
                    this.classList.add('active');
                    log('面板已开启');
                } else {
                    container.style.display = 'none';
                    this.classList.remove('active');
                    log('面板已关闭');
                }
            });
        } else {
            warn('未找到 #qqmusic-toggle 开关元素');
        }

        // --- 迷你模式点击 ---
        if (mini) {
            mini.addEventListener('click', togglePanel);
        }

        // --- 关闭按钮 ---
        if (closeBtn) {
            closeBtn.addEventListener('click', closePanel);
        }

        // --- 搜索按钮 ---
        if (searchToggle) {
            searchToggle.addEventListener('click', toggleSearch);
        }

        // --- 搜索输入 ---
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                filterSongs(this.value);
            });
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    collapseSearch();
                }
            });
        }

        // --- 监听梦角事件 ---
        document.addEventListener('qqmusic:play', function(e) {
            const { songId, songName, artist } = e.detail;
            log('🎵 梦角感知到: ' + songName + ' - ' + artist);
            // 这里可以添加梦角回复逻辑
            // 例如：如果 window.dreamReply 存在，则调用
            if (typeof window.dreamReply === 'function') {
                const replies = [
                    `这首歌好温柔呀，我也在听呢 ✦`,
                    `《${songName}》是我最近也很喜欢的歌 🎵`,
                    `你分享的音乐，我都有好好听哦 💕`,
                    `这个旋律好美，和你一起听更美了 ✨`,
                ];
                const reply = replies[Math.floor(Math.random() * replies.length)];
                window.dreamReply(reply);
            }
        });

        // --- 恢复状态 ---
        restoreState();

        // --- 预加载歌单（如果之前是打开状态） ---
        if (isPanelOpen) {
            loadSongs();
        }

        log('初始化完成 ✅');
    }

    // ============================================================
    // 暴露全局接口
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

    // ============================================================
    // 自动初始化
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
