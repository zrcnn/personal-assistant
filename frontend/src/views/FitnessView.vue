<template>
  <div class="fitness-page">
    <div class="fitness-header">
      <button class="back-btn" @click="$router.push('/tools')">← 返回</button>
      <h2>🏃 身体素质记录</h2>
      <div class="height-setting" v-if="profile">
        <label>身高：</label>
        <input
          v-if="editingHeight"
          ref="heightInput"
          type="number"
          v-model="tempHeight"
          min="50"
          max="250"
          step="0.1"
          class="height-input"
          @blur="saveHeight"
          @keyup.enter="saveHeight"
        />
        <span v-else class="height-display" @click="startEditHeight">
          {{ profile.height }} cm
          <small>（点击修改）</small>
        </span>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid" v-if="stats.latest">
      <div class="stat-card" v-for="m in displayMetrics" :key="m.key">
        <div class="stat-label">{{ m.label }}</div>
        <div class="stat-value">{{ stats.latest[m.key] ?? '-' }}<span class="stat-unit">{{ m.unit }}</span></div>
        <div class="stat-change" v-if="stats.weekChange[m.key]">
          <span :class="'trend ' + stats.weekChange[m.key].direction">
            {{ formatChange(stats.weekChange[m.key].value) }}
            {{ stats.weekChange[m.key].direction === 'up' ? '↑' : stats.weekChange[m.key].direction === 'down' ? '↓' : '→' }}
          </span>
          <span class="change-label">周</span>
        </div>
        <div class="stat-change" v-if="stats.monthChange[m.key]">
          <span :class="'trend ' + stats.monthChange[m.key].direction">
            {{ formatChange(stats.monthChange[m.key].value) }}
            {{ stats.monthChange[m.key].direction === 'up' ? '↑' : stats.monthChange[m.key].direction === 'down' ? '↓' : '→' }}
          </span>
          <span class="change-label">月</span>
        </div>
        <div class="stat-change" v-if="!stats.weekChange[m.key] && !stats.monthChange[m.key]">
          <span class="no-data">暂无对比数据</span>
        </div>
      </div>
    </div>

    <!-- Chart Section -->
    <div class="chart-section">
      <div class="chart-controls">
        <div class="range-tabs">
          <button :class="{ active: chartRange === 'week' }" @click="setRange('week')">近7天</button>
          <button :class="{ active: chartRange === 'month' }" @click="setRange('month')">近30天</button>
          <button :class="{ active: chartRange === 'year' }" @click="setRange('year')">近一年</button>
        </div>
        <div class="metric-toggles">
          <label v-for="m in allMetrics" :key="m.key" class="toggle-chip" :style="{ borderColor: activeMetrics.has(m.key) ? m.color : '', color: activeMetrics.has(m.key) ? m.color : '' }">
            <input type="checkbox" :checked="activeMetrics.has(m.key)" @change="toggleMetric(m.key)" />
            {{ m.label }}
          </label>
        </div>
      </div>
      <div class="chart-container">
        <canvas ref="chartCanvas"></canvas>
        <div v-if="chartRecords.length === 0" class="chart-empty">
          暂无数据，请先添加记录
        </div>
      </div>
    </div>

    <!-- Add Record Form -->
    <div class="form-section">
      <h3>{{ editingId ? '编辑记录' : '新增记录' }}</h3>
      <form @submit.prevent="submitRecord" class="record-form">
        <div class="form-grid">
          <div class="form-group">
            <label>日期</label>
            <input type="date" v-model="form.record_date" required />
          </div>
          <div class="form-group">
            <label>体重 (kg)</label>
            <input type="number" v-model="form.weight" step="0.1" min="0" max="500" placeholder="如 65.5" />
          </div>
          <div class="form-group">
            <label>体脂率 (%)</label>
            <input type="number" v-model="form.body_fat" step="0.1" min="0" max="100" placeholder="如 18.5" />
          </div>
          <div class="form-group">
            <label>肌肉量 (kg)</label>
            <input type="number" v-model="form.muscle" step="0.1" min="0" max="300" placeholder="如 30.2" />
          </div>
          <div class="form-group">
            <label>水分率 (%)</label>
            <input type="number" v-model="form.water" step="0.1" min="0" max="100" placeholder="如 55.0" />
          </div>
          <div class="form-group">
            <label>基础代谢 (kcal)</label>
            <input type="number" v-model="form.bmr" min="0" max="10000" step="1" placeholder="如 1500" />
          </div>
        </div>
        <div class="form-group full-width">
          <label>备注</label>
          <input type="text" v-model="form.notes" placeholder="选填" />
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">{{ editingId ? '更新' : '添加记录' }}</button>
          <button v-if="editingId" type="button" class="btn-secondary" @click="cancelEdit">取消</button>
        </div>
      </form>
    </div>

    <!-- History Table -->
    <div class="history-section" v-if="allRecords.length > 0">
      <h3>历史记录</h3>
      <div class="table-wrapper">
        <table class="history-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>体重</th>
              <th>体脂</th>
              <th>肌肉</th>
              <th>水分</th>
              <th>BMR</th>
              <th>BMI</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in allRecords" :key="r.id">
              <td>{{ r.record_date }}</td>
              <td>{{ r.weight ?? '-' }}</td>
              <td>{{ r.body_fat ?? '-' }}</td>
              <td>{{ r.muscle ?? '-' }}</td>
              <td>{{ r.water ?? '-' }}</td>
              <td>{{ r.bmr ?? '-' }}</td>
              <td>{{ r.bmi ?? '-' }}</td>
              <td class="actions">
                <button class="btn-icon" @click="editRecord(r)" title="编辑">✏️</button>
                <button class="btn-icon" @click="deleteRecord(r.id)" title="删除">🗑️</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch, nextTick } from 'vue'
import api from '../api'

// Chart.js 动态加载
let chartModule = null
async function loadChart() {
  if (chartModule) return chartModule
  const { Chart, registerables } = await import('chart.js')
  Chart.register(...registerables)
  chartModule = { Chart }
  return chartModule
}

const API = '/api/fitness'
const chartCanvas = ref(null)
const heightInput = ref(null)
let chartInstance = null

// Data
const profile = ref(null)
const stats = ref({ latest: null, weekChange: null, monthChange: null })
const chartRecords = ref([])
const allRecords = ref([])
const chartRange = ref('month')
const activeMetrics = ref(new Set(['weight', 'body_fat', 'muscle', 'bmi']))
const editingId = ref(null)
const editingHeight = ref(false)
const tempHeight = ref(170)

const form = reactive({
  record_date: new Date().toISOString().slice(0, 10),
  weight: '',
  body_fat: '',
  muscle: '',
  water: '',
  bmr: '',
  notes: ''
})

const allMetrics = [
  { key: 'weight', label: '体重', unit: 'kg', color: '#6C9FFF' },
  { key: 'body_fat', label: '体脂率', unit: '%', color: '#FF6B6B' },
  { key: 'muscle', label: '肌肉量', unit: 'kg', color: '#51CF66' },
  { key: 'bmi', label: 'BMI', unit: '', color: '#FFB347' }
]

const displayMetrics = [
  { key: 'weight', label: '体重', unit: ' kg' },
  { key: 'body_fat', label: '体脂率', unit: '%' },
  { key: 'muscle', label: '肌肉量', unit: ' kg' },
  { key: 'bmi', label: 'BMI', unit: '' }
]

// Format change value
function formatChange(val) {
  if (val === null || val === undefined) return '-'
  return (val > 0 ? '+' : '') + val
}

// Profile
async function loadProfile() {
  try {
    const { data } = await api.get(`${API}/profile`)
    profile.value = data
    tempHeight.value = data.height
  } catch (e) {
    console.error('Failed to load profile:', e)
  }
}

function startEditHeight() {
  tempHeight.value = profile.value.height
  editingHeight.value = true
  nextTick(() => heightInput.value?.focus())
}

async function saveHeight() {
  const h = parseFloat(tempHeight.value)
  if (!h || h < 50 || h > 250) {
    editingHeight.value = false
    return
  }
  try {
    const { data } = await api.put(`${API}/profile`, { height: h })
    profile.value = data
  } catch (e) {
    console.error('Failed to save height:', e)
  }
  editingHeight.value = false
}

// Stats
async function loadStats() {
  try {
    const { data } = await api.get(`${API}/stats`)
    stats.value = data
  } catch (e) {
    console.error('Failed to load stats:', e)
  }
}

// Records
async function loadRecords(range) {
  try {
    const { data } = await api.get(`${API}/records`, { params: { range } })
    chartRecords.value = data
    renderChart()
  } catch (e) {
    console.error('Failed to load records:', e)
  }
}

async function loadAllRecords() {
  try {
    const { data } = await api.get(`${API}/records`)
    allRecords.value = data.reverse() // newest first for table
  } catch (e) {
    console.error('Failed to load all records:', e)
  }
}

// Chart
async function renderChart() {
  if (!chartCanvas.value) return

  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }

  const records = chartRecords.value
  if (records.length === 0) return

  const { Chart } = await loadChart()

  const labels = records.map(r => {
    const d = new Date(r.record_date)
    return `${d.getMonth() + 1}/${d.getDate()}`
  })

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const textColor = isDark ? '#aaa' : '#666'

  // Create gradient fills for each metric
  function createGradient(color) {
    const ctx = chartCanvas.value.getContext('2d')
    const gradient = ctx.createLinearGradient(0, 0, 0, chartCanvas.value.clientHeight || 300)
    gradient.addColorStop(0, color + '40')
    gradient.addColorStop(1, color + '05')
    return gradient
  }

  const datasets = allMetrics
    .filter(m => activeMetrics.value.has(m.key))
    .map(m => ({
      label: m.label,
      data: records.map(r => {
        const val = r[m.key]
        return val !== null && val !== undefined ? parseFloat(val) : null
      }),
      borderColor: m.color,
      backgroundColor: createGradient(m.color),
      borderWidth: 2,
      pointRadius: records.length > 60 ? 0 : 4,
      pointBackgroundColor: m.color,
      pointBorderColor: m.color,
      pointHoverRadius: 6,
      tension: 0.4,
      fill: true
    }))
    .filter(ds => ds.data.some(v => v !== null && !isNaN(v)))

  // 动态计算 Y 轴范围，让微小变化也清晰可见
  const allValues = datasets.flatMap(ds => ds.data.filter(v => v !== null && !isNaN(v)))
  let suggestedMin, suggestedMax
  if (allValues.length > 0) {
    const minVal = Math.min(...allValues)
    const maxVal = Math.max(...allValues)
    const range = maxVal - minVal
    // 如果范围太小（<1），用实际范围 ±20% padding；否则 Chart.js 自动处理
    if (range < 1 && range > 0) {
      const padding = Math.max(range * 0.5, 0.1)
      suggestedMin = minVal - padding
      suggestedMax = maxVal + padding
    } else if (range === 0) {
      // 所有值相同
      suggestedMin = minVal - 1
      suggestedMax = maxVal + 1
    }
  }

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
          labels: { color: textColor, usePointStyle: true, padding: 16 }
        },
        tooltip: {
          backgroundColor: isDark ? '#333' : '#fff',
          titleColor: isDark ? '#fff' : '#333',
          bodyColor: isDark ? '#ccc' : '#666',
          borderColor: isDark ? '#555' : '#ddd',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, maxTicksLimit: 12 }
        },
        y: {
          beginAtZero: false,
          grid: { color: gridColor },
          ticks: { color: textColor },
          ...(suggestedMin !== undefined ? { suggestedMin } : {}),
          ...(suggestedMax !== undefined ? { suggestedMax } : {})
        }
      }
    }
  })
}

function setRange(r) {
  chartRange.value = r
  loadRecords(r)
}

function toggleMetric(key) {
  const s = new Set(activeMetrics.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  activeMetrics.value = s
  renderChart()
}

// Form
async function submitRecord() {
  try {
    const payload = {}
    for (const [k, v] of Object.entries(form)) {
      if (k === 'notes') {
        payload[k] = v || null
      } else if (k === 'record_date') {
        payload[k] = v
      } else if (v !== '' && v !== null && v !== undefined) {
        payload[k] = parseFloat(v)
      }
    }

    if (editingId.value) {
      await api.put(`${API}/records/${editingId.value}`, payload)
    } else {
      await api.post(`${API}/records`, payload)
    }

    // Reset form
    Object.assign(form, {
      record_date: new Date().toISOString().slice(0, 10),
      weight: '',
      body_fat: '',
      muscle: '',
      water: '',
      bmr: '',
      notes: ''
    })
    editingId.value = null

    await Promise.all([loadStats(), loadRecords(chartRange.value), loadAllRecords()])
  } catch (e) {
    console.error('Failed to submit record:', e)
    alert(e.response?.data?.error || '操作失败')
  }
}

function editRecord(r) {
  editingId.value = r.id
  form.record_date = r.record_date
  form.weight = r.weight ?? ''
  form.body_fat = r.body_fat ?? ''
  form.muscle = r.muscle ?? ''
  form.water = r.water ?? ''
  form.bmr = r.bmr ?? ''
  form.notes = r.notes ?? ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function cancelEdit() {
  editingId.value = null
  Object.assign(form, {
    record_date: new Date().toISOString().slice(0, 10),
    weight: '',
    body_fat: '',
    muscle: '',
    water: '',
    bmr: '',
    notes: ''
  })
}

async function deleteRecord(id) {
  if (!confirm('确定删除这条记录？')) return
  try {
    await api.delete(`${API}/records/${id}`)
    await Promise.all([loadStats(), loadRecords(chartRange.value), loadAllRecords()])
  } catch (e) {
    console.error('Failed to delete record:', e)
    alert('删除失败')
  }
}

// Watch theme changes for chart
const observer = new MutationObserver(() => {
  if (chartRecords.value.length > 0) renderChart()
})

onMounted(async () => {
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  await loadProfile()
  await Promise.all([loadStats(), loadRecords(chartRange.value), loadAllRecords()])
})
</script>

<style scoped>
.fitness-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.fitness-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.fitness-header h2 {
  font-size: 20px;
  color: var(--text-primary);
}

.back-btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 6px 12px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  font-size: 14px;
  transition: all var(--transition);
}

.back-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.height-setting {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-secondary);
}

.height-display {
  cursor: pointer;
  color: var(--accent);
  font-weight: 500;
}

.height-display small {
  font-weight: 400;
  color: var(--text-muted);
}

.height-input {
  width: 80px;
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--accent);
  color: var(--text-primary);
  border-radius: 4px;
  font-size: 14px;
}

/* Stats Cards */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  text-align: center;
}

.stat-label {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.stat-unit {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-muted);
}

.stat-change {
  display: flex;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
}

.trend.up { color: #FF6B6B; }
.trend.down { color: #51CF66; }
.trend.stable { color: var(--text-muted); }
.change-label { color: var(--text-muted); }
.no-data { color: var(--text-muted); }

/* Chart */
.chart-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 24px;
}

.chart-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.range-tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 3px;
}

.range-tabs button {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  transition: all var(--transition);
}

.range-tabs button.active {
  background: var(--accent);
  color: #fff;
  font-weight: 500;
}

.metric-toggles {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.toggle-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 12px;
  cursor: pointer;
  opacity: 0.5;
  transition: all var(--transition);
  background: transparent;
}

.toggle-chip input {
  display: none;
}

.toggle-chip:has(input:checked) {
  opacity: 1;
}

.chart-container {
  position: relative;
  height: 300px;
}

.chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 14px;
}

/* Form */
.form-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 24px;
}

.form-section h3 {
  font-size: 16px;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.record-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group.full-width {
  grid-column: 1 / -1;
}

.form-group label {
  font-size: 13px;
  color: var(--text-muted);
}

.form-group input {
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color var(--transition);
}

.form-group input:focus {
  border-color: var(--accent);
}

.form-actions {
  display: flex;
  gap: 8px;
}

.btn-primary {
  padding: 8px 24px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: opacity var(--transition);
}

.btn-primary:hover {
  opacity: 0.85;
}

.btn-secondary {
  padding: 8px 24px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

/* History Table */
.history-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 24px;
}

.history-section h3 {
  font-size: 16px;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.table-wrapper {
  overflow-x: auto;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.history-table th,
.history-table td {
  padding: 10px 12px;
  text-align: center;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
}

.history-table th {
  color: var(--text-muted);
  font-weight: 500;
  font-size: 12px;
  text-transform: uppercase;
}

.history-table td.actions {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  border-radius: 4px;
  transition: background var(--transition);
}

.btn-icon:hover {
  background: var(--bg-tertiary);
}

/* Responsive */
@media (max-width: 768px) {
  .fitness-page {
    padding: 12px;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .stat-card {
    padding: 12px;
  }

  .stat-value {
    font-size: 20px;
  }

  .form-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .chart-controls {
    flex-direction: column;
    align-items: flex-start;
  }

  .chart-container {
    height: 250px;
  }

  .history-table {
    font-size: 12px;
  }

  .history-table th,
  .history-table td {
    padding: 8px 6px;
  }

  .height-setting {
    margin-left: 0;
    width: 100%;
  }

  .fitness-header {
    gap: 8px;
  }
}

@media (max-width: 480px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
