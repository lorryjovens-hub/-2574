const CONFIG = {
    PROXY_URL: '/api/proxy',
    DEFAULT_SOURCES: [
        { id: 1, name: '资源站1', url: 'https://api.apibdzy.com/api.php/provide/vod/', active: true }
    ],
    STORAGE_KEYS: {
        SOURCES: 'dianying_sources',
        CURRENT_SOURCE: 'dianying_current_source',
        POSTER_CACHE: 'dianying_poster_cache'
    }
};

const Storage = {
    get(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Storage get error:', e);
            return null;
        }
    },
    
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('Storage set error:', e);
            return false;
        }
    },
    
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            return false;
        }
    }
};

const SourceManager = {
    getSources() {
        const sources = Storage.get(CONFIG.STORAGE_KEYS.SOURCES);
        if (!sources || sources.length === 0) {
            Storage.set(CONFIG.STORAGE_KEYS.SOURCES, CONFIG.DEFAULT_SOURCES);
            return CONFIG.DEFAULT_SOURCES;
        }
        return sources;
    },
    
    saveSources(sources) {
        return Storage.set(CONFIG.STORAGE_KEYS.SOURCES, sources);
    },
    
    getCurrentSource() {
        const sources = this.getSources();
        const currentId = Storage.get(CONFIG.STORAGE_KEYS.CURRENT_SOURCE);
        if (currentId) {
            const source = sources.find(s => s.id === currentId);
            if (source) return source;
        }
        return sources.find(s => s.active) || sources[0];
    },
    
    setCurrentSource(sourceId) {
        Storage.set(CONFIG.STORAGE_KEYS.CURRENT_SOURCE, sourceId);
    },
    
    addSource(name, url) {
        const sources = this.getSources();
        const maxId = sources.reduce((max, s) => Math.max(max, s.id), 0);
        const newSource = {
            id: maxId + 1,
            name: name,
            url: url,
            active: false
        };
        sources.push(newSource);
        this.saveSources(sources);
        return newSource;
    },
    
    updateSource(id, name, url) {
        const sources = this.getSources();
        const index = sources.findIndex(s => s.id === id);
        if (index !== -1) {
            sources[index].name = name;
            sources[index].url = url;
            this.saveSources(sources);
            return true;
        }
        return false;
    },
    
    deleteSource(id) {
        let sources = this.getSources();
        if (sources.length <= 1) {
            return false;
        }
        sources = sources.filter(s => s.id !== id);
        this.saveSources(sources);
        return true;
    }
};

const Api = {
    async request(url, params = {}) {
        params._t = Date.now();
        const queryString = new URLSearchParams(params).toString();
        const fullUrl = queryString ? `${url}?${queryString}` : url;
        const proxyUrl = `${CONFIG.PROXY_URL}?url=${encodeURIComponent(fullUrl)}`;
        
        try {
            const response = await fetch(proxyUrl, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    },
    
    async getVideoList(source, params = {}) {
        const defaultParams = { ac: 'list' };
        return this.request(source.url, { ...defaultParams, ...params });
    },
    
    async getVideoDetail(source, videoId) {
        return this.request(source.url, { ac: 'detail', ids: videoId });
    },
    
    async searchVideos(source, keyword) {
        return this.request(source.url, { ac: 'list', wd: keyword });
    },
    
    async getVideosByCategory(source, categoryId, page = 1) {
        return this.request(source.url, { ac: 'list', t: categoryId, pg: page });
    }
};

const VideoParser = {
    parseEpisodes(playUrl) {
        if (!playUrl) return [];
        
        const episodes = [];
        const parts = playUrl.split('#');
        
        for (const part of parts) {
            if (!part.trim()) continue;
            const [name, url] = part.split('$');
            if (name && url) {
                episodes.push({
                    name: name.trim(),
                    url: url.trim()
                });
            }
        }
        
        return episodes;
    },
    
    parsePlaySources(playFrom, playUrl) {
        if (!playFrom || !playUrl) return [];
        
        const fromNames = playFrom.split('$$$');
        const urlParts = playUrl.split('$$$');
        
        const sources = [];
        
        for (let i = 0; i < urlParts.length; i++) {
            const episodes = this.parseEpisodes(urlParts[i]);
            if (episodes.length > 0) {
                sources.push({
                    name: fromNames[i] || `播放源${i + 1}`,
                    episodes: episodes,
                    isM3u8: this.isM3u8Source(fromNames[i] || '', episodes)
                });
            }
        }
        
        return sources;
    },
    
    isM3u8Source(name, episodes) {
        const nameHasM3u8 = name.toLowerCase().includes('m3u8');
        const urlHasM3u8 = episodes.some(ep => ep.url.includes('.m3u8'));
        return nameHasM3u8 || urlHasM3u8;
    },
    
    filterM3u8Sources(sources) {
        const m3u8Sources = sources.filter(s => s.isM3u8);
        return m3u8Sources.length > 0 ? m3u8Sources : sources;
    },
    
    sortSourcesByM3u8(sources) {
        return sources.sort((a, b) => {
            if (a.isM3u8 && !b.isM3u8) return -1;
            if (!a.isM3u8 && b.isM3u8) return 1;
            return 0;
        });
    }
};

const PosterCache = {
    get(videoId) {
        const cache = Storage.get(CONFIG.STORAGE_KEYS.POSTER_CACHE) || {};
        return cache[videoId];
    },
    
    set(videoId, posterUrl) {
        const cache = Storage.get(CONFIG.STORAGE_KEYS.POSTER_CACHE) || {};
        cache[videoId] = posterUrl;
        Storage.set(CONFIG.STORAGE_KEYS.POSTER_CACHE, cache);
    },
    
    async fetchAndCache(videoId, source) {
        const cached = this.get(videoId);
        if (cached) return cached;
        
        try {
            const data = await Api.getVideoDetail(source, videoId);
            if (data.list && data.list[0] && data.list[0].vod_pic) {
                const posterUrl = data.list[0].vod_pic;
                this.set(videoId, posterUrl);
                return posterUrl;
            }
        } catch (e) {
            console.error('Fetch poster error:', e);
        }
        return null;
    }
};

const UI = {
    showLoading(container) {
        container.innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                <p>加载中...</p>
            </div>
        `;
    },
    
    showEmpty(container, message = '暂无数据') {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📭</div>
                <h3>${message}</h3>
            </div>
        `;
    },
    
    showError(container, message = '加载失败') {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">😢</div>
                <h3>${message}</h3>
                <p>请检查数据源配置或网络连接</p>
            </div>
        `;
    },
    
    showToast(message, type = 'info') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    },
    
    renderVideoCard(video) {
        return `
            <div class="video-card" onclick="goToDetail(${video.vod_id})" data-id="${video.vod_id}">
                <div class="video-poster">
                    <div class="placeholder" id="poster-${video.vod_id}">🎬</div>
                </div>
                ${video.vod_remarks ? `<span class="video-remarks">${video.vod_remarks}</span>` : ''}
                <div class="video-info">
                    <div class="video-name">${video.vod_name}</div>
                    <div class="video-meta">
                        <span>${video.type_name || ''}</span>
                    </div>
                </div>
            </div>
        `;
    },
    
    async loadPosterAsync(videoId, source) {
        const posterUrl = await PosterCache.fetchAndCache(videoId, source);
        const posterEl = document.getElementById(`poster-${videoId}`);
        if (posterEl && posterUrl) {
            posterEl.innerHTML = `<img src="${posterUrl}" alt="海报" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'placeholder\\'>🎬</div>'">`;
        }
    },
    
    renderPagination(currentPage, totalPages, total) {
        const container = document.getElementById('pagination');
        if (!container || totalPages <= 1) {
            if (container) container.innerHTML = '';
            return;
        }
        
        container.innerHTML = `
            <button onclick="changePage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
            <div class="page-jump">
                <span class="page-info">第 ${currentPage}/${totalPages} 页</span>
                <input type="number" min="1" max="${totalPages}" value="${currentPage}" 
                       onkeypress="if(event.key==='Enter') jumpToPage(this.value, ${totalPages})">
                <button onclick="jumpToPage(document.querySelector('.page-jump input').value, ${totalPages})">跳转</button>
            </div>
            <button onclick="changePage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
        `;
    }
};

function goToDetail(videoId) {
    window.location.href = `detail.html?id=${videoId}`;
}

function goToPlayer(videoId, episodeIndex, sourceIndex = 0) {
    window.location.href = `player.html?id=${videoId}&ep=${episodeIndex}&source=${sourceIndex}`;
}

function changePage(page) {
    if (page < 1) return;
    const url = new URL(window.location);
    url.searchParams.set('page', page);
    window.location.href = url.toString();
}

function jumpToPage(page, maxPage) {
    const p = parseInt(page);
    if (p >= 1 && p <= maxPage) {
        changePage(p);
    }
}

function getUrlParam(name) {
    const url = new URL(window.location);
    return url.searchParams.get(name);
}

function formatUrl(base, path) {
    if (!base) return '';
    if (path.startsWith('http')) return path;
    const baseUrl = base.endsWith('/') ? base : base + '/';
    return baseUrl + path;
}

document.addEventListener('DOMContentLoaded', function() {
    const sourceSelector = document.getElementById('sourceSelector');
    if (sourceSelector) {
        const sources = SourceManager.getSources();
        const currentSource = SourceManager.getCurrentSource();
        
        sourceSelector.innerHTML = sources.map(s => 
            `<option value="${s.id}" ${s.id === currentSource.id ? 'selected' : ''}>${s.name}</option>`
        ).join('');
        
        sourceSelector.addEventListener('change', function() {
            SourceManager.setCurrentSource(parseInt(this.value));
            if (typeof reloadAll === 'function') {
                reloadAll();
            } else if (typeof loadVideos === 'function') {
                loadCategories();
                loadVideos();
            } else {
                window.location.reload();
            }
        });
    }
});
