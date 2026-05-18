/**
 * 密码强度评估工具
 */

/**
 * 评估密码强度
 * @param {string} password
 * @returns {{ score: number, level: 'weak' | 'medium' | 'strong', label: string, color: string }}
 */
export function assessPasswordStrength(password) {
  if (!password) {
    return { score: 0, level: 'weak', label: '弱', color: '#ef4444' }
  }

  let score = 0
  const len = password.length

  // 长度评分
  if (len >= 8) score += 1
  if (len >= 12) score += 1
  if (len >= 16) score += 1
  if (len >= 20) score += 1

  // 字符类型多样性
  if (/[a-z]/.test(password)) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^a-zA-Z0-9]/.test(password)) score += 1

  // 额外奖励
  // 同时包含大小写和数字
  if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password)) score += 1
  // 包含特殊字符且长度足够
  if (/[^a-zA-Z0-9]/.test(password) && len >= 8) score += 1

  // 惩罚：连续重复字符
  if (/(.)\1{2,}/.test(password)) score -= 1
  // 惩罚：常见模式
  if (/^(123|abc|qwerty|password|admin)/i.test(password)) score -= 2

  // 确定等级
  let level, label, color
  if (score <= 3) {
    level = 'weak'
    label = '弱'
    color = '#ef4444'
  } else if (score <= 6) {
    level = 'medium'
    label = '中'
    color = '#f59e0b'
  } else {
    level = 'strong'
    label = '强'
    color = '#22c55e'
  }

  return { score, level, label, color }
}

/**
 * 密码强度条组件的数据
 */
export function getPasswordStrengthBar(password) {
  const { score, level, color } = assessPasswordStrength(password)
  // 最大分数为 10
  const percentage = Math.min((score / 10) * 100, 100)
  return { percentage, color, level, label: assessPasswordStrength(password).label }
}
