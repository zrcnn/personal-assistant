<template>
  <div class="test-case-page">
    <!-- Header -->
    <div class="page-header">
      <h2 class="page-title">📝 测试用例生成工具</h2>
      <button class="add-btn" @click="showAddForm = !showAddForm" title="添加产品">
        <span class="add-icon">+</span>
      </button>
    </div>

    <!-- Add Product Form -->
    <transition name="slide">
      <div v-if="showAddForm" class="add-form">
        <input 
          v-model="newProduct.name" 
          class="form-input title-input" 
          placeholder="产品名称 *"
        />
        <textarea 
          v-model="newProduct.description" 
          class="form-input desc-input"
          placeholder="产品描述（可选）" 
          rows="3"
        ></textarea>
        <div class="form-actions">
          <button 
            class="btn btn-primary" 
            @click="addProduct" 
            :disabled="!newProduct.name.trim()"
          >
            添加
          </button>
          <button 
            class="btn btn-cancel" 
            @click="showAddForm = false; resetForm()"
          >
            取消
          </button>
        </div>
      </div>
    </transition>

    <!-- Loading State -->
    <div v-if="loading" class="loading">加载中...</div>

    <!-- Error Message -->
    <div v-else-if="error" class="error-message">
      {{ error }}
    </div>

    <!-- Empty State -->
    <div v-else-if="products.length === 0" class="empty-state">
      <span class="empty-icon">📦</span>
      <p>暂无产品</p>
    </div>

    <!-- Product List - Card Grid -->
    <div v-else-if="!selectedProduct" class="products-grid">
      <div 
        v-for="product in products" 
        :key="product.id"
        class="product-card"
        @click="selectProduct(product)"
      >
        <div class="card-header">
          <h3 class="card-title">{{ product.name }}</h3>
          <div class="card-actions">
            <button 
              class="action-btn edit" 
              @click.stop="startEdit(product)" 
              title="编辑"
            >
              ✎
            </button>
            <button 
              class="action-btn delete" 
              @click.stop="deleteProduct(product.id)" 
              title="删除"
            >
              ✕
            </button>
          </div>
        </div>
        <p v-if="product.description" class="card-desc">{{ product.description }}</p>
        <span class="card-time">{{ formatDate(product.created_at) }}</span>

        <!-- Edit Form (inline) -->
        <transition name="slide">
          <div v-if="editingId === product.id" class="edit-form">
            <input 
              v-model="editForm.name" 
              class="form-input title-input" 
              placeholder="产品名称" 
            />
            <textarea 
              v-model="editForm.description" 
              class="form-input desc-input" 
              placeholder="产品描述" 
              rows="3"
            ></textarea>
            <div class="form-actions">
              <button class="btn btn-primary" @click="saveProduct(product.id)">保存</button>
              <button class="btn btn-cancel" @click="cancelEdit">取消</button>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- Requirements Management Section -->
    <div v-else class="requirements-section">
      <!-- Section Header -->
      <div class="section-header">
        <button class="back-btn" @click="backToProducts">
          ← 返回产品列表
        </button>
        <h3 class="section-title">📋 {{ selectedProduct.name }} - 需求列表</h3>
        <button class="add-btn" @click="showAddReqForm = true" title="添加需求">
          <span class="add-icon">+</span>
        </button>
      </div>

      <!-- Add Requirement Form -->
      <transition name="slide">
        <div v-if="showAddReqForm" class="add-form">
          <input 
            v-model="newRequirement.title" 
            class="form-input title-input" 
            placeholder="需求标题 *"
          />
          <textarea 
            v-model="newRequirement.description" 
            class="form-input desc-input"
            placeholder="需求描述（可选）" 
            rows="3"
          ></textarea>
          <div class="form-row">
            <select v-model="newRequirement.type" class="form-input select-input">
              <option value="">选择类型</option>
              <option v-for="type in reqTypes" :key="type.value" :value="type.value">
                {{ type.label }}
              </option>
            </select>
            <select v-model="newRequirement.priority" class="form-input select-input">
              <option value="">选择优先级</option>
              <option v-for="p in priorities" :key="p.value" :value="p.value">
                {{ p.label }}
              </option>
            </select>
          </div>
          <div class="form-actions">
            <button 
              class="btn btn-primary" 
              @click="addRequirement" 
              :disabled="!newRequirement.title.trim()"
            >
              添加
            </button>
            <button 
              class="btn btn-cancel" 
              @click="showAddReqForm = false; resetReqForm()"
            >
              取消
            </button>
          </div>
        </div>
      </transition>

      <!-- Requirements Loading -->
      <div v-if="reqLoading" class="loading">加载中...</div>

      <!-- Requirements Empty State -->
      <div v-else-if="requirements.length === 0" class="empty-state">
        <span class="empty-icon">📝</span>
        <p>暂无需求</p>
      </div>

      <!-- Requirements List -->
      <div v-else-if="!selectedRequirement" class="requirements-list">
        <div 
          v-for="req in requirements" 
          :key="req.id"
          class="requirement-item"
          @click="selectRequirement(req)"
        >
          <div class="req-header">
            <h4 class="req-title">{{ req.title }}</h4>
            <div class="req-badges">
              <span class="badge" :class="'badge-' + req.type">{{ getTypeLabel(req.type) }}</span>
              <span class="badge" :class="'badge-' + req.priority">{{ getPriorityLabel(req.priority) }}</span>
            </div>
          </div>
          <p v-if="req.description" class="req-desc">{{ req.description }}</p>
          <div class="req-footer">
            <span class="req-time">{{ formatDate(req.created_at) }}</span>
            <div class="req-actions">
              <button 
                class="action-btn edit" 
                @click.stop="startEditReq(req)" 
                title="编辑"
              >
                ✎
              </button>
              <button 
                class="action-btn delete" 
                @click.stop="deleteRequirement(req.id)" 
                title="删除"
              >
                ✕
              </button>
            </div>
          </div>

          <!-- Edit Requirement Form -->
          <transition name="slide">
            <div v-if="editingReqId === req.id" class="edit-form">
              <input 
                v-model="editReqForm.title" 
                class="form-input title-input" 
                placeholder="需求标题"
              />
              <textarea 
                v-model="editReqForm.description" 
                class="form-input desc-input" 
                placeholder="需求描述" 
                rows="2"
              ></textarea>
              <div class="form-row">
                <select v-model="editReqForm.type" class="form-input select-input">
                  <option v-for="type in reqTypes" :key="type.value" :value="type.value">
                    {{ type.label }}
                  </option>
                </select>
                <select v-model="editReqForm.priority" class="form-input select-input">
                  <option v-for="p in priorities" :key="p.value" :value="p.value">
                    {{ p.label }}
                  </option>
                </select>
              </div>
              <div class="form-actions">
                <button class="btn btn-primary" @click="saveRequirement(req.id)">保存</button>
                <button class="btn btn-cancel" @click="cancelEditReq">取消</button>
              </div>
            </div>
          </transition>
        </div>
      </div>

      <!-- Test Cases Section (inside requirements-section) -->
      <div v-if="selectedRequirement" class="test-cases-section">
        <!-- Section Header -->
      <div class="section-header">
        <button class="back-btn" @click="backToRequirements">
          ← 返回需求列表
        </button>
        <h3 class="section-title">
          🧪 {{ selectedRequirement.title }} - 测试用例
        </h3>
        <div class="header-actions">
          <button 
            class="btn btn-ai" 
            @click="generateTestCases" 
            :disabled="generating"
          >
            <span v-if="generating" class="ai-loading">⏳ 生成中...</span>
            <span v-else>🤖 AI 生成测试用例</span>
          </button>
          <button class="add-btn" @click="showAddTCForm = true" title="添加测试用例">
            <span class="add-icon">+</span>
          </button>
        </div>
      </div>

      <!-- Add Test Case Form -->
      <transition name="slide">
        <div v-if="showAddTCForm" class="add-form">
          <input 
            v-model="newTestCase.title" 
            class="form-input title-input" 
            placeholder="测试用例标题 *"
          />
          <div class="form-row">
            <select v-model="newTestCase.type" class="form-input select-input">
              <option value="">选择类型</option>
              <option v-for="type in tcTypes" :key="type.value" :value="type.value">
                {{ type.label }}
              </option>
            </select>
            <select v-model="newTestCase.priority" class="form-input select-input">
              <option value="">选择优先级</option>
              <option v-for="p in tcPriorities" :key="p.value" :value="p.value">
                {{ p.label }}
              </option>
            </select>
          </div>
          <textarea 
            v-model="newTestCase.steps" 
            class="form-input desc-input"
            placeholder="测试步骤（每行一个步骤）" 
            rows="3"
          ></textarea>
          <textarea 
            v-model="newTestCase.expected" 
            class="form-input desc-input"
            placeholder="期望结果" 
            rows="2"
          ></textarea>
          <div class="form-actions">
            <button 
              class="btn btn-primary" 
              @click="addTestCase" 
              :disabled="!newTestCase.value.title.trim()"
            >
              添加
            </button>
            <button 
              class="btn btn-cancel" 
              @click="showAddTCForm = false; resetTCForm()"
            >
              取消
            </button>
          </div>
        </div>
      </transition>

      <!-- Test Cases Loading -->
      <div v-if="tcLoading" class="loading">加载中...</div>

      <!-- Test Cases Empty State -->
      <div v-else-if="testCases.length === 0" class="empty-state">
        <span class="empty-icon">🧪</span>
        <p>暂无测试用例</p>
        <button class="btn btn-ai" @click="generateTestCases" :disabled="generating">
          <span v-if="generating">⏳ 生成中...</span>
          <span v-else>🤖 AI 生成测试用例</span>
        </button>
      </div>

      <!-- Test Cases List -->
      <div v-else class="test-cases-list">
        <div 
          v-for="tc in testCases" 
          :key="tc.id"
          class="test-case-item"
        >
          <div class="tc-header">
            <h4 class="tc-title">{{ tc.title }}</h4>
            <div class="tc-badges">
              <span class="badge" :class="'badge-tc-' + tc.type">{{ getTCTypeLabel(tc.type) }}</span>
              <span class="badge" :class="'badge-' + tc.priority">{{ getTCPriorityLabel(tc.priority) }}</span>
            </div>
          </div>

          <!-- Test Case Content (non-editing mode) -->
          <div v-if="editingTCId !== tc.id" class="tc-content">
            <div v-if="tc.steps" class="tc-section">
              <strong>测试步骤：</strong>
              <pre class="tc-steps">{{ tc.steps }}</pre>
            </div>
            <div v-if="tc.expected" class="tc-section">
              <strong>期望结果：</strong>
              <p class="tc-expected">{{ tc.expected }}</p>
            </div>
            <div class="tc-footer">
              <span class="tc-time">{{ formatDate(tc.created_at) }}</span>
              <div class="tc-actions">
                <button 
                  class="action-btn edit" 
                  @click="startEditTC(tc)" 
                  title="编辑"
                >
                  ✎
                </button>
                <button 
                  class="action-btn delete" 
                  @click="deleteTestCase(tc.id)" 
                  title="删除"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          <!-- Edit Test Case Form -->
          <div v-else class="edit-form">
            <input 
              v-model="editTCForm.title" 
              class="form-input title-input" 
              placeholder="测试用例标题"
            />
            <div class="form-row">
              <select v-model="editTCForm.type" class="form-input select-input">
                <option v-for="type in tcTypes" :key="type.value" :value="type.value">
                  {{ type.label }}
                </option>
              </select>
              <select v-model="editTCForm.priority" class="form-input select-input">
                <option v-for="p in tcPriorities" :key="p.value" :value="p.value">
                  {{ p.label }}
                </option>
              </select>
            </div>
            <textarea 
              v-model="editTCForm.steps" 
              class="form-input desc-input" 
              placeholder="测试步骤" 
              rows="3"
            ></textarea>
            <textarea 
              v-model="editTCForm.expected" 
              class="form-input desc-input" 
              placeholder="期望结果" 
              rows="2"
            ></textarea>
            <div class="form-actions">
              <button class="btn btn-primary" @click="saveTestCase(tc.id)">保存</button>
              <button class="btn btn-cancel" @click="cancelEditTC">取消</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { testCaseAPI } from '../api/modules'

// State
const products = ref([])
const loading = ref(true)
const error = ref('')
const showAddForm = ref(false)
const editingId = ref(null)

// New Product Form
const newProduct = ref({ name: '', description: '' })

// Edit Form
const editForm = ref({ name: '', description: '' })

// Requirements State
const selectedProduct = ref(null)
const requirements = ref([])
const reqLoading = ref(false)
const showAddReqForm = ref(false)
const editingReqId = ref(null)

// New Requirement Form
const newRequirement = ref({ title: '', description: '', type: '', priority: '' })

// Edit Requirement Form
const editReqForm = ref({ title: '', description: '', type: '', priority: '' })

// Test Cases State
const selectedRequirement = ref(null)
const testCases = ref([])
const tcLoading = ref(false)
const generating = ref(false)
const showAddTCForm = ref(false)
const editingTCId = ref(null)

// New Test Case Form
const newTestCase = ref({ title: '', type: '', priority: '', steps: '', expected: '' })

// Edit Test Case Form
const editTCForm = ref({ title: '', type: '', priority: '', steps: '', expected: '' })

// Test Case Types & Priorities
const tcTypes = [
  { value: 'functional', label: '功能测试' },
  { value: 'regression', label: '回归测试' },
  { value: 'performance', label: '性能测试' },
  { value: 'security', label: '安全测试' },
  { value: 'ui', label: '界面测试' },
  { value: 'api', label: '接口测试' }
]

const tcPriorities = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' }
]

// Requirement Types & Priorities
const reqTypes = [
  { value: 'functional', label: '功能需求' },
  { value: 'non-functional', label: '非功能需求' },
  { value: 'ui', label: '界面需求' },
  { value: 'performance', label: '性能需求' },
  { value: 'security', label: '安全需求' }
]

const priorities = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' }
]

// Load Products
async function loadProducts() {
  try {
    loading.value = true
    error.value = ''
    const res = await testCaseAPI.getProducts()
    products.value = res || []
  } catch (err) {
    console.error('Failed to fetch products:', err)
    error.value = '加载产品列表失败'
  } finally {
    loading.value = false
  }
}

// Add Product
async function addProduct() {
  if (!newProduct.value.name.trim()) return
  try {
    const created = await testCaseAPI.createProduct(newProduct.value)
    products.value.unshift(created)
    resetForm()
    showAddForm.value = false
  } catch (err) {
    console.error('Failed to add product:', err)
    error.value = '添加产品失败'
  }
}

// Start Edit
function startEdit(product) {
  editingId.value = product.id
  editForm.value = {
    name: product.name,
    description: product.description || ''
  }
}

// Save Edit
async function saveProduct(id) {
  if (!editForm.value.name.trim()) return
  try {
    const updated = await testCaseAPI.updateProduct(id, editForm.value)
    const idx = products.value.findIndex(p => p.id === id)
    if (idx !== -1) products.value[idx] = updated
    cancelEdit()
  } catch (err) {
    console.error('Failed to update product:', err)
    error.value = '保存失败'
  }
}

// Cancel Edit
function cancelEdit() {
  editingId.value = null
  editForm.value = { name: '', description: '' }
}

// Delete Product
async function deleteProduct(id) {
  if (!confirm('确定要删除这个产品吗？')) return
  try {
    await testCaseAPI.deleteProduct(id)
    products.value = products.value.filter(p => p.id !== id)
  } catch (err) {
    console.error('Failed to delete product:', err)
    error.value = '删除失败'
  }
}

// Reset Form
function resetForm() {
  newProduct.value = { name: '', description: '' }
}

// Format Date
function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now - d
  const days = Math.floor(diff / 86400000)
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
}

// Select Product - Show Requirements
function selectProduct(product) {
  selectedProduct.value = product
  loadRequirements(product.id)
}

// Back to Products List
function backToProducts() {
  selectedProduct.value = null
  requirements.value = []
  showAddReqForm.value = false
  editingReqId.value = null
}

// Load Requirements
async function loadRequirements(productId) {
  try {
    reqLoading.value = true
    const res = await testCaseAPI.getRequirements(productId)
    requirements.value = res || []
  } catch (err) {
    console.error('Failed to fetch requirements:', err)
  } finally {
    reqLoading.value = false
  }
}

// Add Requirement
async function addRequirement() {
  if (!newRequirement.value.title.trim()) return
  try {
    const data = { ...newRequirement.value, productId: selectedProduct.value.id }
    const created = await testCaseAPI.createRequirement(data)
    requirements.value.unshift(created)
    resetReqForm()
    showAddReqForm.value = false
  } catch (err) {
    console.error('Failed to add requirement:', err)
  }
}

// Start Edit Requirement
function startEditReq(req) {
  editingReqId.value = req.id
  editReqForm.value = {
    title: req.title,
    description: req.description || '',
    type: req.type || '',
    priority: req.priority || ''
  }
}

// Save Requirement Edit
async function saveRequirement(id) {
  if (!editReqForm.value.title.trim()) return
  try {
    const updated = await testCaseAPI.updateRequirement(id, editReqForm.value)
    const idx = requirements.value.findIndex(r => r.id === id)
    if (idx !== -1) requirements.value[idx] = updated
    cancelEditReq()
  } catch (err) {
    console.error('Failed to update requirement:', err)
  }
}

// Cancel Edit Requirement
function cancelEditReq() {
  editingReqId.value = null
  editReqForm.value = { title: '', description: '', type: '', priority: '' }
}

// Delete Requirement
async function deleteRequirement(id) {
  if (!confirm('确定要删除这个需求吗？')) return
  try {
    await testCaseAPI.deleteRequirement(id)
    requirements.value = requirements.value.filter(r => r.id !== id)
  } catch (err) {
    console.error('Failed to delete requirement:', err)
  }
}

// Reset Requirement Form
function resetReqForm() {
  newRequirement.value = { title: '', description: '', type: '', priority: '' }
}

// Get Type Label
function getTypeLabel(type) {
  const found = reqTypes.find(t => t.value === type)
  return found ? found.label : type
}

// Get Priority Label
function getPriorityLabel(priority) {
  const found = priorities.find(p => p.value === priority)
  return found ? found.label : priority
}

// Get Test Case Type Label
function getTCTypeLabel(type) {
  const found = tcTypes.find(t => t.value === type)
  return found ? found.label : type
}

// Get Test Case Priority Label
function getTCPriorityLabel(priority) {
  const found = tcPriorities.find(p => p.value === priority)
  return found ? found.label : priority
}

// Select Requirement - Show Test Cases
function selectRequirement(req) {
  selectedRequirement.value = req
  loadTestCases(req.id)
}

// Back to Requirements List
function backToRequirements() {
  selectedRequirement.value = null
  testCases.value = []
  showAddTCForm.value = false
  editingTCId.value = null
}

// Load Test Cases
async function loadTestCases(requirementId) {
  try {
    tcLoading.value = true
    const res = await testCaseAPI.getTestCases({
      product_id: selectedProduct.value.id,
      requirement_id: requirementId
    })
    testCases.value = res || []
  } catch (err) {
    console.error('Failed to fetch test cases:', err)
  } finally {
    tcLoading.value = false
  }
}

// AI Generate Test Cases
async function generateTestCases() {
  if (!selectedRequirement.value) return
  try {
    generating.value = true
    await testCaseAPI.generateTestCases({
      requirement_id: selectedRequirement.value.id,
      product_id: selectedProduct.value.id
    })
    // Refresh test cases after generation
    await loadTestCases(selectedRequirement.value.id)
  } catch (err) {
    console.error('Failed to generate test cases:', err)
  } finally {
    generating.value = false
  }
}

// Add Test Case
async function addTestCase() {
  if (!newTestCase.value.title.trim()) return
  try {
    const data = {
      ...newTestCase.value,
      product_id: selectedProduct.value.id,
      requirement_id: selectedRequirement.value.id
    }
    const created = await testCaseAPI.createTestCase(data)
    testCases.value.unshift(created)
    resetTCForm()
    showAddTCForm.value = false
  } catch (err) {
    console.error('Failed to add test case:', err)
  }
}

// Start Edit Test Case
function startEditTC(tc) {
  editingTCId.value = tc.id
  editTCForm.value = {
    title: tc.title,
    type: tc.type || '',
    priority: tc.priority || '',
    steps: tc.steps || '',
    expected: tc.expected || ''
  }
}

// Save Test Case Edit
async function saveTestCase(id) {
  if (!editTCForm.value.title.trim()) return
  try {
    const updated = await testCaseAPI.updateTestCase(id, editTCForm.value)
    const idx = testCases.value.findIndex(t => t.id === id)
    if (idx !== -1) testCases.value[idx] = updated
    cancelEditTC()
  } catch (err) {
    console.error('Failed to update test case:', err)
  }
}

// Cancel Edit Test Case
function cancelEditTC() {
  editingTCId.value = null
  editTCForm.value = { title: '', type: '', priority: '', steps: '', expected: '' }
}

// Delete Test Case
async function deleteTestCase(id) {
  if (!confirm('确定要删除这个测试用例吗？')) return
  try {
    await testCaseAPI.deleteTestCase(id)
    testCases.value = testCases.value.filter(t => t.id !== id)
  } catch (err) {
    console.error('Failed to delete test case:', err)
  }
}

// Reset Test Case Form
function resetTCForm() {
  newTestCase.value = { title: '', type: '', priority: '', steps: '', expected: '' }
}

onMounted(loadProducts)
</script>

<style scoped>
/* Page Layout */
.test-case-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px 16px;
  min-height: calc(100vh - 60px);
}

/* Header */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
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
  margin-bottom: 20px;
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

/* Loading & Error & Empty State */
.loading,
.empty-state {
  text-align: center;
  color: var(--text-muted);
  padding: 60px 0;
  font-size: 14px;
}

.error-message {
  text-align: center;
  color: #e74c3c;
  padding: 20px;
  background: rgba(231, 76, 60, 0.08);
  border-radius: var(--radius-md);
  font-size: 14px;
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

/* Products Grid */
.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

/* Product Card */
.product-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  transition: all var(--transition);
  position: relative;
}

.product-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px var(--shadow);
  border-color: var(--accent);
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;
  gap: 8px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.4;
  word-break: break-all;
}

.card-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  width: 28px;
  height: 28px;
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

.action-btn.edit:hover {
  background: rgba(108, 92, 231, 0.2);
  color: var(--accent);
}

.action-btn.delete:hover {
  background: rgba(231, 76, 60, 0.2);
  color: #e74c3c;
}

.card-desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0 0 8px 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-time {
  font-size: 11px;
  color: var(--text-muted);
}

/* Inline Edit Form */
.edit-form {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

/* Slide Transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .test-case-page {
    padding: 16px 12px;
  }

  .page-title {
    font-size: 18px;
  }

  .products-grid {
    grid-template-columns: 1fr;
  }
}

/* Requirements Section */
.requirements-section {
  max-width: 900px;
  margin: 0 auto;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.back-btn {
  padding: 8px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.back-btn:hover {
  color: var(--text-primary);
  border-color: var(--accent);
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  flex: 1;
  min-width: 0;
}

/* Form Row */
.form-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.select-input {
  flex: 1;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 30px;
}

/* Requirements List */
.requirements-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Requirement Item */
.requirement-item {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  transition: all var(--transition);
}

.requirement-item:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 12px var(--shadow);
}

.req-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.req-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.4;
  word-break: break-all;
  flex: 1;
}

.req-badges {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.badge {
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.badge-functional { background: rgba(52, 152, 219, 0.15); color: #2980b9; }
.badge-non-functional { background: rgba(155, 89, 182, 0.15); color: #8e44ad; }
.badge-ui { background: rgba(46, 204, 113, 0.15); color: #27ae60; }
.badge-performance { background: rgba(230, 126, 34, 0.15); color: #d35400; }
.badge-security { background: rgba(231, 76, 60, 0.15); color: #c0392b; }

.badge-high { background: rgba(231, 76, 60, 0.15); color: #c0392b; }
.badge-medium { background: rgba(241, 196, 15, 0.15); color: #f39c12; }
.badge-low { background: rgba(52, 152, 219, 0.15); color: #2980b9; }

.req-desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0 0 8px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.req-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.req-time {
  font-size: 11px;
  color: var(--text-muted);
}

.req-actions {
  display: flex;
  gap: 4px;
}

/* Test Cases Section */
.test-cases-section {
  max-width: 900px;
  margin: 0 auto;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-ai {
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  background: linear-gradient(135deg, #6c5ce7, #a855f7);
  color: #fff;
  white-space: nowrap;
}

.btn-ai:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(108, 92, 231, 0.4);
}

.btn-ai:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ai-loading {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Test Cases List */
.test-cases-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Test Case Item */
.test-case-item {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  transition: all var(--transition);
}

.test-case-item:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 12px var(--shadow);
}

.tc-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.tc-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.4;
  word-break: break-all;
  flex: 1;
}

.tc-badges {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

/* Test Case Type Badges */
.badge-tc-functional { background: rgba(52, 152, 219, 0.15); color: #2980b9; }
.badge-tc-regression { background: rgba(155, 89, 182, 0.15); color: #8e44ad; }
.badge-tc-performance { background: rgba(230, 126, 34, 0.15); color: #d35400; }
.badge-tc-security { background: rgba(231, 76, 60, 0.15); color: #c0392b; }
.badge-tc-ui { background: rgba(46, 204, 113, 0.15); color: #27ae60; }
.badge-tc-api { background: rgba(155, 89, 182, 0.15); color: #8e44ad; }

.tc-content {
  /* non-editing mode content */
}

.tc-section {
  margin-bottom: 10px;
}

.tc-section strong {
  font-size: 13px;
  color: var(--text-secondary);
  display: block;
  margin-bottom: 4px;
}

.tc-steps {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  font-family: inherit;
}

.tc-expected {
  background: rgba(46, 204, 113, 0.08);
  border: 1px solid rgba(46, 204, 113, 0.2);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  margin: 0;
}

.tc-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.tc-time {
  font-size: 11px;
  color: var(--text-muted);
}

.tc-actions {
  display: flex;
  gap: 4px;
}

/* ============================================
   按钮系统全面优化
   ============================================ */

/* 主按钮 - 渐变背景 */
.btn-primary {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
  position: relative;
  overflow: hidden;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}

/* 次按钮 - 描边风格 */
.btn-cancel,
.btn-outline {
  background: #fff;
  color: #4b5563;
  border: 1px solid #d1d5db;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.btn-cancel:hover,
.btn-outline:hover {
  border-color: #6366f1;
  color: #6366f1;
  background: #f5f3ff;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
}

/* 文字按钮 */
.btn-text {
  background: transparent;
  color: #6366f1;
  border: none;
  padding: 8px 12px;
}

.btn-text:hover {
  background: #f5f3ff;
}

/* 危险按钮（删除） */
.btn-danger {
  background: linear-gradient(135deg, #ef4444, #f87171);
  color: #fff;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
}

.btn-danger:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
}

/* 成功按钮 */
.btn-success {
  background: linear-gradient(135deg, #10b981, #34d399);
  color: #fff;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.btn-success:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4);
}

/* 图标按钮增强 */
.action-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  background: #f3f4f6;
  color: #6b7280;
}

.action-btn:hover {
  transform: scale(1.12);
}

.action-btn.edit:hover {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
}

.action-btn.delete:hover {
  background: linear-gradient(135deg, #ef4444, #f87171);
  color: #fff;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
}

.action-btn.save:hover {
  background: linear-gradient(135deg, #10b981, #34d399);
  color: #fff;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
}

.action-btn.export:hover {
  background: linear-gradient(135deg, #3b82f6, #60a5fa);
  color: #fff;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
}

.action-btn.cancel:hover {
  background: #e5e7eb;
  color: #4b5563;
}

/* ============================================
   表单元素优化
   ============================================ */

/* 输入框 */
.form-input {
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  color: #1f2937;
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.form-input::placeholder {
  color: #9ca3af;
}

/* 下拉框 */
.select-input,
.product-select {
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 36px 8px 12px;
  font-size: 14px;
  color: #1f2937;
  outline: none;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  transition: all 0.2s;
}

.select-input:focus,
.product-select:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.product-select:hover {
  border-color: #9ca3af;
}

/* 文本域 */
.desc-input,
.requirement-textarea {
  resize: vertical;
  min-height: 80px;
  line-height: 1.6;
}

/* ============================================
   导航栏和工具栏优化
   ============================================ */

.nav-bar {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 12px;
  margin-bottom: 16px;
  box-shadow: 0 4px 16px rgba(79, 70, 229, 0.2);
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-bar .page-title {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.help-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.nav-bar .btn-outline {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.nav-bar .btn-outline:hover {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.5);
}

/* 工具栏 */
.toolbar {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar .btn-outline {
  font-size: 13px;
  padding: 8px 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ============================================
   弹窗优化
   ============================================ */

.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal-container {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  border: 1px solid #e5e7eb;
}

.modal-header {
  border-bottom: 1px solid #e5e7eb;
  padding: 16px 20px;
}

.modal-header h3 {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  border-top: 1px solid #e5e7eb;
  padding: 16px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 弹窗表单组 */
.modal-form-group {
  margin-bottom: 16px;
}

.modal-form-group:last-child {
  margin-bottom: 0;
}

.modal-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}

.modal-input,
.modal-textarea {
  width: 100%;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  color: #1f2937;
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;
}

.modal-input:focus,
.modal-textarea:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.modal-textarea {
  resize: vertical;
  min-height: 80px;
}

/* 产品列表项（弹窗内） */
.modal-product-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 8px;
}

.modal-product-item:last-child {
  margin-bottom: 0;
}

.modal-product-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.modal-product-time {
  font-size: 12px;
  color: #9ca3af;
  margin-left: 8px;
}

/* 导出格式选择 */
.export-format-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
}

.export-format-option:hover {
  border-color: #6366f1;
  background: #f5f3ff;
}

.export-format-option.selected {
  border-color: #6366f1;
  background: #f5f3ff;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.format-radio {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #d1d5db;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.export-format-option.selected .format-radio {
  border-color: #6366f1;
}

.format-radio::after {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6366f1;
  opacity: 0;
  transition: opacity 0.2s;
}

.export-format-option.selected .format-radio::after {
  opacity: 1;
}

.format-label {
  font-size: 14px;
  color: #1f2937;
}

.format-desc {
  font-size: 12px;
  color: #9ca3af;
  margin-left: auto;
}

</style>
