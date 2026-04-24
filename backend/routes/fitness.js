const express = require('express');
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Auto-create tables
async function ensureFitnessTables() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      height DECIMAL(4,1) DEFAULT 170.0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS body_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      record_date DATE NOT NULL,
      weight DECIMAL(5,1),
      body_fat DECIMAL(4,1),
      muscle DECIMAL(5,1),
      water DECIMAL(4,1),
      bmr INT,
      bmi DECIMAL(4,1),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_record_date (record_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[Fitness] Tables ensured.');
}

ensureFitnessTables().catch(err => console.error('[Fitness] Failed to create tables:', err));

// --- Profile (height) ---

// GET /api/fitness/profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM user_profiles WHERE user_id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      // Auto-create default profile
      await pool.execute(
        'INSERT INTO user_profiles (user_id) VALUES (?)',
        [req.user.id]
      );
      const [newRows] = await pool.execute(
        'SELECT * FROM user_profiles WHERE user_id = ?',
        [req.user.id]
      );
      res.json(newRows[0]);
    } else {
      res.json(rows[0]);
    }
  } catch (err) {
    console.error('[Fitness] GET profile error:', err);
    res.status(500).json({ error: '获取用户资料失败' });
  }
});

// PUT /api/fitness/profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { height } = req.body;
    if (!height || height < 50 || height > 250) {
      return res.status(400).json({ error: '身高不合法（50-250cm）' });
    }
    // Upsert
    await pool.execute(`
      INSERT INTO user_profiles (user_id, height) VALUES (?, ?)
      ON DUPLICATE KEY UPDATE height = ?, updated_at = CURRENT_TIMESTAMP
    `, [req.user.id, height, height]);
    const [rows] = await pool.execute(
      'SELECT * FROM user_profiles WHERE user_id = ?',
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[Fitness] PUT profile error:', err);
    res.status(500).json({ error: '更新身高失败' });
  }
});

// --- Records ---

// GET /api/fitness/records?range=week|month|year
router.get('/records', authMiddleware, async (req, res) => {
  try {
    const { range } = req.query;
    let dateFilter = '';
    if (range === 'week') {
      dateFilter = 'AND record_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (range === 'month') {
      dateFilter = 'AND record_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    } else if (range === 'year') {
      dateFilter = 'AND record_date >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)';
    }

    const [rows] = await pool.execute(
      `SELECT * FROM body_records WHERE user_id = ? ${dateFilter} ORDER BY record_date ASC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[Fitness] GET records error:', err);
    res.status(500).json({ error: '获取记录失败' });
  }
});

// POST /api/fitness/records
router.post('/records', authMiddleware, async (req, res) => {
  try {
    const { record_date, weight, body_fat, muscle, water, bmr, notes } = req.body;
    if (!record_date) {
      return res.status(400).json({ error: '记录日期不能为空' });
    }

    // Get user height for BMI calculation
    let height = 170;
    try {
      const [profileRows] = await pool.execute(
        'SELECT height FROM user_profiles WHERE user_id = ?',
        [req.user.id]
      );
      if (profileRows.length > 0 && profileRows[0].height) {
        height = profileRows[0].height;
      }
    } catch (e) { /* use default */ }

    // Calculate BMI
    let bmi = null;
    if (weight && height > 0) {
      bmi = parseFloat((weight / Math.pow(height / 100, 2)).toFixed(1));
    }

    const [result] = await pool.execute(
      `INSERT INTO body_records (user_id, record_date, weight, body_fat, muscle, water, bmr, bmi, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        record_date,
        weight !== undefined ? weight : null,
        body_fat !== undefined ? body_fat : null,
        muscle !== undefined ? muscle : null,
        water !== undefined ? water : null,
        bmr !== undefined ? bmr : null,
        bmi,
        notes || null
      ]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM body_records WHERE id = ?',
      [result.insertId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[Fitness] POST records error:', err);
    res.status(500).json({ error: '创建记录失败' });
  }
});

// PUT /api/fitness/records/:id
router.put('/records/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { record_date, weight, body_fat, muscle, water, bmr, notes } = req.body;

    const [existing] = await pool.execute(
      'SELECT * FROM body_records WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '记录不存在' });
    }

    // Recalculate BMI if weight changed
    let bmi = existing[0].bmi;
    const newWeight = weight !== undefined ? weight : existing[0].weight;
    if (newWeight && (weight !== undefined)) {
      let height = 170;
      try {
        const [profileRows] = await pool.execute(
          'SELECT height FROM user_profiles WHERE user_id = ?',
          [req.user.id]
        );
        if (profileRows.length > 0 && profileRows[0].height) {
          height = profileRows[0].height;
        }
      } catch (e) {}
      bmi = parseFloat((newWeight / Math.pow(height / 100, 2)).toFixed(1));
    }

    await pool.execute(
      `UPDATE body_records SET record_date = ?, weight = ?, body_fat = ?, muscle = ?, water = ?, bmr = ?, bmi = ?, notes = ?
       WHERE id = ? AND user_id = ?`,
      [
        record_date !== undefined ? record_date : existing[0].record_date,
        weight !== undefined ? weight : existing[0].weight,
        body_fat !== undefined ? body_fat : existing[0].body_fat,
        muscle !== undefined ? muscle : existing[0].muscle,
        water !== undefined ? water : existing[0].water,
        bmr !== undefined ? bmr : existing[0].bmr,
        bmi,
        notes !== undefined ? (notes || null) : existing[0].notes,
        id,
        req.user.id
      ]
    );

    const [rows] = await pool.execute('SELECT * FROM body_records WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('[Fitness] PUT records error:', err);
    res.status(500).json({ error: '更新记录失败' });
  }
});

// DELETE /api/fitness/records/:id
router.delete('/records/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute(
      'DELETE FROM body_records WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '记录不存在' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Fitness] DELETE records error:', err);
    res.status(500).json({ error: '删除记录失败' });
  }
});

// --- Stats ---

// GET /api/fitness/stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM body_records WHERE user_id = ? ORDER BY record_date DESC',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.json({ latest: null, weekChange: null, monthChange: null });
    }

    const latest = rows[0];

    // Find records for week/month comparison
    const now = new Date(rows[0].record_date);
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const weekRecord = [...rows].reverse().find(r => new Date(r.record_date) <= weekAgo) || null;
    const monthRecord = [...rows].reverse().find(r => new Date(r.record_date) <= monthAgo) || null;

    function calcChange(current, previous) {
      if (previous === null || current === null) return null;
      const val = parseFloat((current - previous).toFixed(1));
      return { value: val, direction: val > 0 ? 'up' : val < 0 ? 'down' : 'stable' };
    }

    const metrics = ['weight', 'body_fat', 'muscle', 'bmi'];
    const weekChange = {};
    const monthChange = {};

    for (const m of metrics) {
      weekChange[m] = calcChange(latest[m], weekRecord ? weekRecord[m] : null);
      monthChange[m] = calcChange(latest[m], monthRecord ? monthRecord[m] : null);
    }

    res.json({ latest, weekChange, monthChange });
  } catch (err) {
    console.error('[Fitness] GET stats error:', err);
    res.status(500).json({ error: '获取统计失败' });
  }
});

module.exports = router;
