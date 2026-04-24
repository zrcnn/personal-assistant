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
import { ref, computed, onMounted, onUnmounted } from 'vue'
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
  try {
    const [stockRes, analysisRes] = await Promise.all([
      api.get('/stock/realtime', { baseURL: '/stock-api', params: { code } }),
      api.get('/stock/analysis', { baseURL: '/stock-api', params: { code } })
    ])
    stockData.value = stockRes.data
    analysis.value = analysisRes.data
    checkWatchlistStatus()
  } catch {
    // silently fail
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

onMounted(() => {
  loadWatchlist()
  loadSuggestions()
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
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition);
}

.back-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
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
