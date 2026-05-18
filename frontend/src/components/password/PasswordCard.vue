<template>
  <div class="password-card" @click="$emit('edit', entry)">
    <div class="card-header">
      <div class="site-icon">
        <img v-if="faviconUrl" :src="faviconUrl" alt="" @error="faviconUrl = null" />
        <span v-else>{{ siteInitial }}</span>
      </div>
      <div class="site-info">
        <div class="site-name">{{ decryptedSiteName }}</div>
        <div class="username text-muted">{{ decryptedUsername }}</div>
      </div>
      <div class="card-actions" @click.stop>
        <button class="btn-icon" title="复制用户名" @click.stop="copyText(decryptedUsername, '用户名已复制')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
        <button class="btn-icon" title="复制密码" @click.stop="copyPassword">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
        <button class="btn-icon" :title="showPassword ? '隐藏密码' : '显示密码'" @click.stop="showPassword = !showPassword">
          <svg v-if="showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
    </div>
    <div class="card-password">
      <span class="password-text">{{ showPassword ? decryptedPassword : '••••••••••••' }}</span>
      <div class="strength-bar">
        <div class="strength-fill" :style="{ width: strength.percentage + '%', backgroundColor: strength.color }"></div>
      </div>
      <span class="strength-label" :style="{ color: strength.color }">{{ strength.label }}</span>
    </div>
    <div class="card-footer">
      <span class="category-tag">{{ entry.category || '未分类' }}</span>
      <span class="update-time">{{ formatDate(entry.updatedAt) }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { assessPasswordStrength, getPasswordStrengthBar } from '../../utils/passwordStrength'

const props = defineProps({
  entry: { type: Object, required: true },
  decryptedSiteName: { type: String, required: true },
  decryptedUsername: { type: String, required: true },
  decryptedPassword: { type: String, required: true }
})

const emit = defineEmits(['edit'])

const showPassword = ref(false)
const faviconUrl = ref(null)

// 尝试获取 favicon
if (props.entry.url) {
  try {
    const url = new URL(props.entry.url)
    faviconUrl.value = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`
  } catch {}
}

const siteInitial = computed(() => props.decryptedSiteName.charAt(0).toUpperCase())

const strength = computed(() => getPasswordStrengthBar(props.decryptedPassword))

function formatDate(ts) {
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 86400000) {
    return `今天 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}

let clipboardTimer = null
function copyText(text, message) {
  navigator.clipboard.writeText(text).then(() => {
    // 30秒后清除剪贴板
    if (clipboardTimer) clearTimeout(clipboardTimer)
    clipboardTimer = setTimeout(() => {
      navigator.clipboard.writeText('')
    }, 30000)
  })
}

function copyPassword() {
  copyText(props.decryptedPassword, '密码已复制（30秒后自动清除）')
}

onUnmounted(() => {
  if (clipboardTimer) clearTimeout(clipboardTimer)
})
</script>

<style scoped>
.password-card {
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}
.password-card:hover {
  border-color: var(--primary, #6366f1);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1);
}
.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.site-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 18px;
  overflow: hidden;
  flex-shrink: 0;
}
.site-icon img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}
.site-info {
  flex: 1;
  min-width: 0;
}
.site-name {
  font-weight: 600;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.username {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-actions {
  display: flex;
  gap: 4px;
}
.btn-icon {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, #6b7280);
  transition: all 0.2s;
}
.btn-icon:hover {
  background: var(--hover-bg, #f3f4f6);
  color: var(--primary, #6366f1);
}
.btn-icon svg {
  width: 16px;
  height: 16px;
}
.card-password {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.password-text {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 14px;
  color: var(--text-secondary, #6b7280);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.strength-bar {
  width: 60px;
  height: 4px;
  background: var(--border-color, #e5e7eb);
  border-radius: 2px;
  overflow: hidden;
  flex-shrink: 0;
}
.strength-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s;
}
.strength-label {
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.category-tag {
  font-size: 12px;
  padding: 2px 8px;
  background: var(--tag-bg, #f3f4f6);
  border-radius: 4px;
  color: var(--text-secondary, #6b7280);
}
.update-time {
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
}
.text-muted {
  color: var(--text-secondary, #6b7280);
}
</style>
