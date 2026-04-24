<template>
  <div class="chat-page">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <h3 class="sidebar-title">对话</h3>
        <button class="new-chat-btn" @click="createConversation" title="新建对话">
          <span>✏️</span>
        </button>
      </div>
      
      <div class="conversation-list">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="conv-item"
          :class="{ active: currentId == conv.id }"
          @click="selectConversation(conv.id)"
          @contextmenu.prevent="showContextMenu($event, conv)"
        >
          <div class="conv-content">
            <span class="conv-title">{{ conv.title || '新对话' }}</span>
            <span class="conv-time">{{ formatTime(conv.updatedAt) }}</span>
          </div>
          <button class="conv-delete-btn" @click.stop="quickDelete(conv)" title="删除对话">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </button>
        </div>
        
        <div v-if="conversations.length === 0 && !loading" class="conv-empty">
          暂无对话，点击 + 开始
        </div>
      </div>
    </aside>
    
    <!-- Sidebar overlay for mobile -->
    <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>
    
    <!-- Chat Area -->
    <section class="chat-area" @dragover.prevent @dragleave="isDragging=false" @drop.prevent="onDrop">
      <!-- Chat Header (mobile) -->
      <div class="chat-header">
        <button class="sidebar-toggle" @click="sidebarOpen = !sidebarOpen">
          ☰
        </button>
        <span class="chat-header-title">{{ currentTitle }}</span>
      </div>
      
      <!-- Messages -->
      <div class="messages-container" ref="messagesRef" @scroll="handleScroll" :class="{ 'drag-over': isDragging }">
        <div v-if="isDragging" class="drop-overlay">
          <span class="drop-icon">📎</span>
          <span>拖入文件到此处</span>
        </div>
        <div v-if="!currentId" class="welcome-screen">
          <div class="welcome-icon">🤖</div>
          <h2>你好，我是 NE</h2>
          <p>你的个人 AI 助手</p>
          <p class="welcome-hint">选择一个对话或创建新的开始聊天</p>
        </div>
        
        <template v-else>
          <div v-if="loadingMessages" class="loading-messages">加载中...</div>
          
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="message"
            :class="msg.role"
          >
            <div class="message-avatar">
              {{ msg.role === 'user' ? '👤' : '🤖' }}
            </div>
            <div class="message-bubble" :class="msg.role">
              <div v-if="msg.role === 'assistant'" class="markdown-body" v-html="renderMarkdown(msg.content)"></div>
              <div v-else class="message-text">{{ msg.content }}</div>
            </div>
          </div>
          
          <div v-if="isSending && !streamingContent" class="message assistant">
            <div class="message-avatar">🤖</div>
            <div class="message-bubble assistant">
              <div class="typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
          <div v-if="streamingContent" class="message assistant streaming-message">
            <div class="message-avatar">🤖</div>
            <div class="message-bubble assistant">
              <div class="markdown-body" v-html="renderMarkdown(streamingContent)"></div>
              <span class="streaming-cursor"></span>
            </div>
          </div>
        </template>
      </div>
      
      <!-- Input Area -->
      <div v-if="currentId" class="input-area">
        <div class="input-wrapper">
          <button class="attach-btn" @click="$refs.fileInput.click()" title="添加附件">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6h-1.5v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6H16.5z"/>
            </svg>
          </button>
          <textarea
            ref="inputRef"
            v-model="inputText"
            :placeholder="attachedFiles.length ? `${attachedFiles.length} 个文件已添加` : '输入消息... (Enter 发送, Shift+Enter 换行)'"
            @keydown="handleKeydown"
            @input="autoResize"
            rows="1"
          ></textarea>
          <button class="send-btn" @click="sendMessage" :disabled="(!inputText.trim() && attachedFiles.length === 0) || isSending">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
          <button v-if="isSending" class="stop-btn" @click="stopSending" title="停止回复">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          </button>
          <button class="voice-btn" @click="toggleVoiceInput" :class="{ 'voice-btn--recording': isRecording }" :title="isRecording ? '停止录音' : '语音输入'">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
            </svg>
          </button>
        </div>
        <!-- Attachment preview -->
        <div v-if="attachedFiles.length" class="attachment-preview">
          <div v-for="(file, idx) in attachedFiles" :key="idx" class="attachment-item">
            <span class="attachment-icon">{{ getFileIcon(file) }}</span>
            <span class="attachment-name">{{ file.name }}</span>
            <span class="attachment-size">{{ formatFileSize(file.size) }}</span>
            <button class="attachment-remove" @click="removeFile(idx)">✕</button>
          </div>
        </div>
        <!-- Pasted images preview -->
        <div v-if="pastedImages.length" class="pasted-images-preview">
          <div v-for="img in pastedImages" :key="img.id" class="pasted-image-item">
            <img :src="img.dataUrl" class="pasted-image-thumb" />
            <button class="pasted-image-remove" @click="removePastedImage(img.id)" title="移除">✕</button>
          </div>
        </div>
        <input ref="fileInput" type="file" multiple style="display:none" @change="handleFileSelect" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.json,.xml,.zip,.rar,.7z,.mp3,.mp4" />
      </div>
    </section>
    
    <!-- Context Menu -->
    <transition name="dropdown">
      <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      >
        <button class="context-item" @click="startRename">
          ✏️ 重命名
        </button>
        <button class="context-item danger" @click="deleteConversation">
          🗑️ 删除
        </button>
      </div>
    </transition>
    
    <!-- Rename Modal -->
    <transition name="fade">
      <div v-if="renameModal.visible" class="modal-overlay" @click.self="renameModal.visible = false">
        <div class="modal">
          <h3>重命名对话</h3>
          <input
            v-model="renameModal.title"
            @keydown.enter="confirmRename"
            placeholder="输入新标题"
            ref="renameInputRef"
          />
          <div class="modal-actions">
            <button class="modal-btn cancel" @click="renameModal.visible = false">取消</button>
            <button class="modal-btn confirm" @click="confirmRename">确定</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Delete Confirm Modal -->
    <transition name="fade">
      <div v-if="deleteConfirm.visible" class="modal-overlay" @click.self="deleteConfirm.visible = false">
        <div class="modal delete-modal">
          <div class="delete-icon">🗑️</div>
          <h3>删除对话</h3>
          <p class="delete-text">确定要删除「{{ deleteConfirm.conversation?.title || '新对话' }}」吗？此操作不可恢复。</p>
          <div class="modal-actions">
            <button class="modal-btn cancel" @click="deleteConfirm.visible = false">取消</button>
            <button class="modal-btn danger" @click="confirmDelete">删除</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
defineOptions({ name: 'ChatView' })
import { ref, watch, nextTick, onMounted, onUnmounted, onActivated } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { conversationAPI, messageAPI } from '../api/modules'
import api from '../api/index'
import { marked } from 'marked'

// highlight.js 动态加载
let hljsModule = null
async function loadHljs() {
  if (hljsModule) return hljsModule
  await import('highlight.js/styles/github-dark.css')
  hljsModule = await import('highlight.js')
  return hljsModule.default
}

const router = useRouter()
const route = useRoute()

// Configure marked
marked.setOptions({
  async highlight(code, lang) {
    const hljs = await loadHljs()
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
  breaks: true,
  gfm: true
})

// State
const conversations = ref([])
const messages = ref([])
const currentId = ref(null)
const currentTitle = ref('NE')
const inputText = ref('')
const loading = ref(false)
const loadingMessages = ref(false)
const isSending = ref(false)
const isRecording = ref(false)
const streamingContent = ref('')
let abortController = null

function stopSending() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  isSending.value = false
}
const sidebarOpen = ref(false)

const messagesRef = ref(null)
const inputRef = ref(null)
const renameInputRef = ref(null)

const contextMenu = ref({ visible: false, x: 0, y: 0, conversation: null })
const renameModal = ref({ visible: false, title: '', conversation: null })
const deleteConfirm = ref({ visible: false, conversation: null })
const attachedFiles = ref([])
const pastedImages = ref([]) // 粘贴的图片预览 [{id, dataUrl, name, file}]
const isDragging = ref(false)
const fileInput = ref(null)

// Voice input
let recognition = null
const voiceResult = ref('')

function initRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    alert('您的浏览器不支持语音识别，请使用 Chrome 或 Safari。')
    return null
  }
  const rec = new SpeechRecognition()
  rec.lang = 'zh-CN'
  rec.continuous = false
  rec.interimResults = true
  rec.onresult = (event) => {
    let transcript = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript
    }
    voiceResult.value = transcript
    if (inputText.value) {
      inputText.value += ' ' + transcript
    } else {
      inputText.value = transcript
    }
    autoResize()
  }
  rec.onend = () => {
    isRecording.value = false
    voiceResult.value = ''
  }
  rec.onerror = (event) => {
    console.error('[Voice] Error:', event.error)
    isRecording.value = false
    voiceResult.value = ''
    if (event.error === 'not-allowed') {
      alert('请允许麦克风权限以使用语音输入。')
    }
  }
  return rec
}

function toggleVoiceInput() {
  if (isRecording.value) {
    if (recognition) recognition.stop()
    isRecording.value = false
    return
  }
  if (!recognition) {
    recognition = initRecognition()
    if (!recognition) return
  }
  voiceResult.value = ''
  recognition.start()
  isRecording.value = true
}

// Format time
function formatTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// Render markdown
function renderMarkdown(content) {
  if (!content) return ''
  try {
    return marked.parse(content)
  } catch {
    return content
  }
}

// Load conversations
async function loadConversations() {
  loading.value = true
  try {
    const res = await conversationAPI.list()
    const data = res.data
    conversations.value = data.conversations || data || []
    
    // Auto-create conversation if none exists
    if (conversations.value.length === 0 && !currentId.value) {
      await createConversation()
    }
  } catch {
    // silently fail
  } finally {
    loading.value = false
  }
}

// Load messages
async function loadMessages() {
  if (!currentId.value) return
  loadingMessages.value = true
  try {
    const res = await messageAPI.list(currentId.value)
    const data = res.data
    messages.value = data.messages || data || []
  } catch {
    messages.value = []
  } finally {
    loadingMessages.value = false
    nextTick(() => scrollToBottom())
  }
}

// Create conversation
async function createConversation() {
  // Abort any ongoing request first
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  isSending.value = false
  streamingContent.value = ''
  
  try {
    const res = await conversationAPI.create()
    const data = res.data
    const conv = data.conversation || data
    conversations.value.unshift(conv)
    await selectConversationAsync(conv.id)
  } catch (err) {
    console.error('[ChatView] Create conversation failed:', err)
  }
}

// Select conversation
async function selectConversationAsync(id) {
  currentId.value = id
  const conv = conversations.value.find(c => c.id == id)
  currentTitle.value = conv?.title || '新对话'
  sidebarOpen.value = false
  router.push(`/chat/${id}`)
  await loadMessages()
}

function selectConversation(id) {
  selectConversationAsync(id)
}

// Delete conversation
async function deleteConversation() {
  if (!contextMenu.value.conversation) return
  try {
    await conversationAPI.delete(contextMenu.value.conversation.id)
    conversations.value = conversations.value.filter(c => c.id !== contextMenu.value.conversation.id)
    if (currentId.value === contextMenu.value.conversation.id) {
      currentId.value = null
      messages.value = []
      router.push('/chat')
    }
    contextMenu.value.visible = false
  } catch (err) {
    console.error('[ChatView] Delete failed:', err)
    alert('删除失败：' + (err.response?.data?.error || err.message || '未知错误'))
  }
}

// Quick delete with confirmation (mobile-friendly)
function quickDelete(conv) {
  deleteConfirm.value = { visible: true, conversation: conv }
}

async function confirmDelete() {
  if (!deleteConfirm.value.conversation) return
  try {
    await conversationAPI.delete(deleteConfirm.value.conversation.id)
    conversations.value = conversations.value.filter(c => c.id !== deleteConfirm.value.conversation.id)
    if (currentId.value === deleteConfirm.value.conversation.id) {
      currentId.value = null
      messages.value = []
      router.push('/chat')
    }
    deleteConfirm.value.visible = false
  } catch (err) {
    console.error('[ChatView] Delete failed:', err)
    alert('删除失败：' + (err.response?.data?.error || err.message || '未知错误'))
  }
}

// Rename
function startRename() {
  renameModal.value.title = contextMenu.value.conversation?.title || ''
  renameModal.value.conversation = contextMenu.value.conversation
  contextMenu.value.visible = false
  renameModal.value.visible = true
  nextTick(() => {
    renameInputRef.value?.focus()
  })
}

async function confirmRename() {
  if (!renameModal.value.conversation) return
  try {
    await conversationAPI.rename(renameModal.value.conversation.id, renameModal.value.title)
    const conv = conversations.value.find(c => c.id === renameModal.value.conversation.id)
    if (conv) {
      conv.title = renameModal.value.title
      if (currentId.value === conv.id) {
        currentTitle.value = renameModal.value.title
      }
    }
  } catch {
    // silently fail
  }
  renameModal.value.visible = false
}

// Auto-generate conversation title via AI
async function generateConversationTitle(convId) {
  try {
    const res = await conversationAPI.generateTitle(convId)
    const title = res.data.title || '新对话'
    const conv = conversations.value.find(c => c.id == convId)
    if (conv) {
      conv.title = title
      if (currentId.value == convId) {
        currentTitle.value = title
      }
    }
  } catch {
    // silently fail, keep default title
  }
}

// File handling
function getFileIcon(file) {
  const name = file.name.toLowerCase()
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)) return '🖼️'
  if (/\.pdf$/i.test(name)) return '📄'
  if (/\.(doc|docx)$/i.test(name)) return '📝'
  if (/\.(xls|xlsx|csv)$/i.test(name)) return '📊'
  if (/\.(ppt|pptx)$/i.test(name)) return '📽️'
  if (/\.(zip|rar|7z)$/i.test(name)) return '📦'
  if (/\.(mp3|mp4|wav)$/i.test(name)) return '🎵'
  if (/\.(txt|md|json|xml|html|css|js|py|java|c|cpp)$/i.test(name)) return '📄'
  return '📎'
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

async function handleFileSelect(e) {
  const files = Array.from(e.target.files)
  for (const file of files) {
    // Preview images locally
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name)) {
      attachedFiles.value.push({
        name: file.name,
        size: file.size,
        type: file.type,
        preview: URL.createObjectURL(file),
        raw: file
      })
    } else {
      // For text files, read content
      if (file.size < 100 * 1024 && /\.(txt|md|json|xml|html|css|js|py|java|c|cpp|csv)$/i.test(file.name)) {
        try {
          const text = await file.text()
          attachedFiles.value.push({ name: file.name, size: file.size, type: file.type, content: text, raw: file })
        } catch {
          attachedFiles.value.push({ name: file.name, size: file.size, type: file.type, raw: file })
        }
      } else {
        attachedFiles.value.push({ name: file.name, size: file.size, type: file.type, raw: file })
      }
    }
  }
  e.target.value = ''
}

function removeFile(idx) {
  const f = attachedFiles.value[idx]
  if (f?.preview) URL.revokeObjectURL(f.preview)
  attachedFiles.value.splice(idx, 1)
}

function onDragOver(e) {
  isDragging.value = true
}

function onDrop(e) {
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (!files || !files.length) return
  if (!currentId.value) {
    // Auto-create new conversation if none selected
    createConversation()
  }
  for (const file of files) {
    const item = { name: file.name, size: file.size, type: file.type, file }
    if (/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.name)) {
      item.preview = URL.createObjectURL(file)
    } else if (file.size < 500000) {
      const reader = new FileReader()
      reader.onload = () => { item.content = reader.result }
      reader.readAsText(file)
    }
    attachedFiles.value.push(item)
  }
}

async function uploadFile(file) {
  const formData = new FormData()
  formData.append('file', file.raw)
  const res = await api.post('/api/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return res.data
}

// Send message (streaming)
async function sendMessage() {
  if ((!inputText.value.trim() && attachedFiles.value.length === 0 && pastedImages.value.length === 0) || !currentId.value || isSending.value) return

  const content = inputText.value.trim()
  const files = [...attachedFiles.value]
  const images = [...pastedImages.value]
  inputText.value = ''
  attachedFiles.value = []
  pastedImages.value = []
  nextTick(() => autoResize())

  // Build message content with attachments and pasted images
  let finalContent = content
  const mediaParts = []
  
  // Process pasted images first
  if (images.length > 0) {
    isSending.value = true
    for (const img of images) {
      try {
        const uploaded = await uploadFile({ raw: img.file })
        mediaParts.push(`![${img.name}](${uploaded.url})`)
      } catch {
        mediaParts.push(`📎 ${img.name} (上传失败)`)
      }
    }
  }
  
  // Process attached files
  if (files.length > 0) {
    isSending.value = true
    for (const file of files) {
      try {
        const uploaded = await uploadFile(file)
        if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name)) {
          mediaParts.push(`![${file.name}](${uploaded.url})`)
        } else if (file.content) {
          mediaParts.push(`**📄 ${file.name}**\n\`\`\`\n${file.content.slice(0, 10000)}\n\`\`\``)
        } else {
          mediaParts.push(`📎 [${file.name}](${uploaded.url}) (${formatFileSize(file.size)})`)
        }
      } catch {
        mediaParts.push(`📎 ${file.name} (上传失败)`)
      }
    }
  }
  
  if (mediaParts.length > 0) {
    finalContent = (finalContent ? finalContent + '\n\n' : '') + mediaParts.join('\n')
  }

  if (!finalContent.trim()) {
    isSending.value = false
    return
  }

  // Optimistic add user message
  messages.value.push({
    id: Date.now(),
    role: 'user',
    content: finalContent,
    createdAt: new Date().toISOString()
  })
  scrollToBottom()

  // Start streaming
  isSending.value = true
  streamingContent.value = ''
  abortController = new AbortController()

  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/conversations/${currentId.value}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ content: finalContent }),
      signal: abortController.signal
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let accumulated = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep incomplete last line in buffer
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)

        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          if (parsed.error) {
            messages.value.push({
              id: Date.now() + 1,
              role: 'assistant',
              content: `抱歉，${parsed.error}`,
              createdAt: new Date().toISOString()
            })
            scrollToBottom()
            streamingContent.value = ''
            isSending.value = false
            abortController = null
            return
          }
          if (parsed.content) {
            accumulated += parsed.content
            streamingContent.value = accumulated
            // Throttle scroll for performance
            if (accumulated.length % 10 === 0) scrollToBottom()
          }
          if (parsed.done) {
            // Stream complete — message was saved by backend
            streamingContent.value = ''
            messages.value.push({
              id: Date.now() + 1,
              role: 'assistant',
              content: accumulated,
              createdAt: new Date().toISOString()
            })
            scrollToBottom()

            // Update conversation order
            const conv = conversations.value.find(c => c.id == currentId.value)
            if (conv) {
              conv.updatedAt = new Date().toISOString()
              conversations.value.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
              if (conv.title === '新对话') {
                generateConversationTitle(currentId.value)
              }
            }
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }

    // If stream ended without a `done` event (e.g. aborted), save what we have
    if (streamingContent.value) {
      const partialContent = streamingContent.value
      streamingContent.value = ''
      if (partialContent) {
        messages.value.push({
          id: Date.now() + 1,
          role: 'assistant',
          content: partialContent,
          createdAt: new Date().toISOString()
        })
        scrollToBottom()
      }
    }
  } catch (err) {
    streamingContent.value = ''
    if (err.name !== 'AbortError') {
      messages.value.push({
        id: Date.now() + 1,
        role: 'assistant',
        content: '抱歉，发送失败，请重试。',
        createdAt: new Date().toISOString()
      })
      scrollToBottom()
    }
  } finally {
    streamingContent.value = ''
    isSending.value = false
    abortController = null
  }
}

// Scroll
function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

function handleScroll() {
  // Future: implement scroll-to-top loading
}

// Input handling
function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function autoResize() {
  const textarea = inputRef.value
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
}

// ===== PASTE IMAGE =====
function handlePaste(e) {
  const items = e.clipboardData?.items
  if (!items) return
  
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) continue
      
      const reader = new FileReader()
      reader.onload = (ev) => {
        const id = Date.now() + Math.random()
        pastedImages.value.push({
          id,
          dataUrl: ev.target.result,
          name: `pasted-image-${id.toString().slice(-4)}.png`,
          file,
          raw: file
        })
      }
      reader.readAsDataURL(file)
    }
  }
}

function removePastedImage(id) {
  pastedImages.value = pastedImages.value.filter(img => img.id !== id)
}

// Context menu
function showContextMenu(e, conv) {
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, conversation: conv }
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

// Watch route
watch(() => route.params.id, (id) => {
  if (id) {
    const conv = conversations.value.find(c => c.id == id)
    if (conv) {
      currentId.value = id
      currentTitle.value = conv.title || '新对话'
      // loadMessages is already called by selectConversationAsync
    }
  } else {
    currentId.value = null
    messages.value = []
  }
})

// Click outside to close context menu
function handleGlobalClick(e) {
  if (contextMenu.value.visible) {
    closeContextMenu()
  }
}

// When activated (navigated back via keep-alive), auto-select latest conversation
onActivated(() => {
  if (conversations.value.length > 0 && !currentId.value) {
    const latest = conversations.value[0]
    selectConversation(latest.id)
  } else if (conversations.value.length > 0 && currentId.value) {
    // Ensure current conversation is still in the list, if not select latest
    const exists = conversations.value.find(c => c.id == currentId.value)
    if (!exists) {
      const latest = conversations.value[0]
      selectConversation(latest.id)
    }
  }
})

onMounted(() => {
  loadConversations()
  document.addEventListener('click', handleGlobalClick)
  
  // Paste image handler
  if (inputRef.value) {
    inputRef.value.addEventListener('paste', handlePaste)
  }
  
  // Watch for conversations loaded, then auto-select most recent
  const unwatch = watch(conversations, (convs) => {
    if (convs.length > 0) {
      // If URL has an id, select that conversation
      if (route.params.id) {
        const conv = convs.find(c => c.id == route.params.id)
        if (conv) {
          currentId.value = conv.id
          currentTitle.value = conv.title || '新对话'
          loadMessages()
          unwatch()
          return
        }
      }
      // Otherwise, auto-select the most recent conversation
      const latest = convs[0]
      if (latest) {
        selectConversation(latest.id)
      }
      unwatch()
    }
    // If still no conversations after load, the auto-create in loadConversations
    // will handle it by adding a greeting message
  })
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
  if (inputRef.value) {
    inputRef.value.removeEventListener('paste', handlePaste)
  }
})
</script>

<style scoped>
.chat-page {
  display: flex;
  height: 100%;
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  width: var(--sidebar-width);
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: transform var(--transition-slow);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.sidebar-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.new-chat-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent);
  color: #ffffff;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition);
}

.new-chat-btn:hover {
  background: var(--accent-hover);
  transform: scale(1.1);
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.conv-item {
  padding: 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition);
  margin-bottom: 2px;
}

.conv-item:hover {
  background: var(--bg-hover);
}

.conv-item.active {
  background: var(--accent-light);
  border-left: 3px solid var(--accent);
}

.conv-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}

.conv-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-time {
  font-size: 11px;
  color: var(--text-muted);
}

.conv-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 40px 20px;
}

/* Delete button on conversation item */
.conv-delete-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition);
  cursor: pointer;
  flex-shrink: 0;
}

.conv-item {
  position: relative;
}

/* Desktop: show on hover */
@media (min-width: 769px) {
  .conv-delete-btn {
    opacity: 0;
  }
  .conv-item:hover .conv-delete-btn {
    opacity: 1;
  }
}

/* Mobile: always show but subtle */
@media (max-width: 768px) {
  .conv-delete-btn {
    opacity: 0.5;
  }
}

.conv-delete-btn:hover {
  background: rgba(231, 76, 60, 0.15);
  color: var(--danger);
}

/* Delete modal */
.delete-modal {
  text-align: center;
}

.delete-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.delete-text {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 20px;
  line-height: 1.5;
}

.modal-btn.danger {
  background: var(--danger);
  color: #ffffff;
}

.modal-btn.danger:hover {
  opacity: 0.9;
}

.sidebar-overlay {
  display: none;
}

/* Chat Area */
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg-primary);
}

.chat-header {
  display: none;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

.sidebar-toggle {
  font-size: 20px;
  color: var(--text-secondary);
  padding: 4px;
}

.chat-header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Messages */
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  scroll-behavior: smooth;
  position: relative;
}

.messages-container.drag-over {
  outline: 2px dashed var(--accent);
  outline-offset: -4px;
  background: var(--accent-alpha, rgba(59, 130, 246, 0.04));
}

.drop-overlay {
  position: sticky;
  top: 20px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 32px;
  background: var(--card);
  border: 2px dashed var(--accent);
  border-radius: 12px;
  color: var(--accent);
  font-size: 15px;
  font-weight: 500;
  pointer-events: none;
}

.drop-overlay .drop-icon {
  font-size: 32px;
}

.welcome-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-muted);
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.welcome-screen h2 {
  font-size: 24px;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.welcome-hint {
  margin-top: 16px;
  font-size: 14px;
}

.loading-messages {
  text-align: center;
  color: var(--text-muted);
  padding: 40px;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  max-width: 800px;
}

.message.user {
  flex-direction: row-reverse;
  margin-left: auto;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #0d0d15;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.message-bubble {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  line-height: 1.6;
  word-break: break-word;
}

.message-bubble.user {
  background: var(--user-bubble);
  color: var(--user-bubble-text);
  border-bottom-right-radius: 4px;
}

.message-bubble.assistant {
  background: var(--ai-bubble);
  color: var(--ai-bubble-text);
  border-bottom-left-radius: 4px;
}

.message-text {
  white-space: pre-wrap;
}

/* Markdown in messages */
.markdown-body {
  font-size: 14px;
  line-height: 1.7;
}

.markdown-body :deep(p) {
  margin-bottom: 8px;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(pre) {
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  padding: 14px;
  overflow-x: auto;
  margin: 8px 0;
}

.markdown-body :deep(code) {
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 13px;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 20px;
  margin: 8px 0;
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--accent);
  padding-left: 12px;
  margin: 8px 0;
  color: var(--text-secondary);
}

.markdown-body :deep(a) {
  color: #a29bfe;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--bg-tertiary);
}

/* Typing Indicator */
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 4px 0;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: typing 1.4s infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-8px);
    opacity: 1;
  }
}

/* Streaming cursor */
.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--accent);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink-cursor 0.8s step-end infinite;
}

@keyframes blink-cursor {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* Input Area */
.input-area {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-secondary);
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  max-width: 800px;
  margin: 0 auto;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 8px 12px;
  transition: border-color var(--transition);
}

.input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.input-wrapper textarea {
  flex: 1;
  border: none;
  background: transparent;
  resize: none;
  padding: 6px 0;
  max-height: 200px;
  line-height: 1.5;
}

.input-wrapper textarea:focus {
  box-shadow: none;
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--transition);
}

.send-btn:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: scale(1.05);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.stop-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #ef4444;
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: all var(--transition);
  margin-left: 6px;
  animation: pulse-stop 1.5s ease-in-out infinite;
}

.stop-btn:hover {
  background: #dc2626;
  transform: scale(1.05);
}

@keyframes pulse-stop {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
}

.voice-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: all var(--transition);
  margin-left: 6px;
}

.voice-btn:hover {
  transform: scale(1.05);
}

.voice-btn--recording {
  background: #ef4444;
  animation: pulse-voice 1.5s ease-in-out infinite;
}

@keyframes pulse-voice {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
}

/* Context Menu */
.context-menu {
  position: fixed;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px var(--shadow);
  overflow: hidden;
  z-index: 300;
  min-width: 140px;
}

.context-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all var(--transition);
}

.context-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.context-item.danger:hover {
  color: var(--danger);
  background: rgba(231, 76, 60, 0.1);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 400;
  padding: 20px;
}

.modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 24px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 16px 48px var(--shadow);
}

.modal h3 {
  font-size: 18px;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.modal input {
  margin-bottom: 16px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.modal-btn {
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
}

.modal-btn.cancel {
  color: var(--text-secondary);
}

.modal-btn.cancel:hover {
  background: var(--bg-hover);
}

.modal-btn.confirm {
  background: var(--accent);
  color: #ffffff;
}

.modal-btn.confirm:hover {
  background: var(--accent-hover);
}

/* Attachment styles */
.attachment-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px 0;
  max-width: 800px;
  margin: 0 auto;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
  max-width: 250px;
}

.attachment-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.attachment-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
  font-weight: 500;
}

.attachment-size {
  color: var(--text-muted);
  font-size: 11px;
  flex-shrink: 0;
}

.attachment-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0 2px;
  font-size: 12px;
  flex-shrink: 0;
}

.attachment-remove:hover {
  color: var(--danger);
}

/* Pasted images preview */
.pasted-images-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px 0;
  max-width: 800px;
  margin: 0 auto;
}

.pasted-image-item {
  position: relative;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border);
}

.pasted-image-thumb {
  max-width: 120px;
  max-height: 80px;
  display: block;
  object-fit: contain;
  background: var(--bg-tertiary);
}

.pasted-image-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0,0,0,0.6);
  border: none;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.pasted-image-remove:hover {
  background: var(--danger);
}

.attachment-remove:hover {
  color: var(--danger);
}

.attach-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: none;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--transition);
}

.attach-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Responsive */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    top: var(--navbar-height);
    left: 0;
    bottom: var(--bottom-tab-height);
    z-index: 90;
    transform: translateX(-100%);
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 89;
  }

  .chat-header {
    display: flex;
  }

  .message-bubble {
    max-width: 85%;
  }

  .messages-container {
    padding: 12px;
  }

  .input-area {
    padding: 12px 16px;
  }
}

@media (max-width: 480px) {
  .messages-container {
    padding: 8px;
  }

  .message {
    gap: 8px;
    margin-bottom: 14px;
  }

  .message-avatar {
    width: 30px;
    height: 30px;
    font-size: 15px;
  }

  .message-bubble {
    padding: 10px 14px;
    font-size: 14px;
  }

  .input-area {
    padding: 8px 12px;
  }
}

/* ===== Enhanced Visual Effects (v1.0.0) ===== */

/* Gradient accent for key elements */
.accent-gradient {
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Enhanced message bubble for user */
.message.user .message-bubble {
  background: var(--user-bubble);
  color: var(--user-bubble-text);
  box-shadow: 0 4px 15px rgba(108, 92, 231, 0.3);
  position: relative;
  overflow: hidden;
}

.message.user .message-bubble::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
  animation: shimmer 3s infinite;
}

@keyframes shimmer {
  0% { left: -100%; }
  100% { left: 200%; }
}

/* AI message bubble enhancement */
.message.assistant .message-bubble {
  background: var(--ai-bubble);
  border: 1px solid var(--border-light);
  box-shadow: 0 2px 8px var(--shadow-light);
}

/* Enhanced send button */
.send-btn {
  background: var(--accent-gradient);
  box-shadow: var(--accent-glow);
  transition: all var(--transition);
}

.send-btn:hover:not(:disabled) {
  transform: scale(1.1);
  box-shadow: var(--accent-glow-strong);
}

/* Enhanced input area */
.input-wrapper {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: 0 4px 20px var(--shadow), inset 0 1px 0 rgba(255,255,255,0.05);
  transition: all var(--transition);
}

.input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 4px 20px var(--shadow), 0 0 0 3px var(--accent-light), inset 0 1px 0 rgba(255,255,255,0.05);
}

/* Enhanced conversation list item */
.conversation-item {
  position: relative;
  overflow: hidden;
  transition: all var(--transition);
}

.conversation-item::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 2px;
  background: var(--accent-gradient);
  transition: width var(--transition);
  border-radius: 2px;
}

.conversation-item:hover::after,
.conversation-item.active::after {
  width: 80%;
}

/* Enhanced new chat button */
.new-chat-btn {
  background: var(--accent-gradient);
  color: #fff;
  font-weight: 600;
  box-shadow: var(--accent-glow);
  transition: all var(--transition);
}

.new-chat-btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--accent-glow-strong);
}

/* Message typing indicator */
.typing-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  background: var(--text-muted);
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) { animation-delay: 0s; }
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-6px); opacity: 1; }
}

/* Loading animation for messages */
.message-loading {
  animation: fadeInUp 0.3s ease;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Version badge */
.version-badge {
  font-size: 10px;
  padding: 2px 8px;
  background: var(--accent-gradient);
  color: #fff;
  border-radius: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
</style>
