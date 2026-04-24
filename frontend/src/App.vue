<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { useThemeStore } from './stores/theme'

// 初始化主题
const themeStore = useThemeStore()

onMounted(() => {
  // 确保主题已正确应用
  themeStore.setTheme(themeStore.mode)
})
</script>

<style>
#app {
  min-height: 100vh;
}
</style>
