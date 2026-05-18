/**
 * 前端加密工具 - 使用 Web Crypto API
 * PBKDF2-SHA256 (100k iterations) 派生密钥 + AES-256-GCM 加密
 */

// 检查 Web Crypto API 可用性
if (!window.crypto || !window.crypto.subtle) {
  console.error(
    'Web Crypto API 不可用。请确保：\n' +
    '1. 使用 HTTPS 协议访问（localhost 除外）\n' +
    '2. 浏览器支持 Web Crypto API（现代浏览器均支持）'
  )
}

const ALGORITHM = 'AES-GCM'
const HASH_ALGORITHM = 'SHA-256'
const ITERATIONS = 100000
const KEY_LENGTH = 256
const SALT_LENGTH = 16
const IV_LENGTH = 12
const TAG_LENGTH = 128

/**
 * 生成随机盐值
 */
export function generateSalt() {
  return window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
}

/**
 * 生成随机 IV
 */
function generateIV() {
  return window.crypto.getRandomValues(new Uint8Array(IV_LENGTH))
}

/**
 * 从主密码派生加密密钥
 * @param {string} password - 主密码
 * @param {Uint8Array} salt - 盐值
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(password, salt) {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(password)

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    keyData,
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: HASH_ALGORITHM
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * 加密数据
 * @param {string} plaintext - 明文字符串
 * @param {CryptoKey} key - 加密密钥
 * @returns {Promise<{ciphertext: Uint8Array, iv: Uint8Array}>}
 */
export async function encrypt(plaintext, key) {
  const encoder = new TextEncoder()
  const data = encoder.encode(plaintext)
  const iv = generateIV()

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    data
  )

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv
  }
}

/**
 * 解密数据
 * @param {Uint8Array} ciphertext - 密文
 * @param {Uint8Array} iv - IV
 * @param {CryptoKey} key - 解密密钥
 * @returns {Promise<string>}
 */
export async function decrypt(ciphertext, iv, key) {
  const plaintext = await window.crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    ciphertext
  )

  const decoder = new TextDecoder()
  return decoder.decode(plaintext)
}

/**
 * 将 Uint8Array 转为 Base64 字符串（用于存储）
 */
export function uint8ToBase64(arr) {
  return btoa(String.fromCharCode(...arr))
}

/**
 * 将 Base64 字符串转为 Uint8Array
 */
export function base64ToUint8(base64) {
  const binary = atob(base64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i)
  }
  return arr
}

/**
 * 完整加密流程：密码 -> 加密后的 JSON 字符串
 */
export async function encryptData(plaintext, masterPassword) {
  const salt = generateSalt()
  const key = await deriveKey(masterPassword, salt)
  const { ciphertext, iv } = await encrypt(plaintext, key)

  return {
    salt: uint8ToBase64(salt),
    iv: uint8ToBase64(iv),
    ciphertext: uint8ToBase64(ciphertext)
  }
}

/**
 * 完整解密流程：加密后的 JSON -> 明文
 */
export async function decryptData(encrypted, masterPassword) {
  const salt = base64ToUint8(encrypted.salt)
  const iv = base64ToUint8(encrypted.iv)
  const ciphertext = base64ToUint8(encrypted.ciphertext)

  const key = await deriveKey(masterPassword, salt)
  return decrypt(ciphertext, iv, key)
}

/**
 * 验证主密码是否正确（通过尝试解密一个已知的测试数据）
 */
export async function verifyMasterPassword(encryptedTest, masterPassword) {
  try {
    await decryptData(encryptedTest, masterPassword)
    return true
  } catch {
    return false
  }
}
