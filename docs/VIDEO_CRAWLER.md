# 视频爬虫系统 - 完整文档

## 系统概述

基于 VPS 代理的"字典式"视频搜索服务，支持实时查询多个视频网站，具备并发搜索、智能缓存、HTML 解析等功能。

## 架构设计

```
用户 → PA Backend (:8090) → SSH 隧道 (13002) → VPS 代理 (3002) → 视频网站
```

### 核心组件

| 组件 | 位置 | 功能 |
|------|------|------|
| VideoCrawlerService | `services/videoCrawlerService.js` | 核心搜索服务，并发+缓存 |
| HTMLParser | `services/htmlParser.js` | 5个网站的专用 HTML 解析器 |
| VideoResolver | `services/videoResolver.js` | 播放地址提取 |
| VPS Proxy | VPS `:3002` | 外网访问代理 |
| SSH Tunnel | `13002 → 3002` | 安全隧道 |

## API 文档

### 1. 搜索视频
```
POST /api/tools/video/search
Content-Type: application/json
Authorization: Bearer <token>

{"query": "狂飙"}

Response:
{
  "results": [
    {
      "id": "xxx",
      "name": "狂飙",
      "source": "哔嘀影视",
      "quality": "HD",
      "type": "series",
      "year": 2023,
      "url": "https://...",
      "poster": "https://...",
      "episodes": 39,
      "playable": true,
      "confidence": 0.9
    }
  ]
}
```

### 2. 获取视频源列表
```
GET /api/tools/video/sources
Authorization: Bearer <token>

Response:
{
  "sources": [
    {"key": "bdys", "name": "哔嘀影视", "domain": "www.bdys.com", "types": "国产剧,电影,综艺"},
    ...
  ]
}
```

### 3. 测试视频源可用性
```
POST /api/tools/video/sources/test
Content-Type: application/json
Authorization: Bearer <token>

{"site": "archive"}

Response: {"site": "archive", "available": true}
```

### 4. 解析播放地址
```
POST /api/tools/video/resolve
Content-Type: application/json
Authorization: Bearer <token>

{"url": "https://archive.org/details/video", "source": "archive"}

Response: {"urls": [{"url": "...", "type": "mp4", "quality": "HD"}]}
```

### 5. 搜索建议
```
GET /api/tools/video/suggestions?q=狂
Authorization: Bearer <token>

Response: {"suggestions": ["狂飙"]}
```

### 6. 服务统计
```
GET /api/tools/video/stats
Authorization: Bearer <token>

Response: {
  "totalSearches": 100,
  "cacheHits": 50,
  "cacheMisses": 50,
  "hitRate": "50.0%",
  "cacheSize": 10,
  "activeSites": 5
}
```

### 7. 搜索历史
```
GET /api/tools/video/history
Authorization: Bearer <token>

POST /api/tools/video/history/progress
{"videoUrl": "...", "progress": 120, "videoName": "...", "source": "..."}
```

## 配置说明

### 环境变量
```bash
# VPS 代理地址（通过 SSH 隧道）
VPS_PROXY_URL=http://127.0.0.1:13002

# JWT 密钥
JWT_SECRET=pa_jwt_secret_2026_ne

# 数据库配置
DB_HOST=localhost
DB_USER=pa
DB_PASS=pa_pass_2026
DB_NAME=personal_assistant
```

### 服务配置
```javascript
const CONFIG = {
  cacheTTL: 5 * 60 * 1000,        // 缓存5分钟
  requestTimeout: 12000,           // 请求超时12秒
  maxConcurrent: 3,                // 最大并发数
  retryAttempts: 2,                // 重试次数
  maxResults: 50,                  // 最大结果数
};
```

## 支持的视频源

| 网站 | 类型 | 状态 |
|------|------|------|
| 哔嘀影视 | 国产剧/电影 | ⚠️ 网络限制 |
| 低端影视 | 美剧/英剧 | ⚠️ 网络限制 |
| 动漫岛 | 动漫 | ⚠️ 网络限制 |
| 555电影 | 影视聚合 | ⚠️ 网络限制 |
| Archive.org | 公有领域 | ✅ 正常工作 |

## 本地备用视频

当 VPS 代理搜索失败时，自动返回内置视频：
- Archive.org 公有领域电影 (10部)
- Blender Foundation 开源动画 (6部)

## 性能指标

| 指标 | 值 |
|------|-----|
| 首次搜索 | ~10-15s (5个网站并发) |
| 缓存命中 | <1ms |
| 缓存 TTL | 5分钟 |
| 并发查询数 | 3个网站/批次 |
| 重试次数 | 2次 |

## 部署说明

### 本地服务
```bash
cd /opt/personalAssistant/backend
npm install
pm2 start server.js --name pa-backend
```

### VPS 代理
```bash
# 在 VPS 上
cd /opt/video-crawler-proxy
node server.js

# 或作为 systemd 服务
systemctl enable video-crawler-proxy
systemctl start video-crawler-proxy
```

### SSH 隧道
```bash
# 创建隧道
nohup ssh -N -o StrictHostKeyChecking=no \
  -o ServerAliveInterval=60 \
  -o ServerAliveCountMax=3 \
  -i /root/.ssh/wechat_proxy \
  -L 13002:127.0.0.1:3002 \
  root@101.43.120.108 &
```

## 数据库表

### video_sources
```sql
CREATE TABLE video_sources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  domain VARCHAR(200) NOT NULL,
  base_url VARCHAR(500),
  search_url VARCHAR(500),
  play_url VARCHAR(500),
  types VARCHAR(200),
  status ENUM('active', 'inactive', 'error') DEFAULT 'active',
  last_checked TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### video_resources
```sql
CREATE TABLE video_resources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_id INT NOT NULL,
  title VARCHAR(500) NOT NULL,
  type ENUM('movie', 'series', 'anime', 'documentary', 'variety'),
  quality VARCHAR(20) DEFAULT 'HD',
  year INT,
  play_url TEXT,
  poster_url TEXT,
  episodes INT,
  rating FLOAT DEFAULT 0,
  is_valid BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES video_sources(id)
);
```

### tool_video_history
```sql
-- 搜索和播放历史记录
```

## 故障排除

### VPS 代理不可达
```bash
# 检查 SSH 隧道
ps aux | grep 13002

# 重新创建隧道
ssh -N -L 13002:127.0.0.1:3002 root@101.43.120.108
```

### 搜索结果为空
- 检查 VPS 代理是否正常工作
- 查看缓存状态：`GET /api/tools/video/stats`
- 尝试搜索英文关键词如 "big buck"

### 服务崩溃
```bash
# 查看日志
journalctl -u personal-assistant -n 50

# 重启服务
systemctl restart personal-assistant
```

## 下一步优化

1. **完善 HTML 解析器** - 针对各网站实际 HTML 结构优化正则表达式
2. **添加 Redis 缓存** - 使用 Redis 替代内存缓存，支持分布式
3. **定时采集** - 对热门视频定时采集并存储
4. **播放地址提取** - 优化 m3u8/mp4 地址提取
5. **更多视频源** - 扩展支持更多免费视频网站

---

最后更新: 2026-04-04
