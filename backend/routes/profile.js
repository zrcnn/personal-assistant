const express = require('express');
const { pool } = require('../config/db');
const router = express.Router();

// Auth middleware
const authMiddleware = (req, res, next) => {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未提供认证令牌' });
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pa_jwt_secret_2026_ne');
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: '无效令牌' });
  }
};

// ===== 获取用户信息 =====
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, nickname, avatar, bio, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const user = rows[0];
    res.json({
      id: user.id,
      username: user.username,
      nickname: user.nickname || '',
      avatar: user.avatar || '',
      bio: user.bio || '',
      createdAt: user.created_at
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// ===== 更新用户信息（昵称、签名） =====
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { nickname, bio } = req.body;
    
    // 验证昵称
    if (nickname !== undefined) {
      if (nickname.length > 50) {
        return res.status(400).json({ error: '昵称不能超过 50 个字符' });
      }
      // 检查昵称是否包含敏感词（简单过滤）
      const sensitiveWords = ['管理员', '系统', '官方', 'admin'];
      for (const word of sensitiveWords) {
        if (nickname.toLowerCase().includes(word.toLowerCase())) {
          return res.status(400).json({ error: '昵称包含不允许的内容' });
        }
      }
    }
    
    // 验证签名
    if (bio !== undefined && bio.length > 200) {
      return res.status(400).json({ error: '个性签名不能超过 200 个字符' });
    }
    
    const updates = [];
    const values = [];
    if (nickname !== undefined) { updates.push('nickname = ?'); values.push(nickname); }
    if (bio !== undefined) { updates.push('bio = ?'); values.push(bio); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: '请提供要更新的信息' });
    }
    
    values.push(req.user.id);
    
    await pool.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    res.json({ success: true, message: '更新成功' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

// ===== 修改密码 =====
router.put('/profile/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: '请提供当前密码和新密码' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少 6 个字符' });
    }
    
    // 验证当前密码
    const [rows] = await pool.execute(
      'SELECT password_hash FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    const bcrypt = require('bcrypt');
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    
    if (!valid) {
      return res.status(400).json({ error: '当前密码错误' });
    }
    
    // 更新密码
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newHash, req.user.id]
    );
    
    res.json({ success: true, message: '密码修改成功' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: '修改密码失败' });
  }
});

// ===== 获取用户统计信息 =====
router.get('/profile/stats', authMiddleware, async (req, res) => {
  try {
    // 获取对话数量
    const [convRows] = await pool.execute(
      'SELECT COUNT(*) as count FROM conversations WHERE user_id = ?',
      [req.user.id]
    );
    
    // 获取待办数量
    const [todoRows] = await pool.execute(
      'SELECT COUNT(*) as total, SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed FROM todos WHERE user_id = ?',
      [req.user.id]
    );
    
    res.json({
      conversations: convRows[0]?.count || 0,
      todos: {
        total: todoRows[0]?.total || 0,
        completed: todoRows[0]?.completed || 0
      }
    });
  } catch (err) {
    console.error('Get stats error:', err);
    // 返回默认值，不报错
    res.json({
      conversations: 0,
      todos: { total: 0, completed: 0 }
    });
  }
});

module.exports = router;
