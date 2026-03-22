const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

app.get('/api/proxy', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) {
            return res.status(400).json({ error: '缺少url参数' });
        }
        
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        
        const decodedUrl = decodeURIComponent(url);
        console.log('代理请求:', decodedUrl);
        
        const response = await fetch(decodedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Referer': decodedUrl.substring(0, decodedUrl.indexOf('/', 8))
            },
            timeout: 15000
        });
        
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            res.json(data);
        } else {
            const text = await response.text();
            try {
                const data = JSON.parse(text);
                res.json(data);
            } catch (e) {
                res.send(text);
            }
        }
    } catch (error) {
        console.error('代理错误:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`影视网站服务已启动:`);
    console.log(`- 网站地址: http://localhost:${PORT}`);
    console.log(`- 代理接口: http://localhost:${PORT}/api/proxy?url=xxx`);
});
