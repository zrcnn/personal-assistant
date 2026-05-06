<template>
  <Teleport to="body">
    <transition name="slide-left">
      <div v-if="visible" class="user-sidebar-container">
        <!-- 遮罩层 -->
        <div class="sidebar-overlay" @click="close"></div>
        <!-- 侧边栏 -->
        <div class="user-sidebar">
          <div class="sidebar-header">
            <h3>用户信息</h3>
            <button class="sidebar-close" @click="close" aria-label="关闭">✕</button>
          </div>
          <div class="sidebar-content" v-if="userInfo">
            <div class="user-avatar-large">
              {{ (userInfo.username || '?').charAt(0).toUpperCase() }}
            </div>
            <div class="user-name">{{ userInfo.username }}</div>
            <div class="user-register-date">
              注册于 {{ formatDate(userInfo.created_at) }}
            </div>

            <div class="note-section">
              <div class="section-title">备注</div>
              <div class="note-field">
                <label>备注名</label>
                <input
                  v-model="noteForm.remark"
                  type="text"
                  placeholder="给 TA 起个备注..."
                  maxlength="50"
                  class="note-input"
                />
              </div>
              <div class="note-field">
                <label>描述</label>
                <textarea
                  v-model="noteForm.description"
                  placeholder="添加一些备注描述..."
                  maxlength="200"
                  rows="3"
                  class="note-textarea"
                ></textarea>
              </div>
              <button
                class="save-note-btn"
                @click="saveNote"
                :disabled="savingNote"
              >
                {{ savingNote ? '保存中...' : '保存备注' }}
              </button>
            </div>

            <div class="block-section">
              <div class="block-row">
                <div class="block-info">
                  <span class="block-label">拉黑用户</span>
                  <span class="block-desc">拉黑后将不再接收对方的消息</span>
                </div>
                <button
                  class="toggle-switch"
                  :class="{ active: isBlocked }"
                  @click="toggleBlock"
                  :aria-pressed="isBlocked"
                >
                  <span class="toggle-knob"></span>
                </button>
              </div>
            </div>
          </div>
          <div class="sidebar-loading" v-else>
            <span class="loading-spinner"></span>
            <span>加载中...</span>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, reactive, watch, onMounted, onUnmounted } from 'vue'
import { userMessagesAPI } from '../../api/modules'

const props = defineProps({
  visible: Boolean,
  userId: [String, Number]
})

const emit = defineEmits(['close', 'blocked'])

const userInfo = ref(null)
const loading = ref(false)
const savingNote = ref(false)
const isBlocked = ref(false)

const noteForm = reactive({
  remark: '',
  description: ''
})

function close() {
  emit('close')
}

async function loadUserInfo() {
  if (!props.userId) return
  loading.value = true
  try {
    const res = await userMessagesAPI.getUserInfo(props.userId)
    userInfo.value = res.data.user || {}
    isBlocked.value = res.data.user?.is_blocked || false

    // 加载备注
    try {
      const noteRes = await userMessagesAPI.getUserNote(props.userId)
      if (noteRes.data.note) {
        noteForm.remark = noteRes.data.note.remark || ''
        noteForm.description = noteRes.data.note.description || ''
      }
    } catch {
      // 无备注数据
    }
  } catch (err) {
    console.error('Load user info error:', err)
  } finally {
    loading.value = false
  }
}

async function saveNote() {
  if (!props.userId || savingNote.value) return
  savingNote.value = true
  try {
    await userMessagesAPI.setUserNote(props.userId, {
      remark: noteForm.remark,
      description: noteForm.description
    })
    // 显示保存成功提示
  } catch (err) {
    console.error('Save note error:', err)
  } finally {
    savingNote.value = false
  }
}

async function toggleBlock() {
  if (!props.userId) return
  isBlocked.value = !isBlocked.value
  emit('blocked', props.userId, isBlocked.value)
}

function formatDate(t) {
  if (!t) return '未知'
  const d = new Date(t)
  if (isNaN(d.getTime())) return '未知'
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

watch(() => props.userId, (id) => {
  if (id && props.visible) {
    loadUserInfo()
  }
})

watch(() => props.visible, (v) => {
  if (v && props.userId) {
    loadUserInfo()
  }
  if (v) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

function handleKeydown(e) {
  if (e.key === 'Escape' && props.visible) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.user-sidebar-container {
  position: fixed;
  inset: 0;
  z-index: 500;
}

.sidebar-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
}

.user-sidebar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 360px;
  max-width: 85vw;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px var(--shadow);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.sidebar-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.sidebar-close {
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

.sidebar-close:hover {
  background: var(--bg-hover);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px;
}

.user-avatar-large {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), #a29bfe);
  color: #fff;
  font-weight: 700;
  font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.user-name {
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.user-register-date {
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 24px;
}

.note-section {
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 20px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.note-field {
  margin-bottom: 12px;
}

.note-field label {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.note-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.note-input:focus {
  border-color: var(--accent);
}

.note-textarea {
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
}

.note-textarea:focus {
  border-color: var(--accent);
}

.save-note-btn {
  width: 100%;
  padding: 10px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition);
}

.save-note-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.save-note-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.block-section {
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  padding: 16px;
}

.block-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.block-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.block-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.block-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.toggle-switch {
  position: relative;
  width: 48px;
  height: 28px;
  border-radius: 14px;
  background: var(--border);
  border: none;
  cursor: pointer;
  transition: background var(--transition);
  flex-shrink: 0;
}

.toggle-switch.active {
  background: #e74c3c;
}

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  transition: transform var(--transition);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle-switch.active .toggle-knob {
  transform: translateX(20px);
}

.sidebar-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 14px;
}

.loading-spinner {
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

/* Slide animation */
.slide-left-enter-active {
  transition: all 0.3s ease;
}

.slide-left-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-left-leave-active {
  transition: all 0.2s ease;
}

.slide-left-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.slide-left-enter-from,
.slide-left-leave-to {
  /* ensure overlay animates too */
}

.slide-left-enter-active .sidebar-overlay,
.slide-left-leave-active .sidebar-overlay {
  transition: opacity 0.3s ease;
}

.slide-left-enter-from .sidebar-overlay,
.slide-left-leave-to .sidebar-overlay {
  opacity: 0;
}
</style>
