<template>
  <Teleport to="body">
    <transition name="lightbox-fade">
      <div
        v-if="visible"
        class="lightbox-overlay"
        @click.self="close"
      >
        <button class="lightbox-close" @click="close" aria-label="关闭">✕</button>
        <img
          v-if="src"
          :src="src"
          class="lightbox-image"
          alt="放大查看"
        />
        <div class="lightbox-caption" v-if="caption">{{ caption }}</div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'

const props = defineProps({
  visible: Boolean,
  src: String,
  caption: String
})

const emit = defineEmits(['close'])

function close() {
  emit('close')
}

function handleKeydown(e) {
  if (e.key === 'Escape' && props.visible) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  if (props.visible) {
    document.body.style.overflow = 'hidden'
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 40px;
}

.lightbox-image {
  max-width: 90vw;
  max-height: 85vh;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  object-fit: contain;
}

.lightbox-caption {
  margin-top: 16px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  max-width: 600px;
  text-align: center;
}

.lightbox-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 24px;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 0.2s ease;
}

.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
  opacity: 0;
}
</style>
