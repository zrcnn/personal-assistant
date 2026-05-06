<template>
  <div class="calendar-page">
    <div class="page-header">
      <button class="back-btn" @click="$router.push('/tools')">← 工具箱</button>
      <h2>📅 日历</h2>
      <div class="search-box">
        <input v-model="searchInput" @input="searchDate" placeholder="搜索日期，如：2026-04-05" />
        <button v-if="searchResult" class="clear-search" @click="clearSearch">✕</button>
      </div>
      <button class="add-btn" @click="openEditor()">+ 新日程</button>
    </div>

    <div class="calendar-nav">
      <button @click="changeMonth(-1)">◀</button>
      <span>{{ viewYear }}年{{ viewMonth + 1 }}月</span>
      <button @click="changeMonth(1)">▶</button>
      <button class="today-btn" @click="goToday">今天</button>
    </div>

    <div class="calendar-grid">
      <div class="weekday" v-for="(w, i) in weekdays" :key="w" :class="{ holiday: isWeekend(i) }">{{ w }}</div>
      <div v-for="day in calendarDays" :key="day.key" class="day-cell" :class="{
        'other': !day.current,
        'today': day.isToday,
        'selected': day.date === selectedDate,
        'has-event': getEventsForDate(day.date).length > 0,
        'rest-day': isRestDay(day.date),
        'work-day': isWorkDay(day.date)
      }" @click="selectDate(day.date)">
        <div class="day-header">
          <span class="day-num" :class="{ 'rest': isRestDay(day.date), 'work': isWorkDay(day.date) }">{{ day.num }}</span>
          <span v-if="getLunarInfo(day.date)" class="lunar-text festival" :title="getLunarInfo(day.date).fullText">{{ getLunarInfo(day.date).shortText }}</span>
          <span v-else-if="isRestDay(day.date)" class="lunar-text rest-label" title="休息日">休</span>
          <span v-else-if="isWorkDay(day.date)" class="lunar-text work-label" title="调休工作日">班</span>
          <span v-else class="lunar-text">&nbsp;</span>
        </div>
        <div class="day-events">
          <span v-for="e in getEventsForDate(day.date).slice(0, 1)" :key="e.id" class="event-dot" :style="{ background: e.color }"></span>
          <span v-if="getEventsForDate(day.date).length > 1" class="event-count">{{ getEventsForDate(day.date).length }}</span>
        </div>
        <span v-if="isRestDay(day.date)" class="rest-badge" title="休息日">休</span>
        <span v-else-if="isWorkDay(day.date)" class="work-badge" title="工作日">班</span>
      </div>
    </div>

    <!-- 日程卡片展示区域（日历下方） -->
    <div class="day-detail-card">
      <div class="card-header">
        <div class="card-date-info">
          <h3>{{ selectedDate || `${viewYear}年${viewMonth + 1}月日程` }}</h3>
          <span v-if="selectedDate && getLunarInfo(selectedDate)" class="detail-lunar festival">{{ getLunarInfo(selectedDate).fullText }}</span>
          <span v-else-if="selectedDate && isRestDay(selectedDate)" class="rest-tag">休息日</span>
          <span v-else-if="selectedDate && isWorkDay(selectedDate)" class="work-tag">工作日</span>
        </div>
        <button v-if="selectedDate" class="close-btn" @click="selectedDate = ''" title="显示全部">✕ 显示全部</button>
      </div>
      <div class="card-body">
        <div v-for="e in selectedEvents" :key="e.id" class="event-card" :style="{ borderLeftColor: e.color }">
          <div class="event-info">
            <strong>{{ e.title }}</strong>
            <span class="event-time">{{ formatTimeRange(e.start_time, e.end_time) }}</span>
            <p v-if="e.description">{{ e.description }}</p>
          </div>
          <div class="event-actions">
            <button @click="openEditor(e)" title="编辑">✏️</button>
            <button @click="deleteEvent(e.id)" title="删除">🗑️</button>
          </div>
        </div>
        <div v-if="selectedEvents.length === 0" class="no-events">
          <span>{{ selectedDate ? '该日期暂无日程' : '本月暂无日程' }}</span>
          <button class="quick-add" @click="openEditor()">+ 添加日程</button>
        </div>
      </div>
    </div>

    <!-- Event Editor Modal -->
    <div v-if="showEditor" class="modal-overlay" @click.self="showEditor = false">
      <div class="modal">
        <h3>{{ editingId ? '编辑日程' : '新建日程' }}</h3>
        <div class="modal-fields">
          <input v-model="form.title" placeholder="标题" />
          <textarea v-model="form.description" placeholder="描述（可选）" rows="2"></textarea>
          <div class="field-row">
            <label>开始</label>
            <input v-model="form.start_time" type="datetime-local" />
          </div>
          <div class="field-row">
            <label>结束</label>
            <input v-model="form.end_time" type="datetime-local" />
          </div>
          <div class="color-picker">
            <span v-for="c in eventColors" :key="c" class="color-dot" :style="{ background: c }" :class="{ active: form.color === c }" @click="form.color = c"></span>
          </div>
        </div>
        <div class="modal-btns">
          <button class="save-btn" @click="saveEvent">保存</button>
          <button class="cancel-btn" @click="showEditor = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const eventColors = ['#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#ff922b']

const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth())
const selectedDate = ref('')
const events = ref([])
const showEditor = ref(false)
const showDayDetail = ref(false)
const editingId = ref(null)
const form = ref({ title: '', description: '', start_time: '', end_time: '', color: '#4a9eff' })
const searchInput = ref('')
const searchResult = ref('')

// 2026年法定节假日配置（示例）
// restDays: 休息日（节假日），workDays: 调休工作日
const holidays = {
  restDays: [
    // 元旦: 1月1日
    '2026-01-01',
    // 春节: 2月17-24日
    '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23', '2026-02-24',
    // 清明: 4月5-7日
    '2026-04-05', '2026-04-06', '2026-04-07',
    // 劳动: 5月1-5日
    '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
    // 端午: 6月19-21日（2026年端午节是6月19日）
    '2026-06-19', '2026-06-20', '2026-06-21',
    // 中秋国庆: 10月1-8日
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
  ],
  workDays: [
    // 春节调休: 2月15日(周日)上班, 2月28日(周六)上班
    '2026-02-15', '2026-02-28',
    // 劳动调休: 4月26日(周日)上班, 5月9日(周六)上班
    '2026-04-26', '2026-05-09',
    // 国庆调休: 9月27日(周日)上班, 10月10日(周六)上班
    '2026-09-27', '2026-10-10',
  ]
}

// 简易农历转换（基于基准日期的偏移计算）
// 注意：这里使用公历日期，因为真正的农历转换需要复杂算法
// 以下是2026年各节日对应的公历日期
const lunarMap = {
  '01-01': '春节', '01-15': '元宵',
  '04-05': '清明', '06-19': '端午',  // 2026年端午节是6月19日（农历五月初五）
  '07-07': '七夕', '08-15': '中秋',
  '09-09': '重阳', '12-08': '腊八', '12-30': '除夕'
}

const calendarDays = computed(() => {
  const firstDay = new Date(viewYear.value, viewMonth.value, 1)
  const lastDay = new Date(viewYear.value, viewMonth.value + 1, 0)
  const startPad = firstDay.getDay()
  const prevLast = new Date(viewYear.value, viewMonth.value, 0).getDate()
  const days = []

  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(viewYear.value, viewMonth.value, -i)
    days.push({ num: d.getDate(), date: fmt(d), current: false, isToday: false, key: 'p' + i })
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(viewYear.value, viewMonth.value, i)
    days.push({ num: i, date: fmt(d), current: true, isToday: fmt(d) === fmt(now), key: 'c' + i })
  }
  const remain = 42 - days.length
  for (let i = 1; i <= remain; i++) {
    const d = new Date(viewYear.value, viewMonth.value + 1, i)
    days.push({ num: i, date: fmt(d), current: false, isToday: false, key: 'n' + i })
  }
  return days
})

const selectedEvents = computed(() => {
  if (selectedDate.value) {
    return getEventsForDate(selectedDate.value)
  }
  // 未选择具体日期时，显示当前加载的所有日程（过去两周+当前视图月份）
  return events.value
})

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTime(t) {
  if (!t) return ''
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatTimeRange(start, end) {
  const s = formatTime(start)
  const e = formatTime(end)
  if (s && e) return `${s} - ${e}`
  return s || ''
}

function isWeekend(dayIndex) {
  return dayIndex === 0 || dayIndex === 6
}

function isRestDay(dateStr) {
  if (!dateStr) return false
  return holidays.restDays.includes(dateStr)
}

function isWorkDay(dateStr) {
  if (!dateStr) return false
  return holidays.workDays.includes(dateStr)
}

function getLunarInfo(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const key = `${month}-${day}`
  if (lunarMap[key]) {
    return { shortText: lunarMap[key], fullText: `农历 ${lunarMap[key]}` }
  }
  return null
}

function changeMonth(dir) {
  viewMonth.value += dir
  if (viewMonth.value > 11) { viewMonth.value = 0; viewYear.value++ }
  if (viewMonth.value < 0) { viewMonth.value = 11; viewYear.value-- }
}

function goToday() {
  viewYear.value = now.getFullYear()
  viewMonth.value = now.getMonth()
  selectDate(fmt(now))
}

function selectDate(date) {
  selectedDate.value = date
  showDayDetail.value = true
}

function getEventsForDate(date) {
  if (!date) return []
  return events.value.filter(e => e.start_time && e.start_time.startsWith(date))
}

function openEditor(event) {
  if (event) {
    editingId.value = event.id
    form.value = {
      title: event.title,
      description: event.description || '',
      start_time: event.start_time ? event.start_time.slice(0, 16) : '',
      end_time: event.end_time ? event.end_time.slice(0, 16) : '',
      color: event.color || '#4a9eff'
    }
  } else {
    editingId.value = null
    const dt = selectedDate.value || fmt(now)
    form.value = { title: '', description: '', start_time: `${dt}T09:00`, end_time: `${dt}T10:00`, color: '#4a9eff' }
  }
  showEditor.value = true
}

async function saveEvent() {
  if (!form.value.title || !form.value.start_time) return
  try {
    const payload = { ...form.value, start_time: form.value.start_time + ':00', end_time: form.value.end_time ? form.value.end_time + ':00' : null }
    if (editingId.value) {
      await fetch(`/api/tools/events/${editingId.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify(payload)
      })
    } else {
      await fetch('/api/tools/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify(payload)
      })
    }
    showEditor.value = false
    fetchEvents()
  } catch (e) {
    console.error('Save event error:', e)
  }
}

async function deleteEvent(id) {
  if (!confirm('确定删除？')) return
  try {
    await fetch(`/api/tools/events/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${auth.token}` } })
    fetchEvents()
  } catch (e) {
    console.error('Delete event error:', e)
  }
}

async function fetchEvents() {
  // 优先加载过去两周到当前月份月底的范围
  const today = new Date()
  const twoWeeksAgo = new Date(today)
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
  
  const currentMonthEnd = new Date(viewYear.value, viewMonth.value + 1, 0)
  
  // 开始时间：取「两周前」和「当前视图月初」中更早的那个
  const viewMonthStart = new Date(viewYear.value, viewMonth.value, 1)
  const startDate = twoWeeksAgo < viewMonthStart ? twoWeeksAgo : viewMonthStart
  
  // 结束时间：取「当前视图月底」和「今天之后30天」中更晚的那个
  const futureEnd = new Date(today)
  futureEnd.setDate(futureEnd.getDate() + 30)
  const endDate = currentMonthEnd > futureEnd ? currentMonthEnd : futureEnd
  
  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
  
  try {
    const resp = await fetch(`/api/tools/events?start=${start}&end=${end}`, {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    })
    events.value = await resp.json()
  } catch (e) {
    console.error('Fetch events error:', e)
  }
}

function searchDate() {
  const val = searchInput.value.trim()
  if (!val) { searchResult.value = ''; return }
  // 支持 YYYY-MM-DD 或 YYYY-MM 格式
  const match = val.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/)
  if (match) {
    const y = parseInt(match[1])
    const m = parseInt(match[2]) - 1
    const d = match[3] ? parseInt(match[3]) : 1
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      viewYear.value = y
      viewMonth.value = m
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      searchResult.value = dateStr
      selectDate(dateStr)
    }
  }
}

function clearSearch() {
  searchInput.value = ''
  searchResult.value = ''
}

// 月份变化时自动重新获取日程
watch([viewYear, viewMonth], () => {
  fetchEvents()
})

onMounted(() => { 
  viewYear.value = now.getFullYear()
  viewMonth.value = now.getMonth()
  fetchEvents() 
})
</script>

<style scoped>
.calendar-page { max-width: 900px; margin: 0 auto; padding: 20px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.page-header h2 { font-size: 20px; color: var(--text-primary); flex: 0 0 auto; }
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

.search-box {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 150px;
  max-width: 220px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  overflow: hidden;
}
.search-box input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}
.search-box input::placeholder { color: var(--text-muted); }
.clear-search {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
  font-size: 12px;
}
.clear-search:hover { color: var(--text-primary); }

.add-btn { padding: 8px 16px; border-radius: var(--radius-md); border: none; background: var(--accent); color: #fff; cursor: pointer; font-size: 14px; white-space: nowrap; }

.calendar-nav { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.calendar-nav button { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 4px 10px; border-radius: var(--radius-sm); }
.calendar-nav button:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.calendar-nav span { font-size: 18px; font-weight: 600; color: var(--text-primary); min-width: 140px; text-align: center; }
.today-btn { margin-left: auto; font-size: 13px !important; padding: 4px 12px !important; border: 1px solid var(--border) !important; border-radius: var(--radius-md) !important; }

.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--border); border-radius: var(--radius-lg); overflow: hidden; margin-bottom: 16px; }
.weekday { background: var(--bg-card); padding: 10px; text-align: center; font-size: 13px; color: var(--text-muted); font-weight: 500; }
.weekday.holiday { color: var(--danger); }

.day-cell {
  background: var(--bg-card);
  padding: 6px;
  min-height: 80px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
  display: flex;
  flex-direction: column;
}
.day-cell:hover { background: var(--bg-tertiary); }
.day-cell.other { opacity: 0.35; }
.day-cell.today .day-num { background: var(--accent); color: #fff; }
.day-cell.selected { background: rgba(74, 158, 255, 0.1); box-shadow: inset 0 0 0 2px var(--accent); }
.day-cell.has-event { }
.day-cell.rest-day { background: rgba(239, 68, 68, 0.04); }
.day-cell.work-day { background: rgba(81, 207, 102, 0.04); }

.day-header { display: flex; align-items: flex-start; gap: 2px; margin-bottom: 2px; }
.day-num { font-size: 14px; color: var(--text-primary); font-weight: 500; padding: 1px 5px; border-radius: 50%; }
.day-num.rest { color: var(--danger); font-weight: 700; background: rgba(239, 68, 68, 0.08); }
.day-num.work { color: #51cf66; font-weight: 700; background: rgba(81, 207, 102, 0.08); }
.lunar-text { font-size: 10px; color: var(--text-muted); flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lunar-text.festival { color: var(--danger); font-weight: 600; }
.lunar-text.rest-label { color: var(--danger); font-weight: 600; }
.lunar-text.work-label { color: #51cf66; font-weight: 600; }

.day-events { flex: 1; display: flex; align-items: center; gap: 3px; flex-wrap: wrap; }
.event-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.event-count { font-size: 10px; color: var(--text-muted); }

.rest-badge, .work-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
}
.rest-badge { background: rgba(239, 68, 68, 0.15); color: var(--danger); }
.work-badge { background: rgba(81, 207, 102, 0.15); color: #51cf66; }

/* 日程卡片展示区域（日历下方） */
.day-detail-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin-top: 16px;
  animation: slideDown 0.2s ease-out;
}
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.card-date-info h3 { font-size: 18px; color: var(--text-primary); margin: 0; }
.card-body {
  padding: 16px 20px;
}
.detail-lunar { font-size: 13px; color: var(--text-muted); margin-left: 8px; }
.detail-lunar.festival { color: var(--danger); font-weight: 600; }
.rest-tag, .work-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: 8px;
  font-weight: 600;
}
.rest-tag { background: rgba(239, 68, 68, 0.15); color: var(--danger); }
.work-tag { background: rgba(81, 207, 102, 0.15); color: #51cf66; }
.close-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; padding: 4px; }
.close-btn:hover { color: var(--text-primary); }
.event-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 14px;
  border-left: 3px solid;
  background: var(--bg-tertiary);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  margin-bottom: 10px;
}
.event-info strong { font-size: 15px; color: var(--text-primary); display: block; }
.event-time { font-size: 12px; color: var(--text-muted); }
.event-info p { font-size: 13px; color: var(--text-secondary); margin-top: 6px; white-space: pre-wrap; }
.event-actions { display: flex; gap: 4px; flex-shrink: 0; margin-left: 12px; }
.event-actions button { background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px; opacity: 0.6; }
.event-actions button:hover { opacity: 1; }

.no-events { text-align: center; color: var(--text-muted); font-size: 14px; padding: 32px 16px; }
.quick-add {
  display: block;
  margin: 12px auto 0;
  padding: 8px 20px;
  border-radius: var(--radius-md);
  border: 1px dashed var(--border);
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 14px;
}
.quick-add:hover { background: var(--bg-tertiary); }

/* 日程详情弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

/* Editor Modal */
.modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 24px;
  width: 100%;
  max-width: 420px;
}
.modal h3 { font-size: 16px; color: var(--text-primary); margin-bottom: 16px; }
.modal-fields { display: flex; flex-direction: column; gap: 10px; }
.modal-fields input, .modal-fields textarea { width: 100%; padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); font-size: 14px; outline: none; resize: vertical; box-sizing: border-box; }
.field-row { display: flex; align-items: center; gap: 10px; }
.field-row label { font-size: 13px; color: var(--text-muted); min-width: 40px; }
.field-row input { flex: 1; }
.color-picker { display: flex; gap: 6px; }
.color-dot { width: 22px; height: 22px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; }
.color-dot.active { border-color: var(--text-primary); }
.modal-btns { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
.save-btn { padding: 8px 20px; border-radius: var(--radius-md); border: none; background: var(--accent); color: #fff; cursor: pointer; }
.cancel-btn { padding: 8px 20px; border-radius: var(--radius-md); border: 1px solid var(--border); background: none; color: var(--text-muted); cursor: pointer; }

@media (max-width: 768px) {
  .calendar-page { padding: 12px; }
  .page-header { gap: 8px; }
  .page-header h2 { font-size: 16px; }
  .search-box { max-width: 100%; order: 3; flex-basis: 100%; }
  .day-cell { min-height: 60px; padding: 4px; }
  .day-num { font-size: 12px; padding: 1px 3px; }
  .lunar-text { font-size: 8px; max-width: 30px; }
  .lunar-text.festival { font-size: 8px; }
  .day-header { gap: 1px; }
  .event-dot { width: 6px; height: 6px; }
  .rest-badge, .work-badge { font-size: 8px; padding: 0 2px; }
}
</style>