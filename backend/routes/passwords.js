const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { encrypt, decrypt } = require('../config/encryption');
const { authMiddleware } = require('../middleware/auth');

// 所有密码相关接口都需要认证
router.use(authMiddleware);

// ===== 密码分类管理 =====

// 获取用户的密码分类列表
router.get('/password-categories', async (req, res) => {
  try {
    const [categories] = await pool.execute(
      'SELECT * FROM password_categories WHERE user_id = ? ORDER BY sort_order, id',
      [req.user.id]
    );
    res.json(categories);
  } catch (err) {
    console.error('[PasswordCategories] Get error:', err);
    res.status(500).json({ error: '获取分类列表失败' });
  }
});

// 创建分类
router.post('/password-categories', async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '分类名称不能为空' });
    }

    // 获取最大 sort_order
    const [maxRow] = await pool.execute(
      'SELECT MAX(sort_order) as max_order FROM password_categories WHERE user_id = ?',
      [req.user.id]
    );
    const nextOrder = (maxRow[0].max_order || 0) + 1;

    const [result] = await pool.execute(
      'INSERT INTO password_categories (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)',
      [req.user.id, name.trim(), color || '#1a1a2e', nextOrder]
    );

    res.json({
      id: result.insertId,
      name: name.trim(),
      color: color || '#1a1a2e',
      sort_order: nextOrder,
      user_id: req.user.id
    });
  } catch (err) {
    console.error('[PasswordCategories] Create error:', err);
    res.status(500).json({ error: '创建分类失败' });
  }
});

// 更新分类（重命名、改颜色、改排序）
router.put('/password-categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, sort_order } = req.body;

    // 确认分类属于当前用户
    const [existing] = await pool.execute(
      'SELECT * FROM password_categories WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '分类不存在' });
    }

    await pool.execute(
      `UPDATE password_categories 
       SET name = ?, color = ?, sort_order = ? 
       WHERE id = ? AND user_id = ?`,
      [name || existing[0].name, color || existing[0].color, sort_order ?? existing[0].sort_order, id, req.user.id]
    );

    const [updated] = await pool.execute(
      'SELECT * FROM password_categories WHERE id = ?',
      [id]
    );
    res.json(updated[0]);
  } catch (err) {
    console.error('[PasswordCategories] Update error:', err);
    res.status(500).json({ error: '更新分类失败' });
  }
});

// 删除分类
router.delete('/password-categories/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 确认分类属于当前用户
    const [existing] = await pool.execute(
      'SELECT * FROM password_categories WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '分类不存在' });
    }

    // 将该分类下的密码的 category_id 设为 NULL
    await pool.execute(
      'UPDATE passwords SET category_id = NULL WHERE category_id = ? AND user_id = ?',
      [id, req.user.id]
    );

    await pool.execute(
      'DELETE FROM password_categories WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[PasswordCategories] Delete error:', err);
    res.status(500).json({ error: '删除分类失败' });
  }
});

// ===== 密码管理 =====

// 获取密码列表（支持搜索和分类筛选）
router.get('/passwords', async (req, res) => {
  try {
    const { search, category_id } = req.query;
    let sql = `
      SELECT p.id, p.title, p.username, p.url, p.notes, p.category_id, p.created_at, p.updated_at,
             pc.name as category_name, pc.color as category_color
      FROM passwords p
      LEFT JOIN password_categories pc ON p.category_id = pc.id
      WHERE p.user_id = ?
    `;
    const params = [req.user.id];

    if (category_id && category_id !== 'all') {
      sql += ' AND p.category_id = ?';
      params.push(category_id);
    }

    if (search) {
      sql += ' AND (p.title LIKE ? OR p.username LIKE ? OR p.url LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    sql += ' ORDER BY p.updated_at DESC';

    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Passwords] List error:', err);
    res.status(500).json({ error: '获取密码列表失败' });
  }
});

// 获取单条密码详情（解密后返回）
router.get('/passwords/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      `SELECT p.*, pc.name as category_name, pc.color as category_color
       FROM passwords p
       LEFT JOIN password_categories pc ON p.category_id = pc.id
       WHERE p.id = ? AND p.user_id = ?`,
      [id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '密码记录不存在' });
    }

    const row = rows[0];
    // 解密密码
    row.password = decrypt(row.password_encrypted);

    res.json(row);
  } catch (err) {
    console.error('[Passwords] Get error:', err);
    res.status(500).json({ error: '获取密码详情失败' });
  }
});

// 创建新密码
router.post('/passwords', async (req, res) => {
  try {
    const { title, username, password, url, notes, category_id } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    if (!password) {
      return res.status(400).json({ error: '密码不能为空' });
    }

    // 验证分类归属（如果提供了 category_id）
    if (category_id) {
      const [cat] = await pool.execute(
        'SELECT id FROM password_categories WHERE id = ? AND user_id = ?',
        [category_id, req.user.id]
      );
      if (cat.length === 0) {
        return res.status(400).json({ error: '无效的分类' });
      }
    }

    const passwordEncrypted = encrypt(password);

    const [result] = await pool.execute(
      `INSERT INTO passwords (user_id, category_id, title, username, password_encrypted, url, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, category_id || null, title.trim(), username || null, passwordEncrypted, url || null, notes || null]
    );

    const [newRow] = await pool.execute(
      'SELECT * FROM passwords WHERE id = ?',
      [result.insertId]
    );

    res.json(newRow[0]);
  } catch (err) {
    console.error('[Passwords] Create error:', err);
    res.status(500).json({ error: '创建密码失败' });
  }
});

// 更新密码
router.put('/passwords/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, username, password, url, notes, category_id } = req.body;

    // 确认密码属于当前用户
    const [existing] = await pool.execute(
      'SELECT * FROM passwords WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '密码记录不存在' });
    }

    // 验证分类归属
    if (category_id) {
      const [cat] = await pool.execute(
        'SELECT id FROM password_categories WHERE id = ? AND user_id = ?',
        [category_id, req.user.id]
      );
      if (cat.length === 0) {
        return res.status(400).json({ error: '无效的分类' });
      }
    }

    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push('title = ?'); params.push(title.trim()); }
    if (username !== undefined) { updates.push('username = ?'); params.push(username || null); }
    if (password !== undefined && password) { updates.push('password_encrypted = ?'); params.push(encrypt(password)); }
    if (url !== undefined) { updates.push('url = ?'); params.push(url || null); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes || null); }
    if (category_id !== undefined) { updates.push('category_id = ?'); params.push(category_id || null); }

    if (updates.length === 0) {
      return res.json(existing[0]);
    }

    params.push(id, req.user.id);

    await pool.execute(
      `UPDATE passwords SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      params
    );

    const [updated] = await pool.execute(
      'SELECT * FROM passwords WHERE id = ?',
      [id]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('[Passwords] Update error:', err);
    res.status(500).json({ error: '更新密码失败' });
  }
});

// 删除密码
router.delete('/passwords/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.execute(
      'SELECT * FROM passwords WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '密码记录不存在' });
    }

    await pool.execute(
      'DELETE FROM passwords WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[Passwords] Delete error:', err);
    res.status(500).json({ error: '删除密码失败' });
  }
});

module.exports = router;
