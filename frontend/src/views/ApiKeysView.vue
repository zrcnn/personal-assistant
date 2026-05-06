<template>
  <div class="api-keys-page">
    <div class="page-container">
      <div class="page-header">
        <button class="back-btn" @click="$router.push('/settings')">← 返回</button>
        <h2 class="page-title">🔑 API Key 管理</h2>
      </div>

      <!-- Add / Edit Form -->
      <div class="form-card">
        <h3 class="form-title">{{ editingId ? '编辑 API Key' : '添加 API Key' }}</h3>

        <div class="form-row">
          <!-- Provider Select -->
          <div class="form-group">
            <label class="form-label">提供商</label>
            <select v-model="form.provider" class="form-select" @change="onProviderChange">
              <option value="">选择提供商</option>
              <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>

          <!-- Model Select -->
          <div class="form-group">
            <label class="form-label">模型</label>
            <select v-model="form.model" class="form-select" :disabled="!form.provider">
              <option value="">选择模型</option>
              <option v-if="form.provider === 'custom'" value="__custom__">自定义模型</option>
              <option v-for="m in currentModels" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
        </div>

        <!-- Custom model name -->
        <div v-if="form.provider === 'custom'" class="form-group">
          <label class="form-label">自定义模型名</label>
          <input v-model="form.customModel" class="form-input" placeholder="输入自定义模型名称" />
          <div v-if="editingId && existingModelName && form.model !== '__custom__'" class="form-hint">
            当前模型: {{ existingModelName }}
          </div>
        </div>

        <!-- API Key -->
        <div class="form-group">
          <label class="form-label">API Key <span class="optional">({{ editingId ? '留空则保持不变' : '必填' }})</span></label>
          <div class="input-with-toggle">
            <input
              v-model="form.apiKey"
              :type="showKey ? 'text' : 'password'"
              class="form-input"
              :placeholder="editingId ? '留空则保持原 Key 不变' : 'sk-...'"
              autocomplete="off"
            />
            <button class="toggle-btn" @click="showKey = !showKey" type="button">
              {{ showKey ? '🙈' : '👁️' }}
            </button>
          </div>
          <div v-if="editingId && existingKeyMasked" class="form-hint">
            当前 Key: {{ existingKeyMasked }}
          </div>
        </div>

        <!-- Base URL -->
        <div class="form-group">
          <label class="form-label">API Base URL <span class="optional">(可选)</span></label>
          <input
            v-model="form.baseUrl"
            type="text"
            class="form-input"
            :placeholder="form.provider ? defaultBaseUrl : 'https://...'"
          />
        </div>

        <!-- Enabled Switch -->
        <div class="form-group switch-group">
          <label class="form-label">启用状态</label>
          <label class="switch">
            <input type="checkbox" v-model="form.enabled" />
            <span class="slider"></span>
          </label>
          <span class="switch-label">{{ form.enabled ? '已启用' : '已禁用' }}</span>
        </div>

        <div v-if="formMsg" class="form-msg" :class="formMsgType">{{ formMsg }}</div>

        <div class="form-actions">
          <button v-if="editingId" class="cancel-btn" @click="cancelEdit">取消</button>
          <button class="submit-btn" @click="submitForm" :disabled="submitting">
            {{ submitting ? '保存中...' : (editingId ? '保存修改' : '添加') }}
          </button>
        </div>
      </div>

      <!-- Keys List -->
      <div class="keys-list">
        <h3 class="list-title">已保存的 Key ({{ keys.length }})</h3>

        <div v-if="keys.length === 0" class="empty-state">
          <p>暂无保存的 API Key</p>
        </div>

        <div v-for="key in keys" :key="key.id" class="key-card">
          <div class="key-header">
            <div class="key-info">
              <span class="key-provider">{{ key.provider_name || key.provider }}</span>
              <span class="key-model">{{ key.model_name }}</span>
              <span class="key-status" :class="key.is_active ? 'active' : 'inactive'">
                {{ key.is_active ? '● 启用' : '○ 禁用' }}
              </span>
            </div>
            <div class="key-actions">
              <button class="action-btn edit" @click="editKey(key)" title="编辑">✏️</button>
              <button class="action-btn delete" @click="confirmDelete(key)" title="删除">🗑️</button>
            </div>
          </div>
          <div class="key-body">
            <div class="key-row">
              <span class="key-label">API Key</span>
              <span class="key-value masked">{{ maskKey(key.api_key) }}</span>
            </div>
            <div v-if="key.api_base" class="key-row">
              <span class="key-label">Base URL</span>
              <span class="key-value url">{{ key.api_base }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Confirm Modal -->
    <transition name="fade">
      <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null">
        <div class="modal">
          <h3>⚠️ 确认删除</h3>
          <p class="modal-text">确定要删除这个 API Key 吗？此操作不可撤销。</p>
          <div class="modal-actions">
            <button class="modal-btn cancel" @click="deleteTarget = null">取消</button>
            <button class="modal-btn danger" @click="doDelete">确认删除</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { userApiKeysAPI } from '../api/modules'

const providers = [
  { id: 'zhipu', name: '智谱 GLM', models: ['glm-4-plus', 'glm-4-flash', 'glm-4v-plus', 'glm-5-turbo'], defaultBase: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'minimax', name: 'MiniMax', models: ['MiniMax-M2.7', 'MiniMax-M2.7-HS', 'MiniMax-Text-01'], defaultBase: 'https://api.minimax.chat/v1' },
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'], defaultBase: 'https://api.openai.com/v1' },
  { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'], defaultBase: 'https://api.deepseek.com/v1' },
  { id: 'qwen', name: '通义千问', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'], defaultBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'anthropic', name: 'Claude', models: ['claude-sonnet-4-20250514', 'claude-3.5-sonnet', 'claude-3-haiku'], defaultBase: 'https://api.anthropic.com' },
  { id: 'google', name: 'Gemini', models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'], defaultBase: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'custom', name: '自定义', models: [], defaultBase: '' }
]

const keys = ref([])
const editingId = ref(null)
const submitting = ref(false)
const showKey = ref(false)
const formMsg = ref('')
const formMsgType = ref('')
const deleteTarget = ref(null)

const form = ref({
  provider: '',
  model: '',
  customModel: '',
  apiKey: '',
  baseUrl: '',
  enabled: true
})

const existingKeyMasked = ref('')
const existingModelName = ref('')

const defaultBaseUrl = computed(() => {
  const p = providers.find(p => p.id === form.value.provider)
  return p ? p.defaultBase : ''
})

const currentModels = computed(() => {
  const p = providers.find(p => p.id === form.value.provider)
  return p ? p.models : []
})

function onProviderChange() {
  form.value.model = ''
  form.value.customModel = ''
  const p = providers.find(p => p.id === form.value.provider)
  form.value.baseUrl = p ? p.defaultBase : ''
}

function maskKey(key) {
  if (!key) return '***'
  if (key.length <= 8) return '****'
  return key.slice(0, 6) + '****' + key.slice(-4)
}

async function loadKeys() {
  try {
    const res = await userApiKeysAPI.list()
    keys.value = res.data || []
  } catch (err) {
    console.error('Failed to load keys:', err)
  }
}

function editKey(key) {
  editingId.value = key.id
  form.value.provider = key.provider || ''
  // Handle model selection: if it's a known model in the list, select it; otherwise mark as custom
  const providerModels = providers.find(p => p.id === key.provider)?.models || []
  if (providerModels.includes(key.model_name)) {
    form.value.model = key.model_name
    form.value.customModel = ''
  } else if (key.provider === 'custom' || !providerModels.length) {
    form.value.model = '__custom__'
    form.value.customModel = key.model_name || ''
  } else {
    form.value.model = key.model_name || ''
    form.value.customModel = ''
  }
  existingModelName.value = key.model_name || ''
  form.value.apiKey = '' // 留空表示不修改
  form.value.baseUrl = key.api_base || ''
  form.value.enabled = key.is_active !== false
  existingKeyMasked.value = key.api_key || '****'
  showKey.value = false
  formMsg.value = ''
}

function cancelEdit() {
  editingId.value = null
  existingKeyMasked.value = ''
  existingModelName.value = ''
  resetForm()
}

function resetForm() {
  form.value = { provider: '', model: '', customModel: '', apiKey: '', baseUrl: '', enabled: true }
  existingKeyMasked.value = ''
  existingModelName.value = ''
  showKey.value = false
  formMsg.value = ''
  formMsgType.value = ''
}

async function submitForm() {
  formMsg.value = ''
  formMsgType.value = ''

  if (!form.value.provider) {
    formMsg.value = '请选择提供商'
    formMsgType.value = 'error'
    return
  }

  let modelName = form.value.model
  if (form.value.model === '__custom__') {
    if (!form.value.customModel.trim()) {
      formMsg.value = '请输入自定义模型名'
      formMsgType.value = 'error'
      return
    }
    modelName = form.value.customModel.trim()
  }

  if (!modelName) {
    formMsg.value = '请选择或输入模型'
    formMsgType.value = 'error'
    return
  }

  // 新增时必填，编辑时可选（留空则保持原 Key）
  if (!editingId.value && !form.value.apiKey.trim()) {
    formMsg.value = '请输入 API Key'
    formMsgType.value = 'error'
    return
  }

  submitting.value = true
  const payload = {
    provider: form.value.provider,
    model_name: modelName,
    api_key: form.value.apiKey.trim(),
    api_base: form.value.baseUrl.trim(),
    is_active: form.value.enabled
  }

  try {
    if (editingId.value) {
      await userApiKeysAPI.update(editingId.value, payload)
      formMsg.value = '修改成功'
      formMsgType.value = 'success'
    } else {
      await userApiKeysAPI.create(payload)
      formMsg.value = '添加成功'
      formMsgType.value = 'success'
    }
    await loadKeys()
    setTimeout(() => {
      cancelEdit()
    }, 1000)
  } catch (err) {
    formMsg.value = err.response?.data?.error || '操作失败'
    formMsgType.value = 'error'
  } finally {
    submitting.value = false
  }
}

function confirmDelete(key) {
  deleteTarget.value = key
}

async function doDelete() {
  if (!deleteTarget.value) return
  try {
    await userApiKeysAPI.remove(deleteTarget.value.id)
    await loadKeys()
  } catch (err) {
    console.error('Delete failed:', err)
  } finally {
    deleteTarget.value = null
  }
}

onMounted(loadKeys)
</script>

<style scoped>
.api-keys-page {
  max-width: 700px;
  margin: 0 auto;
  padding: 40px 20px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}

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

.page-title {
  font-size: 28px;
  color: var(--text-primary);
}

/* Form Card */
.form-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 24px;
  margin-bottom: 32px;
}

.form-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 20px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.optional {
  font-weight: 400;
  color: var(--text-muted);
}

.form-input,
.form-select {
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

.form-input:focus,
.form-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.form-input::placeholder {
  color: var(--text-muted);
}

/* Input with toggle */
.input-with-toggle {
  position: relative;
  display: flex;
  align-items: center;
}

.input-with-toggle .form-input {
  padding-right: 44px;
}

.toggle-btn {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 16px;
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Switch */
.switch-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.switch {
  position: relative;
  width: 44px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--border);
  border-radius: 24px;
  transition: var(--transition);
}

.slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: var(--transition);
}

.switch input:checked + .slider {
  background: var(--accent);
}

.switch input:checked + .slider::before {
  transform: translateX(20px);
}

.switch-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.form-msg {
  font-size: 13px;
  margin-bottom: 8px;
  padding: 6px 0;
}

.form-msg.success { color: #2ecc71; }
.form-msg.error { color: var(--danger); }

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.submit-btn {
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

.submit-btn:hover { opacity: 0.9; }
.submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.cancel-btn {
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: 14px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all var(--transition);
}

/* Keys List */
.list-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 16px;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.key-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 12px;
  overflow: hidden;
}

.key-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

.key-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.key-provider {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.key-model {
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-hover);
  padding: 2px 8px;
  border-radius: 4px;
}

.key-status {
  font-size: 12px;
  font-weight: 500;
}

.key-status.active { color: #2ecc71; }
.key-status.inactive { color: var(--text-muted); }

.key-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-hover);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all var(--transition);
}

.action-btn:hover { border-color: var(--accent); }

.key-body {
  padding: 12px 16px;
}

.key-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.key-row:last-child { margin-bottom: 0; }

.key-label {
  font-size: 12px;
  color: var(--text-muted);
  width: 60px;
  flex-shrink: 0;
}

.key-value {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: monospace;
}

.key-value.masked {
  color: var(--text-muted);
  letter-spacing: 1px;
}

.key-value.url {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
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
  border-radius: var(--radius-md);
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
  border: none;
  cursor: pointer;
  transition: all var(--transition);
}

.modal-btn.cancel {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.modal-btn.danger {
  background: var(--danger);
  color: #ffffff;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 480px) {
  .api-keys-page { padding: 20px 12px; }
  .form-row { grid-template-columns: 1fr; }
  .key-info { flex-wrap: wrap; }
  .key-value.url { max-width: 200px; }
}
</style>
