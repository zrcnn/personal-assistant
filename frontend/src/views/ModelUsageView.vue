<template>
  <div class="model-usage-page">
    <div class="page-header">
      <button class="back-btn" @click="$router.back()" title="返回">←</button>
      <h2>📊 模型用量分析</h2>
      <p class="page-desc" v-if="stats">共 {{ stats.totalSessions }} 个会话 · {{ stats.totalRequests }} 次模型调用</p>
      <div class="group-toggle">
        <button
          v-for="opt in groupOptions"
          :key="opt.value"
          class="group-btn"
          :class="{ active: currentGroup === opt.value }"
          @click="handleGroupChange(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <button class="refresh-btn" @click="handleRefresh" :disabled="loading">
        {{ loading ? '加载中...' : '刷新' }}
      </button>
    </div>

    <div v-if="loading && !stats" class="loading">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>

    <div v-else-if="stats" class="content">
      <!-- Summary bar chart -->
      <div class="chart-section">
        <h3>调用占比</h3>
        <div class="bar-chart">
          <div v-for="cat in sortedCategories" :key="cat.key" class="bar-row">
            <div class="bar-label">{{ cat.icon }} {{ cat.name }}</div>
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{ width: Math.max(cat.percentage, 2) + '%', background: cat.color }"
              ></div>
            </div>
            <div class="bar-value">
              <span class="bar-count">{{ cat.requests }}</span>
              <span class="bar-pct">({{ cat.percentage }}%)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Category cards -->
      <div class="cards">
        <div
          v-for="cat in sortedCategories"
          :key="cat.key"
          class="card"
          :style="{ '--accent': cat.color }"
        >
          <div class="card-header">
            <span class="card-icon">{{ cat.icon }}</span>
            <span class="card-title">{{ cat.name }}</span>
          </div>
          <div class="card-stats">
            <div class="stat-item">
              <span class="stat-value">{{ cat.requests }}</span>
              <span class="stat-label">总调用</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ cat.percentage }}%</span>
              <span class="stat-label">占比</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ Object.keys(cat.models || {}).length }}</span>
              <span class="stat-label">模型数</span>
            </div>
          </div>
          <!-- Model breakdown -->
          <div v-if="cat.models && Object.keys(cat.models).length > 0" class="model-list">
            <div class="model-divider"></div>
            <div v-for="m in sortedModels(cat.models)" :key="m.name" class="model-row">
              <span class="model-name">{{ m.modelId }}</span>
              <span class="model-count">{{ m.requests }} 次</span>
            </div>
          </div>

        </div>
      </div>

      <!-- Time trend line chart -->
      <div class="chart-section" v-if="timeSeries && timeSeries.length > 0">
        <div class="chart-header">
          <h3>趋势（{{ groupLabels[currentGroup] }}）</h3>
          <div class="line-legend">
            <label v-for="dim in lineDimensions" :key="dim.key" class="line-legend-item">
              <input type="checkbox" v-model="lineLegend[dim.key]" />
              <span class="line-legend-dot" :style="{ background: dim.color }"></span>
              <span>{{ dim.label }}</span>
            </label>
          </div>
        </div>
        <div class="line-chart-body">
          <canvas ref="chartCanvas"></canvas>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'

const stats = ref(null)
const loading = ref(false)
const currentGroup = ref('day')

const groupOptions = [
  { label: '日', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '年', value: 'year' }
]

// 从 localStorage 恢复上次的分组选择
const savedGroup = localStorage.getItem('modelUsageGroup')
if (savedGroup && groupOptions.some(o => o.value === savedGroup)) {
  currentGroup.value = savedGroup
}

const timeSeries = computed(() => stats.value?.timeSeries || [])

const groupLabels = {
  day: '按日',
  week: '按周',
  month: '按月',
  year: '按年'
}

const lineDimensions = [
  { key: 'requests', label: '调用次数', color: '#6366f1' },
  { key: 'inputTokens', label: '输入 token', color: '#22c55e' },
  { key: 'outputTokens', label: '输出 token', color: '#f59e0b' }
]

const lineLegend = ref({ requests: true, inputTokens: true, outputTokens: true })
const chartCanvas = ref(null)
let chartInstance = null

// Chart.js 动态加载
let chartModule = null
async function loadChart() {
  if (chartModule) return chartModule
  const { Chart, registerables } = await import('chart.js')
  Chart.register(...registerables)
  chartModule = { Chart }
  return chartModule
}

function formatToken(num) {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'k'
  return String(num)
}

const displayTimeSeries = computed(() => {
  // 只显示最近 5 个数据点
  return timeSeries.value.slice(-5)
})

const displayXLabels = computed(() => {
  const all = timeSeries.value.map(item => item.label || item.period || '')
  // 只显示最近 5 个
  return all.slice(-5)
})

async function renderChart() {
  if (!chartCanvas.value) return

  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }

  const data = displayTimeSeries.value
  if (data.length === 0) return

  const { Chart } = await loadChart()

  const labels = data.map(item => item.label || item.period || '')

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const textColor = isDark ? '#aaa' : '#666'

  function createGradient(color) {
    const ctx = chartCanvas.value.getContext('2d')
    const gradient = ctx.createLinearGradient(0, 0, 0, chartCanvas.value.clientHeight || 300)
    gradient.addColorStop(0, color + '40')
    gradient.addColorStop(1, color + '05')
    return gradient
  }

  const activeCount = Object.values(lineLegend.value).filter(v => v).length
  const datasets = lineDimensions
    .filter(dim => lineLegend.value[dim.key])
    .map(dim => ({
      label: dim.label,
      data: data.map(item => item[dim.key] || 0),
      borderColor: dim.color,
      backgroundColor: createGradient(dim.color),
      borderWidth: 2,
      pointRadius: 4,
      pointBackgroundColor: dim.color,
      pointBorderColor: dim.color,
      pointHoverRadius: 6,
      tension: 0.4,
      fill: activeCount > 1 // 多于一条线时填充，只有一条时不填充
    }))

  chartInstance = new Chart(chartCanvas.value, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? '#333' : '#fff',
          titleColor: isDark ? '#fff' : '#333',
          bodyColor: isDark ? '#ccc' : '#666',
          borderColor: isDark ? '#555' : '#ddd',
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': ' + formatToken(context.parsed.y)
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, autoSkip: false }
        },
        y: {
          beginAtZero: false,
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            callback: function(value) {
              return formatToken(value)
            }
          }
        }
      }
    }
  })
}

const sortedCategories = computed(() => {
  if (!stats.value?.categories) return []
  return Object.entries(stats.value.categories)
    .map(([key, val]) => ({ key, ...val }))
    .filter(c => c.requests > 0)
    .sort((a, b) => b.requests - a.requests)
})

const totalForPie = computed(() => {
  return sortedCategories.value.reduce((s, c) => s + c.requests, 0)
})

const pieStyle = computed(() => {
  const cats = sortedCategories.value.filter(c => c.requests > 0)
  if (cats.length === 0) return {}
  if (cats.length === 1) return { background: cats[0].color }

  let cumDeg = 0
  const gradients = cats.map((c) => {
    const pct = (c.requests / totalForPie.value) * 100
    const deg = (pct / 100) * 360
    const start = cumDeg
    cumDeg += deg
    return `${c.color} ${start}deg ${cumDeg}deg`
  })

  return {
    background: `conic-gradient(${gradients.join(', ')})`
  }
})

const pieTooltip = computed(() => {
  return sortedCategories.value.map(c => `${c.name}: ${c.requests} (${c.percentage}%)`).join(', ')
})

function sortedModels(models) {
  return Object.values(models).sort((a, b) => b.requests - a.requests)
}

async function fetchData(group) {
  loading.value = true
  try {
    const resp = await fetch(`/api/model-usage?group=${group}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
    if (!resp.ok) throw new Error('请求失败')
    stats.value = await resp.json()
    nextTick(() => renderChart())
  } catch (err) {
    console.error('获取模型用量失败:', err)
  } finally {
    loading.value = false
  }
}

function handleGroupChange(group) {
  currentGroup.value = group
  localStorage.setItem('modelUsageGroup', group)
  fetchData(group)
}

function handleRefresh() {
  fetchData(currentGroup.value)
}

// Watch legend changes
watch(lineLegend, () => {
  renderChart()
}, { deep: true })

// Watch theme changes for chart
const observer = new MutationObserver(() => {
  if (displayTimeSeries.value.length > 0) renderChart()
})

onMounted(async () => {
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  await fetchData(currentGroup.value)
  await nextTick()
  renderChart()
})
</script>

<style scoped>
.model-usage-page {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.back-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.page-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
  flex: 1;
}

.group-toggle {
  display: flex;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--border);
  overflow: hidden;
}

.group-btn {
  padding: 6px 14px;
  border: none;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  border-right: 1px solid var(--border);
}

.group-btn:last-child {
  border-right: none;
}

.group-btn:hover {
  background: var(--bg-hover);
}

.group-btn.active {
  background: var(--accent, var(--text-primary));
  color: #fff;
}

.refresh-btn {
  padding: 6px 16px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn:hover {
  background: var(--bg-hover);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 0;
  color: var(--text-muted);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.chart-header h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.line-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.line-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.line-legend-item input[type="checkbox"] {
  display: none;
}

.line-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
  border: 1px solid currentColor;
}

.line-legend-item:not(:has(input:checked)) .line-legend-dot {
  background: transparent;
  opacity: 0.4;
}

.line-chart-body {
  position: relative;
  height: 300px;
}

/* Bar chart */
.chart-section {
  margin-bottom: 24px;
}

.chart-section h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 12px;
}

.bar-chart {
  background: var(--bg-card);
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--border);
  padding: 16px;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.bar-row:last-child {
  margin-bottom: 0;
}

.bar-label {
  width: 120px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.bar-track {
  flex: 1;
  height: 20px;
  background: var(--bg-hover);
  border-radius: 10px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.6s ease;
}

.bar-value {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-primary);
  min-width: 80px;
}

.bar-count {
  font-weight: 600;
}

.bar-pct {
  color: var(--text-muted);
  font-size: 12px;
}

/* Cards */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 16px;
  border-top: 3px solid var(--accent, var(--border));
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.card-icon {
  font-size: 20px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-stats {
  display: flex;
  gap: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.model-divider {
  height: 1px;
  background: var(--border);
  margin: 12px 0;
}

.model-list {
  margin-top: 8px;
}

.model-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 12px;
}

.model-name {
  color: var(--text-secondary);
  font-family: monospace;
}

.model-count {
  color: var(--text-muted);
  font-weight: 500;
}

/* Pie */
.pie-container {
  display: flex;
  align-items: center;
  gap: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 24px;
}

.pie {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: all 0.4s ease;
}

.pie-legend {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}

.legend-text {
  flex: 1;
  color: var(--text-secondary);
}

.legend-pct {
  font-weight: 600;
  color: var(--text-primary);
}

@media (max-width: 480px) {
  .model-usage-page {
    padding: 16px;
  }

  .bar-label {
    width: 80px;
    font-size: 12px;
  }

  .pie-container {
    flex-direction: column;
    padding: 16px;
  }

  .cards {
    grid-template-columns: 1fr;
  }
}
</style>
