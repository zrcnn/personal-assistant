<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// ===== STATE =====
const searchQuery = ref('')
const isSearching = ref(false)
const searchResults = ref(null)
const searchHistory = ref([])
const showSearchModal = ref(false)
const currentVideo = ref(null)
const showSourceList = ref(false)
const videoRef = ref(null)
const progressRef = ref(null)

// Playback state
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(100)
const isMuted = ref(false)
const playbackRate = ref(1)
const bufferedPercent = ref(0)
const showControls = ref(false)
const controlsTimer = ref(null)
const isFullscreen = ref(false)
const showEpisodes = ref(false)
const episodeList = ref([])
const currentEpisode = ref(1)

const toast = ref({ show: false, message: '', type: 'info' })

// Browse state
const browseLoading = ref(false)
const browseData = ref({ page: 1, pageSize: 30, total: 0, totalPages: 0, items: [] })
const browseFilter = ref({ type: '', subGenre: '', quality: '', year: 0, sort: 'rating' })

const typeOptions = [
  { value: '', label: '全部' },
  { value: 'movie', label: '电影' },
  { value: 'series', label: '剧集' },
  { value: 'anime', label: '动漫' },
  { value: 'documentary', label: '纪录片' },
  { value: 'variety', label: '综艺' }
]

const qualityOptions = [
  { value: '', label: '全部' },
  { value: '4K', label: '4K' },
  { value: 'HD', label: 'HD' },
  { value: 'SD', label: 'SD' }
]

const yearOptions = [
  { value: 0, label: '全部' },
  { value: 2025, label: '2025' },
  { value: 2024, label: '2024' },
  { value: 2023, label: '2023' },
  { value: 2022, label: '2022' },
  { value: 2021, label: '2021' },
  { value: 2020, label: '2020' }
]

const subGenreOptions = [
  { value: '', label: '全部' },
  { value: 'scifi', label: '科幻' },
  { value: 'action', label: '动作' },
  { value: 'comedy', label: '喜剧' },
  { value: 'romance', label: '爱情' },
  { value: 'horror', label: '恐怖' },
  { value: 'crime', label: '犯罪' },
  { value: 'suspense', label: '悬疑' },
  { value: 'war', label: '战争' },
  { value: 'history', label: '历史' },
  { value: 'fantasy', label: '奇幻' },
  { value: 'adventure', label: '冒险' },
  { value: 'animation', label: '动画' },
  { value: 'family', label: '家庭' },
  { value: 'drama', label: '剧情' },
  { value: 'adult', label: '成人' },
  { value: 'documentary', label: '纪录' },
  { value: 'music', label: '音乐' },
  { value: 'sport', label: '运动' }
]

const sortOptions = [
  { value: 'rating', label: '评分↑' },
  { value: 'year', label: '年份↓' },
  { value: 'name', label: '名称' },
  { value: 'episodes', label: '集数↓' }
]

// Demo videos
const demoVideos = [
  { name: 'Big Buck Bunny', url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4' },
  { name: 'Sintel', url: 'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4' },
  { name: 'Tears of Steel', url: 'https://test-videos.co.uk/vids/tears-of-steel/mp4/h264/720/Tears_of_Steel_720_10s_1MB.mp4' },
  { name: 'Elephants Dream', url: 'https://test-videos.co.uk/vids/elephantsdream/mp4/h264/720/Elephants_Dream_720_10s_1MB.mp4' }
]

// ===== COMPUTED =====
const progressPercent = computed(() => duration.value ? (currentTime.value / duration.value) * 100 : 0)
const tooltipPosition = computed(() => progressPercent.value)
const formatTime = (s) => {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return m + ':' + (sec < 10 ? '0' : '') + sec
}

function formatType(type) {
  const map = { movie: '电影', series: '剧集', anime: '动漫', documentary: '纪录片', variety: '综艺' }
  return map[type] || type
}

function formatSubGenre(genre) {
  const map = {
    scifi: '科幻', action: '动作', comedy: '喜剧', romance: '爱情',
    horror: '恐怖', crime: '犯罪', suspense: '悬疑', war: '战争',
    history: '历史', fantasy: '奇幻', adventure: '冒险', animation: '动画',
    family: '家庭', drama: '剧情', adult: '成人', documentary: '纪录',
    music: '音乐', sport: '运动'
  }
  return map[genre] || genre
}

// ===== API =====
function getToken() {
  return localStorage.getItem('token') || ''
}

async function api(path, method = 'GET', body = null) {
  const token = getToken()
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    }
  }
  if (body) options.body = JSON.stringify(body)
  const res = await fetch(path, options)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '请求失败')
  return data
}

// ===== SEARCH =====
async function searchVideo() {
  if (!searchQuery.value.trim()) {
    showSearchModal.value = false
    return
  }
  isSearching.value = true
  searchResults.value = null
  try {
    const data = await api('/api/tools/video/search', 'POST', { query: searchQuery.value })
    searchResults.value = data.results || []
    if (data.results && data.results.length > 0) {
      saveHistory(searchQuery.value)
    }
  } catch (e) {
    showToast(e.message || '搜索失败', 'error')
  } finally {
    isSearching.value = false
  }
}

function saveHistory(query) {
  if (!searchHistory.value.includes(query)) {
    searchHistory.value.unshift(query)
    if (searchHistory.value.length > 20) searchHistory.value.pop()
    localStorage.setItem('videoSearchHistory', JSON.stringify(searchHistory.value))
  }
}

function clearHistory() {
  searchHistory.value = []
  localStorage.removeItem('videoSearchHistory')
}

// ===== BROWSE =====
async function browseVideos(page) {
  browseLoading.value = true
  try {
    const params = new URLSearchParams({
      page: page || 1,
      pageSize: 30,
      type: browseFilter.value.type,
      subGenre: browseFilter.value.subGenre,
      quality: browseFilter.value.quality,
      year: browseFilter.value.year || '',
      sort: browseFilter.value.sort
    })
    const data = await api('/api/tools/video/browse?' + params.toString())
    browseData.value = data
  } catch (e) {
    showToast(e.message || '加载失败', 'error')
  } finally {
    browseLoading.value = false
  }
}

function clearBrowseFilters() {
  browseFilter.value = { type: '', subGenre: '', quality: '', year: 0, sort: 'rating' }
  browseVideos(1)
}

// ===== VIDEO PLAYER =====
function selectSource(item) {
  currentVideo.value = item
  showSourceList.value = false
  showSearchModal.value = false
  if (item.episodes && item.episodes > 0) {
    episodeList.value = generateEpisodes(item.episodes)
    currentEpisode.value = 1
  }
  nextTick(() => {
    if (videoRef.value) {
      videoRef.value.load()
      videoRef.value.play().catch(() => {})
    }
  })
}

function generateEpisodes(count) {
  const eps = []
  for (let i = 1; i <= Math.min(count, 100); i++) {
    eps.push({ name: i, url: '#', playable: true })
  }
  return eps
}

function backToBrowse() {
  currentVideo.value = null
  showSourceList.value = false
  showEpisodes.value = false
  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.src = ''
  }
}

function togglePlay() {
  if (!videoRef.value) return
  if (isPlaying.value) {
    videoRef.value.pause()
  } else {
    videoRef.value.play()
  }
}

function stopVideo() {
  if (!videoRef.value) return
  videoRef.value.pause()
  videoRef.value.currentTime = 0
  isPlaying.value = false
  currentTime.value = 0
}

function onLoaded() {
  if (!videoRef.value) return
  duration.value = videoRef.value.duration
  isPlaying.value = true
}

function onTimeUpdate() {
  if (!videoRef.value) return
  currentTime.value = videoRef.value.currentTime
  if (videoRef.value.buffered.length > 0) {
    const end = videoRef.value.buffered.end(videoRef.value.buffered.length - 1)
    bufferedPercent.value = (end / duration.value) * 100
  }
}

function onEnded() {
  isPlaying.value = false
}

function seekVideo(e) {
  if (!progressRef.value || !duration.value || !videoRef.value) return
  const rect = progressRef.value.getBoundingClientRect()
  const pos = (e.clientX - rect.left) / rect.width
  videoRef.value.currentTime = pos * duration.value
}

function changeVolume() {
  if (videoRef.value) videoRef.value.volume = volume.value / 100
}

function toggleMute() {
  if (videoRef.value) {
    videoRef.value.muted = !isMuted.value
    isMuted.value = !isMuted.value
  }
}

function cycleSpeed() {
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2]
  const idx = speeds.indexOf(playbackRate.value)
  playbackRate.value = speeds[(idx + 1) % speeds.length]
  if (videoRef.value) videoRef.value.playbackRate = playbackRate.value
}

function toggleFullscreen() {
  const el = document.querySelector('.player-container')
  if (!el) return
  
  if (!document.fullscreenElement) {
    el.requestFullscreen().then(() => { isFullscreen.value = true }).catch(() => {
      // 回退到整个页面全屏
      document.documentElement.requestFullscreen().then(() => { isFullscreen.value = true })
    })
  } else {
    document.exitFullscreen().then(() => { isFullscreen.value = false })
  }
}

function handleMouseMove() {
  showControls.value = true
  if (controlsTimer.value) clearTimeout(controlsTimer.value)
  controlsTimer.value = setTimeout(() => {
    if (isPlaying.value) showControls.value = false
  }, 3000)
}

function handlePosterError(e) {
  e.target.style.display = 'none'
}

function selectEpisode(ep) {
  currentEpisode.value = ep.name
  showToast('已选择第 ' + ep.name + ' 集', 'info')
}

function showToast(message, type = 'info') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3000)
}

function openSearch() {
  showSearchModal.value = true
  searchResults.value = null
  nextTick(() => {
    const input = document.querySelector('.search-modal-input')
    if (input) input.focus()
  })
}

function closeSearch() {
  showSearchModal.value = false
}

// ===== LIFECYCLE =====
onMounted(() => {
  // 确保 currentVideo 是 null
  currentVideo.value = null
  const saved = localStorage.getItem('videoSearchHistory')
  if (saved) {
    try { searchHistory.value = JSON.parse(saved) } catch(e) {}
  }
  // 自动加载浏览数据
  browseVideos(1)
})

onUnmounted(() => {
  if (controlsTimer.value) clearTimeout(controlsTimer.value)
})
</script>

<template>
<div class="video-page">
  <!-- Browse Mode (Default) -->
  <div class="browse-section" v-if="!currentVideo">
    <!-- Header with Search -->
    <div class="browse-header">
      <h2>🎬 视频库</h2>
      <button @click="openSearch" class="search-toggle-btn">
        🔍 搜索
      </button>
    </div>

    <!-- Filters -->
    <div class="filter-section">
      <div class="filter-row">
        <label>类型：</label>
        <button v-for="t in typeOptions" :key="t.value" @click="browseFilter.type = t.value; browseVideos(1)" :class="['filter-btn', browseFilter.type === t.value ? 'active' : '']">{{ t.label }}</button>
      </div>
      <div class="filter-row">
        <label>题材：</label>
        <button v-for="g in subGenreOptions" :key="g.value" @click="browseFilter.subGenre = g.value; browseVideos(1)" :class="['filter-btn', browseFilter.subGenre === g.value ? 'active' : '']">{{ g.label }}</button>
      </div>
      <div class="filter-row">
        <label>画质：</label>
        <button v-for="q in qualityOptions" :key="q.value" @click="browseFilter.quality = q.value; browseVideos(1)" :class="['filter-btn', browseFilter.quality === q.value ? 'active' : '']">{{ q.label }}</button>
      </div>
      <div class="filter-row">
        <label>年份：</label>
        <button v-for="y in yearOptions" :key="y.value" @click="browseFilter.year = y.value; browseVideos(1)" :class="['filter-btn', browseFilter.year === y.value ? 'active' : '']">{{ y.label }}</button>
      </div>
      <div class="filter-row">
        <label>排序：</label>
        <button v-for="s in sortOptions" :key="s.value" @click="browseFilter.sort = s.value; browseVideos(1)" :class="['filter-btn', browseFilter.sort === s.value ? 'active' : '']">{{ s.label }}</button>
      </div>
      <div class="filter-row">
        <button @click="clearBrowseFilters" class="clear-filters-btn">🔄 重置</button>
      </div>
    </div>

    <!-- Results -->
    <div v-if="browseLoading" class="browse-loading"><div class="loading-spinner"></div><p>加载中...</p></div>

    <div v-else class="browse-results">
      <div class="browse-info">
        <span>共 {{ browseData.total.toLocaleString() }} 部影片</span>
        <span>第 {{ browseData.page }} / {{ browseData.totalPages.toLocaleString() }} 页</span>
      </div>

      <div class="results-list">
        <div v-for="(item, index) in browseData.items" :key="index" class="result-item" @click="selectSource(item)">
          <div v-if="item.poster" class="result-poster"><img :src="item.poster" :alt="item.name" loading="lazy" @error="handlePosterError" /></div>
          <div v-else class="result-icon">🎬</div>
          <div class="result-info">
            <div class="result-name">{{ item.name }}</div>
            <div class="result-meta">
              <span class="source-tag">{{ item.source }}</span>
              <span class="quality-tag">{{ item.quality || 'HD' }}</span>
              <span v-if="item.type" class="type-tag">{{ formatType(item.type) }}</span>
              <span v-if="item.subGenre" class="genre-tag">{{ formatSubGenre(item.subGenre) }}</span>
              <span v-if="item.episodes" class="ep-tag">{{ item.episodes }}集</span>
              <span v-if="item.year" class="year-tag">{{ item.year }}</span>
              <span v-if="item.rating" class="rating-tag">★{{ item.rating }}</span>
            </div>
          </div>
          <div class="result-arrow">→</div>
        </div>
      </div>

      <!-- Pagination -->
      <div class="pagination" v-if="browseData.totalPages > 1">
        <button @click="browseVideos(browseData.page - 1)" :disabled="browseData.page <= 1" class="page-btn">← 上一页</button>
        <span class="page-info">第 {{ browseData.page }} / {{ browseData.totalPages.toLocaleString() }} 页</span>
        <button @click="browseVideos(browseData.page + 1)" :disabled="browseData.page >= browseData.totalPages" class="page-btn">下一页 →</button>
      </div>
    </div>
  </div>

  <!-- Search Modal -->
  <div v-if="showSearchModal" class="search-modal-overlay" @click="closeSearch">
    <div class="search-modal" @click.stop>
      <div class="search-modal-header">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="输入视频名称，如：狂飙 第一季"
          @keyup.enter="searchVideo"
          class="search-modal-input"
        />
        <button @click="closeSearch" class="search-modal-close">✕</button>
      </div>

      <!-- Search History -->
      <div v-if="searchHistory.length > 0 && !searchResults && !isSearching" class="search-modal-history">
        <div class="history-header">
          <span>📜 搜索历史</span>
          <button @click="clearHistory" class="clear-btn">清除</button>
        </div>
        <div class="history-tags">
          <span v-for="(h, i) in searchHistory" :key="i" @click="searchQuery = h; searchVideo()" class="history-tag">{{ h }}</span>
        </div>
      </div>

      <!-- Search Results -->
      <div v-if="searchResults" class="search-modal-results">
        <div class="results-header">
          <span>📋 搜索结果：{{ searchQuery }}</span>
          <span class="result-count">{{ searchResults.length }} 个资源</span>
        </div>

        <div v-if="searchResults.length === 0" class="no-results">
          <div class="no-results-icon">😕</div>
          <p>未找到 "{{ searchQuery }}" 相关资源</p>
        </div>

        <div v-else class="results-list">
          <div v-for="(item, index) in searchResults" :key="index" class="result-item" @click="selectSource(item)">
            <div v-if="item.poster" class="result-poster"><img :src="item.poster" :alt="item.name" loading="lazy" @error="handlePosterError" /></div>
            <div v-else class="result-icon">🎬</div>
            <div class="result-info">
              <div class="result-name">{{ item.name }}</div>
              <div class="result-meta">
                <span class="source-tag">{{ item.source }}</span>
                <span class="quality-tag">{{ item.quality || 'HD' }}</span>
                <span v-if="item.type" class="type-tag">{{ formatType(item.type) }}</span>
                <span v-if="item.episodes" class="ep-tag">{{ item.episodes }}集</span>
                <span v-if="item.year" class="year-tag">{{ item.year }}</span>
                <span v-if="item.rating" class="rating-tag">★{{ item.rating }}</span>
              </div>
            </div>
            <div class="result-arrow">→</div>
          </div>
        </div>
      </div>

      <div v-if="isSearching" class="browse-loading">
        <div class="loading-spinner"></div>
        <p>正在搜索...</p>
      </div>
    </div>
  </div>

  <!-- Player Section -->
  <div v-else class="player-section">
    <div class="player-header">
      <button @click="backToBrowse" class="back-btn">← 返回</button>
      <div class="video-title">{{ currentVideo?.name || '' }}</div>
      <div class="video-source-tag">{{ currentVideo?.source || '' }}</div>
    </div>

    <div class="player-container" @mousemove="handleMouseMove" @mouseleave="() => { if(isPlaying) showControls.value = false }">
      <video v-if="currentVideo?.url && currentVideo.url !== '#'" ref="videoRef" :src="currentVideo.url" @loadedmetadata="onLoaded" @timeupdate="onTimeUpdate" @ended="onEnded" class="video-player" playsinline webkit-playsinline x5-video-player-type="h5" x5-video-player-fullscreen="true"></video>
      <div v-else class="video-placeholder">
        <div class="placeholder-icon">🎬</div>
        <p>该影片暂无可用播放源</p>
      </div>

      <div class="player-controls" :class="{ 'show': showControls || !isPlaying }">
        <div class="progress-container" ref="progressRef" @click="seekVideo">
          <div class="progress-bar">
            <div class="progress-buffered" :style="{ width: bufferedPercent + '%' }"></div>
            <div class="progress-played" :style="{ width: progressPercent + '%' }"></div>
          </div>
        </div>

        <div class="controls-row">
          <div class="controls-left">
            <button @click="togglePlay" class="control-btn">{{ isPlaying ? '⏸' : '▶' }}</button>
            <button @click="stopVideo" class="control-btn">⏹</button>
            <div class="volume-control">
              <button @click="toggleMute" class="control-btn">{{ isMuted ? '🔇' : '🔊' }}</button>
              <input type="range" min="0" max="100" v-model.number="volume" @input="changeVolume" class="volume-slider" />
              <span class="volume-value">{{ volume }}%</span>
            </div>
            <span class="time-display">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
          </div>

          <div class="controls-right">
            <button @click="cycleSpeed" class="control-btn speed-btn">{{ playbackRate }}x</button>
            <button @click="toggleFullscreen" class="control-btn">⛶</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Source List -->
    <div v-if="showSourceList" class="source-list-overlay" @click="showSourceList = false">
      <div class="source-list" @click.stop>
        <h3>选择播放源</h3>
        <div v-for="src in searchResults" :key="src.source" class="source-item" :class="{ active: currentVideo && currentVideo.source === src.source }" @click="selectSource(src)">
          <span>{{ src.source }}</span>
          <span class="source-quality">{{ src.quality || 'HD' }}</span>
        </div>
      </div>
    </div>

    <!-- Episodes -->
    <div v-if="episodeList.length > 0 && currentVideo" class="episode-bar">
      <div class="episode-header">
        <span>第 {{ currentEpisode }} / {{ episodeList.length }} 集</span>
        <button @click="showEpisodes = !showEpisodes" class="ep-toggle">{{ showEpisodes ? '收起' : '选集' }}</button>
      </div>
      <div v-if="showEpisodes" class="episode-list">
        <button v-for="ep in episodeList" :key="ep.name" :class="['ep-btn', ep.name === currentEpisode ? 'active' : '']" @click="selectEpisode(ep)">{{ ep.name }}</button>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div v-if="toast.show" :class="['toast', 'toast-' + toast.type]">{{ toast.message }}</div>
</div>
</template>

<style scoped>
.video-page {
  min-height: 100vh;
  background: var(--bg-page);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Browse Section */
.browse-section {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px 16px;
}

.browse-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.browse-header h2 {
  font-size: 20px;
  color: var(--text-primary);
  margin: 0;
}

.search-toggle-btn {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition);
}

.search-toggle-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* Filter Section */
.filter-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 20px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.filter-row:last-child {
  margin-bottom: 0;
}

.filter-row label {
  color: var(--text-secondary);
  font-size: 14px;
  min-width: 50px;
  font-weight: 500;
}

.filter-btn {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
}

.filter-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.filter-btn.active {
  background: var(--accent-gradient);
  border-color: transparent;
  color: #fff;
  font-weight: 500;
}

.clear-filters-btn {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition);
}

.clear-filters-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* Browse Results */
.browse-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-muted);
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition);
}

.result-item:hover {
  border-color: var(--accent);
  transform: translateX(4px);
}

.result-poster {
  width: 60px;
  height: 80px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-hover);
}

.result-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.result-icon {
  width: 60px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  background: var(--bg-hover);
  border-radius: 6px;
  flex-shrink: 0;
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
  word-break: break-all;
  line-height: 1.4;
}

.result-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.source-tag, .quality-tag, .type-tag, .ep-tag, .year-tag, .rating-tag, .genre-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.source-tag {
  background: var(--accent-light);
  color: var(--accent);
}

.quality-tag {
  background: rgba(46, 204, 113, 0.15);
  color: var(--success);
}

.type-tag {
  background: var(--bg-hover);
  color: var(--text-muted);
}

.genre-tag {
  background: rgba(217, 70, 239, 0.15);
  color: #d946ef;
}

.ep-tag {
  background: rgba(219, 39, 119, 0.15);
  color: #db2777;
}

.year-tag {
  background: var(--bg-hover);
  color: var(--text-muted);
}

.rating-tag {
  background: rgba(245, 158, 11, 0.15);
  color: var(--warning);
}

.result-arrow {
  font-size: 20px;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.page-btn {
  padding: 10px 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition);
}

.page-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: var(--text-muted);
}

/* Loading */
.browse-loading {
  text-align: center;
  padding: 60px 20px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.no-results {
  text-align: center;
  padding: 60px 20px;
}

.no-results-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.no-results p {
  margin: 8px 0;
  color: var(--text-secondary);
}

/* Search Modal */
.search-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
  z-index: 1000;
}

.search-modal {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 700px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  border: 1px solid var(--border);
}

.search-modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  border-bottom: 1px solid var(--border);
}

.search-modal-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 15px;
  outline: none;
}

.search-modal-input:focus {
  border-color: var(--accent);
}

.search-modal-input::placeholder {
  color: var(--text-muted);
}

.search-modal-close {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition);
}

.search-modal-close:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.search-modal-history {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.search-modal-history .history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  color: var(--text-secondary);
}

.search-modal-history .clear-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
}

.search-modal-history .history-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.search-modal-history .history-tag {
  padding: 6px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition);
}

.search-modal-history .history-tag:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.search-modal-results {
  padding: 16px 20px;
}

.search-modal-results .results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-size: 14px;
  color: var(--text-secondary);
}

.search-modal-results .result-count {
  color: var(--text-muted);
  font-size: 13px;
}

/* Player Section */
.player-section {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
}

.player-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.back-btn {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition);
}

.back-btn:hover {
  border-color: var(--accent);
}

.video-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.video-source-tag {
  padding: 4px 12px;
  background: var(--accent-light);
  border-radius: 20px;
  font-size: 12px;
  color: var(--accent);
}

.player-container {
  position: relative;
  background: #000;
  border-radius: var(--radius-md);
  overflow: hidden;
}

.video-player {
  width: 100%;
  display: block;
  max-height: 70vh;
}

.video-placeholder {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  background: rgba(0,0,0,0.3);
  border-radius: 8px;
  color: var(--text-secondary);
}

.video-placeholder .placeholder-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.player-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0,0,0,0.8));
  padding: 40px 16px 16px;
  opacity: 0;
  transition: opacity var(--transition);
}

.player-controls.show {
  opacity: 1;
}

.progress-container {
  cursor: pointer;
  margin-bottom: 12px;
  padding: 4px 0;
}

.progress-bar {
  height: 4px;
  background: var(--bg-hover);
  border-radius: 2px;
  position: relative;
}

.progress-buffered {
  height: 100%;
  background: var(--text-muted);
  opacity: 0.3;
  border-radius: 2px;
  position: absolute;
}

.progress-played {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  position: absolute;
}

.controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.controls-left, .controls-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  opacity: 0.9;
  transition: opacity var(--transition);
}

.control-btn:hover {
  opacity: 1;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 4px;
}

.volume-slider {
  width: 80px;
  accent-color: var(--accent);
}

.volume-value {
  color: var(--text-secondary);
  font-size: 12px;
  min-width: 35px;
}

.time-display {
  color: var(--text-secondary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.speed-btn {
  font-size: 13px !important;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
}

/* Source List */
.source-list-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.source-list {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 24px;
  max-width: 400px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  border: 1px solid var(--border);
}

.source-list h3 {
  margin: 0 0 16px;
  font-size: 18px;
  color: var(--text-primary);
}

.source-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: background var(--transition);
}

.source-item:hover {
  background: var(--bg-hover);
}

.source-item.active {
  background: var(--accent-light);
}

.source-quality {
  font-size: 12px;
  color: var(--text-muted);
}

/* Episode Bar */
.episode-bar {
  margin-top: 16px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 16px;
  border: 1px solid var(--border);
}

.episode-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: var(--text-secondary);
}

.ep-toggle {
  padding: 6px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.episode-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.ep-btn {
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition);
}

.ep-btn:hover {
  border-color: var(--accent);
}

.ep-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* Toast */
.toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: var(--radius-md);
  font-size: 14px;
  z-index: 2000;
  animation: fadeInUp 0.3s ease;
}

.toast-info {
  background: var(--accent);
  color: #fff;
}

.toast-error {
  background: var(--danger);
  color: #fff;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translate(-50%, 20px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

/* Responsive */
@media (max-width: 600px) {
  .video-page {
    padding: 0;
  }
  
  .browse-section {
    padding: 16px 12px;
  }
  
  .browse-header h2 {
    font-size: 18px;
  }
  
  .search-toggle-btn {
    padding: 6px 12px;
    font-size: 13px;
  }
  
  .filter-section {
    padding: 12px;
  }
  
  .filter-row {
    gap: 6px;
    margin-bottom: 10px;
  }
  
  .filter-btn {
    padding: 5px 10px;
    font-size: 12px;
  }
  
  .filter-row label {
    min-width: 45px;
    font-size: 13px;
  }
  
  .results-list {
    gap: 8px;
  }
  
  .result-item {
    padding: 12px;
    gap: 12px;
  }
  
  .result-poster {
    width: 50px;
    height: 65px;
  }
  
  .result-icon {
    width: 50px;
    height: 65px;
    font-size: 28px;
  }
  
  .result-name {
    font-size: 14px;
  }
  
  .result-meta {
    gap: 4px;
  }
  
  .result-meta span {
    font-size: 10px;
    padding: 1px 5px;
  }
  
  .browse-info {
    font-size: 12px;
    flex-direction: column;
    gap: 4px;
  }
  
  .pagination {
    gap: 12px;
  }
  
  .page-btn {
    padding: 8px 14px;
    font-size: 13px;
  }
  
  .page-info {
    font-size: 12px;
  }
  
  .player-header {
    padding: 0 8px;
  }
  
  .video-title {
    font-size: 14px;
  }
  
  .controls-row {
    flex-wrap: wrap;
    gap: 8px;
  }
  
  .volume-slider {
    width: 60px;
  }
  
  .time-display {
    font-size: 11px;
  }
  
  .episode-list {
    gap: 6px;
  }
  
  .ep-btn {
    padding: 6px 10px;
    font-size: 12px;
  }
}
</style>