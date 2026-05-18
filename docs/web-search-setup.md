# PA 项目 AI 助手通用联网功能配置说明

## 概述

为 PA 项目的 AI 助手添加了**轻量级通用联网搜索功能**，直接在 Node.js 层执行搜索，无需子代理开销。

## 核心设计原则

1. **直接在 Node.js 层执行搜索** — 不依赖子代理，轻量快速
2. **兼容任意模型** — 通过 prompt 注入方式，不依赖 function calling
3. **多后端支持** — Google Custom Search、Bing、Brave，自动故障转移
4. **不竞争用户模型配额** — 搜索和聊天使用独立的 API 调用

## 架构

```
用户消息 → shouldSearch() 判断
    ↓ 需要搜索
performSearch() 直接调用搜索 API
    ↓ 获取结果
formatSearchResults() 格式化
    ↓
buildEnhancedPrompt() 注入 prompt
    ↓
发送给用户模型 → 基于搜索结果回答
```

## 配置搜索 API

### 方式一：Google Custom Search（推荐）

```bash
# .env
GOOGLE_SEARCH_API_KEY=你的API密钥
GOOGLE_CSE_ID=你的搜索引擎ID
```

[创建指南](https://developers.google.com/custom-search/v1/overview)

### 方式二：Bing Search API

```bash
# .env
BING_SEARCH_API_KEY=你的Bing API密钥
```

### 方式三：Brave Search API

```bash
# .env
BRAVE_SEARCH_API_KEY=你的Brave API密钥
```

### 不配置时

系统正常运行，仅在用户触发搜索时礼貌告知不可用并降级处理。

## 搜索触发规则

### 会触发搜索

| 类型 | 示例 |
|------|------|
| 明确搜索指令 | "搜索 React 19"、"帮我查查..." |
| 实时信息 | "今天北京天气"、"最新 AI 新闻" |
| 疑问句 | "什么是机器学习？"、"怎么安装 Node.js？" |
| 价格行情 | "比特币现在多少钱" |
| 体育赛事 | "湖人队今天比赛" |
| 最新版本 | "iPhone 16 最新发布" |

### 不会触发搜索

| 类型 | 示例 |
|------|------|
| 短消息 | "你好"、"谢谢" |
| 用户排除 | "不要搜索，直接回答" |
| 创作请求 | "帮我写一个 Python 脚本" |

## 技术细节

### 多后端自动故障转移

```javascript
// 按优先级尝试各个后端
const backends = ['google', 'bing', 'brave'];
for (const backend of backends) {
  try {
    const results = await search(query);
    if (results.length > 0) return { success: true, provider: backend, results };
  } catch (err) {
    // 尝试下一个后端
  }
}
```

### Prompt 注入格式

```
【联网搜索结果】关于"北京今天天气"的实时信息：

📡 搜索结果（来源：google）：

1. **北京今日天气 - 中国天气网**
   晴转多云，15-25°C，空气质量良好
   来源：http://...

回答指南：
- 优先使用上述搜索结果中的信息
- 如果搜索结果不足，可以补充你的已有知识
- 自然地引用信息
- 用简洁清晰的中文回答
```

## 文件清单

| 文件 | 作用 |
|------|------|
| `services/searchService.js` | 搜索服务核心（多后端 + 触发判断） |
| `services/webSearchMiddleware.js` | 中间件（封装搜索增强聊天） |
| `routes/chat.js` | 聊天路由（已集成中间件） |

## 优势

1. **轻量快速** — 无子代理开销，搜索延迟 1-3 秒
2. **不竞争配额** — 搜索和聊天使用独立的 API 调用
3. **多后端容错** — 一个后端失败时自动尝试下一个
4. **兼容任意模型** — 不依赖 function calling
5. **可控性强** — 搜索时机、结果格式完全自主

## 注意事项

1. **API 配额** — Google 免费版每天 100 次查询
2. **响应延迟** — 搜索增加 1-3 秒响应时间
3. **隐私安全** — 搜索查询会发送到第三方 API

## 更新日志

- **v4.0** (2026-05-07): 直接在 Node.js 层执行搜索，移除子代理依赖
- **v3.0**: 使用 OpenClaw 内置工具
- **v2.0**: 通用中间件方案
- **v1.0**: 初始实现
