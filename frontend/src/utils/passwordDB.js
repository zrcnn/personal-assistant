/**
 * IndexedDB 密码库封装
 * 数据库名: password-vault
 */

const DB_NAME = 'password-vault'
const DB_VERSION = 1
const STORE_VAULT = 'vault'
const STORE_META = 'meta'

/**
 * 打开数据库
 */
export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      // 密码库存储
      if (!db.objectStoreNames.contains(STORE_VAULT)) {
        const vaultStore = db.createObjectStore(STORE_VAULT, { keyPath: 'id' })
        vaultStore.createIndex('category', 'category', { unique: false })
        vaultStore.createIndex('siteName', 'siteName', { unique: false })
        vaultStore.createIndex('updatedAt', 'updatedAt', { unique: false })
      }

      // 元数据存储（主密码验证、盐值等）
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
  })
}

/**
 * 获取 store
 */
function getStore(db, storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName)
}

// ====== 元数据操作 ======

/**
 * 保存主密码验证数据（加密后的测试字符串）
 */
export async function saveMasterPasswordProof(encryptedProof) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const request = getStore(db, STORE_META, 'readwrite').put({
      key: 'masterPasswordProof',
      value: encryptedProof,
      createdAt: Date.now()
    })
    request.onsuccess = () => resolve(true)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 获取主密码验证数据
 */
export async function getMasterPasswordProof() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const request = getStore(db, STORE_META).get('masterPasswordProof')
    request.onsuccess = () => resolve(request.result?.value || null)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 检查是否已设置主密码
 */
export async function hasMasterPassword() {
  const proof = await getMasterPasswordProof()
  return !!proof
}

/**
 * 清除所有数据（重置）
 */
export async function clearVault() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_VAULT, STORE_META], 'readwrite')
    tx.objectStore(STORE_VAULT).clear()
    tx.objectStore(STORE_META).clear()
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
  })
}

// ====== 密码条目 CRUD ======

/**
 * 创建密码条目
 */
export async function createPasswordEntry(entry) {
  const db = await openDB()
  const newEntry = {
    ...entry,
    id: generateId(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  return new Promise((resolve, reject) => {
    const request = getStore(db, STORE_VAULT, 'readwrite').add(newEntry)
    request.onsuccess = () => resolve(newEntry)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 更新密码条目
 */
export async function updatePasswordEntry(entry) {
  const db = await openDB()
  const updatedEntry = {
    ...entry,
    updatedAt: Date.now()
  }

  return new Promise((resolve, reject) => {
    const request = getStore(db, STORE_VAULT, 'readwrite').put(updatedEntry)
    request.onsuccess = () => resolve(updatedEntry)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 删除密码条目
 */
export async function deletePasswordEntry(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const request = getStore(db, STORE_VAULT, 'readwrite').delete(id)
    request.onsuccess = () => resolve(true)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 获取单个密码条目
 */
export async function getPasswordEntry(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const request = getStore(db, STORE_VAULT).get(id)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 获取所有密码条目
 */
export async function getAllPasswordEntries() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const request = getStore(db, STORE_VAULT).getAll()
    request.onsuccess = () => {
      // 按更新时间倒序
      const entries = request.result || []
      entries.sort((a, b) => b.updatedAt - a.updatedAt)
      resolve(entries)
    }
    request.onerror = () => reject(request.error)
  })
}

/**
 * 按分类获取密码条目
 */
export async function getPasswordEntriesByCategory(category) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const index = getStore(db, STORE_VAULT).index('category')
    const request = index.getAll(category)
    request.onsuccess = () => {
      const entries = request.result || []
      entries.sort((a, b) => b.updatedAt - a.updatedAt)
      resolve(entries)
    }
    request.onerror = () => reject(request.error)
  })
}

/**
 * 获取所有分类（带计数）
 */
export async function getAllCategories() {
  const entries = await getAllPasswordEntries()
  const categoryMap = {}

  entries.forEach(entry => {
    const cat = entry.category || '未分类'
    if (!categoryMap[cat]) {
      categoryMap[cat] = 0
    }
    categoryMap[cat]++
  })

  return Object.entries(categoryMap).map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * 搜索密码条目（按站点名、用户名、备注）
 */
export async function searchPasswordEntries(query) {
  const entries = await getAllPasswordEntries()
  if (!query) return entries

  const q = query.toLowerCase()
  // 注意：entries 中的字段是加密的，这里只能按未加密的字段搜索
  // 实际上 siteName 也是加密存储的...
  // 所以我们只能搜索 category 和 url 字段
  return entries.filter(entry => {
    return (entry.category && entry.category.toLowerCase().includes(q)) ||
           (entry.url && entry.url.toLowerCase().includes(q))
  })
}

/**
 * 生成唯一 ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}
