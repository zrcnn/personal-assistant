<template>
  <div class="password-generator">
    <div class="gen-header">
      <h4>密码生成器</h4>
    </div>
    <div class="gen-options">
      <div class="length-control">
        <label>长度: {{ length }}</label>
        <input type="range" v-model.number="length" min="8" max="64" />
      </div>
      <div class="checkbox-group">
        <label class="checkbox-label">
          <input type="checkbox" v-model="options.uppercase" /> 大写字母 (A-Z)
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="options.lowercase" /> 小写字母 (a-z)
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="options.numbers" /> 数字 (0-9)
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="options.symbols" /> 特殊字符 (!@#$...)
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="options.excludeAmbiguous" /> 排除易混淆字符 (0Oo1lI)
        </label>
      </div>
    </div>
    <div class="gen-preview">
      <div class="preview-text">{{ generatedPassword || '点击下方按钮生成' }}</div>
      <div class="preview-actions">
        <button type="button" class="btn btn-primary" @click="generate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
          生成
        </button>
        <button type="button" class="btn btn-secondary" @click="copyPassword" v-if="generatedPassword">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          复制
        </button>
        <button type="button" class="btn btn-secondary" @click="fillPassword" v-if="generatedPassword">
          填充
        </button>
      </div>
    </div>
    <div v-if="generatedPassword" class="gen-strength">
      <span>强度:</span>
      <div class="strength-bar">
        <div class="strength-fill" :style="{ width: strength.percentage + '%', backgroundColor: strength.color }"></div>
      </div>
      <span :style="{ color: strength.color }">{{ strength.label }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { getPasswordStrengthBar } from '../../utils/passwordStrength'

const emit = defineEmits(['generate'])

const length = ref(16)
const options = reactive({
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  excludeAmbiguous: false
})

const generatedPassword = ref('')

const characterSets = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
}

const ambiguousChars = '0Oo1lI'

const strength = computed(() => getPasswordStrengthBar(generatedPassword.value))

function generate() {
  let charset = ''
  if (options.uppercase) charset += characterSets.uppercase
  if (options.lowercase) charset += characterSets.lowercase
  if (options.numbers) charset += characterSets.numbers
  if (options.symbols) charset += characterSets.symbols

  if (options.excludeAmbiguous) {
    charset = charset.split('').filter(c => !ambiguousChars.includes(c)).join('')
  }

  if (!charset) {
    generatedPassword.value = ''
    return
  }

  let password = ''
  const array = new Uint32Array(length.value)
  window.crypto.getRandomValues(array)
  for (let i = 0; i < length.value; i++) {
    password += charset[array[i] % charset.length]
  }

  generatedPassword.value = password
  emit('generate', password)
}

function copyPassword() {
  navigator.clipboard.writeText(generatedPassword.value)
}

function fillPassword() {
  emit('generate', generatedPassword.value)
}
</script>

<style scoped>
.password-generator {
  font-size: 14px;
}
.gen-header h4 {
  margin: 0 0 16px;
  font-size: 15px;
  color: var(--text-primary, #374151);
}
.gen-options {
  margin-bottom: 16px;
}
.length-control {
  margin-bottom: 12px;
}
.length-control label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}
.length-control input[type="range"] {
  width: 100%;
  accent-color: var(--primary, #6366f1);
}
.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.checkbox-label input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary, #6366f1);
}
.gen-preview {
  background: var(--bg-secondary, #f9fafb);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.preview-text {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 14px;
  word-break: break-all;
  margin-bottom: 12px;
  color: var(--text-primary, #374151);
  min-height: 20px;
}
.preview-actions {
  display: flex;
  gap: 8px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
}
.btn svg {
  width: 14px;
  height: 14px;
}
.btn-primary {
  background: var(--primary, #6366f1);
  color: #fff;
}
.btn-primary:hover {
  opacity: 0.9;
}
.btn-secondary {
  background: var(--bg-tertiary, #e5e7eb);
  color: var(--text-primary, #374151);
}
.btn-secondary:hover {
  background: #d1d5db;
}
.gen-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.strength-bar {
  width: 80px;
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
</style>
