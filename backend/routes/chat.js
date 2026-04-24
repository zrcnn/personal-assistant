const express = require('express');
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const aiService = require('../services/aiService');

const router = express.Router();

// Use aiService's token estimation
const estimateTokens = aiService.estimateTokens;

// ========== Conversations ==========

// GET /api/conversations
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT c.*,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
        (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
       FROM conversations c
       WHERE c.user_id = ?
       ORDER BY c.updated_at DESC`,
      [req.user.id]
    );
    res.json({ conversations: rows });
  } catch (err) {
    console.error('[Chat] List conversations error:', err);
    res.status(500).json({ error: '获取对话列表失败' });
  }
});

// POST /api/conversations
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO conversations (user_id, title) VALUES (?, ?)',
      [req.user.id, title || '新对话']
    );

    // Insert a welcome message (not counted in AI context)
    await pool.execute(
      'INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?, ?, ?, ?)',
      [result.insertId, 'assistant', '你好！有什么我可以帮你的吗？', 0]
    );

    const [conv] = await pool.execute(
      'SELECT * FROM conversations WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json({ conversation: conv[0] });
  } catch (err) {
    console.error('[Chat] Create conversation error:', err);
    res.status(500).json({ error: '创建对话失败' });
  }
});

// DELETE /api/conversations/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id FROM conversations WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '对话不存在' });
    }

    await pool.execute('DELETE FROM messages WHERE conversation_id = ?', [req.params.id]);
    await pool.execute('DELETE FROM conversations WHERE id = ?', [req.params.id]);

    res.json({ success: true });
  } catch (err) {
    console.error('[Chat] Delete conversation error:', err);
    res.status(500).json({ error: '删除对话失败' });
  }
});

// PUT /api/conversations/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: '标题不能为空' });
    }

    const [rows] = await pool.execute(
      'SELECT id FROM conversations WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '对话不存在' });
    }

    await pool.execute(
      'UPDATE conversations SET title = ? WHERE id = ?',
      [title, req.params.id]
    );

    const [updated] = await pool.execute(
      'SELECT * FROM conversations WHERE id = ?',
      [req.params.id]
    );
    res.json({ conversation: updated[0] });
  } catch (err) {
    console.error('[Chat] Rename conversation error:', err);
    res.status(500).json({ error: '更新对话失败' });
  }
});

// ========== Messages ==========

// GET /api/conversations/:id/messages
router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    const [conv] = await pool.execute(
      'SELECT id FROM conversations WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (conv.length === 0) {
      return res.status(404).json({ error: '对话不存在' });
    }

    const [messages] = await pool.execute(
      `SELECT * FROM messages WHERE conversation_id = ${pool.escape(id)} ORDER BY created_at ASC LIMIT ${Math.max(1, limit)} OFFSET ${Math.max(0, offset)}`
    );

    const [countResult] = await pool.execute(
      `SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ${pool.escape(id)}`
    );

    res.json({
      messages,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    });
  } catch (err) {
    console.error('[Chat] Get messages error:', err);
    res.status(500).json({ error: '获取消息失败' });
  }
});

// POST /api/conversations/:id/messages — Send message via OpenClaw WebSocket Session
router.post('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '消息内容不能为空' });
    }

    // Verify ownership
    const [conv] = await pool.execute(
      'SELECT id FROM conversations WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (conv.length === 0) {
      return res.status(404).json({ error: '对话不存在' });
    }

    // Save user message
    const userTokens = estimateTokens(content);
    await pool.execute(
      'INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?, ?, ?, ?)',
      [id, 'user', content, userTokens]
    );

    // Update conversation timestamp
    await pool.execute(
      'UPDATE conversations SET updated_at = NOW() WHERE id = ?',
      [id]
    );

    // Get current date/time info for the AI
    const now = new Date();
    const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Build enhanced system prompt with current time context
    const systemPrompt = `你是一个友好、专业的AI助手NE。请用简洁清晰的中文回答用户问题。

**当前时间信息**：
- 日期：${dateStr}
- 时间：${timeStr}
- 时区：${timezone}

你可以帮助用户进行对话、编程、写作、翻译、总结等各种任务。如果用户询问时间相关的问题，请使用上述时间信息回答。`;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Get conversation history for context
    const [messages] = await pool.execute(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 50',
      [id]
    );
    const conversationHistory = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Send message via direct AI API with context
    let fullContent = '';
    let resolved = false;

    try {
      await aiService.sendChatStream(
        conversationHistory,
        content,
        (chunk) => {
          fullContent += chunk;
          res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        },
        { systemPrompt, userId: req.user.id }
      );

      resolved = true;
      const tokens = estimateTokens(fullContent);
      res.write(`data: ${JSON.stringify({ done: true, tokens })}\n\n`);

      // Save assistant message to DB
      if (fullContent) {
        setImmediate(async () => {
          try {
            await pool.execute(
              'INSERT INTO messages (conversation_id, role, content, tokens) VALUES (?, ?, ?, ?)',
              [id, 'assistant', fullContent, tokens]
            );

            // Auto-detect task requests and create todo (fire and forget)
            const taskPatterns = /(?:需要|请|帮我|开发|实现|添加|修复|优化|增加|创建|搭建|部署|配置|修改|设计)/i;
            const todoPatterns = /(?:待办|任务|需求|功能|页面|接口|服务|模块|组件)/i;
            if (taskPatterns.test(content) && todoPatterns.test(content) && content.length > 10) {
              const [existing] = await pool.execute(
                `SELECT id FROM todos WHERE user_id = ? AND title LIKE ? AND status != 'completed' LIMIT 1`,
                [req.user.id, `%${content.slice(0, 20)}%`]
              );
              if (!existing || existing.length === 0) {
                const title = content.length > 30 ? content.slice(0, 30) + '...' : content;
                await pool.execute(
                  'INSERT INTO todos (user_id, title, description, solution, status, progress) VALUES (?, ?, ?, ?, ?, ?)',
                  [req.user.id, title, content, '', 'pending', 0]
                );
                console.log(`[Chat] Auto-created todo from chat for user ${req.user.id}`);
              }
            }
          } catch (err) {
            console.error('[Chat] Save assistant message error:', err.message);
          }
        });
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      if (!resolved) {
        console.error('[Chat] AI API error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'AI 服务错误: ' + err.message });
        } else {
          res.write(`data: ${JSON.stringify({ error: 'AI 服务错误' })}\n\n`);
          res.end();
        }
      }
    }

    // Safety timeout: ensure response ends
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ error: '响应超时' })}\n\n`);
          res.end();
        }
      }
    }, 120000);

  } catch (err) {
    console.error('[Chat] Send message error:', err);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: '发送消息失败' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: '发送消息失败' });
    }
  }
});

// POST /api/conversations/:id/title — AI generate conversation title
router.post('/:id/title', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const [conv] = await pool.execute(
      'SELECT id FROM conversations WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (conv.length === 0) {
      return res.status(404).json({ error: '对话不存在' });
    }

    const [messages] = await pool.execute(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 6',
      [id]
    );

    if (messages.length === 0) {
      return res.json({ title: '新对话' });
    }

    // Use AI to generate title via direct API
    const titlePrompt = `根据以下对话内容，生成一个简短的标题（不超过20个字），只返回标题文字，不要任何解释或标点：\n\n${messages.map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n')}`;

    let title = '';
    try {
      await aiService.sendChatStream(
        [],
        titlePrompt,
        (chunk) => { title += chunk; },
        { systemPrompt: '你只负责生成简短标题，不要解释。', userId: req.user.id }
      );
      title = title.trim().replace(/^["']|["']$/g, '');
      if (title.length > 30) title = title.substring(0, 30) + '...';
    } catch (e) {
      console.error('[Chat] Title generation AI error:', e);
    }

    if (!title) title = '新对话';

    await pool.execute(
      'UPDATE conversations SET title = ? WHERE id = ?',
      [title, id]
    );

    res.json({ title });
  } catch (err) {
    console.error('[Chat] Title generation error:', err);
    res.status(500).json({ error: '生成标题失败' });
  }
});

module.exports = router;
