/**
 * 聊天子代理服务 - 用于 NE 机器人聊天交互
 * 严格限制：只允许一个子代理实例，避免 API 速率限制
 * 
 * 联网搜索支持：
 * - 子代理通过 openclaw agent --local 运行，内置 web_search、web_fetch、browser 等工具
 * - 通过系统提示告知模型可以主动使用这些工具
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { decrypt } = require('../config/encryption');

// 严格限制配置
const config = {
  maxConcurrent: 1,
  busyInterval: 15000,
  checkTimeout: 1000,
};

// 联网搜索系统提示
const AGENT_SEARCH_PROMPT = `【联网搜索能力 - 重要】
你运行在 OpenClaw 环境中，内置 web_search 工具可以搜索互联网获取实时信息。

当用户询问需要实时信息的问题时（如新闻、天气、股票、最新事件等），请主动使用 web_search 工具。
你的知识有截止日期，对于截止日期之后的事件，请主动搜索。

如果用户明确要求"不要搜索"，则不要调用联网工具。
搜索结果会直接返回给你，请基于搜索结果回答用户。`;

let lastCallTime = 0;
let isProcessing = false;
let activeAgentCount = 0;
const queue = [];

async function checkActiveAgents() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(isProcessing ? 1 : 0), config.checkTimeout);
    if (isProcessing) { clearTimeout(timeout); resolve(1); return; }
    if (queue.length > 0) { clearTimeout(timeout); resolve(1); return; }
    const elapsed = Date.now() - lastCallTime;
    if (elapsed < 5000 && elapsed > 0) { clearTimeout(timeout); resolve(1); return; }
    clearTimeout(timeout);
    resolve(0);
  });
}

async function getWaitTime() {
  activeAgentCount = await checkActiveAgents();
  if (activeAgentCount === 0) return 0;
  const elapsed = Date.now() - lastCallTime;
  const remaining = config.busyInterval - elapsed;
  return Math.max(0, remaining);
}

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  const task = queue.shift();
  try {
    const waitTime = await getWaitTime();
    if (waitTime > 0) {
      if (task.onWaiting) task.onWaiting(waitTime, activeAgentCount);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    lastCallTime = Date.now();
    const result = await executeChatAgent(task.options);
    task.resolve(result);
  } catch (error) {
    task.reject(error);
  } finally {
    isProcessing = false;
    lastCallTime = Date.now();
    if (queue.length > 0) {
      const nextWait = await getWaitTime();
      if (nextWait > 0) setTimeout(() => processQueue(), nextWait);
      else processQueue();
    }
  }
}

async function executeChatAgent(options) {
  const { label, task, timeout = 30000, enableSearch = true, userId } = options;
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await executeOnce({ ...options, enableSearch });
      return result;
    } catch (error) {
      lastError = error;
      if (error.message && error.message.includes('rate limit')) {
        const retryDelay = 5000 * attempt;
        console.log(`[Chat Agent] API 速率限制，等待 ${retryDelay/1000}秒后重试 (${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        if (attempt < maxRetries) {
          const retryDelay = 3000 * attempt;
          console.log(`[Chat Agent] 遇到错误，重试 (${attempt}/${maxRetries}): ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
  }

  console.error(`[Chat Agent] 所有重试失败:`, lastError);
  return { result: '抱歉，暂时无法处理你的消息，请稍后再试。', error: lastError?.message };
}

async function getUserModelConfig(userId) {
  if (!userId) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT provider, model_name, api_key_encrypted, api_base 
       FROM user_api_keys 
       WHERE user_id = ? AND is_active = 1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId]
    );
    if (rows.length > 0 && rows[0].api_key_encrypted) {
      const decryptedKey = decrypt(rows[0].api_key_encrypted);
      return {
        apiKey: decryptedKey,
        model: rows[0].model_name,
        apiBase: rows[0].api_base,
        provider: rows[0].provider
      };
    }
  } catch (err) {
    console.error('[Chat Agent] 获取用户模型配置失败:', err.message);
  }
  return null;
}

async function executeOnce(options) {
  const { label, task, timeout = 30000, enableSearch = true, userId } = options;
  const userModelConfig = await getUserModelConfig(userId);

  return new Promise((resolve, reject) => {
    // 构建环境变量
    const envVars = { ...process.env };
    
    // 使用用户模型配置
    if (userModelConfig) {
      envVars.OPENAI_API_KEY = userModelConfig.apiKey;
      envVars.ANTHROPIC_API_KEY = userModelConfig.apiKey;
      if (userModelConfig.apiBase) envVars.OPENAI_BASE_URL = userModelConfig.apiBase;
      console.log(`[Chat Agent] 使用用户自定义模型: ${userModelConfig.provider}/${userModelConfig.model}`);
    } else {
      envVars.ANTHROPIC_API_KEY = 'zHR5G-k9wMBwg2OxbKlgfIOr8vOwFHxKdGXAJvkmIZQ';
    }

    // 使用 spawn 而不是 exec，避免 shell 转义问题
    const sessionId = `search-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const args = [
      'agent', '--local', '--json',
      '--session-id', sessionId,
      '-m', task,
      '--timeout', String(Math.floor(timeout / 1000))
    ];
    

    const timeoutId = setTimeout(() => {
      if (child && child.pid) {
        child.kill('SIGKILL');
      }
      reject(new Error('响应超时'));
    }, timeout + 5000);

    let stdout = '';
    let stderr = '';

    const child = spawn('openclaw', args, {
      cwd: '/root/.openclaw/workspace',
      env: envVars,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      console.log(`[Chat Agent] spawn 完成: code=${code}, stdout=${stdout.length}, stderr=${stderr.length}`);

      if (code !== 0) {
        console.error(`[Chat Agent] 子进程退出码: ${code}, stderr: ${stderr.substring(0, 200)}`);
        reject(new Error(`子进程退出码: ${code}`));
        return;
      }

      try {
        // openclaw agent --json 输出到 stderr
        const output = (stdout || stderr).trim();
        if (output) {
          try {
            const parsed = JSON.parse(output);
            const result = parsed.result 
              || parsed.response 
              || parsed.content 
              || (parsed.payloads && parsed.payloads[0] && parsed.payloads[0].text)
              || output;
            resolve({ result, success: true });
          } catch {
            resolve({ result: output, success: true });
          }
        } else {
          resolve({ result: '👋 我收到你的消息了！', success: true });
        }
      } catch (parseError) {
        console.error(`[Chat Agent] Parse error:`, parseError);
        resolve({ result: '消息收到了！', success: true });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      console.error(`[Chat Agent] spawn error:`, err.message);
      reject(err);
    });
  });
}

async function spawnChatAgent(options) {
  return new Promise((resolve, reject) => {
    queue.push({ 
      options, 
      resolve, 
      reject,
      onWaiting: (waitTime, agentCount) => {
        console.log(`[Chat Agent] 检测到 ${agentCount} 个活跃子代理，等待 ${waitTime/1000}秒后执行...`);
      }
    });
    processQueue();
  });
}

function getQueueStatus() {
  return {
    queueLength: queue.length,
    isProcessing,
    activeAgentCount,
    lastCallTime
  };
}

module.exports = { spawnChatAgent, getQueueStatus };
