const express = require('express');
const { pool } = require('../config/db');
const router = express.Router();
const http = require('http');

// Auto-create tables
async function ensureOCRTables() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tool_ocr_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(200) DEFAULT '',
      result TEXT,
      thumbnail TEXT,
      width INT DEFAULT 0,
      height INT DEFAULT 0,
      confidence FLOAT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_created (user_id, created_at)
    )
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS tool_car_rec_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      brand VARCHAR(100) DEFAULT '',
      model VARCHAR(100) DEFAULT '',
      confidence FLOAT DEFAULT 0,
      thumbnail TEXT,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_created (user_id, created_at)
    )
  `);
}

ensureOCRTables().catch(console.error);

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

// ===== OCR API (Server-side with Baidu) =====
router.post('/ocr', authMiddleware, async (req, res) => {
  try {
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: '请提供图片数据' });
    }
    
    // Try Baidu OCR API first (if configured)
    const baiduResult = await baiduOCR(image);
    if (baiduResult) {
      return res.json(baiduResult);
    }
    
    // Fallback: Tell frontend to use client-side OCR
    res.json({
      text: '',
      confidence: 0,
      clientSide: true,
      message: '请使用前端 OCR 识别（未配置百度 API）'
    });
  } catch (err) {
    console.error('OCR error:', err);
    res.status(500).json({ error: 'OCR 识别失败: ' + err.message });
  }
});

/**
 * 百度 OCR access_token 缓存
 */
let _baiduToken = null;
let _baiduTokenExpiry = 0;

async function getBaiduOCRToken() {
  if (_baiduToken && Date.now() < _baiduTokenExpiry) {
    return _baiduToken;
  }
  
  const apiKey = process.env.BAIDU_OCR_API_KEY;
  const secretKey = process.env.BAIDU_OCR_SECRET_KEY;
  
  if (!apiKey || !secretKey) {
    return null;
  }
  
  return new Promise((resolve) => {
    const data = `grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
    const req = http.request({
      hostname: 'aip.baidubce.com',
      port: 80,
      path: '/oauth/2.0/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.length
      }
    }, response => {
      let body = '';
      response.on('data', d => body += d);
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.access_token) {
            _baiduToken = parsed.access_token;
            _baiduTokenExpiry = Date.now() + 29 * 24 * 60 * 60 * 1000;
            resolve(_baiduToken);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end(data);
  });
}

/**
 * 百度 OCR 通用文字识别（高精度版）
 */
async function baiduOCR(base64Image) {
  const token = await getBaiduOCRToken();
  if (!token) return null;
  
  return new Promise((resolve) => {
    const data = JSON.stringify({
      image: base64Image,
      image_type: 'BASE64',
      language_type: 'CHN_ENG'
    });
    
    const req = http.request({
      hostname: 'aip.baidubce.com',
      port: 80,
      path: `/rest/2.0/ocr/v1/accurate_basic?access_token=${token}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    }, response => {
      let body = '';
      response.on('data', d => body += d);
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.words_result) {
            const text = parsed.words_result.map(item => item.words).join('\n');
            const avgConf = parsed.words_result.reduce((sum, item) => {
              return sum + (item.confidence || 100);
            }, 0) / parsed.words_result.length;
            resolve({
              text: text || '（未识别到文字）',
              confidence: Math.round(avgConf)
            });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end(data);
  });
}

// ===== HISTORY API =====
router.get('/ocr/history', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, thumbnail, width, height, confidence, created_at FROM tool_ocr_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Load OCR history error:', err);
    res.status(500).json({ error: '加载历史记录失败' });
  }
});

router.get('/ocr/history/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM tool_ocr_history WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '记录不存在' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Get OCR history error:', err);
    res.status(500).json({ error: '获取记录失败' });
  }
});

router.post('/ocr/history', authMiddleware, async (req, res) => {
  try {
    const { name, result, thumbnail, width, height, confidence } = req.body;
    const [result2] = await pool.execute(
      `INSERT INTO tool_ocr_history (user_id, name, result, thumbnail, width, height, confidence) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, name || '', result || '', thumbnail || '', width || 0, height || 0, confidence || 0]
    );
    res.json({ id: result2.insertId, success: true });
  } catch (err) {
    console.error('Save OCR history error:', err);
    res.status(500).json({ error: '保存记录失败' });
  }
});

router.delete('/ocr/history/:id', authMiddleware, async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM tool_ocr_history WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Delete OCR history error:', err);
    res.status(500).json({ error: '删除记录失败' });
  }
});

// ===== CAR RECOGNITION HISTORY =====
router.get('/car-rec/history', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, brand, model, confidence, thumbnail, details, created_at FROM tool_car_rec_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Load car rec history error:', err);
    res.status(500).json({ error: '加载历史记录失败' });
  }
});

router.post('/car-rec/history', authMiddleware, async (req, res) => {
  try {
    const { brand, model, confidence, thumbnail, details } = req.body;
    const [result2] = await pool.execute(
      `INSERT INTO tool_car_rec_history (user_id, brand, model, confidence, thumbnail, details) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, brand || '', model || '', confidence || 0, thumbnail || '', details || '']
    );
    res.json({ id: result2.insertId, success: true });
  } catch (err) {
    console.error('Save car rec history error:', err);
    res.status(500).json({ error: '保存记录失败' });
  }
});

router.delete('/car-rec/history/:id', authMiddleware, async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM tool_car_rec_history WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Delete car rec history error:', err);
    res.status(500).json({ error: '删除记录失败' });
  }
});

module.exports = router;
