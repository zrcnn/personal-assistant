<template>
  <div class="model-usage-page">
    <div class="page-header">
      <button class="back-btn" @click="$router.back()" title="返回">←</button>
      <h2>📊 模型用量分析</h2>
      <p class="page-desc" v-if="stats">共 {{ stats.totalSessions }} 个会话 · {{ stats.totalRequests }} 次模型调用</p>
      <button class="refresh-btn" @click="fetchData" :disabled="loading">
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

      <!-- Pie chart (CSS) -->
      <div class="chart-section" v-if="totalForPie > 0">
        <h3>占比分布</h3>
        <div class="pie-container">
          <div
            class="pie"
            :style="pieStyle"
            :title="pieTooltip"
          ></div>
          <div class="pie-legend">
            <div v-for="cat in sortedCategories" :key="'legend-' + cat.key" class="legend-item">
              <span class="legend-dot" :style="{ background: cat.color }"></span>
              <span class="legend-text">{{ cat.name }}</span>
              <span class="legend-pct">{{ cat.percentage }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const stats = ref(null)
const loading = ref(false)

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

async function fetchData() {
  loading.value = true
  try {
    const resp = await fetch('/api/model-usage', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
    if (!resp.ok) throw new Error('请求失败')
    stats.value = await resp.json()
  } catch (err) {
    console.error('获取模型用量失败:', err)
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)
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
