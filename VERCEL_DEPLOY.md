# Vercel 部署指南

## 快速部署步骤

### 1. 登录 Vercel
- 访问 https://vercel.com
- 使用 GitHub 账号登录

### 2. 导入项目
- 点击 "Add New Project"
- 选择 GitHub 仓库 `lorryjovens-hub/-2574`
- 点击 "Import"

### 3. 配置项目
- **Framework Preset**: Other
- **Root Directory**: ./
- **Build Command**: 留空
- **Output Directory**: 留空

### 4. 部署
- 点击 "Deploy"
- 等待 1-2 分钟完成部署

### 5. 访问网站
- 部署完成后，Vercel 会提供一个 `.vercel.app` 域名
- 例如：`https://movie-site-xxx.vercel.app`

---

## 绑定自定义域名

### 方法 1：Vercel 自动配置（推荐）
1. 在项目 Dashboard 点击 "Domains"
2. 输入你的域名，例如：`movie.yourdomain.com`
3. Vercel 会显示需要的 DNS 记录
4. 在你的域名服务商处添加 CNAME 记录：
   - 类型: CNAME
   - 名称: movie（或你设置的子域名）
   - 值: cname.vercel-dns.com

### 方法 2：手动 DNS 配置
1. 在域名服务商处添加 A 记录：
   - 类型: A
   - 名称: @ 或 movie
   - 值: 76.76.21.21（Vercel IP）
2. 或添加 CNAME 记录：
   - 类型: CNAME
   - 名称: movie
   - 值: cname.vercel-dns.com

---

## 项目结构说明

```
/
├── index.html          # 首页
├── detail.html         # 详情页
├── play.html           # 播放页
├── admin.html          # 管理后台
├── css/                # 样式文件
├── js/                 # JavaScript
├── api/                # Vercel API 函数
│   └── index.js        # API 入口
├── vercel.json         # Vercel 配置
└── package.json        # 依赖配置
```

---

## API 端点

部署后可通过以下端点访问 API：

| 端点 | 说明 |
|------|------|
| `/api/test` | 测试接口 |
| `/api/sources` | 获取数据源列表 |
| `/api/proxy?url=xxx` | 代理第三方 API |
| `/api/proxy/m3u8?url=xxx` | 代理 M3U8 视频 |
| `/api/proxy/image?url=xxx` | 代理图片 |

---

## 注意事项

### 1. 免费额度
- Vercel Hobby 免费版：
  - 每月 100GB 带宽
  - 每天 10000 次函数调用
  - 对于影视网站通常够用

### 2. 数据源配置
- 默认配置了 2 个数据源
- 如需修改，编辑 `api/index.js` 中的 `DEFAULT_SOURCES`

### 3. 视频播放
- 视频流通过代理转发
- 由于 Vercel 函数有 30 秒超时限制
- 大视频文件可能无法完整代理

### 4. 限制说明
- ❌ 不支持 SQLite 持久化存储
- ❌ 不支持文件上传
- ✅ 支持第三方 API 代理
- ✅ 支持图片/M3U8 代理

---

## 故障排查

### 部署失败
1. 检查 GitHub 仓库是否公开
2. 检查 package.json 是否存在
3. 检查 vercel.json 配置是否正确

### API 404 错误
- 确保访问路径是 `/api/xxx` 而不是 `/xxx`
- 检查 Vercel Functions 是否正常部署

### 视频无法播放
- 检查数据源是否可用
- 尝试切换其他数据源
- 检查浏览器控制台错误信息

---

## 升级方案

如果 Vercel 免费版不够用，可考虑：

| 方案 | 费用 | 特点 |
|------|------|------|
| Vercel Pro | $20/月 | 1TB 带宽，无限制函数 |
| 阿里云 VPS | ¥40/月 | 完整功能，1TB 流量 |
| Railway | $5/月 | 容易部署，适合 Node.js |

---

## 联系支持

有问题请访问：
- GitHub Issues: https://github.com/lorryjovens-hub/-2574/issues
- Vercel Docs: https://vercel.com/docs
