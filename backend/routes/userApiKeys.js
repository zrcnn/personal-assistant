const express = require('express');
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { encrypt, decrypt } = require('../config/encryption');

const router = express.Router();

// Auto-create user_api_keys table on startup
async function ensureTable() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_api_keys (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      provider VARCHAR(50) NOT NULL,
      model_name VARCHAR(100) NOT NULL,
      api_key_encrypted VARCHAR(500) NOT NULL,
      api_base VARCHAR(500) DEFAULT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('[UserApiKeys] Table ensured.');
}

ensureTable().catch(err => console.error('[UserApiKeys] Failed to create table:', err));

// Mask API key for display (show first 4 and last 4 chars)
function maskKey(encrypted) {
  try {
    const raw = decrypt(encrypted);
    if (raw.length <= 8) return '****';
    return raw.slice(0, 4) + '****' + raw.slice(-4);
  } catch {
    return '****';
  }
}

// GET /api/user-api-keys — get all keys for current user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, user_id, provider, model_name, api_base, is_active, created_at, updated_at FROM user_api_keys WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    // Return masked key indicator (not the actual key)
    const keys = rows.map(row => ({
      ...row,
      api_key_masked: '****'
    }));
    res.json(keys);
  } catch (err) {
    console.error('[UserApiKeys] GET error:', err);
    res.status(500).json({ error: '获取 API Key 列表失败' });
  }
});

// POST /api/user-api-keys — create a new key
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { provider, model_name, api_key, api_base, is_active } = req.body;
    console.log(`[UserApiKeys] POST user_id=${req.user.id} provider=${provider} model=${model_name} base=${api_base || '(default)'}`);
    if (!provider || !provider.trim()) {
      return res.status(400).json({ error: '请选择或输入 Provider' });
    }
    if (!model_name || !model_name.trim()) {
      return res.status(400).json({ error: '请选择或输入模型名称' });
    }
    if (!api_key || !api_key.trim()) {
      return res.status(400).json({ error: 'API Key 不能为空' });
    }

    const apiKeyEncrypted = encrypt(api_key.trim());
    const apiBaseValue = api_base && api_base.trim() ? api_base.trim() : null;
    const activeValue = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    const [result] = await pool.execute(
      'INSERT INTO user_api_keys (user_id, provider, model_name, api_key_encrypted, api_base, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, provider.trim(), model_name.trim(), apiKeyEncrypted, apiBaseValue, activeValue]
    );
    console.log(`[UserApiKeys] Created key id=${result.insertId} for user_id=${req.user.id}`);

    const [rows] = await pool.execute(
      'SELECT id, user_id, provider, model_name, api_base, is_active, created_at, updated_at FROM user_api_keys WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({ ...rows[0], api_key_masked: '****' });
  } catch (err) {
    console.error('[UserApiKeys] POST error:', err);
    res.status(500).json({ error: '创建 API Key 失败' });
  }
});

// PUT /api/user-api-keys/:id — update a key
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { provider, model_name, api_key, api_base, is_active } = req.body;

    // Verify ownership
    const [existing] = await pool.execute(
      'SELECT * FROM user_api_keys WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'API Key 不存在' });
    }

    const updatedProvider = provider && provider.trim() ? provider.trim() : existing[0].provider;
    const updatedModelName = model_name && model_name.trim() ? model_name.trim() : existing[0].model_name;
    const updatedApiBase = api_base !== undefined ? (api_base && api_base.trim() ? api_base.trim() : null) : existing[0].api_base;
    const updatedActive = is_active !== undefined ? (is_active ? 1 : 0) : existing[0].is_active;

    // Only update api_key if provided
    let apiKeyEncrypted = existing[0].api_key_encrypted;
    if (api_key && api_key.trim()) {
      apiKeyEncrypted = encrypt(api_key.trim());
    }

    await pool.execute(
      'UPDATE user_api_keys SET provider = ?, model_name = ?, api_key_encrypted = ?, api_base = ?, is_active = ? WHERE id = ? AND user_id = ?',
      [updatedProvider, updatedModelName, apiKeyEncrypted, updatedApiBase, updatedActive, id, req.user.id]
    );

    const [rows] = await pool.execute(
      'SELECT id, user_id, provider, model_name, api_base, is_active, created_at, updated_at FROM user_api_keys WHERE id = ?',
      [id]
    );

    res.json({ ...rows[0], api_key_masked: '****' });
  } catch (err) {
    console.error('[UserApiKeys] PUT error:', err);
    res.status(500).json({ error: '更新 API Key 失败' });
  }
});

// DELETE /api/user-api-keys/:id — delete a key
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute(
      'DELETE FROM user_api_keys WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'API Key 不存在' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[UserApiKeys] DELETE error:', err);
    res.status(500).json({ error: '删除 API Key 失败' });
  }
});

// GET /api/user-api-keys/:id/decrypt — get decrypted key (for internal use)
router.get('/:id/decrypt', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT * FROM user_api_keys WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'API Key 不存在' });
    }
    const key = rows[0];
    const decrypted = decrypt(key.api_key_encrypted);
    res.json({
      id: key.id,
      provider: key.provider,
      model_name: key.model_name,
      api_key: decrypted,
      api_base: key.api_base
    });
  } catch (err) {
    console.error('[UserApiKeys] Decrypt error:', err);
    res.status(500).json({ error: '解密失败' });
  }
});

module.exports = router;
