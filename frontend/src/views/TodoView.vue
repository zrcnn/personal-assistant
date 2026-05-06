<template>
  <div class="todo-page">
    <!-- Header with count and add button -->
    <div class="page-header">
      <button class="cal-nav-btn" @click="$router.push('/tools/calendar')" title="打开日历">
        📅 日历
      </button>
      <h2 class="page-title">
        📋 任务待办
        <span class="header-count">{{ personalTodos.filter(t => t.status === 'pending' || t.status === 'in_progress').length }}</span>
      </h2>
      <button class="add-btn" @click="showAddForm = !showAddForm" title="新增待办">
        <span class="add-icon">+</span>
      </button>
    </div>

    <!-- Add Form -->
    <transition name="slide">
      <div v-if="showAddForm" class="add-form">
        <input 
          v-model="newTodo.title" 
          class="form-input title-input" 
          placeholder="任务标题 *"
          @keyup.enter="addTodo" 
        />
        <textarea 
          v-model="newTodo.description" 
          class="form-input desc-input"
          placeholder="任务描述（可选）" 
          rows="2"
        ></textarea>
        <textarea 
          v-model="newTodo.solution" 
          class="form-input desc-input"
          placeholder="解决方式（可选）" 
          rows="2"
        ></textarea>

        <!-- Priority Selector -->
        <div class="edit-row">
          <label class="edit-label">优先级</label>
          <div class="priority-selector">
            <button 
              v-for="(priority, key) in priorityMap" 
              :key="key"
              class="priority-btn"
              :class="{ active: newTodo.priority === Number(key) }"
              :style="newTodo.priority === Number(key) ? { 
                borderColor: priority.color, 
                background: priority.color + '18', 
                color: priority.color 
              } : {}"
              @click="newTodo.priority = Number(key)"
            >
              {{ priority.emoji }} {{ priority.label }}
            </button>
          </div>
        </div>

        <!-- Image Upload -->
        <div class="image-upload-section">
          <label class="edit-label">图片</label>
          <div class="image-upload-area">
            <div 
              v-for="(file, idx) in newTodoFiles" 
              :key="idx" 
              class="image-preview-item"
            >
              <img :src="newTodoPreviews[idx]" class="image-preview-thumb" />
              <button class="image-remove-btn" @click="removeNewTodoFile(idx)">✕</button>
            </div>
            <label class="image-add-btn">
              📷 添加图片
              <input 
                type="file" 
                accept="image/jpeg,image/png,image/gif,image/webp" 
                multiple
                @change="onNewTodoFileSelect" 
                class="hidden-input" 
              />
            </label>
          </div>
        </div>

        <!-- Form Actions -->
        <div class="form-actions">
          <button 
            class="btn btn-primary" 
            @click="addTodo" 
            :disabled="!newTodo.title.trim()"
          >
            添加
          </button>
          <button 
            class="btn btn-cancel" 
            @click="showAddForm = false; resetNewTodo()"
          >
            取消
          </button>
        </div>
      </div>
    </transition>

    <!-- Status Tabs -->
    <div class="sub-tabs">
      <button 
        class="sub-tab" 
        :class="{ active: personalSubTab === 'pending' }" 
        @click="personalSubTab = 'pending'"
      >
        待处理 
        <span class="sub-tab-count">
          {{ personalTodos.filter(t => t.status === 'pending').length }}
        </span>
      </button>
      <button 
        class="sub-tab" 
        :class="{ active: personalSubTab === 'in_progress' }" 
        @click="personalSubTab = 'in_progress'"
      >
        进行中 
        <span class="sub-tab-count">
          {{ personalTodos.filter(t => t.status === 'in_progress').length }}
        </span>
      </button>
      <button 
        class="sub-tab" 
        :class="{ active: personalSubTab === 'completed' }" 
        @click="personalSubTab = 'completed'"
      >
        近期完成 
        <span class="sub-tab-count">
          {{ personalTodos.filter(t => t.status === 'completed' && isWithinDays(t.updated_at, 3)).length }}
        </span>
      </button>
      <button 
        class="sub-tab" 
        :class="{ active: personalSubTab === 'history' }" 
        @click="personalSubTab = 'history'"
      >
        历史记录 
        <span class="sub-tab-count">
          {{ personalTodos.filter(t => t.status === 'completed' && !isWithinDays(t.updated_at, 3)).length }}
        </span>
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading">加载中...</div>

    <!-- Empty State -->
    <div v-else-if="personalFilteredTodos.length === 0" class="empty-state">
      <span class="empty-icon">📝</span>
      <p>暂无个人待办任务</p>
    </div>

    <!-- Todo List -->
    <div v-else class="todo-list">
      <div 
        v-for="todo in personalFilteredTodos" 
        :key="todo.id"
        class="todo-card" 
        :class="[`status-${todo.status}`, `priority-${todo.priority ?? 2}`]"
        @click="toggleExpand(todo.id)"
      >
        <!-- Card Header -->
        <div class="card-header">
          <div class="card-header-left">
            <span 
              class="priority-badge"
              :style="{ 
                background: priorityMap[todo.priority ?? 2].color + '18', 
                color: priorityMap[todo.priority ?? 2].color 
              }"
            >
              {{ priorityMap[todo.priority ?? 2].emoji }} {{ priorityMap[todo.priority ?? 2].label }}
            </span>
            <span class="status-badge" :class="`badge-${todo.status}`">
              {{ statusMap[todo.status].label }}
            </span>
          </div>
          <span class="card-time">{{ formatDate(todo.created_at) }}</span>
        </div>

        <!-- Card Body -->
        <div class="card-body">
          <h4 class="card-title">{{ todo.title }}</h4>
          <p v-if="todo.description" class="card-desc">{{ todo.description }}</p>
          <p v-if="todo.solution" class="card-solution">
            <span class="solution-label">💡 解决方式：</span>{{ todo.solution }}
          </p>
          <div class="progress-section">
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                :class="`progress-${todo.status}`"
                :style="{ width: todo.progress + '%' }"
              ></div>
            </div>
            <span class="progress-text">{{ todo.progress }}%</span>
          </div>
        </div>

        <!-- Image Thumbnails -->
        <div v-if="todoImages[todo.id] && todoImages[todo.id].length" class="card-images" @click.stop>
          <img 
            v-for="img in todoImages[todo.id].slice(0, 3)" 
            :key="img.id"
            :src="img.url" 
            class="card-thumb" 
            @click="openImageViewer(todo.id)" 
          />
          <span 
            v-if="todoImages[todo.id].length > 3"
            class="card-thumb-more" 
            @click="openImageViewer(todo.id)"
          >
            +{{ todoImages[todo.id].length - 3 }}
          </span>
        </div>

        <!-- Card Actions -->
        <div class="card-actions" @click.stop>
          <button 
            v-if="todo.status === 'pending'" 
            class="action-btn start"
            @click="updateStatus(todo, 'in_progress')" 
            title="开始执行"
          >
            ▶
          </button>
          <button 
            v-if="todo.status === 'in_progress'" 
            class="action-btn done"
            @click="updateStatus(todo, 'completed')" 
            title="完成"
          >
            ✓
          </button>
          <button 
            v-if="todo.status !== 'completed' && todo.status !== 'in_progress'" 
            class="action-btn done"
            @click="updateStatus(todo, 'completed')" 
            title="完成"
          >
            ✓
          </button>
          <button 
            v-if="todo.status === 'completed'" 
            class="action-btn reopen"
            @click="updateStatus(todo, 'pending')" 
            title="重新打开"
          >
            ↺
          </button>
          <button class="action-btn edit" @click="startEdit(todo)" title="编辑">✎</button>
          <button class="action-btn delete" @click="deleteTodo(todo.id)" title="删除">✕</button>
        </div>

        <!-- Edit Form -->
        <transition name="slide">
          <div v-if="expandedId === todo.id && isEditing" class="edit-form" @click.stop>
            <input 
              v-model="editForm.title" 
              class="form-input title-input" 
              placeholder="任务标题" 
            />
            <textarea 
              v-model="editForm.description" 
              class="form-input desc-input" 
              placeholder="任务描述" 
              :rows="editForm.descRows || 2"
            ></textarea>
            <textarea 
              v-model="editForm.solution" 
              class="form-input desc-input" 
              placeholder="解决方式" 
              :rows="editForm.solutionRows || 2"
            ></textarea>

            <!-- Priority in Edit -->
            <div class="edit-row">
              <label class="edit-label">优先级</label>
              <div class="priority-selector">
                <button 
                  v-for="(priority, key) in priorityMap" 
                  :key="key"
                  class="priority-btn"
                  :class="{ active: editForm.priority === Number(key) }"
                  :style="editForm.priority === Number(key) ? { 
                    borderColor: priority.color, 
                    background: priority.color + '18', 
                    color: priority.color 
                  } : {}"
                  @click="editForm.priority = Number(key)"
                >
                  {{ priority.emoji }} {{ priority.label }}
                </button>
              </div>
            </div>

            <!-- Status in Edit -->
            <div class="edit-row">
              <label class="edit-label">状态</label>
              <select v-model="editForm.status" class="form-select">
                <option value="pending">待处理</option>
                <option value="in_progress">进行中</option>
                <option value="completed">已完成</option>
              </select>
            </div>

            <!-- Progress in Edit -->
            <div class="edit-row">
              <label class="edit-label">进度 {{ editForm.progress }}%</label>
              <input 
                type="range" 
                v-model.number="editForm.progress" 
                min="0" 
                max="100" 
                class="range-input" 
              />
            </div>

            <!-- Images in Edit -->
            <div class="image-upload-section">
              <label class="edit-label">图片</label>
              <div class="image-upload-area">
                <div 
                  v-for="img in todoImages[editForm._todoId] || []" 
                  :key="img.id" 
                  class="image-preview-item"
                >
                  <img :src="img.url" class="image-preview-thumb" />
                  <button 
                    class="image-remove-btn" 
                    @click="deleteImage(editForm._todoId, img.id)"
                  >
                    ✕
                  </button>
                </div>
                <div 
                  v-for="(file, idx) in editNewFiles" 
                  :key="'new-'+idx" 
                  class="image-preview-item"
                >
                  <img :src="editNewPreviews[idx]" class="image-preview-thumb" />
                  <button class="image-remove-btn" @click="removeEditFile(idx)">✕</button>
                </div>
                <label class="image-add-btn">
                  📷 添加图片
                  <input 
                    type="file" 
                    accept="image/jpeg,image/png,image/gif,image/webp" 
                    multiple
                    @change="onEditFileSelect" 
                    class="hidden-input" 
                  />
                </label>
              </div>
            </div>

            <!-- Edit Actions -->
            <div class="form-actions">
              <button class="btn btn-primary" @click="saveEdit(todo)">保存</button>
              <button class="btn btn-cancel" @click="cancelEdit">取消</button>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- Image Viewer Modal -->
    <div v-if="imageViewer.show" class="image-viewer-overlay" @click.self="closeImageViewer">
      <div class="image-viewer-modal">
        <div class="image-viewer-header">
          <h3>🖼️ 图片 ({{ imageViewer.images.length }})</h3>
          <div class="image-viewer-actions">
            <button v-if="!imageViewer.editing" class="btn btn-cancel" @click="imageViewer.editing = true">编辑</button>
            <template v-else>
              <button class="btn btn-primary" @click="saveViewerChanges">完成</button>
              <button class="btn btn-cancel" @click="cancelViewerEdit">取消</button>
            </template>
            <button class="image-viewer-close" @click="closeImageViewer">✕</button>
          </div>
        </div>
        <div class="image-viewer-grid">
          <div v-for="img in imageViewer.images" :key="img.id" class="image-viewer-item">
            <img :src="img.url" class="image-viewer-img" @click="openFullImage(img.url)" />
            <button 
              v-if="imageViewer.editing" 
              class="image-delete-overlay" 
              @click="viewerDeleteImage(img.id)"
            >
              🗑️ 删除
            </button>
          </div>
          <div v-for="(file, idx) in imageViewer.newFiles" :key="'vnew-'+idx" class="image-viewer-item">
            <img :src="imageViewer.newPreviews[idx]" class="image-viewer-img" />
            <button class="image-delete-overlay" @click="viewerRemoveNew(idx)">🗑️ 删除</button>
          </div>
          <label v-if="imageViewer.editing" class="image-viewer-add">
            <span>➕ 添加</span>
            <input 
              type="file" 
              accept="image/jpeg,image/png,image/gif,image/webp" 
              multiple
              @change="onViewerFileSelect" 
              class="hidden-input" 
            />
          </label>
        </div>
      </div>
    </div>

    <!-- Full Image Modal -->
    <div v-if="fullImage.show" class="full-image-overlay" @click="fullImage.show = false">
      <img :src="fullImage.url" class="full-image-img" />
      <button class="full-image-close" @click="fullImage.show = false">✕</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, reactive, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

// State
const todos = ref([])
const loading = ref(true)
const personalSubTab = ref('pending')
const showAddForm = ref(false)
const expandedId = ref(null)
const isEditing = ref(false)
const syncing = ref(false)

// New Todo Form
const newTodo = ref({ title: '', description: '', solution: '', priority: 2 })
const editForm = ref({ 
  title: '', 
  description: '', 
  solution: '', 
  status: 'pending', 
  progress: 0, 
  priority: 2, 
  _todoId: null,
  descRows: 2,
  solutionRows: 2
})
const editingId = ref(null)

// Image State
const todoImages = ref({})
const newTodoFiles = ref([])
const newTodoPreviews = ref([])
const editNewFiles = ref([])
const editNewPreviews = ref([])

// Image Viewer
const imageViewer = reactive({
  show: false,
  todoId: null,
  images: [],
  editing: false,
  newFiles: [],
  newPreviews: [],
  deletedIds: []
})

// Full Image Viewer
const fullImage = reactive({ show: false, url: '' })

// Status and Priority Maps
const statusMap = {
  pending: { label: '待处理', color: '#f39c12' },
  in_progress: { label: '进行中', color: '#3498db' },
  completed: { label: '已完成', color: '#2ecc71' }
}

const priorityMap = {
  0: { label: '紧急', emoji: '🔴', color: '#FF4757' },
  1: { label: '高', emoji: '🟠', color: '#FF6B35' },
  2: { label: '中', emoji: '🔵', color: '#3742FA' },
  3: { label: '低', emoji: '⚪', color: '#999' }
}

// Computed
const personalTodos = computed(() =>
  todos.value.filter(t => t.source === 'manual' || t.source === null)
)

const personalFilteredTodos = computed(() => {
  if (personalSubTab.value === 'all') return personalTodos.value
  if (personalSubTab.value === 'history') {
    // History: completed more than 3 days ago
    return personalTodos.value.filter(t => t.status === 'completed' && !isWithinDays(t.updated_at, 3))
  }
  if (personalSubTab.value === 'completed') {
    // Recent completed: completed within last 3 days
    return personalTodos.value.filter(t => t.status === 'completed' && isWithinDays(t.updated_at, 3))
  }
  return personalTodos.value.filter(t => t.status === personalSubTab.value)
})

function isWithinDays(dateStr, days) {
  if (!dateStr) return false
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays <= days
}

// API Helpers
async function api(url, options = {}) {
  const token = authStore.token || localStorage.getItem('token')
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(url, { headers, ...options })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }))
    throw new Error(err.error || '请求失败')
  }
  return res.json()
}

// Fetch Data
async function fetchTodos() {
  try {
    loading.value = true
    const [ne, personal] = await Promise.all([
      api('/api/todos?source=ne'),
      api('/api/todos?source=personal')
    ])
    const newTodos = [...ne, ...personal]
    if (editingId.value) {
      const editingTodo = newTodos.find(t => t.id === editingId.value)
      if (editingTodo) {
        editForm.value.title = editingTodo.title
        editForm.value.description = editingTodo.description || ''
        editForm.value.solution = editingTodo.solution || ''
        editForm.value.status = editingTodo.status
        editForm.value.progress = editingTodo.progress
        editForm.value.priority = editingTodo.priority ?? 2
      }
    }
    todos.value = newTodos
    fetchAllImages()
  } catch (err) {
    console.error('Failed to fetch todos:', err)
  } finally {
    loading.value = false
  }
}

async function fetchAllImages() {
  const ids = todos.value.map(t => t.id)
  const current = { ...todoImages.value }
  for (const id of ids) {
    try {
      const imgs = await api(`/api/todos/${id}/images`)
      current[id] = imgs
    } catch {
      if (!current[id]) current[id] = []
    }
  }
  todoImages.value = current
}

async function fetchTodoImages(todoId) {
  try {
    const imgs = await api(`/api/todos/${todoId}/images`)
    todoImages.value = { ...todoImages.value, [todoId]: imgs }
  } catch {}
}

// New Todo File Handling
function onNewTodoFileSelect(e) {
  const files = Array.from(e.target.files)
  files.forEach(f => {
    if (f.size > 10 * 1024 * 1024) return
    newTodoFiles.value.push(f)
    const reader = new FileReader()
    reader.onload = ev => newTodoPreviews.value.push(ev.target.result)
    reader.readAsDataURL(f)
  })
  e.target.value = ''
}

function removeNewTodoFile(idx) {
  newTodoFiles.value.splice(idx, 1)
  newTodoPreviews.value.splice(idx, 1)
}

function resetNewTodo() {
  newTodo.value = { title: '', description: '', solution: '', priority: 2 }
  newTodoFiles.value = []
  newTodoPreviews.value = []
}

// Add Todo
async function addTodo() {
  if (!newTodo.value.title.trim()) return
  try {
    const created = await api('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ ...newTodo.value, source: 'manual' })
    })
    todos.value.unshift(created)
    if (newTodoFiles.value.length > 0) {
      await uploadImages(created.id, newTodoFiles.value)
      await fetchTodoImages(created.id)
    }
    resetNewTodo()
    showAddForm.value = false
  } catch (err) {
    console.error('Failed to add todo:', err)
  }
}

// Upload Images
async function uploadImages(todoId, files) {
  if (!files.length) return
  const fd = new FormData()
  files.forEach(f => fd.append('images', f))
  await api(`/api/todos/${todoId}/images`, { method: 'POST', body: fd })
}

// Delete Image
async function deleteImage(todoId, imageId) {
  try {
    await api(`/api/todos/${todoId}/images/${imageId}`, { method: 'DELETE' })
    await fetchTodoImages(todoId)
  } catch (err) {
    console.error('Failed to delete image:', err)
  }
}

// Edit Form File Handling
function onEditFileSelect(e) {
  const files = Array.from(e.target.files)
  files.forEach(f => {
    if (f.size > 10 * 1024 * 1024) return
    editNewFiles.value.push(f)
    const reader = new FileReader()
    reader.onload = ev => editNewPreviews.value.push(ev.target.result)
    reader.readAsDataURL(f)
  })
  e.target.value = ''
}

function removeEditFile(idx) {
  editNewFiles.value.splice(idx, 1)
  editNewPreviews.value.splice(idx, 1)
}

// Update Status
async function updateStatus(todo, status) {
  try {
    const updated = await api(`/api/todos/${todo.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    })
    const idx = todos.value.findIndex(t => t.id === todo.id)
    if (idx !== -1) todos.value[idx] = updated
  } catch (err) {
    console.error('Failed to update status:', err)
  }
}

// Start Edit
function startEdit(todo) {
  editingId.value = todo.id
  isEditing.value = true
  expandedId.value = todo.id
  const descLines = (todo.description || '').split('\n').length
  const solutionLines = (todo.solution || '').split('\n').length
  editForm.value = {
    title: todo.title,
    description: todo.description || '',
    solution: todo.solution || '',
    status: todo.status,
    progress: todo.progress,
    priority: todo.priority ?? 2,
    _todoId: todo.id,
    descRows: Math.min(Math.max(descLines, 2), 10),
    solutionRows: Math.min(Math.max(solutionLines, 2), 10)
  }
  editNewFiles.value = []
  editNewPreviews.value = []
}

// Toggle Expand
function toggleExpand(id) {
  if (expandedId.value === id && !isEditing.value) {
    expandedId.value = null
  } else if (expandedId.value !== id) {
    isEditing.value = false
    expandedId.value = id
  }
}

// Cancel Edit
function cancelEdit() {
  isEditing.value = false
  expandedId.value = null
  editingId.value = null
  editNewFiles.value = []
  editNewPreviews.value = []
}

// Save Edit
async function saveEdit(todo) {
  try {
    const updated = await api(`/api/todos/${todo.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: editForm.value.title,
        description: editForm.value.description,
        solution: editForm.value.solution,
        status: editForm.value.status,
        progress: editForm.value.progress,
        priority: editForm.value.priority
      })
    })
    const idx = todos.value.findIndex(t => t.id === todo.id)
    if (idx !== -1) todos.value[idx] = updated
    if (editNewFiles.value.length > 0) {
      await uploadImages(todo.id, editNewFiles.value)
    }
    await fetchTodoImages(todo.id)
    cancelEdit()
  } catch (err) {
    console.error('Failed to save edit:', err)
  }
}

// Delete Todo
async function deleteTodo(id) {
  if (!confirm('确定要删除这个待办吗？')) return
  try {
    await api(`/api/todos/${id}`, { method: 'DELETE' })
    todos.value = todos.value.filter(t => t.id !== id)
    delete todoImages.value[id]
  } catch (err) {
    console.error('Failed to delete todo:', err)
  }
}

// Image Viewer
async function openImageViewer(todoId) {
  imageViewer.show = true
  imageViewer.todoId = todoId
  imageViewer.editing = false
  imageViewer.newFiles = []
  imageViewer.newPreviews = []
  imageViewer.deletedIds = []
  imageViewer.images = [...(todoImages.value[todoId] || [])]
}

async function saveViewerChanges() {
  for (const imgId of imageViewer.deletedIds) {
    await api(`/api/todos/${imageViewer.todoId}/images/${imgId}`, { method: 'DELETE' })
  }
  if (imageViewer.newFiles.length > 0) {
    await uploadImages(imageViewer.todoId, imageViewer.newFiles)
  }
  await fetchTodoImages(imageViewer.todoId)
  imageViewer.images = [...(todoImages.value[imageViewer.todoId] || [])]
  imageViewer.editing = false
  imageViewer.newFiles = []
  imageViewer.newPreviews = []
  imageViewer.deletedIds = []
}

function cancelViewerEdit() {
  imageViewer.editing = false
  imageViewer.newFiles = []
  imageViewer.newPreviews = []
  imageViewer.deletedIds = []
  imageViewer.images = [...(todoImages.value[imageViewer.todoId] || [])]
}

function viewerDeleteImage(imgId) {
  imageViewer.deletedIds.push(imgId)
  imageViewer.images = imageViewer.images.filter(i => i.id !== imgId)
}

function viewerRemoveNew(idx) {
  imageViewer.newFiles.splice(idx, 1)
  imageViewer.newPreviews.splice(idx, 1)
}

function onViewerFileSelect(e) {
  const files = Array.from(e.target.files)
  files.forEach(f => {
    if (f.size > 10 * 1024 * 1024) return
    imageViewer.newFiles.push(f)
    const reader = new FileReader()
    reader.onload = ev => imageViewer.newPreviews.push(ev.target.result)
    reader.readAsDataURL(f)
  })
  e.target.value = ''
}

function closeImageViewer() {
  imageViewer.show = false
}

function openFullImage(url) {
  fullImage.show = true
  fullImage.url = url
}

// Format Date
function formatDate(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

// Auto-refresh
let pollTimer = null
const hasInProgress = computed(() => todos.value.some(t => t.status === 'in_progress'))

watch(hasInProgress, (active) => {
  if (active) startPolling()
  else stopPolling()
})

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    try {
      if (editingId.value) return
      const ne = await api('/api/todos?source=ne')
      ne.forEach(item => {
        const idx = todos.value.findIndex(t => t.id === item.id)
        if (idx !== -1) todos.value[idx] = item
        else todos.value.push(item)
      })
    } catch {}
  }, 10000)
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

onMounted(fetchTodos)
onUnmounted(stopPolling)
watch(() => router.currentRoute.value.path, (path) => {
  if (path === '/todos') fetchTodos()
})

// Debug: Watch for tab changes and log layout info
watch(personalSubTab, (newTab, oldTab) => {
  if (import.meta.env.DEV || true) { // Always log for debugging
    nextTick(() => {
      const todoPage = document.querySelector('.todo-page')
      const subTabs = document.querySelector('.sub-tabs')
      const todoList = document.querySelector('.todo-list')
      
      if (todoPage && subTabs && todoList) {
        const todoPageRect = todoPage.getBoundingClientRect()
        const subTabsRect = subTabs.getBoundingClientRect()
        const todoListRect = todoList.getBoundingClientRect()
        
        const computedStyle = window.getComputedStyle(todoPage)
        
        console.log('=== Tab Changed Debug Info ===')
        console.log(`Tab: ${oldTab} → ${newTab}`)
        console.log(`Window width: ${window.innerWidth}px`)
        console.log(`Device Pixel Ratio: ${window.devicePixelRatio}`)
        console.log('')
        console.log('.todo-page:')
        console.log(`  getBoundingClientRect: left=${todoPageRect.left.toFixed(2)}, right=${todoPageRect.right.toFixed(2)}, width=${todoPageRect.width.toFixed(2)}`)
        console.log(`  margin-left: ${computedStyle.marginLeft}`)
        console.log(`  margin-right: ${computedStyle.marginRight}`)
        console.log(`  padding-left: ${computedStyle.paddingLeft}`)
        console.log(`  padding-right: ${computedStyle.paddingRight}`)
        console.log(`  width: ${computedStyle.width}`)
        console.log(`  max-width: ${computedStyle.maxWidth}`)
        console.log(`  transform: ${computedStyle.transform}`)
        console.log('')
        console.log('.sub-tabs:')
        console.log(`  getBoundingClientRect: left=${subTabsRect.left.toFixed(2)}, width=${subTabsRect.width.toFixed(2)}`)
        console.log('')
        console.log('.todo-list:')
        console.log(`  getBoundingClientRect: left=${todoListRect.left.toFixed(2)}, width=${todoListRect.width.toFixed(2)}`)
        console.log('')
        console.log(`Filtered todos count: ${personalFilteredTodos.value.length}`)
        console.log('==============================')
      }
    })
  }
})
</script>

<style scoped>
/* Page Layout */
.todo-page {
  width: 100%;
  max-width: 700px;
  min-width: 0;
  margin: 0 auto;
  padding: 20px 16px;
  padding-bottom: 40px;
  overflow-x: hidden;
  position: relative;
  box-sizing: border-box;
  contain: layout style;
  /* 防止浏览器亚像素舍入导致的偏移 */
  transform: translateZ(0);
  backface-visibility: hidden;
}

/* Header */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
  width: 100%;
}

.cal-nav-btn {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}
.cal-nav-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.header-count {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-light);
  padding: 2px 10px;
  border-radius: 12px;
  min-width: 24px;
  text-align: center;
}

/* Add Button */
.add-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  border: none;
  font-size: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.add-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 12px rgba(108, 92, 231, 0.4);
}

.add-icon {
  line-height: 1;
  margin-top: -2px;
}

/* Add Form */
.add-form {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 16px;
}

.form-input {
  width: 100%;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--accent);
}

.title-input {
  font-weight: 600;
  margin-bottom: 8px;
}

.desc-input {
  resize: vertical;
  margin-bottom: 8px;
  min-height: 36px;
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn {
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--accent);
  color: #fff;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-cancel {
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.btn-cancel:hover {
  color: var(--text-primary);
}

/* Status Tabs */
.section {
  width: 100%;
  display: block;
}

.sub-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  padding: 4px;
  width: 100%;
  position: relative;
  contain: layout;
  /* 防止亚像素偏移 */
  transform: translateZ(0);
}

.sub-tab {
  padding: 10px 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
  min-width: 0;
}

.sub-tab.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 1px 4px var(--shadow);
}

.sub-tab-count {
  font-size: 11px;
  background: var(--bg-hover);
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.sub-tab.active .sub-tab-count {
  background: var(--accent-light);
  color: var(--accent);
}

/* Loading & Empty State */
.loading {
  text-align: center;
  color: var(--text-muted);
  padding: 60px 0;
  font-size: 14px;
}

.empty-state {
  text-align: center;
  padding: 60px 0;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 12px;
}

.empty-state p {
  font-size: 14px;
  margin: 0;
}

/* Todo List */
.todo-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  contain: layout;
}

/* Todo Card */
.todo-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  border-left: 3px solid transparent;
  box-sizing: border-box;
  width: 100%;
}

.todo-card.status-pending {
  border-left-color: #f39c12;
}

.todo-card.status-in_progress {
  border-left-color: #3498db;
}

.todo-card.status-completed {
  border-left-color: #2ecc71 !important;
}

.todo-card.priority-0 {
  border-left-color: #FF4757 !important;
}

.todo-card.priority-1 {
  border-left-color: #FF6B35 !important;
}

.todo-card.priority-2 {
  border-left-color: #3742FA !important;
}

.todo-card.priority-3 {
  border-left-color: #999 !important;
}

.todo-card:hover {
  box-shadow: 0 2px 12px var(--shadow);
}

.todo-card:hover .card-actions {
  opacity: 1;
}

.todo-card:hover .card-time {
  opacity: 0;
}

/* Card Header */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.card-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.priority-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}

.status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}

.badge-pending {
  background: rgba(243, 156, 18, 0.15);
  color: #f39c12;
}

.badge-in_progress {
  background: rgba(52, 152, 219, 0.15);
  color: #3498db;
}

.badge-completed {
  background: rgba(46, 204, 113, 0.15);
  color: #2ecc71;
}

.card-time {
  font-size: 11px;
  color: var(--text-muted);
}

/* Card Body */
.card-body {
  margin-bottom: 12px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 6px 0;
  line-height: 1.4;
}

.todo-card.status-completed .card-title {
  text-decoration: line-through;
  opacity: 0.7;
}

.card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 4px 0;
  line-height: 1.5;
}

.card-solution {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 4px 0;
  line-height: 1.5;
}

.solution-label {
  color: var(--text-muted);
}

/* Progress Section */
.progress-section {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--bg-secondary);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-pending {
  background: linear-gradient(90deg, #f39c12, #f1c40f);
}

.progress-in_progress {
  background: linear-gradient(90deg, #3498db, #2ecc71);
}

.progress-completed {
  background: linear-gradient(90deg, #2ecc71, #27ae60);
}

.progress-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  min-width: 32px;
  text-align: right;
}

/* Card Images */
.card-images {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.card-thumb {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
  cursor: pointer;
  border: 1px solid var(--border);
  transition: transform 0.15s;
}

.card-thumb:hover {
  transform: scale(1.1);
}

.card-thumb-more {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}

/* Card Actions */
.card-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.action-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.action-btn:hover {
  transform: scale(1.15);
}

.action-btn.done:hover {
  background: rgba(46, 204, 113, 0.2);
  color: #2ecc71;
}

.action-btn.start:hover {
  background: rgba(52, 152, 219, 0.2);
  color: #3498db;
}

.action-btn.reopen:hover {
  background: rgba(243, 156, 18, 0.2);
  color: #f39c12;
}

.action-btn.edit:hover {
  background: rgba(108, 92, 231, 0.2);
  color: var(--accent);
}

.action-btn.delete:hover {
  background: rgba(231, 76, 60, 0.2);
  color: #e74c3c;
}

/* Priority Selector */
.priority-selector {
  display: flex;
  gap: 4px;
  flex: 1;
}

.priority-btn {
  flex: 1;
  padding: 6px 8px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.priority-btn:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.priority-btn.active {
  font-weight: 600;
}

/* Edit Form */
.edit-form {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.edit-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.edit-label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  min-width: 80px;
}

.form-select {
  flex: 1;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.range-input {
  flex: 1;
  accent-color: var(--accent);
  height: 4px;
}

/* Image Upload Section */
.image-upload-section {
  margin-bottom: 8px;
}

.image-upload-section .edit-label {
  display: block;
  margin-bottom: 6px;
}

.image-upload-area {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.image-preview-item {
  position: relative;
  width: 64px;
  height: 64px;
}

.image-preview-thumb {
  width: 64px;
  height: 64px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--border);
}

.image-remove-btn {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #e74c3c;
  color: #fff;
  border: none;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.image-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border: 1.5px dashed var(--border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.image-add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.hidden-input {
  display: none;
}

/* Image Viewer Modal */
.image-viewer-overlay {
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
  padding: 20px;
}

.image-viewer-modal {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  max-width: 600px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.image-viewer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

.image-viewer-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.image-viewer-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.image-viewer-close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-viewer-close:hover {
  background: var(--border);
}

.image-viewer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  padding: 16px;
  overflow-y: auto;
}

.image-viewer-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
}

.image-viewer-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: pointer;
  border-radius: 8px;
}

.image-delete-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 6px;
  background: rgba(231, 76, 60, 0.9);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
  border: none;
}

.image-viewer-add {
  aspect-ratio: 1;
  border: 2px dashed var(--border);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s;
}

.image-viewer-add:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* Full Image Overlay */
.full-image-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 20px;
  cursor: pointer;
}

.full-image-img {
  max-width: 95%;
  max-height: 95%;
  object-fit: contain;
  border-radius: 4px;
}

.full-image-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.full-image-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .card-actions {
    opacity: 1;
    position: static;
    justify-content: flex-end;
    margin-top: 8px;
  }

  .todo-page {
    padding: 16px 12px;
    padding-bottom: 30px;
  }

  .page-title {
    font-size: 20px;
  }
}
</style>
