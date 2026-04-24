# PA 项目新闻功能开发文档

## 一、功能概述

在 PA 工具箱中新增"新闻"功能模块，将 Hermes Agent 每日八点的 AI 编程新闻推送自动同步到 PA 项目，支持分类、标签、搜索，与微信推送通道完全隔离。

## 二、系统架构

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Hermes Agent   │    │   PA Backend     │    │  PA Frontend    │
│  Cron Job       │───▶│  news routes     │◀───│  NewsView.vue   │
│  (8:00 daily)   │    │  news service    │    │  /tools/news    │
│  POST webhook   │    │  sync webhook    │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │   MySQL          │
                       │ tool_news +      │
                       │ tool_news_tags   │
                       └──────────────────┘
```

## 三、数据库设计

### 3.1 新闻主表 (tool_news)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键 |
| user_id | INT | 用户ID（外键） |
| title | VARCHAR(500) | 标题 |
| content | LONGTEXT | 完整内容 |
| summary | VARCHAR(500) | 自动摘要 |
| publish_date | DATE | 发布日期 |
| category | VARCHAR(50) | 分类（综合/AI工具/大模型/框架更新/研究突破/开发者工具） |
| source | VARCHAR(50) | 来源（hermes/manual） |
| hermes_job_id | VARCHAR(64) | 关联的 cron job ID |
| raw_content | LONGTEXT | 原始推送内容 |
| view_count | INT | 阅读次数 |

### 3.2 标签表 (tool_news_tags)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键 |
| user_id | INT | 用户ID |
| name | VARCHAR(50) | 标签名 |
| color | VARCHAR(20) | 标签颜色 |

### 3.3 关联表 (tool_news_tag_map)

| 字段 | 类型 | 说明 |
|------|------|------|
| news_id | INT | 新闻ID |
| tag_id | INT | 标签ID |

## 四、API 接口

### 4.1 获取新闻列表
```
GET /api/tools/news
Query: month, category, tag, q, page, pageSize
```

### 4.2 获取单篇详情
```
GET /api/tools/news/:id
```

### 4.3 创建新闻
```
POST /api/tools/news
Body: { title, content, publish_date, category, tags }
```

### 4.4 同步 Webhook（内部）
```
POST /api/tools/news/sync
Headers: { Authorization: 'Bearer pa_internal_sync_token_2026' }
Body: { job_id, date, title, content, category, tags }
```

### 4.5 标签管理
```
GET/POST/PUT/DELETE /api/tools/news/tags
```

## 五、前端功能

- **列表展示**：按日期倒序，显示标题、摘要、分类图标、标签
- **内联展开**：点击标题展开/收起完整内容
- **分类筛选**：6个默认分类
- **标签筛选**：热门标签快速筛选
- **月份筛选**：按年月筛选
- **全文搜索**：MATCH...AGAINST 全文搜索
- **新建/编辑/删除**：弹窗表单操作
- **分页**：支持自定义页大小

## 六、Hermes Agent 集成

### 6.1 同步脚本
```bash
~/.hermes/scripts/sync_news_to_pa.py --date 2026-04-24
```

### 6.2 Cron 配置
修改 `~/.hermes/cron/jobs.json`，为新闻推送 job 添加：
```json
"script": "~/.hermes/scripts/sync_news_to_pa.py"
```

### 6.3 迁移脚本
```bash
python3 ~/.hermes/scripts/migrate_news_to_pa.py [--dry-run]
```

## 七、文件变更清单

| 文件 | 操作 |
|------|------|
| `backend/routes/tools.js` | 添加新闻表和 API 路由 |
| `backend/server.js` | 添加 sync webhook 路由 |
| `frontend/src/views/NewsView.vue` | 新建新闻页面 |
| `frontend/src/router/index.js` | 添加路由 |
| `frontend/src/views/tools/ToolsDesktop.vue` | 添加入口 |
| `frontend/src/views/tools/ToolsMobile.vue` | 添加入口 |

## 八、Git 提交历史

```
3ba823e fix(news): fix Vue template style binding syntax
3854d7b feat(news): fix sync webhook auth and server integration
7d03ed5 Merge branch "feature/news-module" into main
8aa26e6 feat(news): add frontend NewsView component and routes
6e644ed feat(news): add database tables and backend API routes
3137401 Initial commit: PA project baseline
```

## 九、测试验证

### 9.1 数据验证
```sql
-- 查看所有新闻
SELECT id, title, publish_date, category FROM tool_news ORDER BY publish_date DESC;

-- 查看标签
SELECT n.title, GROUP_CONCAT(t.name) as tags
FROM tool_news n
LEFT JOIN tool_news_tag_map m ON n.id = m.news_id
LEFT JOIN tool_news_tags t ON m.tag_id = t.id
GROUP BY n.id, n.title;
```

### 9.2 API 测试
```bash
# 同步测试
curl -X POST http://localhost:8090/api/tools/news/sync \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer pa_internal_sync_token_2026' \
  -d '{"job_id":"ba3aebc343f5","date":"2026-04-24","title":"Test","content":"Content"}'
```

## 十、当前状态

✅ 数据库表创建完成
✅ 后端 API 实现完成
✅ 前端页面开发完成
✅ 路由和工具箱入口配置完成
✅ Hermes 同步脚本配置完成
✅ 历史数据迁移完成（5条新闻）
✅ 前端构建通过

## 十一、后续优化

1. **自动分类优化**：基于更丰富的关键词和机器学习
2. **标签推荐**：基于内容自动推荐标签
3. **新闻摘要优化**：使用 LLM 生成更精准的摘要
4. **RSS 订阅**：支持外部 RSS 源自动抓取
5. **新闻推送**：可选的邮件/微信推送功能
6. **统计分析**：阅读次数、热门新闻统计
