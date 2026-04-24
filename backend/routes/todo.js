const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// OpenClaw Gateway config
const OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:18789';
const OPENCLAW_AUTH_TOKEN = 'zrc837303';

// Auto-create todos table
async function ensureTodosTable() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS todos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      solution TEXT,
      status ENUM('pending','processing','in_progress','completed') DEFAULT 'pending',
      progress INT DEFAULT 0,
      source VARCHAR(20) DEFAULT 'manual',
      feishu_id VARCHAR(64) DEFAULT NULL,
      due_date DATE DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      UNIQUE KEY uk_user_feishu (user_id, feishu_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // Migrate: add source/feishu_id/due_date columns if missing
  try { await pool.execute('ALTER TABLE todos ADD COLUMN source VARCHAR(20) DEFAULT \'manual\''); } catch {}
  try { await pool.execute('ALTER TABLE todos ADD COLUMN feishu_id VARCHAR(64) DEFAULT NULL'); } catch {}
  try { await pool.execute('ALTER TABLE todos ADD COLUMN due_date DATE DEFAULT NULL'); } catch {}
  try { await pool.execute('ALTER TABLE todos ADD UNIQUE KEY uk_user_feishu (user_id, feishu_id)'); } catch {}
  try { await pool.execute('ALTER TABLE todos ADD COLUMN priority TINYINT DEFAULT 2 COMMENT \'0=紧急 1=高 2=中 3=低\''); } catch {}
  console.log('[Todo] Table ensured.');
}

ensureTodosTable().catch(err => console.error('[Todo] Failed to create table:', err));

// Multer config for todo images
const todoUploadDir = path.join(__dirname, '..', '..', 'uploads', 'todos');
if (!fs.existsSync(todoUploadDir)) fs.mkdirSync(todoUploadDir, { recursive: true });
const todoStorage = multer.diskStorage({
  destination: todoUploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const todoUpload = multer({
  storage: todoStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('只支持 jpg/png/gif/webp 格式'));
    }
  }
});

// Auto-create todo_images table
async function ensureTodoImagesTable() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS todo_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      todo_id INT NOT NULL,
      filename VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_todo_id (todo_id),
      FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[Todo] todo_images table ensured.');
}
ensureTodoImagesTable().catch(err => console.error('[Todo] Failed to create todo_images table:', err));

// GET /api/todos — get all todos for current user, ordered by created_at DESC
// ?source=ne → NE todos (feishu + ne), ?source=personal → manual/null, no param → all
router.get('/', authMiddleware, async (req, res) => {
  try {
    const source = req.query.source;
    let query, params;
    if (source === 'ne') {
      query = 'SELECT * FROM todos WHERE user_id = ? AND source IN (?, ?) ORDER BY created_at DESC';
      params = [req.user.id, 'feishu', 'ne'];
    } else if (source === 'personal') {
      query = 'SELECT * FROM todos WHERE user_id = ? AND (source = ? OR source IS NULL) ORDER BY priority ASC, created_at DESC';
      params = [req.user.id, 'manual'];
    } else {
      query = 'SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC';
      params = [req.user.id];
    }
    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[Todo] GET error:', err);
    res.status(500).json({ error: '获取待办列表失败' });
  }
});

// POST /api/todos — create a new todo
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, solution, status, progress } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    const validStatuses = ['pending', 'processing', 'in_progress', 'completed'];
    const todoStatus = validStatuses.includes(status) ? status : 'pending';
    const todoProgress = Math.max(0, Math.min(100, parseInt(progress) || 0));
    const source = ['feishu', 'manual', 'ne'].includes(req.body.source) ? req.body.source : 'manual';
    const rawPriority = parseInt(req.body.priority);
    const priority = req.body.priority !== undefined && !isNaN(rawPriority) ? Math.max(0, Math.min(3, rawPriority)) : 2;
    const [result] = await pool.execute(
      'INSERT INTO todos (user_id, title, description, solution, status, progress, source, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, title.trim(), description || null, solution || null, todoStatus, todoProgress, source, priority]
    );
    const [rows] = await pool.execute(
      'SELECT * FROM todos WHERE id = ?',
      [result.insertId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[Todo] POST error:', err);
    res.status(500).json({ error: '创建待办失败' });
  }
});

// PUT /api/todos/:id — update a todo
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, solution, status, progress, source, priority } = req.body;

    // Verify the todo belongs to the user
    const [existing] = await pool.execute(
      'SELECT * FROM todos WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '待办不存在' });
    }

    // Validate status if provided
    if (status && !['pending', 'processing', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ error: '无效的状态值' });
    }

    // Validate progress if provided
    const validatedProgress = progress !== undefined
      ? Math.max(0, Math.min(100, Math.round(progress)))
      : existing[0].progress;

    // If status changed to completed, set progress to 100
    const finalStatus = status || existing[0].status;
    const finalProgress = finalStatus === 'completed' && !progress
      ? 100
      : validatedProgress;

    await pool.execute(
      `UPDATE todos SET title = ?, description = ?, solution = ?, status = ?, progress = ?, source = ?, priority = ?
       WHERE id = ? AND user_id = ?`,
      [
        title !== undefined ? title.trim() : existing[0].title,
        description !== undefined ? (description || null) : existing[0].description,
        solution !== undefined ? (solution || null) : existing[0].solution,
        finalStatus,
        finalProgress,
        ['feishu', 'manual', 'ne'].includes(source) ? source : existing[0].source,
        (() => { const r = parseInt(priority); return priority !== undefined && !isNaN(r) ? Math.max(0, Math.min(3, r)) : (existing[0].priority ?? 2); })(),
        id,
        req.user.id
      ]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM todos WHERE id = ?',
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[Todo] PUT error:', err);
    res.status(500).json({ error: '更新待办失败' });
  }
});

// DELETE /api/todos/:id — delete a todo
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute(
      'DELETE FROM todos WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '待办不存在' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Todo] DELETE error:', err);
    res.status(500).json({ error: '删除待办失败' });
  }
});

// POST /api/todos/:id/execute — send todo to OpenClaw NE for execution
router.post('/:id/execute', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the todo
    const [existing] = await pool.execute(
      'SELECT * FROM todos WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '待办不存在' });
    }
    const todo = existing[0];

    // Update status to in_progress
    await pool.execute(
      'UPDATE todos SET status = ?, progress = ? WHERE id = ? AND user_id = ?',
      ['in_progress', Math.max(todo.progress, 10), id, req.user.id]
    );

    // Build the task message for NE
    const taskMessage = `你有一个待办任务需要执行。任务信息如下：
标题：${todo.title}
${todo.description ? `描述：${todo.description}` : ''}
${todo.solution ? `解决方式：${todo.solution}` : ''}
待办 ID：${todo.id}

请按以下步骤执行：
1. 阅读任务描述和解决方式，理解需求
2. 如果需要修改 PA 项目代码，直接修改文件并构建部署
3. 完成后通过 PA API 更新待办状态为已完成

更新待办状态的 API：
PUT http://127.0.0.1:8090/api/todos/${todo.id}
请求头：Authorization: Bearer ${req.headers.authorization?.split(' ')[1] || 'none'}
请求体：{"status": "completed", "progress": 100}

PA 项目路径：/opt/personalAssistant/
前端构建命令：cd /opt/personalAssistant/frontend && npm run build
后端重启命令：systemctl restart personal-assistant

注意：直接执行任务，不需要回复确认。完成后更新状态即可。`;

    // Send the task to NE via OpenClaw HTTP API (fire and forget)
    const userToken = req.headers.authorization?.split(' ')[1] || '';
    
    // Use spawn to run in background so we return immediately
    const { spawn } = require('child_process');
    const cmd = `curl -s --max-time 300 -X POST ${OPENCLAW_GATEWAY_URL}/v1/chat/completions \
      -H "Authorization: Bearer ${OPENCLAW_AUTH_TOKEN}" \
      -H "Content-Type: application/json" \
      -d '${JSON.stringify({
        model: "kat-coder-pro-v2/ep-qubph3-1775115536595397049",
        stream: false,
        messages: [
          { role: "system", content: `你是 NE，PA 项目的 AI 助手。用户通过待办系统触发了任务执行。PA 项目路径: /opt/personalAssistant/。前端构建: cd /opt/personalAssistant/frontend && npm run build。后端重启: systemctl restart personal-assistant。用 curl 更新待办状态: PUT http://127.0.0.1:8090/api/todos/${todo.id} -H "Authorization: Bearer ${userToken}" -H "Content-Type: application/json" -d '{"status":"completed","progress":100}'。直接执行，不要确认。` },
          { role: "user", content: taskMessage }
        ]
      }).replace(/'/g, "'\\''")}'`;

    const child = spawn('sh', ['-c', cmd], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    console.log(`[Todo] Execute triggered for todo #${id}, child pid: ${child.pid}`);

    // Return the updated todo immediately
    const [rows] = await pool.execute(
      'SELECT * FROM todos WHERE id = ?',
      [id]
    );
    res.json({ success: true, message: '已发送执行指令，NE 正在处理...', todo: rows[0] });
  } catch (err) {
    console.error('[Todo] EXECUTE error:', err);
    res.status(500).json({ error: '执行待办失败' });
  }
});

// POST /api/todos/sync-feishu — sync feishu tasks to PA todos
router.post('/sync-feishu', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch feishu tasks via OpenClaw Gateway
    const response = await fetch(`${OPENCLAW_GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENCLAW_AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'kat-coder-pro-v2/ep-qubph3-1775115536595397049',
        stream: false,
        messages: [
          {
            role: 'system',
            content: '你是一个 API 代理。用户需要获取飞书任务列表。请使用 feishu 相关工具获取用户的飞书任务列表（由 zrc 创建的待办），以 JSON 数组格式返回，每个任务包含以下字段：id（飞书任务ID）、title（标题）、status（状态：done/in_process/todo）、due_date（截止时间，ISO格式，如无则为null）。只返回 JSON 数组，不要加任何其他文字或 markdown 代码块。'
          },
          {
            role: 'user',
            content: '获取飞书任务列表，返回 JSON 数组，每项包含 id、title、status、due_date 字段。'
          }
        ]
      }),
      signal: AbortSignal.timeout(30000)
    });

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '[]';

    // Parse JSON from LLM response
    let feishuTasks = [];
    try {
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      feishuTasks = JSON.parse(jsonStr);
      if (!Array.isArray(feishuTasks)) feishuTasks = [];
    } catch {
      feishuTasks = [];
    }

    // 2. Get existing feishu todos for this user
    const [existing] = await pool.execute(
      'SELECT id, feishu_id, title, status FROM todos WHERE user_id = ? AND source = ?',
      [userId, 'feishu']
    );
    const existingMap = new Map();
    existing.forEach(row => {
      if (row.feishu_id) existingMap.set(row.feishu_id, row);
    });

    // 3. Status mapping
    const statusMap = { done: 'completed', in_process: 'in_progress', todo: 'pending' };
    let created = 0, updated = 0, skipped = 0;

    for (const task of feishuTasks) {
      if (!task.title || !task.id) { skipped++; continue; }

      const paStatus = statusMap[task.status] || 'pending';
      const dueDate = task.due_date ? new Date(task.due_date).toISOString().slice(0, 10) : null;

      if (existingMap.has(String(task.id))) {
        // Update status if changed
        const existingTodo = existingMap.get(String(task.id));
        if (existingTodo.status !== paStatus) {
          await pool.execute(
            'UPDATE todos SET status = ?, progress = ? WHERE id = ?',
            [paStatus, paStatus === 'completed' ? 100 : existingTodo.status === 'pending' ? 0 : undefined, existingTodo.id]
          );
          updated++;
        } else {
          skipped++;
        }
      } else {
        // Create new todo
        await pool.execute(
          'INSERT INTO todos (user_id, title, description, status, progress, source, feishu_id, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [userId, task.title.slice(0, 200), '飞书同步', paStatus, paStatus === 'completed' ? 100 : 0, 'feishu', String(task.id), dueDate]
        );
        created++;
      }
    }

    res.json({
      success: true,
      message: `同步完成：新增 ${created}，更新 ${updated}，跳过 ${skipped}`,
      stats: { created, updated, skipped, total: feishuTasks.length }
    });
  } catch (err) {
    console.error('[Todo] Sync feishu error:', err);
    res.status(500).json({ error: '同步飞书待办失败：' + (err.message || '未知错误'), success: false });
  }
});

// GET /api/todos/feishu — fetch feishu tasks via OpenClaw Gateway
router.get('/feishu', authMiddleware, async (req, res) => {
  try {
    const response = await fetch(`${OPENCLAW_GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENCLAW_AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'kat-coder-pro-v2/ep-qubph3-1775115536595397049',
        stream: false,
        messages: [
          {
            role: 'system',
            content: '你是一个 API 代理。用户需要获取飞书任务列表。请使用 feishu-drive 或相关工具获取用户的飞书任务列表，以 JSON 数组格式返回，每个任务包含 title（标题）、status（状态）、due_date（截止时间）字段。直接返回 JSON 数组，不要加 markdown 代码块。'
          },
          {
            role: 'user',
            content: '获取我的飞书任务列表，返回 JSON 数组格式，每项包含 title、status、due_date 字段。'
          }
        ]
      })
    });

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '[]';

    // Try to parse JSON from response
    let tasks = [];
    try {
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      tasks = JSON.parse(jsonStr);
    } catch {
      tasks = [];
    }

    res.json({ source: 'feishu', tasks });
  } catch (err) {
    console.error('[Todo] Feishu fetch error:', err);
    res.status(500).json({ error: '获取飞书任务失败', source: 'feishu', tasks: [] });
  }
});

// GET /api/todos/:id/images — get all images for a todo
router.get('/:id/images', authMiddleware, async (req, res) => {
  try {
    const [existing] = await pool.execute(
      'SELECT id FROM todos WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (existing.length === 0) return res.status(404).json({ error: '待办不存在' });

    const [rows] = await pool.execute(
      'SELECT * FROM todo_images WHERE todo_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(rows.map(r => ({
      id: r.id,
      filename: r.filename,
      original_name: r.original_name,
      url: `/uploads/todos/${r.filename}`,
      created_at: r.created_at
    })));
  } catch (err) {
    console.error('[Todo] GET images error:', err);
    res.status(500).json({ error: '获取图片失败' });
  }
});

// POST /api/todos/:id/images — upload images
router.post('/:id/images', authMiddleware, todoUpload.array('images', 10), async (req, res) => {
  try {
    const [existing] = await pool.execute(
      'SELECT id FROM todos WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (existing.length === 0) return res.status(404).json({ error: '待办不存在' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: '未选择图片' });

    const results = [];
    for (const file of req.files) {
      const [result] = await pool.execute(
        'INSERT INTO todo_images (todo_id, filename, original_name) VALUES (?, ?, ?)',
        [req.params.id, file.filename, file.originalname]
      );
      results.push({
        id: result.insertId,
        filename: file.filename,
        original_name: file.originalname,
        url: `/uploads/todos/${file.filename}`
      });
    }
    res.json(results);
  } catch (err) {
    console.error('[Todo] POST images error:', err);
    res.status(500).json({ error: '上传图片失败' });
  }
});

// DELETE /api/todos/:id/images/:imageId — delete an image
router.delete('/:id/images/:imageId', authMiddleware, async (req, res) => {
  try {
    const [existing] = await pool.execute(
      'SELECT id FROM todos WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (existing.length === 0) return res.status(404).json({ error: '待办不存在' });

    const [images] = await pool.execute(
      'SELECT * FROM todo_images WHERE id = ? AND todo_id = ?',
      [req.params.imageId, req.params.id]
    );
    if (images.length === 0) return res.status(404).json({ error: '图片不存在' });

    // Delete file from disk
    const filePath = path.join(todoUploadDir, images[0].filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }

    await pool.execute('DELETE FROM todo_images WHERE id = ?', [req.params.imageId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Todo] DELETE image error:', err);
    res.status(500).json({ error: '删除图片失败' });
  }
});

module.exports = router;
