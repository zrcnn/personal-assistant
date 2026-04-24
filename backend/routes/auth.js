const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { generateToken, authMiddleware } = require('../middleware/auth');
const { encrypt } = require('../config/encryption');

const router = express.Router();

// Default KAT-Coder model config for new users
const DEFAULT_KAT_CODER_KEY = 'rkARKvOIxPVAAWe4TOrJ94oNLFijNtdPU3WjyPyY0ek';
const DEFAULT_KAT_CODER_BASE = 'https://wanqing.streamlakeapi.com/api/gateway/coding/v1';
const DEFAULT_KAT_CODER_MODEL = 'ep-qubph3-1775115536595397049';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar
      }
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: '登录失败' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6个字符' });
    }

    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, password_hash]
    );

    // Init default settings
    await pool.execute(
      'INSERT INTO user_settings (user_id, theme, settings_json) VALUES (?, ?, ?)',
      [result.insertId, 'dark', '{}']
    );

    // Init default API key (KAT-Coder) so new users can chat immediately
    const encryptedKey = encrypt(DEFAULT_KAT_CODER_KEY);
    await pool.execute(
      'INSERT INTO user_api_keys (user_id, provider, model_name, api_key_encrypted, api_base, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [result.insertId, 'kat-coder', DEFAULT_KAT_CODER_MODEL, encryptedKey, DEFAULT_KAT_CODER_BASE, 1]
    );
    console.log(`[Auth] Created default API key for new user ${username} (id=${result.insertId})`);

    const token = generateToken({ id: result.insertId, username });
    res.status(201).json({
      token,
      user: { id: result.insertId, username, avatar: null }
    });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: '注册失败' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, avatar, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('[Auth] Me error:', err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) {
      return res.status(400).json({ error: '请输入原密码和新密码' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: '新密码至少6个字符' });
    }

    const [rows] = await pool.execute(
      'SELECT password_hash FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const match = await bcrypt.compare(old_password, rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ error: '原密码错误' });
    }

    const password_hash = await bcrypt.hash(new_password, 10);
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [password_hash, req.user.id]
    );

    res.json({ success: true, message: '密码修改成功' });
  } catch (err) {
    console.error('[Auth] Change password error:', err);
    res.status(500).json({ error: '修改密码失败' });
  }
});

// GET /api/profile — Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, avatar, bio, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('[Auth] Get profile error:', err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// PUT /api/profile — Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { username, bio } = req.body;
    
    if (username) {
      // Check if username is already taken
      const [existing] = await pool.execute(
        'SELECT id FROM users WHERE username = ? AND id != ?',
        [username, req.user.id]
      );
      if (existing.length > 0) {
        return res.status(400).json({ error: '用户名已被使用' });
      }
    }
    
    const updates = [];
    const values = [];
    if (username) { updates.push('username = ?'); values.push(username); }
    if (bio !== undefined) { updates.push('bio = ?'); values.push(bio); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: '没有提供要更新的字段' });
    }
    
    values.push(req.user.id);
    await pool.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    res.json({ success: true, message: '资料更新成功' });
  } catch (err) {
    console.error('[Auth] Update profile error:', err);
    res.status(500).json({ error: '更新资料失败' });
  }
});

module.exports = router;
