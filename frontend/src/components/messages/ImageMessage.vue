<template>
  <div class="image-message-wrapper">
    <div
      class="image-thumbnail"
      :class="{ expired: isExpired }"
      @click="!isExpired && $emit('openLightbox', imageUrl)"
    >
      <img
        v-if="!isExpired && imageUrl"
        :src="imageUrl"
        :alt="altText"
        @error="onImageError"
        loading="lazy"
      />
      <div v-if="isExpired || imageError" class="expired-placeholder">
        <span class="expired-icon">🖼️</span>
        <span class="expired-text">{{ isExpired ? '图片已过期' : '图片加载失败' }}</span>
      </div>
      <div v-if="loading" class="image-loading">
        <span class="loading-spinner"></span>
      </div>
    </div>
    <span v-if="caption" class="image-caption">{{ caption }}</span>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  imageUrl: String,
  caption: String,
  createdAt: [String, Number],
  altText: { type: String, default: '消息图片' }
})

defineEmits(['openLightbox'])

const loading = ref(true)
const imageError = ref(false)

const isExpired = computed(() => {
  if (!props.createdAt) return false
  const msgTime = new Date(props.createdAt).getTime()
  const now = Date.now()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  return now - msgTime > sevenDays
})

function onImageError() {
  loading.value = false
  imageError.value = true
}

onMounted(() => {
  if (props.imageUrl && !isExpired.value) {
    const img = new Image()
    img.onload = () => { loading.value = false }
    img.onerror = () => { loading.value = false; imageError.value = true }
    img.src = props.imageUrl
  } else {
    loading.value = false
  }
})
</script>

<style scoped>
.image-message-wrapper {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
}

.image-thumbnail {
  position: relative;
  display: inline-block;
  max-width: 200px;
  max-height: 150px;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease;
  background: var(--bg-primary);
}

.image-thumbnail:hover {
  transform: scale(1.02);
}

.image-thumbnail.expired {
  cursor: default;
}

.image-thumbnail img {
  display: block;
  max-width: 200px;
  max-height: 150px;
  width: auto;
  height: auto;
  object-fit: contain;
  background: var(--bg-primary);
}

.expired-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 200px;
  height: 150px;
  background: var(--bg-tertiary);
  border-radius: 12px;
  gap: 8px;
}

.expired-icon {
  font-size: 32px;
  opacity: 0.5;
}

.expired-text {
  font-size: 12px;
  color: var(--text-muted);
}

.image-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.image-caption {
  font-size: 12px;
  color: var(--text-muted);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
