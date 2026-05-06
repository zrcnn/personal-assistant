<template>
  <div class="json-page">
    <div class="page-header">
      <button class="back-btn" @click="$router.push('/tools')">← 工具箱</button>
      <h2>🔧 JSON 工具</h2>
    </div>

    <div class="json-layout">
      <div class="json-input-section">
        <div class="section-header">
          <span>输入</span>
          <div class="action-btns">
            <button @click="formatJson">格式化</button>
            <button @click="minifyJson">压缩</button>
            <button @click="sortKeys">排序键</button>
            <button @click="clearAll">清空</button>
          </div>
        </div>
        <textarea v-model="inputJson" placeholder='粘贴 JSON 到这里...' rows="18" spellcheck="false" @input="validateJson"></textarea>
        <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
        <div v-else-if="inputJson.trim()" class="success-msg">JSON 格式正确</div>
      </div>

      <div class="json-output-section">
        <div class="section-header">
          <span>输出</span>
          <button @click="copyOutput">复制</button>
        </div>
        <pre class="json-output">{{ outputJson }}</pre>
      </div>
    </div>

    <div class="quick-tools">
      <h3>快捷工具</h3>
      <div class="quick-grid">
        <div class="quick-card" @click="escapeJson">
          <span class="quick-icon">↩️</span>
          <span>转义字符串</span>
        </div>
        <div class="quick-card" @click="unescapeJson">
          <span class="quick-icon">↪️</span>
          <span>反转义字符串</span>
        </div>
        <div class="quick-card" @click="jsonToQuery">
          <span class="quick-icon">🔗</span>
          <span>JSON → Query</span>
        </div>
        <div class="quick-card" @click="queryToJson">
          <span class="quick-icon">📄</span>
          <span>Query → JSON</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const inputJson = ref('')
const outputJson = ref('')
const errorMsg = ref('')

function parseInput() {
  try {
    const obj = JSON.parse(inputJson.value)
    errorMsg.value = ''
    return obj
  } catch (e) {
    errorMsg.value = e.message
    return null
  }
}

function formatJson() {
  const obj = parseInput()
  if (obj !== null) {
    outputJson.value = JSON.stringify(obj, null, 2)
    inputJson.value = outputJson.value
  }
}

function minifyJson() {
  const obj = parseInput()
  if (obj !== null) {
    outputJson.value = JSON.stringify(obj)
    inputJson.value = outputJson.value
  }
}

function sortKeys() {
  const obj = parseInput()
  if (obj !== null) {
    const sorted = sortObjectKeys(obj)
    outputJson.value = JSON.stringify(sorted, null, 2)
    inputJson.value = outputJson.value
  }
}

function sortObjectKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys)
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((result, key) => {
      result[key] = sortObjectKeys(obj[key])
      return result
    }, {})
  }
  return obj
}

function validateJson() {
  if (inputJson.value.trim()) parseInput()
  else { errorMsg.value = ''; outputJson.value = '' }
}

function clearAll() {
  inputJson.value = ''
  outputJson.value = ''
  errorMsg.value = ''
}

function escapeJson() {
  outputJson.value = JSON.stringify(inputJson.value)
}

function unescapeJson() {
  try {
    outputJson.value = JSON.parse(inputJson.value)
  } catch {
    errorMsg.value = '无效的转义字符串'
  }
}

function jsonToQuery() {
  const obj = parseInput()
  if (obj !== null) {
    outputJson.value = new URLSearchParams(obj).toString()
  }
}

function queryToJson() {
  try {
    const params = new URLSearchParams(inputJson.value)
    const obj = {}
    params.forEach((v, k) => { obj[k] = v })
    outputJson.value = JSON.stringify(obj, null, 2)
    errorMsg.value = ''
  } catch {
    errorMsg.value = '无效的 Query String'
  }
}

function copyOutput() {
  if (!outputJson.value) return
  navigator.clipboard.writeText(outputJson.value).then(() => {
    const btn = document.querySelector('.json-output-section button')
    const orig = btn.textContent
    btn.textContent = '已复制!'
    setTimeout(() => btn.textContent = orig, 1500)
  })
}
</script>

<style scoped>
.json-page { max-width: 1000px; margin: 0 auto; padding: 20px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h2 { font-size: 20px; color: var(--text-primary); flex: 1; }
.back-btn {
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition);
}

.back-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.json-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
.json-input-section, .json-output-section { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 14px; color: var(--text-secondary); font-weight: 500; }
.action-btns { display: flex; gap: 6px; }
.action-btns button, .section-header button { padding: 4px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-secondary); cursor: pointer; font-size: 12px; }
.action-btns button:hover, .section-header button:hover { border-color: var(--accent); color: var(--accent); }

textarea { width: 100%; padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); font-family: 'Menlo', 'Consolas', monospace; font-size: 13px; resize: vertical; outline: none; line-height: 1.5; box-sizing: border-box; }
textarea:focus { border-color: var(--accent); }

.json-output { padding: 12px; border-radius: var(--radius-md); background: var(--bg-tertiary); color: var(--text-primary); font-family: 'Menlo', 'Consolas', monospace; font-size: 13px; line-height: 1.5; overflow: auto; max-height: 400px; white-space: pre-wrap; word-break: break-all; margin: 0; }

.error-msg { margin-top: 8px; padding: 6px 10px; background: rgba(255,80,80,0.1); border-radius: var(--radius-sm); color: #ff5050; font-size: 12px; }
.success-msg { margin-top: 8px; padding: 6px 10px; background: rgba(81,207,102,0.1); border-radius: var(--radius-sm); color: #51cf66; font-size: 12px; }

.quick-tools { padding: 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.quick-tools h3 { font-size: 15px; color: var(--text-primary); margin-bottom: 14px; }
.quick-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.quick-card { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s; font-size: 13px; color: var(--text-secondary); }
.quick-card:hover { background: var(--bg-hover); color: var(--accent); }
.quick-icon { font-size: 24px; }

@media (max-width: 768px) {
  .json-page { padding: 12px; }
  .json-layout { grid-template-columns: 1fr; }
  .quick-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
