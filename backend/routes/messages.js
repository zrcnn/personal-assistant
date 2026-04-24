const express = require('express');
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const messageWs = require('../services/messageWs');

const router = express.Router();

// GET /api/messages/conversations — list conversations with unread count and last message
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT uc.id, uc.user1_id, uc.user2_id, uc.created_at, uc.updated_at,
        u1.username AS user1_name, u2.username AS user2_name,
        (SELECT content FROM user_messages um WHERE um.conversation_id = uc.id ORDER BY um.created_at DESC LIMIT 1) AS last_message,
        (SELECT um.created_at FROM user_messages um WHERE um.conversation_id = uc.id ORDER BY um.created_at DESC LIMIT 1) AS last_message_time,
        (SELECT COUNT(*) FROM user_messages um WHERE um.conversation_id = uc.id AND um.sender_id != ? AND um.read_at IS NULL) AS unread_count
       FROM user_conversations uc
       JOIN users u1 ON uc.user1_id = u1.id
       JOIN users u2 ON uc.user2_id = u2.id
       WHERE uc.user1_id = ? OR uc.user2_id = ?
       ORDER BY uc.updated_at DESC`,
      [req.user.id, req.user.id, req.user.id]
    );

    // Attach the "other user" info
    const conversations = rows.map(r => {
      const isUser1 = r.user1_id === req.user.id;
      return {
        id: r.id,
        other_user: {
          id: isUser1 ? r.user2_id : r.user1_id,
          username: isUser1 ? r.user2_name : r.user1_name
        },
        last_message: r.last_message,
        last_message_time: r.last_message_time,
        unread_count: parseInt(r.unread_count) || 0,
        created_at: r.created_at,
        updated_at: r.updated_at
      };
    });

    res.json({ conversations });
  } catch (err) {
    console.error('[Messages] List conversations error:', err);
    res.status(500).json({ error: '获取对话列表失败' });
  }
});

// POST /api/messages/conversations — create conversation with another user
router.post('/conversations', authMiddleware, async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: '缺少 user_id' });
    if (user_id === req.user.id) return res.status(400).json({ error: '不能和自己对话' });

    // Check if user exists
    const [targetUser] = await pool.execute('SELECT id FROM users WHERE id = ?', [user_id]);
    if (targetUser.length === 0) return res.status(404).json({ error: '用户不存在' });

    // Check if conversation already exists
    const [existing] = await pool.execute(
      `SELECT uc.id, u1.username AS user1_name, u2.username AS user2_name
       FROM user_conversations uc
       JOIN users u1 ON uc.user1_id = u1.id
       JOIN users u2 ON uc.user2_id = u2.id
       WHERE (uc.user1_id = ? AND uc.user2_id = ?) OR (uc.user1_id = ? AND uc.user2_id = ?)`,
      [req.user.id, user_id, user_id, req.user.id]
    );

    if (existing.length > 0) {
      const conv = existing[0];
      return res.json({
        conversation: {
          id: conv.id,
          other_user: {
            id: user_id,
            username: conv.user1_id === req.user.id ? conv.user2_name : conv.user1_name
          }
        }
      });
    }

    // Create new conversation (smaller id first for consistency)
    const [u1Id, u2Id] = req.user.id < user_id ? [req.user.id, user_id] : [user_id, req.user.id];
    const [result] = await pool.execute(
      'INSERT INTO user_conversations (user1_id, user2_id) VALUES (?, ?)',
      [u1Id, u2Id]
    );

    res.status(201).json({
      conversation: {
        id: result.insertId,
        other_user: { id: user_id, username: targetUser[0].username || 'Unknown' }
      }
    });
  } catch (err) {
    console.error('[Messages] Create conversation error:', err);
    res.status(500).json({ error: '创建对话失败' });
  }
});

// GET /api/messages/conversations/:id/messages — get messages
router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify user is part of this conversation
    const [conv] = await pool.execute(
      'SELECT id FROM user_conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
      [id, req.user.id, req.user.id]
    );
    if (conv.length === 0) return res.status(404).json({ error: '对话不存在' });

    const [messages] = await pool.execute(
      `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.created_at, m.read_at,
        u.username AS sender_name
       FROM user_messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = ?
       ORDER BY m.created_at ASC`,
      [id]
    );

    res.json({ messages });
  } catch (err) {
    console.error('[Messages] Get messages error:', err);
    res.status(500).json({ error: '获取消息失败' });
  }
});

// POST /api/messages/conversations/:id/messages — send message
router.post('/conversations/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: '消息内容不能为空' });

    // Verify user is part of this conversation
    const [conv] = await pool.execute(
      `SELECT id, user1_id, user2_id FROM user_conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)`,
      [id, req.user.id, req.user.id]
    );
    if (conv.length === 0) return res.status(404).json({ error: '对话不存在' });

    const [result] = await pool.execute(
      'INSERT INTO user_messages (conversation_id, sender_id, content) VALUES (?, ?, ?)',
      [id, req.user.id, content.trim()]
    );

    // Update conversation timestamp
    await pool.execute('UPDATE user_conversations SET updated_at = NOW() WHERE id = ?', [id]);

    const [msg] = await pool.execute(
      `SELECT m.*, u.username AS sender_name FROM user_messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?`,
      [result.insertId]
    );

    // Notify via WebSocket
    if (messageWs.broadcast) {
      const recipientId = conv[0].user1_id === req.user.id ? conv[0].user2_id : conv[0].user1_id;
      messageWs.broadcast(recipientId, {
        type: 'new_message',
        conversation_id: parseInt(id),
        message: msg[0]
      });
    }

    res.status(201).json({ message: msg[0] });
  } catch (err) {
    console.error('[Messages] Send message error:', err);
    res.status(500).json({ error: '发送消息失败' });
  }
});

// POST /api/messages/conversations/:id/read — mark messages as read
router.post('/conversations/:id/read', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify user is part of this conversation
    const [conv] = await pool.execute(
      'SELECT id FROM user_conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
      [id, req.user.id, req.user.id]
    );
    if (conv.length === 0) return res.status(404).json({ error: '对话不存在' });

    await pool.execute(
      'UPDATE user_messages SET read_at = NOW() WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL',
      [id, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[Messages] Mark read error:', err);
    res.status(500).json({ error: '标记已读失败' });
  }
});

// GET /api/messages/unread-count — get total unread count
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS count FROM user_messages um
       JOIN user_conversations uc ON um.conversation_id = uc.id
       WHERE (uc.user1_id = ? OR uc.user2_id = ?) AND um.sender_id != ? AND um.read_at IS NULL`,
      [req.user.id, req.user.id, req.user.id]
    );
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error('[Messages] Unread count error:', err);
    res.status(500).json({ error: '获取未读数失败' });
  }
});

// GET /api/messages/users — search users (for creating new conversations)
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const q = req.query.q || '';
    const [rows] = await pool.execute(
      'SELECT id, username FROM users WHERE id != ? AND username LIKE ? LIMIT 20',
      [req.user.id, `%${q}%`]
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('[Messages] Search users error:', err);
    res.status(500).json({ error: '搜索用户失败' });
  }
});

module.exports = router;
