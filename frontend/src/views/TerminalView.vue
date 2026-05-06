<template>
  <div class="terminal-page">
    <div class="terminal-header">
      <button class="back-btn" @click="$router.push('/tools')">← 返回工具箱</button>
      <span class="terminal-title">🖥️ Web Terminal</span>
      <span v-if="connected" class="status-badge connected">● 已连接</span>
      <span v-else class="status-badge connecting">◌ 连接中...</span>
      <button class="action" @click="clearTerminal">🗑️ 清屏</button>
      <button class="action" @click="pasteToTerminal">📋 粘贴</button>
      <button class="action action-close danger" @click="killTerminal">✕ 关闭</button>
    </div>
    <div class="terminal-container" ref="containerRef"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import '@xterm/xterm/css/xterm.css'

const containerRef = ref(null)
const connected = ref(false)
const sessionId = ref(null)

let term = null
let fitAddon = null
let eventSource = null

function getToken() {
  return localStorage.getItem('token')
}

async function createSession() {
  const token = getToken()
  if (!token) return

  try {
    const res = await fetch('/api/terminal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    if (!res.ok) return
    const data = await res.json()
    sessionId.value = data.id
    connectSSE()
  } catch (err) {
    console.error('Create session error:', err)
  }
}

function connectSSE() {
  const token = getToken()
  if (!token || !sessionId.value) return

  if (eventSource) eventSource.close()

  const url = `/api/terminal/sessions/${sessionId.value}/output?token=${encodeURIComponent(token)}`
  eventSource = new EventSource(url)

  eventSource.onopen = () => {
    connected.value = true
    nextTick(() => term?.focus())
  }

  eventSource.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)

      if (msg.type === 'ready') {
        connected.value = true
        nextTick(() => term?.focus())
        return
      }

      if (msg.type === 'output' && term) {
        term.write(msg.data)
      }

      if (msg.type === 'exit') {
        connected.value = false
        if (term) term.write(`\r\n\x1b[33m[进程已退出，退出码: ${msg.code}]\x1b[0m\r\n`)
      }
    } catch (e) {}
  }

  eventSource.onerror = () => {
    connected.value = false
    eventSource.close()
    eventSource = null
    setTimeout(() => {
      if (sessionId.value && !connected.value) {
        connectSSE()
      }
    }, 2000)
  }
}

function clearTerminal() {
  if (term) term.clear()
}

async function pasteToTerminal() {
  try {
    const text = await navigator.clipboard.readText()
    if (text && term) {
      term.input(text)
    }
  } catch (err) {
    console.error('[Terminal] Paste failed:', err)
  }
}

async function sendInput(data) {
  if (!sessionId.value) return
  const token = getToken()
  if (!token) return

  try {
    await fetch(`/api/terminal/sessions/${sessionId.value}/input`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data })
    })
  } catch (e) {}
}

async function sendResize(cols, rows) {
  if (!sessionId.value) return
  const token = getToken()
  if (!token) return

  try {
    await fetch(`/api/terminal/sessions/${sessionId.value}/resize`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cols, rows })
    })
  } catch (e) {}
}

async function killTerminal() {
  if (sessionId.value) {
    const token = getToken()
    if (token) {
      try {
        await fetch(`/api/terminal/sessions/${sessionId.value}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        })
      } catch (e) {}
    }
  }
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  connected.value = false
  sessionId.value = null
}

onMounted(() => {
  // Init xterm.js
  term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "'Fira Code', 'Consolas', 'Courier New', monospace",
    theme: {
      background: '#1a1a2e',
      foreground: '#e2e8f0',
      cursor: '#a29bfe',
      selectionBackground: '#0f3460'
    },
    allowProposedApi: true
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon())
  term.loadAddon(new ClipboardAddon())

  // Mount to DOM
  if (containerRef.value) {
    term.open(containerRef.value)
    fitAddon.fit()
  }

  // Forward terminal input to backend
  term.onData((data) => {
    sendInput(data)
  })

  // Handle resize
  term.onResize(({ cols, rows }) => {
    sendResize(cols, rows)
  })

  // Resize with window
  const onResize = () => {
    if (fitAddon) fitAddon.fit()
  }
  window.addEventListener('resize', onResize)

  // Create pty session and start SSE
  createSession()
})

onUnmounted(() => {
  killTerminal()
  if (term) {
    term.dispose()
    term = null
  }
})
</script>

<style scoped>
.terminal-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1a1a2e;
}

.terminal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
  flex-shrink: 0;
}

.back-btn {
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition);
}

.back-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.terminal-title {
  color: #a29bfe;
  font-size: 14px;
  font-weight: 600;
}

.status-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}
.status-badge.connected {
  color: #2ecc71;
  background: rgba(46, 204, 113, 0.1);
}
.status-badge.connecting {
  color: #f1c40f;
  background: rgba(241, 196, 15, 0.1);
}

.action {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid #0f3460;
  background: transparent;
  color: #a0aec0;
  font-size: 12px;
  cursor: pointer;
}
.action-close {
  margin-left: auto;
}
.action:hover { background: #0f3460; color: #e2e8f0; }
.action.danger:hover { background: #c0392b; border-color: #c0392b; color: #fff; }

.terminal-container {
  flex: 1;
  padding: 4px;
  overflow: hidden;
}

/* Make xterm fill container */
.terminal-container :deep(.xterm) {
  height: 100%;
}

.terminal-container :deep(.xterm-viewport) {
  overflow-y: auto !important;
}

@media (max-width: 768px) {
  .terminal-header { padding: 8px 12px; gap: 8px; }
  .terminal-title { font-size: 13px; }
}
</style>
