<template>
  <div class="layout">
    <!-- Top Navbar -->
    <nav class="navbar">
      <div class="navbar-left">
        <router-link to="/" class="navbar-logo">
          <span class="logo-icon">🤖</span>
          <span class="logo-text">NE</span>
        </router-link>
      </div>
      
      <div class="navbar-center" :class="{ active: mobileMenuOpen }">
        <router-link to="/messages" class="nav-link" @click="mobileMenuOpen = false">
          <span style="position:relative">💬<span v-if="totalUnreadCount > 0" class="nav-badge">{{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}</span></span> 消息
        </router-link>
        <router-link to="/chat" class="nav-link" @click="mobileMenuOpen = false">
          <span>🤖</span> AI助手
        </router-link>
        <router-link to="/tools" class="nav-link" @click="mobileMenuOpen = false">
          <span>🔧</span> 工具箱
        </router-link>
        <router-link to="/system" class="nav-link nav-link-system" @click="mobileMenuOpen = false">
          <span>🖥️</span> 系统监控
        </router-link>
        <router-link to="/todo" class="nav-link" @click="mobileMenuOpen = false">
          <span>📋</span> 待办
        </router-link>
        <router-link to="/profile" class="nav-link" @click="mobileMenuOpen = false">
          <span>👤</span> 个人中心
        </router-link>
        <!-- API Key moved to 个人中心 -->
      </div>
      
      <div class="navbar-right">
        <button class="theme-toggle" @click="themeStore.toggleTheme" :title="themeStore.isDark ? '切换亮色' : '切换暗色'">
          {{ themeStore.isDark ? '☀️' : '🌙' }}
        </button>
        
        <div class="user-menu" ref="userMenuRef">
          <button class="user-avatar" @click="userMenuOpen = !userMenuOpen">
            {{ authStore.username?.charAt(0).toUpperCase() || 'U' }}
          </button>
          <transition name="dropdown">
            <div v-if="userMenuOpen" class="user-dropdown">
              <div class="dropdown-header">
                <div class="dropdown-avatar">{{ authStore.username?.charAt(0).toUpperCase() || 'U' }}</div>
                <div>
                  <div class="dropdown-name">{{ authStore.username }}</div>
                  <div class="dropdown-role">用户</div>
                </div>
              </div>
              <div class="dropdown-divider"></div>
              <router-link to="/profile" class="dropdown-item" @click="userMenuOpen = false">
                👤 个人中心
              </router-link>
              <button class="dropdown-item danger" @click="handleLogout">
                🚪 退出登录
              </button>
            </div>
          </transition>
        </div>
        
        <button class="hamburger" @click="mobileMenuOpen = !mobileMenuOpen" :class="{ active: mobileMenuOpen }">
          <span></span><span></span><span></span>
        </button>
      </div>
    </nav>
    
    <!-- Mobile overlay -->
    <transition name="fade">
      <div v-if="mobileMenuOpen" class="mobile-overlay" @click="mobileMenuOpen = false"></div>
    </transition>
    
    <!-- Main Content -->
    <main class="main-content">
      <router-view v-slot="{ Component }">
        <keep-alive :include="['ChatView']">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
    
    <!-- Bottom Tab Bar (Mobile) -->
    <nav class="bottom-tabs">
      <router-link to="/chat" class="tab-item">
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="tab-label">AI助手</span>
      </router-link>
      <router-link to="/tools" class="tab-item">
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
        </svg>
        <span class="tab-label">工具</span>
      </router-link>
      <router-link to="/todo" class="tab-item">
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        <span class="tab-label">待办</span>
      </router-link>
      <router-link to="/settings" class="tab-item">
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4" class="icon-fill"/>
        </svg>
        <span class="tab-label">我的</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'
import { useMessageStore } from '../stores/message'
import { userMessagesAPI, groupChatAPI } from '../api/modules'

const router = useRouter()
const authStore = useAuthStore()
const themeStore = useThemeStore()
const messageStore = useMessageStore()

const mobileMenuOpen = ref(false)
const userMenuOpen = ref(false)
const userMenuRef = ref(null)
const totalUnreadCount = computed(() => messageStore.unreadCount + messageStore.groupUnreadCount)
let unreadTimer = null

async function fetchUnreadCount() {
  if (!authStore.isLoggedIn) return
  try {
    const res = await userMessagesAPI.getUnreadCount()
    messageStore.setUnreadCount(res.data.count)
  } catch {
    // ignore
  }
  // 群聊未读数不再通过轮询覆盖，由 MessagesView 通过 WebSocket 和 markRead 实时管理
  // 只在初始化时获取一次，后续由 MessagesView 的 updateUnreadTitle 同步
}

function handleLogout() {
  authStore.logout()
  userMenuOpen.value = false
  router.push('/login')
}

function handleClickOutside(e) {
  if (userMenuRef.value && !userMenuRef.value.contains(e.target)) {
    userMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  fetchUnreadCount()
  unreadTimer = setInterval(fetchUnreadCount, 15000)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  if (unreadTimer) clearInterval(unreadTimer)
})
</script>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* Navbar */
.navbar {
  height: var(--navbar-height);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  backdrop-filter: blur(12px);
}

.navbar-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: var(--text-primary);
}

.logo-icon {
  font-size: 24px;
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--accent), #a29bfe);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.navbar-center {
  display: flex;
  gap: 4px;
}

.nav-link {
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  transition: all var(--transition);
  display: flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
}

.nav-link:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.nav-link.router-link-exact-active {
  color: var(--accent);
  background: var(--accent-light);
}

.nav-badge {
  position: absolute;
  top: -8px;
  right: -10px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #e74c3c;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  pointer-events: none;
}

.navbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.theme-toggle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all var(--transition);
}

.theme-toggle:hover {
  background: var(--bg-hover);
}

/* User Menu */
.user-menu {
  position: relative;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent);
  color: #ffffff;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition);
}

.user-avatar:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(108, 92, 231, 0.4);
}

.user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 220px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px var(--shadow);
  overflow: hidden;
  z-index: 200;
}

.dropdown-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

.dropdown-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--accent);
  color: #ffffff;
  font-weight: 600;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dropdown-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.dropdown-role {
  font-size: 12px;
  color: var(--text-muted);
}

.dropdown-divider {
  height: 1px;
  background: var(--border);
}

.dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 12px 16px;
  font-size: 14px;
  color: var(--text-secondary);
  transition: all var(--transition);
  text-decoration: none;
}

.dropdown-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.dropdown-item.danger:hover {
  color: var(--danger);
  background: rgba(231, 76, 60, 0.1);
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Hamburger */
.hamburger {
  display: none;
  flex-direction: column;
  gap: 5px;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
}

.hamburger span {
  display: block;
  width: 20px;
  height: 2px;
  background: var(--text-primary);
  border-radius: 2px;
  transition: all var(--transition);
}

.hamburger.active span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}
.hamburger.active span:nth-child(2) {
  opacity: 0;
}
.hamburger.active span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

/* Mobile Overlay */
.mobile-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 99;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* Main Content */
.main-content {
  flex: 1;
  margin-top: var(--navbar-height);
  overflow-y: scroll; /* 始终显示滚动条，防止宽度变化 */
  overflow-x: hidden;
}

/* Bottom Tabs */
.bottom-tabs {
  display: flex;
  height: var(--bottom-tab-height);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  color: var(--text-muted);
  text-decoration: none;
  transition: color var(--transition);
  padding: 4px 0 6px;
}

.tab-icon {
  width: 18px;
  height: 18px;
}

.tab-label {
  font-size: 9px;
  line-height: 1;
}

.tab-item.router-link-exact-active {
  color: var(--accent);
}
.tab-item.router-link-exact-active .tab-icon {
  stroke: var(--accent);
}
.tab-item.router-link-exact-active .tab-icon .icon-fill {
  fill: var(--accent);
  stroke: var(--accent);
}

.tab-avatar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.avatar-circle {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  line-height: 24px;
  text-align: center;
}

/* Responsive */
@media (max-width: 768px) {
  .desktop-only {
    display: none !important;
  }
  .navbar-center {
    position: fixed;
    top: var(--navbar-height);
    left: 0;
    right: 0;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    flex-direction: column;
    padding: 16px;
    gap: 4px;
    transform: translateY(-100%);
    opacity: 0;
    transition: all var(--transition-slow);
    pointer-events: none;
  }

  .navbar-center.active {
    transform: translateY(0);
    opacity: 1;
    pointer-events: all;
  }

  .nav-link {
    width: 100%;
    padding: 12px 16px;
  }

  .hamburger {
    display: flex;
  }

  .bottom-tabs {
    display: flex;
  }

  .main-content {
    margin-bottom: var(--bottom-tab-height);
  }
}

@media (max-width: 480px) {
  .navbar {
    padding: 0 12px;
  }

  .logo-text {
    font-size: 18px;
  }
}

@media (min-width: 769px) {
  .bottom-tabs {
    display: none !important;
  }

  .nav-link-system {
    display: none;
  }
}

/* ===== Enhanced Visual Effects (v1.0.0) ===== */

/* Navbar glass enhancement */
.navbar {
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow: 0 1px 0 rgba(255,255,255,0.05), 0 4px 20px var(--shadow-light);
}

/* Logo glow effect */
.logo-icon {
  filter: drop-shadow(0 0 6px rgba(108, 92, 231, 0.4));
}

/* Nav link hover glow */
.nav-link {
  position: relative;
  overflow: hidden;
}

.nav-link::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) scaleX(0);
  width: 80%;
  height: 2px;
  background: var(--accent-gradient);
  border-radius: 2px;
  transition: transform var(--transition);
}

.nav-link:hover::before,
.nav-link.router-link-exact-active::before {
  transform: translateX(-50%) scaleX(1);
}

/* User avatar ring */
.user-avatar {
  position: relative;
}

.user-avatar::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: var(--accent-gradient);
  z-index: -1;
  opacity: 0;
  transition: opacity var(--transition);
}

.user-avatar:hover::before {
  opacity: 1;
}

/* Theme toggle glow */
.theme-toggle {
  position: relative;
}

.theme-toggle::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0;
  filter: blur(8px);
  transition: opacity var(--transition);
}

.theme-toggle:hover::after {
  opacity: 0.3;
}

/* Bottom tab indicator */
.tab-item.router-link-exact-active {
  position: relative;
}

.tab-item.router-link-exact-active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 24px;
  height: 3px;
  background: var(--accent-gradient);
  border-radius: 0 0 3px 3px;
}

/* Main content fade transition */
.main-content {
  animation: contentFadeIn 0.4s ease;
}

@keyframes contentFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Dropdown shadow enhancement */
.user-dropdown {
  box-shadow: 0 8px 32px var(--shadow), 0 0 0 1px rgba(255,255,255,0.05);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* Mobile overlay enhancement */
.mobile-overlay {
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
</style>
