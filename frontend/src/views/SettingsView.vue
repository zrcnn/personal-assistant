<template>
  <div class="settings-page">
    <div class="settings-container">
      <h2 class="settings-title">⚙️ 设置</h2>
      
      <!-- Theme -->
      <div class="settings-section">
        <h3 class="section-title">外观</h3>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">主题模式</span>
            <span class="setting-desc">选择你喜欢的界面风格</span>
          </div>
          <div class="theme-selector">
            <button
              class="theme-option"
              :class="{ active: themeStore.mode === 'dark' }"
              @click="themeStore.setTheme('dark')"
            >
              <span class="theme-icon">🌙</span>
              <span>暗色</span>
            </button>
            <button
              class="theme-option"
              :class="{ active: themeStore.mode === 'light' }"
              @click="themeStore.setTheme('light')"
            >
              <span class="theme-icon">☀️</span>
              <span>亮色</span>
            </button>
            <button
              class="theme-option"
              :class="{ active: themeStore.mode === 'auto' }"
              @click="themeStore.setTheme('auto')"
            >
              <span class="theme-icon">💻</span>
              <span>跟随系统</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Profile -->
      <div class="settings-section">
        <h3 class="section-title">个人资料</h3>
        <div class="setting-item profile-card">
          <div class="profile-form">
            <div class="form-group">
              <label class="form-label">用户名</label>
              <input
                v-model="profileForm.username"
                type="text"
                class="form-input"
                placeholder="请输入用户名"
                maxlength="50"
              />
            </div>
            <div class="form-group">
              <label class="form-label">个性签名</label>
              <textarea
                v-model="profileForm.bio"
                class="form-input form-textarea"
                placeholder="介绍一下自己吧..."
                maxlength="200"
                rows="3"
              ></textarea>
              <span class="char-count">{{ (profileForm.bio || '').length }}/200</span>
            </div>
            <div v-if="profileMsg" class="password-msg" :class="profileMsgType">
              {{ profileMsg }}
            </div>
            <button class="save-password-btn" @click="saveProfile" :disabled="profileLoading">
              {{ profileLoading ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>

      <!-- API Key Management -->
      <div class="settings-section">
        <h3 class="section-title">API Key 管理</h3>
        <div class="setting-item" @click="$router.push('/api-keys')" style="cursor:pointer">
          <div class="setting-info">
            <span class="setting-label">🔑 模型 API Key</span>
            <span class="setting-desc">管理你的模型 API Key，用于自定义模型加速</span>
          </div>
          <span style="color:var(--text-muted)">→</span>
        </div>
      </div>

      <!-- Change Password -->
      <div class="settings-section">
        <h3 class="section-title">账号安全</h3>
        <div class="setting-item password-card">
          <div class="password-form">
            <div class="form-group">
              <label class="form-label">原密码</label>
              <input
                v-model="oldPassword"
                type="password"
                class="form-input"
                placeholder="请输入原密码"
              />
            </div>
            <div class="form-group">
              <label class="form-label">新密码</label>
              <input
                v-model="newPassword"
                type="password"
                class="form-input"
                placeholder="请输入新密码（至少6位）"
              />
            </div>
            <div class="form-group">
              <label class="form-label">确认新密码</label>
              <input
                v-model="confirmPassword"
                type="password"
                class="form-input"
                placeholder="请再次输入新密码"
              />
            </div>
            <div v-if="passwordMsg" class="password-msg" :class="passwordMsgType">
              {{ passwordMsg }}
            </div>
            <button class="save-password-btn" @click="changePassword" :disabled="passwordLoading">
              {{ passwordLoading ? '修改中...' : '修改密码' }}
            </button>
          </div>
        </div>
      </div>
      
      <!-- Data -->
      <div class="settings-section">
        <h3 class="section-title">数据管理</h3>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">清除对话历史</span>
            <span class="setting-desc">删除所有对话记录，此操作不可撤销</span>
          </div>
          <button class="danger-btn" @click="showClearConfirm = true">
            清除全部
          </button>
        </div>
      </div>
      
      <!-- About -->
      <div class="settings-section">
        <h3 class="section-title">关于</h3>
        <div class="about-info">
          <div class="about-row">
            <span class="about-label">应用名称</span>
            <span class="about-value">NE - Personal Assistant</span>
          </div>
          <div class="about-row">
            <span class="about-label">版本</span>
            <span class="about-value">1.0.0</span>
          </div>
          <div class="about-row">
            <span class="about-label">技术栈</span>
            <span class="about-value">Vue 3 + Vite</span>
          </div>
          <div class="about-row">
            <span class="about-label">用户</span>
            <span class="about-value">{{ authStore.username }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Clear Confirm Modal -->
    <transition name="fade">
      <div v-if="showClearConfirm" class="modal-overlay" @click.self="showClearConfirm = false">
        <div class="modal">
          <h3>⚠️ 确认清除</h3>
          <p class="modal-text">你确定要清除所有对话历史吗？此操作不可撤销。</p>
          <div class="modal-actions">
            <button class="modal-btn cancel" @click="showClearConfirm = false">取消</button>
            <button class="modal-btn danger" @click="clearAllConversations">确认清除</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useThemeStore } from '../stores/theme'
import { useAuthStore } from '../stores/auth'
import api from '../api/index'
import { conversationAPI } from '../api/modules'

const themeStore = useThemeStore()
const authStore = useAuthStore()

const showClearConfirm = ref(false)

// Change password
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordLoading = ref(false)
const passwordMsg = ref('')
const passwordMsgType = ref('') // 'success' or 'error'

const profileForm = ref({ username: '', bio: '' })
const profileLoading = ref(false)
const profileMsg = ref('')
const profileMsgType = ref('') // 'success' or 'error'

async function loadProfile() {
  try {
    const res = await api.get('/api/auth/profile')
    const user = res.data?.user || {}
    profileForm.value = {
      username: user.username || '',
      bio: user.bio || ''
    }
  } catch (err) {
    console.error('[Settings] Load profile failed:', err)
  }
}

async function saveProfile() {
  profileMsg.value = ''
  if (!profileForm.value.username || !profileForm.value.username.trim()) {
    profileMsg.value = '用户名不能为空'
    profileMsgType.value = 'error'
    return
  }
  
  profileLoading.value = true
  try {
    await api.put('/api/auth/profile', {
      username: profileForm.value.username.trim(),
      bio: profileForm.value.bio?.trim() || ''
    })
    profileMsg.value = '资料保存成功'
    profileMsgType.value = 'success'
  } catch (err) {
    profileMsg.value = err.response?.data?.error || '保存失败'
    profileMsgType.value = 'error'
  } finally {
    profileLoading.value = false
  }
}

async function changePassword() {
  passwordMsg.value = ''
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    passwordMsg.value = '请填写所有密码字段'
    passwordMsgType.value = 'error'
    return
  }
  if (newPassword.value.length < 6) {
    passwordMsg.value = '新密码至少6个字符'
    passwordMsgType.value = 'error'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordMsg.value = '两次输入的新密码不一致'
    passwordMsgType.value = 'error'
    return
  }

  passwordLoading.value = true
  try {
    const res = await api.post('/auth/change-password', {
      old_password: oldPassword.value,
      new_password: newPassword.value
    })
    passwordMsg.value = '密码修改成功'
    passwordMsgType.value = 'success'
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (err) {
    passwordMsg.value = err.response?.data?.error || '修改密码失败'
    passwordMsgType.value = 'error'
  } finally {
    passwordLoading.value = false
  }
}

async function clearAllConversations() {
  try {
    // Get all conversations and delete each
    const res = await conversationAPI.list()
    const conversations = res.data || []
    await Promise.all(conversations.map(c => conversationAPI.delete(c.id)))
    showClearConfirm.value = false
  } catch {
    // silently fail
  }
}

onMounted(() => {
  loadProfile()
})
</script>

<style scoped>
.settings-page {
  max-width: 700px;
  margin: 0 auto;
  padding: 40px 20px;
}

.settings-title {
  font-size: 28px;
  color: var(--text-primary);
  margin-bottom: 32px;
}

.settings-section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  gap: 16px;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.setting-desc {
  font-size: 13px;
  color: var(--text-muted);
}

/* Theme Selector */
.theme-selector {
  display: flex;
  gap: 8px;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
  transition: all var(--transition);
  min-width: 64px;
}

.theme-option:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.theme-option.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
}

.theme-icon {
  font-size: 20px;
}

.danger-btn {
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  background: rgba(231, 76, 60, 0.1);
  color: var(--danger);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transition: all var(--transition);
}

.danger-btn:hover {
  background: var(--danger);
  color: #ffffff;
}

.accent-btn {
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  background: var(--accent-light);
  color: var(--accent);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transition: all var(--transition);
}

.accent-btn:hover {
  background: var(--accent);
  color: #ffffff;
}

/* About */
.about-info {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.about-row {
  display: flex;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

.about-row:last-child {
  border-bottom: none;
}

.about-label {
  color: var(--text-muted);
  font-size: 14px;
}

.about-value {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
}

/* Password Form */
.password-card {
  display: block;
}

.password-form {
  width: 100%;
}

.form-group {
  margin-bottom: 12px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: all var(--transition);
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

.char-count {
  display: block;
  text-align: right;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

.password-msg {
  font-size: 13px;
  margin-bottom: 8px;
  padding: 6px 0;
}

.password-msg.success {
  color: #2ecc71;
}

.password-msg.error {
  color: var(--danger);
}

.save-password-btn {
  padding: 10px 24px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all var(--transition);
}

.save-password-btn:hover {
  opacity: 0.9;
}

.save-password-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Modal */
.profile-card {
  display: block;
}

.profile-form {
  width: 100%;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 400;
  padding: 20px;
}

.modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 24px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 16px 48px var(--shadow);
}

.modal h3 {
  font-size: 18px;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.modal-text {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 20px;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.modal-btn {
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
}

.modal-btn.cancel {
  color: var(--text-secondary);
}

.modal-btn.cancel:hover {
  background: var(--bg-hover);
}

.modal-btn.danger {
  background: var(--danger);
  color: #ffffff;
}

.modal-btn.danger:hover {
  background: var(--danger-hover);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .settings-page {
    padding: 20px 12px;
  }

  .settings-title {
    font-size: 22px;
  }

  .setting-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .theme-selector {
    width: 100%;
  }

  .theme-option {
    flex: 1;
  }
}
</style>
