<template>
  <Teleport to="body">
    <transition name="search-fade">
      <div v-if="visible" class="search-modal-overlay" @click.self="close">
        <div class="search-modal">
          <div class="search-header">
            <h3>🔍 搜索消息</h3>
            <button class="search-close" @click="close" aria-label="关闭">✕</button>
          </div>
          <div class="search-body">
            <!-- 搜索条件 -->
            <div class="search-filters">
              <div class="filter-field">
                <label>关键词</label>
                <input
                  v-model="filters.keyword"
                  type="text"
                  placeholder="输入关键词..."
                  class="filter-input"
                  @keydown.enter="executeSearch"
                />
              </div>
              <div class="filter-row">
                <div class="filter-field half">
                  <label>开始日期</label>
                  <input
                    v-model="filters.startDate"
                    type="date"
                    class="filter-input"
                  />
                </div>
                <div class="filter-field half">
                  <label>结束日期</label>
                  <input
                    v-model="filters.endDate"
                    type="date"
                    class="filter-input"
                  />
                </div>
              </div>
              <button
                class="search-exec-btn"
                @click="executeSearch"
                :disabled="searching || !filters.keyword.trim()"
              >
                {{ searching ? '搜索中...' : '搜索' }}
              </button>
            </div>

            <!-- 搜索结果 -->
            <div class="search-results" v-if="results.length > 0">
              <div class="results-header">
                找到 {{ results.length }} 条相关消息
              </div>
              <div
                v-for="(msg, idx) in results"
                :key="msg.id || idx"
                class="result-item"
                @click="jumpToMessage(msg)"
                :class="{ highlighted: highlightedMsgId === msg.id }"
              >
                <div class="result-sender">{{ msg.sender_username || msg.sender?.username || '未知' }}</div>
                <div class="result-content" v-html="highlightKeyword(msg.content)"></div>
                <div class="result-time">{{ formatTime(msg.created_at) }}</div>
              </div>
            </div>

            <!-- 无结果 -->
            <div v-if="searched && results.length === 0" class="no-results">
              <span class="no-results-icon">🔍</span>
              <span>未找到相关消息</span>
            </div>

            <!-- 初始状态 -->
            <div v-if="!searched" class="search-hint">
              输入关键词并选择日期范围开始搜索
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { userMessagesAPI } from '../../api/modules'

const props = defineProps({
  visible: Boolean,
  conversationId: [String, Number],
  groupId: [String, Number]
})

const emit = defineEmits(['close', 'jumpToMessage'])

const searching = ref(false)
const searched = ref(false)
const results = ref([])
const highlightedMsgId = ref(null)

const filters = reactive({
  keyword: '',
  startDate: '',
  endDate: ''
})

function close() {
  emit('close')
}

async function executeSearch() {
  if (!filters.keyword.trim()) return
  searching.value = true
  searched.value = true
  results.value = []

  try {
    const params = { q: filters.keyword.trim() }
    if (props.conversationId) {
      params.conversation_id = props.conversationId
    }
    if (props.groupId) {
      params.group_id = props.groupId
    }
    if (filters.startDate) {
      params.start_date = filters.startDate
    }
    if (filters.endDate) {
      params.end_date = filters.endDate
    }

    const res = await userMessagesAPI.searchMessages(params)
    results.value = res.data.messages || res.data.results || []
  } catch (err) {
    console.error('Search messages error:', err)
    results.value = []
  } finally {
    searching.value = false
  }
}

function highlightKeyword(content) {
  if (!content || !filters.keyword.trim()) return content || ''
  const escaped = filters.keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  return (content || '').replace(regex, '<mark>$1</mark>')
}

function jumpToMessage(msg) {
  highlightedMsgId.value = msg.id
  emit('jumpToMessage', msg)
  // 短暂高亮后取消
  setTimeout(() => {
    highlightedMsgId.value = null
  }, 2000)
}

function formatTime(t) {
  if (!t) return ''
  const d = new Date(t)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return isToday ? time : `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

function handleKeydown(e) {
  if (e.key === 'Escape' && props.visible) {
    close()
  }
}

watch(() => props.visible, (v) => {
  if (v) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.search-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
  z-index: 600;
}

.search-modal {
  width: 560px;
  max-width: 92vw;
  max-height: 70vh;
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: 0 16px 48px var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.search-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.search-close {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-close:hover {
  background: var(--bg-hover);
}

.search-body {
  padding: 20px;
  overflow-y: auto;
}

.search-filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.filter-row {
  display: flex;
  gap: 12px;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-field.half {
  flex: 1;
}

.filter-field label {
  font-size: 12px;
  color: var(--text-muted);
}

.filter-input {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.filter-input:focus {
  border-color: var(--accent);
}

.search-exec-btn {
  padding: 10px 24px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition);
  align-self: flex-end;
}

.search-exec-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.search-exec-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-results {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.results-header {
  padding: 10px 14px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border);
}

.result-item {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background var(--transition);
}

.result-item:last-child {
  border-bottom: none;
}

.result-item:hover {
  background: var(--bg-hover);
}

.result-item.highlighted {
  background: var(--accent-light);
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.result-sender {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 4px;
}

.result-content {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
  margin-bottom: 4px;
}

.result-content :deep(mark) {
  background: rgba(253, 214, 51, 0.4);
  color: inherit;
  padding: 0 2px;
  border-radius: 2px;
}

.result-time {
  font-size: 11px;
  color: var(--text-muted);
}

.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 8px;
  color: var(--text-muted);
  font-size: 14px;
}

.no-results-icon {
  font-size: 32px;
}

.search-hint {
  text-align: center;
  padding: 30px 20px;
  color: var(--text-muted);
  font-size: 14px;
}

/* Animation */
.search-fade-enter-active,
.search-fade-leave-active {
  transition: opacity 0.2s ease;
}

.search-fade-enter-from,
.search-fade-leave-to {
  opacity: 0;
}

.search-fade-enter-active .search-modal,
.search-fade-leave-active .search-modal {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.search-fade-enter-from .search-modal,
.search-fade-leave-to .search-modal {
  transform: translateY(-20px);
  opacity: 0;
}
</style>
