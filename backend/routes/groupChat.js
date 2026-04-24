const express = require('express');
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const messageWs = require('../services/messageWs');
const subagentBotService = require('../services/subagentBotService');

const router = express.Router();
const NE_BOT_ID = 999999;

// ===== Groups =====

// GET /api/group-chats — list groups I'm a member of
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT gc.id, gc.name, gc.avatar, gc.creator_id, gc.created_at, gc.updated_at,
        gm.role AS my_role,
        (SELECT COUNT(*) FROM group_members WHERE group_id = gc.id) AS member_count,
        (SELECT content FROM group_messages gm2 WHERE gm2.group_id = gc.id ORDER BY gm2.created_at DESC LIMIT 1) AS last_message,
        (SELECT gm2.created_at FROM group_messages gm2 WHERE gm2.group_id = gc.id ORDER BY gm2.created_at DESC LIMIT 1) AS last_message_time,
        (SELECT COUNT(*) FROM group_messages gm2 
         WHERE gm2.group_id = gc.id AND gm2.sender_id != ? AND gm2.id NOT IN (
           SELECT gmr.message_id FROM group_message_read gmr WHERE gmr.user_id = ?
         )) AS unread_count
       FROM group_chats gc
       JOIN group_members gm ON gc.id = gm.group_id AND gm.user_id = ?
       ORDER BY gc.updated_at DESC`,
      [req.user.id, req.user.id, req.user.id]
    );

    res.json({ groups: rows });
  } catch (err) {
    console.error('[GroupChat] List groups error:', err);
    res.status(500).json({ error: '获取群聊列表失败' });
  }
});

// POST /api/group-chats — create group
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, avatar, member_ids } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '群名称不能为空' });

    // Create group
    const [result] = await pool.execute(
      'INSERT INTO group_chats (name, avatar, creator_id) VALUES (?, ?, ?)',
      [name.trim(), avatar || null, req.user.id]
    );
    const groupId = result.insertId;

    // Add creator as owner
    await pool.execute(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
      [groupId, req.user.id, 'owner']
    );

    // Add initial members (including NE bot if specified)
    if (Array.isArray(member_ids)) {
      const uniqueMembers = [...new Set(member_ids.filter(id => id !== req.user.id))];
      for (const uid of uniqueMembers) {
        // Verify user exists
        const [users] = await pool.execute('SELECT id FROM users WHERE id = ?', [uid]);
        if (users.length > 0) {
          await pool.execute(
            'INSERT IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
            [groupId, uid, 'member']
          );
        }
      }
    }

    // Fetch the created group
    const [rows] = await pool.execute(
      `SELECT gc.id, gc.name, gc.avatar, gc.creator_id, gc.created_at, gc.updated_at,
        gm.role AS my_role,
        (SELECT COUNT(*) FROM group_members WHERE group_id = gc.id) AS member_count
       FROM group_chats gc
       JOIN group_members gm ON gc.id = gm.group_id AND gm.user_id = ?
       WHERE gc.id = ?`,
      [req.user.id, groupId]
    );

    res.status(201).json({ group: rows[0] });
  } catch (err) {
    console.error('[GroupChat] Create group error:', err);
    res.status(500).json({ error: '创建群聊失败' });
  }
});

// GET /api/group-chats/:id — get group details
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify membership
    const [members] = await pool.execute(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (members.length === 0) return res.status(404).json({ error: '群聊不存在或您不在群内' });

    const [rows] = await pool.execute(
      `SELECT gc.id, gc.name, gc.avatar, gc.creator_id, gc.created_at, gc.updated_at,
        gm.role AS my_role,
        (SELECT COUNT(*) FROM group_members WHERE group_id = gc.id) AS member_count
       FROM group_chats gc
       JOIN group_members gm ON gc.id = gm.group_id AND gm.user_id = ?
       WHERE gc.id = ?`,
      [req.user.id, id]
    );

    // Get members list
    const [membersList] = await pool.execute(
      `SELECT gm.user_id, gm.role, gm.joined_at, u.username, u.avatar
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = ?
       ORDER BY gm.role DESC, gm.joined_at ASC`,
      [id]
    );

    res.json({ group: rows[0], members: membersList });
  } catch (err) {
    console.error('[GroupChat] Get group error:', err);
    res.status(500).json({ error: '获取群聊详情失败' });
  }
});

// PUT /api/group-chats/:id — update group info (owner/admin only)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, avatar } = req.body;

    // Verify membership and role
    const [members] = await pool.execute(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (members.length === 0) return res.status(404).json({ error: '群聊不存在' });
    if (members[0].role === 'member') return res.status(403).json({ error: '无权限修改群信息' });

    const updates = [];
    const values = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
    if (avatar !== undefined) { updates.push('avatar = ?'); values.push(avatar); }

    if (updates.length > 0) {
      values.push(id);
      await pool.execute(`UPDATE group_chats SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[GroupChat] Update group error:', err);
    res.status(500).json({ error: '修改群信息失败' });
  }
});

// DELETE /api/group-chats/:id — delete group (owner only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const [members] = await pool.execute(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (members.length === 0) return res.status(404).json({ error: '群聊不存在' });
    if (members[0].role !== 'owner') return res.status(403).json({ error: '只有群主可以解散群聊' });

    await pool.execute('DELETE FROM group_chats WHERE id = ?', [id]);

    res.json({ success: true });
  } catch (err) {
    console.error('[GroupChat] Delete group error:', err);
    res.status(500).json({ error: '解散群聊失败' });
  }
});

// ===== Members =====

// POST /api/group-chats/:id/members — add members (admin+)
router.post('/:id/members', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_ids } = req.body;
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: '请提供用户ID列表' });
    }

    // Verify requester is admin or owner
    const [members] = await pool.execute(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (members.length === 0) return res.status(404).json({ error: '群聊不存在' });
    if (!['owner', 'admin'].includes(members[0].role)) {
      return res.status(403).json({ error: '无权限添加成员' });
    }

    const added = [];
    for (const uid of user_ids) {
      if (uid === req.user.id) continue;
      const [users] = await pool.execute('SELECT id, username FROM users WHERE id = ?', [uid]);
      if (users.length === 0) continue;

      await pool.execute(
        'INSERT IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
        [id, uid, 'member']
      );
      added.push({ user_id: uid, username: users[0].username });
    }

    // Update group timestamp
    await pool.execute('UPDATE group_chats SET updated_at = NOW() WHERE id = ?', [id]);

    // Notify existing members via WS
    const [allMembers] = await pool.execute(
      'SELECT user_id FROM group_members WHERE group_id = ?', [id]
    );
    for (const m of allMembers) {
      if (m.user_id !== req.user.id) {
        messageWs.broadcast(m.user_id, {
          type: 'group_member_added',
          group_id: parseInt(id),
          added_by: req.user.id,
          new_members: added
        });
      }
    }

    res.json({ success: true, added });
  } catch (err) {
    console.error('[GroupChat] Add members error:', err);
    res.status(500).json({ error: '添加成员失败' });
  }
});

// DELETE /api/group-chats/:id/members/:userId — remove member (admin+)
router.delete('/:id/members/:userId', authMiddleware, async (req, res) => {
  try {
    const { id, userId } = req.params;

    // Verify requester is admin or owner
    const [members] = await pool.execute(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (members.length === 0) return res.status(404).json({ error: '群聊不存在' });
    if (!['owner', 'admin'].includes(members[0].role)) {
      return res.status(403).json({ error: '无权限移除成员' });
    }

    // Can't remove owner
    const [target] = await pool.execute(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [id, userId]
    );
    if (target.length === 0) return res.status(404).json({ error: '用户不在群内' });
    if (target[0].role === 'owner') return res.status(403).json({ error: '不能移除群主' });

    await pool.execute(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [id, userId]
    );

    await pool.execute('UPDATE group_chats SET updated_at = NOW() WHERE id = ?', [id]);

    // Notify the removed user and others
    messageWs.broadcast(parseInt(userId), {
      type: 'group_removed',
      group_id: parseInt(id)
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[GroupChat] Remove member error:', err);
    res.status(500).json({ error: '移除成员失败' });
  }
});

// PUT /api/group-chats/:id/members/:userId/role — update member role (owner only)
router.put('/:id/members/:userId/role', authMiddleware, async (req, res) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;
    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: '角色必须是 admin 或 member' });
    }

    // Verify requester is owner
    const [members] = await pool.execute(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (members.length === 0) return res.status(404).json({ error: '群聊不存在' });
    if (members[0].role !== 'owner') return res.status(403).json({ error: '只有群主可以设置管理员' });

    await pool.execute(
      'UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?',
      [role, id, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[GroupChat] Update role error:', err);
    res.status(500).json({ error: '设置角色失败' });
  }
});

// ===== Messages =====

// GET /api/group-chats/:id/messages — get group messages
router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify membership
    const [members] = await pool.execute(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (members.length === 0) return res.status(404).json({ error: '群聊不存在或您不在群内' });

    const [messages] = await pool.execute(
      `SELECT gm.id, gm.group_id, gm.sender_id, gm.content, gm.created_at,
        u.username AS sender_name, u.avatar AS sender_avatar
       FROM group_messages gm
       JOIN users u ON gm.sender_id = u.id
       WHERE gm.group_id = ?
       ORDER BY gm.created_at ASC`,
      [id]
    );

    res.json({ messages });
  } catch (err) {
    console.error('[GroupChat] Get messages error:', err);
    res.status(500).json({ error: '获取群消息失败' });
  }
});

// POST /api/group-chats/:id/messages — send group message
router.post('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: '消息内容不能为空' });

    // Verify membership
    const [members] = await pool.execute(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (members.length === 0) return res.status(404).json({ error: '群聊不存在或您不在群内' });

    const [result] = await pool.execute(
      'INSERT INTO group_messages (group_id, sender_id, content) VALUES (?, ?, ?)',
      [id, req.user.id, content.trim()]
    );

    await pool.execute('UPDATE group_chats SET updated_at = NOW() WHERE id = ?', [id]);

    const [msg] = await pool.execute(
      `SELECT gm.*, u.username AS sender_name, u.avatar AS sender_avatar
       FROM group_messages gm
       JOIN users u ON gm.sender_id = u.id
       WHERE gm.id = ?`,
      [result.insertId]
    );

    // Notify all group members via WebSocket
    const [allMembers] = await pool.execute(
      'SELECT user_id FROM group_members WHERE group_id = ?',
      [id]
    );
    for (const m of allMembers) {
      messageWs.broadcast(m.user_id, {
        type: 'new_group_message',
        group_id: parseInt(id),
        message: msg[0],
        sender_id: msg[0].sender_id,
        sender_username: msg[0].sender_name
      });
    }

    // Check if NE bot should respond
    const isNEInGroup = await pool.execute(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      [id, NE_BOT_ID]
    ).then(([rows]) => rows.length > 0);

    if (isNEInGroup && subagentBotService.shouldRespond(content) && req.user.id !== NE_BOT_ID) {
      // 异步处理，不阻塞响应
      subagentBotService.handleGroupMessage(id, req.user.id, req.user.username, content.trim()).catch(err => {
        console.error('[GroupChat] Subagent bot error:', err);
      });
    }

    res.status(201).json({ message: msg[0] });
  } catch (err) {
    console.error('[GroupChat] Send message error:', err);
    res.status(500).json({ error: '发送群消息失败' });
  }
});

// POST /api/group-chats/:id/messages/read — mark group messages as read
router.post('/:id/messages/read', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify membership
    const [members] = await pool.execute(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (members.length === 0) return res.status(404).json({ error: '群聊不存在' });

    // Insert read records for all unread messages
    await pool.execute(
      `INSERT INTO group_message_read (group_id, user_id, message_id)
       SELECT gm.group_id, ?, gm.id
       FROM group_messages gm
       WHERE gm.group_id = ? AND gm.sender_id != ?
       AND gm.id NOT IN (SELECT gmr.message_id FROM group_message_read gmr WHERE gmr.user_id = ?)`,
      [req.user.id, id, req.user.id, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    // Table might not exist yet, create it
    console.error('[GroupChat] Mark read error:', err);
    res.status(500).json({ error: '标记已读失败' });
  }
});

// ===== NE Bot integration =====

// GET /api/group-chats/bot/info — get NE bot user info
router.get('/bot/info', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, username, avatar FROM users WHERE username = 'NE' LIMIT 1"
    );
    if (rows.length === 0) {
      return res.json({ bot: null });
    }
    res.json({ bot: rows[0] });
  } catch (err) {
    console.error('[GroupChat] Bot info error:', err);
    res.json({ bot: null });
  }
});

module.exports = router;
