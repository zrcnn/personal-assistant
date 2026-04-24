const express = require('express');
const { pool } = require('../config/db');
const router = express.Router();

// Auto-create tables
async function ensureToolTables() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tool_notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(200) DEFAULT '',
      content TEXT,
      color VARCHAR(20) DEFAULT '#4a9eff',
      pinned TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_pinned (pinned)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tool_expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      category VARCHAR(50) NOT NULL DEFAULT '其他',
      description VARCHAR(500) DEFAULT '',
      expense_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_date (expense_date),
      INDEX idx_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tool_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      color VARCHAR(20) DEFAULT '#4a9eff',
      reminded TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_start_time (start_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tool_bookmarks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      url VARCHAR(2000) NOT NULL,
      category VARCHAR(50) DEFAULT '未分类',
      favicon VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tool_drawings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(255) NOT NULL DEFAULT '未命名画布',
      width INT NOT NULL,
      height INT NOT NULL,
      data_url LONGTEXT,
      elements_json LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.log('[Tools] Tables ensured.');
}

ensureToolTables();

// ============ NOTES ============
router.get('/notes', async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.execute(
      'SELECT * FROM tool_notes WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC',
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[Notes] List error:', err);
    res.status(500).json({ error: '获取便签失败' });
  }
});

router.post('/notes', async (req, res) => {
  try {
    const { title, content, color } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO tool_notes (user_id, title, content, color) VALUES (?, ?, ?, ?)',
      [req.user.id, title || '', content || '', color || '#4a9eff']
    );
    res.json({ id: result.insertId, title, content, color });
  } catch (err) {
    console.error('[Notes] Create error:', err);
    res.status(500).json({ error: '创建便签失败' });
  }
});

router.put('/notes/:id', async (req, res) => {
  try {
    const { title, content, color, pinned } = req.body;
    const fields = [];
    const values = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (content !== undefined) { fields.push('content = ?'); values.push(content); }
    if (color !== undefined) { fields.push('color = ?'); values.push(color); }
    if (pinned !== undefined) { fields.push('pinned = ?'); values.push(pinned ? 1 : 0); }
    if (fields.length === 0) return res.status(400).json({ error: '没有更新字段' });
    values.push(req.params.id);
    await pool.execute(
      `UPDATE tool_notes SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      [...values, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Notes] Update error:', err);
    res.status(500).json({ error: '更新便签失败' });
  }
});

router.delete('/notes/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM tool_notes WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Notes] Delete error:', err);
    res.status(500).json({ error: '删除便签失败' });
  }
});

// ============ EXPENSES ============
router.get('/expenses', async (req, res) => {
  try {
    const userId = req.user.id;
    const { month, category } = req.query;
    let sql = 'SELECT * FROM tool_expenses WHERE user_id = ?';
    const params = [userId];
    if (month) { sql += ' AND DATE_FORMAT(expense_date, "%Y-%m") = ?'; params.push(month); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY expense_date DESC, created_at DESC';
    const [rows] = await pool.execute(sql, params);

    // Get summary
    let summarySql = 'SELECT category, SUM(amount) as total, COUNT(*) as count FROM tool_expenses WHERE user_id = ?';
    const summaryParams = [userId];
    if (month) { summarySql += ' AND DATE_FORMAT(expense_date, "%Y-%m") = ?'; summaryParams.push(month); }
    summarySql += ' GROUP BY category ORDER BY total DESC';
    const [summary] = await pool.execute(summarySql, summaryParams);

    res.json({ items: rows, summary });
  } catch (err) {
    console.error('[Expenses] List error:', err);
    res.status(500).json({ error: '获取记账失败' });
  }
});

router.post('/expenses', async (req, res) => {
  try {
    const { amount, category, description, expense_date } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO tool_expenses (user_id, amount, category, description, expense_date) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, amount, category || '其他', description || '', expense_date]
    );
    res.json({ id: result.insertId });
  } catch (err) {
    console.error('[Expenses] Create error:', err);
    res.status(500).json({ error: '添加记账失败' });
  }
});

router.put('/expenses/:id', async (req, res) => {
  try {
    const { amount, category, description, expense_date } = req.body;
    await pool.execute(
      `UPDATE tool_expenses SET amount=?, category=?, description=?, expense_date=? WHERE id=? AND user_id=?`,
      [amount, category, description, expense_date, req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Expenses] Update error:', err);
    res.status(500).json({ error: '更新记账失败' });
  }
});

router.delete('/expenses/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM tool_expenses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Expenses] Delete error:', err);
    res.status(500).json({ error: '删除记账失败' });
  }
});

// ============ EVENTS ============
router.get('/events', async (req, res) => {
  try {
    const userId = req.user.id;
    const { start, end } = req.query;
    let sql = 'SELECT * FROM tool_events WHERE user_id = ?';
    const params = [userId];
    if (start) { sql += ' AND start_time >= ?'; params.push(start); }
    if (end) { sql += ' AND start_time <= ?'; params.push(end); }
    sql += ' ORDER BY start_time ASC';
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Events] List error:', err);
    res.status(500).json({ error: '获取日程失败' });
  }
});

router.post('/events', async (req, res) => {
  try {
    const { title, description, start_time, end_time, color } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO tool_events (user_id, title, description, start_time, end_time, color) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, title, description || '', start_time, end_time || null, color || '#4a9eff']
    );
    res.json({ id: result.insertId });
  } catch (err) {
    console.error('[Events] Create error:', err);
    res.status(500).json({ error: '创建日程失败' });
  }
});

router.put('/events/:id', async (req, res) => {
  try {
    const { title, description, start_time, end_time, color } = req.body;
    await pool.execute(
      `UPDATE tool_events SET title=?, description=?, start_time=?, end_time=?, color=? WHERE id=? AND user_id=?`,
      [title, description, start_time, end_time, color, req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Events] Update error:', err);
    res.status(500).json({ error: '更新日程失败' });
  }
});

router.delete('/events/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM tool_events WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Events] Delete error:', err);
    res.status(500).json({ error: '删除日程失败' });
  }
});

// ============ BOOKMARKS ============
router.get('/bookmarks', async (req, res) => {
  try {
    const userId = req.user.id;
    const { category } = req.query;
    let sql = 'SELECT * FROM tool_bookmarks WHERE user_id = ?';
    const params = [userId];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[Bookmarks] List error:', err);
    res.status(500).json({ error: '获取书签失败' });
  }
});

router.post('/bookmarks', async (req, res) => {
  try {
    const { title, url, category } = req.body;
    const favicon = `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
    const [result] = await pool.execute(
      'INSERT INTO tool_bookmarks (user_id, title, url, category, favicon) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, title, url, category || '未分类', favicon]
    );
    res.json({ id: result.insertId, favicon });
  } catch (err) {
    console.error('[Bookmarks] Create error:', err);
    res.status(500).json({ error: '添加书签失败' });
  }
});

router.put('/bookmarks/:id', async (req, res) => {
  try {
    const { title, url, category } = req.body;
    await pool.execute(
      `UPDATE tool_bookmarks SET title=?, url=?, category=? WHERE id=? AND user_id=?`,
      [title, url, category, req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Bookmarks] Update error:', err);
    res.status(500).json({ error: '更新书签失败' });
  }
});

router.delete('/bookmarks/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM tool_bookmarks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Bookmarks] Delete error:', err);
    res.status(500).json({ error: '删除书签失败' });
  }
});

// ============ WEATHER (proxy to wttr.in) ============
router.get('/weather/:city', async (req, res) => {
  try {
    const city = encodeURIComponent(req.params.city);
    const resp = await fetch(`https://wttr.in/${city}?format=j1`, {
      headers: { 'User-Agent': 'curl/7.68.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!resp.ok) throw new Error('Weather API error');
    const data = await resp.json();

    const current = data.current_condition[0];
    const weather = {
      city: data.nearest_area[0]?.areaName[0]?.value || req.params.city,
      temp: current.temp_C,
      feelsLike: current.FeelsLikeC,
      humidity: current.humidity,
      windSpeed: current.windspeedKmph,
      windDir: current.winddir16Point,
      desc: current.lang_zh?.[0]?.value || current.weatherDesc[0]?.value,
      icon: current.weatherCode,
      uvIndex: current.uvIndex,
      visibility: current.visibility,
      pressure: current.pressure,
      today: data.weather?.[0] ? {
        maxTemp: data.weather[0].maxtempC,
        minTemp: data.weather[0].mintempC,
        hourly: (data.weather[0].hourly || []).map(h => ({
          time: h.time.padStart(4, '0'),
          temp: h.tempC,
          desc: h.lang_zh?.[0]?.value || h.weatherDesc[0]?.value,
          icon: h.weatherCode,
          windSpeed: h.windspeedKmph,
          humidity: h.humidity
        }))
      } : null,
      forecast: (data.weather || []).slice(1, 4).map(d => ({
        date: d.date,
        maxTemp: d.maxtempC,
        minTemp: d.mintempC,
        desc: d.hourly?.[4]?.lang_zh?.[0]?.value || d.hourly?.[4]?.weatherDesc[0]?.value || ''
      }))
    };
    res.json(weather);
  } catch (err) {
    console.error('[Weather] Fetch error:', err);
    res.status(500).json({ error: '获取天气失败', detail: err.message });
  }
});

// ============ DRAWINGS ============
router.get('/drawings', async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.execute(
      'SELECT id, name, width, height, created_at, updated_at FROM tool_drawings WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[Drawings] List error:', err);
    res.status(500).json({ error: '获取绘图记录失败' });
  }
});

router.get('/drawings/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.execute(
      'SELECT * FROM tool_drawings WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: '绘图不存在' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Drawings] Get error:', err);
    res.status(500).json({ error: '获取绘图失败' });
  }
});

router.post('/drawings', async (req, res) => {
  try {
    const { name, width, height, dataUrl, elementsData } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO tool_drawings (user_id, name, width, height, data_url, elements_json) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, name || '未命名画布', width, height, dataUrl || null, elementsData ? JSON.stringify(elementsData) : null]
    );
    res.json({ id: result.insertId, name: name || '未命名画布' });
  } catch (err) {
    console.error('[Drawings] Create error:', err);
    res.status(500).json({ error: '保存绘图失败' });
  }
});

router.put('/drawings/:id', async (req, res) => {
  try {
    const { name, width, height, dataUrl, elementsData } = req.body;
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (width !== undefined) { fields.push('width = ?'); values.push(width); }
    if (height !== undefined) { fields.push('height = ?'); values.push(height); }
    if (dataUrl !== undefined) { fields.push('data_url = ?'); values.push(dataUrl); }
    if (elementsData !== undefined) { fields.push('elements_json = ?'); values.push(elementsData ? JSON.stringify(elementsData) : null); }
    if (fields.length === 0) return res.status(400).json({ error: '没有更新字段' });
    values.push(req.params.id, req.user.id);
    await pool.execute(
      `UPDATE tool_drawings SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Drawings] Update error:', err);
    res.status(500).json({ error: '更新绘图失败' });
  }
});

router.delete('/drawings/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM tool_drawings WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Drawings] Delete error:', err);
    res.status(500).json({ error: '删除绘图失败' });
  }
});

module.exports = router;
