<template>
  <div class="news-page">
    <!-- Header -->
    <div class="page-header">
      <button class="back-btn" @click="$router.push('/tools')">← 工具箱</button>
      <h2>📰 新闻</h2>
      <div class="header-actions">
        <div class="search-box">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索新闻..."
            @keyup.enter="handleSearch"
          />
          <button class="search-btn" @click="handleSearch">🔍</button>
        </div>
        <button class="add-btn" @click="openEditor()">+ 新建</button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters-bar">
      <div class="filter-group">
        <label>分类：</label>
        <select v-model="filterCategory" @change="applyFilters">
          <option value="">全部</option>
          <option v-for="cat in categories" :key="cat.key" :value="cat.key">
            {{ cat.icon }} {{ cat.key }} ({{ cat.count }})
          </option>
        </select>
      </div>
      <div class="filter-group">
        <label>标签：</label>
        <select v-model="filterTag" @change="applyFilters">
          <option value="">全部</option>
          <option v-for="tag in tags" :key="tag.id" :value="tag.name">
            {{ tag.name }} ({{ tag.count }})
          </option>
        </select>
      </div>
      <div class="filter-group">
        <label>月份：</label>
        <select v-model="filterMonth" @change="applyFilters">
          <option value="">全部</option>
          <option v-for="m in months" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>
    </div>

    <!-- Hot tags -->
    <div v-if="tags.length > 0" class="hot-tags">
      <span class="hot-label">热门：</span>
      <button
        v-for="tag in tags.slice(0, 8)"
        :key="tag.id"
        class="tag-chip"
        :style="{ background: tag.color + '20', border-color: tag.color }"
        @click="filterTag = tag.name; applyFilters()"
      >
        #{{ tag.name }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-state">加载中...</div>

    <!-- News List -->
    <div v-else-if="newsItems.length > 0" class="news-list">
      <div
        v-for="(item, index) in newsItems"
        :key="item.id"
        class="news-card"
        :class="{ expanded: expandedId === item.id }"
      >
        <div class="news-header">
          <span class="category-icon" :title="item.category">
            {{ getCategoryIcon(item.category) }}
          </span>
          <span class="publish-date">{{ item.publish_date }}</span>
          <div class="news-actions" v-if="expandedId === item.id">
            <button @click="openEditor(item)" title="编辑">✏️</button>
            <button @click="confirmDelete(item.id)" title="删除">🗑️</button>
            <button @click="expandedId = null" title="收起">▲</button>
          </div>
        </div>

        <div class="news-tags" v-if="item.tags && item.tags.length > 0">
          <span
            v-for="t in item.tags"
            :key="t.id"
            class="tag-label"
            :style="{ background: t.color + '20', color: t.color }"
          >
            #{{ t.name }}
          </span>
        </div>

        <h3 class="news-title" @click="toggleExpand(item)">
          {{ item.title }}
        </h3>

        <!-- Expanded content -->
        <div v-if="expandedId === item.id" class="news-content">
          <div class="content-text" v-html="formatContent(item.content)"></div>
          <div class="content-meta">
            <span>阅读 {{ item.view_count }}</span>
            <span>来源：{{ item.source === 'hermes' ? 'Hermes 推送' : '手动创建' }}</span>
          </div>
        </div>

        <!-- Collapsed summary -->
        <div v-else class="news-summary" @click="toggleExpand(item)">
          <p>{{ item.summary || '点击展开阅读...' }}</p>
          <span class="expand-hint">[展开]</span>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!loading" class="empty-state">
      <div class="empty-icon">📰</div>
      <p>还没有新闻，点击上方按钮创建或等待每日推送</p>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination">
      <button class="page-btn" :disabled="currentPage <= 1" @click="goPage(currentPage - 1)">‹</button>
      <button
        v-for="p in visiblePages"
        :key="p"
        class="page-btn"
        :class="{ active: p === currentPage }"
        @click="goPage(p)"
      >{{ p }}</button>
      <button class="page-btn" :disabled="currentPage >= totalPages" @click="goPage(currentPage + 1)">›</button>
    </div>

    <!-- Editor Modal -->
    <div v-if="showEditor" class="modal-overlay" @click.self="closeEditor">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ editingItem ? '编辑新闻' : '新建新闻' }}</h3>
          <button class="modal-close" @click="closeEditor">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>标题 *</label>
            <input v-model="editorForm.title" type="text" placeholder="输入标题" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>日期 *</label>
              <input v-model="editorForm.publish_date" type="date" />
            </div>
            <div class="form-group">
              <label>分类</label>
              <select v-model="editorForm.category">
                <option v-for="cat in categories" :key="cat.key" :value="cat.key">
                  {{ cat.icon }} {{ cat.key }}
                </option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>标签（逗号分隔）</label>
            <input v-model="editorForm.tagsStr" type="text" placeholder="例如：Claude, Cursor, AI" />
          </div>
          <div class="form-group">
            <label>内容 *</label>
            <textarea v-model="editorForm.content" rows="12" placeholder="输入新闻内容..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="cancel-btn" @click="closeEditor">取消</button>
          <button class="save-btn" @click="saveNews" :disabled="saving">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

// State
const loading = ref(true)
const newsItems = ref([])
const categories = ref([])
const tags = ref([])
const months = ref([])
const total = ref(0)
const totalPages = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const expandedId = ref(null)
const showEditor = ref(false)
const editingItem = ref(null)
const saving = ref(false)
const searchQuery = ref('')
const currentSearch = ref('')

// Filters
const filterCategory = ref('')
const filterTag = ref('')
const filterMonth = ref('')

// Editor form
const editorForm = ref({
  title: '',
  content: '',
  publish_date: new Date().toISOString().split('T')[0],
  category: '综合',
  tagsStr: ''
})

// Category icon map
const categoryIcons = {
  '综合': '📰',
  'AI工具': '🤖',
  '大模型': '🧠',
  '框架更新': '⚡',
  '研究突破': '🔬',
  '开发者工具': '🛠️'
}

function getCategoryIcon(category) {
  return categoryIcons[category] || '📰'
}

// Visible pages for pagination
const visiblePages = computed(() => {
  const pages = []
  const start = Math.max(1, currentPage.value - 2)
  const end = Math.min(totalPages.value, start + 4)
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
})

// Fetch news list
async function fetchNews() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', currentPage.value)
    params.set('pageSize', pageSize.value)
    if (filterMonth.value) params.set('month', filterMonth.value)
    if (filterCategory.value) params.set('category', filterCategory.value)
    if (filterTag.value) params.set('tag', filterTag.value)
    if (currentSearch.value) params.set('q', currentSearch.value)

    const resp = await fetch(`/api/tools/news?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    })
    const data = await resp.json()
    newsItems.value = data.items || []
    total.value = data.total || 0
    totalPages.value = data.totalPages || 0
    categories.value = data.categories || []
    tags.value = data.tags || []
    months.value = data.months || []
  } catch (e) {
    console.error('Fetch news error:', e)
  } finally {
    loading.value = false
  }
}

// Apply filters (reset to page 1)
function applyFilters() {
  currentPage.value = 1
  fetchNews()
}

// Search
function handleSearch() {
  currentSearch.value = searchQuery.value
  currentPage.value = 1
  fetchNews()
}

// Watch search query for real-time search
let searchDebounce = null
watch(searchQuery, (val) => {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    if (val === '') {
      currentSearch.value = ''
      fetchNews()
    }
  }, 500)
})

// Go to page
function goPage(p) {
  if (p < 1 || p > totalPages.value) return
  currentPage.value = p
  fetchNews()
}

// Toggle expand
async function toggleExpand(item) {
  if (expandedId.value === item.id) {
    expandedId.value = null
    return
  }
  expandedId.value = item.id
  // Fetch full content if needed
  if (!item.content) {
    try {
      const resp = await fetch(`/api/tools/news/${item.id}`, {
        headers: { 'Authorization': `Bearer ${auth.token}` }
      })
      const data = await resp.json()
      const idx = newsItems.value.findIndex(n => n.id === item.id)
      if (idx >= 0) {
        newsItems.value[idx] = { ...newsItems.value[idx], ...data }
      }
    } catch (e) {
      console.error('Fetch news detail error:', e)
    }
  }
}

// Format content (simple markdown-like formatting)
function formatContent(content) {
  if (!content) return ''
  return content
    .replace(/###\s+(.+)/g, '<h4>$1</h4>')
    .replace(/##\s+(.+)/g, '<h3>$1</h3>')
    .replace(/#\s+(.+)/g, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>')
}

// Open editor
function openEditor(item = null) {
  editingItem.value = item
  if (item) {
    editorForm.value = {
      title: item.title || '',
      content: item.content || '',
      publish_date: item.publish_date || new Date().toISOString().split('T')[0],
      category: item.category || '综合',
      tagsStr: (item.tags || []).map(t => t.name).join(', ')
    }
  } else {
    editorForm.value = {
      title: '',
      content: '',
      publish_date: new Date().toISOString().split('T')[0],
      category: '综合',
      tagsStr: ''
    }
  }
  showEditor.value = true
}

// Close editor
function closeEditor() {
  showEditor.value = false
  editingItem.value = null
}

// Save news
async function saveNews() {
  if (!editorForm.value.title || !editorForm.value.content) {
    alert('请填写标题和内容')
    return
  }

  saving.value = true
  try {
    const tags = editorForm.value.tagsStr
      .split(',')
      .map(t => t.trim())
      .filter(t => t)

    const payload = {
      title: editorForm.value.title,
      content: editorForm.value.content,
      publish_date: editorForm.value.publish_date,
      category: editorForm.value.category,
      tags
    }

    let resp
    if (editingItem.value) {
      resp = await fetch(`/api/tools/news/${editingItem.value.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`
        },
        body: JSON.stringify(payload)
      })
    } else {
      resp = await fetch('/api/tools/news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`
        },
        body: JSON.stringify(payload)
      })
    }

    if (resp.ok) {
      closeEditor()
      fetchNews()
    } else {
      const err = await resp.json()
      alert(err.error || '操作失败')
    }
  } catch (e) {
    console.error('Save news error:', e)
    alert('保存失败')
  } finally {
    saving.value = false
  }
}

// Confirm delete
function confirmDelete(id) {
  if (confirm('确定要删除这篇新闻吗？')) {
    deleteNews(id)
  }
}

// Delete news
async function deleteNews(id) {
  try {
    const resp = await fetch(`/api/tools/news/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${auth.token}` }
    })
    if (resp.ok) {
      if (expandedId.value === id) expandedId.value = null
      fetchNews()
    } else {
      alert('删除失败')
    }
  } catch (e) {
    console.error('Delete news error:', e)
  }
}

onMounted(fetchNews)
</script>

<style scoped>
.news-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  min-height: calc(100vh - 60px);
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.page-header h2 {
  flex: 1;
  font-size: 20px;
  color: var(--text-primary);
  min-width: 80px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-box {
  display: flex;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.search-box input {
  width: 180px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}

.search-box input::placeholder {
  color: var(--text-muted);
}

.search-btn {
  padding: 8px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 16px;
}

.back-btn,
.add-btn {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition);
}

.back-btn:hover,
.add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.add-btn {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.add-btn:hover {
  opacity: 0.9;
}

/* Filters */
.filters-bar {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-group label {
  font-size: 13px;
  color: var(--text-muted);
}

.filter-group select {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  outline: none;
}

.filter-group select:focus {
  border-color: var(--accent);
}

/* Hot tags */
.hot-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.hot-label {
  font-size: 13px;
  color: var(--text-muted);
}

.tag-chip {
  padding: 4px 12px;
  border: 1px solid;
  border-radius: 20px;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition);
}

.tag-chip:hover {
  transform: translateY(-1px);
}

/* News list */
.news-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.news-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  transition: all var(--transition);
}

.news-card:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 12px var(--shadow);
}

.news-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.category-icon {
  font-size: 20px;
}

.publish-date {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: auto;
}

.news-actions {
  display: flex;
  gap: 8px;
}

.news-actions button {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.news-actions button:hover {
  border-color: var(--accent);
}

.news-tags {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.tag-label {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.news-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  margin: 0 0 8px 0;
  transition: color var(--transition);
}

.news-title:hover {
  color: var(--accent);
}

.news-summary {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.news-summary p {
  margin: 0;
  flex: 1;
}

.expand-hint {
  font-size: 12px;
  color: var(--accent);
  flex-shrink: 0;
  margin-left: 12px;
}

.news-content {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.content-text {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary);
  max-height: 600px;
  overflow-y: auto;
  white-space: normal;
}

.content-text h2 {
  font-size: 18px;
  margin: 16px 0 8px;
  color: var(--text-primary);
}

.content-text h3 {
  font-size: 16px;
  margin: 12px 0 6px;
  color: var(--text-primary);
}

.content-text h4 {
  font-size: 14px;
  margin: 8px 0 4px;
  color: var(--text-primary);
}

.content-text strong {
  color: var(--text-primary);
}

.content-text code {
  background: var(--bg-card);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}

.content-meta {
  display: flex;
  gap: 16px;
  margin-top: 16px;
  font-size: 12px;
  color: var(--text-muted);
}

/* Loading & Empty */
.loading-state,
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

/* Pagination */
.pagination {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 24px;
}

.page-btn {
  min-width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition);
}

.page-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.page-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.page-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal {
  background: var(--bg-page);
  border: 1px solid var(--border);
  border-radius: 16px;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary);
}

.modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-muted);
  border-radius: 8px;
}

.modal-close:hover {
  background: var(--bg-card);
  color: var(--text-primary);
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
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color var(--transition);
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  border-color: var(--accent);
}

.form-group textarea {
  resize: vertical;
  font-family: inherit;
  line-height: 1.6;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

.cancel-btn,
.save-btn {
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition);
}

.cancel-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.cancel-btn:hover {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

.save-btn {
  background: var(--accent);
  border: 1px solid var(--accent);
  color: #fff;
}

.save-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 600px) {
  .page-header {
    gap: 12px;
  }

  .search-box input {
    width: 120px;
  }

  .filters-bar {
    gap: 12px;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .modal {
    max-height: 100vh;
    border-radius: 0;
  }
}
</style>
