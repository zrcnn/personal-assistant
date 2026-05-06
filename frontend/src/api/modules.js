import api from './index'

export const authAPI = {
  login(username, password) {
    return api.post('/api/auth/login', { username, password })
  },
  register(username, password) {
    return api.post('/api/auth/register', { username, password })
  }
}

export const conversationAPI = {
  list() {
    return api.get('/api/conversations')
  },
  create() {
    return api.post('/api/conversations')
  },
  delete(id) {
    return api.delete(`/api/conversations/${id}`)
  },
  rename(id, title) {
    return api.put(`/api/conversations/${id}`, { title })
  },
  generateTitle(id) {
    return api.post(`/api/conversations/${id}/title`)
  }
}

export const messageAPI = {
  list(conversationId, page = 1, limit = 50) {
    return api.get(`/api/conversations/${conversationId}/messages`, {
      params: { page, limit }
    })
  },
  send(conversationId, content, config = {}) {
    return api.post(`/api/conversations/${conversationId}/messages`, { content }, config)
  }
}

export const userMessagesAPI = {
  getConversations() {
    return api.get('/api/messages/conversations')
  },
  createConversation(userId) {
    return api.post('/api/messages/conversations', { user_id: userId })
  },
  getMessages(conversationId) {
    return api.get(`/api/messages/conversations/${conversationId}/messages`)
  },
  sendMessage(conversationId, content) {
    return api.post(`/api/messages/conversations/${conversationId}/messages`, { content })
  },
  markRead(conversationId) {
    return api.post(`/api/messages/conversations/${conversationId}/read`)
  },
  getUnreadCount() {
    return api.get('/api/messages/unread-count')
  },
  searchUsers(query) {
    return api.get('/api/messages/users', { params: { q: query } })
  }
}

export const groupChatAPI = {
  // Groups
  list() {
    return api.get('/api/group-chats')
  },
  create(data) {
    return api.post('/api/group-chats', data)
  },
  get(id) {
    return api.get(`/api/group-chats/${id}`)
  },
  update(id, data) {
    return api.put(`/api/group-chats/${id}`, data)
  },
  remove(id) {
    return api.delete(`/api/group-chats/${id}`)
  },
  // Members
  addMembers(id, userIds) {
    return api.post(`/api/group-chats/${id}/members`, { user_ids: userIds })
  },
  removeMember(id, userId) {
    return api.delete(`/api/group-chats/${id}/members/${userId}`)
  },
  updateMemberRole(id, userId, role) {
    return api.put(`/api/group-chats/${id}/members/${userId}/role`, { role })
  },
  // Messages
  getMessages(id) {
    return api.get(`/api/group-chats/${id}/messages`)
  },
  sendMessage(id, content) {
    return api.post(`/api/group-chats/${id}/messages`, { content })
  },
  markRead(id) {
    return api.post(`/api/group-chats/${id}/messages/read`)
  },
  // Bot
  getBotInfo() {
    return api.get('/api/group-chats/bot/info')
  },
  searchUsers(query) {
    return api.get('/api/messages/users', { params: { q: query } })
  }
}

export const settingsAPI = {
  get() {
    return api.get('/api/settings')
  },
  update(data) {
    return api.put('/api/settings', data)
  }
}

export const userApiKeysAPI = {
  list() {
    return api.get('/api/user-api-keys')
  },
  create(data) {
    return api.post('/api/user-api-keys', data)
  },
  update(id, data) {
    return api.put(`/api/user-api-keys/${id}`, data)
  },
  remove(id) {
    return api.delete(`/api/user-api-keys/${id}`)
  },
  decrypt(id) {
    return api.get(`/api/user-api-keys/${id}/decrypt`)
  }
}

export const testCaseAPI = {
  // 产品管理
  getProducts() {
    return api.get('/api/test-case/products')
  },
  createProduct(data) {
    return api.post('/api/test-case/products', data)
  },
  updateProduct(id, data) {
    return api.put(`/api/test-case/products/${id}`, data)
  },
  deleteProduct(id) {
    return api.delete(`/api/test-case/products/${id}`)
  },

  // 需求管理
  getRequirements(productId) {
    return api.get('/api/test-case/requirements', { params: productId ? { product_id: productId } : {} })
  },
  createRequirement(data) {
    return api.post('/api/test-case/requirements', data)
  },
  updateRequirement(id, data) {
    return api.put(`/api/test-case/requirements/${id}`, data)
  },
  deleteRequirement(id) {
    return api.delete(`/api/test-case/requirements/${id}`)
  },

  // 测试用例管理
  getTestCases(params) {
    return api.get('/api/test-case/test-cases', { params })
  },
  createTestCase(data) {
    return api.post('/api/test-case/test-cases', data)
  },
  updateTestCase(id, data) {
    return api.put(`/api/test-case/test-cases/${id}`, data)
  },
  deleteTestCase(id) {
    return api.delete(`/api/test-case/test-cases/${id}`)
  },

  // AI 生成
  generateTestCases(data) {
    return api.post('/api/test-case/generate', data)
  }
}
