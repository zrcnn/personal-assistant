<template>
  <div class="draw-page" @contextmenu.prevent="onContextMenu">
    <!-- ===== TOP TOOLBAR (Ribbon) ===== -->
    <div class="ribbon">
      <div class="ribbon-group">
        <div class="ribbon-label">文件</div>
        <button class="rb" @click="newName='未命名画布'; newW=800; newH=600; showNewDialog=true" title="新建">➕</button>
        <button class="rb" @click="triggerImport" title="导入图片">📁</button>
        <button class="rb" @click="saveToHistory" title="保存到历史记录">💾</button>
        <button class="rb" @click="downloadPNG" title="下载到浏览器">📥</button>
        <button class="rb" @click="showHistory = !showHistory" title="历史记录">📋</button>
        <input type="file" ref="fileInputRef" accept="image/*" style="display:none" @change="onImportImage" />
      </div>
      <div class="ribbon-sep"></div>
      <div class="ribbon-group">
        <div class="ribbon-label">编辑</div>
        <button class="rb" @click="undo" :disabled="historyIdx<=0" title="撤销 Ctrl+Z">↩</button>
        <button class="rb" @click="redo" :disabled="!canRedo" title="重做 Ctrl+Y">↪</button>
        <button class="rb" @click="doCopy" :disabled="selectedIdx<0" title="复制 Ctrl+C">📋</button>
        <button class="rb" @click="doPaste" :disabled="!clipboard" title="粘贴 Ctrl+V">📄</button>
        <button class="rb" @click="doDelete" :disabled="selectedIdx<0" title="删除 Delete">🗑</button>
      </div>
      <div class="ribbon-sep"></div>
      <div class="ribbon-group">
        <div class="ribbon-label">工具</div>
        <button v-for="t in allTools" :key="t.id" class="rb" :class="{active:currentTool===t.id}" @click="currentTool=t.id" :title="t.label">
          <span>{{t.icon}}</span>
        </button>
      </div>
      <div class="ribbon-sep"></div>
      <div class="ribbon-group">
        <div class="ribbon-label">样式</div>
        <label class="color-pick" title="描边颜色">
          <span class="color-swatch" :style="{background:strokeColor}"></span>
          <input type="color" v-model="strokeColor" @input="onStrokeColorChange">
        </label>
        <label class="color-pick" title="填充颜色">
          <span class="color-swatch" :style="{background:fillColor, opacity: useFill?1:0.3}"></span>
          <input type="color" v-model="fillColor" @input="onFillColorChange">
        </label>
        <label class="check-label" title="启用填充"><input type="checkbox" v-model="useFill" @change="onFillToggle"> 填充</label>
        <label class="ribbon-field" title="线宽">粗细
          <input type="number" v-model.number="lineWidth" min="1" max="50" class="num-input" @change="onPropChange">
        </label>
        <label class="ribbon-field" title="透明度">透明度
          <input type="number" v-model.number="opacityVal" min="0" max="100" class="num-input" @change="onOpacityChange">
        </label>
      </div>
      <div class="ribbon-sep"></div>
      <div class="ribbon-group" v-if="selectedIdx>=0 && elements[selectedIdx]?.type==='text'">
        <div class="ribbon-label">文字</div>
        <label class="ribbon-field">字号
          <input type="number" v-model.number="fontSize" min="8" max="200" class="num-input" @change="onTextPropChange">
        </label>
      </div>
      <div class="ribbon-spacer"></div>
      <div class="ribbon-group">
        <span class="file-name">{{ currentFileName || '未命名画布' }} <small>{{canvasW}}×{{canvasH}}</small></span>
      </div>
    </div>

    <!-- ===== BODY ===== -->
    <div class="draw-body">
      <!-- Left Shape Library -->
      <div class="left-panel">
        <div class="lp-section" v-for="cat in shapeLibrary" :key="cat.name">
          <div class="lp-header" @click="cat.open=!cat.open">
            <span>{{cat.open?'▾':'▸'}} {{cat.name}}</span>
          </div>
          <div class="lp-grid" v-show="cat.open">
            <div v-for="s in cat.shapes" :key="s.type" class="lp-shape" @click="currentTool=s.type" :class="{active:currentTool===s.type}" :title="s.label">
              <span class="lp-icon">{{ getShapeIcon(s.type) }}</span>
              <span class="lp-name">{{s.label}}</span>
            </div>
          </div>
        </div>
        <!-- Eraser mode -->
        <div class="lp-section" v-if="currentTool==='eraser'">
          <div class="lp-header"><span>橡皮擦模式</span></div>
          <div class="lp-grid">
            <button class="mode-btn" :class="{active:eraserMode==='free'}" @click="eraserMode='free'">自由擦除</button>
            <button class="mode-btn" :class="{active:eraserMode==='area'}" @click="eraserMode='area'">区域擦除</button>
          </div>
        </div>
      </div>

      <!-- Canvas Area -->
      <div class="canvas-area" ref="canvasArea" @wheel.prevent="onWheel">
        <!-- Rulers -->
        <div class="ruler-h" ref="rulerH"></div>
        <div class="ruler-v" ref="rulerV"></div>
        <!-- Canvas container with transform -->
        <div class="canvas-container" ref="canvasContainer" :style="canvasTransformStyle">
          <canvas ref="canvasRef"
            :width="canvasW" :height="canvasH"
            @mousedown="onMouseDown"
            @mousemove="onMouseMove"
            @mouseup="onMouseUp"
            @mouseleave="onMouseLeave"
            @touchstart.prevent="onTouchStart"
            @touchmove.prevent="onTouchMove"
            @touchend.prevent="onMouseUp"
          ></canvas>
        </div>
        <!-- Text input (positioned relative to canvas-area, outside canvas-container to avoid transform) -->
        <input v-if="showTextInput" ref="textInputRef"
          class="text-input-overlay"
          :style="{left:textScreenX+'px',top:textScreenY+'px',fontSize:(fontSize*zoom)+'px',color:strokeColor,minWidth:'120px'}"
          @keydown.enter="commitText" @keydown.escape="showTextInput=false" @blur="commitText"
          @mousedown.stop @click.stop
          placeholder="输入文字..." autofocus
        />
        <!-- Zoom controls -->
        <div class="zoom-controls">
          <button class="zc" @click="zoomOut" title="缩小">−</button>
          <span class="zc-label" @click="zoomReset">{{Math.round(zoom*100)}}%</span>
          <button class="zc" @click="zoomIn" title="放大">+</button>
          <button class="zc" @click="zoomReset" title="重置缩放">⊞</button>
        </div>
      </div>

      <!-- Right Property Panel -->
      <div class="right-panel" v-if="selectedIdx>=0 && elements[selectedIdx]">
        <div class="rp-title">属性</div>
        <div class="rp-row" v-if="getElementBounds(elements[selectedIdx])">
          <label>X</label><input type="number" :value="Math.round(getElementBounds(elements[selectedIdx]).x)" class="rp-input" @change="e=>setPropX(+e.target.value)">
          <label>Y</label><input type="number" :value="Math.round(getElementBounds(elements[selectedIdx]).y)" class="rp-input" @change="e=>setPropY(+e.target.value)">
        </div>
        <div class="rp-row" v-if="getElementBounds(elements[selectedIdx])">
          <label>W</label><input type="number" :value="Math.round(getElementBounds(elements[selectedIdx]).w)" class="rp-input" @change="e=>setPropW(+e.target.value)">
          <label>H</label><input type="number" :value="Math.round(getElementBounds(elements[selectedIdx]).h)" class="rp-input" @change="e=>setPropH(+e.target.value)">
        </div>
        <div class="rp-row">
          <label>旋转</label><input type="number" :value="Math.round((elements[selectedIdx].rotation||0)*180/Math.PI)" class="rp-input" @change="e=>setPropRotation(+e.target.value)">°
        </div>
        <div class="rp-row">
          <label>透明度</label><input type="range" min="0" max="100" :value="Math.round((elements[selectedIdx].opacity||1)*100)" class="rp-slider" @input="e=>setPropOpacity(+e.target.value)">
        </div>
        <div class="rp-section-title">图层</div>
        <div class="rp-row">
          <button class="rp-btn" @click="layerMove('top')" title="置顶">⬆置顶</button>
          <button class="rp-btn" @click="layerMove('up')" title="上移">↑</button>
          <button class="rp-btn" @click="layerMove('down')" title="下移">↓</button>
          <button class="rp-btn" @click="layerMove('bottom')" title="置底">⬇置底</button>
        </div>
      </div>

      <!-- History sidebar -->
      <div v-if="showHistory" class="history-panel">
        <div class="history-title">历史记录 <button class="close-btn" @click="showHistory=false">✕</button></div>
        <div v-if="savedRecords.length===0" class="history-empty">暂无记录</div>
        <div v-for="(rec,i) in savedRecords" :key="rec.id" class="history-item" @click="restoreRecord(i)">
          <img :src="rec.dataUrl" class="history-thumb" />
          <div class="history-info">
            <div class="history-name" v-if="editingNameIdx===i">
              <input class="rename-input" v-model="editingName" @blur="commitRename(i)" @keydown.enter="commitRename(i)" @click.stop ref="renameInputRef" />
            </div>
            <div class="history-name" v-else>{{rec.name}}</div>
            <div class="history-time">{{rec.time}} · {{rec.width}}×{{rec.height}}</div>
          </div>
          <div class="history-actions">
            <button class="history-edit" @click.stop="startRename(i)" title="重命名">✏️</button>
            <button class="history-del" @click.stop="deleteRecord(i)" title="删除">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right-click menu -->
    <div v-if="ctxMenu.show" class="ctx-menu" :style="{left:ctxMenu.x+'px',top:ctxMenu.y+'px'}">
      <div class="ctx-item" @click="doCopy" :class="{disabled:selectedIdx<0}">📋 复制 <small>Ctrl+C</small></div>
      <div class="ctx-item" @click="doPaste" :class="{disabled:!clipboard}">📄 粘贴 <small>Ctrl+V</small></div>
      <div class="ctx-item" @click="doDelete" :class="{disabled:selectedIdx<0}">🗑 删除 <small>Del</small></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="layerMove('top')" :class="{disabled:selectedIdx<0}">⬆ 置顶</div>
      <div class="ctx-item" @click="layerMove('up')" :class="{disabled:selectedIdx<0}">↑ 上移一层</div>
      <div class="ctx-item" @click="layerMove('down')" :class="{disabled:selectedIdx<0}">↓ 下移一层</div>
      <div class="ctx-item" @click="layerMove('bottom')" :class="{disabled:selectedIdx<0}">⬇ 置底</div>
    </div>

    <!-- New canvas dialog -->
    <div v-if="showNewDialog" class="modal-overlay" @click.self="showNewDialog=false">
      <div class="modal-box">
        <div class="modal-title">新建画布</div>
        <div class="modal-body">
          <label>文件名：<input v-model="newName" class="modal-input" style="width:160px" placeholder="未命名画布"></label>
          <label>宽度：<input v-model.number="newW" type="number" min="200" max="4000" class="modal-input"> px</label>
          <label>高度：<input v-model.number="newH" type="number" min="200" max="4000" class="modal-input"> px</label>
        </div>
        <div class="modal-actions">
          <button class="btn" @click="showNewDialog=false">取消</button>
          <button class="btn btn-primary" @click="createNewCanvas">确认</button>
        </div>
      </div>
    </div>
    <!-- Save dialog (rename before save) -->
    <div v-if="showSaveDialog" class="modal-overlay" @click.self="showSaveDialog=false">
      <div class="modal-box">
        <div class="modal-title">保存画布</div>
        <div class="modal-body">
          <label>文件名：<input v-model="newName" class="modal-input" style="width:200px" placeholder="未命名画布"></label>
        </div>
        <div class="modal-actions">
          <button class="btn" @click="showSaveDialog=false">取消</button>
          <button class="btn btn-primary" @click="confirmSave">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

// ===== REFS =====
const canvasRef = ref(null)
const canvasArea = ref(null)
const canvasContainer = ref(null)
const textInputRef = ref(null)
const rulerH = ref(null)
const rulerV = ref(null)
const ctx = ref(null)

// ===== STATE =====
const canvasW = ref(1200)
const canvasH = ref(800)
const currentTool = ref('select')
const strokeColor = ref('#333333')
const fillColor = ref('#4FC3F7')
const useFill = ref(false)
const lineWidth = ref(2)
const fontSize = ref(24)
const opacityVal = ref(100)
const eraserMode = ref('free')
const showGrid = ref(true)
const gridSize = ref(20)

// Elements
const elements = ref([])
const selectedIdx = ref(-1)
const bgImage = ref(null)

// Zoom / Pan
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const spaceDown = ref(false)
let isPanning = false
let panStartX = 0
let panStartY = 0

// Drawing
const isDrawing = ref(false)
const startX = ref(0)
const startY = ref(0)
const currentPoints = ref([])
let lastMoveX = null, lastMoveY = null

// Drag / Resize / Rotate
let isDragging = false
let isResizing = false
let isRotating = false
let resizeHandle = null
let dragOffsetX = 0, dragOffsetY = 0
let resizeStartBounds = null
let resizeStartMouse = null
let rotateStartAngle = 0

// Selection box (rubber band)
let isBoxSelecting = false
let boxStart = null

// Text
const showTextInput = ref(false)
const textScreenX = ref(0)
const textScreenY = ref(0)
let textCanvasX = 0, textCanvasY = 0

// Clipboard
let clipboard = null

// History
const history = ref([])
const historyIdx = ref(-1)
let savePointIdx = -1
let stateChangedSinceSave = false

// Records
const savedRecords = ref([])
const showHistory = ref(false)
const editingNameIdx = ref(-1)
const editingName = ref('')
const renameInputRef = ref(null)
const fileInputRef = ref(null)
const MAX_RECORDS = 30

// Dialogs
const showNewDialog = ref(false)
const showSaveDialog = ref(false)
const newW = ref(1200)
const newH = ref(800)
const newName = ref('未命名画布')
const currentFileName = ref('未命名画布')

// Context menu
const ctxMenu = reactive({ show: false, x: 0, y: 0 })

// ===== SHAPE LIBRARY =====
const shapeLibrary = reactive([
  { name: '基本', open: true, shapes: [
    { type: 'rect', label: '矩形' },
    { type: 'circle', label: '椭圆' },
    { type: 'triangle', label: '三角形' },
    { type: 'diamond', label: '菱形' },
  ]},
  { name: '线条', open: false, shapes: [
    { type: 'line', label: '直线' },
    { type: 'arrow', label: '箭头' },
  ]},
  { name: '绘制', open: false, shapes: [
    { type: 'pen', label: '画笔' },
    { type: 'eraser', label: '橡皮擦' },
    { type: 'text', label: '文字' },
  ]},
])

const allTools = [
  { id: 'select', icon: '🖱️', label: '选择' },
  { id: 'pen', icon: '✏️', label: '画笔' },
  { id: 'eraser', icon: '🧹', label: '橡皮擦' },
  { id: 'rect', icon: '⬜', label: '矩形' },
  { id: 'circle', icon: '⭕', label: '椭圆' },
  { id: 'triangle', icon: '🔺', label: '三角形' },
  { id: 'diamond', icon: '🔷', label: '菱形' },
  { id: 'line', icon: '📏', label: '直线' },
  { id: 'arrow', icon: '➡️', label: '箭头' },
  { id: 'text', icon: '🔤', label: '文字' },
]

const canvasTransformStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
  transformOrigin: '0 0',
}))

const canRedo = computed(() => historyIdx.value < history.value.length - 1)

// ===== RENDERING =====
function redraw() {
  const c = ctx.value
  if (!c) return
  c.clearRect(0, 0, canvasW.value, canvasH.value)

  // Grid
  if (showGrid.value) drawGrid(c)

  // BG image
  if (bgImage.value) {
    c.drawImage(bgImage.value, bgImage.value._drawX, bgImage.value._drawY, bgImage.value._drawW, bgImage.value._drawH)
  }

  // Elements
  for (let i = 0; i < elements.value.length; i++) {
    drawElement(c, elements.value[i], i === selectedIdx.value)
  }

  // Selection box (rubber band)
  if (isBoxSelecting.value && boxStart && lastMoveX != null) {
    const bx = Math.min(boxStart.x, lastMoveX), by = Math.min(boxStart.y, lastMoveY)
    const bw = Math.abs(lastMoveX - boxStart.x), bh = Math.abs(lastMoveY - boxStart.y)
    c.save()
    c.strokeStyle = '#2196F3'
    c.lineWidth = 1
    c.setLineDash([4, 3])
    c.strokeRect(bx, by, bw, bh)
    c.fillStyle = 'rgba(33,150,243,0.08)'
    c.fillRect(bx, by, bw, bh)
    c.restore()
  }

  // Selection handles
  if (selectedIdx.value >= 0 && selectedIdx.value < elements.value.length && !isBoxSelecting.value) {
    drawSelectionUI(c, elements.value[selectedIdx.value])
  }

  // Alignment guides
  if (isDragging && selectedIdx.value >= 0) {
    drawAlignGuides(c)
  }
}

function drawGrid(c) {
  const gs = gridSize.value
  c.save()
  c.strokeStyle = '#e8e8e8'
  c.lineWidth = 0.5
  for (let x = 0; x <= canvasW.value; x += gs) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, canvasH.value); c.stroke()
  }
  for (let y = 0; y <= canvasH.value; y += gs) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(canvasW.value, y); c.stroke()
  }
  c.restore()
}

function drawElement(c, el, isSelected) {
  c.save()
  if (el.rotation) {
    const b = getElementBounds(el)
    if (b) {
      c.translate(b.x + b.w / 2, b.y + b.h / 2)
      c.rotate(el.rotation)
      c.translate(-(b.x + b.w / 2), -(b.y + b.h / 2))
    }
  }
  if (el.opacity != null && el.opacity < 1) c.globalAlpha = el.opacity
  c.strokeStyle = el.strokeColor || '#000'
  c.lineWidth = el.lineWidth || 2
  c.lineCap = 'round'
  c.lineJoin = 'round'

  switch (el.type) {
    case 'freehand': {
      if (el.points.length < 2) break
      c.beginPath(); c.moveTo(el.points[0].x, el.points[0].y)
      for (let i = 1; i < el.points.length; i++) c.lineTo(el.points[i].x, el.points[i].y)
      c.stroke(); break
    }
    case 'rect': {
      if (el.fillColor) { c.fillStyle = el.fillColor; c.fillRect(el.x, el.y, el.width, el.height) }
      c.strokeRect(el.x, el.y, el.width, el.height); break
    }
    case 'ellipse': {
      c.beginPath(); c.ellipse(el.cx, el.cy, Math.max(el.rx, 0.1), Math.max(el.ry, 0.1), 0, 0, Math.PI * 2)
      if (el.fillColor) { c.fillStyle = el.fillColor; c.fill() }
      c.stroke(); break
    }
    case 'triangle': {
      const p = el.points; c.beginPath(); c.moveTo(p[0].x, p[0].y)
      c.lineTo(p[1].x, p[1].y); c.lineTo(p[2].x, p[2].y); c.closePath()
      if (el.fillColor) { c.fillStyle = el.fillColor; c.fill() }
      c.stroke(); break
    }
    case 'diamond': {
      const p = el.points; c.beginPath(); c.moveTo(p[0].x, p[0].y)
      c.lineTo(p[1].x, p[1].y); c.lineTo(p[2].x, p[2].y); c.lineTo(p[3].x, p[3].y); c.closePath()
      if (el.fillColor) { c.fillStyle = el.fillColor; c.fill() }
      c.stroke(); break
    }
    case 'line': {
      c.beginPath(); c.moveTo(el.x1, el.y1); c.lineTo(el.x2, el.y2); c.stroke(); break
    }
    case 'arrow': {
      c.beginPath(); c.moveTo(el.x1, el.y1); c.lineTo(el.x2, el.y2); c.stroke()
      drawArrowHead(c, el.x1, el.y1, el.x2, el.y2, el.lineWidth || 2, el.strokeColor || '#000')
      break
    }
    case 'text': {
      c.font = `${el.fontWeight||'normal'} ${el.fontSize}px sans-serif`
      c.fillStyle = el.color || '#000'; c.textBaseline = 'top'
      c.fillText(el.text, el.x, el.y); break
    }
  }
  c.restore()
}

function drawArrowHead(c, x1, y1, x2, y2, lw, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const len = Math.max(lw * 4, 12)
  c.save(); c.fillStyle = color; c.beginPath()
  c.moveTo(x2, y2)
  c.lineTo(x2 - len * Math.cos(angle - Math.PI / 6), y2 - len * Math.sin(angle - Math.PI / 6))
  c.lineTo(x2 - len * Math.cos(angle + Math.PI / 6), y2 - len * Math.sin(angle + Math.PI / 6))
  c.closePath(); c.fill(); c.restore()
}

function drawSelectionUI(c, el) {
  const b = getElementBounds(el)
  if (!b) return
  const pad = 8
  c.save()
  c.strokeStyle = '#1976D2'; c.lineWidth = 1.5; c.setLineDash([5, 3])
  c.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2)
  c.setLineDash([])

  // 8 resize handles + 1 rotate
  const handles = getHandlePositions(b, pad)
  const hs = 7
  c.fillStyle = '#fff'; c.strokeStyle = '#1976D2'; c.lineWidth = 1.5
  for (const h of handles) {
    if (h.id === 'rotate') continue
    c.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs)
    c.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs)
  }
  // Rotate handle
  const rh = handles.find(h => h.id === 'rotate')
  if (rh) {
    c.beginPath(); c.moveTo(rh.lineX, rh.lineY); c.lineTo(rh.x, rh.y)
    c.strokeStyle = '#1976D2'; c.lineWidth = 1; c.stroke()
    c.beginPath(); c.arc(rh.x, rh.y, 5, 0, Math.PI * 2)
    c.fillStyle = '#1976D2'; c.fill()
  }
  c.restore()
}

function getHandlePositions(b, pad) {
  const x1 = b.x - pad, y1 = b.y - pad, x2 = b.x + b.w + pad, y2 = b.y + b.h + pad
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  return [
    { id: 'nw', x: x1, y: y1 }, { id: 'n', x: mx, y: y1 }, { id: 'ne', x: x2, y: y1 },
    { id: 'e', x: x2, y: my }, { id: 'se', x: x2, y: y2 }, { id: 's', x: mx, y: y2 },
    { id: 'sw', x: x1, y: y2 }, { id: 'w', x: x1, y: my },
    { id: 'rotate', x: mx, y: y1 - 20, lineX: mx, lineY: y1 },
  ]
}

// ===== ALIGNMENT GUIDES =====
let alignGuides = []

function computeAlignGuides(dragIdx) {
  alignGuides = []
  if (dragIdx < 0) return
  const db = getElementBounds(elements.value[dragIdx])
  if (!db) return
  const dcx = db.x + db.w / 2, dcy = db.y + db.h / 2
  const threshold = 6

  for (let i = 0; i < elements.value.length; i++) {
    if (i === dragIdx) continue
    const b = getElementBounds(elements.value[i])
    if (!b) continue
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2

    // Vertical alignment (x)
    if (Math.abs(db.x - b.x) < threshold) alignGuides.push({ type: 'v', x: b.x })
    if (Math.abs(db.x + db.w - (b.x + b.w)) < threshold) alignGuides.push({ type: 'v', x: b.x + b.w })
    if (Math.abs(dcx - cx) < threshold) alignGuides.push({ type: 'v', x: cx })
    // Horizontal alignment (y)
    if (Math.abs(db.y - b.y) < threshold) alignGuides.push({ type: 'h', y: b.y })
    if (Math.abs(db.y + db.h - (b.y + b.h)) < threshold) alignGuides.push({ type: 'h', y: b.y + b.h })
    if (Math.abs(dcy - cy) < threshold) alignGuides.push({ type: 'h', y: cy })
  }
  // Canvas center
  if (Math.abs(dcx - canvasW.value / 2) < threshold) alignGuides.push({ type: 'v', x: canvasW.value / 2 })
  if (Math.abs(dcy - canvasH.value / 2) < threshold) alignGuides.push({ type: 'h', y: canvasH.value / 2 })
}

function snapToGuides(el) {
  const b = getElementBounds(el)
  if (!b) return
  const dcx = b.x + b.w / 2, dcy = b.y + b.h / 2
  let snapX = null, snapY = null
  for (const g of alignGuides) {
    if (g.type === 'v') {
      if (Math.abs(b.x - g.x) < 6) snapX = g.x - 0
      else if (Math.abs(b.x + b.w - g.x) < 6) snapX = g.x - b.w
      else if (Math.abs(dcx - g.x) < 6) snapX = g.x - b.w / 2
    }
    if (g.type === 'h') {
      if (Math.abs(b.y - g.y) < 6) snapY = g.y - 0
      else if (Math.abs(b.y + b.h - g.y) < 6) snapY = g.y - b.h
      else if (Math.abs(dcy - g.y) < 6) snapY = g.y - b.h / 2
    }
  }
  if (snapX != null) moveElement(el, snapX - b.x, 0)
  if (snapY != null) moveElement(el, 0, snapY - b.y)
}

function drawAlignGuides(c) {
  c.save()
  c.strokeStyle = '#E91E63'; c.lineWidth = 1; c.setLineDash([4, 3])
  for (const g of alignGuides) {
    c.beginPath()
    if (g.type === 'v') { c.moveTo(g.x, 0); c.lineTo(g.x, canvasH.value) }
    else { c.moveTo(0, g.y); c.lineTo(canvasW.value, g.y) }
    c.stroke()
  }
  c.restore()
}

// ===== BOUNDS =====
function getElementBounds(el) {
  if (!el) return null
  switch (el.type) {
    case 'rect': return { x: el.x, y: el.y, w: el.width, h: el.height }
    case 'ellipse': return { x: el.cx - el.rx, y: el.cy - el.ry, w: el.rx * 2, h: el.ry * 2 }
    case 'triangle': case 'diamond': {
      const xs = el.points.map(p => p.x), ys = el.points.map(p => p.y)
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) || 2, h: Math.max(...ys) - Math.min(...ys) || 2 }
    }
    case 'line': case 'arrow': {
      const minX = Math.min(el.x1, el.x2), minY = Math.min(el.y1, el.y2)
      return { x: minX, y: minY, w: Math.abs(el.x2 - el.x1) || 2, h: Math.abs(el.y2 - el.y1) || 2 }
    }
    case 'freehand': {
      if (!el.points.length) return null
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity
      for (const p of el.points) { mnx = Math.min(mnx, p.x); mny = Math.min(mny, p.y); mxx = Math.max(mxx, p.x); mxy = Math.max(mxy, p.y) }
      return { x: mnx, y: mny, w: mxx - mnx || 2, h: mxy - mny || 2 }
    }
    case 'text': {
      const c = ctx.value; c.save(); c.font = `${el.fontWeight||'normal'} ${el.fontSize}px sans-serif`
      const m = c.measureText(el.text); c.restore()
      return { x: el.x, y: el.y, w: m.width, h: el.fontSize * 1.2 }
    }
  }
  return null
}

// ===== HIT TESTING =====
function hitTest(px, py, el) {
  const th = 10
  switch (el.type) {
    case 'rect': {
      if (el.fillColor) return px >= el.x - th && px <= el.x + el.width + th && py >= el.y - th && py <= el.y + el.height + th
      return (px >= el.x - th && px <= el.x + el.width + th && py >= el.y - th && py <= el.y + el.height + th) &&
        !(px >= el.x + th && px <= el.x + el.width - th && py >= el.y + th && py <= el.y + el.height - th)
    }
    case 'ellipse': {
      const dx = (px - el.cx) / (el.rx + th), dy = (py - el.cy) / (el.ry + th)
      if (el.fillColor) return dx * dx + dy * dy <= 1
      const ix = (px - el.cx) / Math.max(el.rx - th, 1), iy = (py - el.cy) / Math.max(el.ry - th, 1)
      return dx * dx + dy * dy <= 1 && ix * ix + iy * iy >= 1
    }
    case 'triangle': return pointInPoly(px, py, el.points, el.fillColor, th)
    case 'diamond': return pointInPoly(px, py, el.points, el.fillColor, th)
    case 'line': case 'arrow': return distToSeg(px, py, el.x1, el.y1, el.x2, el.y2) < th
    case 'freehand': {
      for (let i = 1; i < el.points.length; i++) if (distToSeg(px, py, el.points[i - 1].x, el.points[i - 1].y, el.points[i].x, el.points[i].y) < th) return true
      return false
    }
    case 'text': {
      const b = getElementBounds(el)
      return b && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h
    }
  }
  return false
}

function pointInPoly(px, py, pts, hasFill, th) {
  for (let i = 0; i < pts.length; i++) if (distToSeg(px, py, pts[i].x, pts[i].y, pts[(i + 1) % pts.length].x, pts[(i + 1) % pts.length].y) < th) return true
  if (hasFill) {
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if ((pts[i].y > py) !== (pts[j].y > py) && px < (pts[j].x - pts[i].x) * (py - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x) inside = !inside
    }
    return inside
  }
  return false
}

function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function findElementAt(px, py) {
  for (let i = elements.value.length - 1; i >= 0; i--) if (hitTest(px, py, elements.value[i])) return i
  return -1
}

function hitHandle(px, py, el) {
  const b = getElementBounds(el)
  if (!b) return null
  const pad = 8, hs = 8
  for (const h of getHandlePositions(b, pad)) {
    if (h.id === 'rotate') {
      if (Math.hypot(px - h.x, py - h.y) < 8) return h.id
    } else {
      if (Math.abs(px - h.x) < hs && Math.abs(py - h.y) < hs) return h.id
    }
  }
  return null
}

// ===== MOVE / RESIZE =====
function moveElement(el, dx, dy) {
  switch (el.type) {
    case 'freehand': case 'triangle': case 'diamond':
      for (const p of el.points) { p.x += dx; p.y += dy }; break
    case 'rect': el.x += dx; el.y += dy; break
    case 'ellipse': el.cx += dx; el.cy += dy; break
    case 'line': case 'arrow': el.x1 += dx; el.y1 += dy; el.x2 += dx; el.y2 += dy; break
    case 'text': el.x += dx; el.y += dy; break
  }
}

function resizeElement(el, handle, startBounds, startMouse, curMouse) {
  const dx = curMouse.x - startMouse.x, dy = curMouse.y - startMouse.y
  let nx = startBounds.x, ny = startBounds.y, nw = startBounds.w, nh = startBounds.h

  if (handle.includes('w')) { nx += dx; nw -= dx }
  if (handle.includes('e')) { nw += dx }
  if (handle.includes('n')) { ny += dy; nh -= dy }
  if (handle.includes('s')) { nh += dy }

  // Minimum size
  if (nw < 5) { if (handle.includes('w')) nx = startBounds.x + startBounds.w - 5; nw = 5 }
  if (nh < 5) { if (handle.includes('n')) ny = startBounds.y + startBounds.h - 5; nh = 5 }

  applyBounds(el, nx, ny, nw, nh)
}

function applyBounds(el, nx, ny, nw, nh) {
  switch (el.type) {
    case 'rect': el.x = nx; el.y = ny; el.width = nw; el.height = nh; break
    case 'ellipse': el.cx = nx + nw / 2; el.cy = ny + nh / 2; el.rx = nw / 2; el.ry = nh / 2; break
    case 'triangle': el.points = [{ x: nx + nw / 2, y: ny }, { x: nx + nw, y: ny + nh }, { x: nx, y: ny + nh }]; break
    case 'diamond': el.points = [{ x: nx + nw / 2, y: ny }, { x: nx + nw, y: ny + nh / 2 }, { x: nx + nw / 2, y: ny + nh }, { x: nx, y: ny + nh / 2 }]; break
    case 'line': case 'arrow': el.x1 = nx; el.y1 = ny; el.x2 = nx + nw; el.y2 = ny + nh; break
    case 'text': el.x = nx; el.y = ny; break
    case 'freehand': {
      const ob = getElementBounds(el)
      if (!ob || ob.w < 1 || ob.h < 1) break
      const sx = nw / ob.w, sy = nh / ob.h
      for (const p of el.points) { p.x = nx + (p.x - ob.x) * sx; p.y = ny + (p.y - ob.y) * sy }
      break
    }
  }
}

// ===== HISTORY =====
function cloneElements(arr) { return JSON.parse(JSON.stringify(arr)) }

function saveState() {
  history.value = history.value.slice(0, historyIdx.value + 1)
  history.value.push(cloneElements(elements.value))
  historyIdx.value = history.value.length - 1
  stateChangedSinceSave = true
  if (history.value.length > 50) { history.value.shift(); historyIdx.value--; if (savePointIdx > 0) savePointIdx-- }
}

function undo() {
  if (historyIdx.value <= 0) return
  historyIdx.value--; elements.value = cloneElements(history.value[historyIdx.value])
  selectedIdx.value = -1; redraw()
}

function redo() {
  if (historyIdx.value < savePointIdx) { historyIdx.value = savePointIdx; elements.value = cloneElements(history.value[historyIdx.value]); selectedIdx.value = -1; redraw(); return }
  if (historyIdx.value >= history.value.length - 1) return
  historyIdx.value++; elements.value = cloneElements(history.value[historyIdx.value])
  selectedIdx.value = -1; redraw()
}

// ===== CLIPBOARD =====
function doCopy() {
  if (selectedIdx.value < 0) return
  clipboard = cloneElements([elements.value[selectedIdx.value]])[0]
}

function doPaste() {
  if (!clipboard) return
  const el = cloneElements([clipboard])[0]
  moveElement(el, 20, 20)
  elements.value.push(el)
  selectedIdx.value = elements.value.length - 1
  saveState(); redraw()
}

function doDelete() {
  if (selectedIdx.value < 0) return
  elements.value.splice(selectedIdx.value, 1)
  selectedIdx.value = -1; saveState(); redraw()
}

// ===== LAYER =====
function layerMove(dir) {
  const i = selectedIdx.value
  if (i < 0) return
  const el = elements.value.splice(i, 1)[0]
  if (dir === 'up' && i < elements.value.length) elements.value.splice(i + 1, 0, el)
  else if (dir === 'down' && i > 0) elements.value.splice(i - 1, 0, el)
  else if (dir === 'top') { elements.value.push(el); selectedIdx.value = elements.value.length - 1 }
  else if (dir === 'bottom') { elements.value.unshift(el); selectedIdx.value = 0 }
  else elements.value.splice(i, 0, el)
  saveState(); redraw()
}

// ===== PROPERTY PANEL =====
function onStrokeColorChange() {
  if (selectedIdx.value >= 0) {
    const el = elements.value[selectedIdx.value]
    if (el.type === 'text') el.color = strokeColor.value
    else el.strokeColor = strokeColor.value
    saveState(); redraw()
  }
}

function onFillColorChange() {
  if (selectedIdx.value >= 0 && useFill.value) {
    elements.value[selectedIdx.value].fillColor = fillColor.value
    saveState(); redraw()
  }
}

function onFillToggle() {
  if (selectedIdx.value >= 0) {
    elements.value[selectedIdx.value].fillColor = useFill.value ? fillColor.value : null
    saveState(); redraw()
  }
}

function onPropChange() {
  if (selectedIdx.value >= 0) {
    elements.value[selectedIdx.value].lineWidth = lineWidth.value
    saveState(); redraw()
  }
}

function onOpacityChange() {
  if (selectedIdx.value >= 0) {
    elements.value[selectedIdx.value].opacity = opacityVal.value / 100
    saveState(); redraw()
  }
}

function onTextPropChange() {
  if (selectedIdx.value >= 0 && elements.value[selectedIdx.value].type === 'text') {
    elements.value[selectedIdx.value].fontSize = fontSize.value
    saveState(); redraw()
  }
}

function setPropX(v) { const b = getElementBounds(elements.value[selectedIdx.value]); if (b) { moveElement(elements.value[selectedIdx.value], v - b.x, 0); saveState(); redraw() } }
function setPropY(v) { const b = getElementBounds(elements.value[selectedIdx.value]); if (b) { moveElement(elements.value[selectedIdx.value], 0, v - b.y); saveState(); redraw() } }
function setPropW(v) {
  const el = elements.value[selectedIdx.value]; const b = getElementBounds(el)
  if (b) { applyBounds(el, b.x, b.y, v, b.h); saveState(); redraw() }
}
function setPropH(v) {
  const el = elements.value[selectedIdx.value]; const b = getElementBounds(el)
  if (b) { applyBounds(el, b.x, b.y, b.w, v); saveState(); redraw() }
}
function setPropRotation(deg) {
  elements.value[selectedIdx.value].rotation = deg * Math.PI / 180
  saveState(); redraw()
}
function setPropOpacity(v) {
  elements.value[selectedIdx.value].opacity = v / 100
  saveState(); redraw()
}

// ===== ZOOM =====
function zoomIn() { zoom.value = Math.min(5, zoom.value * 1.2); redraw() }
function zoomOut() { zoom.value = Math.max(0.1, zoom.value / 1.2); redraw() }
function zoomReset() { zoom.value = 1; panX.value = 0; panY.value = 0; redraw() }

function onWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    zoom.value = Math.max(0.1, Math.min(5, zoom.value * delta))
    redraw()
  } else {
    panX.value -= e.deltaX
    panY.value -= e.deltaY
    redraw()
  }
}

// ===== COORDS =====
function getCanvasXY(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  return { x: (e.clientX - rect.left) * (canvasRef.value.width / rect.width), y: (e.clientY - rect.top) * (canvasRef.value.height / rect.height) }
}

// ===== MOUSE =====
function onMouseDown(e) {
  if (e.button === 2) return // right click handled by contextmenu
  ctxMenu.show = false
  const { x, y } = getCanvasXY(e)

  // Middle mouse or Space+click: pan canvas
  if (e.button === 1 || spaceDown.value) {
    isPanning = true
    panStartX = e.clientX - panX.value
    panStartY = e.clientY - panY.value
    canvasRef.value.style.cursor = 'grabbing'
    return
  }

  // Text tool
  if (currentTool.value === 'text') {
    const wr = canvasArea.value.getBoundingClientRect()
    const cr = canvasRef.value.getBoundingClientRect()
    textScreenX.value = e.clientX - wr.left
    textScreenY.value = e.clientY - wr.top
    textCanvasX = x; textCanvasY = y
    showTextInput.value = true
    nextTick(() => {
      textInputRef.value?.focus()
      textInputRef.value?.select()
    })
    nextTick(() => {
      textInputRef.value?.focus()
      textInputRef.value?.select()
    })
    return
  }

  // Select tool
  if (currentTool.value === 'select') {
    // Check handles first
    if (selectedIdx.value >= 0) {
      const handle = hitHandle(x, y, elements.value[selectedIdx.value])
      if (handle === 'rotate') {
        isRotating = true
        const b = getElementBounds(elements.value[selectedIdx.value])
        rotateStartAngle = Math.atan2(y - (b.y + b.h / 2), x - (b.x + b.w / 2)) - (elements.value[selectedIdx.value].rotation || 0)
        return
      }
      if (handle) {
        isResizing = true; resizeHandle = handle
        resizeStartBounds = { ...getElementBounds(elements.value[selectedIdx.value]) }
        resizeStartMouse = { x, y }
        return
      }
    }

    const idx = findElementAt(x, y)
    if (e.shiftKey && idx >= 0) {
      // Shift+click: toggle multi-select (simplified: just select)
      selectedIdx.value = idx
      redraw(); return
    }

    if (idx >= 0) {
      selectedIdx.value = idx
      isDragging = true
      const b = getElementBounds(elements.value[idx])
      dragOffsetX = x - b.x; dragOffsetY = y - b.y
      // Update ribbon from selected element
      updateRibbonFromElement(elements.value[idx])
      redraw(); return
    }

    // Click on empty: start box select
    selectedIdx.value = -1
    isBoxSelecting = true
    boxStart = { x, y }
    lastMoveX = x; lastMoveY = y
    redraw(); return
  }

  // Eraser
  if (currentTool.value === 'eraser') {
    if (eraserMode.value === 'area') {
      isDrawing.value = true; startX.value = x; startY.value = y; lastMoveX = x; lastMoveY = y; return
    }
    eraseAt(x, y)
    isDrawing.value = true; return
  }

  // Drawing tools
  isDrawing.value = true; startX.value = x; startY.value = y
  if (currentTool.value === 'pen') currentPoints.value = [{ x, y }]
}

function onMouseMove(e) {
  // Panning
  if (isPanning) {
    panX.value = e.clientX - panStartX
    panY.value = e.clientY - panStartY
    canvasContainer.value.style.transform = canvasTransformStyle.value
    return
  }

  const { x, y } = getCanvasXY(e)

  // Rotate
  if (isRotating && selectedIdx.value >= 0) {
    const b = getElementBounds(elements.value[selectedIdx.value])
    const angle = Math.atan2(y - (b.y + b.h / 2), x - (b.x + b.w / 2)) - rotateStartAngle
    elements.value[selectedIdx.value].rotation = angle
    redraw(); return
  }

  // Resize
  if (isResizing && selectedIdx.value >= 0) {
    resizeElement(elements.value[selectedIdx.value], resizeHandle, resizeStartBounds, resizeStartMouse, { x, y })
    redraw(); return
  }

  // Drag
  if (isDragging && selectedIdx.value >= 0) {
    const b = getElementBounds(elements.value[selectedIdx.value])
    moveElement(elements.value[selectedIdx.value], x - dragOffsetX - b.x, y - dragOffsetY - b.y)
    computeAlignGuides(selectedIdx.value)
    snapToGuides(elements.value[selectedIdx.value])
    redraw(); return
  }

  // Box select
  if (isBoxSelecting) {
    lastMoveX = x; lastMoveY = y; redraw(); return
  }

  // Cursor
  if (currentTool.value === 'select') {
    if (selectedIdx.value >= 0) {
      const h = hitHandle(x, y, elements.value[selectedIdx.value])
      if (h === 'rotate') { canvasRef.value.style.cursor = 'grab'; return }
      if (h === 'nw' || h === 'se') { canvasRef.value.style.cursor = 'nwse-resize'; return }
      if (h === 'ne' || h === 'sw') { canvasRef.value.style.cursor = 'nesw-resize'; return }
      if (h === 'n' || h === 's') { canvasRef.value.style.cursor = 'ns-resize'; return }
      if (h === 'e' || h === 'w') { canvasRef.value.style.cursor = 'ew-resize'; return }
    }
    canvasRef.value.style.cursor = findElementAt(x, y) >= 0 ? 'move' : 'default'
    return
  }

  if (!isDrawing.value) return
  lastMoveX = x; lastMoveY = y

  if (currentTool.value === 'pen') {
    currentPoints.value.push({ x, y })
    redraw()
    drawElement(ctx.value, { type: 'freehand', points: currentPoints.value, strokeColor: strokeColor.value, lineWidth: lineWidth.value })
  } else if (currentTool.value === 'eraser' && eraserMode.value === 'free') {
    eraseAt(x, y)
  } else if (currentTool.value === 'eraser' && eraserMode.value === 'area') {
    redraw()
    drawAreaPreview(ctx.value, startX.value, startY.value, x, y)
  } else {
    redraw()
    drawShapePreview(ctx.value, currentTool.value, startX.value, startY.value, x, y)
  }
}

function onMouseUp() {
  if (isPanning) { isPanning = false; canvasRef.value.style.cursor = ''; return }
  if (isRotating) { isRotating = false; saveState(); return }
  if (isResizing) { isResizing = false; resizeHandle = null; saveState(); return }
  if (isDragging) { isDragging = false; alignGuides = []; saveState(); redraw(); return }
  if (isBoxSelecting) {
    isBoxSelecting = false
    // Select elements in box
    if (boxStart && lastMoveX != null) {
      const bx = Math.min(boxStart.x, lastMoveX), by = Math.min(boxStart.y, lastMoveY)
      const bw = Math.abs(lastMoveX - boxStart.x), bh = Math.abs(lastMoveY - boxStart.y)
      // Select last element in box
      let found = -1
      for (let i = elements.value.length - 1; i >= 0; i--) {
        const b = getElementBounds(elements.value[i])
        if (b && b.x < bx + bw && b.x + b.w > bx && b.y < by + bh && b.y + b.h > by) { found = i; break }
      }
      if (found >= 0) {
        selectedIdx.value = found
        updateRibbonFromElement(elements.value[found])
      }
    }
    boxStart = null; redraw(); return
  }

  if (!isDrawing.value) return
  isDrawing.value = false

  if (currentTool.value === 'pen' && currentPoints.value.length > 1) {
    elements.value.push({ type: 'freehand', points: [...currentPoints.value], strokeColor: strokeColor.value, lineWidth: lineWidth.value })
    currentPoints.value = []; saveState(); redraw()
  } else if (currentTool.value === 'eraser' && eraserMode.value === 'area' && lastMoveX != null) {
    const ex = Math.min(startX.value, lastMoveX), ey = Math.min(startY.value, lastMoveY)
    const ew = Math.abs(lastMoveX - startX.value), eh = Math.abs(lastMoveY - startY.value)
    elements.value = elements.value.filter(el => {
      const b = getElementBounds(el)
      return !b || !(b.x < ex + ew && b.x + b.w > ex && b.y < ey + eh && b.y + b.h > ey)
    })
    if (selectedIdx.value >= 0 && selectedIdx.value >= elements.value.length) selectedIdx.value = -1
    saveState(); redraw()
  } else if (['rect', 'circle', 'triangle', 'diamond', 'line', 'arrow'].includes(currentTool.value) && lastMoveX != null) {
    const el = buildShapeElement(currentTool.value, startX.value, startY.value, lastMoveX, lastMoveY)
    if (el) { elements.value.push(el); saveState() }
    redraw()
  } else if (currentTool.value === 'eraser' && eraserMode.value === 'free') {
    saveState()
  }

  lastMoveX = null; lastMoveY = null
}

function onMouseLeave() {
  if (isDrawing.value && currentTool.value !== 'select') onMouseUp()
}

function eraseAt(x, y) {
  const toRemove = []
  for (let i = elements.value.length - 1; i >= 0; i--) if (hitTest(x, y, elements.value[i])) toRemove.push(i)
  if (toRemove.length) {
    for (const i of toRemove) elements.value.splice(i, 1)
    if (selectedIdx.value >= 0 && selectedIdx.value >= elements.value.length) selectedIdx.value = -1
    redraw()
  }
}

function buildShapeElement(tool, x1, y1, x2, y2) {
  const nx = Math.min(x1, x2), ny = Math.min(y1, y2), nw = Math.abs(x2 - x1), nh = Math.abs(y2 - y1)
  const base = { strokeColor: strokeColor.value, fillColor: useFill.value ? fillColor.value : null, lineWidth: lineWidth.value }
  switch (tool) {
    case 'rect': return { type: 'rect', x: nx, y: ny, width: nw, height: nh, ...base }
    case 'circle': return { type: 'ellipse', cx: nx + nw / 2, cy: ny + nh / 2, rx: nw / 2, ry: nh / 2, ...base }
    case 'triangle': return { type: 'triangle', points: [{ x: nx + nw / 2, y: ny }, { x: nx + nw, y: ny + nh }, { x: nx, y: ny + nh }], ...base }
    case 'diamond': return { type: 'diamond', points: [{ x: nx + nw / 2, y: ny }, { x: nx + nw, y: ny + nh / 2 }, { x: nx + nw / 2, y: ny + nh }, { x: nx, y: ny + nh / 2 }], ...base }
    case 'line': return { type: 'line', x1, y1, x2, y2, strokeColor: strokeColor.value, lineWidth: lineWidth.value }
    case 'arrow': return { type: 'arrow', x1, y1, x2, y2, strokeColor: strokeColor.value, lineWidth: lineWidth.value }
  }
}

function drawShapePreview(c, tool, x1, y1, x2, y2) {
  const el = buildShapeElement(tool, x1, y1, x2, y2)
  if (el) drawElement(c, el)
}

function drawAreaPreview(c, x1, y1, x2, y2) {
  c.save(); c.strokeStyle = '#ff4444'; c.lineWidth = 2; c.setLineDash([6, 4])
  c.strokeRect(x1, y1, x2 - x1, y2 - y1); c.setLineDash([])
  c.fillStyle = 'rgba(255,68,68,0.1)'; c.fillRect(x1, y1, x2 - x1, y2 - y1); c.restore()
}

function updateRibbonFromElement(el) {
  if (!el) return
  strokeColor.value = el.color || el.strokeColor || '#000'
  lineWidth.value = el.lineWidth || 2
  opacityVal.value = Math.round((el.opacity ?? 1) * 100)
  if (el.fillColor) { fillColor.value = el.fillColor; useFill.value = true }
  else { useFill.value = false }
  if (el.type === 'text') fontSize.value = el.fontSize || 24
}

// ===== TOUCH =====
function onTouchStart(e) { if (e.touches.length === 1) onMouseDown({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }) }
function onTouchMove(e) { if (e.touches.length === 1) onMouseMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }) }

// ===== TEXT =====
function commitText() {
  if (!showTextInput.value) return
  const text = textInputRef.value?.value?.trim()
  if (!text) { showTextInput.value = false; return }
  elements.value.push({ type: 'text', x: textCanvasX, y: textCanvasY, text, fontSize: fontSize.value, color: strokeColor.value })
  showTextInput.value = false; saveState(); redraw()
}

// ===== CONTEXT MENU =====
function onContextMenu(e) {
  const { x, y } = getCanvasXY(e)
  const idx = findElementAt(x, y)
  if (idx >= 0) selectedIdx.value = idx
  ctxMenu.show = true; ctxMenu.x = e.clientX; ctxMenu.y = e.clientY
  setTimeout(() => document.addEventListener('click', () => { ctxMenu.show = false }, { once: true }), 0)
}

// ===== IMPORT/EXPORT =====
function triggerImport() { fileInputRef.value?.click() }

function onImportImage(e) {
  const file = e.target.files?.[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      saveCurrentToRecords()
      canvasW.value = Math.max(canvasW.value, Math.min(img.width, 4000))
      canvasH.value = Math.max(canvasH.value, Math.min(img.height, 4000))
      nextTick(() => {
        canvasRef.value.width = canvasW.value; canvasRef.value.height = canvasH.value
        ctx.value = canvasRef.value.getContext('2d')
        const scale = Math.min(canvasW.value / img.width, canvasH.value / img.height, 1)
        bgImage.value = img
        bgImage.value._drawX = (canvasW.value - img.width * scale) / 2
        bgImage.value._drawY = (canvasH.value - img.height * scale) / 2
        bgImage.value._drawW = img.width * scale
        bgImage.value._drawH = img.height * scale
        redraw(); history.value = [cloneElements(elements.value)]; historyIdx.value = 0; savePointIdx = 0
      })
    }
    img.src = reader.result
  }
  reader.readAsDataURL(file); e.target.value = ''
}

function saveToHistory() {
  // Open rename dialog before saving
  newName.value = currentFileName.value || '未命名画布'
  showSaveDialog.value = true
}

async function confirmSave() {
  showSaveDialog.value = false
  currentFileName.value = newName.value.trim() || '未命名画布'
  await saveCurrentToServer()
  savePointIdx = historyIdx.value
}

function downloadPNG() {
  const ss = selectedIdx.value; selectedIdx.value = -1; redraw()
  const link = document.createElement('a')
  link.download = (currentFileName.value || 'drawing') + '.png'
  link.href = canvasRef.value.toDataURL('image/png'); link.click()
  selectedIdx.value = ss; redraw()
}

// ===== SERVER STORAGE =====
async function loadDrawings() {
  try {
    const resp = await fetch('/api/tools/drawings', {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    })
    if (resp.ok) {
      const list = await resp.json()
      savedRecords.value = list.map(item => ({
        id: item.id,
        name: item.name,
        width: item.width,
        height: item.height,
        time: formatDate(item.created_at),
        dataUrl: null,
        elementsData: null
      }))
    }
  } catch (e) {
    console.error('[Drawings] Load list error:', e)
  }
}

async function loadDrawingFull(id) {
  try {
    const resp = await fetch(`/api/tools/drawings/${id}`, {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    })
    if (resp.ok) return await resp.json()
  } catch (e) {
    console.error('[Drawings] Load error:', e)
  }
  return null
}

async function saveCurrentToServer() {
  if (!canvasRef.value) return
  const ss = selectedIdx.value; selectedIdx.value = -1; redraw()
  const dataUrl = canvasRef.value.toDataURL('image/png'); selectedIdx.value = ss; redraw()
  
  try {
    const payload = {
      name: currentFileName.value || '未命名画布',
      width: canvasW.value,
      height: canvasH.value,
      dataUrl: dataUrl,
      elementsData: cloneElements(elements.value)
    }
    const resp = await fetch('/api/tools/drawings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.token}`
      },
      body: JSON.stringify(payload)
    })
    if (resp.ok) {
      const result = await resp.json()
      const now = new Date()
      const ts = formatDate(now)
      // Add to local list
      savedRecords.value.unshift({
        id: result.id,
        dataUrl: dataUrl,
        width: canvasW.value,
        height: canvasH.value,
        time: ts,
        name: payload.name,
        elementsData: cloneElements(elements.value)
      })
      if (savedRecords.value.length > MAX_RECORDS) savedRecords.value.pop()
      stateChangedSinceSave = false
    }
  } catch (e) {
    console.error('[Drawings] Save error:', e)
  }
}

async function deleteRecord(i) {
  const rec = savedRecords.value[i]
  if (!rec.id) { savedRecords.value.splice(i, 1); return }
  try {
    await fetch(`/api/tools/drawings/${rec.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${auth.token}` }
    })
    savedRecords.value.splice(i, 1)
  } catch (e) {
    console.error('[Drawings] Delete error:', e)
  }
}

async function restoreRecord(i) {
  const rec = savedRecords.value[i]
  if (!rec) return
  
  // Load full data if not cached
  let fullData = rec
  if (!rec.dataUrl && rec.id) {
    fullData = await loadDrawingFull(rec.id)
    if (!fullData) return
  }
  
  currentFileName.value = fullData.name || '未命名画布'
  canvasW.value = fullData.width
  canvasH.value = fullData.height
  
  nextTick(() => {
    canvasRef.value.width = fullData.width
    canvasRef.value.height = fullData.height
    ctx.value = canvasRef.value.getContext('2d')
    bgImage.value = null
    
    if (fullData.elementsData?.length) {
      elements.value = cloneElements(fullData.elementsData)
    } else if (fullData.dataUrl) {
      elements.value = []
      const img = new Image()
      img.onload = () => {
        bgImage.value = img
        bgImage.value._drawX = 0
        bgImage.value._drawY = 0
        bgImage.value._drawW = fullData.width
        bgImage.value._drawH = fullData.height
        redraw()
      }
      img.src = fullData.dataUrl
    } else {
      elements.value = []
    }
    
    selectedIdx.value = -1
    redraw()
    history.value = [cloneElements(elements.value)]
    historyIdx.value = 0
    savePointIdx = 0
  })
  showHistory.value = false
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function startRename(i) { editingNameIdx.value = i; editingName.value = savedRecords.value[i].name || '未命名画布' }
async function commitRename(i) {
  const rec = savedRecords.value[i]
  const newName = editingName.value.trim() || '未命名画布'
  editingNameIdx.value = -1
  
  if (rec.id) {
    try {
      await fetch(`/api/tools/drawings/${rec.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`
        },
        body: JSON.stringify({ name: newName })
      })
    } catch (e) {
      console.error('[Drawings] Rename error:', e)
    }
  }
  rec.name = newName
}

// ===== NEW CANVAS =====
function createNewCanvas() {
  showNewDialog.value = false
  if (stateChangedSinceSave) {
    saveCurrentToServer()
  }
  currentFileName.value = newName.value.trim() || '未命名画布'
  canvasW.value = Math.max(200, Math.min(4000, Number(newW.value) || 1200))
  canvasH.value = Math.max(200, Math.min(4000, Number(newH.value) || 800))
  nextTick(() => {
    canvasRef.value.width = canvasW.value; canvasRef.value.height = canvasH.value
    ctx.value = canvasRef.value.getContext('2d')
    elements.value = []; bgImage.value = null; selectedIdx.value = -1
    history.value = []; historyIdx.value = -1; saveState(); savePointIdx = 0; redraw()
  })
}

// ===== KEYBOARD =====
function onKeyDown(e) {
  if (showTextInput.value || showNewDialog.value || showSaveDialog.value) return
  if (e.key === ' ' && !spaceDown.value) { e.preventDefault(); spaceDown.value = true; canvasRef.value && (canvasRef.value.style.cursor = 'grab'); return }
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z') { e.preventDefault(); undo() }
    else if (e.key === 'y') { e.preventDefault(); redo() }
    else if (e.key === 'c') { e.preventDefault(); doCopy() }
    else if (e.key === 'v') { e.preventDefault(); doPaste() }
    return
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); doDelete() }
  if (e.key === 'Escape') { selectedIdx.value = -1; redraw() }
}

function onKeyUp(e) {
  if (e.key === ' ') { spaceDown.value = false; canvasRef.value && (canvasRef.value.style.cursor = ''); }
}

// ===== RULERS =====
function drawRulers() {
  // Horizontal ruler
  const rh = rulerH.value; if (!rh) return
  const rv = rulerV.value
  const c = rh.getContext('2d')
  const w = rh.width, h = rh.height
  c.clearRect(0, 0, w, h); c.fillStyle = '#f5f5f5'; c.fillRect(0, 0, w, h)
  c.strokeStyle = '#ccc'; c.lineWidth = 1
  const gs = gridSize.value * zoom.value
  const ox = panX.value % gs
  c.fillStyle = '#999'; c.font = '9px sans-serif'; c.textBaseline = 'top'
  for (let x = ox; x < w; x += gs) {
    const val = Math.round((x - panX.value) / zoom.value)
    c.beginPath(); c.moveTo(x, h); c.lineTo(x, h - 8); c.stroke()
    if (val % (gridSize.value * 5) === 0) c.fillText(val, x + 2, 2)
  }
  // Vertical ruler
  if (!rv) return
  const c2 = rv.getContext('2d')
  const w2 = rv.width, h2 = rv.height
  c2.clearRect(0, 0, w2, h2); c2.fillStyle = '#f5f5f5'; c2.fillRect(0, 0, w2, h2)
  c2.strokeStyle = '#ccc'; c2.lineWidth = 1
  const oy = panY.value % gs
  c2.fillStyle = '#999'; c2.font = '9px sans-serif'; c2.textBaseline = 'middle'
  for (let y = oy; y < h2; y += gs) {
    const val = Math.round((y - panY.value) / zoom.value)
    c2.beginPath(); c2.moveTo(w2, y); c2.lineTo(w2 - 8, y); c2.stroke()
    if (val % (gridSize.value * 5) === 0) c2.save(); c2.translate(10, y); c2.rotate(-Math.PI / 2); c2.fillText(val, 0, 0); c2.restore()
  }
}

// ===== SHAPE ICON MAP (matches allTools) =====
const shapeIcons = {
  select: '🖱️', pen: '✏️', eraser: '🧹', rect: '⬜', circle: '⭕',
  triangle: '🔺', diamond: '🔷', line: '📏', arrow: '➡️', text: '🔤',
}
function getShapeIcon(type) { return shapeIcons[type] || '⬜' }

// ===== LIFECYCLE =====
onMounted(() => {
  ctx.value = canvasRef.value.getContext('2d')
  loadDrawings(); saveState(); savePointIdx = 0
  nextTick(() => { redraw(); drawRulers() })
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)
})

onUnmounted(() => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('keyup', onKeyUp) })
</script>

<style scoped>
.draw-page {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* ===== RIBBON ===== */
.ribbon {
  display: flex; align-items: center; padding: 4px 10px;
  border-bottom: 1px solid var(--border); flex-shrink: 0;
  background: var(--bg-card); gap: 2px; flex-wrap: wrap;
  min-height: 40px;
}
.ribbon-group {
  display: flex; align-items: center; gap: 6px;
}
.ribbon-label {
  font-size: 10px; color: var(--text-muted); margin-right: 6px; white-space: nowrap; font-weight: 600;
}
.ribbon-sep {
  width: 1px; height: 24px; background: var(--border); margin: 0 4px;
}
.ribbon-spacer { flex: 1; }
.rb {
  width: 40px; height: 40px; border: 1px solid transparent; border-radius: 6px;
  background: transparent; cursor: pointer; display: flex; align-items: center;
  justify-content: center; font-size: 20px; transition: all 0.15s; color: var(--text-primary);
}
.rb:hover { background: rgba(128,128,128,0.12); }
.rb:disabled { opacity: 0.3; cursor: not-allowed; }
.rb.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.file-name {
  font-size: 13px; color: var(--text-primary); white-space: nowrap;
}
.file-name small { color: var(--text-muted); font-size: 11px; }
.color-pick {
  display: flex; align-items: center; cursor: pointer;
}
.color-swatch {
  width: 22px; height: 22px; border: 2px solid var(--border); border-radius: 4px;
  display: inline-block;
}
.color-pick input { display: none; }
.check-label {
  font-size: 11px; color: var(--text-muted); display: flex; align-items: center;
  gap: 2px; cursor: pointer; white-space: nowrap;
}
.ribbon-field {
  font-size: 11px; color: var(--text-muted); display: flex; align-items: center;
  gap: 3px; white-space: nowrap;
}
.num-input {
  width: 48px; padding: 2px 4px; border: 1px solid var(--border); border-radius: 4px;
  background: var(--bg-secondary); color: var(--text-primary); font-size: 12px;
  text-align: center; outline: none;
}
.num-input:focus { border-color: var(--accent); }

/* ===== BODY ===== */
.draw-body { display: flex; flex: 1; overflow: hidden; }

/* ===== LEFT PANEL ===== */
.left-panel {
  width: 170px; flex-shrink: 0; border-right: 1px solid var(--border);
  overflow-y: auto; background: var(--bg-card);
}
.lp-section { border-bottom: 1px solid var(--border); }
.lp-header {
  padding: 8px 10px; font-size: 12px; font-weight: 600; color: var(--text-primary);
  cursor: pointer; user-select: none;
}
.lp-header:hover { background: rgba(128,128,128,0.06); }
.lp-grid {
  display: flex; flex-wrap: wrap; gap: 2px; padding: 4px 8px 8px;
}
.lp-shape {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 40px; height: 40px;
  border-radius: 4px; cursor: pointer; transition: all 0.15s;
  border: 1px solid transparent;
  font-size: 18px;
}
.lp-shape:hover { background: rgba(128,128,128,0.08); }
.lp-shape.active { border-color: var(--accent); background: rgba(33,150,243,0.1); }
.lp-icon { font-size: 20px; line-height: 1; }
.lp-name { font-size: 10px; color: var(--text-muted); line-height: 1; margin-top: 1px; }
.mode-btn {
  padding: 4px 6px; border: 1px solid var(--border); border-radius: 4px;
  background: var(--bg-card); color: var(--text-muted); font-size: 11px;
  cursor: pointer; text-align: center;
}
.mode-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

/* ===== CANVAS AREA ===== */
.canvas-area {
  flex: 1; overflow: hidden; position: relative;
  background: #e0e0e0;
}
.ruler-h {
  position: absolute; top: 0; left: 22px; right: 0; height: 22px; z-index: 5;
  border-bottom: 1px solid #ccc;
}
.ruler-v {
  position: absolute; top: 22px; left: 0; width: 22px; bottom: 0; z-index: 5;
  border-right: 1px solid #ccc;
}
.canvas-container {
  position: absolute; top: 22px; left: 22px;
}
canvas {
  background: #fff; box-shadow: 0 2px 16px rgba(0,0,0,0.15);
  cursor: crosshair;
}
.text-input-overlay {
  position: absolute; background: rgba(255,255,255,0.95);
  border: 1px dashed var(--accent); padding: 2px 4px; outline: none;
  min-width: 100px; font-family: sans-serif; z-index: 10;
}
.zoom-controls {
  position: absolute; bottom: 12px; right: 12px; z-index: 10;
  display: flex; align-items: center; gap: 2px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 6px; padding: 2px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.12);
}
.zc {
  width: 28px; height: 28px; border: none; border-radius: 4px;
  background: transparent; cursor: pointer; font-size: 16px;
  color: var(--text-primary); display: flex; align-items: center;
  justify-content: center;
}
.zc:hover { background: rgba(128,128,128,0.12); }
.zc-label {
  font-size: 11px; color: var(--text-muted); padding: 0 6px;
  cursor: pointer; user-select: none; min-width: 40px; text-align: center;
}

/* ===== RIGHT PANEL ===== */
.right-panel {
  width: 180px; flex-shrink: 0; border-left: 1px solid var(--border);
  overflow-y: auto; background: var(--bg-card); padding: 10px;
}
.rp-title {
  font-size: 12px; font-weight: 600; color: var(--text-primary);
  margin-bottom: 8px;
}
.rp-row {
  display: flex; align-items: center; gap: 4px; margin-bottom: 6px;
  flex-wrap: wrap;
}
.rp-row label {
  font-size: 11px; color: var(--text-muted); width: 20px;
}
.rp-input {
  width: 60px; padding: 2px 4px; border: 1px solid var(--border);
  border-radius: 4px; background: var(--bg-secondary);
  color: var(--text-primary); font-size: 11px; text-align: center; outline: none;
}
.rp-input:focus { border-color: var(--accent); }
.rp-slider { width: 100%; accent-color: var(--accent); }
.rp-section-title {
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  margin: 10px 0 4px; border-top: 1px solid var(--border); padding-top: 8px;
}
.rp-btn {
  padding: 3px 6px; border: 1px solid var(--border); border-radius: 4px;
  background: var(--bg-card); color: var(--text-primary); font-size: 10px;
  cursor: pointer;
}
.rp-btn:hover { border-color: var(--accent); }

/* ===== HISTORY ===== */
.history-panel {
  width: 220px; flex-shrink: 0; border-left: 1px solid var(--border);
  overflow-y: auto; background: var(--bg-secondary); padding: 10px;
}
.history-title {
  font-size: 14px; font-weight: 600; color: var(--text-primary);
  margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;
}
.close-btn { background: none; border: none; cursor: pointer; font-size: 16px; color: var(--text-muted); }
.close-btn:hover { color: #f44; }
.history-empty { font-size: 13px; color: var(--text-muted); text-align: center; padding: 20px 0; }
.history-item {
  display: flex; align-items: center; gap: 8px; padding: 6px;
  border-radius: 6px; cursor: pointer; margin-bottom: 6px;
  border: 1px solid transparent; transition: all 0.15s;
}
.history-item:hover { border-color: var(--accent); }
.history-thumb { width: 56px; height: 42px; object-fit: contain; border-radius: 4px; background: #fff; flex-shrink: 0; }
.history-info { flex: 1; min-width: 0; overflow: hidden; }
.history-name { font-size: 13px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.history-time { font-size: 11px; color: var(--text-muted); }
.history-del { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; opacity: 0.6; transition: opacity 0.15s; flex-shrink: 0; }
.history-item:hover .history-del { opacity: 1; }
.history-del:hover { color: #f44; }
.rename-input {
  width: 100%; padding: 2px 4px; border: 1px solid var(--accent);
  border-radius: 3px; background: var(--bg-card); color: var(--text-primary);
  font-size: 13px; outline: none;
}

/* ===== CONTEXT MENU ===== */
.ctx-menu {
  position: fixed; z-index: 9999; background: var(--bg-card);
  border: 1px solid var(--border); border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15); padding: 4px 0; min-width: 160px;
}
.ctx-item {
  padding: 6px 14px; font-size: 13px; color: var(--text-primary);
  cursor: pointer; display: flex; justify-content: space-between;
}
.ctx-item:hover { background: rgba(33,150,243,0.08); }
.ctx-item.disabled { opacity: 0.35; pointer-events: none; }
.ctx-item small { color: var(--text-muted); font-size: 10px; }
.ctx-sep { height: 1px; background: var(--border); margin: 4px 0; }

/* ===== MODAL ===== */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.modal-box {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 12px; padding: 20px; min-width: 280px;
}
.modal-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 16px; }
.modal-body { display: flex; flex-direction: column; gap: 10px; font-size: 13px; color: var(--text-primary); }
.modal-input {
  width: 80px; padding: 4px 6px; border: 1px solid var(--border);
  border-radius: 4px; background: var(--bg-secondary);
  color: var(--text-primary); text-align: center; font-size: 13px; margin-left: 4px;
}
.modal-input:focus { border-color: var(--accent); outline: none; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.btn {
  padding: 4px 12px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-card); color: var(--text-primary); font-size: 13px;
  cursor: pointer; transition: all 0.15s;
}
.btn:hover { border-color: var(--accent); }
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-primary:hover { opacity: 0.85; }

@media (max-width: 768px) {
  .left-panel { display: none; }
  .right-panel { display: none; }
  .ribbon { flex-wrap: nowrap; overflow-x: auto; }
}
</style>
