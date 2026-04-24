<template>
<div class="profile-page">
  <div class="profile-header">
    <h2>⚙️ 个人中心</h2>
  </div>

  <div class="profile-content">
    <!-- Avatar & Basic Info -->
    <div class="profile-card info-card">
      <div class="avatar-section">
        <div class="avatar-large">
          {{ user.nickname?.charAt(0)?.toUpperCase() || user.username?.charAt(0)?.toUpperCase() || 'U' }}
        </div>
        <div class="user-info">
          <div class="username">{{ user.username }}</div>
          <div class="nickname-display">
            {{ user.nickname || '（未设置昵称）' }}
          </div>
          <div class="member-since">
            注册于 {{ formatDate(user.createdAt) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Profile -->
    <div class="profile-card">
      <div class="card-title">📝 基本信息</div>
      <div class="form-section">
        <div class="form-group">
          <label>用户名</label>
          <input type="text" :value="user.username" disabled class="input-disabled" />
          <span class="form-hint">用户名注册后不可修改</span>
        </div>
        <div class="form-group">
          <label>昵称 <span class="required">*</span></label>
          <input
            v-model="form.nickname"
            type="text"
            placeholder="请输入昵称，用于消息界面辨认身份"
            maxlength="50"
            class="form-input nickname-input"
          />
          <span class="form-hint">{{ form.nickname.length }}/50 · 将显示在消息界面中</span>
        </div>
        <div class="form-group">
          <label>个性签名</label>
          <textarea
            v-model="form.bio"
            placeholder="介绍一下自己吧..."
            maxlength="200"
            rows="3"
            class="form-textarea"
          ></textarea>
          <span class="form-hint">{{ form.bio.length }}/200</span>
        </div>
        <button @click="saveProfile" :disabled="saving" class="save-btn">
          {{ saving ? '保存中...' : '💾 保存修改' }}
        </button>
      </div>
    </div>

    <!-- Change Password -->
    <div class="profile-card">
      <div class="card-title">🔒 修改密码</div>
      <div class="form-section">
        <div class="form-group">
          <label>当前密码</label>
          <input
            v-model="passwordForm.currentPassword"
            type="password"
            placeholder="请输入当前密码"
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label>新密码</label>
          <input
            v-model="passwordForm.newPassword"
            type="password"
            placeholder="至少 6 个字符"
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label>确认新密码</label>
          <input
            v-model="passwordForm.confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            class="form-input"
          />
        </div>
        <button @click="changePassword" :disabled="changingPassword" class="save-btn">
          {{ changingPassword ? '修改中...' : '🔑 修改密码' }}
        </button>
      </div>
    </div>

    <!-- Model Binding -->
    <div class="profile-card">
      <div class="card-title">🚀 模型加速</div>
      <div class="model-binding-section">
        <p class="binding-desc">绑定自定义模型 API Key，加速你的对话体验</p>
        <button @click="$router.push('/api-keys')" class="binding-btn">
          🔑 管理 API Key
        </button>
      </div>
    </div>

    <!-- Stats -->
    <div class="profile-card">
      <div class="card-title">📊 使用统计</div>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">{{ stats.conversations }}</div>
          <div class="stat-label">对话数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ stats.todos.total }}</div>
          <div class="stat-label">待办总数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ stats.todos.completed }}</div>
          <div class="stat-label">已完成</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ stats.todos.total - stats.todos.completed }}</div>
          <div class="stat-label">进行中</div>
        </div>
      </div>
    </div>

    <!-- Logout -->
    <div class="profile-card danger-card">
      <div class="card-title">⚠️ 危险操作</div>
      <div class="danger-section">
        <p>退出登录后，需要重新输入账号密码才能访问。</p>
        <button @click="logout" class="logout-btn">🚪 退出登录</button>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div v-if="toast.show" class="toast" :class="toast.type">{{ toast.message }}</div>
</div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const user = ref({
  id: 0,
  username: '',
  nickname: '',
  bio: '',
  createdAt: ''
})

const form = reactive({
  nickname: '',
  bio: ''
})

const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const stats = ref({
  conversations: 0,
  todos: { total: 0, completed: 0 }
})

const saving = ref(false)
const changingPassword = ref(false)
const toast = ref({ show: false, message: '', type: 'info' })

onMounted(async () => {
  await loadProfile()
  await loadStats()
})

async function loadProfile() {
  try {
    const token = localStorage.getItem('token')
    const resp = await fetch('/api/tools/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (resp.ok) {
      const data = await resp.json()
      user.value = data
      form.nickname = data.nickname || ''
      form.bio = data.bio || ''
    }
  } catch (err) {
    console.error('Load profile error:', err)
  }
}

async function loadStats() {
  try {
    const token = localStorage.getItem('token')
    const resp = await fetch('/api/tools/profile/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (resp.ok) {
      stats.value = await resp.json()
    }
  } catch (err) {
    console.error('Load stats error:', err)
  }
}

async function saveProfile() {
  if (!form.nickname.trim()) {
    showToast('请设置昵称', 'error')
    return
  }
  
  saving.value = true
  try {
    const token = localStorage.getItem('token')
    const resp = await fetch('/api/tools/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        nickname: form.nickname,
        bio: form.bio
      })
    })
    
    const result = await resp.json()
    if (resp.ok) {
      showToast('保存成功', 'success')
      await loadProfile()
    } else {
      showToast(result.error || '保存失败', 'error')
    }
  } catch (err) {
    console.error('Save profile error:', err)
    showToast('保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function changePassword() {
  if (!passwordForm.currentPassword) {
    showToast('请输入当前密码', 'error')
    return
  }
  if (!passwordForm.newPassword || passwordForm.newPassword.length < 6) {
    showToast('新密码至少 6 个字符', 'error')
    return
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    showToast('两次输入的新密码不一致', 'error')
    return
  }
  
  changingPassword.value = true
  try {
    const token = localStorage.getItem('token')
    const resp = await fetch('/api/tools/profile/password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      })
    })
    
    const result = await resp.json()
    if (resp.ok) {
      showToast('密码修改成功，请重新登录', 'success')
      // 清空密码表单
      passwordForm.currentPassword = ''
      passwordForm.newPassword = ''
      passwordForm.confirmPassword = ''
      // 3秒后退出登录
      setTimeout(() => logout(), 3000)
    } else {
      showToast(result.error || '修改失败', 'error')
    }
  } catch (err) {
    console.error('Change password error:', err)
    showToast('修改失败', 'error')
  } finally {
    changingPassword.value = false
  }
}

function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('username')
  showToast('已退出登录', 'info')
  setTimeout(() => {
    router.push('/login')
  }, 500)
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function showToast(message, type = 'info') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 2500)
}
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: var(--bg-page);
  padding: 20px;
}

.profile-header {
  margin-bottom: 24px;
}

.profile-header h2 {
  font-size: 20px;
  color: var(--text-primary);
}

.profile-content {
  max-width: 600px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

/* Info Card */
.info-card {
  background: linear-gradient(135deg, var(--bg-card) 0%, rgba(128, 128, 255, 0.05) 100%);
}

.avatar-section {
  display: flex;
  align-items: center;
  gap: 20px;
}

.avatar-large {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent) 0%, #9b59b6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.user-info {
  flex: 1;
}

.username {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.nickname-display {
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.member-since {
  font-size: 12px;
  color: var(--text-muted);
}

/* Form */
.form-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}

.required {
  color: #e74c3c;
}

.form-input {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: var(--accent);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.form-textarea {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  resize: vertical;
  transition: border-color 0.2s;
}

.form-textarea:focus {
  border-color: var(--accent);
}

.nickname-input {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(128, 128, 255, 0.1);
}

.nickname-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(128, 128, 255, 0.15);
}

.input-disabled {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: repeating-linear-gradient(
    45deg,
    rgba(128, 128, 128, 0.05),
    rgba(128, 128, 128, 0.05) 2px,
    rgba(128, 128, 128, 0.08) 2px,
    rgba(128, 128, 128, 0.08) 4px
  );
  color: var(--text-muted);
  font-size: 14px;
  cursor: not-allowed;
  user-select: none;
}

.input-disabled::placeholder {
  color: rgba(128, 128, 128, 0.4);
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  text-align: right;
}

.save-btn {
  padding: 14px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.save-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Model Binding */
.model-binding-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.binding-desc {
  font-size: 14px;
  color: var(--text-muted);
  flex: 1;
}

.binding-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, var(--accent) 0%, #a29bfe 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.binding-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(108, 92, 231, 0.3);
}

/* Stats */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-item {
  text-align: center;
  padding: 16px 8px;
  background: rgba(128, 128, 128, 0.05);
  border-radius: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
}

/* Danger Card */
.danger-card {
  border-color: rgba(231, 76, 60, 0.3);
}

.danger-card .card-title {
  color: #e74c3c;
  border-bottom-color: rgba(231, 76, 60, 0.2);
}

.danger-section {
  text-align: center;
}

.danger-section p {
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.logout-btn {
  padding: 14px 32px;
  background: rgba(231, 76, 60, 0.1);
  color: #e74c3c;
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.logout-btn:hover {
  background: rgba(231, 76, 60, 0.2);
  border-color: #e74c3c;
}

/* Toast */
.toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 1000;
  animation: toastIn 0.3s ease;
}

.toast.success {
  background: #2ecc71;
  color: #fff;
}

.toast.error {
  background: #e74c3c;
  color: #fff;
}

.toast.info {
  background: var(--accent);
  color: #fff;
}

@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(20px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* Responsive */
@media (max-width: 600px) {
  .profile-page {
    padding: 12px;
  }
  
  .profile-card {
    padding: 16px;
  }
  
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .model-binding-section {
    flex-direction: column;
    text-align: center;
  }
  
  .binding-btn {
    width: 100%;
  }
  
  .avatar-section {
    flex-direction: column;
    text-align: center;
  }
}
</style>
