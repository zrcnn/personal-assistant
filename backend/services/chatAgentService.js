/**
 * 聊天子代理服务 - 用于 NE 机器人聊天交互
 * 严格限制：只允许一个子代理实例，避免 API 速率限制
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs');
const path = require('path');

// 严格限制配置
const config = {
  maxConcurrent: 1,       // 只允许一个子代理
  busyInterval: 15000,    // 忙碌时等待15秒
  checkTimeout: 1000,
};

let lastCallTime = 0;
let isProcessing = false;
let activeAgentCount = 0;
const queue = [];

/**
 * 检查当前活跃的子代理数量
 * 严格限制：最多只允许 1 个聊天子代理
 */
async function checkActiveAgents() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(isProcessing ? 1 : 0), config.checkTimeout);
    
    // 检查是否有正在处理的聊天任务
    if (isProcessing) {
      clearTimeout(timeout);
      resolve(1);
      return;
    }
    
    // 检查队列中是否有等待的任务
    if (queue.length > 0) {
      clearTimeout(timeout);
      resolve(1);
      return;
    }
    
    // 检查最近是否有调用
    const elapsed = Date.now() - lastCallTime;
    if (elapsed < 5000 && elapsed > 0) {
      clearTimeout(timeout);
      resolve(1);
      return;
    }
    
    clearTimeout(timeout);
    resolve(0);
  });
}

/**
 * 计算需要的等待时间
 */
async function getWaitTime() {
  activeAgentCount = await checkActiveAgents();
  
  // 如果没有其他子代理在运行，无需等待
  if (activeAgentCount === 0) {
    return 0;
  }
  
  // 有子代理在使用模型，等待一段时间
  const elapsed = Date.now() - lastCallTime;
  const remaining = config.busyInterval - elapsed;
  
  return Math.max(0, remaining);
}

/**
 * 处理队列中的任务
 */
async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  
  isProcessing = true;
  const task = queue.shift();
  
  try {
    // 获取需要等待的时间
    const waitTime = await getWaitTime();
    
    if (waitTime > 0) {
      // 发送等待通知
      if (task.onWaiting) {
        task.onWaiting(waitTime, activeAgentCount);
      }
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
    
    // 处理下一个任务
    if (queue.length > 0) {
      const nextWait = await getWaitTime();
      if (nextWait > 0) {
        setTimeout(() => processQueue(), nextWait);
      } else {
        processQueue();
      }
    }
  }
}

/**
 * 执行实际的聊天子代理调用（带自动重试）
 */
async function executeChatAgent(options) {
  const { label, task, timeout = 20000 } = options;
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await executeOnce(options);
      return result;
    } catch (error) {
      lastError = error;
      
      // 检查是否是 API 速率限制错误
      if (error.message && error.message.includes('rate limit')) {
        const retryDelay = 5000 * attempt; // 指数退避：5s, 10s, 15s
        console.log(`[Chat Agent] API 速率限制，等待 ${retryDelay/1000}秒后重试 (${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        // 其他错误也重试
        if (attempt < maxRetries) {
          const retryDelay = 3000 * attempt;
          console.log(`[Chat Agent] 遇到错误，重试 (${attempt}/${maxRetries}): ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
  }

  // 所有重试都失败
  console.error(`[Chat Agent] 所有重试失败:`, lastError);
  return { result: '抱歉，暂时无法处理你的消息，请稍后再试。', error: lastError?.message };
}

/**
 * 单次执行聊天子代理调用
 * 使用文件传递任务，避免命令行参数长度限制和转义问题
 */
async function executeOnce(options) {
  const { label, task, timeout = 20000 } = options;
  const apiKey = process.env.ANTHROPIC_API_KEY || 'rkARKvOIxPVAAWe4TOrJ94oNLFijNtdPU3WjyPyY0ek';

  return new Promise((resolve, reject) => {
    // 创建临时文件传递任务
    const tempDir = '/tmp/claudeclaw';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const taskFile = path.join(tempDir, `task_${Date.now()}.txt`);
    const outputFile = path.join(tempDir, `output_${Date.now()}.txt`);
    
    fs.writeFileSync(taskFile, task, 'utf8');
    
    // 使用 openclaw agent 命令，通过文件传递任务
    const cmd = `ANTHROPIC_API_KEY="${apiKey}" openclaw agent --local --json --prompt-file "${taskFile}" > "${outputFile}" 2>/dev/null`;

    const timeoutId = setTimeout(() => {
      // 清理临时文件
      try { fs.unlinkSync(taskFile); } catch {}
      reject(new Error('响应超时'));
    }, timeout + 5000);

    exec(cmd, { 
      cwd: '/root/.openclaw/workspace',
      env: { 
        ...process.env, 
        OPENCLAW_WORKSPACE: '/root/.openclaw/workspace',
        ANTHROPIC_API_KEY: apiKey,
        PATH: '/root/.nvm/versions/node/v22.22.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      }
    }, (error, stdout, stderr) => {
      clearTimeout(timeoutId);
      
      // 清理临时文件
      try { fs.unlinkSync(taskFile); } catch {}
      try { fs.unlinkSync(outputFile); } catch {}

      if (error) {
        // 检查是否是速率限制
        if (stderr?.includes('rate limit')) {
          reject(new Error('API rate limit reached'));
        } else {
          console.error(`[Chat Agent] Error:`, error.message);
          reject(error);
        }
        return;
      }

      try {
        // 读取输出文件
        if (fs.existsSync(outputFile)) {
          const output = fs.readFileSync(outputFile, 'utf8').trim();
          
          if (output) {
            // 尝试解析 JSON 输出
            try {
              const parsed = JSON.parse(output);
              const result = parsed.result || parsed.response || parsed.content || output;
              resolve({ result, success: true });
            } catch {
              // 非 JSON 输出，直接使用
              resolve({ result: output, success: true });
            }
          } else {
            resolve({ result: '👋 我收到你的消息了！', success: true });
          }
        } else {
          resolve({ result: '👋 我收到你的消息了！', success: true });
        }
      } catch (parseError) {
        console.error(`[Chat Agent] Parse error:`, parseError);
        resolve({ result: '消息收到了！', success: true });
      }
    });
  });
}

/**
 * 派生聊天子代理处理对话（智能速率限制队列）
 * 基于实际子代理活动状态动态调整等待时间
 */
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

/**
 * 获取当前队列状态
 */
function getQueueStatus() {
  return {
    queueLength: queue.length,
    isProcessing,
    activeAgentCount,
    lastCallTime
  };
}

module.exports = { spawnChatAgent, getQueueStatus };