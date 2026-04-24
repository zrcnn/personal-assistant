<template>
  <div class="messages-page">
    <!-- Desktop version -->
    <div class="messages-container desktop-only">
      <!-- Left: Tab navigation + list -->
      <div class="conv-sidebar">
        <div class="sidebar-tabs">
          <button class="tab-btn" :class="{ active: activeTab === 'direct' }" @click="activeTab = 'direct'">💬 私聊</button>
          <button class="tab-btn" :class="{ active: activeTab === 'group' }" @click="activeTab = 'group'">👥 群聊</button>
        </div>
        <div class="conv-header">
          <h3>{{ activeTab === 'direct' ? '消息' : '群聊' }}</h3>
          <button class="new-conv-btn" @click="handleNewAction" :title="activeTab === 'direct' ? '发起新对话' : '创建新群聊'">
            {{ activeTab === 'direct' ? '✉️' : '➕' }}
          </button>
        </div>
        <!-- Direct message list -->
        <div class="conv-list" v-show="activeTab === 'direct'">
          <div v-for="conv in conversations" :key="conv.id" class="conv-item" :class="{ active: selectedConvId === conv.id }" @click="selectConversation(conv)">
            <div class="conv-avatar">{{ conv.other_user.username.charAt(0).toUpperCase() }}</div>
            <div class="conv-info">
              <div class="conv-top">
                <span class="conv-name">{{ conv.other_user.username }}</span>
                <span class="conv-time">{{ formatTime(conv.last_message_time) }}</span>
              </div>
              <div class="conv-bottom">
                <span class="conv-last-msg">{{ truncate(conv.last_message, 20) }}</span>
                <span v-if="conv.unread_count > 0" class="conv-badge">{{ conv.unread_count > 99 ? '99+' : conv.unread_count }}</span>
              </div>
            </div>
          </div>
          <div v-if="conversations.length === 0" class="conv-empty"><p>暂无对话</p><p class="conv-empty-hint">点击 ✉️ 发起新对话</p></div>
        </div>
        <!-- Group chat list -->
        <div class="conv-list" v-show="activeTab === 'group'">
          <div v-for="group in groups" :key="group.id" class="conv-item group-item" :class="{ active: selectedGroupId === group.id }" @click="selectGroup(group)">
            <div class="conv-avatar group-avatar"><span>{{ group.member_count || 0 }}</span></div>
            <div class="conv-info">
              <div class="conv-top">
                <span class="conv-name">{{ group.name }}</span>
                <span class="conv-time">{{ formatTime(group.last_message_time || group.updated_at) }}</span>
              </div>
              <div class="conv-bottom">
                <span class="conv-last-msg">{{ truncate(group.last_message, 20) }}</span>
                <span v-if="group.unread_count > 0" class="conv-badge">{{ group.unread_count > 99 ? '99+' : group.unread_count }}</span>
              </div>
            </div>
          </div>
          <div v-if="groups.length === 0" class="conv-empty"><p>暂无群聊</p><p class="conv-empty-hint">点击 ➕ 创建新群聊</p></div>
        </div>
      </div>
      <!-- Right: Chat window -->
      <div class="chat-window">
        <template v-if="activeTab === 'direct' && currentConv">
          <div class="chat-header">
            <div class="chat-header-avatar">{{ currentConv.other_user.username.charAt(0).toUpperCase() }}</div>
            <span class="chat-header-name">{{ currentConv.other_user.username }}</span>
          </div>
          <div class="chat-messages" ref="messagesRef">
            <div v-for="msg in messages" :key="msg.id" class="msg-row" :class="{ mine: msg.sender_id === myUserId }">
              <div class="msg-bubble">
                <div class="msg-content">{{ msg.content }}</div>
                <div class="msg-meta">
                  <span class="msg-time">{{ formatMessageTime(msg.created_at) }}</span>
                  <span v-if="msg.sender_id === myUserId && msg.read_at" class="msg-read">已读</span>
                  <span v-else-if="msg.sender_id === myUserId" class="msg-sent">已发送</span>
                </div>
              </div>
            </div>
            <div v-if="messages.length === 0" class="chat-empty"><p>暂无消息，发送第一条吧 ✨</p></div>
          </div>
          <div class="chat-input-area">
            <textarea ref="inputRef" v-model="inputText" placeholder="输入消息..." rows="1" @keydown.enter.prevent="handleSendKey" @input="autoResize"></textarea>
            <button class="send-btn" :disabled="!inputText.trim() || sending" @click="sendMessage">{{ sending ? '...' : '发送' }}</button>
          </div>
        </template>
        <template v-else-if="activeTab === 'group' && currentGroup">
          <div class="chat-header">
            <div class="chat-header-avatar group-avatar"><span>{{ currentGroup.member_count || 0 }}</span></div>
            <div class="chat-header-info">
              <span class="chat-header-name">{{ currentGroup.name }}</span>
              <span class="chat-header-sub">{{ currentGroup.member_count || 0 }} 名成员</span>
            </div>
          </div>
          <div class="chat-messages" ref="groupMessagesRef">
            <div v-for="msg in groupMessages" :key="msg.id" class="msg-row" :class="{ mine: msg.sender_id === myUserId }">
              <div class="msg-avatar" v-if="!msg.mine"><div class="msg-sender-avatar">{{ (msg.sender?.username || 'U').charAt(0).toUpperCase() }}</div></div>
              <div class="msg-bubble" :class="{ 'group-msg': !msg.mine }">
                <div class="msg-sender-name" v-if="!msg.mine">{{ msg.sender?.username || '未知用户' }}</div>
                <div class="msg-content">{{ msg.content }}</div>
                <div class="msg-meta"><span class="msg-time">{{ formatMessageTime(msg.created_at) }}</span></div>
              </div>
            </div>
            <div v-if="groupMessages.length === 0" class="chat-empty"><p>暂无消息，发送第一条吧 ✨</p></div>
          </div>
          <div class="chat-input-area">
            <textarea ref="groupInputRef" v-model="groupInputText" placeholder="在群聊中输入消息..." rows="1" @keydown.enter.prevent="handleGroupSendKey" @input="autoResize"></textarea>
            <button class="send-btn" :disabled="!groupInputText.trim() || sending" @click="sendGroupMessage">{{ sending ? '...' : '发送' }}</button>
          </div>
        </template>
        <div v-else class="chat-placeholder"><div class="chat-placeholder-icon">{{ activeTab === 'direct' ? '💬' : '👥' }}</div><p>选择{{ activeTab === 'direct' ? '一个对话' : '一个群聊' }}开始聊天</p></div>
      </div>
    </div>

    <!-- Mobile version -->
    <div class="mobile-container mobile-only">
      <!-- List view -->
      <div v-if="!selectedConvId && !selectedGroupId" class="mobile-list-view">
        <div class="mobile-header">
          <div class="sidebar-tabs mobile-tabs">
            <button class="tab-btn" :class="{ active: activeTab === 'direct' }" @click="activeTab = 'direct'">💬 私聊</button>
            <button class="tab-btn" :class="{ active: activeTab === 'group' }" @click="activeTab = 'group'">👥 群聊</button>
          </div>
          <button class="new-conv-btn" @click="handleNewAction">{{ activeTab === 'direct' ? '✉️' : '➕' }}</button>
        </div>
        <div class="mobile-list">
          <!-- Direct messages -->
          <div v-if="activeTab === 'direct'">
            <div v-for="conv in conversations" :key="conv.id" class="mobile-conv-item" @click="selectConversation(conv)">
              <div class="conv-avatar">{{ conv.other_user.username.charAt(0).toUpperCase() }}</div>
              <div class="conv-info">
                <div class="conv-top">
                  <span class="conv-name">{{ conv.other_user.username }}</span>
                  <span class="conv-time">{{ formatTime(conv.last_message_time) }}</span>
                </div>
                <div class="conv-bottom">
                  <span class="conv-last-msg">{{ truncate(conv.last_message, 30) }}</span>
                  <span v-if="conv.unread_count > 0" class="conv-badge">{{ conv.unread_count > 99 ? '99+' : conv.unread_count }}</span>
                </div>
              </div>
            </div>
            <div v-if="conversations.length === 0" class="conv-empty"><p>暂无对话</p></div>
          </div>
          <!-- Group chats -->
          <div v-if="activeTab === 'group'">
            <div v-for="group in groups" :key="group.id" class="mobile-conv-item" @click="selectGroup(group)">
              <div class="conv-avatar group-avatar"><span>{{ group.member_count || 0 }}</span></div>
              <div class="conv-info">
                <div class="conv-top">
                  <span class="conv-name">{{ group.name }}</span>
                  <span class="conv-time">{{ formatTime(group.last_message_time || group.updated_at) }}</span>
                </div>
                <div class="conv-bottom">
                  <span class="conv-last-msg">{{ truncate(group.last_message, 30) }}</span>
                  <span v-if="group.unread_count > 0" class="conv-badge">{{ group.unread_count > 99 ? '99+' : group.unread_count }}</span>
                </div>
              </div>
            </div>
            <div v-if="groups.length === 0" class="conv-empty"><p>暂无群聊</p></div>
          </div>
        </div>
      </div>

      <!-- Chat view (mobile) -->
      <div v-else class="mobile-chat-view">
        <div class="mobile-chat-header">
          <button class="back-btn" @click="goBackToList">← 返回</button>
          <div class="chat-header-info-mobile">
            <span class="chat-header-name">{{ activeTab === 'direct' ? currentConv?.other_user.username : currentGroup?.name }}</span>
            <span class="chat-header-sub" v-if="activeTab === 'group'">{{ currentGroup?.member_count || 0 }} 名成员</span>
          </div>
        </div>
        <!-- Direct message chat -->
        <div v-if="activeTab === 'direct' && currentConv" class="mobile-chat-messages" ref="mobileMessagesRef">
          <div v-for="msg in messages" :key="msg.id" class="msg-row" :class="{ mine: msg.sender_id === myUserId }">
            <div class="msg-bubble">
              <div class="msg-content">{{ msg.content }}</div>
              <div class="msg-meta"><span class="msg-time">{{ formatMessageTime(msg.created_at) }}</span></div>
            </div>
          </div>
          <div v-if="messages.length === 0" class="chat-empty"><p>暂无消息，发送第一条吧 ✨</p></div>
        </div>
        <!-- Group chat -->
        <div v-else-if="activeTab === 'group' && currentGroup" class="mobile-chat-messages" ref="mobileMessagesRef">
          <div v-for="msg in groupMessages" :key="msg.id" class="msg-row" :class="{ mine: msg.sender_id === myUserId }">
            <div class="msg-avatar" v-if="!msg.mine"><div class="msg-sender-avatar">{{ (msg.sender?.username || 'U').charAt(0).toUpperCase() }}</div></div>
            <div class="msg-bubble" :class="{ 'group-msg': !msg.mine }">
              <div class="msg-sender-name" v-if="!msg.mine">{{ msg.sender?.username || '未知用户' }}</div>
              <div class="msg-content">{{ msg.content }}</div>
              <div class="msg-meta"><span class="msg-time">{{ formatMessageTime(msg.created_at) }}</span></div>
            </div>
          </div>
          <div v-if="groupMessages.length === 0" class="chat-empty"><p>暂无消息，发送第一条吧 ✨</p></div>
        </div>
        <div class="mobile-chat-input">
          <textarea ref="mobileInputRef" v-model="mobileInputText" placeholder="输入消息..." rows="1" @keydown.enter.prevent="handleMobileSendKey" @input="autoResize"></textarea>
          <button class="send-btn" :disabled="!mobileInputText.trim() || sending" @click="handleMobileSend">发送</button>
        </div>
      </div>
    </div>

    <!-- New conversation modal -->
    <transition name="fade">
      <div v-if="showNewConv" class="modal-overlay" @click.self="showNewConv = false">
        <div class="modal">
          <div class="modal-header">
            <h3>发起新对话</h3>
            <button class="modal-close" @click="showNewConv = false">✕</button>
          </div>
          <div class="modal-body">
            <input v-model="searchQuery" class="search-input" placeholder="搜索用户名..." @input="searchUsers" />
            <div class="user-list">
              <div v-for="u in searchResults" :key="u.id" class="user-item" @click="startConversation(u)">
                <div class="user-item-avatar">{{ u.username.charAt(0).toUpperCase() }}</div>
                <span class="user-item-name">{{ u.username }}</span>
              </div>
              <div v-if="searchQuery && searchResults.length === 0" class="no-results">未找到用户</div>
              <div v-if="!searchQuery" class="search-hint">输入用户名搜索</div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- New group modal -->
    <transition name="fade">
      <div v-if="showNewGroup" class="modal-overlay" @click.self="showNewGroup = false">
        <div class="modal">
          <div class="modal-header">
            <h3>创建群聊</h3>
            <button class="modal-close" @click="showNewGroup = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>群聊名称</label>
              <input v-model="newGroupName" class="search-input" placeholder="输入群聊名称..." maxlength="50" />
            </div>
            <div class="form-group">
              <label>邀请成员</label>
              <input v-model="memberSearchQuery" class="search-input" placeholder="搜索用户名添加成员..." @input="searchMembers" />
              <div class="selected-members" v-if="selectedMembers.length > 0">
                <span v-for="m in selectedMembers" :key="m.id" class="member-tag">{{ m.username }}<span class="remove-member" @click="removeMember(m.id)">✕</span></span>
              </div>
              <div class="user-list">
                <div v-for="u in memberSearchResults" :key="u.id" class="user-item" @click="addMember(u)">
                  <div class="user-item-avatar">{{ u.username.charAt(0).toUpperCase() }}</div>
                  <span class="user-item-name">{{ u.username }}</span>
                  <span class="add-icon">+ 添加</span>
                </div>
              </div>
            </div>
            <button class="create-group-btn" @click="createGroup" :disabled="!newGroupName.trim()">创建群聊</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { userMessagesAPI, groupChatAPI } from '../api/modules'
import { useAuthStore } from '../stores/auth'
import { useMessageStore } from '../stores/message'

const messageStore = useMessageStore()

const authStore = useAuthStore()
const myUserId = ref(null)
const activeTab = ref('direct')

// Direct messages
const conversations = ref([])
const selectedConvId = ref(null)
const currentConv = ref(null)
const messages = ref([])
const inputText = ref('')
const mobileInputText = ref('')
const sending = ref(false)
const showNewConv = ref(false)
const searchQuery = ref('')
const searchResults = ref([])

// Group chats
const groups = ref([])
const selectedGroupId = ref(null)
const currentGroup = ref(null)
const groupMessages = ref([])
const groupInputText = ref('')
const showNewGroup = ref(false)
const newGroupName = ref('')
const selectedMembers = ref([])
const memberSearchQuery = ref('')
const memberSearchResults = ref([])

const messagesRef = ref(null)        // 私聊消息容器
const groupMessagesRef = ref(null)   // 群聊消息容器
const mobileMessagesRef = ref(null)  // 移动版消息容器
const inputRef = ref(null)           // 私聊输入框
const groupInputRef = ref(null)      // 群聊输入框
const mobileInputRef = ref(null)
const convListRef = ref(null)

let ws = null
let reconnectTimer = null
let pollTimer = null

function getUserId() {
  try {
    const token = localStorage.getItem('token')
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.userId || payload.id
  } catch {
    return null
  }
}

async function loadConversations() {
  try {
    const res = await userMessagesAPI.getConversations()
    conversations.value = res.data.conversations
  } catch (err) {
    console.error('Load conversations error:', err)
  }
}

async function loadGroups() {
  try {
    const res = await groupChatAPI.list()
    groups.value = res.data.groups || []
  } catch (err) {
    console.error('Load groups error:', err)
  }
}

async function selectConversation(conv) {
  selectedConvId.value = conv.id
  currentConv.value = conv
  currentGroup.value = null
  messages.value = []
  await loadMessages(conv.id)
  userMessagesAPI.markRead(conv.id).catch(() => {})
  conv.unread_count = 0
  // 确保滚动到最新消息
  await nextTick()
  scrollToBottom()
  // 再次确保（处理可能的竞态条件）
  setTimeout(() => scrollToBottom(), 200)
}

async function selectGroup(group) {
  console.log('[selectGroup] 选择群聊:', group.name, 'ID:', group.id)
  selectedGroupId.value = group.id
  currentGroup.value = group
  currentConv.value = null
  groupMessages.value = []
  await loadGroupMessages(group.id)
  console.log('[selectGroup] 加载了', groupMessages.value.length, '条消息')
  // 标记为已读
  group.unread_count = 0
  // 调用后端API真正标记已读
  groupChatAPI.markRead(group.id).catch(() => {})
  // 更新全局未读计数
  messageStore.setGroupUnreadCount(groups.value.reduce((sum, g) => sum + (g.unread_count || 0), 0))
  // 确保滚动到最新消息
  await nextTick()
  console.log('[selectGroup] 准备滚动到底部')
  scrollToBottom()
  // 再次确保（处理可能的竞态条件）
  setTimeout(() => scrollToBottom(), 200)
}

async function loadMessages(convId) {
  try {
    const res = await userMessagesAPI.getMessages(convId)
    messages.value = res.data.messages || []
  } catch (err) {
    console.error('Load messages error:', err)
  }
}

async function loadGroupMessages(groupId) {
  try {
    const res = await groupChatAPI.getMessages(groupId)
    groupMessages.value = (res.data.messages || []).map(m => ({
      ...m,
      sender: { username: m.sender_username || m.sender_name || 'NE' },
      mine: m.sender_id === myUserId.value
    }))
  } catch (err) {
    console.error('Load group messages error:', err)
  }
}

async function handleSendKey() { await sendMessage() }
async function handleGroupSendKey() { await sendGroupMessage() }
async function handleMobileSendKey() { await handleMobileSend() }

async function sendMessage() {
  const content = inputText.value.trim()
  if (!content || !selectedConvId.value || sending.value) return
  const textToSend = content
  inputText.value = ''
  if (inputRef.value) inputRef.value.style.height = 'auto'
  sending.value = true
  try {
    const res = await userMessagesAPI.sendMessage(selectedConvId.value, textToSend)
    messages.value.push(res.data.message)
    nextTick(() => scrollToBottom())
    const conv = conversations.value.find(c => c.id === selectedConvId.value)
    if (conv) { conv.last_message = textToSend; conv.last_message_time = new Date().toISOString() }
  } catch (err) {
    console.error('Send message error:', err)
    inputText.value = textToSend
  } finally {
    sending.value = false
  }
}

async function sendGroupMessage() {
  const content = groupInputText.value.trim()
  if (!content || !selectedGroupId.value || sending.value) return
  const textToSend = content
  groupInputText.value = ''
  // 重置输入框高度
  if (groupInputRef.value) groupInputRef.value.style.height = 'auto'
  sending.value = true
  try {
    const res = await groupChatAPI.sendMessage(selectedGroupId.value, textToSend)
    groupMessages.value.push({ ...res.data.message, sender: { username: authStore.username }, mine: true })
    nextTick(() => scrollToBottom())
    const group = groups.value.find(g => g.id === selectedGroupId.value)
    if (group) { group.last_message = textToSend; group.last_message_time = new Date().toISOString() }
  } catch (err) {
    console.error('Send group message error:', err)
    groupInputText.value = textToSend
  } finally {
    sending.value = false
  }
}

async function handleMobileSend() {
  const text = mobileInputText.value.trim()
  if (!text) return
  
  if (activeTab.value === 'direct') {
    // 切换到私聊消息发送
    inputText.value = text
    mobileInputText.value = ''
    await sendMessage()
  } else {
    // 切换到群聊消息发送
    groupInputText.value = text
    mobileInputText.value = ''
    await sendGroupMessage()
  }
}

function autoResize(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function scrollToBottom() {
  // 根据当前选中的对话类型和显示模式选择正确的 ref
  let ref = null
  const isMobile = window.innerWidth < 768
  
  if (selectedGroupId.value) {
    // 当前是群聊
    if (isMobile) {
      // 移动版群聊
      ref = mobileMessagesRef.value
      console.log('[scrollToBottom] 使用移动版群聊 mobileMessagesRef', ref ? {
        scrollHeight: ref?.scrollHeight,
        scrollTop: ref?.scrollTop,
        clientHeight: ref?.clientHeight
      } : 'null')
    } else {
      // 桌面版群聊
      ref = groupMessagesRef.value
      console.log('[scrollToBottom] 使用桌面版群聊 groupMessagesRef', ref ? {
        scrollHeight: ref.scrollHeight,
        scrollTop: ref.scrollTop,
        clientHeight: ref.clientHeight
      } : 'null')
    }
  } else if (selectedConvId.value) {
    // 当前是私聊
    if (isMobile) {
      // 移动版私聊
      ref = mobileMessagesRef.value
      console.log('[scrollToBottom] 使用移动版私聊 mobileMessagesRef', ref ? {
        scrollHeight: ref?.scrollHeight,
        scrollTop: ref?.scrollTop,
        clientHeight: ref?.clientHeight
      } : 'null')
    } else {
      // 桌面版私聊
      ref = messagesRef.value
      console.log('[scrollToBottom] 使用桌面版私聊 messagesRef', ref ? {
        scrollHeight: ref.scrollHeight,
        scrollTop: ref.scrollTop,
        clientHeight: ref.clientHeight
      } : 'null')
    }
  } else {
    // 列表页面，没有选中任何对话
    console.log('[scrollToBottom] 未选中任何对话，不需要滚动')
    return
  }
  
  if (!ref) {
    console.warn('[scrollToBottom] 未找到 ref')
    return
  }
  
  // 使用多层 setTimeout 确保 DOM 完全渲染
  setTimeout(() => {
    // 第一次尝试
    console.log('[scrollToBottom] 第1次滚动', ref.scrollHeight)
    ref.scrollTop = ref.scrollHeight
    
    // 第二次尝试（处理可能的渲染延迟）
    setTimeout(() => {
      console.log('[scrollToBottom] 第2次滚动', ref.scrollHeight)
      ref.scrollTop = ref.scrollHeight
      
      // 第三次尝试（确保万无一失）
      setTimeout(() => {
        console.log('[scrollToBottom] 第3次滚动', ref.scrollHeight)
        ref.scrollTop = ref.scrollHeight
        
        // 最终检查
        if (ref.scrollHeight - ref.scrollTop - ref.clientHeight > 50) {
          console.log('[scrollToBottom] 最终检查，强制滚动')
          ref.scrollTop = ref.scrollHeight
        }
      }, 50)
    }, 50)
  }, 50)
}

let searchDebounce = null
function searchUsers() {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(async () => {
    if (!searchQuery.value.trim()) { searchResults.value = []; return }
    try {
      const res = await userMessagesAPI.searchUsers(searchQuery.value.trim())
      searchResults.value = res.data.users
    } catch { searchResults.value = [] }
  }, 300)
}

async function startConversation(user) {
  showNewConv.value = false
  searchQuery.value = ''
  searchResults.value = []
  try {
    const res = await userMessagesAPI.createConversation(user.id)
    const conv = res.data.conversation
    const existing = conversations.value.find(c => c.id === conv.id)
    if (existing) {
      await selectConversation(existing)
    } else {
      const newConv = { id: conv.id, other_user: conv.other_user, last_message: '', last_message_time: null, unread_count: 0 }
      conversations.value.unshift(newConv)
      await selectConversation(newConv)
    }
  } catch (err) {
    console.error('Start conversation error:', err)
  }
}

function handleNewAction() {
  if (activeTab.value === 'direct') { showNewConv.value = true }
  else { showNewGroup.value = true }
}

let memberSearchDebounce = null
function searchMembers() {
  clearTimeout(memberSearchDebounce)
  memberSearchDebounce = setTimeout(async () => {
    if (!memberSearchQuery.value.trim()) { memberSearchResults.value = []; return }
    try {
      const res = await userMessagesAPI.searchUsers(memberSearchQuery.value.trim())
      memberSearchResults.value = res.data.users.filter(u => !selectedMembers.value.find(m => m.id === u.id) && u.id !== myUserId.value)
    } catch { memberSearchResults.value = [] }
  }, 300)
}

function addMember(user) {
  if (!selectedMembers.value.find(m => m.id === user.id)) selectedMembers.value.push(user)
  memberSearchQuery.value = ''
  memberSearchResults.value = []
}

function removeMember(userId) {
  selectedMembers.value = selectedMembers.value.filter(m => m.id !== userId)
}

async function createGroup() {
  if (!newGroupName.value.trim()) return
  sending.value = true
  try {
    const memberIds = selectedMembers.value.map(m => m.id)
    const res = await groupChatAPI.create({ name: newGroupName.value, member_ids: memberIds })
    showNewGroup.value = false
    newGroupName.value = ''
    selectedMembers.value = []
    memberSearchResults.value = []
    const newGroup = res.data.group
    groups.value.unshift(newGroup)
    await selectGroup(newGroup)
  } catch (err) {
    console.error('Create group error:', err)
  } finally {
    sending.value = false
  }
}

function goBackToList() {
  selectedConvId.value = null
  selectedGroupId.value = null
  currentConv.value = null
  currentGroup.value = null
  messages.value = []
  groupMessages.value = []
}

// WebSocket connection
function connectWs() {
  const token = localStorage.getItem('token')
  if (!token) return
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/ws/messages?token=${token}`

  console.log('[MessagesView] 尝试连接 WebSocket:', wsUrl.replace(token, '***'))
  
  try {
    ws = new WebSocket(wsUrl)
    
    ws.onopen = () => {
      console.log('[MessagesView] WebSocket 连接成功')
      // 不清除轮询，让轮询继续运行但会降低频率
    }
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'new_message') {
          if (data.conversation_id === selectedConvId.value) {
            messages.value.push(data.message)
            // 确保新消息显示在底部
            nextTick(() => scrollToBottom())
            setTimeout(() => scrollToBottom(), 100)
            userMessagesAPI.markRead(data.conversation_id).catch(() => {})
          } else {
            const conv = conversations.value.find(c => c.id === data.conversation_id)
            if (conv) { conv.unread_count = (conv.unread_count || 0) + 1; conv.last_message = data.message.content; conv.last_message_time = data.message.created_at }
            else loadConversations()
          }
          updateUnreadTitle()
        }
        if (data.type === 'new_group_message') {
          // 过滤掉自己发送的消息（避免重复）
          if (data.sender_id === myUserId.value) return
          if (data.group_id === selectedGroupId.value) {
            // 检查是否已存在（避免重复添加）
            const exists = groupMessages.value.some(m => m.id === data.message.id)
            if (!exists) {
              groupMessages.value.push({
                ...data.message,
                sender: { username: data.sender_username || data.message.sender_name || 'NE' },
                mine: false
              })
              // 确保新消息显示在底部
              nextTick(() => scrollToBottom())
              setTimeout(() => scrollToBottom(), 100)
            }
            // 当前正在查看该群聊，自动标记为已读
            groupChatAPI.markRead(data.group_id).catch(() => {})
          } else {
            const group = groups.value.find(g => g.id === data.group_id)
            if (group) { group.unread_count = (group.unread_count || 0) + 1; group.last_message = data.message.content; group.last_message_time = data.message.created_at }
            else loadGroups()
          }
          updateUnreadTitle()
        }
      } catch (err) { console.error('WS message parse error:', err) }
    }
    ws.onclose = () => {
      console.log('[MessagesView] WebSocket 连接关闭')
      if (!reconnectTimer) reconnectTimer = setTimeout(connectWs, 3000)
    }
    ws.onerror = (err) => {
      console.error('[MessagesView] WebSocket 错误:', err)
      ws.close()
    }
  } catch (err) { console.error('WS connect error:', err) }

  if (!pollTimer) {
    pollTimer = setInterval(async () => {
      // WebSocket 正常工作时减少轮询频率，但仍定期检查以防遗漏
      const isWsOpen = ws?.readyState === WebSocket.OPEN
      if (isWsOpen) {
        // WebSocket 正常，每10秒检查一次即可
        if (Date.now() % 10000 > 2000) return
      }
      
      // 轮询私聊消息
      if (selectedConvId.value) {
        try {
          const res = await userMessagesAPI.getMessages(selectedConvId.value)
          const serverMsgs = res.data.messages || []
          if (serverMsgs.length > messages.value.length) {
            messages.value = serverMsgs
            // 确保新消息显示在底部
            nextTick(() => scrollToBottom())
            setTimeout(() => scrollToBottom(), 100)
            userMessagesAPI.markRead(selectedConvId.value).catch(() => {})
          }
        } catch (err) {
          console.error('轮询私聊消息失败:', err)
        }
      }
      
      // 轮询群聊消息
      if (selectedGroupId.value) {
        try {
          const res = await groupChatAPI.getMessages(selectedGroupId.value)
          const serverMsgs = (res.data.messages || []).map(m => ({ ...m, sender: { username: m.sender_username || '未知用户' }, mine: m.sender_id === myUserId.value }))
          if (serverMsgs.length > groupMessages.value.length) {
            const lastLocalId = groupMessages.value.length > 0 ? groupMessages.value[groupMessages.value.length - 1].id : 0
            const lastServerId = serverMsgs.length > 0 ? serverMsgs[serverMsgs.length - 1].id : 0
            if (lastServerId > lastLocalId) {
              groupMessages.value = serverMsgs
              // 确保新消息显示在底部
              nextTick(() => scrollToBottom())
              setTimeout(() => scrollToBottom(), 100)
              groupChatAPI.markRead(selectedGroupId.value).catch(() => {})
            }
          }
        } catch (err) {
          console.error('轮询群聊消息失败:', err)
        }
      }
      
      // 用户停留在群聊列表页面，检查各群聊是否有新消息
      if (!selectedGroupId.value) {
        try {
          const res = await groupChatAPI.list()
          const serverGroups = res.data.groups || []
          for (const sg of serverGroups) {
            const localGroup = groups.value.find(g => g.id === sg.id)
            if (localGroup) {
              const oldUnread = localGroup.unread_count || 0
              const newUnread = sg.unread_count || 0
              if (newUnread > oldUnread || (sg.last_message_time && sg.last_message_time !== localGroup.last_message_time)) {
                localGroup.unread_count = newUnread
                localGroup.last_message = sg.last_message
                localGroup.last_message_time = sg.last_message_time
                updateUnreadTitle()
              }
            }
          }
        } catch (err) {
          console.error('轮询群聊列表失败:', err)
        }
      }
    }, 2000)
  }
}

function updateUnreadTitle() {
  const directUnread = conversations.value.reduce((sum, c) => sum + (c.unread_count || 0), 0)
  const groupUnread = groups.value.reduce((sum, g) => sum + (g.unread_count || 0), 0)
  const total = directUnread + groupUnread
  // 同步更新 messageStore，确保导航栏显示正确
  messageStore.setUnreadCount(directUnread)
  messageStore.setGroupUnreadCount(groupUnread)
  document.title = total > 0 ? `(${total}条新消息) Personal Assistant` : 'Personal Assistant'
}

function truncate(str, len) { if (!str) return ''; return str.length > len ? str.slice(0, len) + '...' : str }
function formatTime(t) {
  if (!t) return '';
  const d = new Date(t);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return isToday
    ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
function formatMessageTime(t) {
  if (!t) return '';
  const d = new Date(t);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return isToday ? time : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

onMounted(() => {
  myUserId.value = getUserId()
  loadConversations()
  loadGroups()
  // 初始化群聊未读数
  messageStore.setGroupUnreadCount(0)
  connectWs()
})

onUnmounted(() => {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (ws) ws.close()
  document.title = 'Personal Assistant'
})
</script>

<style scoped>
.messages-page { height: 100%; display: flex; flex-direction: column; }
.messages-container { display: flex; height: 100%; background: var(--bg-primary); border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--border); }
.conv-sidebar { width: 320px; min-width: 320px; border-right: 1px solid var(--border); display: flex; flex-direction: column; background: var(--bg-secondary); }
.sidebar-tabs { display: flex; border-bottom: 1px solid var(--border); }
.tab-btn { flex: 1; padding: 12px; border: none; background: none; font-size: 14px; font-weight: 500; color: var(--text-muted); cursor: pointer; transition: all var(--transition); border-bottom: 2px solid transparent; }
.tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); background: var(--accent-light); }
.tab-btn:hover:not(.active) { color: var(--text-primary); background: var(--bg-hover); }
.conv-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.conv-header h3 { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0; }
.new-conv-btn { width: 30px; height: 30px; border-radius: var(--radius-sm); border: none; background: var(--bg-hover); font-size: 14px; cursor: pointer; transition: background var(--transition); }
.new-conv-btn:hover { background: var(--accent-light); }
.conv-list { flex: 1; overflow-y: auto; }
.conv-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; transition: background var(--transition); border-bottom: 1px solid var(--border); }
.conv-item:hover { background: var(--bg-hover); }
.conv-item.active { background: var(--accent-light); }
.conv-avatar { width: 42px; height: 42px; min-width: 42px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), #a29bfe); color: #fff; font-weight: 600; font-size: 16px; display: flex; align-items: center; justify-content: center; }
.conv-avatar.group-avatar { background: linear-gradient(135deg, #00b894, #00cec9); }
.conv-info { flex: 1; min-width: 0; }
.conv-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.conv-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.conv-time { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.conv-bottom { display: flex; justify-content: space-between; align-items: center; }
.conv-last-msg { font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.conv-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #e74c3c; color: #fff; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; margin-left: 8px; }
.conv-empty { text-align: center; padding: 40px 20px; color: var(--text-muted); }
.conv-empty-hint { font-size: 12px; margin-top: 8px; }
.chat-window { flex: 1; display: flex; flex-direction: column; background: var(--bg-primary); }
.chat-header { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); }
.chat-header-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), #a29bfe); color: #fff; font-weight: 600; font-size: 14px; display: flex; align-items: center; justify-content: center; }
.chat-header-avatar.group-avatar { background: linear-gradient(135deg, #00b894, #00cec9); }
.chat-header-info { display: flex; flex-direction: column; }
.chat-header-name { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.chat-header-sub { font-size: 12px; color: var(--text-muted); }
.chat-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 8px; }
.msg-row { display: flex; gap: 8px; }
.msg-row.mine { justify-content: flex-end; }
.msg-avatar { width: 32px; flex-shrink: 0; }
.msg-sender-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #00b894, #00cec9); color: #fff; font-weight: 600; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.msg-bubble { max-width: 65%; padding: 10px 14px; border-radius: 16px; background: var(--bg-secondary); border: 1px solid var(--border); }
.msg-row.mine .msg-bubble { background: var(--accent); color: #fff; border-color: var(--accent); border-bottom-right-radius: 4px; }
.msg-row:not(.mine) .msg-bubble.group-msg { border-bottom-left-radius: 4px; }
.msg-sender-name { font-size: 12px; font-weight: 600; color: var(--accent); margin-bottom: 2px; }
.msg-row.mine .msg-sender-name { display: none; }
.msg-content { font-size: 14px; line-height: 1.5; word-break: break-word; white-space: pre-wrap; }
.msg-meta { display: flex; justify-content: flex-end; align-items: center; gap: 6px; margin-top: 4px; }
.msg-time { font-size: 11px; opacity: 0.6; }
.msg-read, .msg-sent { font-size: 11px; opacity: 0.6; }
.chat-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 14px; }
.chat-placeholder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); }
.chat-placeholder-icon { font-size: 48px; margin-bottom: 16px; }
.chat-input-area { display: flex; align-items: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border); background: var(--bg-secondary); }
.chat-input-area textarea { flex: 1; padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: 14px; resize: none; outline: none; font-family: inherit; max-height: 120px; line-height: 1.5; }
.chat-input-area textarea:focus { border-color: var(--accent); }
.send-btn { padding: 10px 20px; border-radius: var(--radius-md); border: none; background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity var(--transition); white-space: nowrap; }
.send-btn:hover:not(:disabled) { opacity: 0.85; }
.send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 300; }
.modal { width: 450px; max-width: 90vw; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border); box-shadow: 0 16px 48px var(--shadow); overflow: hidden; max-height: 80vh; display: flex; flex-direction: column; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.modal-header h3 { margin: 0; font-size: 16px; color: var(--text-primary); }
.modal-close { width: 28px; height: 28px; border: none; background: none; color: var(--text-muted); font-size: 18px; cursor: pointer; border-radius: var(--radius-sm); }
.modal-close:hover { background: var(--bg-hover); }
.modal-body { padding: 20px; overflow-y: auto; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 14px; font-weight: 500; color: var(--text-primary); margin-bottom: 8px; }
.search-input { width: 100%; padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: 14px; outline: none; box-sizing: border-box; }
.search-input:focus { border-color: var(--accent); }
.selected-members { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.member-tag { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--accent-light); color: var(--accent); border-radius: 12px; font-size: 12px; }
.remove-member { cursor: pointer; font-weight: bold; }
.remove-member:hover { color: var(--danger); }
.user-list { max-height: 200px; overflow-y: auto; margin-top: 12px; }
.user-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--radius-sm); cursor: pointer; transition: background var(--transition); }
.user-item:hover { background: var(--bg-hover); }
.user-item-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), #a29bfe); color: #fff; font-weight: 600; font-size: 14px; display: flex; align-items: center; justify-content: center; }
.user-item-name { flex: 1; font-size: 14px; color: var(--text-primary); }
.add-icon { font-size: 12px; color: var(--accent); font-weight: 500; }
.no-results, .search-hint { text-align: center; padding: 20px; color: var(--text-muted); font-size: 14px; }
.create-group-btn { width: 100%; padding: 12px; border-radius: var(--radius-md); border: none; background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 16px; transition: opacity var(--transition); }
.create-group-btn:hover:not(:disabled) { opacity: 0.85; }
.create-group-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* Mobile styles */
.mobile-only { display: none; }
@media (max-width: 768px) {
  .desktop-only { display: none !important; }
  .mobile-only { display: flex !important; flex-direction: column; height: 100%; }
  .mobile-container { height: 100%; display: flex; flex-direction: column; }
  .mobile-list-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .mobile-header { display: flex; align-items: center; border-bottom: 1px solid var(--border); background: var(--bg-secondary); padding: 8px 12px; }
  .mobile-tabs { flex: 1; display: flex; }
  .mobile-tabs .tab-btn { padding: 10px 8px; font-size: 13px; }
  .mobile-list { flex: 1; overflow-y: auto; }
  .mobile-conv-item { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border); cursor: pointer; }
  .mobile-conv-item:active { background: var(--bg-hover); }
  .mobile-chat-view { display: flex; flex-direction: column; height: 100%; }
  .mobile-chat-header { display: flex; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); }
  .back-btn { background: none; border: none; color: var(--accent); font-size: 14px; cursor: pointer; padding: 4px 8px; }
  .chat-header-info-mobile { flex: 1; text-align: center; }
  .chat-header-info-mobile .chat-header-name { font-size: 15px; font-weight: 600; color: var(--text-primary); }
  .chat-header-info-mobile .chat-header-sub { font-size: 11px; color: var(--text-muted); }
  .mobile-chat-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
  .mobile-chat-input { display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--border); background: var(--bg-secondary); }
  .mobile-chat-input textarea { flex: 1; padding: 8px 12px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: 14px; resize: none; outline: none; font-family: inherit; max-height: 100px; line-height: 1.5; }
  .mobile-chat-input .send-btn { padding: 8px 16px; font-size: 13px; }
  .msg-bubble { max-width: 75%; }
}
</style>
