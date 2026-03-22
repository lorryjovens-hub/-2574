# 影视资源站 API 文档（标准采集接口说明）

本文档描述一个典型影视资源站采集接口结构。
接口格式兼容常见影视 CMS 采集规范（如苹果 CMS 等），返回 JSON 数据。

该接口通常用于：

* 影视网站开发
* 影视资源聚合
* 私人影视站
* 播放器开发

---

# 1 API 基础地址

示例资源站接口：

```
https://api.apibdzy.com/api.php/provide/vod/
```

所有接口均基于该地址，通过参数控制返回数据。

示例：

```
https://api.apibdzy.com/api.php/provide/vod/?ac=list
```

---

# 2 常用参数说明

| 参数  | 说明    |
| --- | ----- |
| ac  | 操作类型  |
| pg  | 页码    |
| t   | 分类ID  |
| ids | 视频ID  |
| wd  | 搜索关键词 |

---

# 3 获取影视列表

该接口用于获取影视资源列表。

接口：

```
GET /api.php/provide/vod/?ac=list
```

示例：

```
https://api.apibdzy.com/api.php/provide/vod/?ac=list&pg=1
```

---

# 4 返回数据结构

示例返回（简化）：

```json
{
 "code":1,
 "msg":"数据列表",
 "page":1,
 "pagecount":2294,
 "limit":"20",
 "total":45879,
 "list":[
  {
   "vod_id":48525,
   "vod_name":"海贼王(真人版)第二季",
   "type_id":14,
   "type_name":"欧美剧",
   "vod_time":"2026-03-10 21:17:03",
   "vod_remarks":"更新第08集",
   "vod_play_from":"dbm3u8"
  }
 ],
 "class":[
  {
   "type_id":1,
   "type_name":"电影"
  },
  {
   "type_id":2,
   "type_name":"电视剧"
  },
  {
   "type_id":3,
   "type_name":"综艺"
  },
  {
   "type_id":4,
   "type_name":"动漫"
  }
 ]
}
```

---

# 5 列表字段说明

| 字段            | 说明   |
| ------------- | ---- |
| vod_id        | 视频ID |
| vod_name      | 视频名称 |
| type_id       | 分类ID |
| type_name     | 分类名称 |
| vod_time      | 更新时间 |
| vod_remarks   | 更新状态 |
| vod_play_from | 播放源  |

注意：

列表接口通常 **不包含海报图片和剧情信息**。

---

# 6 分类数据说明

接口返回的 `class` 字段为分类列表。

示例：

```json
"class":[
 {"type_id":1,"type_name":"电影"},
 {"type_id":2,"type_name":"电视剧"},
 {"type_id":3,"type_name":"综艺"},
 {"type_id":4,"type_name":"动漫"},
 {"type_id":7,"type_name":"喜剧片"},
 {"type_id":13,"type_name":"大陆剧"},
 {"type_id":14,"type_name":"欧美剧"}
]
```

资源站的分类结构通常为 **多级分类**，但大多数接口 **不会提供完整的父子关系**。

例如：

一级分类

```
电影
电视剧
综艺
动漫
```

二级分类

```
动作片
喜剧片
爱情片
科幻片
大陆剧
欧美剧
韩剧
```

由于接口通常只返回 `type_id` 和 `type_name`，开发时一般有两种处理方式：

方式一（推荐）

直接使用 `type_name` 作为分类，不构建树状结构。

方式二

在本地手动维护分类结构，并根据 `type_id` 映射分类层级。

---

# 7 按分类获取影视列表

通过 `t` 参数可以按分类筛选影视列表。

接口：

```
/api.php/provide/vod/?ac=list&t=分类ID
```

示例：

```
https://api.apibdzy.com/api.php/provide/vod/?ac=list&t=13
```

返回：

```
大陆剧列表
```

---

# 8 分页参数

接口支持分页查询。

示例：

```
/api.php/provide/vod/?ac=list&pg=2
```

返回字段：

| 字段        | 说明   |
| --------- | ---- |
| page      | 当前页  |
| pagecount | 总页数  |
| limit     | 每页数量 |
| total     | 总数据量 |

---

# 9 搜索接口

通过 `wd` 参数可以搜索影视资源。

接口：

```
/api.php/provide/vod/?ac=list&wd=关键词
```

示例：

```
https://api.apibdzy.com/api.php/provide/vod/?ac=list&wd=海贼王
```

返回数据结构与列表接口一致。

---

# 10 获取影视详情

影视详情接口用于获取完整影视信息，包括海报、剧情、播放地址等。

接口：

```
GET /api.php/provide/vod/?ac=detail&ids=视频ID
```

示例：

```
https://api.apibdzy.com/api.php/provide/vod/?ac=detail&ids=48525
```

---

# 11 详情返回示例

```json
{
 "list":[
  {
   "vod_id":48525,
   "vod_name":"海贼王(真人版)第二季",
   "type_name":"欧美剧",
   "vod_pic":"https://img.example.com/poster.jpg",
   "vod_content":"剧情简介",
   "vod_actor":"演员信息",
   "vod_director":"导演信息",
   "vod_play_from":"dbm3u8",
   "vod_play_url":"第1集$https://play.example.com/1.m3u8#第2集$https://play.example.com/2.m3u8"
  }
 ]
}
```

---

# 12 详情字段说明

| 字段            | 说明   |
| ------------- | ---- |
| vod_id        | 视频ID |
| vod_name      | 视频名称 |
| vod_pic       | 海报图片 |
| vod_content   | 剧情简介 |
| vod_actor     | 演员   |
| vod_director  | 导演   |
| vod_play_from | 播放来源 |
| vod_play_url  | 播放地址 |

---

# 13 播放地址格式

## 13.1 单播放源格式

资源站播放地址通常采用以下结构：

```
集数$播放地址#集数$播放地址
```

示例：

```
第1集$https://play.example.com/1.m3u8#第2集$https://play.example.com/2.m3u8
```

解析后结构：

```
第1集 -> https://play.example.com/1.m3u8
第2集 -> https://play.example.com/2.m3u8
```

## 13.2 多播放源格式（重要）

很多资源站会提供多个播放源，使用 `$$$` 分隔：

**vod_play_from 字段：**

```
liangzi$$$lzm3u8
```

**vod_play_url 字段：**

```
第01集$https://v.cdnlz22.com/share/xxx#第02集$https://v.cdnlz22.com/share/yyy$$$第01集$https://v.cdnlz22.com/xxx/index.m3u8#第02集$https://v.cdnlz22.com/yyy/index.m3u8
```

**解析逻辑：**

1. 将 `vod_play_from` 按 `$$$` 分割，得到播放源名称数组
2. 将 `vod_play_url` 按 `$$$` 分割，得到每个播放源的剧集列表
3. 两者按索引一一对应

**示例解析结果：**

| 播放源名称 | 剧集列表 |
| --- | --- |
| liangzi | 第01集$https://v.cdnlz22.com/share/xxx#第02集$... |
| lzm3u8 | 第01集$https://v.cdnlz22.com/xxx/index.m3u8#第02集$... |

## 13.3 M3U8 播放源筛选（推荐）

由于 HLS 播放器（如 hls.js）主要支持 m3u8 格式，建议筛选包含 m3u8 的播放源：

**筛选规则：**

1. 检查播放源名称是否包含 `m3u8` 关键字
2. 检查剧集 URL 是否包含 `.m3u8` 后缀
3. 优先使用符合条件的播放源

**代码示例：**

```javascript
function filterM3u8Sources(playFrom, playUrl) {
    const fromNames = playFrom.split('$$$');
    const urlParts = playUrl.split('$$$');
    
    const sources = [];
    
    for (let i = 0; i < urlParts.length; i++) {
        const episodes = parseEpisodes(urlParts[i]);
        const hasM3u8 = episodes.some(ep => ep.url.includes('.m3u8'));
        const isM3u8Source = fromNames[i].toLowerCase().includes('m3u8') || hasM3u8;
        
        if (isM3u8Source) {
            sources.push({
                name: fromNames[i],
                episodes: episodes
            });
        }
    }
    
    return sources;
}
```

---

# 14 影视站常见数据加载流程

由于列表接口不包含海报图片，因此影视站开发通常采用以下流程：

步骤一

获取影视列表

```
/api.php/provide/vod/?ac=list
```

步骤二

从列表中获取 `vod_id`

步骤三

根据 `vod_id` 调用详情接口

```
/api.php/provide/vod/?ac=detail&ids=vod_id
```

步骤四

从详情数据中获取：

```
vod_pic
vod_content
vod_play_url
```

---

# 15 推荐前端加载策略

为了减少接口请求压力，推荐使用 **异步加载详情数据**。

典型流程：

1 加载影视列表
2 渲染影视标题
3 根据 `vod_id` 异步获取详情
4 填充海报图片
5 点击进入播放页面

这种方式可以减少首页加载时间。

---

# 16 播放流程

影视播放页面通常流程如下：

1 获取影视详情
2 解析 `vod_play_from` 和 `vod_play_url`
3 筛选 m3u8 格式的播放源
4 生成播放列表
5 用户点击集数
6 使用 HLS 播放器加载视频地址

播放器一般使用：

* HTML5 Video
* M3U8 Player
* HLS 播放器（推荐 hls.js）

---

# 17 常见资源站字段汇总

| 字段            | 说明   |
| ------------- | ---- |
| vod_id        | 视频ID |
| vod_name      | 视频名称 |
| vod_pic       | 海报   |
| vod_content   | 剧情   |
| vod_actor     | 演员   |
| vod_director  | 导演   |
| vod_play_from | 播放源  |
| vod_play_url  | 播放地址 |
| type_id       | 分类ID |
| type_name     | 分类名称 |
| vod_time      | 更新时间 |
| vod_remarks   | 更新信息 |

---

# 18 本项目实现说明

本项目已实现以下功能：

## 18.1 数据源管理

* 支持在页面添加、编辑、删除多个数据源
* 数据源配置保存在浏览器本地存储
* 可随时切换不同数据源

## 18.2 播放源筛选

* 自动解析多播放源格式（`$$$` 分隔）
* 优先筛选 m3u8 格式的播放源
* 支持多播放源切换

## 18.3 异步海报加载

* 列表页先显示标题
* 异步加载详情获取海报图片
* 海报缓存避免重复请求

## 18.4 跨域处理

* 使用多个 CORS 代理服务
* 自动轮换代理
* 请求超时处理

---
