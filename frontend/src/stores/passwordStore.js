import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  encryptData,
  decryptData,
  verifyMasterPassword
} from '../utils/crypto'
import {
  hasMasterPassword,
  saveMasterPasswordProof,
  createPasswordEntry,
  updatePasswordEntry,
  deletePasswordEntry,
  getAllPasswordEntries,
  getPasswordEntriesByCategory,
  getAllCategories,
  searchPasswordEntries,
  clearVault
} from '../utils/passwordDB'

export const usePasswordStore = defineStore('password', () => {
  // State
  const isUnlocked = ref(false)
  const isSetup = ref(false)
  const masterKey = ref(null) // CryptoKey, kept in memory only
  const entries = ref([]) // Decrypted entries
  const currentCategory = ref('全部')
  const searchQuery = ref('')
  const autoLockTimer = ref(null)
  const autoLockMinutes = ref(5)

  // Getters
  const categories = ref([{ name: '全部', count: 0 }])

  const filteredEntries = computed(() => {
    let result = entries.value

    if (currentCategory.value !== '全部') {
      result = result.filter(e => e.category === currentCategory.value)
    }

    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      result = result.filter(e =>
        e.siteName.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        (e.notes && e.notes.toLowerCase().includes(q)) ||
        (e.url && e.url.toLowerCase().includes(q))
      )
    }

    return result
  })

  // Actions
  async function checkSetup() {
    isSetup.value = await hasMasterPassword()
  }

  async function setup(password) {
    // 检查 Web Crypto API 可用性
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error(
        'Web Crypto API 不可用。请确保通过 HTTPS 访问（localhost 开发环境除外）。'
      )
    }
    // 首次设置主密码
    const proof = await encryptData('password-vault-verified', password)
    await saveMasterPasswordProof(proof)
    masterKey.value = password // 临时存储明文，用于后续解密
    isUnlocked.value = true
    isSetup.value = true
    await loadEntries()
  }

  async function unlock(password) {
    const proof = await hasMasterPassword()
    if (!proof) {
      throw new Error('未设置主密码')
    }
    const valid = await verifyMasterPassword(proof, password)
    if (!valid) {
      throw new Error('主密码错误')
    }
    masterKey.value = password
    isUnlocked.value = true
    await loadEntries()
    startAutoLock()
  }

  function lock() {
    isUnlocked.value = false
    masterKey.value = null
    entries.value = []
    if (autoLockTimer.value) {
      clearTimeout(autoLockTimer.value)
      autoLockTimer.value = null
    }
  }

  async function loadEntries() {
    const rawEntries = await getAllPasswordEntries()
    const decrypted = []

    for (const entry of rawEntries) {
      try {
        const decryptedPassword = await decryptData(
          {
            salt: entry.salt,
            iv: entry.iv,
            ciphertext: entry.encryptedPassword
          },
          masterKey.value
        )
        decrypted.push({
          ...entry,
          decryptedPassword
        })
      } catch (e) {
        console.error('解密失败:', entry.id)
      }
    }

    entries.value = decrypted

    // 更新分类
    const catMap = {}
    entries.value.forEach(e => {
      const cat = e.category || '未分类'
      catMap[cat] = (catMap[cat] || 0) + 1
    })
    categories.value = [
      { name: '全部', count: entries.value.length },
      ...Object.entries(catMap).map(([name, count]) => ({ name, count }))
    ]
  }

  async function addEntry(data) {
    const encrypted = await encryptData(data.password, masterKey.value)
    const entry = await createPasswordEntry({
      siteName: data.siteName,
      url: data.url || '',
      username: data.username,
      encryptedPassword: encrypted.ciphertext,
      salt: encrypted.salt,
      iv: encrypted.iv,
      category: data.category || '未分类',
      notes: data.notes || '',
      favorite: data.favorite || false
    })

    entries.value.unshift({
      ...entry,
      decryptedPassword: data.password
    })

    await updateCategories()
    return entry
  }

  async function editEntry(data) {
    const encrypted = await encryptData(data.password, masterKey.value)
    const updated = await updatePasswordEntry({
      ...data,
      encryptedPassword: encrypted.ciphertext,
      salt: encrypted.salt,
      iv: encrypted.iv
    })

    const idx = entries.value.findIndex(e => e.id === data.id)
    if (idx !== -1) {
      entries.value[idx] = {
        ...updated,
        decryptedPassword: data.password
      }
    }

    await updateCategories()
    return updated
  }

  async function removeEntry(id) {
    await deletePasswordEntry(id)
    entries.value = entries.value.filter(e => e.id !== id)
    await updateCategories()
  }

  async function updateCategories() {
    const catMap = {}
    entries.value.forEach(e => {
      const cat = e.category || '未分类'
      catMap[cat] = (catMap[cat] || 0) + 1
    })
    categories.value = [
      { name: '全部', count: entries.value.length },
      ...Object.entries(catMap).map(([name, count]) => ({ name, count }))
    ]
  }

  function setCategory(cat) {
    currentCategory.value = cat
  }

  function setSearch(query) {
    searchQuery.value = query
  }

  function startAutoLock() {
    if (autoLockTimer.value) {
      clearTimeout(autoLockTimer.value)
    }
    autoLockTimer.value = setTimeout(() => {
      lock()
    }, autoLockMinutes.value * 60 * 1000)
  }

  function resetAutoLock() {
    if (isUnlocked.value) {
      startAutoLock()
    }
  }

  // 监听用户活动以重置自动锁定计时器
  function enableAutoLockListeners() {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    let lastReset = 0

    const handler = () => {
      const now = Date.now()
      if (now - lastReset > 10000) { // 每10秒最多重置一次
        resetAutoLock()
        lastReset = now
      }
    }

    events.forEach(event => {
      document.addEventListener(event, handler, { passive: true })
    })
  }

  return {
    isUnlocked,
    isSetup,
    entries: filteredEntries,
    allEntries: entries,
    categories,
    currentCategory,
    searchQuery,
    checkSetup,
    setup,
    unlock,
    lock,
    loadEntries,
    addEntry,
    editEntry,
    removeEntry,
    setCategory,
    setSearch,
    startAutoLock,
    resetAutoLock,
    enableAutoLockListeners
  }
})
