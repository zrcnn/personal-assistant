import { defineStore } from 'pinia'
import { ref } from 'vue'
import { conversationAPI, messageAPI } from '../api/modules'
import api from '../api/index'

export const useChatStore = defineStore('chat', () => {
  // --- State ---
  const conversations = ref([])
  const messages = ref([])
  const currentId = ref(null)
  const currentTitle = ref('NE')
  const loading = ref(false)
  const loadingMessages = ref(false)
  const isSending = ref(false)
  const sidebarOpen = ref(false)
  const attachedFiles = ref([])

  // --- Conversations ---
  async function loadConversations() {
    loading.value = true
    try {
      const res = await conversationAPI.list()
      const data = res.data
      conversations.value = data.conversations || data || []
    } catch {
      // silently fail
    } finally {
      loading.value = false
    }
  }

  async function createConversation() {
    try {
      const res = await conversationAPI.create()
      const data = res.data
      const conv = data.conversation || data
      conversations.value.unshift(conv)
      return conv
    } catch {
      return null
    }
  }

  async function deleteConversation(id) {
    try {
      await conversationAPI.delete(id)
      conversations.value = conversations.value.filter(c => c.id !== id)
      if (currentId.value === id) {
        currentId.value = null
        messages.value = []
        currentTitle.value = 'NE'
      }
      return true
    } catch {
      return false
    }
  }

  async function renameConversation(id, title) {
    try {
      await conversationAPI.rename(id, title)
      const conv = conversations.value.find(c => c.id === id)
      if (conv) {
        conv.title = title
        if (currentId.value === id) {
          currentTitle.value = title
        }
      }
      return true
    } catch {
      return false
    }
  }

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

  // --- Messages ---
  async function loadMessages(convId) {
    const id = convId || currentId.value
    if (!id) return
    loadingMessages.value = true
    try {
      const res = await messageAPI.list(id)
      const data = res.data
      messages.value = data.messages || data || []
    } catch {
      messages.value = []
    } finally {
      loadingMessages.value = false
    }
  }

  function selectConversation(id) {
    currentId.value = id
    const conv = conversations.value.find(c => c.id == id)
    currentTitle.value = conv?.title || '新对话'
    sidebarOpen.value = false
    loadMessages(id)
  }

  function clearCurrent() {
    currentId.value = null
    messages.value = []
  }

  // --- File upload ---
  async function uploadFile(file) {
    const formData = new FormData()
    formData.append('file', file.raw)
    const res = await api.post('/api/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return res.data
  }

  // --- Send message ---
  // This function is kept alive by the Pinia store.
  // Even if the ChatView component is unmounted (page switched),
  // the promise continues running and updates store.messages on completion.
  async function sendMessage(content, files) {
    if (!content.trim() && files.length === 0) return
    if (!currentId.value || isSending.value) return

    let finalContent = content

    // Upload files first
    if (files.length > 0) {
      const fileParts = []
      for (const file of files) {
        try {
          const uploaded = await uploadFile(file)
          if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name)) {
            fileParts.push(`![${file.name}](${uploaded.url})`)
          } else if (file.content) {
            fileParts.push(`**📄 ${file.name}**\n\`\`\`\n${file.content.slice(0, 10000)}\n\`\`\``)
          } else {
            fileParts.push(`📎 [${file.name}](${uploaded.url}) (${formatFileSize(file.size)})`)
          }
        } catch {
          fileParts.push(`📎 ${file.name} (上传失败)`)
        }
      }
      if (fileParts.length > 0) {
        finalContent = (finalContent ? finalContent + '\n\n' : '') + fileParts.join('\n')
      }
    }

    if (!finalContent.trim()) return

    // Optimistic add user message
    messages.value.push({
      id: Date.now(),
      role: 'user',
      content: finalContent,
      createdAt: new Date().toISOString()
    })

    isSending.value = true
    try {
      const res = await messageAPI.send(currentId.value, finalContent)
      const data = res.data
      const msg = data.message || data
      messages.value.push(msg)

      // Update conversation order
      const conv = conversations.value.find(c => c.id == currentId.value)
      if (conv) {
        conv.updatedAt = new Date().toISOString()
        conversations.value.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

        // Auto-generate title after first assistant reply if still named "新对话"
        if (conv.title === '新对话') {
          generateConversationTitle(currentId.value)
        }
      }
    } catch {
      messages.value.push({
        id: Date.now() + 1,
        role: 'assistant',
        content: '抱歉，发送失败，请重试。',
        createdAt: new Date().toISOString()
      })
    } finally {
      isSending.value = false
    }
  }

  // --- Helpers ---
  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  function findConversation(id) {
    return conversations.value.find(c => c.id == id)
  }

  return {
    // State
    conversations,
    messages,
    currentId,
    currentTitle,
    loading,
    loadingMessages,
    isSending,
    sidebarOpen,
    attachedFiles,
    // Actions
    loadConversations,
    createConversation,
    deleteConversation,
    renameConversation,
    generateConversationTitle,
    loadMessages,
    selectConversation,
    clearCurrent,
    sendMessage,
    uploadFile,
    findConversation,
    formatFileSize,
  }
})
