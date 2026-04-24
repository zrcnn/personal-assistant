<template>
  <div class="bookmarks-page">
    <div class="page-header">
      <button class="back-btn" @click="$router.push('/tools')">← 工具箱</button>
      <h2>🔖 网址收藏</h2>
      <button class="add-btn" @click="openEditor()">+ 收藏</button>
    </div>

    <div class="search-bar">
      <input v-model="searchQuery" placeholder="搜索标题或网址..." />
    </div>

    <div class="category-tabs">
      <button :class="{ active: !activeCategory }" @click="activeCategory = ''">全部</button>
      <button v-for="cat in allCategories" :key="cat" :class="{ active: activeCategory === cat }" @click="activeCategory = cat">{{ cat }}</button>
    </div>

    <div class="bookmarks-list">
      <div v-for="bm in filteredBookmarks" :key="bm.id" class="bookmark-item">
        <img v-if="bm.favicon" :src="bm.favicon" class="favicon" @error="$event.target.style.display='none'" />
        <div class="bm-info" @click="openUrl(bm.url)">
          <div class="bm-title">{{ bm.title }}</div>
          <div class="bm-url">{{ bm.url }}</div>
        </div>
        <div class="bm-meta">
          <span class="bm-category">{{ bm.category }}</span>
          <div class="bm-actions">
            <button @click="openEditor(bm)" title="编辑">✏️</button>
            <button @click="deleteBookmark(bm.id)" title="删除">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="filteredBookmarks.length === 0 && !loading" class="empty-state">
      <p>暂无收藏</p>
    </div>

    <div v-if="showEditor" class="modal-overlay" @click.self="showEditor = false">
      <div class="modal">
        <h3>{{ editingId ? '编辑收藏' : '添加收藏' }}</h3>
        <div class="modal-fields">
          <input v-model="form.title" placeholder="标题" />
          <input v-model="form.url" placeholder="https://..." />
          <div class="category-input">
            <span>分类:</span>
            <input v-model="form.category" placeholder="分类" list="cat-list" />
            <datalist id="cat-list">
              <option v-for="cat in allCategories" :key="cat" :value="cat" />
            </datalist>
          </div>
        </div>
        <div class="modal-btns">
          <button class="save-btn" @click="saveBookmark">保存</button>
          <button class="cancel-btn" @click="showEditor = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const bookmarks = ref([])
const loading = ref(true)
const searchQuery = ref('')
const activeCategory = ref('')
const showEditor = ref(false)
const editingId = ref(null)
const form = ref({ title: '', url: '', category: '未分类' })

const allCategories = computed(() => {
  const cats = new Set(bookmarks.value.map(b => b.category))
  return [...cats].sort()
})

const filteredBookmarks = computed(() => {
  let list = bookmarks.value
  if (activeCategory.value) list = list.filter(b => b.category === activeCategory.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(b => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q))
  }
  return list
})

function openUrl(url) { window.open(url, '_blank') }

function openEditor(bm) {
  if (bm) {
    editingId.value = bm.id
    form.value = { title: bm.title, url: bm.url, category: bm.category }
  } else {
    editingId.value = null
    form.value = { title: '', url: '', category: '未分类' }
  }
  showEditor.value = true
}

async function fetchBookmarks() {
  try {
    const resp = await fetch('/api/tools/bookmarks', { headers: { 'Authorization': `Bearer ${auth.token}` } })
    bookmarks.value = await resp.json()
  } catch (e) {
    console.error('Fetch bookmarks error:', e)
  } finally {
    loading.value = false
  }
}

async function saveBookmark() {
  if (!form.value.url) return
  try {
    let url = form.value.url
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    form.value.url = url
    if (!form.value.title) form.value.title = url

    if (editingId.value) {
      await fetch(`/api/tools/bookmarks/${editingId.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify(form.value)
      })
    } else {
      await fetch('/api/tools/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify(form.value)
      })
    }
    showEditor.value = false
    fetchBookmarks()
  } catch (e) {
    console.error('Save bookmark error:', e)
  }
}

async function deleteBookmark(id) {
  if (!confirm('确定删除？')) return
  try {
    await fetch(`/api/tools/bookmarks/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${auth.token}` } })
    fetchBookmarks()
  } catch (e) {
    console.error('Delete bookmark error:', e)
  }
}

onMounted(fetchBookmarks)
</script>

<style scoped>
.bookmarks-page { max-width: 700px; margin: 0 auto; padding: 20px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h2 { font-size: 20px; color: var(--text-primary); flex: 1; }
.back-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; }
.back-btn:hover { color: var(--accent); }
.add-btn { padding: 8px 16px; border-radius: var(--radius-md); border: none; background: var(--accent); color: #fff; cursor: pointer; font-size: 14px; }

.search-bar { margin-bottom: 12px; }
.search-bar input { width: 100%; padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); font-size: 14px; outline: none; }

.category-tabs { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
.category-tabs button { padding: 5px 12px; border-radius: 14px; border: 1px solid var(--border); background: none; color: var(--text-muted); cursor: pointer; font-size: 12px; }
.category-tabs button.active { background: var(--accent); color: #fff; border-color: var(--accent); }

.bookmarks-list { display: flex; flex-direction: column; gap: 8px; }
.bookmark-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); transition: all 0.2s; }
.bookmark-item:hover { border-color: var(--accent); }
.favicon { width: 20px; height: 20px; flex-shrink: 0; }
.bm-info { flex: 1; cursor: pointer; overflow: hidden; }
.bm-title { font-size: 14px; color: var(--text-primary); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bm-url { font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
.bm-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.bm-category { font-size: 11px; padding: 2px 8px; background: var(--bg-tertiary); border-radius: 10px; color: var(--text-muted); }
.bm-actions { display: flex; gap: 2px; }
.bm-actions button { background: none; border: none; cursor: pointer; font-size: 13px; padding: 2px; }

.empty-state { text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px; width: 90%; max-width: 420px; }
.modal h3 { font-size: 16px; color: var(--text-primary); margin-bottom: 16px; }
.modal-fields { display: flex; flex-direction: column; gap: 10px; }
.modal-fields input { width: 100%; padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); font-size: 14px; outline: none; }
.category-input { display: flex; align-items: center; gap: 10px; }
.category-input span { font-size: 13px; color: var(--text-muted); flex-shrink: 0; }
.category-input input { flex: 1; }
.modal-btns { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
.save-btn { padding: 8px 20px; border-radius: var(--radius-md); border: none; background: var(--accent); color: #fff; cursor: pointer; }
.cancel-btn { padding: 8px 20px; border-radius: var(--radius-md); border: 1px solid var(--border); background: none; color: var(--text-muted); cursor: pointer; }
</style>
