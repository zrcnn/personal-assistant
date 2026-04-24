/**
 * 子代理机器人服务
 * 
 * 调用 Hermes Agent Python 服务 (subagentBot.py) 处理群聊消息。
 * 子代理使用主模型 ep-qubph3-1775115536595397049。
 * 回复会自动发送回对应的群聊。
 */

const http = require('http');
const { pool } = require('../config/db');
const messageWs = require('./messageWs');

const NE_BOT_ID = 999999;
const SUBAGENT_BOT_URL = '127.0.0.1';
const SUBAGENT_BOT_PORT = 8092;

class SubagentBotService {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.maxConcurrent = 2;
    this.activeCount = 0;
    
    this.config = {
      maxConcurrent: 2,
      queueDelay: 3000,
      taskTimeout: 60000
    };
    
    console.log('[Subagent Bot] 服务已初始化 (Hermes Agent)');
  }
  
  /**
   * 判断消息是否需要子代理响应
   */
  shouldRespond(message, senderName = '') {
    if (!message || !message.trim()) return false;
    if (message.length < 2) return false;
    
    const keywords = [
      '帮我', '请问', '怎么', '如何', '吗', '？', '?',
      '执行', '运行', '启动', '停止', '查看', '创建',
      '机器人', 'bot', '助手', 'ai', '@ne', 'ne ',
      '你能', '可以', '帮忙', '帮我看', '帮我做',
      '这是什么', '为什么', '什么时候', '在哪里',
      '怎么做', '怎么办', '好不好', '行不行',
      '解释', '分析', '总结', '搜索', '查找',
      '你好', '嗨', '哈喽', '在吗', '有人吗'
    ];
    
    const lowerMsg = message.toLowerCase();
    return keywords.some(kw => lowerMsg.includes(kw.toLowerCase()));
  }
  
  /**
   * 处理群聊消息 — 路由入口
   */
  async handleGroupMessage(groupId, senderId, senderName, message) {
    console.log(`[Subagent Bot] 收到群聊消息: 群 ${groupId}, 用户 ${senderName}: ${message}`);
    
    if (!this.shouldRespond(message, senderName)) {
      console.log('[Subagent Bot] 消息不需要响应');
      return null;
    }
    
    try {
      const result = await this.enqueue(groupId, senderId, senderName, message);
      return result;
    } catch (err) {
      console.error('[Subagent Bot] 处理消息失败:', err);
      return null;
    }
  }
  
  /**
   * 将消息加入处理队列
   */
  async enqueue(groupId, senderId, senderName, message) {
    const taskId = Math.random().toString(36).substring(2, 10);
    
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: taskId,
        groupId,
        senderId,
        senderName,
        message,
        createdAt: Date.now(),
        resolve,
        reject
      });
      
      console.log(`[Subagent Bot] 消息入队: ${taskId}, 队列长度: ${this.queue.length}`);
      this.processQueue();
    });
  }
  
  /**
   * 处理队列
   */
  async processQueue() {
    if (this.processing) return;
    if (this.queue.length === 0) return;
    if (this.activeCount >= this.config.maxConcurrent) return;
    
    this.processing = true;
    
    while (this.queue.length > 0 && this.activeCount < this.config.maxConcurrent) {
      const task = this.queue.shift();
      this.activeCount++;
      
      this.executeTask(task).finally(() => {
        this.activeCount--;
        if (this.queue.length > 0) {
          setTimeout(() => this.processQueue(), this.config.queueDelay);
        } else {
          this.processing = false;
        }
      });
    }
    
    this.processing = false;
  }
  
  /**
   * 执行单个子代理任务 - 调用 Python Hermes Agent 服务
   */
  async executeTask(task) {
    const { id, groupId, senderName, message } = task;
    
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        group_id: groupId,
        sender_id: task.senderId,
        sender_name: senderName,
        message: message
      });
      
      const options = {
        hostname: SUBAGENT_BOT_URL,
        port: SUBAGENT_BOT_PORT,
        path: '/respond',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      console.log(`[Subagent Bot] 请求 Hermes Agent: ${senderName}: ${message}`);
      
      const timeoutId = setTimeout(() => {
        console.error(`[Subagent Bot] 任务 ${id} 超时`);
        this.sendReplyToGroup(groupId, '抱歉，响应超时了。请稍后再试。').then(() => {
          task.reject(new Error('子代理响应超时'));
        });
      }, this.config.taskTimeout);
      
      const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', async () => {
          clearTimeout(timeoutId);
          
          try {
            const parsed = JSON.parse(data);
            
            if (parsed.success && parsed.result) {
              console.log(`[Subagent Bot] AI 回复: ${parsed.result.substring(0, 100)}...`);
              await this.sendReplyToGroup(groupId, parsed.result);
              task.resolve({ result: parsed.result, success: true });
            } else {
              console.error('[Subagent Bot] AI 返回失败:', parsed);
              await this.sendReplyToGroup(groupId, '抱歉，出了点问题。请稍后再试。');
              task.resolve({ result: '抱歉，出了点问题。请稍后再试。', success: false });
            }
          } catch (parseError) {
            console.error('[Subagent Bot] 解析响应失败:', parseError);
            await this.sendReplyToGroup(groupId, '抱歉，出了点问题。请稍后再试。');
            task.resolve({ result: '抱歉，出了点问题。请稍后再试。', success: false });
          }
        });
      });
      
      req.on('error', async (e) => {
        clearTimeout(timeoutId);
        console.error('[Subagent Bot] 请求 Hermes Agent 失败:', e);
        await this.sendReplyToGroup(groupId, '抱歉，出了点问题。请稍后再试。');
        task.reject(e);
      });
      
      req.write(postData);
      req.end();
    });
  }
  
  /**
   * 发送回复到群聊
   */
  async sendReplyToGroup(groupId, content) {
    try {
      // 插入数据库
      const [result] = await pool.execute(
        'INSERT INTO group_messages (group_id, sender_id, content) VALUES (?, ?, ?)',
        [groupId, NE_BOT_ID, content]
      );
      
      // 获取消息详情
      const [msg] = await pool.execute(
        `SELECT gm.*, u.username AS sender_name, u.avatar AS sender_avatar
         FROM group_messages gm
         JOIN users u ON gm.sender_id = u.id
         WHERE gm.id = ?`,
        [result.insertId]
      );
      
      if (msg.length === 0) return;
      
      // 更新群聊时间戳
      await pool.execute('UPDATE group_chats SET updated_at = NOW() WHERE id = ?', [groupId]);
      
      // 通过 WebSocket 通知所有群成员
      const [allMembers] = await pool.execute(
        'SELECT user_id FROM group_members WHERE group_id = ?',
        [groupId]
      );
      
      for (const m of allMembers) {
        messageWs.broadcast(m.user_id, {
          type: 'new_group_message',
          group_id: parseInt(groupId),
          message: msg[0],
          sender_id: NE_BOT_ID,
          sender_username: msg[0].sender_name
        });
      }
      
      console.log(`[Subagent Bot] 已发送回复到群 ${groupId}: ${content.substring(0, 50)}...`);
    } catch (err) {
      console.error('[Subagent Bot] 发送回复失败:', err);
    }
  }
  
  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      activeCount: this.activeCount,
      maxConcurrent: this.config.maxConcurrent
    };
  }
}

module.exports = new SubagentBotService();
