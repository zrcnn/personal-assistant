<template>
  <div class="expense-page">
    <div class="page-header">
      <button class="back-btn" @click="$router.push('/tools')">← 工具箱</button>
      <h2>💰 记账本</h2>
    </div>

    <div class="expense-controls">
      <div class="month-picker">
        <button @click="changeMonth(-1)">◀</button>
        <span>{{ currentMonth }}</span>
        <button @click="changeMonth(1)">▶</button>
      </div>
      <div class="total-display">
        本月支出: <strong>{{ totalAmount }}</strong> 元
      </div>
    </div>

    <div class="add-form" v-if="showForm">
      <div class="form-row">
        <input v-model.number="form.amount" type="number" step="0.01" placeholder="金额" />
        <select v-model="form.category">
          <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
      </div>
      <div class="form-row">
        <input v-model="form.description" placeholder="备注说明" />
        <input v-model="form.expense_date" type="date" />
      </div>
      <div class="form-btns">
        <button class="save-btn" @click="saveExpense">{{ editingId ? '更新' : '添加' }}</button>
        <button class="cancel-btn" @click="cancelForm">取消</button>
      </div>
    </div>

    <button class="add-btn" @click="openForm()">+ 记一笔</button>

    <div v-if="summary.length" class="summary-section">
      <h3>分类统计</h3>
      <div class="summary-bars">
        <div v-for="s in summary" :key="s.category" class="summary-row">
          <span class="cat-name">{{ s.category }}</span>
          <div class="bar-wrap">
            <div class="bar" :style="{ width: barWidth(s.total) + '%' }"></div>
          </div>
          <span class="cat-total">{{ s.total.toFixed(2) }}</span>
          <span class="cat-count">({{ s.count }}笔)</span>
        </div>
      </div>
    </div>

    <div class="expense-list">
      <div v-for="item in items" :key="item.id" class="expense-item">
        <div class="item-left">
          <span class="item-category">{{ item.category }}</span>
          <span class="item-desc">{{ item.description || '-' }}</span>
          <span class="item-date">{{ item.expense_date }}</span>
        </div>
        <div class="item-right">
          <span class="item-amount">¥{{ item.amount }}</span>
          <div class="item-actions">
            <button @click="openForm(item)">✏️</button>
            <button @click="deleteExpense(item.id)">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="items.length === 0 && !loading" class="empty-state">
      <p>本月还没有记录</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const items = ref([])
const summary = ref([])
const loading = ref(true)
const showForm = ref(false)
const editingId = ref(null)
const categories = ['餐饮', '交通', '购物', '娱乐', '居住', '医疗', '教育', '通讯', '工资', '理财', '其他']

const now = new Date()
const monthOffset = ref(0)
const currentMonth = computed(() => {
  const d = new Date(now.getFullYear(), now.getMonth() + monthOffset.value, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
})
const totalAmount = computed(() => summary.value.reduce((s, x) => s + x.total, 0).toFixed(2))
const maxTotal = computed(() => Math.max(...summary.value.map(s => s.total), 1))

const form = ref({ amount: '', category: '餐饮', description: '', expense_date: new Date().toISOString().slice(0, 10) })

function barWidth(total) { return (total / maxTotal.value) * 100 }

function changeMonth(dir) { monthOffset.value += dir }

function openForm(item) {
  if (item) {
    editingId.value = item.id
    form.value = { amount: item.amount, category: item.category, description: item.description, expense_date: item.expense_date }
  } else {
    editingId.value = null
    form.value = { amount: '', category: '餐饮', description: '', expense_date: new Date().toISOString().slice(0, 10) }
  }
  showForm.value = true
}

function cancelForm() { showForm.value = false; editingId.value = null }

async function fetchExpenses() {
  loading.value = true
  try {
    const resp = await fetch(`/api/tools/expenses?month=${currentMonth.value}`, {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    })
    const data = await resp.json()
    items.value = data.items
    summary.value = data.summary
  } catch (e) {
    console.error('Fetch expenses error:', e)
  } finally {
    loading.value = false
  }
}

async function saveExpense() {
  if (!form.value.amount) return
  try {
    if (editingId.value) {
      await fetch(`/api/tools/expenses/${editingId.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify(form.value)
      })
    } else {
      await fetch('/api/tools/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token}` },
        body: JSON.stringify(form.value)
      })
    }
    cancelForm()
    fetchExpenses()
  } catch (e) {
    console.error('Save expense error:', e)
  }
}

async function deleteExpense(id) {
  if (!confirm('确定删除？')) return
  try {
    await fetch(`/api/tools/expenses/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${auth.token}` } })
    fetchExpenses()
  } catch (e) {
    console.error('Delete expense error:', e)
  }
}

watch(currentMonth, fetchExpenses)
onMounted(fetchExpenses)
</script>

<style scoped>
.expense-page { max-width: 700px; margin: 0 auto; padding: 20px; }
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

.expense-controls { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding: 14px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.month-picker { display: flex; align-items: center; gap: 12px; }
.month-picker button { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 4px 8px; border-radius: var(--radius-sm); }
.month-picker button:hover { background: var(--bg-tertiary); color: var(--text-primary); }
.month-picker span { font-size: 16px; font-weight: 600; color: var(--text-primary); min-width: 120px; text-align: center; }
.total-display { font-size: 14px; color: var(--text-secondary); }
.total-display strong { color: #ff6b6b; font-size: 20px; }

.add-form { padding: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: 12px; }
.form-row { display: flex; gap: 8px; margin-bottom: 8px; }
.form-row input, .form-row select { flex: 1; padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); font-size: 14px; outline: none; }
.form-row input:focus, .form-row select:focus { border-color: var(--accent); }
.form-btns { display: flex; gap: 8px; justify-content: flex-end; }
.save-btn { padding: 8px 20px; border-radius: var(--radius-md); border: none; background: var(--accent); color: #fff; cursor: pointer; }
.cancel-btn { padding: 8px 20px; border-radius: var(--radius-md); border: 1px solid var(--border); background: none; color: var(--text-muted); cursor: pointer; }

.add-btn { width: 100%; padding: 12px; border-radius: var(--radius-md); border: 2px dashed var(--border); background: none; color: var(--text-muted); cursor: pointer; font-size: 14px; margin-bottom: 16px; transition: all 0.2s; }
.add-btn:hover { border-color: var(--accent); color: var(--accent); }

.summary-section { padding: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: 16px; }
.summary-section h3 { font-size: 15px; color: var(--text-primary); margin-bottom: 12px; }
.summary-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 13px; }
.cat-name { min-width: 50px; color: var(--text-secondary); }
.bar-wrap { flex: 1; height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden; }
.bar { height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.3s; }
.cat-total { min-width: 70px; text-align: right; color: var(--text-primary); font-weight: 600; }
.cat-count { color: var(--text-muted); font-size: 12px; }

.expense-list { display: flex; flex-direction: column; gap: 8px; }
.expense-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); }
.item-left { display: flex; flex-direction: column; gap: 2px; }
.item-category { font-size: 13px; color: var(--accent); font-weight: 500; }
.item-desc { font-size: 13px; color: var(--text-secondary); }
.item-date { font-size: 11px; color: var(--text-muted); }
.item-right { display: flex; align-items: center; gap: 12px; }
.item-amount { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.item-actions { display: flex; gap: 4px; }
.item-actions button { background: none; border: none; cursor: pointer; font-size: 13px; padding: 2px; }

.empty-state { text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px; }
</style>
