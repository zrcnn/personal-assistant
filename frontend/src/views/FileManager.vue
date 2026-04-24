<template>
  <div class="file-manager-page">
    <div class="page-header">
      <button class="back-btn" @click="$router.push('/tools')">← 工具箱</button>
      <h2>📁 文件管理</h2>
      <div class="header-actions">
        <div class="search-box">
          <input v-model="searchQuery" @keyup.enter="globalSearch" type="text" placeholder="搜索文件..." />
          <button @click="globalSearch" class="search-btn">🔍</button>
        </div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="breadcrumb">
        <span class="breadcrumb-item clickable" @click="navigateTo('/')">🏠</span>
        <template v-for="(part, idx) in breadcrumb" :key="idx">
          <span class="breadcrumb-sep">/</span>
          <span
            class="breadcrumb-item"
            :class="{ clickable: idx < breadcrumb.length - 1 }"
            @click="idx < breadcrumb.length - 1 && navigateTo(breadcrumbPath[idx])"
          >{{ part }}</span>
        </template>
      </div>

      <div class="toolbar-actions">
        <button class="tool-btn" @click="openMkdirModal" title="新建文件夹">📁 新建</button>
        <label class="tool-btn upload-btn" title="上传文件">
          📤 上传
          <input type="file" multiple @change="handleUpload" style="display: none" />
        </label>
        <button v-if="selectedItems.length > 0" class="tool-btn danger" @click="batchDelete" title="删除选中">
          🗑️ 删除({{ selectedItems.length }})
        </button>
      </div>
    </div>

    <!-- File List -->
    <div class="file-list">
      <!-- Parent nav -->
      <div v-if="currentPath !== '/'" class="file-row parent-row" @click="goParent">
        <span class="file-icon">📂</span>
        <span class="file-name">..</span>
        <span class="file-size"></span>
        <span class="file-modified"></span>
      </div>

      <!-- Folders -->
      <div
        v-for="folder in folders"
        :key="folder.name"
        class="file-row folder-row"
        :class="{ selected: selectedItems.includes(folder.name) }"
        @dblclick="navigateToFolder(folder.name)"
        @click="toggleSelect(folder.name)"
      >
        <span class="file-icon">📁</span>
        <span class="file-name">{{ folder.name }}</span>
        <span class="file-size"></span>
        <span class="file-modified">{{ formatDate(folder.modifiedAt) }}</span>
        <div class="row-actions">
          <button @click.stop="downloadFolder(folder.name)" title="下载">⬇️</button>
          <button @click.stop="renameItem(folder.name)" title="重命名">✏️</button>
          <button @click.stop="deleteItem(folder.name, true)" title="删除">🗑️</button>
        </div>
      </div>

      <!-- Files -->
      <div
        v-for="file in files"
        :key="file.name"
        class="file-row file-entry-row"
        :class="{ selected: selectedItems.includes(file.name) }"
        @click="toggleSelect(file.name)"
      >
        <span class="file-icon">{{ getFileIcon(file.type) }}</span>
        <span class="file-name" @dblclick="downloadFile(file.name)">{{ file.name }}</span>
        <span class="file-size">{{ file.sizeFormatted }}</span>
        <span class="file-modified">{{ formatDate(file.modifiedAt) }}</span>
        <div class="row-actions">
          <button @click.stop="downloadFile(file.name)" title="下载">⬇️</button>
          <button v-if="file.type === 'archive'" @click.stop="unzipItem(file.name)" title="解压">📦</button>
          <button @click.stop="renameItem(file.name)" title="重命名">✏️</button>
          <button @click.stop="deleteItem(file.name, false)" title="删除">🗑️</button>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!loading && folders.length === 0 && files.length === 0" class="empty-state">
        <div class="empty-icon">📁</div>
        <p>此目录为空</p>
        <p class="empty-hint">上传文件或新建文件夹开始使用</p>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="loading-state">加载中...</div>
    </div>

    <!-- Search Results Modal -->
    <div v-if="showSearchResults" class="modal-overlay" @click.self="showSearchResults = false">
      <div class="modal">
        <div class="modal-header">
          <h3>🔍 搜索结果 "{{ searchQuery }}"</h3>
          <button @click="showSearchResults = false" class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div v-if="searchResults.length === 0" class="empty-state">
            <p>未找到匹配的文件</p>
          </div>
          <div v-else class="search-results">
            <div
              v-for="item in searchResults"
              :key="item.name"
              class="search-result-item"
              @click="navigateToAndClose(item)"
            >
              <span class="file-icon">{{ item.isDirectory ? '📁' : getFileIcon(item.type) }}</span>
              <span class="result-name">{{ item.name }}</span>
              <span class="result-path">{{ path.relative('/', item.path || '') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mkdir Modal -->
    <div v-if="showMkdirModal" class="modal-overlay" @click.self="showMkdirModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>📁 新建文件夹</h3>
          <button @click="showMkdirModal = false" class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <input ref="mkdirInput" v-model="mkdirName" type="text" placeholder="文件夹名称" @keyup.enter="createFolder" />
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="showMkdirModal = false">取消</button>
          <button class="btn-primary" @click="createFolder">创建</button>
        </div>
      </div>
    </div>

    <!-- Rename Modal -->
    <div v-if="showRenameModal" class="modal-overlay" @click.self="showRenameModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>✏️ 重命名</h3>
          <button @click="showRenameModal = false" class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <input ref="renameInput" v-model="renameNewName" type="text" placeholder="新名称" @keyup.enter="doRename" />
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="showRenameModal = false">取消</button>
          <button class="btn-primary" @click="doRename">确认</button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast.message" class="toast" :class="toast.type">
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

// State
const loading = ref(false)
const currentPath = ref('/')
const folders = ref([])
const files = ref([])
const selectedItems = ref([])
const searchQuery = ref('')
const searchResults = ref([])
const showSearchResults = ref(false)
const showMkdirModal = ref(false)
const showRenameModal = ref(false)
const mkdirName = ref('')
const renameTarget = ref('')
const renameNewName = ref('')
const mkdirInput = ref(null)
const renameInput = ref(null)
const toast = ref({ message: '', type: 'info' })

// Breadcrumb
const breadcrumb = computed(() => {
  if (currentPath.value === '/') return []
  const parts = currentPath.value.split('/').filter(Boolean)
  return parts
})

const breadcrumbPath = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean)
  const paths = []
  for (let i = 0; i < parts.length; i++) {
    paths.push('/' + parts.slice(0, i + 1).join('/'))
  }
  return paths
})

// API helpers
function apiHeaders() {
  return { 'Authorization': `Bearer ${auth.token}` }
}

async function apiGet(url) {
  const resp = await fetch(url, { headers: apiHeaders() })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: '请求失败' }))
    throw new Error(err.error || '请求失败')
  }
  return resp.json()
}

async function apiPost(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...apiHeaders() },
    body: JSON.stringify(body)
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: '请求失败' }))
    throw new Error(err.error || '请求失败')
  }
  return resp.json()
}

// Load file list
async function loadFiles(dirPath) {
  loading.value = true
  try {
    const data = await apiGet(`/api/file/list?path=${encodeURIComponent(dirPath || '/')}`)
    folders.value = data.folders || []
    files.value = data.files || []
    currentPath.value = data.path || '/'
    selectedItems.value = []
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    loading.value = false
  }
}

function navigateTo(dirPath) {
  loadFiles(dirPath)
}

function navigateToFolder(name) {
  const newPath = currentPath.value === '/' ? `/${name}` : `${currentPath.value}/${name}`
  loadFiles(newPath)
}

function goParent() {
  if (currentPath.value === '/') return
  const parts = currentPath.value.split('/').filter(Boolean)
  parts.pop()
  loadFiles('/' + parts.join('/') || '/')
}

// Upload
async function handleUpload(e) {
  const fileList = e.target.files
  if (!fileList || fileList.length === 0) return

  const formData = new FormData()
  for (const file of fileList) {
    formData.append('files', file)
  }
  formData.append('destPath', currentPath.value)

  try {
    const resp = await fetch('/api/file/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${auth.token}` },
      body: formData
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: '上传失败' }))
      throw new Error(err.error || '上传失败')
    }
    const data = await resp.json()
    showToast(data.message || '上传成功', 'success')
    loadFiles(currentPath.value)
  } catch (err) {
    showToast(err.message, 'error')
  }

  e.target.value = ''
}

// Download
function downloadFile(name) {
  const filePath = currentPath.value === '/' ? `/${name}` : `${currentPath.value}/${name}`
  window.location.href = `/api/file/download?path=${encodeURIComponent(filePath)}&token=${auth.token}`
}

function downloadFolder(name) {
  const folderPath = currentPath.value === '/' ? `/${name}` : `${currentPath.value}/${name}`
  window.location.href = `/api/file/zip?path=${encodeURIComponent(folderPath)}&token=${auth.token}`
}

// Mkdir
function openMkdirModal() {
  mkdirName.value = ''
  showMkdirModal.value = true
  nextTick(() => mkdirInput.value?.focus())
}

async function createFolder() {
  if (!mkdirName.value.trim()) {
    showToast('请输入文件夹名称', 'error')
    return
  }
  try {
    await apiPost('/api/file/mkdir', {
      path: currentPath.value,
      name: mkdirName.value.trim()
    })
    showToast('文件夹创建成功', 'success')
    showMkdirModal.value = false
    loadFiles(currentPath.value)
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// Rename
function renameItem(name) {
  renameTarget.value = name
  renameNewName.value = name
  showRenameModal.value = true
  nextTick(() => renameInput.value?.focus())
}

async function doRename() {
  if (!renameNewName.value.trim() || renameNewName.value === renameTarget.value) {
    showRenameModal.value = false
    return
  }
  try {
    const targetPath = currentPath.value === '/' ? `/${renameTarget.value}` : `${currentPath.value}/${renameTarget.value}`
    await apiPost('/api/file/rename', {
      path: targetPath,
      newName: renameNewName.value.trim()
    })
    showToast('重命名成功', 'success')
    showRenameModal.value = false
    loadFiles(currentPath.value)
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// Delete
async function deleteItem(name, isDir) {
  if (!confirm(`确定删除${isDir ? '文件夹' : '文件'} "${name}"？`)) return
  try {
    const targetPath = currentPath.value === '/' ? `/${name}` : `${currentPath.value}/${name}`
    await apiPost('/api/file/delete', { path: targetPath })
    showToast('删除成功', 'success')
    loadFiles(currentPath.value)
  } catch (err) {
    showToast(err.message, 'error')
  }
}

async function batchDelete() {
  if (!confirm(`确定删除选中的 ${selectedItems.value.length} 项？`)) return
  for (const name of selectedItems.value) {
    const targetPath = currentPath.value === '/' ? `/${name}` : `${currentPath.value}/${name}`
    try {
      await apiPost('/api/file/delete', { path: targetPath })
    } catch (e) { /* continue */ }
  }
  showToast('批量删除完成', 'success')
  loadFiles(currentPath.value)
}

// Unzip
async function unzipItem(name) {
  try {
    const filePath = currentPath.value === '/' ? `/${name}` : `${currentPath.value}/${name}`
    const data = await apiPost('/api/file/unzip', { path: filePath })
    showToast(`解压成功，${data.entries} 个文件`, 'success')
    loadFiles(currentPath.value)
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// Search
async function globalSearch() {
  if (!searchQuery.value.trim()) return
  try {
    const data = await apiGet(`/api/file/search?q=${encodeURIComponent(searchQuery.value)}&path=${encodeURIComponent(currentPath.value)}`)
    searchResults.value = data.results || []
    showSearchResults.value = true
  } catch (err) {
    showToast(err.message, 'error')
  }
}

function navigateToAndClose(item) {
  showSearchResults.value = false
  // Navigate to parent directory
  const parentDir = item.path ? item.path.replace('/' + item.name, '') : '/'
  loadFiles(parentDir || '/')
}

// Selection
function toggleSelect(name) {
  const idx = selectedItems.value.indexOf(name)
  if (idx >= 0) {
    selectedItems.value.splice(idx, 1)
  } else {
    selectedItems.value.push(name)
  }
}

// File icon
function getFileIcon(type) {
  const icons = {
    image: '🖼️',
    document: '📄',
    archive: '📦',
    code: '📝',
    audio: '🎵',
    video: '🎬',
    file: '📄'
  }
  return icons[type] || '📄'
}

// Date format
function formatDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${m}-${day} ${h}:${min}`
}

// Toast
function showToast(message, type = 'info') {
  toast.value = { message, type }
  setTimeout(() => { toast.value = { message: '', type: 'info' } }, 3000)
}

onMounted(() => {
  loadFiles('/')
})
</script>

<style scoped>
.file-manager-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 20px;
  min-height: calc(100vh - 60px);
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.page-header h2 {
  font-size: 20px;
  color: var(--text-primary);
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  flex-shrink: 0;
}

.back-btn:hover {
  color: var(--accent);
}

.header-actions {
  margin-left: auto;
}

.search-box {
  display: flex;
  align-items: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.search-box input {
  background: none;
  border: none;
  color: var(--text-primary);
  padding: 8px 12px;
  font-size: 13px;
  outline: none;
  width: 180px;
}

.search-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  font-size: 14px;
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  flex-wrap: wrap;
}

.breadcrumb-item {
  padding: 2px 6px;
  border-radius: 4px;
  cursor: default;
}

.breadcrumb-item.clickable {
  cursor: pointer;
}

.breadcrumb-item.clickable:hover {
  background: var(--bg-hover);
  color: var(--accent);
}

.breadcrumb-sep {
  color: var(--text-muted);
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.tool-btn {
  padding: 8px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
  transition: all var(--transition);
}

.tool-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.tool-btn.danger {
  border-color: var(--danger);
  color: var(--danger);
}

.tool-btn.danger:hover {
  background: var(--danger);
  color: #fff;
}

.upload-btn {
  cursor: pointer;
}

/* File List */
.file-list {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.file-row {
  display: grid;
  grid-template-columns: 40px 1fr 100px 140px 100px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background var(--transition);
  gap: 8px;
}

.file-row:last-child {
  border-bottom: none;
}

.file-row:hover {
  background: var(--bg-hover);
}

.file-row.selected {
  background: var(--accent-light);
}

.parent-row {
  color: var(--text-muted);
}

.file-icon {
  font-size: 20px;
  text-align: center;
}

.file-name {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 12px;
  color: var(--text-muted);
  text-align: right;
}

.file-modified {
  font-size: 12px;
  color: var(--text-muted);
}

.row-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--transition);
}

.file-row:hover .row-actions {
  opacity: 1;
}

.row-actions button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
  border-radius: 4px;
}

.row-actions button:hover {
  background: var(--bg-tertiary);
}

/* Empty / Loading */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-hint {
  font-size: 12px;
  margin-top: 4px;
}

.loading-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

/* Modals */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 420px;
  box-shadow: 0 20px 60px var(--shadow);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  font-size: 16px;
  color: var(--text-primary);
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 18px;
}

.modal-body {
  padding: 20px;
}

.modal-body input {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.modal-body input:focus {
  border-color: var(--accent);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.btn-cancel {
  padding: 8px 20px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
}

.btn-primary {
  padding: 8px 20px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}

/* Search results */
.search-results {
  max-height: 400px;
  overflow-y: auto;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition);
}

.search-result-item:hover {
  background: var(--bg-hover);
}

.result-name {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-path {
  font-size: 11px;
  color: var(--text-muted);
}

/* Toast */
.toast {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: var(--radius-md);
  color: #fff;
  font-size: 14px;
  z-index: 2000;
  animation: fadeInUp 0.3s ease;
}

.toast.success {
  background: var(--success);
}

.toast.error {
  background: var(--danger);
}

.toast.info {
  background: var(--info);
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* Responsive */
@media (max-width: 768px) {
  .file-manager-page { padding: 12px; }

  .page-header {
    flex-wrap: wrap;
  }

  .header-actions {
    width: 100%;
    margin-left: 0;
    margin-top: 8px;
  }

  .search-box {
    width: 100%;
  }

  .search-box input {
    width: 100%;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-actions {
    justify-content: flex-end;
  }

  .file-row {
    grid-template-columns: 32px 1fr 80px 60px;
    padding: 10px 12px;
  }

  .file-size {
    display: none;
  }

  .row-actions {
    opacity: 1;
  }
}
</style>
