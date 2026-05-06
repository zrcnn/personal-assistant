<template>
  <div class="system-page">
    <div class="page-header">
      <button class="back-btn" @click="$router.back()" title="返回">←</button>
      <h2>🖥️ 系统监控</h2>
      <span class="refresh-badge" :class="{ live: isLive }">
        {{ isLive ? '🔴 实时' : '⏸️ 已暂停' }}
      </span>
      <button class="toggle-btn" @click="isLive = !isLive">
        {{ isLive ? '暂停' : '实时' }}
      </button>
    </div>

    <div v-if="!info" class="loading">加载中...</div>

    <template v-else>
      <!-- System Overview -->
      <div class="info-card system-overview">
        <div class="info-item">
          <span class="label">主机名</span>
          <span class="value">{{ info.system.hostname }}</span>
        </div>
        <div class="info-item">
          <span class="label">系统</span>
          <span class="value">{{ info.system.platform }}</span>
        </div>
        <div class="info-item">
          <span class="label">架构</span>
          <span class="value">{{ info.system.arch }}</span>
        </div>
        <div class="info-item">
          <span class="label">运行时间</span>
          <span class="value">{{ info.uptimeStr }}</span>
        </div>
      </div>

      <!-- CPU -->
      <div class="info-card">
        <h3>🧠 CPU</h3>
        <div class="metric-detail">
          <span class="metric-label">{{ info.cpu.model }}</span>
          <span class="metric-sub">核心数: {{ info.cpu.cores }}</span>
        </div>
        <div class="progress-section">
          <div class="progress-bar">
            <div class="progress-fill cpu" :style="{ width: info.cpu.usage + '%' }"></div>
          </div>
          <span class="progress-text">{{ info.cpu.usage }}%</span>
        </div>
        <div class="load-avg">
          <span class="label">负载均衡</span>
          <span class="values">
            1min: {{ info.cpu.loadAvg[0].toFixed(2) }} · 
            5min: {{ info.cpu.loadAvg[1].toFixed(2) }} · 
            15min: {{ info.cpu.loadAvg[2].toFixed(2) }}
          </span>
        </div>
      </div>

      <!-- Memory -->
      <div class="info-card">
        <h3>💾 内存</h3>
        <div class="progress-section">
          <div class="progress-bar">
            <div class="progress-fill memory" :style="{ width: info.memory.usagePercent + '%' }"></div>
          </div>
          <span class="progress-text">{{ info.memory.usagePercent }}%</span>
        </div>
        <div class="mem-details">
          <div class="mem-row">
            <span>已用</span>
            <span>{{ info.memory.used }} MB</span>
          </div>
          <div class="mem-row">
            <span>可用</span>
            <span>{{ info.memory.available }} MB</span>
          </div>
          <div class="mem-row">
            <span>总计</span>
            <span>{{ info.memory.total }} MB</span>
          </div>
        </div>
      </div>

      <!-- Temperature -->
      <div class="info-card" v-if="info.temperature.sensors.length > 0">
        <h3>🌡️ 温度</h3>
        <div class="temp-grid">
          <div v-for="sensor in info.temperature.sensors" :key="sensor.name" class="temp-item">
            <span class="temp-name">{{ getTempName(sensor.name) }}</span>
            <span class="temp-value" :class="getTempClass(sensor.temp)">
              {{ sensor.temp }}°C
            </span>
          </div>
        </div>
      </div>

      <!-- Battery -->
      <div class="info-card" v-if="info.battery">
        <h3>🔋 电池</h3>
        <div class="battery-grid">
          <div class="battery-main">
            <div class="battery-visual">
              <div class="battery-level" :style="{ width: info.battery.capacity + '%' }" :class="getBatteryClass(info.battery.capacity)"></div>
            </div>
            <span class="battery-percent">{{ info.battery.capacity }}%</span>
          </div>
          <div class="battery-details">
            <div class="bat-item">
              <span>状态</span>
              <span>{{ info.battery.status }}</span>
            </div>
            <div class="bat-item" v-if="info.battery.health">
              <span>健康度</span>
              <span>{{ info.battery.health }}%</span>
            </div>
            <div class="bat-item" v-if="info.battery.power">
              <span>功率</span>
              <span>{{ info.battery.power }}W</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Disk -->
      <div class="info-card">
        <h3>💿 磁盘</h3>
        <div v-for="disk in info.disk" :key="disk.mount" class="disk-item">
          <div class="disk-header">
            <span class="disk-mount">{{ disk.mount }}</span>
            <span class="disk-usage" :class="getDiskClass(disk.usagePercent)">{{ disk.usagePercent }}%</span>
          </div>
          <div class="progress-bar small">
            <div class="progress-fill disk" :style="{ width: disk.usagePercent + '%' }"></div>
          </div>
          <div class="disk-details">
            <span>已用 {{ disk.used }}</span>
            <span>可用 {{ disk.available }}</span>
            <span>总计 {{ disk.total }}</span>
          </div>
        </div>
      </div>

      <!-- Network -->
      <div class="info-card">
        <h3>🌐 网络</h3>
        <!-- Tabs -->
        <div class="net-tabs">
          <button 
            class="net-tab" 
            :class="{ active: trafficPeriod === 'daily' }" 
            @click="trafficPeriod = 'daily'; loadTraffic()"
          >
            今日
          </button>
          <button 
            class="net-tab" 
            :class="{ active: trafficPeriod === 'monthly' }" 
            @click="trafficPeriod = 'monthly'; loadTraffic()"
          >
            本月
          </button>
        </div>
        <!-- Current iface info -->
        <div v-if="info.network && info.network.length > 0" class="net-current">
          <div v-for="iface in info.network" :key="iface.name" class="net-item">
            <span class="net-name">{{ iface.name }}</span>
            <span class="net-stat">↓ {{ iface.rx }}</span>
            <span class="net-stat">↑ {{ iface.tx }}</span>
          </div>
        </div>
        <!-- Traffic stats -->
        <div v-if="trafficData.interfaces.length > 0" class="traffic-stats">
          <div v-for="iface in trafficData.interfaces" :key="iface.iface" class="traffic-section">
            <div class="traffic-section-title">
              <span>{{ iface.iface }}</span>
              <span class="traffic-total">总计 {{ formatBytes(iface.stats.reduce((s, d) => s + d.total, 0)) }}</span>
            </div>
            <div class="traffic-chart">
              <div 
                v-for="(stat, idx) in iface.stats.slice(-12)" 
                :key="stat.period + idx" 
                class="traffic-bar-group"
                :title="`${stat.period}\n↓ ${formatBytes(stat.rx)}\n↑ ${formatBytes(stat.tx)}`"
              >
                <div class="traffic-bar-inner">
                  <div 
                    class="traffic-bar rx" 
                    :style="{ height: getBarHeight(stat.rx, maxTraffic) + '%' }"
                  ></div>
                  <div 
                    class="traffic-bar tx" 
                    :style="{ height: getBarHeight(stat.tx, maxTraffic) + '%' }"
                  ></div>
                </div>
                <span class="traffic-bar-label">{{ getBarLabel(stat.period, trafficPeriod) }}</span>
              </div>
            </div>
            <div class="traffic-legend">
              <span><span class="legend-rx"></span> 下载</span>
              <span><span class="legend-tx"></span> 上传</span>
            </div>
          </div>
        </div>
        <div v-else-if="trafficLoading" class="traffic-loading">
          加载中...
        </div>
        <div v-else class="traffic-empty">
          暂无流量统计数据
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import api from '../api/index'

const info = ref(null)
const isLive = ref(true)
const trafficPeriod = ref('daily')
const trafficData = ref({ period: 'daily', interfaces: [] })
const trafficLoading = ref(false)
let timer = null

async function loadInfo() {
  try {
    const res = await api.get('/api/system/info')
    info.value = res.data
  } catch {
    // silently fail
  }
}

async function loadTraffic() {
  trafficLoading.value = true
  try {
    const res = await api.get(`/api/system/traffic?period=${trafficPeriod.value}`)
    trafficData.value = res.data
  } catch {
    trafficData.value = { period: trafficPeriod.value, interfaces: [] }
  }
  trafficLoading.value = false
}

function getTempClass(temp) {
  if (temp >= 80) return 'critical'
  if (temp >= 60) return 'warning'
  return 'normal'
}

function getBatteryClass(pct) {
  if (pct <= 20) return 'critical'
  if (pct <= 50) return 'warning'
  return 'normal'
}

function getDiskClass(percent) {
  if (percent >= 90) return 'critical'
  if (percent >= 75) return 'warning'
  return 'normal'
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  if (bytes < 1024 * 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
  return (bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2) + ' TB'
}

const maxTraffic = computed(() => {
  let max = 0
  for (const iface of trafficData.value.interfaces) {
    for (const stat of iface.stats) {
      max = Math.max(max, stat.rx, stat.tx)
    }
  }
  return max || 1
})

function getBarHeight(value, maxVal) {
  if (maxVal <= 0) return 0
  return Math.max(2, (value / maxVal) * 100)
}

function getBarLabel(period, periodType) {
  if (periodType === 'daily') {
    // Extract hour from "YYYY-MM-DD HH:00"
    const parts = period.split(' ')
    return parts[1] || ''
  } else {
    // Extract MM-DD from "YYYY-MM-DD"
    const parts = period.split('-')
    return `${parts[1]}/${parts[2]}`
  }
}

const TEMP_NAME_MAP = {
  'acpitz': '主板',
  'pch_skylake': '芯片组',
  'x86_pkg_temp': 'CPU 封装',
  'coretemp': 'CPU 核心',
  'cpu_thermal': 'CPU',
  'battery': '电池',
  'iwlwifi': '无线网卡',
  'soc_thermal': 'SoC'
}

function getTempName(name) {
  return TEMP_NAME_MAP[name] || name
}

onMounted(() => {
  loadInfo()
  loadTraffic()
  timer = setInterval(() => {
    if (isLive.value) { loadInfo() }
  }, 3000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.system-page {
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

.page-header h2 {
  font-size: 20px;
  color: var(--text-primary);
}

.refresh-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.refresh-badge.live {
  background: rgba(46, 204, 113, 0.15);
  color: #2ecc71;
}

.toggle-btn {
  margin-left: auto;
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition);
}

.toggle-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.loading {
  text-align: center;
  color: var(--text-muted);
  padding: 60px;
}

.info-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 16px;
}

.info-card h3 {
  font-size: 16px;
  color: var(--text-primary);
  margin-bottom: 16px;
}

/* System Overview */
.system-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item .label {
  font-size: 12px;
  color: var(--text-muted);
}

.info-item .value {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

/* Metric Detail */
.metric-detail {
  margin-bottom: 12px;
}

.metric-label {
  font-size: 14px;
  color: var(--text-primary);
  display: block;
  margin-bottom: 2px;
}

.metric-sub {
  font-size: 12px;
  color: var(--text-muted);
}

/* Progress Bar */
.progress-section {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.progress-bar {
  flex: 1;
  height: 12px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  overflow: hidden;
}

.progress-bar.small {
  height: 8px;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  border-radius: 6px;
  transition: width 0.5s ease;
}

.progress-fill.cpu { background: linear-gradient(90deg, #3498db, #2980b9); }
.progress-fill.memory { background: linear-gradient(90deg, #9b59b6, #8e44ad); }
.progress-fill.disk { background: linear-gradient(90deg, #e67e22, #d35400); }

.progress-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  min-width: 48px;
  text-align: right;
}

/* Load Average */
.load-avg {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.load-avg .label {
  color: var(--text-muted);
}

.load-avg .values {
  color: var(--text-secondary);
  font-family: 'Fira Code', monospace;
}

/* Memory Details */
.mem-details {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: var(--text-secondary);
}

.mem-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}

.mem-row span:first-child {
  color: var(--text-muted);
}

/* Temperature */
.temp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}

.temp-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
}

.temp-name {
  font-size: 13px;
  color: var(--text-secondary);
}

.temp-value {
  font-size: 18px;
  font-weight: 700;
}

.temp-value.normal { color: #2ecc71; }
.temp-value.warning { color: #f39c12; }
.temp-value.critical { color: #e74c3c; }

/* Battery */
.battery-grid {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.battery-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.battery-visual {
  width: 60px;
  height: 28px;
  border: 2px solid var(--text-secondary);
  border-radius: 4px;
  padding: 2px;
  position: relative;
}

.battery-visual::after {
  content: '';
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 12px;
  background: var(--text-secondary);
  border-radius: 0 2px 2px 0;
}

.battery-level {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s ease;
}

.battery-level.normal { background: #2ecc71; }
.battery-level.warning { background: #f39c12; }
.battery-level.critical { background: #e74c3c; }

.battery-percent {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: 'Fira Code', monospace;
}

.battery-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bat-item {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  font-size: 13px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}

.bat-item span:first-child { color: var(--text-muted); }
.bat-item span:last-child { color: var(--text-primary); font-weight: 500; }

/* Disk */
.disk-item {
  margin-bottom: 12px;
}

.disk-item:last-child {
  margin-bottom: 0;
}

.disk-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.disk-mount {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.disk-usage {
  font-size: 14px;
  font-weight: 600;
}

.disk-usage.normal { color: #2ecc71; }
.disk-usage.warning { color: #f39c12; }
.disk-usage.critical { color: #e74c3c; }

.disk-details {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-muted);
}

/* Network tabs */
.net-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.net-item:last-child {
  border-bottom: none;
}

.net-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 80px;
}

.net-stat {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: 'Fira Code', monospace;
}

.net-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.net-tab {
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition);
}

.net-tab:hover {
  color: var(--text-primary);
}

.net-tab.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.net-current {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

/* Traffic stats */
.traffic-stats {
  margin-top: 4px;
}

.traffic-section {
  margin-bottom: 16px;
}

.traffic-section:last-child {
  margin-bottom: 0;
}

.traffic-section-title {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 10px;
}

.traffic-section-title span:first-child {
  color: var(--text-primary);
  font-weight: 500;
}

.traffic-total {
  color: var(--text-muted);
  font-family: 'Fira Code', monospace;
}

.traffic-chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 80px;
  padding: 4px 0;
}

.traffic-bar-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.traffic-bar-inner {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 60px;
  width: 100%;
  justify-content: center;
}

.traffic-bar {
  width: 6px;
  min-height: 2px;
  border-radius: 2px 2px 0 0;
  transition: height 0.3s ease;
}

.traffic-bar.rx {
  background: linear-gradient(180deg, #3498db, #2980b9);
}

.traffic-bar.tx {
  background: linear-gradient(180deg, #9b59b6, #8e44ad);
}

.traffic-bar-label {
  font-size: 10px;
  color: var(--text-muted);
  font-family: 'Fira Code', monospace;
}

.traffic-legend {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
}

.legend-rx,
.legend-tx {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  margin-right: 4px;
  vertical-align: middle;
}

.legend-rx { background: #3498db; }
.legend-tx { background: #9b59b6; }

.traffic-loading,
.traffic-empty {
  text-align: center;
  color: var(--text-muted);
  padding: 20px;
  font-size: 13px;
}

/* Responsive */
@media (max-width: 768px) {
  .system-page {
    padding: 12px;
  }

  .page-header {
    flex-wrap: wrap;
  }

  .system-overview {
    grid-template-columns: repeat(2, 1fr);
  }

  .mem-details {
    flex-direction: column;
    gap: 0;
  }
}
</style>
