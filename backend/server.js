const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const multer = require('multer');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { pool, ensureTables } = require('./config/db');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const systemRoutes = require('./routes/system');
const terminalRoutes = require('./routes/terminal');
const stockProxyRoutes = require('./routes/stockProxy');
const todoRoutes = require('./routes/todo');
const fitnessRoutes = require('./routes/fitness');
const userApiKeysRoutes = require('./routes/userApiKeys');
const modelUsageRoutes = require('./routes/modelUsage');
const ideRoutes = require('./routes/ide');
const toolsRoutes = require('./routes/tools');
const messagesRoutes = require('./routes/messages');
const videoRoutes = require('./routes/video');
const ocrRoutes = require('./routes/ocr');
const profileRoutes = require('./routes/profile');
const groupChatRoutes = require('./routes/groupChat');
const fileManagerRoutes = require('./routes/fileManager');
const messageWs = require('./services/messageWs');
const { authMiddleware } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 8090;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_change_in_production';

// Multer config for file uploads
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|bmp|svg|pdf|doc|docx|xls|xlsx|ppt|pptx|csv|txt|md|json|xml|html|css|js|py|java|c|cpp|mp3|mp4|wav|zip|rar|7z)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// No-cache for HTML to prevent stale JS/CSS hashes after rebuild
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

// Static files (Vue build output)
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/conversations', chatRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/terminal', terminalRoutes);
app.use('/api/stock-proxy', stockProxyRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/fitness', fitnessRoutes);
app.use('/api/user-api-keys', userApiKeysRoutes);
app.use('/api/model-usage', modelUsageRoutes);
app.use('/api/ide', ideRoutes);

// News sync webhook (no user auth, uses internal token) - must be BEFORE authMiddleware
const { newsSyncHandler } = require('./routes/tools');
app.use('/api/tools', newsSyncHandler);

app.use('/api/tools', authMiddleware, toolsRoutes);
app.use('/api/tools', authMiddleware, ocrRoutes);
app.use('/api/tools', authMiddleware, videoRoutes);
app.use('/api/tools', authMiddleware, profileRoutes);
app.use('/api/messages', authMiddleware, messagesRoutes);
app.use('/api/group-chats', authMiddleware, groupChatRoutes);
app.use('/api/file', authMiddleware, fileManagerRoutes);

// Admin API (configurable admin username)
app.use('/api/admin', authMiddleware, (req, res, next) => {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  if (req.user && req.user.username === adminUsername) next();
  else res.status(403).json({ error: '无权限' });
});
app.post('/api/admin/restart-gateway', async (req, res) => {
  try {
    const { execSync } = require('child_process');
    execSync('systemctl restart openclaw-gateway');
    res.json({ success: true, message: 'OpenClaw Gateway 重启成功' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Settings at /api/settings — inline since chat.js has them at /api/conversations/settings
app.get('/api/settings', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      await pool.execute(
        'INSERT INTO user_settings (user_id, theme, settings_json) VALUES (?, ?, ?)',
        [req.user.id, 'dark', '{}']
      );
      return res.json({ theme: 'dark', settings: {} });
    }
    const row = rows[0];
    res.json({
      theme: row.theme,
      settings: typeof row.settings_json === 'string'
        ? JSON.parse(row.settings_json)
        : (row.settings_json || {})
    });
  } catch (err) {
    console.error('[Settings] Get error:', err);
    res.status(500).json({ error: '获取设置失败' });
  }
});

app.put('/api/settings', authMiddleware, async (req, res) => {
  try {
    const { theme, settings } = req.body;
    const settingsJson = settings ? JSON.stringify(settings) : '{}';
    const themeValue = theme || 'dark';
    await pool.execute(
      `INSERT INTO user_settings (user_id, theme, settings_json)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE theme = VALUES(theme), settings_json = VALUES(settings_json)`,
      [req.user.id, themeValue, settingsJson]
    );
    res.json({ theme: themeValue, settings: settings || {} });
  } catch (err) {
    console.error('[Settings] Put error:', err);
    res.status(500).json({ error: '更新设置失败' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// File upload
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择文件' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  const fileInfo = {
    name: req.file.originalname,
    url: fileUrl,
    size: req.file.size,
    mimetype: req.file.mimetype
  };
  res.json(fileInfo);
});

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Error handler
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// Start
async function start() {
  try {
    await ensureTables();

    // SPA fallback: serve index.html for non-API routes
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    });

    // Create explicit HTTP server
    const server = http.createServer(app);

    // Attach user messaging WebSocket
    messageWs.attach(server);

    server.listen(PORT, () => {
      console.log(`[Server] Personal Assistant Backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

start();
