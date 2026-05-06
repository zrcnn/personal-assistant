<template>
  <div class="weather-page">
    <div class="page-header">
      <button class="back-btn" @click="$router.push('/tools')">← 工具箱</button>
      <h2>🌤️ 天气查询</h2>
    </div>

    <div class="search-bar">
      <input v-model="city" placeholder="输入城市名称..." @keyup.enter="fetchWeather" />
      <button @click="fetchWeather" :disabled="loading">{{ loading ? '查询中...' : '查询' }}</button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div v-if="weather" class="weather-content">
      <div class="current-weather">
        <div class="current-left">
          <div class="city-name">{{ weather.city }}</div>
          <div class="current-temp">{{ weather.temp }}°C</div>
          <div class="current-desc">{{ weather.desc }}</div>
          <div class="feels-like">体感温度 {{ weather.feelsLike }}°C</div>
        </div>
        <div class="current-right">
          <div class="weather-icon">{{ weatherIcon }}</div>
          <div class="weather-details">
            <span>💧 湿度: {{ weather.humidity }}%</span>
            <span>💨 风速: {{ weather.windSpeed }}km/h {{ weather.windDir }}</span>
            <span>👁 能见度: {{ weather.visibility }}km</span>
            <span>🌡 气压: {{ weather.pressure }}hPa</span>
            <span>☀️ UV指数: {{ weather.uvIndex }}</span>
          </div>
        </div>
      </div>

      <div v-if="weather.today" class="section">
        <h3>今日温度: {{ weather.today.minTemp }}°C ~ {{ weather.today.maxTemp }}°C</h3>
        <div class="hourly-list">
          <div v-for="h in weather.today.hourly" :key="h.time" class="hourly-item">
            <div class="hourly-time">{{ h.time.slice(0,2) }}:00</div>
            <div class="hourly-icon">{{ getIcon(h.icon) }}</div>
            <div class="hourly-temp">{{ h.temp }}°</div>
          </div>
        </div>
      </div>

      <div v-if="weather.forecast.length" class="section">
        <h3>未来几天</h3>
        <div class="forecast-list">
          <div v-for="f in weather.forecast" :key="f.date" class="forecast-item">
            <div class="forecast-date">{{ f.date.slice(5) }}</div>
            <div class="forecast-desc">{{ f.desc }}</div>
            <div class="forecast-temp">{{ f.minTemp }}° / {{ f.maxTemp }}°</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const city = ref('北京')
const weather = ref(null)
const loading = ref(false)
const error = ref('')

const weatherIcon = computed(() => {
  if (!weather.value) return ''
  return getIcon(weather.value.icon)
})

function getIcon(code) {
  const c = parseInt(code)
  if (c === 113) return '☀️'
  if (c === 116) return '⛅'
  if ([119, 122].includes(c)) return '☁️'
  if ([176, 263, 266, 293, 296, 299, 302, 305, 308, 353, 356, 359].includes(c)) return '🌧️'
  if ([179, 182, 185, 227, 230, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377].includes(c)) return '❄️'
  if ([200, 386, 389, 392, 395].includes(c)) return '⛈️'
  if ([143, 248, 260].includes(c)) return '🌫️'
  return '🌤️'
}

async function fetchWeather() {
  if (!city.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    const resp = await fetch(`/api/tools/weather/${encodeURIComponent(city.value.trim())}`, {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    })
    if (!resp.ok) {
      const data = await resp.json()
      throw new Error(data.error || '查询失败')
    }
    weather.value = await resp.json()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

fetchWeather()
</script>

<style scoped>
.weather-page { max-width: 700px; margin: 0 auto; padding: 20px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h2 { font-size: 20px; color: var(--text-primary); }
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

.search-bar { display: flex; gap: 8px; margin-bottom: 20px; }
.search-bar input { flex: 1; padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); font-size: 14px; }
.search-bar button { padding: 10px 20px; border-radius: var(--radius-md); border: none; background: var(--accent); color: #fff; cursor: pointer; font-size: 14px; }
.search-bar button:disabled { opacity: 0.6; cursor: not-allowed; }

.error-msg { padding: 12px; background: rgba(255,80,80,0.1); border-radius: var(--radius-md); color: #ff5050; margin-bottom: 16px; font-size: 14px; }

.current-weather { display: flex; gap: 24px; padding: 24px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: 20px; }
.current-left { flex: 1; }
.city-name { font-size: 16px; color: var(--text-muted); margin-bottom: 4px; }
.current-temp { font-size: 48px; font-weight: 700; color: var(--text-primary); line-height: 1.1; }
.current-desc { font-size: 18px; color: var(--text-secondary); margin-top: 4px; }
.feels-like { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
.current-right { text-align: center; min-width: 120px; }
.weather-icon { font-size: 64px; margin-bottom: 12px; }
.weather-details { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-muted); }

.section { padding: 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: 16px; }
.section h3 { font-size: 15px; color: var(--text-primary); margin-bottom: 12px; }

.hourly-list { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
.hourly-item { text-align: center; min-width: 60px; padding: 8px; background: var(--bg-tertiary); border-radius: var(--radius-md); }
.hourly-time { font-size: 12px; color: var(--text-muted); }
.hourly-icon { font-size: 20px; margin: 4px 0; }
.hourly-temp { font-size: 14px; color: var(--text-primary); font-weight: 600; }

.forecast-list { display: flex; flex-direction: column; gap: 8px; }
.forecast-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--bg-tertiary); border-radius: var(--radius-md); }
.forecast-date { font-size: 14px; color: var(--text-primary); min-width: 50px; }
.forecast-desc { font-size: 14px; color: var(--text-secondary); flex: 1; text-align: center; }
.forecast-temp { font-size: 14px; color: var(--text-primary); font-weight: 600; min-width: 80px; text-align: right; }

@media (max-width: 768px) {
  .weather-page { padding: 12px; }
  .current-weather { flex-direction: column; gap: 16px; }
  .current-temp { font-size: 36px; }
  .weather-icon { font-size: 48px; }
}
</style>
