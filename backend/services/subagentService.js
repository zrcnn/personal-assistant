/**
 * 子代理服务 - 用于 NE 机器人调用
 * 通过 OpenClaw 运行时 API 派生子代理
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * 派生子代理处理任务
 * 通过 OpenClaw CLI 调用
 */
async function spawnSubagent(options) {
  const { label, task, timeout = 30000 } = options;

  return new Promise((resolve, reject) => {
    // 使用 OpenClaw CLI 派生子代理
    const cmd = `openclaw subagent spawn --label "${label}" --task "${task.replace(/"/g, '\\"')}" --mode run --timeout ${timeout / 1000}`;

    const timeoutId = setTimeout(() => {
      resolve({ result: '抱歉，响应超时了。请稍后再试。', timedOut: true });
    }, timeout + 5000);

    execAsync(cmd, { 
      cwd: '/opt/personalAssistant/backend',
      env: { ...process.env, OPENCLAW_WORKSPACE: '/root/.openclaw/workspace' }
    }, (error, stdout, stderr) => {
      clearTimeout(timeoutId);

      if (error) {
        console.error(`[Subagent] Error:`, error.message);
        resolve({ result: '抱歉，处理消息时出了点问题。请稍后再试。', error: error.message });
        return;
      }

      try {
        // 解析输出获取结果
        const output = stdout.trim();
        if (output) {
          resolve({ result: output, success: true });
        } else {
          resolve({ result: '🤔 我收到了你的消息！', success: true });
        }
      } catch (parseError) {
        console.error(`[Subagent] Parse error:`, parseError);
        resolve({ result: '收到消息了！', success: true });
      }
    });
  });
}

module.exports = { spawnSubagent };
