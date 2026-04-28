/**
 * NE Bot - 群聊机器人响应服务
 * 监听群聊消息，当 NE 被提及时使用子代理生成聊天回复
 * 注意：此服务仅用于聊天交互，不负责实际开发任务
 */

const { pool } = require('../config/db');
const messageWs = require('./messageWs');
const { spawnChatAgent } = require('./chatAgentService');

const NE_BOT_ID = 999999;

class NEBotService {
  constructor() {
    this.pendingResponses = new Map(); // groupId -> { timer, messages }
  }

  /**
   * 检查消息是否应该触发 NE 回复（不区分大小写）
   * 触发条件：提到 NE/机器人/bot，或包含请求帮助的词语
   */
  shouldRespond(content) {
    const lowerContent = content.toLowerCase().trim();
    // 直接提及类
    const mentionTriggers = ['ne', '@ne', '机器人', 'bot', '@bot'];
    // 请求帮助类
    const helpTriggers = ['你能', '帮我', '问一下', '请问', '怎么', '如何', '是什么', '为什么', '可以吗', '好不好', '行不行', '在吗', '在不在'];
    
    // 检查直接提及
    if (mentionTriggers.some(t => lowerContent.includes(t))) return true;
    // 检查帮助请求（句子开头或包含问号）
    if (helpTriggers.some(t => lowerContent.includes(t)) && (lowerContent.includes('?') || lowerContent.includes('？') || lowerContent.includes('吗') || lowerContent.includes('嘛'))) return true;
    
    return false;
  }

  /**
   * 获取群聊上下文
   */
  async getGroupContext(groupId, limit = 10) {
    const [messages] = await pool.execute(
      `SELECT gm.id, gm.sender_id, gm.content, u.username AS sender_name, gm.created_at
       FROM group_messages gm
       JOIN users u ON gm.sender_id = u.id
       WHERE gm.group_id = ?
       ORDER BY gm.created_at DESC
       LIMIT ?`,
      [parseInt(groupId), parseInt(limit)]
    );
    return messages.reverse();
  }

  /**
   * 获取群成员列表
   */
  async getGroupMembers(groupId) {
    const [members] = await pool.execute(
      `SELECT gm.user_id, u.username, gm.role
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = ?`,
      [groupId]
    );
    return members;
  }

  /**
   * 延迟等待，避免 API 速率限制
   */
  async waitForRateLimit() {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY) {
      const delay = RATE_LIMIT_DELAY - elapsed;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    lastRequestTime = Date.now();
  }

  /**
   * 处理群聊消息
   */
  async handleGroupMessage(groupId, senderId, senderName, content) {
    // 不回复自己的消息
    if (senderId === NE_BOT_ID) return;

    // 检查是否需要回复
    if (!this.shouldRespond(content)) return;

    console.log(`[NE Bot] Triggered in group ${groupId} by ${senderName}: ${content.substring(0, 50)}...`);

    // 检查是否有正在处理的聊天任务
    const { getQueueStatus } = require('./chatAgentService');
    const status = getQueueStatus();
    
    // 如果模型正在忙碌，简单回复
    if (status.isProcessing || status.queueLength > 0) {
      console.log(`[NE Bot] Model busy, sending quick reply`);
      await this.sendReply(groupId, '🤔 我收到你的消息了！现在有点忙，稍后详细回复你~');
      return;
    }

    try {
      // 获取群聊上下文
      const context = await this.getGroupContext(groupId);

      // 构建聊天任务
      const contextText = context.map(m => `${m.sender_name}: ${m.content}`).join('\n');
      const task = `你是 NE 机器人，在群聊中和用户聊天。

群聊上下文：
${contextText}

当前用户 "${senderName}" 刚刚发送了: "${content}"

请以友好、简洁、幽默的方式回复。你是一个 AI 助手，但可以自然地承认这一点。如果用户提到开发需求，可以引导他们联系专门的开发团队。`;

      // 使用聊天子代理生成回复（自带速率限制队列）
      const response = await spawnChatAgent({
        label: `ne-chat-group-${groupId}`,
        task: task,
        timeout: 25000 // 25秒超时
      });

      // 发送回复
      if (response && response.result) {
        await this.sendReply(groupId, response.result);
        console.log(`[NE Bot] Replied in group ${groupId}: ${response.result.substring(0, 50)}...`);
      } else {
        await this.sendReply(groupId, '🤔 收到你的消息了！');
      }
    } catch (error) {
      console.error(`[NE Bot] Error handling group message:`, error);
      await this.sendReply(groupId, '抱歉，出了点问题。请稍后再试。');
    }
  }

  /**
   * 发送"正在输入"消息
   */
  async sendTypingMessage(groupId) {
    const typingMsg = {
      type: 'new_group_message',
      group_id: groupId,
      message: {
        sender_id: NE_BOT_ID,
        sender_name: 'NE',
        content: '🤔 正在思考...',
        created_at: new Date().toISOString()
      },
      sender_id: NE_BOT_ID,
      sender_username: 'NE'
    };

    const [members] = await pool.execute(
      'SELECT user_id FROM group_members WHERE group_id = ?',
      [groupId]
    );

    for (const m of members) {
      messageWs.broadcast(m.user_id, typingMsg);
    }
  }

  /**
   * 发送回复消息到数据库和 WebSocket
   */
  async sendReply(groupId, content) {
    // 插入数据库
    const [result] = await pool.execute(
      'INSERT INTO group_messages (group_id, sender_id, content) VALUES (?, ?, ?)',
      [groupId, NE_BOT_ID, content]
    );

    // 获取完整消息（包含发送者信息）
    const [msg] = await pool.execute(
      `SELECT gm.*, u.username AS sender_name, u.avatar AS sender_avatar
       FROM group_messages gm
       JOIN users u ON gm.sender_id = u.id
       WHERE gm.id = ?`,
      [result.insertId]
    );

    // 更新群聊时间
    await pool.execute('UPDATE group_chats SET updated_at = NOW() WHERE id = ?', [groupId]);

    // WebSocket 推送 - 确保 sender_username 正确
    const [members] = await pool.execute(
      'SELECT user_id FROM group_members WHERE group_id = ?',
      [groupId]
    );

    for (const m of members) {
      messageWs.broadcast(m.user_id, {
        type: 'new_group_message',
        group_id: groupId,
        message: msg[0],
        sender_id: NE_BOT_ID,
        sender_username: 'NE'  // 明确指定发送者名称为 NE
      });
    }
  }
}

const neBotService = new NEBotService();
module.exports = neBotService;
