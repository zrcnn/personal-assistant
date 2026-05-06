const express = require('express');
const multer = require('multer');
const path = require('path');
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const messageWs = require('../services/messageWs');

// Multer 图片上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, '/opt/personalAssistant/uploads/messages/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('只允许上传 jpg、png、gif、webp 格式的图片'), false);
  }
};

const msgUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB 限制
});

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

// GET /api/messages/conversations/:id/messages — get messages with pagination, search, date range
router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50, keyword, startDate, endDate } = req.query;

    // Verify user is part of this conversation
    const [conv] = await pool.execute(
      'SELECT id FROM user_conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
      [id, req.user.id, req.user.id]
    );
    if (conv.length === 0) return res.status(404).json({ error: '对话不存在' });

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'WHERE m.conversation_id = ?';
    const params = [id];

    if (keyword) {
      whereClause += ' AND m.content LIKE ?';
      params.push(`%${keyword}%`);
    }

    if (startDate) {
      whereClause += ' AND m.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND m.created_at < ?';
      params.push(endDate);
    }

    // Get total count for pagination
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM user_messages m ${whereClause}`,
      params
    );
    const total = countRows[0].total;

    // Get messages with attachment info
    const [messages] = await pool.execute(
      `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.created_at, m.read_at,
        u.username AS sender_name,
        ma.id AS attachment_id, ma.file_name, ma.file_path, ma.file_size, ma.mime_type
       FROM user_messages m
       JOIN users u ON m.sender_id = u.id
       LEFT JOIN message_attachments ma ON ma.message_id = m.id
       ${whereClause}
       ORDER BY m.created_at ASC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    // Group attachments by message
    const messageMap = new Map();
    for (const msg of messages) {
      const msgId = msg.id;
      if (!messageMap.has(msgId)) {
        messageMap.set(msgId, {
          id: msg.id,
          conversation_id: msg.conversation_id,
          sender_id: msg.sender_id,
          content: msg.content,
          created_at: msg.created_at,
          read_at: msg.read_at,
          sender_name: msg.sender_name,
          attachments: []
        });
      }
      if (msg.attachment_id) {
        messageMap.get(msgId).attachments.push({
          id: msg.attachment_id,
          file_name: msg.file_name,
          file_path: msg.file_path,
          file_size: msg.file_size,
          mime_type: msg.mime_type
        });
      }
    }

    const resultMessages = Array.from(messageMap.values());

    res.json({
      messages: resultMessages,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('[Messages] Get messages error:', err);
    res.status(500).json({ error: '获取消息失败' });
  }
});

// POST /api/messages/conversations/:id/messages — send message with optional image upload
router.post('/conversations/:id/messages', authMiddleware, msgUpload.single('image'), async (req, res) => {
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

    // Save attachment if image was uploaded
    if (req.file) {
      await pool.execute(
        'INSERT INTO message_attachments (message_id, file_name, file_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?)',
        [result.insertId, req.file.originalname, req.file.path, req.file.size, req.file.mimetype]
      );
    }

    // Update conversation timestamp
    await pool.execute('UPDATE user_conversations SET updated_at = NOW() WHERE id = ?', [id]);

    const [msg] = await pool.execute(
      `SELECT m.*, u.username AS sender_name FROM user_messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?`,
      [result.insertId]
    );

    // Get attachments for this message
    const [attachments] = await pool.execute(
      'SELECT id, file_name, file_path, file_size, mime_type FROM message_attachments WHERE message_id = ?',
      [result.insertId]
    );

    const messageWithAttachments = {
      ...msg[0],
      attachments: attachments
    };

    // Notify via WebSocket
    if (messageWs.broadcast) {
      const recipientId = conv[0].user1_id === req.user.id ? conv[0].user2_id : conv[0].user1_id;
      messageWs.broadcast(recipientId, {
        type: 'new_message',
        conversation_id: parseInt(id),
        message: messageWithAttachments
      });
    }

    res.status(201).json({ message: messageWithAttachments });
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

// GET /api/messages/users/:userId/note — 获取用户备注
router.get('/users/:userId/note', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if target user exists
    const [users] = await pool.execute('SELECT id FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ error: '用户不存在' });

    const [rows] = await pool.execute(
      'SELECT remark_name, remark_description, is_blocked FROM user_notes WHERE user_id = ? AND note_for = ?',
      [userId, req.user.id]
    );

    if (rows.length === 0) {
      return res.json({
        note: {
          remark_name: null,
          remark_description: null,
          is_blocked: false
        }
      });
    }

    res.json({
      note: {
        remark_name: rows[0].remark_name,
        remark_description: rows[0].remark_description,
        is_blocked: !!rows[0].is_blocked
      }
    });
  } catch (err) {
    console.error('[Messages] Get user note error:', err);
    res.status(500).json({ error: '获取用户备注失败' });
  }
});

// PUT /api/messages/users/:userId/note — 设置用户备注
router.put('/users/:userId/note', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { remark_name, remark_description, is_blocked } = req.body;

    // Check if target user exists
    const [users] = await pool.execute('SELECT id FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ error: '用户不存在' });

    // Check if note exists
    const [existing] = await pool.execute(
      'SELECT id FROM user_notes WHERE user_id = ? AND note_for = ?',
      [userId, req.user.id]
    );

    if (existing.length > 0) {
      await pool.execute(
        'UPDATE user_notes SET remark_name = ?, remark_description = ?, is_blocked = ? WHERE user_id = ? AND note_for = ?',
        [remark_name || null, remark_description || null, is_blocked ? 1 : 0, userId, req.user.id]
      );
    } else {
      await pool.execute(
        'INSERT INTO user_notes (user_id, note_for, remark_name, remark_description, is_blocked) VALUES (?, ?, ?, ?, ?)',
        [userId, req.user.id, remark_name || null, remark_description || null, is_blocked ? 1 : 0]
      );
    }

    res.json({
      success: true,
      note: {
        remark_name: remark_name || null,
        remark_description: remark_description || null,
        is_blocked: !!is_blocked
      }
    });
  } catch (err) {
    console.error('[Messages] Set user note error:', err);
    res.status(500).json({ error: '设置用户备注失败' });
  }
});

// GET /api/messages/users/:userId/info — 获取用户信息（含备注）
router.get('/users/:userId/info', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user info
    const [users] = await pool.execute(
      'SELECT id, username, avatar, created_at FROM users WHERE id = ?',
      [userId]
    );
    if (users.length === 0) return res.status(404).json({ error: '用户不存在' });

    // Get note if exists
    const [notes] = await pool.execute(
      'SELECT remark_name, remark_description, is_blocked FROM user_notes WHERE user_id = ? AND note_for = ?',
      [userId, req.user.id]
    );

    const note = notes.length > 0 ? {
      remark_name: notes[0].remark_name,
      remark_description: notes[0].remark_description,
      is_blocked: !!notes[0].is_blocked
    } : {
      remark_name: null,
      remark_description: null,
      is_blocked: false
    };

    res.json({
      user: {
        id: users[0].id,
        username: users[0].username,
        avatar: users[0].avatar,
        created_at: users[0].created_at
      },
      note
    });
  } catch (err) {
    console.error('[Messages] Get user info error:', err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// GET /api/messages/conversations/search — 全局消息搜索
router.get('/conversations/search', authMiddleware, async (req, res) => {
  try {
    const { keyword, startDate, endDate } = req.query;

    if (!keyword) {
      return res.status(400).json({ error: '请提供搜索关键词' });
    }

    let whereClause = 'WHERE (uc.user1_id = ? OR uc.user2_id = ?) AND m.content LIKE ?';
    const params = [req.user.id, req.user.id, `%${keyword}%`];

    if (startDate) {
      whereClause += ' AND m.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND m.created_at < ?';
      params.push(endDate);
    }

    const [messages] = await pool.execute(
      `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.created_at,
        u.username AS sender_name,
        uc.id AS conversation_id,
        CASE WHEN uc.user1_id = ? THEN uc.user2_id ELSE uc.user1_id END AS other_user_id,
        CASE WHEN uc.user1_id = ? THEN u2.username ELSE u1.username END AS other_user_name
       FROM user_messages m
       JOIN user_conversations uc ON m.conversation_id = uc.id
       JOIN users u ON m.sender_id = u.id
       JOIN users u1 ON uc.user1_id = u1.id
       JOIN users u2 ON uc.user2_id = u2.id
       ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [...params, req.user.id, req.user.id]
    );

    const results = messages.map(msg => ({
      id: msg.id,
      conversation_id: msg.conversation_id,
      sender_id: msg.sender_id,
      content: msg.content,
      created_at: msg.created_at,
      sender_name: msg.sender_name,
      conversation_with: {
        id: msg.other_user_id,
        username: msg.other_user_name
      }
    }));

    res.json({ messages: results, total: results.length });
  } catch (err) {
    console.error('[Messages] Global search error:', err);
    res.status(500).json({ error: '搜索失败' });
  }
});

// DELETE /api/messages/attachments/cleanup — 清理 7 天前图片（仅 admin）
router.delete('/attachments/cleanup', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin (assuming users table has is_admin field)
    const [userRows] = await pool.execute('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
    if (userRows.length === 0 || !userRows[0].is_admin) {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    const fs = require('fs');

    // Get attachments older than 7 days
    const [attachments] = await pool.execute(
      'SELECT id, file_path FROM message_attachments WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)'
    );

    let deletedCount = 0;
    const deletedIds = [];

    for (const attachment of attachments) {
      try {
        if (attachment.file_path && fs.existsSync(attachment.file_path)) {
          fs.unlinkSync(attachment.file_path);
        }
        deletedIds.push(attachment.id);
        deletedCount++;
      } catch (err) {
        console.error('[Messages] Cleanup file error:', err);
      }
    }

    // Delete records from database
    if (deletedIds.length > 0) {
      await pool.execute('DELETE FROM message_attachments WHERE id IN (?)', [deletedIds]);
    }

    res.json({
      success: true,
      deletedCount
    });
  } catch (err) {
    console.error('[Messages] Attachment cleanup error:', err);
    res.status(500).json({ error: '清理附件失败' });
  }
});

module.exports = router;
