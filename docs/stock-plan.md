# PA 股票分析系统 — 开发规划

## 架构设计

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  浏览器前端  │ ──► │  Node.js API │ ──► │  OpenClaw Gateway │
│  (Vue3)     │     │  :8090       │     │  :18789          │
└─────────────┘     └──────┬───────┘     └──────────────────┘
                           │
                    ┌──────┴───────┐
                    │ Python API   │
                    │  :8091       │
                    └──────┬───────┘
                           │
                    ┌──────┴───────┐
                    │ 腾讯/东财/新浪│
                    │ 股票数据源   │
                    └──────────────┘
```

## 与对话联动的核心思路

1. **对话中输入股票代码** → 识别股票关键词（如 `sh600519`、`贵州茅台`、`AAPL`）
2. **AI 自动调用工具** → 通过 OpenClaw 工具调用机制，触发股票分析
3. **返回分析结果到对话** → 以 Markdown 格式（含表格、涨跌色、指标）
4. **工具箱页面** → 独立的股票分析面板，可搜索、添加自选、查看K线图

## 功能模块

### 1. Python FastAPI 服务 (:8091)
- `GET /api/stock/realtime?code=sh600519` — 实时行情
- `GET /api/stock/analysis?code=sh600519` — 综合分析报告
- `GET /api/stock/history?code=sh600519&days=30` — 历史数据
- `GET /api/stock/search?keyword=茅台` — 股票搜索
- `GET /api/stock/suggest` — 热门推荐
- `POST /api/watchlist` — 自选股管理（CRUD）
- `GET /api/stock/kline?code=sh600519&period=daily` — K线数据

### 2. 对话联动
- Node.js 后端代理股票 API，转发给 OpenClaw 作为 tool
- 在聊天中提到股票关键词时，AI 自动调用分析
- 支持：`帮我分析一下茅台`、`sh600519 怎么样`、`看一下苹果股价`

### 3. 前端股票面板 (StockPanel.vue)
- 搜索框（代码/名称模糊搜索）
- 实时行情卡片（价格、涨跌幅、成交量）
- 自选股列表
- K线图表（ECharts/TradingView）
- 分析报告面板
- 与对话互通：在工具箱分析结果可直接「发送到对话」

### 4. 技术指标
- MACD、RSI、KDJ、布林带、MA均线
- 成交量分析
- 综合评分（买入/持有/卖出）

## 开发顺序

### Phase 1: Python 股票 API 服务
1. 创建 FastAPI 骨架
2. 迁移现有 stock_analyzer 核心逻辑
3. 实现 REST API 接口
4. 自选股持久化（MySQL）
5. Docker/自启配置

### Phase 2: 对话联动
1. Node.js 后端添加股票代理路由
2. OpenClaw 工具注册（stock_query, stock_analysis）
3. 关键词识别和自动触发

### Phase 3: 前端股票面板
1. StockPanel.vue 组件
2. 搜索和行情卡片
3. 自选股管理
4. K线图表（ECharts）
5. 「发送到对话」按钮

### Phase 4: 完善体验
1. 实时推送（WebSocket / 定时轮询）
2. 预警功能（价格突破提醒）
3. 历史分析记录
4. 手机端适配

## 技术选型
- Python: FastAPI + uvicorn
- 前端图表: ECharts (轻量、中文友好)
- 数据源: 腾讯财经 (主力) + 东方财富 + 新浪 (备用)
- 缓存: 内存缓存 + MySQL 持久化
