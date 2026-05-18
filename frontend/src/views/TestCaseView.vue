<template>
  <div class="test-case-page">
    <!-- Header -->
    <div class="page-header">
      <h2 class="page-title">📝 测试用例生成工具</h2>
      <div class="header-actions">
        <!-- 产品选择下拉 -->
        <select 
          v-if="products.length > 0 && !selectedProduct" 
          v-model="selectedProductId" 
          class="product-select-header" 
          @change="onProductSelect"
          title="选择产品"
        >
          <option value="">全部产品</option>
          <option v-for="p in products" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select>
        <button 
          v-if="products.length > 0" 
          class="export-header-btn" 
          @click="showExportModal = true" 
          title="导出测试用例"
        >
          <span class="export-icon">📥</span>
          导出
        </button>
        <button class="add-btn" @click="showAddForm = !showAddForm" title="添加产品">
          <span class="add-icon">+</span>
        </button>
      </div>
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

    <!-- Requirements Management Section - Dual Column Layout -->
    <div v-else class="requirements-section">
      <!-- Section Header -->
      <div class="section-header">
        <button class="back-btn" @click="backToProducts">
          ← 返回产品列表
        </button>
        <h3 class="section-title">📋 {{ selectedProduct.name }}</h3>
        <button class="add-btn" @click="openAddReqModal" title="添加需求">
          <span class="add-icon">+</span>
        </button>
      </div>

      <!-- Requirements Loading -->
      <div v-if="reqLoading" class="loading">加载中...</div>

      <!-- Requirements Empty State -->
      <div v-else-if="requirements.length === 0" class="empty-state">
        <span class="empty-icon">📝</span>
        <p>暂无需求</p>
      </div>

      <!-- Dual Column Layout: Left=Requirements, Right=Test Cases -->
      <div v-else class="dual-column-layout">
        <!-- Left Column: Requirements List -->
        <div class="left-column">
          <div class="column-header">
            <h4>需求列表</h4>
            <span class="count-badge">{{ requirements.length }}</span>
          </div>
          <div class="requirements-list">
            <div 
              v-for="req in requirements" 
              :key="req.id"
              class="requirement-item"
              :class="{ active: selectedRequirement && selectedRequirement.id === req.id }"
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
                <div class="req-actions" @click.stop>
                  <button 
                    class="action-btn edit" 
                    @click="startEditReq(req)" 
                    title="编辑"
                  >
                    ✎
                  </button>
                  <button 
                    class="action-btn delete" 
                    @click="deleteRequirement(req.id)" 
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column: Test Cases -->
        <div class="right-column">
          <div class="column-header">
            <h4 v-if="selectedRequirement">{{ selectedRequirement.title }} - 测试用例</h4>
            <h4 v-else>测试用例</h4>
            <div class="column-actions" v-if="selectedRequirement">
              <button 
                class="btn btn-ai btn-sm" 
                @click="generateTestCases" 
                :disabled="generating"
                title="AI生成测试用例"
              >
                <span v-if="generating">⏳</span>
                <span v-else>🤖</span>
              </button>
              <button class="add-btn add-btn-sm" @click="showAddTCForm = true" title="添加测试用例">
                <span class="add-icon">+</span>
              </button>
            </div>
          </div>

          <!-- No requirement selected -->
          <div v-if="!selectedRequirement" class="no-selection-prompt">
            <span class="prompt-icon">👈</span>
            <p>请从左侧选择一个需求</p>
          </div>

          <!-- Add Test Case Form -->
          <div v-else-if="showAddTCForm" class="add-form compact" transition="slide">
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
                  :disabled="!newTestCase.title.trim()"
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

          <!-- Test Cases Loading -->
          <div v-else-if="tcLoading" class="loading">加载中...</div>

          <!-- Test Cases Empty State -->
          <div v-else-if="testCases.length === 0" class="empty-state compact">
            <span class="empty-icon">🧪</span>
            <p>暂无测试用例</p>
            <button class="btn btn-ai btn-sm" @click="generateTestCases" :disabled="generating">
              <span v-if="generating">⏳ 生成中...</span>
              <span v-else>🤖 AI 生成</span>
            </button>
          </div>

          <!-- Test Cases Table (8 columns) -->
          <div v-else class="tc-table-wrapper">
            <table class="tc-table">
              <thead>
                <tr>
                  <th class="col-seq">序列</th>
                  <th class="col-title">用例名</th>
                  <th class="col-precondition">前提条件</th>
                  <th class="col-steps">操作步骤</th>
                  <th class="col-expected">预期结果</th>
                  <th class="col-actual">实际结果</th>
                  <th class="col-pass">是否通过</th>
                  <th class="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="(tc, index) in testCases" 
                  :key="tc.id"
                  :class="{ 'editing-row': editingTCId === tc.id }"
                >
                  <!-- 查看模式 -->
                  <template>
                    <td class="col-seq">{{ index + 1 }}</td>
                    <td class="col-title">
                      <div class="cell-content">
                        <span class="tc-title-text">{{ tc.title }}</span>
                        <div class="tc-badges-compact">
                          <span class="badge badge-sm" :class="'badge-tc-' + tc.type">{{ getTCTypeLabel(tc.type) }}</span>
                          <span class="badge badge-sm" :class="'badge-' + tc.priority">{{ getTCPriorityLabel(tc.priority) }}</span>
                        </div>
                      </div>
                    </td>
                    <td class="col-precondition">
                      <div class="cell-content ellipsis" :title="tc.precondition || '—'">
                        {{ tc.precondition || '—' }}
                      </div>
                    </td>
                    <td class="col-steps">
                      <div class="cell-content expandable" @click="toggleExpand(tc.id, 'steps')">
                        <span :class="{ 'expanded': expandedCells[tc.id + '-steps'] }">
                          {{ tc.steps || '—' }}
                        </span>
                        <span v-if="tc.steps && tc.steps.length > 30" class="expand-hint">
                          {{ expandedCells[tc.id + '-steps'] ? ' 收起' : ' ...' }}
                        </span>
                      </div>
                    </td>
                    <td class="col-expected">
                      <div class="cell-content expandable" @click="toggleExpand(tc.id, 'expected')">
                        <span :class="{ 'expanded': expandedCells[tc.id + '-expected'] }">
                          {{ tc.expected || '—' }}
                        </span>
                        <span v-if="tc.expected && tc.expected.length > 30" class="expand-hint">
                          {{ expandedCells[tc.id + '-expected'] ? ' 收起' : ' ...' }}
                        </span>
                      </div>
                    </td>
                    <td class="col-actual">
                      <div class="cell-content expandable" @click="toggleExpand(tc.id, 'actual')">
                        <span :class="{ 'expanded': expandedCells[tc.id + '-actual'] }">
                          {{ tc.actual || '—' }}
                        </span>
                        <span v-if="tc.actual && tc.actual.length > 30" class="expand-hint">
                          {{ expandedCells[tc.id + '-actual'] ? ' 收起' : ' ...' }}
                        </span>
                      </div>
                    </td>
                    <td class="col-pass">
                      <button 
                        class="pass-toggle" 
                        :class="tc.passed ? 'passed' : 'not-passed'"
                        @click="togglePass(tc)"
                        :title="tc.passed ? '点击标记为不通过' : '点击标记为通过'"
                      >
                        <span class="toggle-indicator"></span>
                        <span class="toggle-label">{{ tc.passed ? '通过' : '不通过' }}</span>
                      </button>
                    </td>
                    <td class="col-actions">
                      <div class="action-buttons">
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
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- 导出弹窗 -->
    <transition name="fade">
      <div v-if="showExportModal" class="modal-overlay" @click.self="closeExportModal">
        <div class="modal-container export-modal">
          <div class="modal-header">
            <h3>📥 导出测试用例</h3>
            <button class="modal-close" @click="closeExportModal" title="关闭">✕</button>
          </div>
          <div class="modal-body">
            <!-- 导出格式选择 -->
            <div class="modal-form-group">
              <label class="modal-label">导出格式</label>
              <div class="export-options">
                <div 
                  v-for="fmt in exportFormats" 
                  :key="fmt.value"
                  class="export-format-option"
                  :class="{ selected: exportForm.format === fmt.value }"
                  @click="exportForm.format = fmt.value"
                >
                  <div class="format-radio-wrapper">
                    <div class="format-radio">
                      <span v-if="exportForm.format === fmt.value" class="radio-dot"></span>
                    </div>
                  </div>
                  <div class="format-info">
                    <span class="format-label">{{ fmt.label }}</span>
                    <span class="format-desc">{{ fmt.desc }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 导出范围选择 -->
            <div class="modal-form-group">
              <label class="modal-label">导出范围</label>
              <div class="export-scope-options">
                <label class="scope-radio">
                  <input 
                    type="radio" 
                    v-model="exportForm.scope" 
                    value="all"
                  />
                  <span class="scope-label">全部用例</span>
                  <span class="scope-desc">导出所有产品和需求的测试用例</span>
                </label>
                <label class="scope-radio" v-if="selectedProduct">
                  <input 
                    type="radio" 
                    v-model="exportForm.scope" 
                    value="product"
                  />
                  <span class="scope-label">当前产品用例</span>
                  <span class="scope-desc">仅导出「{{ selectedProduct.name }}」的测试用例</span>
                </label>
                <label class="scope-radio" v-if="selectedRequirement">
                  <input 
                    type="radio" 
                    v-model="exportForm.scope" 
                    value="requirement"
                  />
                  <span class="scope-label">当前需求用例</span>
                  <span class="scope-desc">仅导出「{{ selectedRequirement.title }}」的测试用例</span>
                </label>
              </div>
            </div>

            <!-- 包含字段选择 -->
            <div class="modal-form-group">
              <label class="modal-label">包含字段</label>
              <div class="export-fields-grid">
                <label 
                  v-for="field in exportFields" 
                  :key="field.key"
                  class="field-checkbox"
                >
                  <input 
                    type="checkbox" 
                    v-model="exportForm.fields" 
                    :value="field.key"
                  />
                  <span class="checkbox-mark">
                    <svg v-if="exportForm.fields.includes(field.key)" viewBox="0 0 12 10">
                      <polyline points="1.5 6 4.5 9 10.5 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                  <span class="field-label">{{ field.label }}</span>
                </label>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-cancel" @click="closeExportModal">取消</button>
            <button 
              class="btn btn-primary" 
              @click="handleExport" 
              :disabled="exporting || exportForm.fields.length === 0"
            >
              <span v-if="exporting">⏳ 导出中...</span>
              <span v-else>✅ 确认导出</span>
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 测试用例编辑弹窗 -->
    <transition name="fade">
      <div v-if="showEditTCModal" class="modal-overlay" @click.self="cancelEditTC">
        <div class="modal-container tc-edit-modal">
          <div class="modal-header">
            <h3>编辑测试用例</h3>
            <button class="modal-close" @click="cancelEditTC" title="关闭">✕</button>
          </div>
          <div class="modal-body">
            <div class="modal-form-group">
              <label class="modal-label">用例名 *</label>
              <input 
                v-model="editTCForm.title" 
                class="modal-input" 
                placeholder="测试用例标题"
              />
            </div>
            <div class="modal-form-group">
              <label class="modal-label">前提条件</label>
              <input 
                v-model="editTCForm.precondition" 
                class="modal-input" 
                placeholder="前提条件（可选）"
              />
            </div>
            <div class="modal-form-group">
              <label class="modal-label">操作步骤</label>
              <textarea 
                v-model="editTCForm.steps" 
                class="modal-textarea" 
                placeholder="测试步骤（每行一个步骤）" 
                rows="4"
              ></textarea>
            </div>
            <div class="modal-form-group">
              <label class="modal-label">预期结果</label>
              <textarea 
                v-model="editTCForm.expected" 
                class="modal-textarea" 
                placeholder="期望结果" 
                rows="3"
              ></textarea>
            </div>
            <div class="modal-form-group">
              <label class="modal-label">实际结果</label>
              <textarea 
                v-model="editTCForm.actual" 
                class="modal-textarea" 
                placeholder="实际结果（可选）" 
                rows="3"
              ></textarea>
            </div>
            <div class="modal-form-row">
              <div class="modal-form-group half">
                <label class="modal-label">类型</label>
                <select v-model="editTCForm.type" class="modal-input select-input">
                  <option value="">选择类型</option>
                  <option v-for="type in tcTypes" :key="type.value" :value="type.value">
                    {{ type.label }}
                  </option>
                </select>
              </div>
              <div class="modal-form-group half">
                <label class="modal-label">优先级</label>
                <select v-model="editTCForm.priority" class="modal-input select-input">
                  <option value="">选择优先级</option>
                  <option v-for="p in tcPriorities" :key="p.value" :value="p.value">
                    {{ p.label }}
                  </option>
                </select>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-cancel" @click="cancelEditTC">取消</button>
            <button class="btn btn-primary" @click="saveTestCase(editingTCId)" :disabled="!editTCForm.title.trim()">保存</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 需求添加/编辑弹窗 -->
    <transition name="fade">
      <div v-if="showReqModal" class="modal-overlay" @click.self="closeReqModal">
        <div class="modal-container req-modal">
          <div class="modal-header">
            <h3>{{ editingReqId ? '编辑需求' : '添加需求' }}</h3>
            <button class="modal-close" @click="closeReqModal" title="关闭">✕</button>
          </div>
          <div class="modal-body">
            <div class="modal-form-group">
              <label class="modal-label">需求标题 *</label>
              <input 
                v-model="reqModalForm.title" 
                class="modal-input" 
                placeholder="输入需求标题"
              />
            </div>
            <div class="modal-form-group">
              <label class="modal-label">需求描述</label>
              <textarea 
                v-model="reqModalForm.description" 
                class="modal-textarea" 
                placeholder="描述需求详情（可选）" 
                rows="3"
              ></textarea>
            </div>
            <div class="modal-form-row">
              <div class="modal-form-group half">
                <label class="modal-label">类型</label>
                <select v-model="reqModalForm.type" class="modal-input select-input">
                  <option value="">选择类型</option>
                  <option v-for="t in reqTypes" :key="t.value" :value="t.value">
                    {{ t.label }}
                  </option>
                </select>
              </div>
              <div class="modal-form-group half">
                <label class="modal-label">优先级</label>
                <select v-model="reqModalForm.priority" class="modal-input select-input">
                  <option value="">选择优先级</option>
                  <option v-for="p in priorities" :key="p.value" :value="p.value">
                    {{ p.label }}
                  </option>
                </select>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-cancel" @click="closeReqModal">取消</button>
            <button class="btn btn-primary" @click="confirmReqAction" :disabled="!reqModalForm.title.trim()">保存</button>
          </div>
        </div>
      </div>
    </transition>
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
const selectedProductId = ref('')
const requirements = ref([])
const reqLoading = ref(false)
const showAddReqForm = ref(false)
const editingReqId = ref(null)
const showReqModal = ref(false)

// New Requirement Form
const newRequirement = ref({ title: '', description: '', type: '', priority: '' })

// Edit Requirement Form
const editReqForm = ref({ title: '', description: '', type: '', priority: '' })

// Requirement Modal Form
const reqModalForm = ref({ title: '', description: '', type: '', priority: '' })

// Test Cases State
const selectedRequirement = ref(null)
const testCases = ref([])
const tcLoading = ref(false)
const generating = ref(false)
const showAddTCForm = ref(false)
const showEditTCModal = ref(false)
const expandedCells = ref({})

// New Test Case Form
const newTestCase = ref({ title: '', type: '', priority: '', steps: '', expected: '', precondition: '', actual: '' })

// Edit Test Case Form
const editTCForm = ref({ title: '', type: '', priority: '', steps: '', expected: '', precondition: '', actual: '' })
const editingTCId = ref(null) // 保留用于标识正在编辑的用例ID

// Export Modal State
const showExportModal = ref(false)
const exporting = ref(false)

const exportForm = ref({
  format: 'excel',
  scope: 'all',
  fields: ['title', 'precondition', 'steps', 'expected', 'actual', 'passed']
})

const exportFormats = [
  { value: 'excel', label: 'Excel (.xlsx)', desc: '推荐，保留格式' },
  { value: 'csv', label: 'CSV (.csv)', desc: '通用表格格式' },
  { value: 'json', label: 'JSON (.json)', desc: '结构化数据' },
  { value: 'pdf', label: 'PDF (.pdf)', desc: '不可编辑，适合打印' }
]

const exportFields = [
  { key: 'title', label: '用例名' },
  { key: 'precondition', label: '前提条件' },
  { key: 'steps', label: '操作步骤' },
  { key: 'expected', label: '预期结果' },
  { key: 'actual', label: '实际结果' },
  { key: 'passed', label: '是否通过' },
  { key: 'type', label: '类型' },
  { key: 'priority', label: '优先级' }
]

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
  selectedProductId.value = ''
  requirements.value = []
  showAddReqForm.value = false
  editingReqId.value = null
}

// Product Select Handler
function onProductSelect() {
  if (selectedProductId.value) {
    const product = products.value.find(p => p.id === selectedProductId.value)
    if (product) selectProduct(product)
  }
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

// Open Add Requirement Modal
function openAddReqModal() {
  editingReqId.value = null
  reqModalForm.value = { title: '', description: '', type: '', priority: '' }
  showReqModal.value = true
}

// Close Requirement Modal
function closeReqModal() {
  showReqModal.value = false
  editingReqId.value = null
  reqModalForm.value = { title: '', description: '', type: '', priority: '' }
}

// Confirm Requirement Action (Add or Edit)
async function confirmReqAction() {
  if (!reqModalForm.value.title.trim()) return
  try {
    const data = {
      title: reqModalForm.value.title,
      description: reqModalForm.value.description,
      type: reqModalForm.value.type,
      priority: reqModalForm.value.priority,
      productId: selectedProduct.value.id
    }
    if (editingReqId.value) {
      // Edit existing
      const updated = await testCaseAPI.updateRequirement(editingReqId.value, data)
      const idx = requirements.value.findIndex(r => r.id === editingReqId.value)
      if (idx !== -1) requirements.value[idx] = updated
    } else {
      // Add new
      const created = await testCaseAPI.createRequirement(data)
      requirements.value.unshift(created)
    }
    closeReqModal()
  } catch (err) {
    console.error('Failed to save requirement:', err)
  }
}

// Start Edit Requirement - Open Modal
function startEditReq(req) {
  editingReqId.value = req.id
  reqModalForm.value = {
    title: req.title,
    description: req.description || '',
    type: req.type || '',
    priority: req.priority || ''
  }
  showReqModal.value = true
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

// Select Requirement - Show Test Cases (click to switch or refresh)
function selectRequirement(req) {
  selectedRequirement.value = req
  loadTestCases(req.id)
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
  if (!newTestCase.title.trim()) return
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

// Start Edit Test Case - 打开弹窗
function startEditTC(tc) {
  editingTCId.value = tc.id
  editTCForm.value = {
    title: tc.title,
    type: tc.type || '',
    priority: tc.priority || '',
    steps: tc.steps || '',
    expected: tc.expected || '',
    precondition: tc.precondition || '',
    actual: tc.actual || ''
  }
  showEditTCModal.value = true
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

// Cancel Edit Test Case - 关闭弹窗
function cancelEditTC() {
  showEditTCModal.value = false
  editingTCId.value = null
  editTCForm.value = { title: '', type: '', priority: '', steps: '', expected: '', precondition: '', actual: '' }
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
  newTestCase.value = { title: '', type: '', priority: '', steps: '', expected: '', precondition: '', actual: '' }
}

// Toggle cell expand/collapse
function toggleExpand(tcId, field) {
  const key = tcId + '-' + field
  expandedCells.value[key] = !expandedCells.value[key]
}

// Toggle pass status
async function togglePass(tc) {
  const newStatus = !tc.passed
  try {
    const updated = await testCaseAPI.updateTestCase(tc.id, { passed: newStatus })
    const idx = testCases.value.findIndex(t => t.id === tc.id)
    if (idx !== -1) testCases.value[idx] = updated
  } catch (err) {
    console.error('Failed to toggle pass status:', err)
  }
}

// Export Modal
function closeExportModal() {
  showExportModal.value = false
  exportForm.value = {
    format: 'excel',
    scope: 'all',
    fields: ['title', 'precondition', 'steps', 'expected', 'actual', 'passed']
  }
}

// Handle Export
async function handleExport() {
  if (exportForm.value.fields.length === 0) return
  
  try {
    exporting.value = true
    
    // Build params
    const params = {
      format: exportForm.value.format,
      scope: exportForm.value.scope,
      fields: exportForm.value.fields.join(','),
      ...(exportForm.value.scope === 'product' && selectedProduct.value ? { product_id: selectedProduct.value.id } : {}),
      ...(exportForm.value.scope === 'requirement' && selectedRequirement.value ? { requirement_id: selectedRequirement.value.id } : {})
    }
    
    // 前端生成文件下载（不依赖后端 API，直接在前端处理）
    await generateExportFile(params)
    
    closeExportModal()
  } catch (err) {
    console.error('Export failed:', err)
    alert('导出失败：' + (err.message || '未知错误'))
  } finally {
    exporting.value = false
  }
}

// Generate export file on frontend
async function generateExportFile(params) {
  // Collect test cases based on scope
  let dataToExport = []
  
  if (params.scope === 'all') {
    // Export all products -> requirements -> test cases
    for (const product of products.value) {
      const reqs = await testCaseAPI.getRequirements(product.id)
      for (const req of (reqs || [])) {
        const tcs = await testCaseAPI.getTestCases({ product_id: product.id, requirement_id: req.id })
        for (const tc of (tcs || [])) {
          dataToExport.push({
            ...tc,
            productName: product.name,
            requirementTitle: req.title
          })
        }
      }
    }
  } else if (params.scope === 'product' && selectedProduct.value) {
    const reqs = await testCaseAPI.getRequirements(selectedProduct.value.id)
    for (const req of (reqs || [])) {
      const tcs = await testCaseAPI.getTestCases({ product_id: selectedProduct.value.id, requirement_id: req.id })
      for (const tc of (tcs || [])) {
        dataToExport.push({
          ...tc,
          productName: selectedProduct.value.name,
          requirementTitle: req.title
        })
      }
    }
  } else if (params.scope === 'requirement' && selectedRequirement.value) {
    dataToExport = (testCases.value || []).map(tc => ({
      ...tc,
      productName: selectedProduct.value?.name || '',
      requirementTitle: selectedRequirement.value.title
    }))
  }
  
  if (dataToExport.length === 0) {
    alert('当前范围内没有测试用例可导出')
    return
  }
  
  // Filter fields
  const fields = params.fields.split(',')
  const fieldLabels = {
    productName: '产品名称',
    requirementTitle: '需求标题',
    title: '用例名',
    precondition: '前提条件',
    steps: '操作步骤',
    expected: '预期结果',
    actual: '实际结果',
    passed: '是否通过',
    type: '类型',
    priority: '优先级'
  }
  
  const filteredData = dataToExport.map(tc => {
    const row = {}
    fields.forEach(f => {
      let val = tc[f] !== undefined ? tc[f] : ''
      if (f === 'passed') val = val ? '通过' : '不通过'
      if (f === 'type') val = getTCTypeLabel(val) || ''
      if (f === 'priority') val = getTCPriorityLabel(val) || ''
      row[fieldLabels[f] || f] = val
    })
    return row
  })
  
  const filename = `测试用例_${new Date().toISOString().slice(0, 10)}`
  
  switch (params.format) {
    case 'csv':
      downloadCSV(filteredData, filename)
      break
    case 'json':
      downloadJSON(filteredData, filename)
      break
    case 'excel':
      downloadExcel(filteredData, filename)
      break
    case 'pdf':
      downloadPDF(filteredData, filename)
      break
    default:
      downloadCSV(filteredData, filename)
  }
}

function downloadCSV(data, filename) {
  if (data.length === 0) return
  const headers = Object.keys(data[0])
  const csvContent = [
    '\uFEFF' + headers.join(','), // BOM for Excel compatibility
    ...data.map(row => headers.map(h => {
      const val = String(row[h] || '').replace(/"/g, '""')
      return `"${val}"`
    }).join(','))
  ].join('\n')
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename + '.csv')
}

function downloadJSON(data, filename) {
  const jsonContent = JSON.stringify(data, null, 2)
  const blob = new Blob(['\uFEFF' + jsonContent], { type: 'application/json;charset=utf-8;' })
  triggerDownload(blob, filename + '.json')
}

function downloadExcel(data, filename) {
  // Generate a simple XML-based spreadsheet (SpreadsheetML) that Excel can open
  // This avoids needing external libraries like xlsx
  if (data.length === 0) return
  const headers = Object.keys(data[0])
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += '<?mso-application progid="Excel.Sheet"?>\n'
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n'
  xml += '  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n'
  xml += '  <Worksheet ss:Name="测试用例">\n'
  xml += '    <Table>\n'
  
  // Header row
  xml += '      <Row>\n'
  headers.forEach(h => {
    xml += `        <Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>\n`
  })
  xml += '      </Row>\n'
  
  // Data rows
  data.forEach(row => {
    xml += '      <Row>\n'
    headers.forEach(h => {
      const val = row[h] !== undefined ? String(row[h]) : ''
      xml += `        <Cell><Data ss:Type="String">${escapeXml(val)}</Data></Cell>\n`
    })
    xml += '      </Row>\n'
  })
  
  xml += '    </Table>\n'
  xml += '  </Worksheet>\n'
  xml += '</Workbook>'
  
  const blob = new Blob(['\uFEFF' + xml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  triggerDownload(blob, filename + '.xls')
}

function downloadPDF(data, filename) {
  // Generate a simple HTML-based printable page and trigger print/save as PDF
  // For a more robust PDF, a library like jsPDF would be needed
  const headers = Object.keys(data[0])
  
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${filename}</title>`
  html += `<style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #333; }
    h1 { text-align: center; font-size: 18px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f5f3ff; padding: 8px 12px; border: 1px solid #ddd; font-weight: 600; text-align: left; }
    td { padding: 6px 12px; border: 1px solid #ddd; vertical-align: top; }
    tr:nth-child(even) { background: #fafafa; }
    @media print { body { padding: 20px; } }
  </style></head><body>`
  html += `<h1>测试用例导出 - ${new Date().toLocaleDateString('zh-CN')}</h1>`
  html += '<table><thead><tr>'
  headers.forEach(h => { html += `<th>${h}</th>` })
  html += '</tr></thead><tbody>'
  data.forEach(row => {
    html += '<tr>'
    headers.forEach(h => { html += `<td>${escapeHtml(String(row[h] || ''))}</td>` })
    html += '</tr>'
  })
  html += '</tbody></table>'
  html += '</body></html>'
  
  const blob = new Blob(['\uFEFF' + html], { type: 'text/html;charset=utf-8;' })
  triggerDownload(blob, filename + '.html')
  
  // Note: For true PDF, user can open HTML and print to PDF
  // Alternatively, we could use a canvas-based approach
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.export-header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #3b82f6, #60a5fa);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.export-header-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);
}

/* Product Select in Header */
.product-select-header {
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 36px 8px 12px;
  font-size: 13px;
  color: #1f2937;
  outline: none;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  transition: all 0.2s;
  max-width: 180px;
}

.product-select-header:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.product-select-header:hover {
  border-color: #9ca3af;
}

.export-icon {
  font-size: 15px;
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


/* ============================================
   双栏布局样式 (阶段3)
   ============================================ */

/* Dual Column Layout Container */
.dual-column-layout {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 16px;
  min-height: 500px;
}

/* Column Headers */
.column-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 10px;
}

.column-header h4 {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin: 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.column-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* Left Column - Requirements */
.left-column {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  overflow-y: auto;
  max-height: calc(100vh - 240px);
}

.left-column .requirements-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Requirement Item - Dual Column Mode */
.left-column .requirement-item {
  padding: 10px;
  cursor: pointer;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  transition: all 0.2s;
}

.left-column .requirement-item:hover {
  border-color: #6366f1;
  background: #f5f3ff;
}

.left-column .requirement-item.active {
  border-color: #6366f1;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(139, 92, 246, 0.12));
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
}

.left-column .requirement-item .req-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.left-column .requirement-item .req-desc {
  font-size: 11px;
  color: #6b7280;
  margin: 4px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.left-column .requirement-item .req-badges .badge {
  font-size: 9px;
  padding: 1px 5px;
}

.left-column .requirement-item .req-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 11px;
}

.left-column .requirement-item .req-actions {
  gap: 2px;
}

.left-column .requirement-item .action-btn {
  width: 22px;
  height: 22px;
  font-size: 11px;
}

/* Right Column - Test Cases */
.right-column {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  overflow-y: auto;
  max-height: calc(100vh - 240px);
}

/* No Selection Prompt */
.no-selection-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 180px;
  color: #9ca3af;
  text-align: center;
}

.no-selection-prompt .prompt-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.no-selection-prompt p {
  font-size: 13px;
  margin: 0;
}

/* Compact Empty State */
.empty-state.compact {
  padding: 24px 0;
}

.empty-state.compact .empty-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.empty-state.compact p {
  font-size: 12px;
}

/* Small AI Button */
.btn-ai.btn-sm {
  padding: 5px 8px;
  font-size: 14px;
  border-radius: 6px;
}

/* Small Add Button */
.add-btn-sm {
  width: 26px;
  height: 26px;
  font-size: 16px;
  border-radius: 50%;
}

/* Compact Add Form */
.add-form.compact {
  padding: 12px;
  margin-bottom: 12px;
  font-size: 12px;
}

.add-form.compact .title-input {
  font-size: 13px;
  margin-bottom: 6px;
}

.add-form.compact .desc-input {
  font-size: 12px;
  min-height: 30px;
  margin-bottom: 6px;
}

.add-form.compact .form-row {
  gap: 6px;
  margin-bottom: 6px;
}

.add-form.compact .form-input {
  font-size: 12px;
  padding: 7px 10px;
}

.add-form.compact .form-actions {
  gap: 6px;
}

.add-form.compact .btn {
  padding: 6px 14px;
  font-size: 12px;
}

/* Compact Test Cases List */
.test-cases-list.compact {
  gap: 8px;
}

.test-cases-list.compact .test-case-item {
  padding: 10px;
}

.test-cases-list.compact .tc-title {
  font-size: 13px;
}

.test-cases-list.compact .tc-badges .badge {
  font-size: 9px;
  padding: 1px 5px;
}

.test-cases-list.compact .tc-steps,
.test-cases-list.compact .tc-expected {
  font-size: 11px;
  padding: 6px 8px;
}

.test-cases-list.compact .tc-section strong {
  font-size: 11px;
}

.test-cases-list.compact .tc-footer {
  margin-top: 8px;
  padding-top: 8px;
}

.test-cases-list.compact .tc-time {
  font-size: 10px;
}

/* Compact Edit Form */
.test-cases-list.compact .edit-form {
  margin-top: 8px;
  padding-top: 8px;
}

/* ============================================
   测试用例表格样式 (阶段4)
   ============================================ */

.tc-table-wrapper {
  overflow-x: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}

.tc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.tc-table thead th {
  background: #f9fafb;
  color: #374151;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  padding: 10px 12px;
  text-align: left;
  border-bottom: 2px solid #e5e7eb;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
}

.tc-table tbody td {
  padding: 10px 12px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: top;
}

.tc-table tbody tr:hover {
  background: #f9fafb;
}

.tc-table tbody tr.editing-row {
  background: #f5f3ff;
}

/* Column widths */
.col-seq { width: 50px; text-align: center; }
.col-title { width: 160px; min-width: 120px; }
.col-precondition { width: 120px; min-width: 100px; }
.col-steps { min-width: 160px; }
.col-expected { min-width: 160px; }
.col-actual { min-width: 140px; }
.col-pass { width: 90px; text-align: center; }
.col-actions { width: 80px; text-align: center; }

.cell-content {
  line-height: 1.5;
  color: #1f2937;
}

.cell-content.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.cell-content.expandable {
  cursor: pointer;
  user-select: none;
}

.cell-content.expandable .expanded {
  white-space: pre-wrap;
  word-break: break-word;
}

.cell-content.expandable:not(:has(.expanded)) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 250px;
}

.expand-hint {
  color: #6366f1;
  font-size: 11px;
  font-weight: 600;
}

/* Compact badges in table */
.tc-badges-compact {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.badge-sm {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 10px;
}

.tc-title-text {
  font-weight: 600;
  color: #1f2937;
}

/* Pass toggle button */
.pass-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  border: none;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
}

.pass-toggle.passed {
  background: rgba(16, 185, 129, 0.15);
  color: #059669;
}

.pass-toggle.not-passed {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.pass-toggle:hover {
  transform: scale(1.05);
}

.pass-toggle.passed:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}

.toggle-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.toggle-label {
  white-space: nowrap;
}

/* Action buttons in table */
.action-buttons {
  display: flex;
  gap: 4px;
  justify-content: center;
}

/* Edit cell (full row edit mode) */
.edit-cell {
  padding: 16px !important;
  background: #f5f3ff !important;
}

.tc-edit-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.tc-edit-form .edit-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tc-edit-form .edit-row label {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.tc-edit-form .edit-row .form-input {
  font-size: 13px;
}

.tc-edit-form .edit-row .desc-input {
  min-height: 50px;
  font-size: 12px;
}

.tc-edit-form .edit-row .form-row {
  gap: 8px;
}

.tc-edit-form .edit-actions {
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}

.tc-edit-form .btn {
  padding: 6px 16px;
  font-size: 12px;
}

/* Empty cell placeholder */
td .cell-content:has(span:first-child) span:first-child {
  color: #9ca3af;
}

/* Responsive: Stack edit form on narrow screens */
@media (max-width: 768px) {
  .tc-edit-form {
    grid-template-columns: 1fr;
  }

  .tc-table {
    font-size: 12px;
  }

  .tc-table thead th,
  .tc-table tbody td {
    padding: 8px 6px;
  }
}

/* Responsive: Stack columns on narrow screens */
@media (max-width: 900px) {
  .dual-column-layout {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .left-column,
  .right-column {
    max-height: 300px;
  }
}

@media (max-width: 600px) {
  .dual-column-layout {
    gap: 12px;
  }

  .left-column,
  .right-column {
    max-height: 250px;
    padding: 10px;
  }

  .column-header h4 {
    font-size: 12px;
  }
}

/* ============================================
   弹窗样式（阶段5）
   ============================================ */

/* Fade transition for modal */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Modal Overlay */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

/* Modal Container */
.modal-container {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  border: 1px solid #e5e7eb;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: modalSlideIn 0.25s ease-out;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Modal Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.modal-header h3 {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
}

.modal-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.modal-close:hover {
  background: #e5e7eb;
  color: #1f2937;
}

/* Modal Body */
.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

/* Modal Form Group */
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

.modal-input {
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

.modal-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.modal-input::placeholder {
  color: #9ca3af;
}

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
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  line-height: 1.6;
}

.modal-textarea:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.modal-textarea::placeholder {
  color: #9ca3af;
}

/* Modal Form Row (two columns) */
.modal-form-row {
  display: flex;
  gap: 12px;
}

.modal-form-group.half {
  flex: 1;
  margin-bottom: 0;
}

/* Modal Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.modal-footer .btn {
  padding: 10px 24px;
  font-size: 14px;
}

/* TC Edit Modal specific */
.tc-edit-modal {
  max-width: 600px;
}

/* Requirement Modal specific */
.req-modal {
  max-width: 500px;
}

/* Responsive Modal */
@media (max-width: 640px) {
  .modal-overlay {
    padding: 12px;
    align-items: flex-end;
  }

  .modal-container {
    max-width: 100%;
    max-height: 85vh;
    border-radius: 16px 16px 0 0;
  }

  .modal-form-row {
    flex-direction: column;
    gap: 0;
  }

  .modal-form-group.half {
    margin-bottom: 16px;
  }
}

/* ============================================
   导出弹窗样式（阶段6）
   ============================================ */

.export-modal {
  max-width: 580px;
}

.export-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.export-format-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
}

.export-format-option:hover {
  border-color: #a5b4fc;
  background: #f5f3ff;
}

.export-format-option.selected {
  border-color: #6366f1;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.08));
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.12);
}

.format-radio-wrapper {
  flex-shrink: 0;
}

.format-radio {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid #d1d5db;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.export-format-option.selected .format-radio {
  border-color: #6366f1;
}

.radio-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #6366f1;
}

.format-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.format-label {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.format-desc {
  font-size: 12px;
  color: #9ca3af;
  margin-left: auto;
  flex-shrink: 0;
}

/* Export Scope Options */
.export-scope-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scope-radio {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
}

.scope-radio:hover {
  border-color: #a5b4fc;
  background: #f9fafb;
}

.scope-radio input[type="radio"] {
  margin-top: 3px;
  accent-color: #6366f1;
  flex-shrink: 0;
}

.scope-label {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  display: block;
}

.scope-desc {
  font-size: 12px;
  color: #6b7280;
  display: block;
  margin-top: 2px;
}

/* Export Fields Grid */
.export-fields-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.field-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
}

.field-checkbox:hover {
  border-color: #a5b4fc;
  background: #f9fafb;
}

.field-checkbox input[type="checkbox"] {
  display: none;
}

.checkbox-mark {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid #d1d5db;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
  background: #fff;
}

.field-checkbox input[type="checkbox"]:checked + .checkbox-mark {
  background: #6366f1;
  border-color: #6366f1;
}

.checkbox-mark svg {
  width: 12px;
  height: 12px;
  color: #fff;
}

.field-label {
  font-size: 13px;
  color: #374151;
}

/* Responsive export fields */
@media (max-width: 480px) {
  .export-fields-grid {
    grid-template-columns: 1fr;
  }
}
</style>