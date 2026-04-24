import { createRouter, createWebHistory } from 'vue-router'
import { h } from 'vue'

// 通用懒加载包装，失败时自动重试
function lazyLoad(importFn) {
  return () => importFn().catch(() => {
    window.location.reload()
    return Promise.reject()
  })
}

// 检查是否为管理员
function isAdmin() {
  return localStorage.getItem('username') === 'zrc'
}

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: lazyLoad(() => import('../views/LoginView.vue')),
    meta: { guest: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: lazyLoad(() => import('../views/RegisterView.vue')),
    meta: { guest: true }
  },
  {
    path: '/',
    name: 'Layout',
    component: lazyLoad(() => import('../views/LayoutView.vue')),
    meta: { requiresAuth: true },
    redirect: '/chat',
    children: [
      {
        path: 'chat',
        name: 'Chat',
        component: lazyLoad(() => import('../views/ChatView.vue')),
        meta: { keepAlive: true }
      },
      {
        path: 'chat/:id',
        name: 'ChatDetail',
        component: lazyLoad(() => import('../views/ChatView.vue')),
        props: true,
        meta: { keepAlive: true }
      },
      {
        path: 'tools',
        name: 'Tools',
        component: lazyLoad(() => import('../views/ToolsView.vue'))
      },
      {
        path: 'tools/stock',
        name: 'Stock',
        component: lazyLoad(() => import('../views/StockPanel.vue'))
      },
      {
        path: 'tools/terminal',
        meta: { admin: true },
        name: 'Terminal',
        component: lazyLoad(() => import('../views/TerminalView.vue'))
      },
      {
        path: 'tools/fitness',
        name: 'Fitness',
        component: lazyLoad(() => import('../views/FitnessView.vue'))
      },
      {
        path: 'tools/weather',
        name: 'Weather',
        component: lazyLoad(() => import('../views/WeatherView.vue'))
      },
      {
        path: 'tools/notes',
        name: 'Notes',
        component: lazyLoad(() => import('../views/NotesView.vue'))
      },
      {
        path: 'tools/expense',
        name: 'Expense',
        component: lazyLoad(() => import('../views/ExpenseView.vue'))
      },
      {
        path: 'tools/calendar',
        name: 'Calendar',
        component: lazyLoad(() => import('../views/CalendarView.vue'))
      },
      {
        path: 'tools/pomodoro',
        name: 'Pomodoro',
        component: lazyLoad(() => import('../views/PomodoroView.vue'))
      },
      {
        path: 'tools/bookmarks',
        name: 'Bookmarks',
        component: lazyLoad(() => import('../views/BookmarksView.vue'))
      },
      {
        path: 'tools/json',
        name: 'JsonTool',
        component: lazyLoad(() => import('../views/JsonToolView.vue'))
      },
      {
        path: 'tools/draw',
        name: 'Draw',
        component: lazyLoad(() => import('../views/DrawView.vue'))
      },
      {
        path: 'tools/ocr',
        name: 'OCR',
        component: lazyLoad(() => import('../views/OCRView.vue'))
      },
      {
        path: 'tools/car-rec',
        name: 'CarRecognition',
        component: lazyLoad(() => import('../views/CarRecognitionView.vue'))
      },
      {
        path: 'tools/video',
        name: 'VideoPlayer',
        component: lazyLoad(() => import('../views/VideoPlayerView.vue'))
      },
      {
        path: 'tools/file-manager',
        name: 'FileManager',
        component: lazyLoad(() => import('../views/FileManager.vue'))
      },
      {
        path: 'system',
        meta: { admin: true },
        name: 'System',
        component: lazyLoad(() => import('../views/SystemInfoView.vue'))
      },
      {
        path: 'settings',
        name: 'Settings',
        component: lazyLoad(() => import('../views/SettingsView.vue'))
      },
      {
        path: 'profile',
        name: 'Profile',
        component: lazyLoad(() => import('../views/ProfileView.vue'))
      },
      {
        path: 'api-keys',
        name: 'ApiKeys',
        component: lazyLoad(() => import('../views/ApiKeysView.vue'))
      },
      {
        path: 'todo',
        name: 'Todo',
        component: lazyLoad(() => import('../views/TodoView.vue'))
      },
      {
        path: 'messages',
        name: 'Messages',
        component: lazyLoad(() => import('../views/MessagesView.vue'))
      },
      {
        path: 'group-chat',
        name: 'GroupChat',
        component: lazyLoad(() => import('../views/GroupChatView.vue'))
      },
      {
        path: 'model-usage',
        meta: { admin: true },
        name: 'ModelUsage',
        component: lazyLoad(() => import('../views/ModelUsageView.vue'))
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  }
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else if (to.meta.guest && token) {
    next('/')
  } else if (to.meta.admin && localStorage.getItem('username') !== 'zrc') {
    next('/tools')
  } else {
    next()
  }
})

export default router
