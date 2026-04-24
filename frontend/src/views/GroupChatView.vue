<template>
  <div class="group-chat-page">
    <!-- Mobile notice -->
    <div class="mobile-notice">
      <p>📱 群聊功能仅支持电脑版使用，请使用电脑访问。</p>
    </div>

    <div class="group-chat-container desktop-only">
      <!-- Left: Group list -->
      <div class="group-sidebar">
        <div class="group-header">
          <h3>群聊</h3>
          <button class="new-group-btn" @click="showNewGroup = true" title="创建群聊">➕</button>
        </div>
        <div class="group-list" ref="groupListRef">
          <div
            v-for="group in groups"
            :key="group.id"
            class="group-item"
            :class="{ active: selectedGroupId === group.id }"
            @click="selectGroup(group)"
          >
            <div class="group-avatar">
              {{ group.name.charAt(0).toUpperCase() }}
              <span v-if="group.unread_count > 0" class="group-unread-dot"></span>
            </div>
            <div class="group-info">
              <div class="group-top">
                <span class="group-name">{{ group.name }}</span>
                <span class="group-count">({{ group.member_count }})</span>
              </div>
              <div class="group-bottom">
                <span class="group-last-msg">{{ truncate(group.last_message, 20) }}</span>
                <span v-if="group.unread_count > 0" class="group-badge">{{ group.unread_count > 99 ? '99+' : group.unread_count }}</span>
              </div>
            </div>
          </div>
          <div v-if="groups.length === 0" class="group-empty">
            <p>暂无群聊</p>
            <p class="group-empty-hint">点击 ➕ 创建群聊</p>
          </div>
        </div>
      </div>

      <!-- Right: Chat window -->
      <div class="group-chat-window">
        <template v-if="currentGroup">
          <!-- Chat header -->
          <div class="chat-header">
            <div class="chat-header-avatar">{{ currentGroup.name.charAt(0).toUpperCase() }}</div>
            <div class="chat-header-info">
              <span class="chat-header-name">{{ currentGroup.name }}</span>
              <span class="chat-header-count">{{ memberCount }}人</span>
            </div>
            <div class="chat-header-actions">
              <button class="header-btn" @click="showMembers = true" title="群成员">👥</button>
              <button v-if="currentGroup.my_role === 'owner'" class="header-btn" @click="showGroupSettings = true" title="群设置">⚙️</button>
            </div>
          </div>

          <!-- Messages -->
          <div class="chat-messages" ref="messagesRef">
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="msg-row"
              :class="{ mine: msg.sender_id === myUserId }"
            >
              <div class="msg-avatar" v-if="!msg.sender_id === myUserId">
                {{ (msg.sender_name || 'U').charAt(0).toUpperCase() }}
              </div>
              <div class="msg-body" :class="{ 'no-avatar': msg.sender_id === myUserId }">
                <div v-if="msg.sender_id !== myUserId" class="msg-sender-name">{{ msg.sender_name }}</div>
                <div class="msg-bubble">
                  <div class="msg-content">{{ msg.content }}</div>
                  <div class="msg-meta">
                    <span class="msg-time">{{ formatMessageTime(msg.created_at) }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="messages.length === 0" class="chat-empty">
              <p>暂无消息，发送第一条吧 ✨</p>
            </div>
          </div>

          <!-- Input -->
          <div class="chat-input-area">
            <textarea
              ref="inputRef"
              v-model="inputText"
              placeholder="输入消息..."
              rows="1"
              @keydown.enter.prevent="handleSendKey"
              @input="autoResize"
            ></textarea>
            <button class="send-btn" :disabled="!inputText.trim() || sending" @click="sendMessage">
              {{ sending ? '...' : '发送' }}
            </button>
          </div>
        </template>
        <div v-else class="chat-placeholder">
          <div class="chat-placeholder-icon">👥</div>
          <p>选择一个群聊开始聊天</p>
        </div>
      </div>
    </div>

    <!-- New Group Modal -->
    <transition name="fade">
      <div v-if="showNewGroup" class="modal-overlay" @click.self="showNewGroup = false">
        <div class="modal">
          <div class="modal-header">
            <h3>创建群聊</h3>
            <button class="modal-close" @click="showNewGroup = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>群名称</label>
              <input v-model="newGroupName" class="form-input" placeholder="请输入群名称" />
            </div>
            <div class="form-group">
              <label>添加成员</label>
              <input
                v-model="memberSearchQuery"
                class="form-input"
                placeholder="搜索用户名添加成员"
                @input="searchUsers"
              />
              <div class="selected-members">
                <span v-for="m in selectedMembers" :key="m.id" class="member-tag">
                  {{ m.username }}
                  <button @click="removeSelectedMember(m.id)">✕</button>
                </span>
              </div>
              <div class="search-results">
                <div
                  v-for="u in searchResults"
                  :key="u.id"
                  class="search-item"
                  @click="addSelectedMember(u)"
                >
                  <span>{{ u.username }}</span>
                </div>
                <div v-if="memberSearchQuery && searchResults.length === 0" class="no-results">
                  未找到用户
                </div>
              </div>
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" v-model="addNeBot" />
                邀请 NE 机器人进群
              </label>
            </div>
            <button class="create-btn" @click="createGroup" :disabled="!newGroupName.trim()">
              创建群聊
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Members Modal -->
    <transition name="fade">
      <div v-if="showMembers" class="modal-overlay" @click.self="showMembers = false">
        <div class="modal">
          <div class="modal-header">
            <h3>群成员 ({{ members.length }}人)</h3>
            <button class="modal-close" @click="showMembers = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="member-list">
              <div v-for="m in members" :key="m.user_id" class="member-item">
                <div class="member-avatar">{{ m.username.charAt(0).toUpperCase() }}</div>
                <div class="member-info">
                  <span class="member-name">{{ m.username }}</span>
                  <span class="member-role">{{ roleLabel(m.role) }}</span>
                </div>
                <button
                  v-if="canRemoveMember(m.user_id)"
                  class="remove-btn"
                  @click="removeMember(m.user_id)"
                  title="移除成员"
                >
                  ✕
                </button>
              </div>
            </div>
            <!-- Add members (admin+) -->
            <div v-if="currentGroup && (currentGroup.my_role === 'owner' || currentGroup.my_role === 'admin')" class="add-member-section">
              <label>添加成员</label>
              <input
                v-model="addMemberQuery"
                class="form-input"
                placeholder="搜索用户名..."
                @input="searchUsersForAdd"
              />
              <div class="search-results">
                <div
                  v-for="u in addMemberResults"
                  :key="u.id"
                  class="search-item"
                  @click="addMember(u.id)"
                >
                  <span>{{ u.username }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- Group Settings Modal (owner only) -->
    <transition name="fade">
      <div v-if="showGroupSettings" class="modal-overlay" @click.self="showGroupSettings = false">
        <div class="modal">
          <div class="modal-header">
            <h3>群设置</h3>
            <button class="modal-close" @click="showGroupSettings = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>群名称</label>
              <input v-model="editGroupName" class="form-input" placeholder="群名称" />
            </div>
            <div class="form-actions">
              <button class="save-btn" @click="saveGroupSettings">保存</button>
              <button class="danger-btn" @click="deleteGroup">解散群聊</button>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { groupChatAPI } from '../api/modules'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const myUserId = ref(null)
const groups = ref([])
const selectedGroupId = ref(null)
const currentGroup = ref(null)
const messages = ref([])
const inputText = ref('')
const sending = ref(false)
const memberCount = ref(0)
const members = ref([])

// Modals
const showNewGroup = ref(false)
const showMembers = ref(false)
const showGroupSettings = ref(false)
const newGroupName = ref('')
const selectedMembers = ref([])
const addNeBot = ref(true)
const memberSearchQuery = ref('')
const searchResults = ref([])
const editGroupName = ref('')
const addMemberQuery = ref('')
const addMemberResults = ref([])

const messagesRef = ref(null)
const inputRef = ref(null)
const groupListRef = ref(null)

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

async function loadGroups() {
  try {
    const res = await groupChatAPI.list()
    groups.value = res.data.groups
  } catch (err) {
    console.error('Load groups error:', err)
  }
}

async function selectGroup(group) {
  selectedGroupId.value = group.id
  currentGroup.value = group
  messages.value = []
  await loadGroupDetail(group.id)
  await loadMessages(group.id)
  groupChatAPI.markRead(group.id).catch(() => {})
  group.unread_count = 0
  setTimeout(() => scrollToBottom(), 100)
}

async function loadGroupDetail(groupId) {
  try {
    const res = await groupChatAPI.get(groupId)
    const { group, members: memberList } = res.data
    currentGroup.value = { ...currentGroup.value, ...group }
    members.value = memberList
    memberCount.value = memberList.length
  } catch (err) {
    console.error('Load group detail error:', err)
  }
}

async function loadMessages(groupId) {
  try {
    const res = await groupChatAPI.getMessages(groupId)
    messages.value = res.data.messages
  } catch (err) {
    console.error('Load messages error:', err)
  }
}

async function handleSendKey() {
  await sendMessage()
}

async function sendMessage() {
  const content = inputText.value.trim()
  if (!content || !selectedGroupId.value || sending.value) return

  inputText.value = ''
  if (inputRef.value) inputRef.value.style.height = 'auto'

  sending.value = true
  try {
    const res = await groupChatAPI.sendMessage(selectedGroupId.value, content)
    // 检查是否已存在相同消息（避免重复）
    const exists = messages.value.some(m => m.id === res.data.message.id)
    if (!exists) {
      messages.value.push(res.data.message)
    }
    // 使用 setTimeout 确保 DOM 更新后再滚动
    setTimeout(() => scrollToBottom(), 50)
    const conv = groups.value.find(g => g.id === selectedGroupId.value)
    if (conv) {
      conv.last_message = content
      conv.last_message_time = new Date().toISOString()
    }
  } catch (err) {
    console.error('Send message error:', err)
    inputText.value = content
  } finally {
    sending.value = false
  }
}

function autoResize(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function scrollToBottom() {
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

// Create group
let searchDebounce = null
function searchUsers() {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(async () => {
    if (!memberSearchQuery.value.trim()) {
      searchResults.value = []
      return
    }
    try {
      const res = await groupChatAPI.searchUsers(memberSearchQuery.value.trim())
      searchResults.value = res.data.users.filter(
        u => !selectedMembers.value.find(m => m.id === u.id)
      )
    } catch {
      searchResults.value = []
    }
  }, 300)
}

function addSelectedMember(user) {
  if (!selectedMembers.value.find(m => m.id === user.id)) {
    selectedMembers.value.push(user)
  }
  memberSearchQuery.value = ''
  searchResults.value = []
}

function removeSelectedMember(userId) {
  selectedMembers.value = selectedMembers.value.filter(m => m.id !== userId)
}

async function createGroup() {
  if (!newGroupName.value.trim()) return

  const memberIds = selectedMembers.value.map(m => m.id)
  if (addNeBot.value) {
    try {
      const botRes = await groupChatAPI.getBotInfo()
      if (botRes.data.bot) {
        memberIds.push(botRes.data.bot.id)
      }
    } catch {}
  }

  try {
    const res = await groupChatAPI.create({
      name: newGroupName.value.trim(),
      member_ids: memberIds
    })
    const newGroup = res.data.group
    groups.value.unshift(newGroup)
    showNewGroup.value = false
    resetNewGroupForm()
    await selectGroup(newGroup)
  } catch (err) {
    console.error('Create group error:', err)
  }
}

function resetNewGroupForm() {
  newGroupName.value = ''
  selectedMembers.value = []
  memberSearchQuery.value = ''
  searchResults.value = []
  addNeBot.value = true
}

// Members management
function searchUsersForAdd() {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(async () => {
    if (!addMemberQuery.value.trim()) {
      addMemberResults.value = []
      return
    }
    try {
      const res = await groupChatAPI.searchUsers(addMemberQuery.value.trim())
      // Filter out existing members
      const existingIds = new Set(members.value.map(m => m.user_id))
      addMemberResults.value = res.data.users.filter(u => !existingIds.has(u.id))
    } catch {
      addMemberResults.value = []
    }
  }, 300)
}

async function addMember(userId) {
  try {
    await groupChatAPI.addMembers(selectedGroupId.value, [userId])
    addMemberQuery.value = ''
    addMemberResults.value = []
    await loadGroupDetail(selectedGroupId.value)
    // Reload groups to refresh member count
    loadGroups()
  } catch (err) {
    console.error('Add member error:', err)
  }
}

function canRemoveMember(userId) {
  if (!currentGroup.value) return false
  if (currentGroup.value.my_role !== 'owner') return false
  const member = members.value.find(m => m.user_id === userId)
  return member && member.role !== 'owner'
}

function roleLabel(role) {
  const map = { owner: '群主', admin: '管理员', member: '成员' }
  return map[role] || '成员'
}

async function removeMember(userId) {
  if (!confirm('确定移除此成员？')) return
  try {
    await groupChatAPI.removeMember(selectedGroupId.value, userId)
    await loadGroupDetail(selectedGroupId.value)
    loadGroups()
  } catch (err) {
    console.error('Remove member error:', err)
  }
}

// Group settings
function openGroupSettings() {
  editGroupName.value = currentGroup.value?.name || ''
  showGroupSettings.value = true
}

async function saveGroupSettings() {
  if (!editGroupName.value.trim()) return
  try {
    await groupChatAPI.update(selectedGroupId.value, { name: editGroupName.value.trim() })
    currentGroup.value.name = editGroupName.value.trim()
    const g = groups.value.find(g => g.id === selectedGroupId.value)
    if (g) g.name = editGroupName.value.trim()
    showGroupSettings.value = false
  } catch (err) {
    console.error('Save settings error:', err)
  }
}

async function deleteGroup() {
  if (!confirm('确定解散群聊？此操作不可恢复。')) return
  try {
    await groupChatAPI.remove(selectedGroupId.value)
    groups.value = groups.value.filter(g => g.id !== selectedGroupId.value)
    currentGroup.value = null
    selectedGroupId.value = null
    messages.value = []
    showGroupSettings.value = false
  } catch (err) {
    console.error('Delete group error:', err)
  }
}

// WebSocket
function connectWs() {
  const token = localStorage.getItem('token')
  if (!token) return

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/ws/messages?token=${token}`

  try {
    ws = new WebSocket(wsUrl)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'new_group_message') {
          // 跳过自己发送的消息（已在 sendMessage 中添加到列表）
          if (data.sender_id === myUserId.value) return

          if (data.group_id === selectedGroupId.value) {
            messages.value.push(data.message)
            setTimeout(() => scrollToBottom(), 50)
            groupChatAPI.markRead(data.group_id).catch(() => {})
          } else {
            const group = groups.value.find(g => g.id === data.group_id)
            if (group) {
              group.unread_count = (group.unread_count || 0) + 1
              group.last_message = data.message.content
              group.last_message_time = data.message.created_at
            }
          }
          updateUnreadTitle()
        }
        if (data.type === 'group_member_added') {
          if (data.group_id === selectedGroupId.value) {
            loadGroupDetail(data.group_id)
          }
        }
        if (data.type === 'group_removed') {
          groups.value = groups.value.filter(g => g.id !== data.group_id)
          if (selectedGroupId.value === data.group_id) {
            currentGroup.value = null
            selectedGroupId.value = null
            messages.value = []
          }
        }
      } catch (err) {
        console.error('WS message parse error:', err)
      }
    }

    ws.onclose = () => {
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(connectWs, 3000)
      }
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onopen = () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    }
  } catch (err) {
    console.error('WS connect error:', err)
  }

  if (!pollTimer) {
    pollTimer = setInterval(async () => {
      if (!selectedGroupId.value || ws?.readyState === WebSocket.OPEN) return
      try {
        const res = await groupChatAPI.getMessages(selectedGroupId.value)
        const serverMsgs = res.data.messages || []
        // 只在消息数量不同时才更新（避免重复）
        if (serverMsgs.length > messages.value.length) {
          // 过滤掉自己的消息（已经在本地添加）
          const newMsgs = serverMsgs.filter(m => !messages.value.some(existing => existing.id === m.id))
          if (newMsgs.length > 0) {
            messages.value.push(...newMsgs)
            setTimeout(() => scrollToBottom(), 50)
          }
          groupChatAPI.markRead(selectedGroupId.value).catch(() => {})
        }
      } catch {}
    }, 5000)
  }
}

function updateUnreadTitle() {
  const total = groups.value.reduce((sum, g) => sum + (g.unread_count || 0), 0)
  const baseTitle = 'Personal Assistant'
  document.title = total > 0 ? `(${total}条群消息) ${baseTitle}` : baseTitle
}

function truncate(str, len) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '...' : str
}

function formatMessageTime(t) {
  if (!t) return ''
  const d = new Date(t)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + time
}

onMounted(() => {
  myUserId.value = getUserId()
  loadGroups()
  connectWs()
})

onUnmounted(() => {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (ws) ws.close()
  document.title = 'Personal Assistant'
})
</script>

<style scoped>
.group-chat-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.mobile-notice {
  display: none;
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
  font-size: 16px;
}

.group-chat-container {
  display: flex;
  height: 100%;
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--border);
}

/* Sidebar */
.group-sidebar {
  width: 300px;
  min-width: 300px;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.group-header h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.new-group-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--bg-hover);
  font-size: 16px;
  cursor: pointer;
  transition: background var(--transition);
}

.new-group-btn:hover {
  background: var(--accent-light);
}

.group-list {
  flex: 1;
  overflow-y: auto;
}

.group-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background var(--transition);
  border-bottom: 1px solid var(--border);
  position: relative;
}

.group-item:hover {
  background: var(--bg-hover);
}

.group-item.active {
  background: var(--accent-light);
}

.group-avatar {
  width: 42px;
  height: 42px;
  min-width: 42px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6c5ce7, #fd79a8);
  color: #fff;
  font-weight: 600;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.group-unread-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e74c3c;
  border: 2px solid var(--bg-secondary);
}

.group-info {
  flex: 1;
  min-width: 0;
}

.group-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.group-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.group-count {
  font-size: 11px;
  color: var(--text-muted);
}

.group-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.group-last-msg {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.group-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #e74c3c;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
}

.group-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}

.group-empty-hint {
  font-size: 12px;
  margin-top: 8px;
}

/* Chat window */
.group-chat-window {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

.chat-header-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6c5ce7, #fd79a8);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-header-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.chat-header-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.chat-header-count {
  font-size: 12px;
  color: var(--text-muted);
}

.chat-header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--bg-hover);
  font-size: 16px;
  cursor: pointer;
  transition: background var(--transition);
}

.header-btn:hover {
  background: var(--accent-light);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.msg-row {
  display: flex;
  gap: 8px;
  max-width: 80%;
}

.msg-row.mine {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.msg-avatar {
  width: 32px;
  height: 32px;
  min-width: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #a29bfe, #6c5ce7);
  color: #fff;
  font-weight: 600;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: flex-end;
}

.msg-body {
  flex: 1;
}

.msg-body.no-avatar {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.msg-sender-name {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.msg-bubble {
  padding: 10px 14px;
  border-radius: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
}

.msg-row.mine .msg-bubble {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  border-bottom-right-radius: 4px;
}

.msg-row:not(.mine) .msg-bubble {
  border-bottom-left-radius: 4px;
}

.msg-content {
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}

.msg-meta {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.msg-time {
  font-size: 11px;
  opacity: 0.6;
}

.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 14px;
}

.chat-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.chat-placeholder-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

/* Input area */
.chat-input-area {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-secondary);
}

.chat-input-area textarea {
  flex: 1;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  resize: none;
  outline: none;
  font-family: inherit;
  max-height: 120px;
  line-height: 1.5;
}

.chat-input-area textarea:focus {
  border-color: var(--accent);
}

.send-btn {
  padding: 10px 20px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition);
  white-space: nowrap;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Modals */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.modal {
  width: 440px;
  max-width: 90vw;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: 0 16px 48px var(--shadow);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.modal-close {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.modal-close:hover {
  background: var(--bg-hover);
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--accent);
}

.selected-members {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.member-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  background: var(--accent-light);
  color: var(--accent);
  font-size: 13px;
}

.member-tag button {
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  line-height: 1;
}

.member-tag button:hover {
  color: var(--danger);
}

.search-results {
  max-height: 150px;
  overflow-y: auto;
  margin-top: 8px;
}

.search-item {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition);
  font-size: 14px;
}

.search-item:hover {
  background: var(--bg-hover);
}

.no-results {
  text-align: center;
  padding: 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 400 !important;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

.create-btn {
  width: 100%;
  padding: 12px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition);
  margin-top: 8px;
}

.create-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Member list */
.member-list {
  max-height: 300px;
  overflow-y: auto;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  transition: background var(--transition);
}

.member-item:hover {
  background: var(--bg-hover);
}

.member-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #a29bfe, #6c5ce7);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.member-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.member-name {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.member-role {
  font-size: 12px;
  color: var(--text-muted);
}

.remove-btn {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--bg-hover);
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition);
}

.remove-btn:hover {
  background: var(--danger);
  color: #fff;
}

.add-member-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.add-member-section label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

/* Form actions */
.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.save-btn {
  flex: 1;
  padding: 12px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition);
}

.save-btn:hover {
  opacity: 0.85;
}

.danger-btn {
  flex: 1;
  padding: 12px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--danger);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition);
}

.danger-btn:hover {
  opacity: 0.85;
}

/* Transition */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* Mobile */
@media (max-width: 768px) {
  .desktop-only {
    display: none !important;
  }
  .mobile-notice {
    display: block;
  }
}
</style>
