const API = {
    proxyUrl: '',
    userApiUrl: '/api/user.php',
    _sources: null,
    _activeSource: null,
    
    async init() {
        try {
            await this.loadSources();
        } catch (error) {
            console.error('初始化数据源失败:', error);
        }
    },
    
    async loadSources() {
        try {
            const response = await fetch(`${this.proxyUrl}/api/sources`);
            const result = await response.json();
            if (result.success) {
                this._sources = result.data;
                const activeSource = result.data.find(s => s.is_active);
                this._activeSource = activeSource || result.data[0];
            }
        } catch (error) {
            console.error('加载数据源失败:', error);
            this._sources = [];
        }
    },
    
    getSources() {
        return this._sources || [];
    },
    
    getActiveSource() {
        return this._activeSource;
    },
    
    async setActiveSource(sourceId) {
        try {
            const response = await fetch(`${this.proxyUrl}/api/sources/active`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: sourceId })
            });
            const result = await response.json();
            if (result.success) {
                this._activeSource = result.data;
                await this.loadSources();
            }
            return result;
        } catch (error) {
            return { success: false, message: '切换失败: ' + error.message };
        }
    },
    
    normalizeUrl(baseUrl) {
        if (!baseUrl) return '';
        let url = baseUrl.trim();
        url = url.replace(/\/$/, '');
        // Remove any existing API path
        if (url.includes('/api.php')) {
            url = url.replace(/\/api\.php.*$/, '');
        }
        return url;
    },
    
    buildApiUrl(baseUrl, params) {
        let url = this.normalizeUrl(baseUrl);
        const queryStr = new URLSearchParams(params).toString();
        return `${url}/api.php/provide/vod/?${queryStr}`;
    },
    
    async fetchAPI(params) {
        if (!this._activeSource) {
            await this.loadSources();
        }
        
        if (!this._activeSource) {
            throw new Error('没有可用的数据源，请先在后台添加数据源');
        }
        
        const targetUrl = this.buildApiUrl(this._activeSource.url, params);
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
        
        console.log('请求API:', targetUrl);
        
        try {
            const response = await fetch(proxyUrl, {
                timeout: 20000
            });
            
            if (!response.ok) {
                throw new Error(`HTTP错误: ${response.status}`);
            }
            
            const text = await response.text();
            let data;
            
            try {
                data = JSON.parse(text);
            } catch (e) {
                if (text.includes('Cloudflare') || text.includes('challenge-platform')) {
                    throw new Error('数据源被Cloudflare保护，请更换其他数据源');
                }
                if (text.includes('<?xml')) {
                    throw new Error('数据源返回XML格式，请使用JSON格式接口');
                }
                console.error('返回内容:', text.substring(0, 500));
                throw new Error('数据源返回格式错误');
            }
            
            if (data.code !== undefined && data.code !== 1 && data.code !== 0) {
                console.warn('API返回非成功状态:', data);
            }
            
            return data;
        } catch (error) {
            console.error('API请求失败:', error);
            throw error;
        }
    },
    
    async getVideoList(page = 1, typeId = null, keyword = null) {
        const params = { ac: 'list', pg: page };
        
        if (typeId) {
            params.t = typeId;
        }
        
        if (keyword && keyword.trim()) {
            params.wd = keyword.trim();
        }
        
        const data = await this.fetchAPI(params);
        
        if (data.class && data.class.length > 0 && this._activeSource) {
            await this.cacheCategories(data.class);
        }
        
        return data;
    },
    
    async getVideoDetail(videoId) {
        const params = { ac: 'detail', ids: videoId };
        return await this.fetchAPI(params);
    },
    
    async getCategories() {
        try {
            const response = await fetch(`${this.proxyUrl}/api/categories`);
            const result = await response.json();
            
            if (result.success && result.data && result.data.length > 0) {
                return result.data.map(cat => ({
                    type_id: cat.type_id,
                    type_name: cat.type_name
                }));
            }
        } catch (error) {
            console.error('获取缓存分类失败:', error);
        }
        
        try {
            const data = await this.getVideoList(1);
            const categories = data.class || [];
            
            if (categories.length > 0 && this._activeSource) {
                await this.cacheCategories(categories);
            }
            
            return categories;
        } catch (error) {
            console.error('获取分类失败:', error);
            return [];
        }
    },
    
    async cacheCategories(categories) {
        if (!this._activeSource || !categories.length) return;
        
        try {
            await fetch(`${this.proxyUrl}/api/categories/cache`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_id: this._activeSource.id,
                    categories: categories
                })
            });
        } catch (error) {
            console.error('缓存分类失败:', error);
        }
    },
    
    parsePlayUrl(playFrom, playUrl) {
        if (!playUrl) return [];
        
        const fromNames = playFrom ? playFrom.split('$$$') : ['默认'];
        const urlParts = playUrl.split('$$$');
        
        const sources = [];
        
        for (let i = 0; i < urlParts.length; i++) {
            const urlPart = urlParts[i];
            const episodes = [];
            
            if (urlPart) {
                const episodeList = urlPart.split('#');
                for (const ep of episodeList) {
                    if (ep) {
                        const parts = ep.split('$');
                        if (parts.length >= 2) {
                            episodes.push({
                                name: parts[0],
                                url: parts[1]
                            });
                        } else if (parts.length === 1 && parts[0].includes('http')) {
                            episodes.push({
                                name: `第${episodes.length + 1}集`,
                                url: parts[0]
                            });
                        }
                    }
                }
            }
            
            if (episodes.length > 0) {
                const sourceName = fromNames[i] || `播放源${i + 1}`;
                const isM3u8 = sourceName.toLowerCase().includes('m3u8') || 
                               episodes.some(ep => ep.url.includes('.m3u8'));
                
                sources.push({
                    name: sourceName,
                    episodes: episodes,
                    isM3u8: isM3u8
                });
            }
        }
        
        sources.sort((a, b) => {
            if (a.isM3u8 && !b.isM3u8) return -1;
            if (!a.isM3u8 && b.isM3u8) return 1;
            return 0;
        });
        
        return sources;
    },
    
    getProxyImageUrl(url) {
        if (!url) return '';
        if (url.startsWith('data:')) return url;
        return `/api/proxy/image?url=${encodeURIComponent(url)}`;
    },
    
    getProxyM3u8Url(url) {
        if (!url) return '';
        return `/api/proxy/m3u8?url=${encodeURIComponent(url)}`;
    }
};

API.init();

window.API = API;
