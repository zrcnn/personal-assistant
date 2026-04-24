<template>
<div class="ocr-page">
  <!-- Top Bar -->
  <div class="ocr-header">
    <div class="ocr-title">📷 OCR 文字识别</div>
    <div class="ocr-actions">
      <button class="action-btn" @click="showHistory=true" title="历史记录">📋</button>
      <button class="action-btn" @click="showHelp=true" title="帮助">❓</button>
    </div>
  </div>

  <!-- Main Content -->
  <div class="ocr-main">
    <!-- Upload Area -->
    <div v-if="!imageSrc" class="upload-area" @click="triggerUpload" @dragover.prevent @drop.prevent="onDrop">
      <div class="upload-icon">📸</div>
      <div class="upload-text">点击或拖拽上传图片</div>
      <div class="upload-sub">支持 JPG、PNG、WEBP，最大 10MB</div>
      <div class="upload-buttons">
        <button class="upload-btn primary" @click.stop="triggerUpload">📁 选择图片</button>
        <button class="upload-btn" @click.stop="capturePhoto" v-if="hasCamera">📷 拍照</button>
      </div>
      <input ref="fileInput" type="file" accept="image/*" @change="onFileSelected" style="display:none" />
    </div>

    <!-- Image Preview & Edit -->
    <div v-else class="preview-area">
      <div class="preview-toolbar">
        <button class="tool-btn" @click="resetImage" title="重置">🔄</button>
        <button class="tool-btn" @click="rotateImage(-90)" title="左转">↺</button>
        <button class="tool-btn" @click="rotateImage(90)" title="右转">↻</button>
        <button class="tool-btn" @click="cropImage" title="裁剪">✂️</button>
        <div class="separator"></div>
        <button class="tool-btn" @click="autoEnhance" title="增强">✨</button>
        <button class="tool-btn" @click="toGray" title="灰度">⬛</button>
        <button class="tool-btn" @click="toBinary" title="二值化">◑</button>
        <div class="separator"></div>
        <button class="tool-btn danger" @click="removeImage" title="删除">🗑️</button>
      </div>

      <div class="image-container" ref="imageContainer">
        <canvas ref="canvasRef" class="preview-canvas"></canvas>
        <!-- Crop overlay -->
        <div v-if="cropping" class="crop-overlay" ref="cropOverlay"
          :style="{left:cropRect.x+'px',top:cropRect.y+'px',width:cropRect.w+'px',height:cropRect.h+'px'}">
          <div class="crop-handle tl" @mousedown.stop="startCropResize('tl')"></div>
          <div class="crop-handle tr" @mousedown.stop="startCropResize('tr')"></div>
          <div class="crop-handle bl" @mousedown.stop="startCropResize('bl')"></div>
          <div class="crop-handle br" @mousedown.stop="startCropResize('br')"></div>
          <div class="crop-grid"></div>
        </div>
      </div>

      <div class="preview-info">
        <span>{{ imageWidth }}×{{ imageHeight }}</span>
        <span v-if="cropping">拖拽调整裁剪区域</span>
      </div>
    </div>

    <!-- Result Area -->
    <div v-if="ocrResult" class="result-area">
      <div class="result-header">
        <div class="result-title">📝 识别结果</div>
        <div class="result-actions">
          <button class="result-btn" @click="copyResult" title="复制">📋</button>
          <button class="result-btn" @click="exportResult" title="导出">📤</button>
        </div>
      </div>
      <textarea class="result-text" v-model="ocrResult" rows="8" placeholder="识别结果将显示在这里..."></textarea>
      <div class="result-meta">
        <span v-if="confidence">置信度: {{ confidence }}%</span>
        <span v-if="wordCount">字数: {{ wordCount }}</span>
      </div>
    </div>
  </div>

  <!-- Action Bar -->
  <div v-if="imageSrc" class="ocr-footer">
    <button class="ocr-btn primary" @click="performOCR" :disabled="isProcessing">
      {{ isProcessing ? '🔄 识别中...' : '🔍 开始识别' }}
    </button>
  </div>

  <!-- History Panel -->
  <div v-if="showHistory" class="history-panel">
    <div class="history-header">
      <div class="history-title">📋 历史记录</div>
      <button class="close-btn" @click="showHistory=false">✕</button>
    </div>
    <div class="history-list">
      <div v-if="historyList.length===0" class="history-empty">暂无记录</div>
      <div v-for="(item, i) in historyList" :key="item.id" class="history-item" @click="loadHistory(item)">
        <div class="history-preview">
          <img v-if="item.thumbnail" :src="item.thumbnail" />
          <span v-else class="no-preview">无预览</span>
        </div>
        <div class="history-info">
          <div class="history-name">{{ item.name || '未命名' }}</div>
          <div class="history-text">{{ (item.result || '').substring(0, 50) }}...</div>
          <div class="history-time">{{ formatDate(item.createdAt) }}</div>
        </div>
        <button class="history-del" @click.stop="deleteHistory(i)" title="删除">🗑️</button>
      </div>
    </div>
  </div>

  <!-- Help Modal -->
  <div v-if="showHelp" class="modal-overlay" @click.self="showHelp=false">
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">📷 OCR 文字识别</div>
        <button class="close-btn" @click="showHelp=false">✕</button>
      </div>
      <div class="modal-body">
        <h4>功能说明</h4>
        <ul>
          <li>上传图片或拍照进行文字识别</li>
          <li>支持裁剪、旋转、增强等预处理</li>
          <li>识别结果可复制、导出</li>
          <li>历史记录自动保存到数据库</li>
        </ul>
        <h4>使用技巧</h4>
        <ul>
          <li>✨ 增强：提升对比度，改善识别效果</li>
          <li>⬛ 灰度：转为灰度图</li>
          <li>◑ 二值化：黑白分明，适合文档</li>
          <li>✂️ 裁剪：选取需要识别的区域</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div v-if="toast.show" class="toast" :class="toast.type">{{ toast.message }}</div>
</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

// ===== STATE =====
const imageSrc = ref('')
const imageWidth = ref(0)
const imageHeight = ref(0)
const canvasRef = ref(null)
const imageContainer = ref(null)
const fileInput = ref(null)
const isProcessing = ref(false)
const ocrResult = ref('')
const confidence = ref(null)
const hasCamera = ref(false)

// Image processing
const originalImage = ref(null)
const currentRotation = ref(0)
const filterMode = ref('original') // original, gray, binary

// Crop
const cropping = ref(false)
const cropRect = ref({ x: 50, y: 50, w: 200, h: 200 })
const cropDragging = ref(false)
const cropResizeHandle = ref('')
const cropStartPos = ref({ x: 0, y: 0 })
const cropStartRect = ref(null)

// History
const showHistory = ref(false)
const historyList = ref([])

// UI
const showHelp = ref(false)
const toast = ref({ show: false, message: '', type: 'info' })

// ===== LIFECYCLE =====
onMounted(() => {
  checkCamera()
  loadHistoryFromDB()
  document.addEventListener('mousemove', onCropMove)
  document.addEventListener('mouseup', onCropUp)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onCropMove)
  document.removeEventListener('mouseup', onCropUp)
})

// ===== CAMERA =====
function checkCamera() {
  navigator.mediaDevices?.enumerateDevices().then(devices => {
    hasCamera.value = devices.some(d => d.kind === 'videoinput')
  }).catch(() => {})
}

function capturePhoto() {
  // Create a temporary video + canvas for photo capture
  const video = document.createElement('video')
  const canvas = document.createElement('canvas')
  
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
      video.srcObject = stream
      video.play()
      
      const dialog = document.createElement('div')
      dialog.className = 'camera-modal'
      dialog.innerHTML = `
        <div class="camera-container">
          <video autoplay playsinline></video>
          <div class="camera-actions">
            <button class="camera-cancel">取消</button>
            <button class="camera-capture">📸 拍照</button>
          </div>
        </div>
      `
      dialog.querySelector('video').srcObject = stream
      document.body.appendChild(dialog)
      
      dialog.querySelector('.camera-cancel').onclick = () => {
        stream.getTracks().forEach(t => t.stop())
        dialog.remove()
      }
      
      dialog.querySelector('.camera-capture').onclick = () => {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        canvas.getContext('2d').drawImage(video, 0, 0)
        canvas.toBlob(blob => {
          processFile(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
          stream.getTracks().forEach(t => t.stop())
          dialog.remove()
        }, 'image/jpeg')
      }
    })
    .catch(() => showToast('无法访问摄像头', 'error'))
}

// ===== FILE HANDLING =====
function triggerUpload() {
  fileInput.value?.click()
}

function onFileSelected(e) {
  const file = e.target.files[0]
  if (file) processFile(file)
  e.target.value = ''
}

function onDrop(e) {
  const file = e.dataTransfer?.files[0]
  if (file && file.type.startsWith('image/')) processFile(file)
}

function processFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    showToast('文件超过 10MB', 'error')
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    const img = new Image()
    img.onload = () => {
      originalImage.value = img
      imageSrc.value = e.target.result
      imageWidth.value = img.width
      imageHeight.value = img.height
      currentRotation.value = 0
      filterMode.value = 'original'
      cropping.value = false
      ocrResult.value = ''
      confidence.value = null
      renderCanvas()
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file)
}

// ===== CANVAS RENDERING =====
function renderCanvas() {
  if (!originalImage.value || !canvasRef.value) return
  
  const img = originalImage.value
  const rot = currentRotation.value
  const radians = (rot * Math.PI) / 180
  const absCos = Math.abs(Math.cos(radians))
  const absSin = Math.abs(Math.sin(radians))
  
  const rotW = img.width * absCos + img.height * absSin
  const rotH = img.width * absSin + img.height * absCos
  
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  
  canvas.width = rotW
  canvas.height = rotH
  
  ctx.save()
  ctx.translate(rotW / 2, rotH / 2)
  ctx.rotate(radians)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)
  
  // Apply filters
  if (filterMode.value === 'gray') {
    applyGrayFilter(ctx, rotW, rotH)
  } else if (filterMode.value === 'binary') {
    applyBinaryFilter(ctx, rotW, rotH)
  }
  
  ctx.restore()
  
  imageWidth.value = Math.round(rotW)
  imageHeight.value = Math.round(rotH)
}

function applyGrayFilter(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    data[i] = data[i + 1] = data[i + 2] = gray
  }
  ctx.putImageData(imageData, 0, 0)
}

function applyBinaryFilter(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const threshold = 128
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    const val = gray > threshold ? 255 : 0
    data[i] = data[i + 1] = data[i + 2] = val
  }
  ctx.putImageData(imageData, 0, 0)
}

// ===== IMAGE OPERATIONS =====
function resetImage() {
  currentRotation.value = 0
  filterMode.value = 'original'
  cropping.value = false
  renderCanvas()
}

function rotateImage(degrees) {
  currentRotation.value = (currentRotation.value + degrees + 360) % 360
  renderCanvas()
}

function cropImage() {
  if (!cropping.value) {
    // Start cropping
    cropping.value = true
    // Default crop area: center 80%
    const containerRect = imageContainer.value.getBoundingClientRect()
    const canvasRect = canvasRef.value.getBoundingClientRect()
    const scaleX = canvasRef.value.width / canvasRect.width
    const scaleY = canvasRef.value.height / canvasRect.height
    
    const margin = 50
    cropRect.value = {
      x: margin,
      y: margin,
      w: Math.max(100, canvasRef.value.width - margin * 2),
      h: Math.max(100, canvasRef.value.height - margin * 2)
    }
  } else {
    // Apply crop
    applyCrop()
  }
}

function applyCrop() {
  if (!canvasRef.value) return
  
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  const { x, y, w, h } = cropRect.value
  
  if (w <= 0 || h <= 0) return
  
  const cropped = ctx.getImageData(x, y, Math.min(w, canvas.width - x), Math.min(h, canvas.height - y))
  
  canvas.width = cropped.width
  canvas.height = cropped.height
  ctx.putImageData(cropped, 0, 0)
  
  // Update original image
  const newImg = new Image()
  newImg.onload = () => {
    originalImage.value = newImg
    imageWidth.value = cropped.width
    imageHeight.value = cropped.height
    cropping.value = false
  }
  newImg.src = canvas.toDataURL()
}

function startCropResize(handle) {
  cropResizeHandle.value = handle
  cropDragging.value = true
  cropStartPos.value = { x: 0, y: 0 } // Will be set from mouse event
  cropStartRect.value = { ...cropRect.value }
}

function onCropMove(e) {
  if (!cropDragging.value || !imageContainer.value) return
  
  const rect = imageContainer.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const dx = x - (e.movementX || 0)
  const dy = y - (e.movementY || 0)
  
  // Simple crop rect adjustment
  const cr = cropStartRect.value || cropRect.value
  const handle = cropResizeHandle.value
  
  if (handle.includes('r')) cropRect.value.w = Math.max(50, x - cr.x)
  if (handle.includes('b')) cropRect.value.h = Math.max(50, y - cr.y)
  if (handle.includes('l')) {
    const newW = cr.w + (cr.x - x)
    if (newW > 50) { cropRect.value.x = x; cropRect.value.w = newW }
  }
  if (handle.includes('t')) {
    const newH = cr.h + (cr.y - y)
    if (newH > 50) { cropRect.value.y = y; cropRect.value.h = newH }
  }
}

function onCropUp() {
  cropDragging.value = false
  cropResizeHandle.value = ''
}

function autoEnhance() {
  if (!canvasRef.value) return
  const ctx = canvasRef.value.getContext('2d')
  const w = canvasRef.value.width
  const h = canvasRef.value.height
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  
  // Auto contrast enhancement
  let min = 255, max = 0
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    if (gray < min) min = gray
    if (gray > max) max = gray
  }
  
  const range = max - min || 1
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, ((data[i] - min) / range) * 255)
    data[i + 1] = Math.min(255, ((data[i + 1] - min) / range) * 255)
    data[i + 2] = Math.min(255, ((data[i + 2] - min) / range) * 255)
  }
  
  ctx.putImageData(imageData, 0, 0)
  showToast('✨ 已增强对比度', 'success')
}

function toGray() {
  filterMode.value = 'gray'
  renderCanvas()
}

function toBinary() {
  filterMode.value = 'binary'
  renderCanvas()
}

function removeImage() {
  imageSrc.value = ''
  originalImage.value = null
  ocrResult.value = ''
  confidence.value = null
}

// ===== OCR =====
async function performOCR() {
  if (!canvasRef.value) return
  
  isProcessing.value = true
  
  try {
    // Get image data from canvas
    const dataUrl = canvasRef.value.toDataURL('image/jpeg', 0.9)
    const base64Data = dataUrl.split(',')[1]
    
    // Call backend OCR API
    const token = localStorage.getItem('token')
    const resp = await fetch('/api/tools/ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ image: base64Data })
    })
    
    if (!resp.ok) throw new Error(`OCR failed: ${resp.status}`)
    
    const result = await resp.json()
    ocrResult.value = result.text || ''
    confidence.value = result.confidence || null
    
    // Save to history
    await saveToHistory()
    
    showToast('✅ 识别完成', 'success')
  } catch (err) {
    console.error('OCR error:', err)
    showToast('识别失败: ' + err.message, 'error')
  } finally {
    isProcessing.value = false
  }
}

// ===== RESULT ACTIONS =====
function copyResult() {
  if (!ocrResult.value) return
  navigator.clipboard.writeText(ocrResult.value).then(() => {
    showToast('📋 已复制到剪贴板', 'success')
  }).catch(() => {
    showToast('复制失败', 'error')
  })
}

function exportResult() {
  if (!ocrResult.value) return
  const blob = new Blob([ocrResult.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ocr_${new Date().toISOString().slice(0, 10)}.txt`
  a.click()
  URL.revokeObjectURL(url)
  showToast('📤 已导出', 'success')
}

// ===== HISTORY =====
async function loadHistoryFromDB() {
  try {
    const token = localStorage.getItem('token')
    const resp = await fetch('/api/tools/ocr/history', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (resp.ok) {
      const data = await resp.json()
      historyList.value = data
    }
  } catch (err) {
    console.error('Load history error:', err)
  }
}

async function saveToHistory() {
  try {
    const token = localStorage.getItem('token')
    const thumbnail = canvasRef.value?.toDataURL('image/jpeg', 0.3) || ''
    
    await fetch('/api/tools/ocr/history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: `OCR_${new Date().toLocaleString()}`,
        result: ocrResult.value,
        thumbnail,
        width: imageWidth.value,
        height: imageHeight.value,
        confidence: confidence.value
      })
    })
    
    loadHistoryFromDB()
  } catch (err) {
    console.error('Save history error:', err)
  }
}

function loadHistory(item) {
  if (item.thumbnail) {
    const img = new Image()
    img.onload = () => {
      originalImage.value = img
      imageSrc.value = item.thumbnail
      imageWidth.value = item.width || 0
      imageHeight.value = item.height || 0
      ocrResult.value = item.result || ''
      confidence.value = item.confidence || null
      renderCanvas()
    }
    img.src = item.thumbnail
  }
  showHistory.value = false
}

async function deleteHistory(index) {
  const item = historyList.value[index]
  if (!item?.id) return
  
  try {
    const token = localStorage.getItem('token')
    await fetch(`/api/tools/ocr/history/${item.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    loadHistoryFromDB()
  } catch (err) {
    console.error('Delete history error:', err)
  }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ===== TOAST =====
function showToast(message, type = 'info') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 2500)
}
</script>

<style scoped>
.ocr-page {
  min-height: 100vh;
  background: var(--bg-page);
  display: flex;
  flex-direction: column;
}

.ocr-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
}

.ocr-title {
  font-size: 16px;
  font-weight: 600;
}

.ocr-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  border-radius: 8px;
}

.action-btn:hover {
  background: var(--border);
}

.ocr-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Upload Area */
.upload-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  border: 2px dashed var(--border);
  margin: 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-area:hover {
  border-color: var(--accent);
  background: rgba(128, 128, 255, 0.05);
}

.upload-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.upload-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.upload-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 24px;
}

.upload-buttons {
  display: flex;
  gap: 12px;
}

.upload-btn {
  padding: 10px 20px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn:hover {
  border-color: var(--accent);
}

.upload-btn.primary {
  background: var(--accent);
  color: #fff;
  border: none;
}

/* Preview Area */
.preview-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}

.tool-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  font-size: 16px;
  cursor: pointer;
  border-radius: 6px;
  flex-shrink: 0;
}

.tool-btn:hover {
  background: var(--border);
}

.tool-btn.danger:hover {
  background: rgba(239, 68, 68, 0.15);
}

.separator {
  width: 1px;
  height: 24px;
  background: var(--border);
  margin: 0 4px;
  flex-shrink: 0;
}

.image-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  background: #333;
  position: relative;
}

.preview-canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.crop-overlay {
  position: absolute;
  border: 2px solid var(--accent);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
  cursor: move;
}

.crop-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--accent);
  border: 2px solid #fff;
}

.crop-handle.tl { top: -6px; left: -6px; cursor: nw-resize; }
.crop-handle.tr { top: -6px; right: -6px; cursor: ne-resize; }
.crop-handle.bl { bottom: -6px; left: -6px; cursor: sw-resize; }
.crop-handle.br { bottom: -6px; right: -6px; cursor: se-resize; }

.crop-grid {
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px);
  background-size: 33.33% 33.33%;
  pointer-events: none;
}

.preview-info {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 8px;
  background: var(--bg-card);
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-muted);
}

/* Result Area */
.result-area {
  border-top: 1px solid var(--border);
  background: var(--bg-card);
  max-height: 40vh;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.result-title {
  font-size: 14px;
  font-weight: 500;
}

.result-actions {
  display: flex;
  gap: 4px;
}

.result-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 16px;
  cursor: pointer;
  border-radius: 6px;
}

.result-btn:hover {
  background: var(--border);
}

.result-text {
  width: 100%;
  padding: 12px;
  border: none;
  background: transparent;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  resize: vertical;
  font-family: inherit;
}

.result-meta {
  display: flex;
  gap: 16px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-muted);
}

/* Footer */
.ocr-footer {
  padding: 12px 16px;
  background: var(--bg-card);
  border-top: 1px solid var(--border);
}

.ocr-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.ocr-btn.primary {
  background: var(--accent);
  color: #fff;
}

.ocr-btn.primary:hover:not(:disabled) {
  opacity: 0.9;
}

.ocr-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* History Panel */
.history-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 320px;
  max-width: 80vw;
  height: 100vh;
  background: var(--bg-card);
  border-left: 1px solid var(--border);
  z-index: 100;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.2);
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.history-title {
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 16px;
  cursor: pointer;
  border-radius: 6px;
}

.close-btn:hover {
  background: var(--border);
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.history-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}

.history-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.history-item:hover {
  background: var(--border);
}

.history-preview {
  width: 60px;
  height: 60px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-page);
  flex-shrink: 0;
}

.history-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 10px;
  color: var(--text-muted);
}

.history-info {
  flex: 1;
  min-width: 0;
}

.history-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-text {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.history-time {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.history-del {
  align-self: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  opacity: 0.5;
}

.history-item:hover .history-del {
  opacity: 1;
}

.history-del:hover {
  background: rgba(239, 68, 68, 0.15);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}

.modal-content {
  background: var(--bg-card);
  border-radius: 12px;
  max-width: 400px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
}

.modal-body {
  padding: 16px;
}

.modal-body h4 {
  margin: 0 0 8px;
  font-size: 14px;
}

.modal-body ul {
  margin: 0 0 16px;
  padding-left: 20px;
}

.modal-body li {
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary);
}

/* Toast */
.toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 300;
  animation: toastIn 0.3s ease;
}

.toast.success {
  background: #2ecc71;
  color: #fff;
}

.toast.error {
  background: #e74c3c;
  color: #fff;
}

.toast.info {
  background: var(--accent);
  color: #fff;
}

@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(20px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* Camera modal */
.camera-modal {
  position: fixed;
  inset: 0;
  background: #000;
  z-index: 250;
  display: flex;
  align-items: center;
  justify-content: center;
}

.camera-container {
  width: 100%;
  max-width: 500px;
}

.camera-container video {
  width: 100%;
  display: block;
}

.camera-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 20px;
}

.camera-actions button {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.camera-cancel {
  background: rgba(255,255,255,0.2);
  color: #fff;
}

.camera-capture {
  background: var(--accent);
  color: #fff;
}

/* Responsive */
@media (min-width: 768px) {
  .ocr-main {
    flex-direction: row;
  }
  
  .upload-area, .preview-area {
    flex: 1;
  }
  
  .result-area {
    max-height: none;
    width: 350px;
    border-left: 1px solid var(--border);
    border-top: none;
  }
  
  .ocr-footer {
    display: none;
  }
}
</style>
