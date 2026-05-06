<template>
  <div class="image-upload-wrapper">
    <input
      ref="fileInputRef"
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp"
      class="file-input"
      @change="onFileSelected"
    />
    <button
      class="upload-btn"
      @click="triggerSelect"
      title="发送图片"
      type="button"
    >
      📎
    </button>

    <!-- 拖拽提示 overlay -->
    <div
      v-if="isDragging"
      class="drop-overlay"
    >
      <div class="drop-hint">
        <span class="drop-icon">🖼️</span>
        <span>松开以发送图片</span>
      </div>
    </div>

    <!-- 预览区域 -->
    <div v-if="previewUrl" class="preview-bar">
      <img :src="previewUrl" class="preview-thumb" alt="预览" />
      <span class="preview-name">{{ selectedFile?.name }}</span>
      <button class="preview-send" @click="confirmSend" :disabled="sending">
        {{ sending ? '发送中...' : '发送' }}
      </button>
      <button class="preview-cancel" @click="cancel" aria-label="取消">✕</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'

const props = defineProps({
  sending: Boolean
})

const emit = defineEmits(['upload', 'cancel'])

const fileInputRef = ref(null)
const selectedFile = ref(null)
const previewUrl = ref('')
const isDragging = ref(false)

function triggerSelect() {
  fileInputRef.value?.click()
}

function onFileSelected(e) {
  const file = e.target.files?.[0]
  if (file) {
    handleFile(file)
  }
  e.target.value = ''
}

function handleFile(file) {
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!validTypes.includes(file.type)) {
    alert('只支持 JPG、PNG、GIF、WebP 格式的图片')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    alert('图片大小不能超过 10MB')
    return
  }
  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

function confirmSend() {
  if (!selectedFile.value) return
  emit('upload', selectedFile.value)
  clearPreview()
}

function cancel() {
  clearPreview()
  emit('cancel')
}

function clearPreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
  previewUrl.value = ''
  selectedFile.value = null
}

// 拖拽处理
function handleDragOver(e) {
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = true
}

function handleDragLeave(e) {
  e.preventDefault()
  e.stopPropagation()
  // 只有当真正离开容器时才隐藏
  if (!e.currentTarget.contains(e.relatedTarget)) {
    isDragging.value = false
  }
}

function handleDrop(e) {
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    handleFile(files[0])
  }
}

// 暴露拖拽事件给父组件
defineExpose({
  handleDragOver,
  handleDragLeave,
  handleDrop
})

onUnmounted(() => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
})
</script>

<style scoped>
.image-upload-wrapper {
  position: relative;
}

.file-input {
  display: none;
}

.upload-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  font-size: 16px;
  cursor: pointer;
  transition: background var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-btn:hover {
  background: var(--accent-light);
}

.drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(var(--accent-rgb, 102, 126, 234), 0.15);
  border: 2px dashed var(--accent);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: none;
}

.drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--accent);
  font-size: 14px;
  font-weight: 500;
  background: var(--bg-secondary);
  padding: 16px 24px;
  border-radius: var(--radius-md);
}

.drop-icon {
  font-size: 28px;
}

.preview-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg-primary);
  border-top: 1px solid var(--border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.preview-thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

.preview-name {
  flex: 1;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-send {
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition);
}

.preview-send:hover:not(:disabled) {
  opacity: 0.85;
}

.preview-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.preview-cancel {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 16px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-cancel:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
