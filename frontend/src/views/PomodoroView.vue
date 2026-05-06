<template>
  <div class="pomodoro-page">
    <div class="page-header">
      <button class="back-btn" @click="$router.push('/tools')">← 工具箱</button>
      <h2>🍅 番茄钟</h2>
    </div>

    <div class="timer-section">
      <div class="mode-tabs">
        <button v-for="m in modes" :key="m.key" class="mode-btn" :class="{ active: mode === m.key }" @click="switchMode(m.key)">{{ m.label }}</button>
      </div>

      <div class="timer-display" :style="{ color: modeColor }">
        <span class="time">{{ displayTime }}</span>
      </div>

      <div class="timer-controls">
        <button class="ctrl-btn" @click="toggleTimer">{{ running ? '⏸ 暂停' : '▶ 开始' }}</button>
        <button class="ctrl-btn secondary" @click="resetTimer">↺ 重置</button>
      </div>

      <div class="session-info">
        <div class="session-dots">
          <span v-for="i in settings.rounds" :key="i" class="dot" :class="{ done: i <= completedSessions }"></span>
        </div>
        <span class="session-text">第 {{ completedSessions }} / {{ settings.rounds }} 轮</span>
      </div>
    </div>

    <div class="stats-section">
      <h3>今日统计</h3>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ todayStats.completed }}</div>
          <div class="stat-label">完成番茄</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ todayStats.minutes }}</div>
          <div class="stat-label">专注分钟</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ todayStats.streak }}</div>
          <div class="stat-label">最长连续</div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3 @click="showSettings = !showSettings" style="cursor:pointer">⚙️ 设置 {{ showSettings ? '▼' : '▶' }}</h3>
      <div v-if="showSettings" class="settings-fields">
        <label>专注时长 (分钟) <input type="number" v-model.number="settings.focus" min="1" max="120" @change="saveSettings" /></label>
        <label>短休息 (分钟) <input type="number" v-model.number="settings.shortBreak" min="1" max="30" @change="saveSettings" /></label>
        <label>长休息 (分钟) <input type="number" v-model.number="settings.longBreak" min="1" max="60" @change="saveSettings" /></label>
        <label>轮次数 <input type="number" v-model.number="settings.rounds" min="1" max="12" @change="saveSettings" /></label>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const modes = [
  { key: 'focus', label: '专注' },
  { key: 'shortBreak', label: '短休息' },
  { key: 'longBreak', label: '长休息' }
]

const mode = ref('focus')
const running = ref(false)
const timeLeft = ref(25 * 60)
const completedSessions = ref(0)
const showSettings = ref(false)
let interval = null

const settings = ref({ focus: 25, shortBreak: 5, longBreak: 15, rounds: 4 })

const modeColor = computed(() => {
  if (mode.value === 'focus') return '#ff6b6b'
  if (mode.value === 'shortBreak') return '#51cf66'
  return '#4a9eff'
})

const displayTime = computed(() => {
  const m = Math.floor(timeLeft.value / 60)
  const s = timeLeft.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const todayStats = computed(() => {
  const key = getTodayKey()
  const data = JSON.parse(localStorage.getItem('pomodoro_stats') || '{}')
  return data[key] || { completed: 0, minutes: 0, streak: 0 }
})

function getTodayKey() {
  return new Date().toISOString().slice(0, 10)
}

function switchMode(m) {
  if (running.value) return
  mode.value = m
  timeLeft.value = settings.value[m] * 60
}

function toggleTimer() {
  if (running.value) {
    clearInterval(interval)
    running.value = false
  } else {
    running.value = true
    interval = setInterval(() => {
      timeLeft.value--
      if (timeLeft.value <= 0) {
        clearInterval(interval)
        running.value = false
        onTimerComplete()
      }
    }, 1000)
  }
}

function resetTimer() {
  clearInterval(interval)
  running.value = false
  timeLeft.value = settings.value[mode.value] * 60
}

function onTimerComplete() {
  // Play notification sound using AudioContext
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 800
    gain.gain.value = 0.3
    osc.start()
    setTimeout(() => { osc.stop(); ctx.close() }, 300)
  } catch (e) {}

  if (mode.value === 'focus') {
    completedSessions.value++
    const key = getTodayKey()
    const data = JSON.parse(localStorage.getItem('pomodoro_stats') || '{}')
    const today = data[key] || { completed: 0, minutes: 0, streak: 0 }
    today.completed++
    today.minutes += settings.value.focus
    today.streak = Math.max(today.streak, completedSessions.value)
    data[key] = today
    localStorage.setItem('pomodoro_stats', JSON.stringify(data))

    if (completedSessions.value >= settings.value.rounds) {
      mode.value = 'longBreak'
      completedSessions.value = 0
    } else {
      mode.value = 'shortBreak'
    }
  } else {
    mode.value = 'focus'
  }
  timeLeft.value = settings.value[mode.value] * 60
}

function saveSettings() {
  localStorage.setItem('pomodoro_settings', JSON.stringify(settings.value))
  if (!running.value) {
    timeLeft.value = settings.value[mode.value] * 60
  }
}

onMounted(() => {
  const saved = localStorage.getItem('pomodoro_settings')
  if (saved) settings.value = { ...settings.value, ...JSON.parse(saved) }
  timeLeft.value = settings.value[mode.value] * 60
})

onUnmounted(() => { if (interval) clearInterval(interval) })
</script>

<style scoped>
.pomodoro-page { max-width: 500px; margin: 0 auto; padding: 20px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.page-header h2 { font-size: 20px; color: var(--text-primary); flex: 1; }
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

.timer-section { text-align: center; padding: 32px 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: 20px; }
.mode-tabs { display: flex; gap: 8px; justify-content: center; margin-bottom: 32px; }
.mode-btn { padding: 6px 16px; border-radius: var(--radius-md); border: 1px solid var(--border); background: none; color: var(--text-muted); cursor: pointer; font-size: 13px; transition: all 0.2s; }
.mode-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

.timer-display { margin-bottom: 28px; }
.time { font-size: 72px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 2px; }

.timer-controls { display: flex; gap: 12px; justify-content: center; margin-bottom: 24px; }
.ctrl-btn { padding: 12px 32px; border-radius: var(--radius-lg); border: none; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.ctrl-btn:first-child { background: var(--accent); color: #fff; }
.ctrl-btn.secondary { background: var(--bg-tertiary); color: var(--text-secondary); }

.session-info { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.session-dots { display: flex; gap: 6px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--bg-tertiary); }
.dot.done { background: #ff6b6b; }
.session-text { font-size: 13px; color: var(--text-muted); }

.stats-section { padding: 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: 20px; }
.stats-section h3 { font-size: 15px; color: var(--text-primary); margin-bottom: 14px; }
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat-card { text-align: center; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-md); }
.stat-value { font-size: 24px; font-weight: 700; color: var(--text-primary); }
.stat-label { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

.settings-section { padding: 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.settings-section h3 { font-size: 15px; color: var(--text-primary); margin-bottom: 12px; }
.settings-fields { display: flex; flex-direction: column; gap: 10px; }
.settings-fields label { display: flex; align-items: center; justify-content: space-between; font-size: 14px; color: var(--text-secondary); }
.settings-fields input { width: 70px; padding: 6px 10px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); text-align: center; font-size: 14px; }
</style>
