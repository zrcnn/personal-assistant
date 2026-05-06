<template>
  <div class="notes-page">
    <div class="page-header">
      <button class="back-btn" @click="$router.push('/tools')">← 工具箱</button>
      <h2>📝 便签</h2>
      <button class="add-btn" @click="openEditor()">+ 新便签</button>
    </div>

    <div class="notes-grid">
      <div v-for="note in notes" :key="note.id" class="note-card" :style="{ borderTop: `3px solid ${note.color}` }">
        <div class="note-header">
          <input v-if="editingId === note.id" v-model="editForm.title" class="note-title-input" />
          <h3 v-else class="note-title">{{ note.title || '无标题' }}</h3>
          <div class="note-actions">
            <button @click="togglePin(note)" :title="note.pinned ? '取消置顶' : '置顶'">{{ note.pinned ? '📌' : '📍' }}</button>
            <button @click="openEditor(note)" title="编辑">✏️</button>
            <button @click="deleteNote(note.id)" title="删除">🗑️</button>
          </div>
        </div>
        <div v-if="editingId === note.id" class="note-editor">
          <textarea v-model="editForm.content" rows="6" placeholder="写点什么..."></textarea>
          <div class="color-picker">
            <span v-for="c in colors" :key="c" class="color-dot" :style="{ background: c }" :class="{ active: editForm.color === c }" @click="editForm.color = c"></span>
          </div>
          <div class="editor-btns">
            <button class="save-btn" @click="saveNote(note.id)">保存</button>
            <button class="cancel-btn" @click="editingId = null">取消</button>
          </div>
        </div>
        <p v-else class="note-content" @click="openEditor(note)">{{ note.content || '点击编辑...' }}</p>
        <div class="note-footer">
          <span>{{ formatDate(note.updated_at) }}</span>
        </div>
      </div>
    </div>

    <div v-if="notes.length === 0 && !loading" class="empty-state">
      <div class="empty-icon">📝</div>
      <p>还没有便签，点击上方按钮创建一个</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const notes = ref([])
const loading = ref(true)
const editingId = ref(null)
const editForm = ref({ title: '', content: '', color: '#4a9eff' })
const colors = ['#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#ff922b', '#20c997', '#845ef7']

async function fetchNotes() {
  try {
    const resp = await fetch('/api/tools/notes', { headers: { 'Authorization': `Bearer ${auth.token}` } })
    notes.value = await resp.json()
  } catch (e) {
    console.error('Fetch notes error:', e)
  } finally {
    loading.value = false
  }
}

function openEditor(note) {
  if (editingId.value === note?.id) { editingId.value = null; return }
  editingId.value = note ? note.id : 'new'
  editForm.value = {
    title: note?.title || '',
    content: note?.content || '',
    color: note?.color || '#4a9eff'
  }
}

async function saveNote(id) {
  try {
    if (id === 'new') {
      const resp = await fetch('/api/tools/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify(editForm.value)
      })
      const data = await resp.json()
      notes.value.unshift({ id: data.id, ...editForm.value, pinned: 0, created_at: new Date(), updated_at: new Date() })
    } else {
      await fetch(`/api/tools/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify(editForm.value)
      })
      const idx = notes.value.findIndex(n => n.id === id)
      if (idx >= 0) Object.assign(notes.value[idx], editForm.value, { updated_at: new Date() })
    }
    editingId.value = null
  } catch (e) {
    console.error('Save note error:', e)
  }
}

async function deleteNote(id) {
  if (!confirm('确定删除此便签？')) return
  try {
    await fetch(`/api/tools/notes/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${auth.token}` } })
    notes.value = notes.value.filter(n => n.id !== id)
  } catch (e) {
    console.error('Delete note error:', e)
  }
}

async function togglePin(note) {
  try {
    await fetch(`/api/tools/notes/${note.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
      body: JSON.stringify({ pinned: note.pinned ? 0 : 1 })
    })
    note.pinned = note.pinned ? 0 : 1
    notes.value.sort((a, b) => b.pinned - a.pinned)
  } catch (e) {
    console.error('Pin note error:', e)
  }
}

function formatDate(d) {
  if (!d) return ''
  const date = new Date(d)
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${m}-${day} ${h}:${min}`
}

onMounted(fetchNotes)
</script>

<style scoped>
.notes-page { max-width: 900px; margin: 0 auto; padding: 20px; }
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
.add-btn { padding: 8px 16px; border-radius: var(--radius-md); border: none; background: var(--accent); color: #fff; cursor: pointer; font-size: 14px; }

.notes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }

.note-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px; transition: all var(--transition); }
.note-card:hover { box-shadow: 0 4px 12px var(--shadow); }
.note-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8px; }
.note-title { font-size: 15px; font-weight: 600; color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note-title-input { flex: 1; font-size: 15px; font-weight: 600; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px 8px; color: var(--text-primary); outline: none; }
.note-actions { display: flex; gap: 4px; flex-shrink: 0; margin-left: 8px; }
.note-actions button { background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px; }

.note-content { font-size: 13px; color: var(--text-secondary); line-height: 1.6; cursor: pointer; white-space: pre-wrap; word-break: break-all; max-height: 120px; overflow: hidden; }
.note-footer { margin-top: 8px; font-size: 11px; color: var(--text-muted); }

.note-editor textarea { width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 10px; color: var(--text-primary); font-size: 13px; resize: vertical; outline: none; font-family: inherit; }
.color-picker { display: flex; gap: 6px; margin: 10px 0; }
.color-dot { width: 20px; height: 20px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: transform 0.15s; }
.color-dot:hover { transform: scale(1.2); }
.color-dot.active { border-color: var(--text-primary); }
.editor-btns { display: flex; gap: 8px; }
.save-btn { padding: 6px 16px; border-radius: var(--radius-md); border: none; background: var(--accent); color: #fff; cursor: pointer; font-size: 13px; }
.cancel-btn { padding: 6px 16px; border-radius: var(--radius-md); border: 1px solid var(--border); background: none; color: var(--text-muted); cursor: pointer; font-size: 13px; }

.empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.empty-icon { font-size: 48px; margin-bottom: 12px; }

@media (max-width: 768px) {
  .notes-page { padding: 12px; }
  .notes-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .note-card { padding: 12px; }
}
</style>
