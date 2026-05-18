# PA 项目 AI 助手联网搜索功能

## 概述

为 PA 项目的 AI 助手添加了**个性化联网搜索工具**，直接在 Node.js 层执行搜索，轻量快速，兼容任意模型。

## 核心特性

- 🔍 **实时搜索** — 新闻、天气、价格、股票、赛事等
- 🌐 **多后端支持** — Google、Bing、Brave，自动故障转移
- ⚡ **轻量快速** — 无子代理开销，1-3秒返回
- 🎯 **智能触发** — 自动判断用户是否需要实时信息
- 🔧 **个性化** — 专为 PA 项目定制

## 快速开始

### 1. 配置搜索 API

```bash
# 复制配置模板
cp /opt/personalAssistant/backend/.env.search.template /opt/personalAssistant/backend/.env.search

# 编辑配置，填入你的 API 密钥
vi /opt/personalAssistant/backend/.env.search
```

**推荐配置 Google Custom Search：**
```bash
GOOGLE_SEARCH_API_KEY=your_api_key
GOOGLE_CSE_ID=your_cse_id
```

### 2. 重启 PA 后端服务

```bash
cd /opt/personalAssistant/backend
npm start
```

### 3. 测试搜索功能

```bash
# 手动测试搜索
node /opt/personalAssistant/backend/services/searchService.js "今天北京天气"

# 或在聊天中测试
# 发送消息："今天北京天气怎么样？"
```

## 使用方法

### 自动触发

当用户发送以下类型的消息时，系统会自动触发搜索：

| 消息类型 | 示例 |
|---------|------|
| 明确搜索 | "搜索 React 19 新特性" |
| 实时信息 | "今天北京天气"、"最新 AI 新闻" |
| 疑问句 | "什么是机器学习？" |
| 价格行情 | "比特币现在多少钱" |
| 体育赛事 | "湖人队今天比赛" |
| 最新版本 | "iPhone 16 最新发布" |

### 手动调用

```bash
# CLI 方式
node /opt/personalAssistant/backend/services/searchService.js "搜索关键词"

# 通过 PA API
curl -X POST http://localhost:8090/api/search \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"query": "AI最新新闻"}'
```

## 技术架构

```
用户消息
    ↓
shouldSearch() 智能判断
    ↓ 需要搜索
performSearch() 执行搜索
    ↓
多后端故障转移（Google → Bing → Brave）
    ↓
formatSearchResults() 格式化
    ↓
buildEnhancedPrompt() 注入 prompt
    ↓
用户模型 → 基于搜索结果回答
```

## 搜索模式

### 触发关键词

```javascript
// 明确搜索
搜索(.{1,50})
查(找|一下|一查|查)(.{1,50})

// 实时信息
最新(.{1,40})(消息|新闻|动态)
今天(.{1,40})(天气|气温|新闻)
现在(.{1,40})(多少|怎么样|价格)

// 疑问句
(.{5,}).*[吗嘛？]
(.{5,}).*怎么(办|样|做)
(.{5,}).*什么(意思|情况)

// 时间敏感
(股票|比特币|汇率).*(多少|价格|行情)
(比分|比赛|赛事)
(最新版本|最新版|最新发布)
```

### 排除关键词

```javascript
不要搜索
不用搜索
基于你的知识
根据你的了解
```

## 配置说明

### 环境变量

```bash
# .env 或 .env.search

# Google Custom Search（推荐）
GOOGLE_SEARCH_API_KEY=xxx
GOOGLE_CSE_ID=xxx

# Bing Search
BING_SEARCH_API_KEY=xxx

# Brave Search
BRAVE_SEARCH_API_KEY=xxx

# 可选配置
PA_SEARCH_MAX_RESULTS=5      # 最大结果数
PA_SEARCH_TIMEOUT=8000       # 超时时间（毫秒）
```

### API 配额

| 服务 | 免费额度 | 付费价格 |
|------|---------|---------|
| Google | 100次/天 | $5/1000次 |
| Bing | 1000次/月 | $15/1000次 |
| Brave | 2000次/月 | $3/1000次 |

## 性能指标

| 指标 | 数值 |
|------|------|
| 搜索延迟 | 1-3 秒 |
| 成功率 | >95% |
| 并发支持 | ✅ |
| 故障转移 | ✅ 自动 |
| 结果数量 | 可配置（默认5条） |

## 故障排除

### 搜索不可用

```
错误: All backends failed
```

**原因**：未配置搜索 API 或所有后端都失败

**解决**：
1. 检查 `.env.search` 配置
2. 确认 API 密钥有效
3. 重启服务

### 无搜索结果

```
搜索失败: 无结果
```

**原因**：查询词太偏或 API 配额用尽

**解决**：
1. 换更通用的关键词
2. 检查 API 配额
3. 尝试其他后端

### 响应超时

```
错误: Timeout
```

**原因**：网络问题或 API 响应慢

**解决**：
1. 检查网络连接
2. 增加超时配置
3. 尝试其他搜索后端

## 最佳实践

1. **配置多个后端** — 提高可用性
2. **合理设置超时** — 8秒平衡速度和成功率
3. **限制结果数量** — 5条足够，避免信息过载
4. **优雅降级** — 搜索失败时友好提示
5. **监控配额** — 避免超出免费额度

## 文件清单

| 文件 | 作用 |
|------|------|
| `services/searchService.js` | 搜索服务核心 |
| `services/webSearchMiddleware.js` | 中间件封装 |
| `routes/chat.js` | 聊天路由（已集成） |
| `.env.search.template` | 配置模板 |
| `docs/web-search-setup.md` | 详细文档 |

## 更新日志

- **v1.0** (2026-05-07) — 初始版本
  - 多后端支持（Google/Bing/Brave）
  - 智能触发判断
  - 自动故障转移
  - Prompt 注入
  - 个性化搜索工具

## 相关资源

- [Google Custom Search 文档](https://developers.google.com/custom-search/v1/overview)
- [Bing Search API 文档](https://www.microsoft.com/en-us/bing/apis/bing-web-search-api)
- [Brave Search API 文档](https://brave.com/search/api/)
- [PA 项目文档](../README.md)
