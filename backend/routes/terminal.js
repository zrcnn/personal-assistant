const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const os = require('os');
const pty = require('node-pty');
const router = express.Router();

// Shared sessions map
const sessions = new Map();

// POST /api/terminal/sessions — 创建新会话
router.post('/sessions', authMiddleware, adminOnly, (req, res) => {
  const userSessions = [...sessions.values()].filter(s => s.userId === req.user.id);
  if (userSessions.length >= 3) {
    if (userSessions[0].pty) userSessions[0].pty.kill();
    // Notify any SSE listeners
    if (userSessions[0].sseRes) {
      userSessions[0].sseRes.end();
    }
    sessions.delete(userSessions[0].id);
  }

  const shell = process.env.SHELL || '/bin/bash';
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color' }
  });

  const sessionId = `term_${req.user.id}_${Date.now()}`;
  const session = {
    id: sessionId,
    userId: req.user.id,
    pty: ptyProcess,
    cols: 80,
    rows: 24,
    sseRes: null // Will be set when SSE connects
  };

  sessions.set(sessionId, session);

  // Pty exit handler
  ptyProcess.onExit(({ exitCode, signal }) => {
    const s = sessions.get(sessionId);
    if (s && s.sseRes) {
      try {
        s.sseRes.write(`data: ${JSON.stringify({ type: 'exit', code: exitCode || signal })}\n\n`);
        s.sseRes.end();
      } catch (e) {}
    }
    sessions.delete(sessionId);
  });

  res.json({ id: sessionId, cols: 80, rows: 24 });
});

// GET /api/terminal/sessions/:id/output — SSE stream
router.get('/sessions/:id/output', authMiddleware, adminOnly, (req, res) => {
  const { id } = req.params;
  const session = sessions.get(id);

  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ error: '终端会话不存在' });
  }

  if (!session.pty) {
    return res.status(410).json({ error: '终端已退出' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Store SSE response in session so pty data can be forwarded
  session.sseRes = res;

  // Send initial ready message
  res.write(`data: ${JSON.stringify({ type: 'ready', id })}\n\n`);

  // Forward pty output to SSE
  const originalOnData = session.pty.onData.bind(session.pty);
  session.pty.onData((data) => {
    if (res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify({ type: 'output', data })}\n\n`);
    } catch (e) {}
  });

  // Keep-alive heartbeat
  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    try {
      res.write(': keepalive\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 15000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    session.sseRes = null;
    // Kill pty when client disconnects
    if (session.pty) {
      session.pty.kill();
    }
  });
});

// POST /api/terminal/sessions/:id/input
router.post('/sessions/:id/input', authMiddleware, adminOnly, (req, res) => {
  const { id } = req.params;
  const { data } = req.body;
  const session = sessions.get(id);

  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ error: '终端会话不存在' });
  }

  try {
    if (session.pty) {
      session.pty.write(data || '');
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '输入失败' });
  }
});

// POST /api/terminal/sessions/:id/resize
router.post('/sessions/:id/resize', authMiddleware, adminOnly, (req, res) => {
  const { id } = req.params;
  const { cols, rows } = req.body;
  const session = sessions.get(id);

  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ error: '终端会话不存在' });
  }

  try {
    if (session.pty) {
      session.pty.resize(cols, rows);
      session.cols = cols;
      session.rows = rows;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '调整大小失败' });
  }
});

// DELETE /api/terminal/sessions/:id
router.delete('/sessions/:id', authMiddleware, adminOnly, (req, res) => {
  const { id } = req.params;
  const session = sessions.get(id);

  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ error: '终端会话不存在' });
  }

  try {
    if (session.sseRes) {
      try { session.sseRes.end(); } catch (e) {}
    }
    if (session.pty) session.pty.kill();
    sessions.delete(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '关闭会话失败' });
  }
});

router.sessions = sessions;
module.exports = router;
