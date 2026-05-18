<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>{{ isEdit ? '编辑密码' : '添加密码' }}</h3>
        <button class="btn-icon" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <form @submit.prevent="handleSubmit" class="modal-body">
        <div class="form-group">
          <label>站点名称 <span class="required">*</span></label>
          <input v-model="form.siteName" type="text" required placeholder="例如：GitHub" />
        </div>
        <div class="form-group">
          <label>站点 URL</label>
          <input v-model="form.url" type="url" placeholder="https://github.com" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>用户名 <span class="required">*</span></label>
            <input v-model="form.username" type="text" required placeholder="邮箱或用户名" />
          </div>
          <div class="form-group">
            <label>分类</label>
            <select v-model="form.category">
              <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>密码</label>
          <div class="password-input-group">
            <input
              :type="showPassword ? 'text' : 'password'"
              v-model="form.password"
              placeholder="输入或生成密码"
              required
            />
            <button type="button" class="btn-icon" @click="showPassword = !showPassword" title="显示/隐藏">
              <svg v-if="showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button type="button" class="btn-icon generate-btn" @click="showGenerator = !showGenerator" title="生成密码">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
            </button>
          </div>
          <div v-if="form.password" class="strength-row">
            <div class="strength-bar">
              <div class="strength-fill" :style="{ width: strength.percentage + '%', backgroundColor: strength.color }"></div>
            </div>
            <span class="strength-label" :style="{ color: strength.color }">{{ strength.label }}</span>
          </div>
        </div>

        <!-- 密码生成器 -->
        <div v-if="showGenerator" class="generator-panel">
          <PasswordGenerator @generate="onGenerated" />
        </div>

        <div class="form-group">
          <label>备注</label>
          <textarea v-model="form.notes" rows="3" placeholder="可选备注信息"></textarea>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.favorite" />
            标记为收藏
          </label>
        </div>
      </form>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button type="submit" class="btn btn-primary" @click="handleSubmit" :disabled="submitting">
          {{ submitting ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { getPasswordStrengthBar } from '../../utils/passwordStrength'
import PasswordGenerator from './PasswordGenerator.vue'

const props = defineProps({
  entry: { type: Object, default: null }
})

const emit = defineEmits(['close', 'save'])

const isEdit = computed(() => !!props.entry)

const form = reactive({
  siteName: props.entry?.siteName || '',
  url: props.entry?.url || '',
  username: props.entry?.username || '',
  password: '',
  category: props.entry?.category || '未分类',
  notes: props.entry?.notes || '',
  favorite: props.entry?.favorite || false
})

const showPassword = ref(false)
const showGenerator = ref(false)
const submitting = ref(false)

const strength = computed(() => getPasswordStrengthBar(form.password))

const categories = ['未分类', '社交', '工作', '购物', '金融', '娱乐', '游戏', '工具']

function onGenerated(password) {
  form.password = password
  showGenerator.value = false
}

async function handleSubmit() {
  if (!form.siteName || !form.username || !form.password) return
  submitting.value = true
  try {
    emit('save', {
      ...props.entry,
      siteName: form.siteName,
      url: form.url,
      username: form.username,
      password: form.password,
      category: form.category,
      notes: form.notes,
      favorite: form.favorite
    })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}
.modal {
  background: var(--card-bg, #fff);
  border-radius: 16px;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}
.modal-header h3 {
  margin: 0;
  font-size: 18px;
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
}
.btn-icon:hover {
  background: var(--hover-bg, #f3f4f6);
}
.btn-icon svg {
  width: 18px;
  height: 18px;
}
.modal-body {
  padding: 24px;
}
.form-group {
  margin-bottom: 16px;
}
.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #374151);
}
.required {
  color: #ef4444;
}
.form-group input[type="text"],
.form-group input[type="url"],
.form-group input[type="password"],
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  font-size: 14px;
  background: var(--input-bg, #fff);
  color: var(--text-primary, #374151);
  box-sizing: border-box;
}
.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--primary, #6366f1);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.password-input-group {
  display: flex;
  gap: 4px;
}
.password-input-group input {
  flex: 1;
}
.generate-btn {
  flex-shrink: 0;
}
.strength-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.strength-bar {
  flex: 1;
  height: 4px;
  background: var(--border-color, #e5e7eb);
  border-radius: 2px;
  overflow: hidden;
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
.generator-panel {
  margin-top: 12px;
  padding: 16px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 8px;
}
.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 400 !important;
}
.checkbox-label input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary, #6366f1);
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}
.btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
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
.btn-secondary {
  background: var(--bg-secondary, #f3f4f6);
  color: var(--text-primary, #374151);
}
.btn-secondary:hover {
  background: #e5e7eb;
}
</style>
