<template>
  <div class="password-manager">
    <!-- 锁定界面 -->
    <LockScreen
      v-if="!store.isUnlocked && store.isSetup"
      @unlock="handleUnlock"
    />

    <!-- 首次设置界面 -->
    <div v-if="!store.isUnlocked && !store.isSetup" class="setup-screen">
      <div class="setup-content">
        <div class="setup-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>
        <h2>设置主密码</h2>
        <p class="setup-hint">创建一个强密码来保护你的密码库<br/><span class="warning">请妥善保管，忘记密码将无法恢复</span></p>
        <form @submit.prevent="handleSetup" class="setup-form">
          <div class="form-group">
            <input v-model="setupPassword" type="password" placeholder="设置主密码" required />
          </div>
          <div class="form-group">
            <input v-model="setupPasswordConfirm" type="password" placeholder="确认主密码" required />
          </div>
          <p v-if="setupError" class="error-text">{{ setupError }}</p>
          <button type="submit" class="btn btn-primary" :disabled="settingUp">
            {{ settingUp ? '设置中...' : '设置并继续' }}
          </button>
        </form>
      </div>
    </div>

    <!-- 主界面 -->
    <div v-if="store.isUnlocked" class="main-layout">
      <!-- 侧边栏 -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3>🔐 密码库</h3>
          <button class="btn-icon" title="锁定" @click="store.lock">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </button>
        </div>
        <div class="search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="searchInput" type="text" placeholder="搜索密码..." />
        </div>
        <nav class="categories">
          <div
            v-for="cat in store.categories"
            :key="cat.name"
            class="category-item"
            :class="{ active: store.currentCategory === cat.name }"
            @click="store.setCategory(cat.name)"
          >
            <span class="cat-name">{{ cat.name }}</span>
            <span class="cat-count">{{ cat.count }}</span>
          </div>
        </nav>
        <div class="sidebar-footer">
          <button class="btn btn-primary btn-add" @click="openAddModal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            添加密码
          </button>
        </div>
      </aside>

      <!-- 主内容区 -->
      <main class="content">
        <div class="content-header">
          <h2>{{ store.currentCategory }}</h2>
          <span class="entry-count">{{ store.entries.length }} 个密码</span>
        </div>

        <div v-if="store.entries.length === 0" class="empty-state">
          <div class="empty-icon">🔑</div>
          <h3>还没有密码</h3>
          <p>添加你的第一个密码条目吧</p>
          <button class="btn btn-primary" @click="openAddModal">添加密码</button>
        </div>

        <div v-else class="password-grid">
          <PasswordCard
            v-for="entry in store.entries"
            :key="entry.id"
            :entry="entry"
            :decrypted-site-name="entry.siteName"
            :decrypted-username="entry.username"
            :decrypted-password="entry.decryptedPassword"
            @edit="openEditModal"
          />
        </div>
      </main>
    </div>

    <!-- 添加/编辑弹窗 -->
    <PasswordForm
      v-if="showModal"
      :entry="editingEntry"
      @close="closeModal"
      @save="handleSave"
    />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { usePasswordStore } from '../stores/passwordStore'
import LockScreen from '../components/password/LockScreen.vue'
import PasswordCard from '../components/password/PasswordCard.vue'
import PasswordForm from '../components/password/PasswordForm.vue'

const store = usePasswordStore()

const setupPassword = ref('')
const setupPasswordConfirm = ref('')
const setupError = ref('')
const settingUp = ref(false)
const searchInput = ref('')
const showModal = ref(false)
const editingEntry = ref(null)

// 快捷键
function handleKeyDown(e) {
  if (!store.isUnlocked) return
  // Ctrl+Shift+L 锁定
  if (e.ctrlKey && e.shiftKey && e.key === 'L') {
    e.preventDefault()
    store.lock()
  }
  // Ctrl+N 新建
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault()
    openAddModal()
  }
}

onMounted(async () => {
  await store.checkSetup()

  // 快捷键
  document.addEventListener('keydown', handleKeyDown)

  // 启用自动锁定监听
  if (store.isUnlocked) {
    store.enableAutoLockListeners()
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})

// 搜索防抖
let searchTimer = null
watch(searchInput, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    store.setSearch(val)
  }, 300)
})

async function handleUnlock(password) {
  try {
    await store.unlock(password)
  } catch (e) {
    console.error(e)
  }
}

async function handleSetup() {
  if (setupPassword.value !== setupPasswordConfirm.value) {
    setupError.value = '两次输入的密码不一致'
    return
  }
  if (setupPassword.value.length < 6) {
    setupError.value = '主密码至少 6 个字符'
    return
  }
  settingUp.value = true
  setupError.value = ''
  try {
    await store.setup(setupPassword.value)
    store.enableAutoLockListeners()
  } catch (e) {
    setupError.value = '设置失败: ' + e.message
  } finally {
    settingUp.value = false
  }
}

function openAddModal() {
  editingEntry.value = null
  showModal.value = true
}

function openEditModal(entry) {
  editingEntry.value = entry
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingEntry.value = null
}

async function handleSave(data) {
  try {
    if (data.id) {
      await store.editEntry(data)
    } else {
      await store.addEntry(data)
    }
    closeModal()
  } catch (e) {
    console.error('保存失败:', e)
  }
}
</script>

<style scoped>
.password-manager {
  min-height: 100%;
}

/* Setup Screen */
.setup-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary, #f9fafb);
}
.setup-content {
  text-align: center;
  max-width: 400px;
  padding: 40px 24px;
}
.setup-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.setup-icon svg {
  width: 40px;
  height: 40px;
  color: #fff;
}
.setup-content h2 {
  margin: 0 0 8px;
  font-size: 24px;
  color: var(--text-primary, #111827);
}
.setup-hint {
  color: var(--text-secondary, #6b7280);
  margin: 0 0 24px;
  line-height: 1.6;
}
.setup-hint .warning {
  color: #f59e0b;
  font-weight: 500;
}
.setup-form .form-group {
  margin-bottom: 16px;
}
.setup-form input {
  width: 100%;
  padding: 14px 16px;
  border: 2px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  font-size: 16px;
  background: var(--input-bg, #fff);
  color: var(--text-primary, #111827);
  box-sizing: border-box;
}
.setup-form input:focus {
  outline: none;
  border-color: var(--primary, #6366f1);
}
.error-text {
  color: #ef4444;
  font-size: 14px;
  margin-bottom: 16px;
}
.btn {
  padding: 14px 24px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}
.btn-primary {
  width: 100%;
  background: var(--primary, #6366f1);
  color: #fff;
}
.btn-primary:hover {
  opacity: 0.9;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Main Layout */
.main-layout {
  display: flex;
  min-height: calc(100vh - 60px);
}

/* Sidebar */
.sidebar {
  width: 260px;
  background: var(--card-bg, #fff);
  border-right: 1px solid var(--border-color, #e5e7eb);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}
.sidebar-header h3 {
  margin: 0;
  font-size: 18px;
}
.btn-icon {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, #6b7280);
}
.btn-icon:hover {
  background: var(--hover-bg, #f3f4f6);
}
.btn-icon svg {
  width: 18px;
  height: 18px;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-secondary, #f9fafb);
  margin: 12px;
  border-radius: 8px;
}
.search-box svg {
  width: 16px;
  height: 16px;
  color: var(--text-muted, #9ca3af);
  flex-shrink: 0;
}
.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--text-primary, #111827);
  outline: none;
}
.search-box input::placeholder {
  color: var(--text-muted, #9ca3af);
}
.categories {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}
.category-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 4px;
}
.category-item:hover {
  background: var(--hover-bg, #f3f4f6);
}
.category-item.active {
  background: var(--primary-light, #ede9fe);
  color: var(--primary, #6366f1);
  font-weight: 500;
}
.cat-count {
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
  background: var(--bg-secondary, #f3f4f6);
  padding: 2px 8px;
  border-radius: 10px;
}
.category-item.active .cat-count {
  background: var(--primary, #6366f1);
  color: #fff;
}
.sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}
.btn-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  background: var(--primary, #6366f1);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.btn-add:hover {
  opacity: 0.9;
}
.btn-add svg {
  width: 18px;
  height: 18px;
}

/* Content */
.content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}
.content-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}
.content-header h2 {
  margin: 0;
  font-size: 24px;
}
.entry-count {
  font-size: 14px;
  color: var(--text-secondary, #6b7280);
}
.password-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.empty-state {
  text-align: center;
  padding: 80px 24px;
}
.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}
.empty-state h3 {
  margin: 0 0 8px;
  font-size: 20px;
}
.empty-state p {
  color: var(--text-secondary, #6b7280);
  margin: 0 0 24px;
}
.empty-state .btn {
  width: auto;
  padding: 12px 32px;
  background: var(--primary, #6366f1);
  color: #fff;
}
</style>
