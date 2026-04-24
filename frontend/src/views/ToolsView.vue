<template>
  <ToolsDesktop v-if="!isMobile" />
  <ToolsMobile v-else />
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import ToolsDesktop from './tools/ToolsDesktop.vue'
import ToolsMobile from './tools/ToolsMobile.vue'

const isMobile = ref(false)

function checkMobile() {
  isMobile.value = window.innerWidth < 768
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>
