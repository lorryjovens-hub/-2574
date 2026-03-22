// Vercel Serverless API - 简化版
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

// 启用 CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// 数据源配置（硬编码，实际可从环境变量读取）
const DEFAULT_SOURCES = [
  { id: 1, name: '数据源1', url: 'https://json.heimuer.xyz', is_active: 1 },
  { id: 2, name: '数据源2', url: 'https://api.iku.cool', is_active: 0 }
];

let activeSource = DEFAULT_SOURCES[0];

// 响应包装函数
function jsonResponse(res, success, message, data = null) {
  res.json({ success, message, data });
}

// ========== 代理路由 ==========

// 主要代理接口 - 转发到第三方API
app.all('/api/proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing target URL parameter' });
    }

    const url = decodeURIComponent(targetUrl);
    
    console.log('Proxy request to:', url);
    
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': new URL(url).origin
      },
      timeout: 30000
    });

    const contentType = response.headers.get('content-type') || 'application/json';
    res.set('Content-Type', contentType);
    
    const data = await response.text();
    res.status(response.status).send(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy request failed', message: error.message });
  }
});

// M3U8 代理
app.get('/api/proxy/m3u8', async (req, res) => {
  const url = req.query.url;
  
  if (!url) {
    return res.status(400).send('缺少url参数');
  }
  
  try {
    const decodedUrl = decodeURIComponent(url);
    
    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': new URL(decodedUrl).origin
      },
      timeout: 30000
    });
    
    let content = await response.text();
    const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf('/') + 1);
    
    // 处理相对路径
    content = content.replace(/^(?!#)(?!http)(.+)$/gm, (match) => {
      if (match.trim() === '') return match;
      if (match.startsWith('/')) {
        const origin = new URL(decodedUrl).origin;
        return `${req.protocol}://${req.get('host')}/api/proxy/ts?url=${encodeURIComponent(origin + match)}`;
      }
      return `${req.protocol}://${req.get('host')}/api/proxy/ts?url=${encodeURIComponent(baseUrl + match)}`;
    });
    
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(content);
  } catch (error) {
    console.error('M3U8代理错误:', error);
    res.status(500).send('M3U8代理请求失败: ' + error.message);
  }
});

// TS 视频片段代理
app.get('/api/proxy/ts', async (req, res) => {
  const url = req.query.url;
  
  if (!url) {
    return res.status(400).send('缺少url参数');
  }
  
  try {
    const decodedUrl = decodeURIComponent(url);
    
    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': new URL(decodedUrl).origin
      },
      timeout: 30000
    });
    
    const buffer = await response.buffer();
    
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (error) {
    console.error('TS代理错误:', error);
    res.status(500).send('TS代理请求失败');
  }
});

// 图片代理
app.get('/api/proxy/image', async (req, res) => {
  const url = req.query.url;
  
  if (!url) {
    return res.status(400).send('缺少url参数');
  }
  
  try {
    const decodedUrl = decodeURIComponent(url);
    
    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': new URL(decodedUrl).origin
      },
      timeout: 30000
    });
    
    const buffer = await response.buffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (error) {
    console.error('图片代理错误:', error);
    res.status(500).send('图片代理请求失败');
  }
});

// ========== 数据源管理 ==========

// 获取数据源列表
app.get('/api/sources', (req, res) => {
  jsonResponse(res, true, '获取成功', DEFAULT_SOURCES);
});

// 获取当前数据源
app.get('/api/sources/active', (req, res) => {
  jsonResponse(res, true, '获取成功', activeSource);
});

// 切换数据源
app.post('/api/sources/active', (req, res) => {
  const { id } = req.body;
  const source = DEFAULT_SOURCES.find(s => s.id === id);
  if (source) {
    activeSource = source;
    jsonResponse(res, true, '切换成功', activeSource);
  } else {
    jsonResponse(res, false, '数据源不存在');
  }
});

// ========== 网站配置 ==========

app.get('/api/config', (req, res) => {
  jsonResponse(res, true, '获取成功', {
    site_name: '影视爆米花',
    site_keywords: '影视,电影,电视剧,综艺,动漫,在线观看',
    site_description: '影视爆米花 - 免费在线观看最新电影、电视剧、综艺、动漫',
    company_name: '',
    icp_number: '',
    logo_url: '',
    footer_text: '本站资源来自互联网，仅供学习交流使用',
    about_us: '',
    services: '',
    contact_us: ''
  });
});

// ========== 测试接口 ==========

app.get('/api/test', (req, res) => {
  jsonResponse(res, true, 'API 运行正常!', {
    service: 'Movie Popcorn API',
    version: '1.0.0',
    platform: 'Vercel',
    timestamp: new Date().toISOString()
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// Vercel export
module.exports = app;
