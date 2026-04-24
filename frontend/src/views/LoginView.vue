<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-bg-effect"></div>
      <div class="auth-logo">🤖</div>
      <h1 class="auth-title accent-gradient">NE</h1>
      <p class="auth-subtitle">Personal Assistant <span class="version-badge">v1.0.0</span></p>
      
      <form @submit.prevent="handleLogin" class="auth-form">
        <div class="form-group">
          <div class="input-icon">👤</div>
          <input
            v-model="username"
            type="text"
            placeholder="用户名"
            autocomplete="username"
            required
          />
        </div>
        <div class="form-group">
          <div class="input-icon">🔒</div>
          <input
            v-model="password"
            type="password"
            placeholder="密码"
            autocomplete="current-password"
            required
          />
        </div>
        <p v-if="error" class="auth-error">
          <span class="error-icon">⚠️</span> {{ error }}
        </p>
        <button type="submit" class="auth-btn" :disabled="loading">
          <span v-if="loading" class="loading-spinner"></span>
          {{ loading ? '登录中...' : '登 录' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await authStore.login(username.value, password.value)
    router.push('/')
  } catch (err) {
    error.value = err.response?.data?.message || '登录失败，请检查用户名和密码'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  padding: 20px;
  position: relative;
  overflow: hidden;
}

.auth-page::before {
  content: '';
  position: fixed;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(ellipse at 30% 20%, rgba(108, 92, 231, 0.08) 0%, transparent 50%),
              radial-gradient(ellipse at 70% 80%, rgba(168, 85, 247, 0.05) 0%, transparent 50%);
  animation: bgRotate 30s linear infinite;
}

@keyframes bgRotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.auth-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 48px 40px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 8px 32px var(--shadow), 0 0 0 1px rgba(255,255,255,0.02);
  text-align: center;
  position: relative;
  z-index: 1;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.auth-bg-effect {
  position: absolute;
  top: -1px;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 3px;
  background: var(--accent-gradient);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  filter: blur(8px);
}

.auth-logo {
  font-size: 56px;
  margin-bottom: 8px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.auth-title {
  font-size: 32px;
  font-weight: 800;
  margin-bottom: 4px;
  letter-spacing: 2px;
}

.auth-subtitle {
  color: var(--text-muted);
  font-size: 14px;
  margin-bottom: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  position: relative;
}

.form-group .input-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 16px;
  pointer-events: none;
  opacity: 0.6;
}

.form-group input {
  text-align: center;
  font-size: 15px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  width: 100%;
}

.form-group input::placeholder {
  color: var(--text-muted);
}

.auth-error {
  color: var(--danger);
  font-size: 13px;
  text-align: center;
  background: rgba(231, 76, 60, 0.1);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.error-icon {
  font-size: 14px;
}

.auth-btn {
  width: 100%;
  padding: 14px;
  background: var(--accent-gradient);
  color: #ffffff;
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 600;
  transition: all var(--transition);
  box-shadow: var(--accent-glow);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.auth-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: var(--accent-glow-strong);
}

.auth-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.auth-switch {
  margin-top: 24px;
  color: var(--text-secondary);
  font-size: 14px;
}

.auth-switch a {
  font-weight: 600;
}

@media (max-width: 480px) {
  .auth-card {
    padding: 36px 24px;
  }
  
  .auth-logo {
    font-size: 48px;
  }
  
  .auth-title {
    font-size: 28px;
  }
}
</style>
