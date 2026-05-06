<template>
  <div class="tools-mobile">
    <div class="tools-header">
      <h2>🔧 工具箱</h2>
    </div>

    <div class="tools-grid">
      <div v-for="tool in visibleTools" :key="tool.route" class="tool-card" @click="$router.push(tool.route)">
        <span class="tool-icon">{{ tool.icon }}</span>
        <h3 class="tool-name">{{ tool.name }}</h3>
        <p class="tool-desc">{{ tool.desc }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const tools = [
  { icon: '💰', name: '股票分析', desc: '股票行情监控和智能分析', route: '/tools/stock' },
  { icon: '🖥️', name: 'Web Terminal', desc: '远程终端命令行工具', route: '/tools/terminal' },
  { icon: '🏃', name: '身体素质', desc: '体重、体脂等数据追踪', route: '/tools/fitness' },
  { icon: '📊', name: '模型用量', desc: 'AI 模型调用统计', route: '/model-usage' },
  { icon: '📡', name: '系统监控', desc: 'CPU、内存、磁盘状态', route: '/system' },
  { icon: '📅', name: '日历', desc: '日程管理', route: '/tools/calendar' },
  { icon: '🍅', name: '番茄钟', desc: '专注计时管理', route: '/tools/pomodoro' },
  { icon: '🔖', name: '网址收藏', desc: '收藏常用网址', route: '/tools/bookmarks' },
  { icon: '🔧', name: 'JSON 工具', desc: 'JSON 格式化校验', route: '/tools/json' },
  { icon: '📁', name: '文件管理', desc: '文件浏览、上传、下载、打包', route: '/tools/file-manager' },
  { icon: '📰', name: '新闻', desc: 'AI编程新闻日报', route: '/tools/news' },
  { icon: '📝', name: '测试用例', desc: 'AI 自动生成测试用例', route: '/tools/test-case' },
]

const isAdminUser = computed(() => localStorage.getItem('username') === 'zrc')
const visibleTools = computed(() => {
  const adminRoutes = ['/tools/terminal', '/model-usage', '/system']
  return tools.filter(t => isAdminUser.value || !adminRoutes.includes(t.route))
})
</script>

<style scoped>
.tools-mobile {
  padding: 12px;
  min-height: calc(100vh - 60px);
}

.tools-header {
  margin-bottom: 16px;
}

.tools-header h2 {
  font-size: 18px;
  color: var(--text-primary);
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.tool-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.tool-card:active {
  opacity: 0.7;
}

.tool-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.tool-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.tool-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}
</style>
