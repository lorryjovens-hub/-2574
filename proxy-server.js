const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3001;

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'users.db'));

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        avatar TEXT DEFAULT '',
        nickname TEXT,
        bio TEXT DEFAULT '',
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
    )
`);

// Add missing columns if they don't exist
try {
    db.exec(`ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''`);
} catch (e) {}

try {
    db.exec(`ALTER TABLE users ADD COLUMN nickname TEXT`);
} catch (e) {}

try {
    db.exec(`ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''`);
} catch (e) {}

// Add role column if it doesn't exist
try {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`);
} catch (e) {
    // Column already exists
}

db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        video_id TEXT NOT NULL,
        video_name TEXT,
        video_pic TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, video_id)
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        video_id TEXT NOT NULL,
        video_name TEXT,
        video_pic TEXT,
        episode_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS site_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        site_name TEXT DEFAULT '影视爆米花',
        site_keywords TEXT DEFAULT '影视,电影,电视剧,综艺,动漫,在线观看',
        site_description TEXT DEFAULT '影视爆米花 - 免费在线观看最新电影、电视剧、综艺、动漫',
        company_name TEXT DEFAULT '',
        icp_number TEXT DEFAULT '',
        logo_url TEXT DEFAULT '',
        footer_text TEXT DEFAULT '本站资源来自互联网，仅供学习交流使用',
        about_us TEXT DEFAULT '',
        services TEXT DEFAULT '',
        contact_us TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

const configExists = db.prepare('SELECT COUNT(*) as count FROM site_config').get();
if (configExists.count === 0) {
    db.exec(`INSERT INTO site_config (id) VALUES (1)`);
}

db.exec(`
    CREATE TABLE IF NOT EXISTS data_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        is_active INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS feedbacks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        contact TEXT,
        type TEXT DEFAULT 'suggestion',
        content TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        reply TEXT,
        replied_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        replied_at DATETIME
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS category_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL,
        type_id INTEGER NOT NULL,
        type_name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_id, type_id)
    )
`);

const defaultSources = [
    { name: '闪电资源', url: 'http://sdzyapi.com', sort_order: 1 },
    { name: '百度云资源', url: 'https://api.apibdzy.com', sort_order: 2 },
    { name: '麒麟资源', url: 'https://www.qilinzyz.com', sort_order: 3 },
    { name: '番茄资源', url: 'http://api.fqzy.cc', sort_order: 4 },
    { name: '无尽资源', url: 'https://api.wujinapi.com', sort_order: 5 },
    { name: 'U酷资源', url: 'https://api.ukuapi.com', sort_order: 6 }
];

const sourceCount = db.prepare('SELECT COUNT(*) as count FROM data_sources').get();
if (sourceCount.count === 0) {
    const insertSource = db.prepare('INSERT INTO data_sources (name, url, is_active, sort_order) VALUES (?, ?, ?, ?)');
    defaultSources.forEach((source, index) => {
        insertSource.run(source.name, source.url, index === 0 ? 1 : 0, source.sort_order);
    });
    console.log('已初始化默认数据源');
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(session({
    secret: 'popcorn-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function jsonResponse(res, success, message, data = null) {
    res.json({ success, message, data });
}

function generateToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function getAdminByToken(token) {
    if (!token) return null;
    const session = db.prepare(`
        SELECT u.* FROM admin_sessions s 
        JOIN users u ON s.user_id = u.id 
        WHERE s.token = ? AND s.expires_at > datetime('now') AND u.role = 'admin'
    `).get(token);
    return session;
}

function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const admin = getAdminByToken(token);
    if (!admin) {
        return jsonResponse(res, false, '请先登录管理员账号');
    }
    req.admin = admin;
    next();
}

app.get('/api/config', (req, res) => {
    try {
        const config = db.prepare('SELECT * FROM site_config WHERE id = 1').get();
        jsonResponse(res, true, '获取成功', config);
    } catch (error) {
        jsonResponse(res, false, '获取配置失败: ' + error.message);
    }
});

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return jsonResponse(res, false, '用户名和密码不能为空');
    }
    
    try {
        const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ? AND role = ?').get(username, password, 'admin');
        
        if (user) {
            const token = generateToken();
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            
            db.prepare('INSERT INTO admin_sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);
            
            db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
            
            jsonResponse(res, true, '登录成功', {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                }
            });
        } else {
            jsonResponse(res, false, '用户名或密码错误，或非管理员账号');
        }
    } catch (error) {
        jsonResponse(res, false, '登录失败: ' + error.message);
    }
});

app.post('/api/admin/logout', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
        db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
    }
    jsonResponse(res, true, '已退出登录');
});

app.get('/api/admin/check', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const admin = getAdminByToken(token);
    if (admin) {
        jsonResponse(res, true, '已登录', { id: admin.id, username: admin.username });
    } else {
        jsonResponse(res, false, '未登录');
    }
});

app.post('/api/admin/config', authMiddleware, (req, res) => {
    const {
        site_name, site_keywords, site_description, company_name,
        icp_number, logo_url, footer_text, about_us, services, contact_us
    } = req.body;
    
    try {
        db.prepare(`
            UPDATE site_config SET 
                site_name = ?, site_keywords = ?, site_description = ?,
                company_name = ?, icp_number = ?, logo_url = ?,
                footer_text = ?, about_us = ?, services = ?, contact_us = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `).run(
            site_name, site_keywords, site_description,
            company_name, icp_number, logo_url,
            footer_text, about_us, services, contact_us
        );
        
        const config = db.prepare('SELECT * FROM site_config WHERE id = 1').get();
        jsonResponse(res, true, '配置已保存', config);
    } catch (error) {
        jsonResponse(res, false, '保存失败: ' + error.message);
    }
});

app.get('/api/sources', (req, res) => {
    try {
        const sources = db.prepare('SELECT * FROM data_sources ORDER BY sort_order, id').all();
        jsonResponse(res, true, '获取成功', sources);
    } catch (error) {
        jsonResponse(res, false, '获取失败：' + error.message);
    }
});

app.post('/api/sources', (req, res) => {
    const { name, url, is_active } = req.body;
    
    if (!name || !url) {
        return jsonResponse(res, false, '名称和地址不能为空');
    }
    
    try {
        const result = db.prepare('INSERT INTO data_sources (name, url, is_active) VALUES (?, ?, ?)').run(name, url, is_active ? 1 : 0);
        const source = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(result.lastInsertRowid);
        jsonResponse(res, true, '添加成功', source);
    } catch (error) {
        jsonResponse(res, false, '添加失败：' + error.message);
    }
});

app.put('/api/sources/:id', (req, res) => {
    const { id } = req.params;
    const { name, url, is_active, sort_order } = req.body;
    
    try {
        db.prepare('UPDATE data_sources SET name = ?, url = ?, is_active = ?, sort_order = ? WHERE id = ?').run(name, url, is_active ? 1 : 0, sort_order || 0, id);
        const source = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(id);
        jsonResponse(res, true, '更新成功', source);
    } catch (error) {
        jsonResponse(res, false, '更新失败：' + error.message);
    }
});

app.delete('/api/sources/:id', (req, res) => {
    const { id } = req.params;
    
    try {
        db.prepare('DELETE FROM data_sources WHERE id = ?').run(id);
        jsonResponse(res, true, '删除成功');
    } catch (error) {
        jsonResponse(res, false, '删除失败：' + error.message);
    }
});

app.get('/api/sources', (req, res) => {
    try {
        const sources = db.prepare('SELECT id, name, url, is_active FROM data_sources ORDER BY sort_order, id').all();
        jsonResponse(res, true, '获取成功', sources);
    } catch (error) {
        jsonResponse(res, false, '获取失败: ' + error.message);
    }
});

app.post('/api/sources/active', (req, res) => {
    const { id } = req.body;
    
    try {
        db.prepare('UPDATE data_sources SET is_active = 0').run();
        db.prepare('UPDATE data_sources SET is_active = 1 WHERE id = ?').run(id);
        
        db.prepare('DELETE FROM category_cache WHERE source_id != ?').run(id);
        
        const source = db.prepare('SELECT id, name, url, is_active FROM data_sources WHERE id = ?').get(id);
        jsonResponse(res, true, '切换成功', source);
    } catch (error) {
        jsonResponse(res, false, '切换失败: ' + error.message);
    }
});

app.get('/api/sources/active', (req, res) => {
    try {
        const source = db.prepare('SELECT id, name, url, is_active FROM data_sources WHERE is_active = 1').get();
        if (source) {
            jsonResponse(res, true, '获取成功', source);
        } else {
            const firstSource = db.prepare('SELECT id, name, url, is_active FROM data_sources ORDER BY sort_order, id LIMIT 1').get();
            if (firstSource) {
                db.prepare('UPDATE data_sources SET is_active = 1 WHERE id = ?').run(firstSource.id);
                jsonResponse(res, true, '获取成功', firstSource);
            } else {
                jsonResponse(res, false, '没有可用的数据源');
            }
        }
    } catch (error) {
        jsonResponse(res, false, '获取失败: ' + error.message);
    }
});

app.get('/api/categories', (req, res) => {
    try {
        const source = db.prepare('SELECT id FROM data_sources WHERE is_active = 1').get();
        if (!source) {
            return jsonResponse(res, false, '没有可用的数据源');
        }
        
        const categories = db.prepare('SELECT type_id, type_name FROM category_cache WHERE source_id = ? ORDER BY sort_order, type_id').all(source.id);
        jsonResponse(res, true, '获取成功', categories);
    } catch (error) {
        jsonResponse(res, false, '获取失败: ' + error.message);
    }
});

app.post('/api/categories/cache', (req, res) => {
    const { source_id, categories } = req.body;
    
    try {
        const deleteStmt = db.prepare('DELETE FROM category_cache WHERE source_id = ?');
        deleteStmt.run(source_id);
        
        const insertStmt = db.prepare('INSERT INTO category_cache (source_id, type_id, type_name, sort_order) VALUES (?, ?, ?, ?)');
        categories.forEach((cat, index) => {
            insertStmt.run(source_id, cat.type_id, cat.type_name, index);
        });
        
        jsonResponse(res, true, '缓存成功');
    } catch (error) {
        jsonResponse(res, false, '缓存失败: ' + error.message);
    }
});

app.post('/api/admin/create-admin', (req, res) => {
    const { username, password, email, secret_key } = req.body;
    
    const ADMIN_SECRET = 'popcorn2024admin';
    
    if (secret_key !== ADMIN_SECRET) {
        return jsonResponse(res, false, '密钥错误');
    }
    
    if (!username || !password) {
        return jsonResponse(res, false, '用户名和密码不能为空');
    }
    
    try {
        const result = db.prepare('INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)').run(username, password, email || null, 'admin');
        jsonResponse(res, true, '管理员账号创建成功', { id: result.lastInsertRowid, username });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            jsonResponse(res, false, '用户名已存在');
        } else {
            jsonResponse(res, false, '创建失败: ' + error.message);
        }
    }
});

app.all('/api/user.php', (req, res) => {
    const { username, password, email, video_id, video_name, video_pic, episode_name, nickname, bio, avatar } = { ...req.body, ...req.query };
    const action = req.body.action || req.query.action;
    
    switch (action) {
        case 'register':
            handleRegister(req, res, username, password, email);
            break;
        case 'login':
            handleLogin(req, res, username, password);
            break;
        case 'logout':
            handleLogout(req, res);
            break;
        case 'check_login':
        case 'check':
            handleCheckLogin(req, res);
            break;
        case 'add_favorite':
        case 'favorites':
            if (req.method === 'GET') {
                handleGetFavorites(req, res);
            } else if (req.method === 'DELETE') {
                handleRemoveFavorite(req, res, video_id);
            } else {
                handleAddFavorite(req, res, video_id, video_name, video_pic);
            }
            break;
        case 'remove_favorite':
            handleRemoveFavorite(req, res, video_id);
            break;
        case 'get_favorites':
            handleGetFavorites(req, res);
            break;
        case 'check_favorite':
            handleCheckFavorite(req, res, video_id);
            break;
        case 'add_history':
            handleAddHistory(req, res, video_id, video_name, video_pic, episode_name);
            break;
        case 'get_history':
        case 'history':
            if (req.method === 'GET') {
                handleGetHistory(req, res);
            } else {
                handleAddHistory(req, res, video_id, video_name, video_pic, episode_name);
            }
            break;
        case 'clear_history':
            handleClearHistory(req, res);
            break;
        case 'get_profile':
            handleGetProfile(req, res);
            break;
        case 'update_profile':
            handleUpdateProfile(req, res, nickname, bio, avatar);
            break;
        default:
            jsonResponse(res, false, '无效的操作');
    }
});

function handleRegister(req, res, username, password, email) {
    if (!username || !password) {
        return jsonResponse(res, false, '用户名和密码不能为空');
    }
    
    if (username.length < 3 || username.length > 20) {
        return jsonResponse(res, false, '用户名长度必须在3-20个字符之间');
    }
    
    if (password.length < 6) {
        return jsonResponse(res, false, '密码长度不能少于6个字符');
    }
    
    try {
        const stmt = db.prepare('INSERT INTO users (username, password, email) VALUES (?, ?, ?)');
        stmt.run(username, password, email || null);
        
        const user = db.prepare('SELECT id, username, email, created_at FROM users WHERE username = ?').get(username);
        
        jsonResponse(res, true, '注册成功', user);
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            jsonResponse(res, false, '用户名已存在');
        } else {
            jsonResponse(res, false, '注册失败: ' + error.message);
        }
    }
}

function handleLogin(req, res, username, password) {
    if (!username || !password) {
        return jsonResponse(res, false, '用户名和密码不能为空');
    }
    
    try {
        const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
        
        if (user) {
            db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
            
            req.session.userId = user.id;
            req.session.username = user.username;
            
            jsonResponse(res, true, '登录成功', {
                id: user.id,
                username: user.username,
                email: user.email,
                nickname: user.nickname,
                avatar: user.avatar
            });
        } else {
            jsonResponse(res, false, '用户名或密码错误');
        }
    } catch (error) {
        jsonResponse(res, false, '登录失败：' + error.message);
    }
}

function handleLogout(req, res) {
    req.session = null;
    jsonResponse(res, true, '已退出登录');
}

function handleCheckLogin(req, res) {
    if (req.session && req.session.userId) {
        const user = db.prepare('SELECT id, username, email, nickname, avatar FROM users WHERE id = ?').get(req.session.userId);
        if (user) {
            return jsonResponse(res, true, '已登录', user);
        }
    }
    jsonResponse(res, false, '未登录');
}

function handleAddFavorite(req, res, video_id, video_name, video_pic) {
    if (!req.session || !req.session.userId) {
        return jsonResponse(res, false, '请先登录');
    }
    
    if (!video_id) {
        return jsonResponse(res, false, '视频ID不能为空');
    }
    
    try {
        const stmt = db.prepare('INSERT OR IGNORE INTO favorites (user_id, video_id, video_name, video_pic) VALUES (?, ?, ?, ?)');
        stmt.run(req.session.userId, video_id, video_name || '', video_pic || '');
        
        jsonResponse(res, true, '收藏成功');
    } catch (error) {
        jsonResponse(res, false, '收藏失败: ' + error.message);
    }
}

function handleRemoveFavorite(req, res, video_id) {
    if (!req.session || !req.session.userId) {
        return jsonResponse(res, false, '请先登录');
    }
    
    try {
        const stmt = db.prepare('DELETE FROM favorites WHERE user_id = ? AND video_id = ?');
        stmt.run(req.session.userId, video_id);
        
        jsonResponse(res, true, '已取消收藏');
    } catch (error) {
        jsonResponse(res, false, '操作失败: ' + error.message);
    }
}

function handleGetFavorites(req, res) {
    if (!req.session || !req.session.userId) {
        return jsonResponse(res, false, '请先登录');
    }
    
    try {
        const favorites = db.prepare('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(req.session.userId);
        jsonResponse(res, true, '获取成功', favorites);
    } catch (error) {
        jsonResponse(res, false, '获取失败: ' + error.message);
    }
}

function handleCheckFavorite(req, res, video_id) {
    if (!req.session || !req.session.userId) {
        return jsonResponse(res, false, '请先登录');
    }
    
    try {
        const favorite = db.prepare('SELECT * FROM favorites WHERE user_id = ? AND video_id = ?').get(req.session.userId, video_id);
        jsonResponse(res, true, favorite ? '已收藏' : '未收藏', { isFavorite: !!favorite });
    } catch (error) {
        jsonResponse(res, false, '查询失败: ' + error.message);
    }
}

function handleAddHistory(req, res, video_id, video_name, video_pic, episode_name) {
    if (!req.session || !req.session.userId) {
        return jsonResponse(res, false, '请先登录');
    }
    
    if (!video_id) {
        return jsonResponse(res, false, '视频ID不能为空');
    }
    
    try {
        db.prepare('DELETE FROM history WHERE user_id = ? AND video_id = ?').run(req.session.userId, video_id);
        
        const stmt = db.prepare('INSERT INTO history (user_id, video_id, video_name, video_pic, episode_name) VALUES (?, ?, ?, ?, ?)');
        stmt.run(req.session.userId, video_id, video_name || '', video_pic || '', episode_name || '');
        
        jsonResponse(res, true, '记录成功');
    } catch (error) {
        jsonResponse(res, false, '记录失败: ' + error.message);
    }
}

function handleGetHistory(req, res) {
    if (!req.session || !req.session.userId) {
        return jsonResponse(res, false, '请先登录');
    }
    
    try {
        const history = db.prepare('SELECT * FROM history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.session.userId);
        jsonResponse(res, true, '获取成功', history);
    } catch (error) {
        jsonResponse(res, false, '获取失败: ' + error.message);
    }
}

function handleClearHistory(req, res) {
    if (!req.session || !req.session.userId) {
        return jsonResponse(res, false, '请先登录');
    }
    
    try {
        db.prepare('DELETE FROM history WHERE user_id = ?').run(req.session.userId);
        jsonResponse(res, true, '历史记录已清空');
    } catch (error) {
        jsonResponse(res, false, '清空失败: ' + error.message);
    }
}

function handleGetProfile(req, res) {
    if (!req.session || !req.session.userId) {
        return jsonResponse(res, false, '请先登录');
    }
    
    try {
        const user = db.prepare('SELECT id, username, email, nickname, avatar, bio, created_at, last_login FROM users WHERE id = ?').get(req.session.userId);
        jsonResponse(res, true, '获取成功', user);
    } catch (error) {
        jsonResponse(res, false, '获取失败: ' + error.message);
    }
}

function handleUpdateProfile(req, res, nickname, bio, avatar) {
    if (!req.session || !req.session.userId) {
        return jsonResponse(res, false, '请先登录');
    }
    
    try {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
        const newNickname = nickname !== undefined ? nickname : user.nickname;
        const newBio = bio !== undefined ? bio : user.bio;
        const newAvatar = avatar !== undefined && avatar !== '' ? avatar : user.avatar;
        
        db.prepare('UPDATE users SET nickname = ?, bio = ?, avatar = ? WHERE id = ?').run(newNickname || '', newBio || '', newAvatar || '', req.session.userId);
        
        const updatedUser = db.prepare('SELECT id, username, email, nickname, avatar, bio, created_at, last_login FROM users WHERE id = ?').get(req.session.userId);
        jsonResponse(res, true, '更新成功', updatedUser);
    } catch (error) {
        jsonResponse(res, false, '更新失败：' + error.message);
    }
}

app.get('/proxy', async (req, res) => {
    const url = req.query.url;
    
    if (!url) {
        return res.status(400).json({ error: '缺少url参数' });
    }
    
    try {
        const decodedUrl = decodeURIComponent(url);
        console.log('代理请求:', decodedUrl);
        
        const response = await fetch(decodedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Referer': decodedUrl
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
                // 如果是列表或详情接口，返回标准的错误结构
                if (decodedUrl.includes('ac=list') || decodedUrl.includes('ac=detail')) {
                    res.json({ code: 0, msg: "数据源返回了非预期的格式(非JSON)", class: [], list: [] });
                } else {
                    res.send(text);
                }
            }
        }
    } catch (error) {
        console.error('代理错误:', error.message);
        res.status(500).json({ error: '代理请求失败: ' + error.message });
    }
});

app.get('/proxy/m3u8', async (req, res) => {
    const url = req.query.url;
    
    if (!url) {
        return res.status(400).send('缺少url参数');
    }
    
    try {
        const decodedUrl = decodeURIComponent(url);
        console.log('M3U8代理请求:', decodedUrl);
        
        const response = await fetch(decodedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Referer': decodedUrl
            },
            timeout: 15000
        });
        
        let content = await response.text();
        
        const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf('/') + 1);
        
        content = content.split('\n').map(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                if (!line.startsWith('http')) {
                    return baseUrl + line;
                }
            }
            return line;
        }).join('\n');
        
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(content);
    } catch (error) {
        console.error('M3U8代理错误:', error.message);
        res.status(500).send('M3U8代理请求失败: ' + error.message);
    }
});

app.get('/proxy/ts', async (req, res) => {
    const url = req.query.url;
    
    if (!url) {
        return res.status(400).send('缺少url参数');
    }
    
    try {
        const decodedUrl = decodeURIComponent(url);
        
        const response = await fetch(decodedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Referer': decodedUrl
            },
            timeout: 30000
        });
        
        const buffer = await response.buffer();
        
        res.setHeader('Content-Type', 'video/mp2t');
        res.send(buffer);
    } catch (error) {
        console.error('TS代理错误:', error.message);
        res.status(500).send('TS代理请求失败');
    }
});

app.get('/proxy/image', async (req, res) => {
    const url = req.query.url;
    
    if (!url) {
        return res.status(400).send('缺少url参数');
    }
    
    try {
        const decodedUrl = decodeURIComponent(url);
        
        const response = await fetch(decodedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Referer': decodedUrl
            },
            timeout: 15000
        });
        
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const buffer = await response.buffer();
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(buffer);
    } catch (error) {
        console.error('图片代理错误:', error.message);
        res.status(500).send('图片代理请求失败');
    }
});

// 反馈相关 API
app.post('/api/feedback', (req, res) => {
    const { user_id, username, contact, type, content } = req.body;
    
    if (!content) {
        return jsonResponse(res, false, '反馈内容不能为空');
    }
    
    try {
        const stmt = db.prepare('INSERT INTO feedbacks (user_id, username, contact, type, content) VALUES (?, ?, ?, ?, ?)');
        stmt.run(user_id || null, username || '匿名', contact || '', type || 'suggestion', content);
        jsonResponse(res, true, '反馈提交成功');
    } catch (error) {
        jsonResponse(res, false, '提交失败：' + error.message);
    }
});

app.get('/api/feedback', authMiddleware, (req, res) => {
    try {
        const feedbacks = db.prepare('SELECT * FROM feedbacks ORDER BY created_at DESC').all();
        jsonResponse(res, true, '获取成功', feedbacks);
    } catch (error) {
        jsonResponse(res, false, '获取失败：' + error.message);
    }
});

app.put('/api/feedback/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const { status, reply } = req.body;
    
    try {
        db.prepare('UPDATE feedbacks SET status = ?, reply = ?, replied_by = ?, replied_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(status || 'pending', reply || null, req.admin.username, id);
        jsonResponse(res, true, '更新成功');
    } catch (error) {
        jsonResponse(res, false, '更新失败：' + error.message);
    }
});

app.delete('/api/feedback/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    
    try {
        db.prepare('DELETE FROM feedbacks WHERE id = ?').run(id);
        jsonResponse(res, true, '删除成功');
    } catch (error) {
        jsonResponse(res, false, '删除失败：' + error.message);
    }
});

// 全局错误处理
app.use((err, req, res, next) => {
    console.error('未捕获的错误:', err);
    res.status(500).json({ success: false, message: '服务器内部错误' });
});

app.use(express.static('.'));

const server = app.listen(PORT, () => {
    console.log(`================================`);
    console.log(`  影视爆米花服务已启动`);
    console.log(`  代理服务: http://localhost:${PORT}`);
    console.log(`  访问地址: http://localhost:${PORT}/index.html`);
    console.log(`  后台管理: http://localhost:${PORT}/admin.html`);
    console.log(`================================`);
});

// 优雅关闭数据库连接
process.on('SIGINT', () => {
    console.log('正在关闭服务和数据库连接...');
    if (db) db.close();
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    if (db) db.close();
    server.close(() => {
        process.exit(0);
    });
});
