import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/variables.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.mount('#app')

// 监听系统主题变化
function applyTheme(isDark) {
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.classList.toggle('light', !isDark)
  localStorage.setItem('theme', isDark ? 'dark' : 'light')
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  // 只有当用户没有手动设置主题时才跟随系统
  if (!localStorage.getItem('theme')) {
    applyTheme(e.matches)
  }
})
