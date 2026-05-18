<template>
  <div class="lock-screen">
    <div class="lock-content">
      <div class="lock-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
      </div>
      <h2>密码库已锁定</h2>
      <p class="lock-hint">请输入主密码解锁</p>
      <form @submit.prevent="unlock" class="lock-form">
        <div class="form-group">
          <input
            ref="passwordInput"
            v-model="masterPassword"
            type="password"
            placeholder="主密码"
            autofocus
          />
        </div>
        <p v-if="error" class="error-text">{{ error }}</p>
        <button type="submit" class="btn btn-primary" :disabled="unlocking">
          {{ unlocking ? '解锁中...' : '解锁' }}
        </button>
      </form>
      <p class="lock-tip">首次使用请设置主密码</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { verifyMasterPassword } from '../../utils/crypto'
import { getMasterPasswordProof } from '../../utils/passwordDB'

const emit = defineEmits(['unlock'])

const masterPassword = ref('')
const error = ref('')
const unlocking = ref(false)
const passwordInput = ref(null)

onMounted(() => {
  nextTick(() => {
    passwordInput.value?.focus()
  })
})

async function unlock() {
  if (!masterPassword.value) {
    error.value = '请输入主密码'
    return
  }

  unlocking.value = true
  error.value = ''

  try {
    const proof = await getMasterPasswordProof()
    if (!proof) {
      // 首次设置，直接通过，后续由 store 保存
      emit('unlock', masterPassword.value, true)
    } else {
      const valid = await verifyMasterPassword(proof, masterPassword.value)
      if (valid) {
        emit('unlock', masterPassword.value, false)
      } else {
        error.value = '主密码错误'
        masterPassword.value = ''
      }
    }
  } catch (e) {
    error.value = '解锁失败，请重试'
  } finally {
    unlocking.value = false
  }
}
</script>

<style scoped>
.lock-screen {
  position: fixed;
  inset: 0;
  background: var(--bg-primary, #f9fafb);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.lock-content {
  text-align: center;
  max-width: 360px;
  width: 100%;
  padding: 40px 24px;
}
.lock-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 24px;
  background: var(--primary, #6366f1);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lock-icon svg {
  width: 32px;
  height: 32px;
  color: #fff;
}
.lock-content h2 {
  margin: 0 0 8px;
  font-size: 24px;
  color: var(--text-primary, #111827);
}
.lock-hint {
  color: var(--text-secondary, #6b7280);
  margin: 0 0 24px;
}
.lock-form {
  margin-bottom: 16px;
}
.form-group input {
  width: 100%;
  padding: 14px 16px;
  border: 2px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  font-size: 16px;
  text-align: center;
  background: var(--input-bg, #fff);
  color: var(--text-primary, #111827);
  box-sizing: border-box;
}
.form-group input:focus {
  outline: none;
  border-color: var(--primary, #6366f1);
}
.error-text {
  color: #ef4444;
  font-size: 14px;
  margin: 12px 0;
}
.btn {
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}
.btn-primary {
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
.lock-tip {
  font-size: 13px;
  color: var(--text-muted, #9ca3af);
  margin: 0;
}
</style>
