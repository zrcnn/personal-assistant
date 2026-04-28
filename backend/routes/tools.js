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

  // ============ NEWS TABLES ============
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tool_news (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(500) NOT NULL,
      content LONGTEXT NOT NULL,
      summary VARCHAR(500) DEFAULT '',
      publish_date DATE NOT NULL,
      category VARCHAR(50) DEFAULT '综合',
      source VARCHAR(50) DEFAULT 'hermes',
      hermes_job_id VARCHAR(64) DEFAULT NULL,
      raw_content LONGTEXT,
      view_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_date (user_id, publish_date DESC),
      INDEX idx_date (publish_date DESC),
      INDEX idx_category (user_id, category),
      INDEX idx_source (source),
      UNIQUE KEY uk_job_date (user_id, hermes_job_id, publish_date),
      FULLTEXT KEY ft_search (title, content)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tool_news_tags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(50) NOT NULL,
      color VARCHAR(20) DEFAULT '#4a9eff',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uk_user_name (user_id, name),
      INDEX idx_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tool_news_tag_map (
      news_id INT NOT NULL,
      tag_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (news_id, tag_id),
      FOREIGN KEY (news_id) REFERENCES tool_news(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tool_news_tags(id) ON DELETE CASCADE
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

// ============ NEWS ============

const DEFAULT_CATEGORIES = [
  { key: '综合', icon: '📰', color: '#4a9eff' },
  { key: 'AI工具', icon: '🤖', color: '#51cf66' },
  { key: '大模型', icon: '🧠', color: '#ff6b6b' },
  { key: '框架更新', icon: '⚡', color: '#ffd43b' },
  { key: '研究突破', icon: '🔬', color: '#cc5de8' },
  { key: '开发者工具', icon: '🛠️', color: '#20c997' }
];

// Helper: get or create tag
async function getOrCreateTag(userId, name, color) {
  const [rows] = await pool.execute(
    'SELECT id FROM tool_news_tags WHERE user_id = ? AND name = ?',
    [userId, name]
  );
  if (rows.length > 0) return rows[0].id;
  const [result] = await pool.execute(
    'INSERT INTO tool_news_tags (user_id, name, color) VALUES (?, ?, ?)',
    [userId, name, color || '#4a9eff']
  );
  return result.insertId;
}

// Helper: set tags for a news item
async function setNewsTags(newsId, userId, tagNames) {
  // Remove existing tags
  await pool.execute('DELETE FROM tool_news_tag_map WHERE news_id = ?', [newsId]);
  if (!tagNames || tagNames.length === 0) return;
  // Clean up tag names
  const cleanNames = tagNames.map(t => t.trim()).filter(t => t);
  for (const name of cleanNames) {
    const tagId = await getOrCreateTag(userId, name);
    await pool.execute(
      'INSERT IGNORE INTO tool_news_tag_map (news_id, tag_id) VALUES (?, ?)',
      [newsId, tagId]
    );
  }
}

// Helper: get tags for a news item
async function getNewsTags(newsId) {
  const [rows] = await pool.execute(
    `SELECT t.id, t.name, t.color
     FROM tool_news_tags t
     JOIN tool_news_tag_map m ON t.id = m.tag_id
     WHERE m.news_id = ?`,
    [newsId]
  );
  return rows;
}

// Helper: auto-generate summary from content
function generateSummary(content, maxLen = 200) {
  const text = content.replace(/[#*`>\-\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

// GET /api/tools/news - List news with filters (shared across all users)
router.get('/news', async (req, res) => {
  try {
    const { month, category, tag, q, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    let whereClauses = ['1=1'];  // News is shared, no user_id filter
    let params = [];

    if (month) {
      whereClauses.push('DATE_FORMAT(publish_date, "%Y-%m") = ?');
      params.push(month);
    }
    if (category) {
      whereClauses.push('category = ?');
      params.push(category);
    }
    if (tag) {
      whereClauses.push(`id IN (
        SELECT news_id FROM tool_news_tag_map m
        JOIN tool_news_tags t ON m.tag_id = t.id
        WHERE t.name = ?
      )`);
      params.push(tag);
    }
    if (q) {
      whereClauses.push('MATCH(title, content) AGAINST(? IN NATURAL LANGUAGE MODE)');
      params.push(q);
    }

    const whereSQL = whereClauses.join(' AND ');

    // Count total
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM tool_news WHERE ${whereSQL}`,
      params
    );
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    // Get items
    const [rows] = await pool.execute(
      `SELECT id, title, summary, content, publish_date, category, source, view_count, created_at
       FROM tool_news WHERE ${whereSQL} ORDER BY publish_date DESC, created_at DESC LIMIT ${offset}, ${limit}`,
      params
    );

    // Get tags for each item
    const items = [];
    for (const row of rows) {
      const tags = await getNewsTags(row.id);
      items.push({ ...row, tags });
    }

    // Get category stats (global)
    const [catRows] = await pool.execute(
      `SELECT category, COUNT(*) as count FROM tool_news GROUP BY category ORDER BY count DESC`
    );

    // Get tags list (global)
    const [tagRows] = await pool.execute(
      `SELECT t.id, t.name, t.color, COUNT(m.news_id) as count
       FROM tool_news_tags t
       LEFT JOIN tool_news_tag_map m ON t.id = m.tag_id
       GROUP BY t.id ORDER BY count DESC LIMIT 20`
    );

    // Get available months (global)
    const [monthRows] = await pool.execute(
      `SELECT DISTINCT DATE_FORMAT(publish_date, "%Y-%m") as month
       FROM tool_news ORDER BY month DESC`
    );

    res.json({
      items,
      total,
      page: parseInt(page),
      pageSize: limit,
      totalPages,
      categories: catRows,
      tags: tagRows,
      months: monthRows.map(r => r.month)
    });
  } catch (err) {
    console.error('[News] List error:', err);
    res.status(500).json({ error: '获取新闻列表失败' });
  }
});

// GET /api/tools/news/months - Get available months (global)
router.get('/news/months', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT DATE_FORMAT(publish_date, "%Y-%m") as month
       FROM tool_news ORDER BY month DESC`
    );
    res.json({ months: rows.map(r => r.month) });
  } catch (err) {
    console.error('[News] Months error:', err);
    res.status(500).json({ error: '获取月份列表失败' });
  }
});

// GET /api/tools/news/:id - Get single news detail (global, no user_id filter)
router.get('/news/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM tool_news WHERE id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: '新闻不存在' });

    const news = rows[0];
    const tags = await getNewsTags(news.id);

    // Increment view count
    await pool.execute('UPDATE tool_news SET view_count = view_count + 1 WHERE id = ?', [news.id]);

    res.json({ ...news, tags });
  } catch (err) {
    console.error('[News] Get error:', err);
    res.status(500).json({ error: '获取新闻详情失败' });
  }
});

// POST /api/tools/news - Create news
router.post('/news', async (req, res) => {
  try {
    const { title, content, publish_date, category, tags, raw_content } = req.body;
    const summary = generateSummary(content);
    const [result] = await pool.execute(
      `INSERT INTO tool_news (user_id, title, content, summary, publish_date, category, source, raw_content)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)`,
      [req.user.id, title, content, summary, publish_date, category || '综合', raw_content || null]
    );
    if (tags && tags.length > 0) {
      await setNewsTags(result.insertId, req.user.id, tags);
    }
    res.json({ id: result.insertId, title });
  } catch (err) {
    console.error('[News] Create error:', err);
    res.status(500).json({ error: '创建新闻失败' });
  }
});

// PUT /api/tools/news/:id - Update news
router.put('/news/:id', async (req, res) => {
  try {
    const { title, content, publish_date, category, tags } = req.body;
    const summary = content ? generateSummary(content) : undefined;

    const fields = [];
    const values = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (content !== undefined) { fields.push('content = ?'); values.push(content); }
    if (summary !== undefined) { fields.push('summary = ?'); values.push(summary); }
    if (publish_date !== undefined) { fields.push('publish_date = ?'); values.push(publish_date); }
    if (category !== undefined) { fields.push('category = ?'); values.push(category); }
    if (fields.length === 0) return res.status(400).json({ error: '没有更新字段' });

    values.push(req.params.id, req.user.id);
    await pool.execute(
      `UPDATE tool_news SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );

    if (tags !== undefined) {
      await setNewsTags(req.params.id, req.user.id, tags);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[News] Update error:', err);
    res.status(500).json({ error: '更新新闻失败' });
  }
});

// DELETE /api/tools/news/:id - Delete news
router.delete('/news/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM tool_news WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[News] Delete error:', err);
    res.status(500).json({ error: '删除新闻失败' });
  }
});

// ============ NEWS TAGS ============

// GET /api/tools/news/tags - List all tags
router.get('/news/tags', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.id, t.name, t.color, COUNT(m.news_id) as count
       FROM tool_news_tags t
       LEFT JOIN tool_news_tag_map m ON t.id = m.tag_id
       WHERE t.user_id = ?
       GROUP BY t.id ORDER BY t.name`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[News Tags] List error:', err);
    res.status(500).json({ error: '获取标签列表失败' });
  }
});

// POST /api/tools/news/tags - Create tag
router.post('/news/tags', async (req, res) => {
  try {
    const { name, color } = req.body;
    const [result] = await pool.execute(
      'INSERT IGNORE INTO tool_news_tags (user_id, name, color) VALUES (?, ?, ?)',
      [req.user.id, name, color || '#4a9eff']
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ error: '标签已存在' });
    }
    res.json({ id: result.insertId, name, color: color || '#4a9eff' });
  } catch (err) {
    console.error('[News Tags] Create error:', err);
    res.status(500).json({ error: '创建标签失败' });
  }
});

// PUT /api/tools/news/tags/:id - Update tag
router.put('/news/tags/:id', async (req, res) => {
  try {
    const { name, color } = req.body;
    await pool.execute(
      'UPDATE tool_news_tags SET name = ?, color = ? WHERE id = ? AND user_id = ?',
      [name, color, req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[News Tags] Update error:', err);
    res.status(500).json({ error: '更新标签失败' });
  }
});

// DELETE /api/tools/news/tags/:id - Delete tag
router.delete('/news/tags/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM tool_news_tags WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[News Tags] Delete error:', err);
    res.status(500).json({ error: '删除标签失败' });
  }
});

// ============ NEWS SYNC (Webhook from Hermes Agent) ============
// Requires internal sync token
const NEWS_SYNC_TOKEN = process.env.NEWS_SYNC_TOKEN || 'pa_internal_sync_token_2026';

router.post('/news/sync', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (token !== NEWS_SYNC_TOKEN) {
      return res.status(403).json({ error: '无权限访问' });
    }

    const { job_id, date, title, content, category, tags, raw_content } = req.body;
    if (!job_id || !date || !title || !content) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // Check if already exists (idempotent)
    const [existing] = await pool.execute(
      'SELECT id FROM tool_news WHERE user_id = 7 AND hermes_job_id = ? AND publish_date = ?',
      [job_id, date]
    );
    if (existing.length > 0) {
      return res.json({ imported: false, skipped: true, id: existing[0].id, message: '已存在' });
    }

    // Use user_id = 7 (zrc - main admin user) for sync
    const summary = generateSummary(content);
    const [result] = await pool.execute(
      `INSERT INTO tool_news (user_id, title, content, summary, publish_date, category, source, hermes_job_id, raw_content)
       VALUES (7, ?, ?, ?, ?, ?, 'hermes', ?, ?)`,
      [title, content, summary, date, category || '综合', job_id, raw_content || null]
    );

    if (tags && tags.length > 0) {
      await setNewsTags(result.insertId, 7, tags);
    }

    res.json({ imported: true, id: result.insertId });
  } catch (err) {
    console.error('[News Sync] Error:', err);
    res.status(500).json({ error: '同步新闻失败', detail: err.message });
  }
});

// GET /api/tools/news/categories - Get category list with icons (global)
router.get('/news/categories', async (req, res) => {
  try {
    // Get global category stats
    const [stats] = await pool.execute(
      `SELECT category, COUNT(*) as count FROM tool_news GROUP BY category`
    );
    const statsMap = {};
    for (const s of stats) {
      statsMap[s.category] = s.count;
    }

    // Merge with defaults
    const categories = DEFAULT_CATEGORIES.map(c => ({
      ...c,
      count: statsMap[c.key] || 0
    }));

    res.json(categories);
  } catch (err) {
    console.error('[News Categories] Error:', err);
    res.status(500).json({ error: '获取分类列表失败' });
  }
});

// Standalone sync handler (no auth middleware) for webhook
const newsSyncRouter = require('express').Router();
newsSyncRouter.post('/news/sync', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (token !== NEWS_SYNC_TOKEN) {
      return res.status(403).json({ error: '无权限访问' });
    }

    const { job_id, date, title, content, category, tags, raw_content } = req.body;
    if (!job_id || !date || !title || !content) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // Check if already exists (idempotent)
    const [existing] = await pool.execute(
      'SELECT id FROM tool_news WHERE user_id = 7 AND hermes_job_id = ? AND publish_date = ?',
      [job_id, date]
    );
    if (existing.length > 0) {
      return res.json({ imported: false, skipped: true, id: existing[0].id, message: '已存在' });
    }

    // Use user_id = 7 (zrc - main admin user) for sync
    const summary = generateSummary(content);
    const [result] = await pool.execute(
      `INSERT INTO tool_news (user_id, title, content, summary, publish_date, category, source, hermes_job_id, raw_content)
       VALUES (7, ?, ?, ?, ?, ?, 'hermes', ?, ?)`,
      [title, content, summary, date, category || '综合', job_id, raw_content || null]
    );

    if (tags && tags.length > 0) {
      await setNewsTags(result.insertId, 7, tags);
    }

    res.json({ imported: true, id: result.insertId });
  } catch (err) {
    console.error('[News Sync] Error:', err);
    res.status(500).json({ error: '同步新闻失败', detail: err.message });
  }
});

module.exports = router;
module.exports.newsSyncHandler = newsSyncRouter;
