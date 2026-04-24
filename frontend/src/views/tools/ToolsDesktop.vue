<template>
  <div class="tools-page">
    <div class="tools-header">
      <h2>🔧 工具箱</h2>
    </div>

    <div class="tools-grid">
      <div v-for="tool in pagedTools" :key="tool.route" class="tool-card" @click="$router.push(tool.route)">
        <span class="tool-icon">{{ tool.icon }}</span>
        <h3 class="tool-name">{{ tool.name }}</h3>
        <p class="tool-desc">{{ tool.desc }}</p>
        <span class="tool-arrow">→</span>
      </div>
    </div>

    <div v-if="totalPages > 1" class="pagination">
      <button class="page-btn" :disabled="currentPage <= 1" @click="currentPage--">‹</button>
      <button v-for="p in totalPages" :key="p" class="page-btn" :class="{ active: p === currentPage }" @click="currentPage = p">{{ p }}</button>
      <button class="page-btn" :disabled="currentPage >= totalPages" @click="currentPage++">›</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const pageSize = 12
const currentPage = ref(1)

const tools = [
  { icon: '💰', name: '股票分析', desc: '股票行情监控和智能分析', route: '/tools/stock' },
  { icon: '🖥️', name: 'Web Terminal', desc: '远程终端命令行工具', route: '/tools/terminal' },
  { icon: '🏃', name: '身体素质', desc: '体重、体脂等数据追踪与趋势分析', route: '/tools/fitness' },
  { icon: '📊', name: '模型用量', desc: 'AI 模型调用统计和用量分析', route: '/model-usage' },
  { icon: '📡', name: '系统监控', desc: 'CPU、内存、磁盘等系统状态', route: '/system' },
  { icon: '📅', name: '日历', desc: '日程管理和日历视图', route: '/tools/calendar' },
  { icon: '🍅', name: '番茄钟', desc: '专注计时和效率管理', route: '/tools/pomodoro' },
  { icon: '🔖', name: '网址收藏', desc: '收藏和管理常用网址', route: '/tools/bookmarks' },
  { icon: '🔧', name: 'JSON 工具', desc: 'JSON 格式化、压缩、校验', route: '/tools/json' },
  { icon: '🎨', name: '绘图板', desc: '画布绘图、形状、文字工具', route: '/tools/draw' },
  { icon: '📁', name: '文件管理', desc: '文件浏览、上传、下载、打包', route: '/tools/file-manager' },
  { icon: '📰', name: '新闻', desc: 'AI编程新闻日报', route: '/tools/news' },
]

const isAdminUser = computed(() => localStorage.getItem('username') === 'zrc')
const visibleTools = computed(() => {
  const adminRoutes = ['/tools/terminal', '/model-usage', '/system']
  return tools.filter(t => isAdminUser.value || !adminRoutes.includes(t.route))
})
const totalPages = computed(() => Math.ceil(visibleTools.value.length / pageSize))
const pagedTools = computed(() => visibleTools.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize))
</script>

<style scoped>
.tools-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 60px);
}

.tools-header {
  margin-bottom: 24px;
}

.tools-header h2 {
  font-size: 20px;
  color: var(--text-primary);
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  align-content: start;
}

.tool-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 24px 20px;
  transition: all var(--transition);
  position: relative;
  cursor: pointer;
}

.tool-card:not(.disabled):hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px var(--shadow);
  border-color: var(--accent);
}

.tool-icon {
  font-size: 40px;
  display: block;
  margin-bottom: 12px;
}

.tool-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.tool-desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
}

.tool-arrow {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 20px;
  color: var(--text-muted);
  transition: all var(--transition);
}

.tool-card:not(.disabled):hover .tool-arrow {
  color: var(--accent);
  transform: translateY(-50%) translateX(4px);
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 24px;
}

.page-btn {
  min-width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition);
}

.page-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.page-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.page-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
</style>
