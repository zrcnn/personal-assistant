<template>
  <div class="stock-page">
    <div class="page-header">
      <button class="back-btn" @click="$router.push('/tools')">← 返回</button>
      <h2>💰 股票分析</h2>
    </div>

    <!-- Search -->
    <div class="search-bar">
      <div class="search-input-wrapper">
        <span class="search-icon">🔍</span>
        <input
          v-model="keyword"
          @input="handleSearch"
          placeholder="输入股票代码或名称搜索..."
          class="search-input"
        />
        <button v-if="keyword" class="search-clear" @click="clearSearch">✕</button>
      </div>
    </div>

    <!-- Search Results -->
    <div v-if="searchResults.length > 0" class="search-results">
      <div v-for="item in searchResults" :key="item.code" class="search-item" @click="selectStock(item)">
        <span class="search-name">{{ item.name }}</span>
        <span class="search-code">{{ item.code }}</span>
        <span class="search-market">{{ item.market }}</span>
      </div>
    </div>

    <!-- Hot Suggestions -->
    <div v-if="!selectedCode && searchResults.length === 0" class="section">
      <h3 class="section-title">🔥 热门推荐</h3>
      <div class="hot-grid">
        <div v-for="s in suggestions" :key="s.code" class="hot-item" @click="loadStock(s.code)">
          <span class="hot-name">{{ s.name }}</span>
          <span class="hot-code">{{ s.code }}</span>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">⚠️</span>
      <span class="error-text">{{ error }}</span>
      <button class="retry-btn" @click="refreshStock">重试</button>
    </div>

    <!-- Stock Detail -->
    <div v-if="stockData" class="section">
      <div class="stock-header">
        <div class="stock-title">
          <h3>{{ stockData.name }}</h3>
          <span class="stock-code-tag">{{ stockData.code }}</span>
        </div>
        <div class="stock-price-row">
          <span class="current-price" :class="priceColor">{{ stockData.current_price }}</span>
          <div class="price-change" :class="priceColor">
            <span>{{ stockData.change > 0 ? '+' : '' }}{{ stockData.change }}</span>
            <span>{{ stockData.change_pct > 0 ? '+' : '' }}{{ stockData.change_pct }}%</span>
          </div>
        </div>
        <div class="stock-meta">
          <div class="meta-item"><span>开盘</span><span>{{ stockData.open }}</span></div>
          <div class="meta-item"><span>最高</span><span>{{ stockData.high }}</span></div>
          <div class="meta-item"><span>最低</span><span>{{ stockData.low }}</span></div>
          <div class="meta-item"><span>昨收</span><span>{{ stockData.prev_close }}</span></div>
          <div class="meta-item"><span>成交量</span><span>{{ formatVolume(stockData.volume) }}</span></div>
          <div class="meta-item"><span>成交额</span><span>{{ formatAmount(stockData.amount) }}</span></div>
          <div class="meta-item"><span>换手率</span><span>{{ stockData.turnover_rate }}%</span></div>
          <div class="meta-item"><span>市盈率</span><span>{{ stockData.pe_ratio }}</span></div>
        </div>
        <div class="stock-actions">
          <button class="action-btn watchlist-btn" :class="{ active: isInWatchlist }" @click="toggleWatchlist">
            {{ isInWatchlist ? '⭐ 已自选' : '☆ 加自选' }}
          </button>
          <button class="action-btn chat-btn" @click="sendToChat">💬 发送到对话</button>
          <button class="action-btn refresh-btn" @click="refreshStock">🔄 刷新</button>
        </div>
      </div>
    </div>

    <!-- Analysis -->
    <div v-if="analysis" class="section">
      <h3 class="section-title">📊 分析报告</h3>
      <div class="analysis-card" :class="analysis.recommendation_color">
        <div class="recommendation">
          <span class="rec-label">综合评级</span>
          <span class="rec-value">{{ analysis.recommendation }}</span>
          <span class="rec-score">{{ analysis.score }}/100</span>
        </div>
        <div class="indicators" v-if="analysis.indicators && Object.keys(analysis.indicators).length > 0">
          <div v-for="(val, key) in analysis.indicators" :key="key" class="indicator">
            <span class="ind-key">{{ key.toUpperCase() }}</span>
            <span class="ind-val" :class="val.signal">{{ val.signal_name }} ({{ val.rsi || val.dif || val.k || '--' }})</span>
          </div>
        </div>
        <p class="analysis-note">基于实时行情数据的快速分析，仅供参考，不构成投资建议。</p>
      </div>
    </div>

    <!-- K-Line Chart -->
    <div v-if="selectedCode && klineData.length > 0" class="section">
      <div class="kline-header">
        <h3 class="section-title">📈 K线走势</h3>
        <div class="kline-tabs">
          <button
            v-for="tab in klineTabs"
            :key="tab.value"
            :class="['tab-btn', { active: klineType === tab.value }]"
            @click="switchKlineType(tab.value)"
          >{{ tab.label }}</button>
        </div>
      </div>
      <div class="kline-chart-wrapper">
        <canvas ref="klineCanvas" height="280"></canvas>
      </div>
      <div v-if="klineLoading" class="kline-loading">加载中...</div>
    </div>

    <!-- Market Indices -->
    <div v-if="marketIndices.length > 0" class="section">
      <h3 class="section-title">🏛️ 市场指数</h3>
      <div class="indices-grid">
        <div v-for="idx in marketIndices" :key="idx.code" class="index-card" :class="idx.trend">
          <div class="idx-header">
            <span class="idx-name">{{ idx.name }}</span>
            <span class="idx-pct" :class="idx.trend">{{ idx.change_pct > 0 ? '+' : '' }}{{ idx.change_pct }}%</span>
          </div>
          <div class="idx-price">{{ idx.current }}</div>
          <div class="idx-sparkline">
            <canvas :ref="el => setSparklineRef(el, idx.code)" height="40"></canvas>
          </div>
        </div>
      </div>
    </div>

    <!-- Sector Heatmap -->
    <div v-if="sectors.length > 0" class="section">
      <h3 class="section-title">🔥 行业板块</h3>
      <div class="sector-grid">
        <div v-for="sec in sectors" :key="sec.code" class="sector-item" :class="sec.trend">
          <div class="sector-info">
            <span class="sec-name">{{ sec.name }}</span>
            <span class="sec-pct" :class="sec.trend">{{ sec.change_pct > 0 ? '+' : '' }}{{ sec.change_pct }}%</span>
          </div>
          <div class="sector-sparkline">
            <canvas :ref="el => setSectorSparklineRef(el, sec.code)" height="30"></canvas>
          </div>
        </div>
      </div>
    </div>

    <!-- Watchlist -->
    <div class="section">
      <h3 class="section-title">⭐ 我的自选</h3>
      <div v-if="watchlist.length === 0" class="empty-watchlist">暂无自选股，搜索并添加</div>
      <div v-for="item in watchlist" :key="item.code" class="watchlist-item" @click="loadStock(item.code)">
        <div class="wl-info">
          <span class="wl-name">{{ item.name }}</span>
          <span class="wl-code">{{ item.code }}</span>
        </div>
        <div class="wl-price" v-if="item.current_price">
          <span class="wl-current">{{ item.current_price }}</span>
          <span class="wl-change" :class="item.change_pct > 0 ? 'up' : item.change_pct < 0 ? 'down' : ''">
            {{ item.change_pct > 0 ? '+' : '' }}{{ item.change_pct }}%
          </span>
        </div>
        <button class="wl-remove" @click.stop="removeWatchlist(item.code)" title="删除">✕</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api/index'

const router = useRouter()

const keyword = ref('')
const searchResults = ref([])
const suggestions = ref([])
const stockData = ref(null)
const analysis = ref(null)
const selectedCode = ref('')
const watchlist = ref([])
const isInWatchlist = ref(false)
const loading = ref(false)
const error = ref('')

// K-line
const klineData = ref([])
const klineType = ref(101) // 101=日K, 102=周K
const klineLoading = ref(false)
const klineCanvas = ref(null)
const klineTabs = [
  { label: '日K', value: 101 },
  { label: '周K', value: 102 },
  { label: '折线', value: 'line' },
]

// Market
const marketIndices = ref([])
const sectors = ref([])
const sparklineRefs = ref({})
const sectorSparklineRefs = ref({})
const sectorKlineData = ref({})

let searchTimer = null
let refreshTimer = null

const priceColor = computed(() => {
  if (!stockData.value) return ''
  const pct = stockData.value.change_pct
  return pct > 0 ? 'up' : pct < 0 ? 'down' : ''
})

function handleSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    if (keyword.value.trim().length < 1) {
      searchResults.value = []
      return
    }
    try {
      const res = await api.get('/stock/search', { baseURL: '/stock-api', params: { keyword: keyword.value } })
      searchResults.value = res.data.results || []
    } catch {
      searchResults.value = []
    }
  }, 300)
}

function clearSearch() {
  keyword.value = ''
  searchResults.value = []
}

function selectStock(item) {
  searchResults.value = []
  keyword.value = ''
  loadStock(item.code)
}

async function loadStock(code) {
  selectedCode.value = code
  loading.value = true
  error.value = ''
  try {
    const [stockRes, analysisRes] = await Promise.all([
      api.get('/stock/realtime', { baseURL: '/stock-api', params: { code } }),
      api.get('/stock/analysis', { baseURL: '/stock-api', params: { code } })
    ])
    stockData.value = stockRes.data
    analysis.value = analysisRes.data
    checkWatchlistStatus()
    loadKline(code)
  } catch (err) {
    console.error('Load stock error:', err)
    error.value = err.response?.status === 429 ? '请求太频繁，请稍后再试' : '加载失败，请重试'
    stockData.value = null
    analysis.value = null
  } finally {
    loading.value = false
  }
}

async function refreshStock() {
  if (!selectedCode.value) return
  await loadStock(selectedCode.value)
}

function formatVolume(v) {
  if (!v) return '--'
  if (v >= 10000) return (v / 10000).toFixed(1) + '万手'
  return v + '手'
}

function formatAmount(a) {
  if (!a) return '--'
  if (a >= 10000) return (a / 10000).toFixed(1) + '亿'
  return a.toFixed(0) + '万'
}

async function loadWatchlist() {
  try {
    const res = await api.get('/api/stock-proxy/watchlist')
    watchlist.value = res.data.watchlist || []
  } catch {
    watchlist.value = []
  }
}

function checkWatchlistStatus() {
  isInWatchlist.value = watchlist.value.some(w => w.code === selectedCode.value)
}

async function toggleWatchlist() {
  if (!stockData.value) return
  try {
    if (isInWatchlist.value) {
      await api.delete('/api/stock-proxy/watchlist', { params: { code: stockData.value.code } })
      watchlist.value = watchlist.value.filter(w => w.code !== stockData.value.code)
    } else {
      await api.post('/api/stock-proxy/watchlist', { code: stockData.value.code })
      watchlist.value.unshift({
        code: stockData.value.code,
        name: stockData.value.name,
        current_price: stockData.value.current_price,
        change_pct: stockData.value.change_pct
      })
    }
    isInWatchlist.value = !isInWatchlist.value
  } catch {
    // silently fail
  }
}

async function removeWatchlist(code) {
  try {
    await api.delete('/api/stock-proxy/watchlist', { params: { code } })
    watchlist.value = watchlist.value.filter(w => w.code !== code)
    if (selectedCode.value === code) isInWatchlist.value = false
  } catch {
    // silently fail
  }
}

function sendToChat() {
  if (!stockData.value) return
  const msg = `帮我分析一下 ${stockData.value.name}（${stockData.value.code}），当前价格 ${stockData.value.current_price}，涨跌幅 ${stockData.value.change_pct > 0 ? '+' : ''}${stockData.value.change_pct}%`
  // Navigate to chat and pass the message
  router.push({ path: '/chat', query: { msg } })
}

async function loadSuggestions() {
  try {
    const res = await api.get('/stock/suggest', { baseURL: '/stock-api' })
    suggestions.value = res.data.suggest || []
  } catch {
    suggestions.value = []
  }
}

// ============ K-Line ============

async function loadKline(code) {
  if (!code) return
  klineLoading.value = true
  try {
    const params = { code, count: 60 }
    if (klineType.value !== 'line') {
      params.klt = klineType.value
    }
    const res = await api.get('/stock/kline', {
      baseURL: '/stock-api',
      params
    })
    klineData.value = res.data.klines || []
    await nextTick()
    drawKlineChart()
  } catch (err) {
    console.error('Kline error:', err)
    klineData.value = []
  } finally {
    klineLoading.value = false
  }
}

function switchKlineType(type) {
  klineType.value = type
  if (selectedCode.value) loadKline(selectedCode.value)
}

function drawKlineChart() {
  const canvas = klineCanvas.value
  if (!canvas || klineData.value.length === 0) return

  if (klineType.value === 'line') {
    drawLineChart()
  } else {
    drawCandlestickChart()
  }
}

function drawCandlestickChart() {
  const canvas = klineCanvas.value
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  ctx.scale(dpr, dpr)

  const w = rect.width
  const h = rect.height
  const data = klineData.value
  const padding = { top: 20, right: 20, bottom: 30, left: 60 }
  const chartW = w - padding.left - padding.right
  const chartH = h - padding.top - padding.bottom

  // Clear
  ctx.clearRect(0, 0, w, h)

  // Calculate range
  const closes = data.map(d => d.close)
  const minPrice = Math.min(...closes) * 0.99
  const maxPrice = Math.max(...closes) * 1.01
  const priceRange = maxPrice - minPrice || 1

  const dates = data.map(d => d.date)

  // Draw grid
  ctx.strokeStyle = 'rgba(128, 128, 128, 0.15)'
  ctx.lineWidth = 0.5
  const gridLines = 4
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (chartH / gridLines) * i
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(w - padding.right, y)
    ctx.stroke()

    // Price label
    const price = maxPrice - (priceRange / gridLines) * i
    ctx.fillStyle = 'rgba(128, 128, 128, 0.7)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    ctx.fillText(price.toFixed(2), padding.left - 8, y + 3)
  }

  // Draw candlesticks
  const candleW = Math.max(3, chartW / data.length * 0.7)
  const gap = chartW / data.length

  for (let i = 0; i < data.length; i++) {
    const d = data[i]
    const x = padding.left + gap * i + gap / 2
    const openY = padding.top + ((maxPrice - d.open) / priceRange) * chartH
    const closeY = padding.top + ((maxPrice - d.close) / priceRange) * chartH
    const highY = padding.top + ((maxPrice - d.high) / priceRange) * chartH
    const lowY = padding.top + ((maxPrice - d.low) / priceRange) * chartH

    const isUp = d.close >= d.open
    ctx.strokeStyle = isUp ? '#e74c3c' : '#2ecc71'
    ctx.fillStyle = isUp ? '#e74c3c' : '#2ecc71'
    ctx.lineWidth = 1

    // Wick (high-low line)
    ctx.beginPath()
    ctx.moveTo(x, highY)
    ctx.lineTo(x, lowY)
    ctx.stroke()

    // Body
    const bodyTop = Math.min(openY, closeY)
    const bodyH = Math.max(Math.abs(closeY - openY), 1)
    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH)
  }

  // Date labels (show ~6 dates)
  ctx.fillStyle = 'rgba(128, 128, 128, 0.7)'
  ctx.font = '9px sans-serif'
  ctx.textAlign = 'center'
  const labelCount = Math.min(6, data.length)
  const step = Math.floor(data.length / labelCount)
  for (let i = 0; i < data.length; i += step) {
    const x = padding.left + gap * i + gap / 2
    const date = dates[i]
    ctx.fillText(date.slice(5), x, h - 8)
  }
}

function drawLineChart() {
  const canvas = klineCanvas.value
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  ctx.scale(dpr, dpr)

  const w = rect.width
  const h = rect.height
  const data = klineData.value
  const padding = { top: 20, right: 20, bottom: 30, left: 60 }
  const chartW = w - padding.left - padding.right
  const chartH = h - padding.top - padding.bottom

  // Clear
  ctx.clearRect(0, 0, w, h)

  // Calculate range
  const closes = data.map(d => d.close)
  const minPrice = Math.min(...closes) * 0.99
  const maxPrice = Math.max(...closes) * 1.01
  const priceRange = maxPrice - minPrice || 1

  const dates = data.map(d => d.date)

  // Draw grid
  ctx.strokeStyle = 'rgba(128, 128, 128, 0.15)'
  ctx.lineWidth = 0.5
  const gridLines = 4
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (chartH / gridLines) * i
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(w - padding.right, y)
    ctx.stroke()

    // Price label
    const price = maxPrice - (priceRange / gridLines) * i
    ctx.fillStyle = 'rgba(128, 128, 128, 0.7)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    ctx.fillText(price.toFixed(2), padding.left - 8, y + 3)
  }

  // Determine line color based on trend
  const firstClose = closes[0]
  const lastClose = closes[closes.length - 1]
  const isUp = lastClose >= firstClose
  const lineColor = isUp ? '#e74c3c' : '#2ecc71'

  // Draw gradient fill
  const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom)
  gradient.addColorStop(0, isUp ? 'rgba(231, 76, 60, 0.2)' : 'rgba(46, 204, 113, 0.2)')
  gradient.addColorStop(1, isUp ? 'rgba(231, 76, 60, 0.02)' : 'rgba(46, 204, 113, 0.02)')

  ctx.beginPath()
  data.forEach((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW
    const y = padding.top + ((maxPrice - d.close) / priceRange) * chartH
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  // Close the path for gradient fill
  const lastX = padding.left + ((data.length - 1) / (data.length - 1)) * chartW
  const lastY = padding.top + ((maxPrice - data[data.length - 1].close) / priceRange) * chartH
  ctx.lineTo(lastX, h - padding.bottom)
  ctx.lineTo(padding.left, h - padding.bottom)
  ctx.closePath()
  ctx.fillStyle = gradient
  ctx.fill()

  // Draw line
  ctx.beginPath()
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 2
  data.forEach((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW
    const y = padding.top + ((maxPrice - d.close) / priceRange) * chartH
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()

  // Draw dots at data points (only show some to avoid clutter)
  const dotStep = Math.max(1, Math.floor(data.length / 10))
  for (let i = 0; i < data.length; i += dotStep) {
    const d = data[i]
    const x = padding.left + (i / (data.length - 1)) * chartW
    const y = padding.top + ((maxPrice - d.close) / priceRange) * chartH
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fillStyle = lineColor
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Date labels
  ctx.fillStyle = 'rgba(128, 128, 128, 0.7)'
  ctx.font = '9px sans-serif'
  ctx.textAlign = 'center'
  const labelCount = Math.min(6, data.length)
  const step = Math.floor(data.length / labelCount)
  for (let i = 0; i < data.length; i += step) {
    const x = padding.left + (i / (data.length - 1)) * chartW
    const date = dates[i]
    ctx.fillText(date.slice(5), x, h - 8)
  }
}

// ============ Market Indices ============

// 行业大类映射表（前端兜底用）
const SECTOR_CATEGORY_MAP = {
  'AI': ['人工智能', 'AI芯片', '算力', '大模型', 'AIGC', '数据要素', '云计算', 'SaaS'],
  '半导体/芯片': ['半导体', '集成电路', '芯片', '光刻胶', '存储芯片', '先进封装'],
  '消费电子': ['消费电子', '其他家电', '智能穿戴', '光学元件'],
  '通信': ['通信设备', '5G', '通信线缆及配套', '光模块', '卫星导航'],
  '计算机': ['计算机设备', '软件开发', '信创', '网络安全', 'IT服务'],
  '电子': ['电子', '元件', 'PCB', '被动元件', '面板'],
  '机器人': ['机器人', '工业自动化', '数控机床', '减速器'],
  '航天军工': ['航天装备', '航空装备', '军工电子', '船舶制造', '兵器'],
  '汽车': ['汽车', '车身附件及饰件', '汽车零部件', '轮胎'],
  '新能源车': ['新能源车', '锂电池', '燃料电池', '充电桩'],
  '医药': ['医药', '化学制药', '中药', '生物制品', '医药商业', '医疗器械'],
  '生物科技': ['生物科技', '基因测序', '创新药', '疫苗'],
  '医疗服务': ['医疗服务', '诊断服务', '医院', '医美'],
  '食品饮料': ['食品饮料', '白酒', '啤酒', '乳制品', '调味品'],
  '家电': ['家电', '白色家电', '小家电'],
  '银行': ['银行'],
  '证券': ['证券'],
  '保险': ['保险'],
  '石油/石化': ['石油', '石油开采', '石化', '油田服务', '油气开采'],
  '煤炭': ['煤炭', '焦炭'],
  '有色金属': ['有色金属', '黄金', '铜', '铝', '锂', '稀土', '贵金属'],
  '钢铁': ['钢铁'],
  '化工': ['化工', '化肥', '农药', '改性塑料', '涂料'],
  '房地产': ['房地产', '房产租赁经纪', '物业管理'],
  '电力': ['电力', '火电', '水电', '核电', '风电', '光伏'],
  '传媒': ['传媒', '游戏', '影视', '广告', '出版', '印刷'],
  '交通运输': ['交通运输', '物流', '港口', '航运', '航空', '铁路'],
}

function mapSectorToCategory(name) {
  for (const [cat, keywords] of Object.entries(SECTOR_CATEGORY_MAP)) {
    for (const kw of keywords) {
      if (name.includes(kw)) return cat
    }
  }
  return null
}

async function fetchSectorsFromEastmoney() {
  // 直接从东方财富获取行业板块数据（浏览器端请求）
  try {
    const url = 'http://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=60&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f12,f14,f2,f3'
    const res = await fetch(url)
    const data = await res.json()
    const items = data.data?.diff || []

    // 聚合为大类
    const categoryMap = {}
    for (const item of items) {
      const rawName = item.f14 || ''
      const category = mapSectorToCategory(rawName)
      if (!category) continue
      const entry = {
        name: rawName,
        code: item.f12 || '',
        current: item.f2 || 0,
        change_pct: item.f3 || 0,
        trend: (item.f3 || 0) >= 0 ? 'up' : 'down',
      }
      if (!categoryMap[category]) categoryMap[category] = []
      categoryMap[category].push(entry)
    }

    // 每个大类取涨幅最高的为代表
    const results = []
    for (const [cat, entries] of Object.entries(categoryMap)) {
      entries.sort((a, b) => b.change_pct - a.change_pct)
      const rep = entries[0]
      results.push({
        name: cat,
        code: rep.code,
        current: rep.current,
        change_pct: rep.change_pct,
        trend: rep.trend,
        sub_count: entries.length,
      })
    }
    results.sort((a, b) => b.change_pct - a.change_pct)
    return results.slice(0, 20)
  } catch (err) {
    console.error('Eastmoney sector fetch error:', err)
    return []
  }
}

async function loadMarketData() {
  try {
    const [indicesRes, sectorsData] = await Promise.all([
      api.get('/market/indices', { baseURL: '/stock-api' }),
      fetchSectorsFromEastmoney(),  // 前端直接获取
    ])
    marketIndices.value = indicesRes.data.indices || []
    sectors.value = sectorsData

    // Load sector kline data for sparklines
    await loadSectorKlines()

    await nextTick()
    drawSparklines()
    drawSectorSparklines()
  } catch (err) {
    console.error('Market data error:', err)
  }
}

async function loadSectorKlines() {
  // Load kline data for each sector (top 10 to avoid too many requests)
  const topSectors = sectors.value.slice(0, 10)
  const promises = topSectors.map(async (sec) => {
    try {
      const res = await api.get('/market/sector/kline', {
        baseURL: '/stock-api',
        params: { code: sec.code, count: 20 }
      })
      sectorKlineData.value[sec.code] = res.data.klines || []
    } catch {
      sectorKlineData.value[sec.code] = []
    }
  })
  await Promise.all(promises)
}

function setSparklineRef(el, code) {
  if (el) sparklineRefs.value[code] = el
}

function setSectorSparklineRef(el, code) {
  if (el) sectorSparklineRefs.value[code] = el
}

function drawSparklines() {
  for (const idx of marketIndices.value) {
    const canvas = sparklineRefs.value[idx.code]
    if (!canvas || !idx.kline || idx.kline.length === 0) continue

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const data = idx.kline
    const closes = data.map(d => d.close)
    const minC = Math.min(...closes)
    const maxC = Math.max(...closes)
    const range = maxC - minC || 1

    const color = idx.trend === 'up' ? '#e74c3c' : '#2ecc71'
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()

    data.forEach((d, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - ((d.close - minC) / range) * (h - 4) - 2
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
}

function drawSectorSparklines() {
  for (const sec of sectors.value) {
    const canvas = sectorSparklineRefs.value[sec.code]
    const data = sectorKlineData.value[sec.code]
    if (!canvas || !data || data.length === 0) continue

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const closes = data.map(d => d.close)
    const minC = Math.min(...closes)
    const maxC = Math.max(...closes)
    const range = maxC - minC || 1

    const color = sec.trend === 'up' ? '#e74c3c' : '#2ecc71'
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()

    data.forEach((d, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - ((d.close - minC) / range) * (h - 4) - 2
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
}

onMounted(() => {
  loadWatchlist()
  loadSuggestions()
  loadMarketData()
  // Auto refresh every 30s
  refreshTimer = setInterval(() => {
    if (selectedCode.value) loadStock(selectedCode.value)
    loadWatchlist()
  }, 30000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.stock-page {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.page-header h2 {
  font-size: 20px;
  color: var(--text-primary);
}

.back-btn {
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition);
}

.back-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* Search */
.search-bar {
  margin-bottom: 20px;
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 10px 14px;
  transition: border-color var(--transition);
}

.search-input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.search-icon { font-size: 16px; }

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 15px;
  color: var(--text-primary);
  outline: none;
}

.search-clear {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 50%;
}

.search-clear:hover { background: var(--bg-hover); }

/* Search Results */
.search-results {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
  overflow: hidden;
}

.search-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background var(--transition);
}

.search-item:hover { background: var(--bg-hover); }

.search-name { flex: 1; font-weight: 500; color: var(--text-primary); }
.search-code { color: var(--text-muted); font-size: 13px; font-family: monospace; }
.search-market { font-size: 11px; color: var(--text-muted); background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px; }

/* Sections */
.section { margin-bottom: 24px; }

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-muted);
  gap: 16px;
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Error State */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 12px;
}

.error-icon { font-size: 32px; }

.error-text {
  color: var(--text-muted);
  font-size: 14px;
}

.retry-btn {
  margin-top: 8px;
  padding: 8px 24px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  transition: all var(--transition);
}

.retry-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.section-title {
  font-size: 16px;
  color: var(--text-primary);
  margin-bottom: 12px;
}

/* Hot Grid */
.hot-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hot-item {
  padding: 8px 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition);
  display: flex;
  align-items: center;
  gap: 6px;
}

.hot-item:hover {
  border-color: var(--accent);
  background: var(--accent-light);
}

.hot-name { font-size: 14px; color: var(--text-primary); font-weight: 500; }
.hot-code { font-size: 12px; color: var(--text-muted); font-family: monospace; }

/* Stock Header */
.stock-header {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
}

.stock-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.stock-title h3 { font-size: 18px; color: var(--text-primary); }

.stock-code-tag {
  font-size: 12px;
  font-family: monospace;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.stock-price-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
}

.current-price {
  font-size: 36px;
  font-weight: 700;
  font-family: 'Fira Code', monospace;
}

.current-price.up { color: #e74c3c; }
.current-price.down { color: #2ecc71; }

.price-change {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  gap: 8px;
}

.price-change.up { color: #e74c3c; }
.price-change.down { color: #2ecc71; }

.stock-meta {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.meta-item {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}

.meta-item span:first-child { color: var(--text-muted); }
.meta-item span:last-child { color: var(--text-primary); font-weight: 500; }

.stock-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition);
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.watchlist-btn.active {
  background: rgba(241, 196, 15, 0.15);
  border-color: #f1c40f;
  color: #f1c40f;
}

.chat-btn:hover { background: rgba(108, 92, 231, 0.15); border-color: var(--accent); color: var(--accent); }

/* Analysis */
.analysis-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
}

.analysis-card.bullish { border-left: 4px solid #e74c3c; }
.analysis-card.bearish { border-left: 4px solid #2ecc71; }
.analysis-card.neutral { border-left: 4px solid #f39c12; }

.recommendation {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.rec-label { color: var(--text-muted); font-size: 14px; }

.rec-value {
  font-size: 24px;
  font-weight: 700;
}

.analysis-card.bullish .rec-value { color: #e74c3c; }
.analysis-card.bearish .rec-value { color: #2ecc71; }
.analysis-card.neutral .rec-value { color: #f39c12; }

.rec-score {
  font-size: 14px;
  color: var(--text-muted);
  font-family: monospace;
}

.indicator {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.ind-key { color: var(--text-muted); font-weight: 500; }

.ind-val.overbought, .ind-val.bullish { color: #e74c3c; }
.ind-val.oversold, .ind-val.bearish { color: #2ecc71; }

.analysis-note {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

/* Watchlist */
.empty-watchlist {
  text-align: center;
  color: var(--text-muted);
  padding: 20px;
  font-size: 14px;
}

.watchlist-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  cursor: pointer;
  transition: all var(--transition);
}

.watchlist-item:hover { border-color: var(--accent); }

.wl-info { flex: 1; }
.wl-name { display: block; font-weight: 500; color: var(--text-primary); font-size: 14px; }
.wl-code { font-size: 12px; color: var(--text-muted); font-family: monospace; }

.wl-price { text-align: right; }

.wl-current {
  display: block;
  font-weight: 600;
  color: var(--text-primary);
  font-family: monospace;
}

.wl-change { font-size: 13px; font-weight: 500; }
.wl-change.up { color: #e74c3c; }
.wl-change.down { color: #2ecc71; }

.wl-remove {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wl-remove:hover { background: rgba(231, 76, 60, 0.15); color: #e74c3c; }

/* K-Line Chart */
.kline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.kline-header .section-title {
  margin-bottom: 0;
}

.kline-tabs {
  display: flex;
  gap: 4px;
}

.tab-btn {
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition);
}

.tab-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--accent-light);
  border-color: var(--accent);
  color: var(--accent);
}

.kline-chart-wrapper {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 12px;
  position: relative;
}

.kline-chart-wrapper canvas {
  width: 100%;
}

.kline-loading {
  text-align: center;
  color: var(--text-muted);
  padding: 20px;
  font-size: 14px;
}

/* Market Indices */
.indices-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.index-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  transition: all var(--transition);
}

.index-card.up { border-left: 3px solid #e74c3c; }
.index-card.down { border-left: 3px solid #2ecc71; }

.idx-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.idx-name {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 14px;
}

.idx-pct {
  font-size: 13px;
  font-weight: 600;
  font-family: monospace;
}

.idx-pct.up { color: #e74c3c; }
.idx-pct.down { color: #2ecc71; }

.idx-price {
  font-size: 22px;
  font-weight: 700;
  font-family: monospace;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.idx-sparkline {
  height: 40px;
  width: 100%;
}

.idx-sparkline canvas {
  width: 100%;
  height: 40px;
}

/* Sector Heatmap */
.sector-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.sector-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: all var(--transition);
}

.sector-item:hover {
  border-color: var(--accent);
}

.sector-item.up { border-left: 3px solid #e74c3c; }
.sector-item.down { border-left: 3px solid #2ecc71; }

.sector-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sec-name {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
}

.sec-pct {
  font-size: 13px;
  font-weight: 600;
  font-family: monospace;
}

.sec-pct.up { color: #e74c3c; }
.sec-pct.down { color: #2ecc71; }

.sector-sparkline {
  height: 30px;
  width: 100%;
}

.sector-sparkline canvas {
  width: 100%;
  height: 30px;
}

/* Responsive */
@media (max-width: 768px) {
  .stock-page { padding: 12px; }

  .current-price { font-size: 28px; }

  .stock-meta {
    grid-template-columns: repeat(3, 1fr);
  }

  .stock-actions {
    justify-content: center;
  }

  .action-btn {
    flex: 1;
    text-align: center;
  }
}
</style>
