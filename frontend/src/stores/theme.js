import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { usePreferredDark } from '@vueuse/core'
import { settingsAPI } from '../api/modules'

export const useThemeStore = defineStore('theme', () => {
  const prefersDark = usePreferredDark()
  const savedTheme = localStorage.getItem('theme')
  
  // 'auto', 'dark', 'light'
  const mode = ref(savedTheme || 'auto')
  const isDark = ref(
    savedTheme === 'light' ? false : savedTheme === 'dark' ? true : prefersDark.value
  )

  function applyTheme(dark) {
    document.documentElement.className = dark ? 'dark' : 'light'
    isDark.value = dark
  }

  function setTheme(newMode) {
    mode.value = newMode
    localStorage.setItem('theme', newMode)
    if (newMode === 'dark') {
      applyTheme(true)
    } else if (newMode === 'light') {
      applyTheme(false)
    } else {
      applyTheme(prefersDark.value)
    }
    // Save to backend (fire and forget)
    settingsAPI.update({ theme: newMode === 'dark' ? 'dark' : newMode === 'light' ? 'light' : 'auto' }).catch(() => {})
  }

  function toggleTheme() {
    if (isDark.value) {
      setTheme('light')
    } else {
      setTheme('dark')
    }
  }

  // Watch system preference when in auto mode
  watch(prefersDark, (val) => {
    if (mode.value === 'auto') {
      applyTheme(val)
    }
  })

  // Initialize
  applyTheme(isDark.value)

  return { mode, isDark, setTheme, toggleTheme }
})
