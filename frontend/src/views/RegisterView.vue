<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-logo">🤖</div>
      <h1 class="auth-title">注册</h1>
      <p class="auth-subtitle">创建你的 NE 账号</p>
      
      <form @submit.prevent="handleRegister" class="auth-form">
        <div class="form-group">
          <input
            v-model="username"
            type="text"
            placeholder="用户名"
            autocomplete="username"
            required
          />
        </div>
        <div class="form-group">
          <input
            v-model="password"
            type="password"
            placeholder="密码"
            autocomplete="new-password"
            required
            minlength="6"
          />
        </div>
        <div class="form-group">
          <input
            v-model="confirmPassword"
            type="password"
            placeholder="确认密码"
            autocomplete="new-password"
            required
          />
        </div>
        <p v-if="error" class="auth-error">{{ error }}</p>
        <p v-if="success" class="auth-success">{{ success }}</p>
        <button type="submit" class="auth-btn" :disabled="loading">
          {{ loading ? '注册中...' : '注 册' }}
        </button>
      </form>
      
      <p class="auth-switch">
        已有账号？
        <router-link to="/login">立即登录</router-link>
      </p>
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
const confirmPassword = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)

async function handleRegister() {
  error.value = ''
  success.value = ''
  
  if (password.value.length < 6) {
    error.value = '密码至少需要 6 个字符'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  
  loading.value = true
  try {
    await authStore.register(username.value, password.value)
    router.push('/')
  } catch (err) {
    error.value = err.response?.data?.message || '注册失败，请重试'
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
}

.auth-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 48px 40px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 8px 32px var(--shadow);
  text-align: center;
}

.auth-logo {
  font-size: 48px;
  margin-bottom: 8px;
}

.auth-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.auth-subtitle {
  color: var(--text-muted);
  font-size: 14px;
  margin-bottom: 32px;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group input {
  text-align: center;
  font-size: 15px;
  padding: 14px;
  border-radius: var(--radius-md);
}

.auth-error {
  color: var(--danger);
  font-size: 13px;
  text-align: center;
}

.auth-success {
  color: var(--success);
  font-size: 13px;
  text-align: center;
}

.auth-btn {
  width: 100%;
  padding: 14px;
  background: var(--accent);
  color: #ffffff;
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 600;
  transition: all var(--transition);
}

.auth-btn:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(108, 92, 231, 0.4);
}

.auth-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.auth-switch {
  margin-top: 24px;
  color: var(--text-secondary);
  font-size: 14px;
}

.auth-switch a {
  font-weight: 600;
}
</style>
