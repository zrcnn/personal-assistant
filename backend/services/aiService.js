/**
 * AI Service - Direct model API calls with built-in smart search triggering
 * 
 * Features:
 * - Streaming and non-streaming chat
 * - Built-in search trigger detection (no external API needed for detection)
 * - Smart prompt injection for search results
 * - User-configured model override
 */

const https = require('https');
const http = require('http');
const { pool } = require('../config/db');
const { decrypt } = require('../config/encryption');

/**
 * Default KAT-Coder model configuration (fallback)
 */
const DEFAULT_MODEL_CONFIG = {
  baseUrl: 'https://wanqing.streamlakeapi.com/api/gateway/coding/v1',
  apiKey: 'zHR5G-k9wMBwg2OxbKlgfIOr8vOwFHxKdGXAJvkmIZQ',
  model: 'ep-agr16j-1776132426466498538',
  maxTokens: 4096,
  temperature: 0.7,
  contextWindow: 100000
};

// Backward compatibility alias
const MODEL_CONFIG = DEFAULT_MODEL_CONFIG;

/**
 * 搜索触发关键词模式（内置，不依赖外部API）
 */
const SEARCH_PATTERNS = [
  // 明确搜索意图
  /搜索(.{1,50})/,
  /查(找|一下|一查|查)(.{1,50})/,
  /帮我(找|查)(.{1,50})/,
  /网上找(.{1,50})/,
  
  // 实时信息需求
  /最新(.{1,40})(消息|新闻|动态|信息|进展|情况)/,
  /最近(.{1,40})(发生|更新|发布|推出|有什么|大事|新闻)/,
  /今天(.{1,40})(天气|气温|新闻|发生|怎么样|如何)/,
  /今日(.{0,40})(新闻|发生|怎么样|如何|大事|消息)/,
  /现在(.{1,40})(多少|怎么样|如何|什么|价格|情况)/,
  /当前(.{1,40})(情况|状态|价格|数据|如何)/,
  
  // 疑问句（需要一定长度避免误触发）
  /(.{5,}).*[吗嘛？]/,
  /(.{5,}).*怎么(办|样|做|回事)/,
  /(.{5,}).*什么(意思|情况|东西|价格)/,
  /(.{5,}).*哪里(有|找|能)/,
  /(.{5,}).*如何/,
  /(.{5,}).*多大/,
  /(.{5,}).*多少钱/,
  
  // 时间敏感话题
  /(.{2,}).*(股票|股价|基金|比特币|加密货币|汇率|金价|油价).*(多少|价格|行情|涨跌)/,
  /(.{2,}).*(比分|赛况|比赛|赛事|进球)/,
  /(.{2,}).*(开奖|中奖|彩票)/,
  /(.{2,}).*(地震|台风|灾害|预警|暴雨)/,
  
  // 技术/产品最新版本
  /(.{2,}).*(最新版本|最新版|最新发布|新版本|最新发布)/,
  /(.{2,}).*(更新日志|更新内容|新版本)/,
  /(.{2,}).*发布/,
  
  // 通用疑问（长度足够时）
  /(.{8,}).*什么/,
  /(.{8,}).*怎么样/,
];

/**
 * 不需要搜索的排除模式
 */
const EXCLUDE_PATTERNS = [
  /不要搜索/,
  /不要查/,
  /别搜索/,
  /不用搜索/,
  /基于你的知识/,
  /根据你的了解/,
  /你自己知道/,
  /不用联网/,
  /不用网上找/,
];

/**
 * 判断消息是否需要联网搜索（内置逻辑，不依赖外部API）
 * @param {string} message - 用户消息
 * @returns {{ needsSearch: boolean, query?: string, reason: string }}
 */
function shouldSearch(message) {
  if (!message || message.trim().length < 3) {
    return { needsSearch: false, reason: '消息太短' };
  }
  
  // 检查排除模式
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(message)) {
      return { needsSearch: false, reason: '用户明确要求不搜索' };
    }
  }
  
  // 检查触发模式
  for (const pattern of SEARCH_PATTERNS) {
    if (pattern.test(message)) {
      // 尝试提取更精确的搜索关键词
      let query = message.trim();
      const extractMatch = message.match(/搜索(.{2,50})/);
      if (extractMatch) {
        query = extractMatch[1].trim().replace(/[吗嘛呢啊哦呀？?！!]\s*$/, '');
      }
      
      if (query.length > 60) {
        query = query.substring(0, 60);
      }
      
      return { 
        needsSearch: true, 
        query: query,
        reason: '匹配搜索模式'
      };
    }
  }
  
  return { needsSearch: false, reason: '未匹配搜索模式' };
}

/**
 * 构建带搜索能力提示的系统 prompt
 */
function buildSearchAwarePrompt(originalPrompt, currentTime = '') {
  let prompt = originalPrompt || '你是一个友好、专业的AI助手NE。请用简洁清晰的中文回答用户问题。';
  
  if (currentTime) {
    prompt += `\n\n**当前时间信息**：${currentTime}`;
  }
  
  prompt += `

**重要能力说明：**
你是一个运行在 PA (Personal Assistant) 项目中的AI助手，具备以下能力：

1. **实时信息处理** — 当用户询问需要最新信息的问题时（如天气、新闻、价格、赛事等），你可以：
   - 如果系统已配置搜索服务，主动调用搜索工具获取实时信息
   - 如果搜索服务不可用，基于你的已有知识回答，并礼貌告知用户信息可能不是最新的

2. **知识边界意识** — 你的知识有截止日期。对于截止日期之后的事件：
   - 如果被明确告知搜索不可用，如实说明
   - 可以提供一般性、原理性的知识
   - 避免编造具体的时间、数字、事件

3. **回答风格** — 用简洁清晰的中文回答，自然地引用信息，不要说"根据搜索结果"或"根据我的知识"。

**当前对话中：**
- 如果用户明确要求"不要搜索"或"基于你的知识回答"，请直接使用你的已有知识
- 如果用户询问实时信息但你无法获取，礼貌说明并提供你已知的相關信息`;
  
  return prompt;
}

/**
 * Resolve model config for a user.
 * Priority: user-configured API Key > default KAT-Coder
 */
async function resolveModelConfig(userId) {
  if (!userId) {
    return { ...DEFAULT_MODEL_CONFIG };
  }

  try {
    const [rows] = await pool.execute(
      `SELECT provider, model_name, api_key_encrypted, api_base 
       FROM user_api_keys 
       WHERE user_id = ? AND is_active = 1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId]
    );

    console.log(`[AI Service] resolveModelConfig userId=${userId}: found=${rows.length > 0 ? rows[0].model_name : 'none (fallback)'}`);

    if (rows.length > 0 && rows[0].api_key_encrypted) {
      const decryptedKey = decrypt(rows[0].api_key_encrypted);
      const config = {
        baseUrl: rows[0].api_base || DEFAULT_MODEL_CONFIG.baseUrl,
        apiKey: decryptedKey,
        model: rows[0].model_name,
        maxTokens: DEFAULT_MODEL_CONFIG.maxTokens,
        temperature: DEFAULT_MODEL_CONFIG.temperature,
        contextWindow: DEFAULT_MODEL_CONFIG.contextWindow,
        provider: rows[0].provider,
        isUserConfigured: true
      };
      console.log(`[AI Service] Using user-configured model: ${config.provider}/${config.model} @ ${config.baseUrl}`);
      return config;
    }
  } catch (err) {
    console.error('[AI Service] Failed to resolve user model config, falling back to default:', err.message);
  }

  console.log('[AI Service] Using default KAT-Coder model');
  return { ...DEFAULT_MODEL_CONFIG, isUserConfigured: false };
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Build messages array for the API
 */
function buildMessages(conversationHistory, currentMessage, systemPrompt) {
  const messages = [];
  
  messages.push({
    role: 'system',
    content: systemPrompt
  });
  
  let totalTokens = 0;
  const maxContextTokens = MODEL_CONFIG.contextWindow - 1000;
  
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    const msgTokens = estimateTokens(msg.content);
    
    if (totalTokens + msgTokens > maxContextTokens && i < conversationHistory.length - 1) {
      break;
    }
    
    messages.unshift({
      role: msg.role,
      content: msg.content
    });
    totalTokens += msgTokens;
  }
  
  messages.push({
    role: 'user',
    content: currentMessage
  });
  
  return messages;
}

/**
 * Send a chat message and get streaming response
 */
async function sendChatStream(conversationHistory, userMessage, onChunk, config = {}) {
  const modelConfig = config.userId 
    ? await resolveModelConfig(config.userId)
    : DEFAULT_MODEL_CONFIG;

  // 获取当前时间
  const now = new Date();
  const currentTime = `${now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} ${now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  
  // 构建带搜索能力提示的系统 prompt
  const systemPrompt = buildSearchAwarePrompt(config.systemPrompt || '你是一个友好、专业的AI助手NE。请用简洁清晰的中文回答用户问题。', currentTime);
  
  // 判断是否需要搜索（仅用于日志和通知，不实际执行搜索）
  const searchDecision = shouldSearch(userMessage);
  if (searchDecision.needsSearch) {
    console.log(`[AI Service] 检测到搜索需求: "${searchDecision.query}" (搜索服务未配置，使用模型已有知识)`);
    if (config.onSearchNeeded) {
      config.onSearchNeeded(searchDecision.query);
    }
  }
  
  const messages = buildMessages(conversationHistory, userMessage, systemPrompt);
  
  const parsedUrl = new URL(modelConfig.baseUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const lib = isHttps ? https : http;
  
  let endpoint = modelConfig.baseUrl;
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint = endpoint.endsWith('/') ? endpoint + 'chat/completions' : endpoint + '/chat/completions';
  }
  const url = new URL(endpoint);
  
  const body = JSON.stringify({
    model: modelConfig.model,
    messages: messages,
    max_tokens: config.maxTokens || modelConfig.maxTokens,
    temperature: config.temperature ?? modelConfig.temperature,
    stream: true
  });
  
  return new Promise((resolve, reject) => {
    const req = lib.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${modelConfig.apiKey}`
      }
    }, (res) => {
      console.log(`[AI Service] HTTP ${res.statusCode} from ${modelConfig.baseUrl}`);
      
      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', chunk => errorBody += chunk);
        res.on('end', () => {
          console.error(`[AI Service] Error body: ${errorBody.substring(0, 200)}`);
          try {
            const err = JSON.parse(errorBody);
            reject(new Error(`API Error ${res.statusCode}: ${err.error?.message || errorBody}`));
          } catch {
            reject(new Error(`API Error ${res.statusCode}: ${errorBody}`));
          }
        });
        return;
      }
      
      let fullContent = '';
      
      res.on('data', (chunk) => {
        const text = chunk.toString();
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              resolve({ content: fullContent, done: true });
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                onChunk(delta);
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      });
      
      res.on('end', () => {
        resolve({ content: fullContent, done: true });
      });
      
      res.on('error', reject);
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Send a chat message and get full response (non-streaming)
 */
async function sendChat(conversationHistory, userMessage, config = {}) {
  const modelConfig = config.userId 
    ? await resolveModelConfig(config.userId)
    : DEFAULT_MODEL_CONFIG;

  // 获取当前时间
  const now = new Date();
  const currentTime = `${now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} ${now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  
  // 构建带搜索能力提示的系统 prompt
  const systemPrompt = buildSearchAwarePrompt(config.systemPrompt || '你是一个友好、专业的AI助手NE。请用简洁清晰的中文回答用户问题。', currentTime);
  
  // 判断是否需要搜索
  const searchDecision = shouldSearch(userMessage);
  if (searchDecision.needsSearch) {
    console.log(`[AI Service] 检测到搜索需求: "${searchDecision.query}" (搜索服务未配置，使用模型已有知识)`);
  }
  
  const messages = buildMessages(conversationHistory, userMessage, systemPrompt);
  
  const parsedUrl = new URL(modelConfig.baseUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const lib = isHttps ? https : http;
  
  let endpoint = modelConfig.baseUrl;
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint = endpoint.endsWith('/') ? endpoint + 'chat/completions' : endpoint + '/chat/completions';
  }
  const url = new URL(endpoint);
  
  const body = JSON.stringify({
    model: modelConfig.model,
    messages: messages,
    max_tokens: config.maxTokens || modelConfig.maxTokens,
    temperature: config.temperature ?? modelConfig.temperature,
    stream: false
  });
  
  return new Promise((resolve, reject) => {
    const req = lib.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${modelConfig.apiKey}`
      }
    }, (res) => {
      console.log(`[AI Service] HTTP ${res.statusCode} from ${modelConfig.baseUrl}`);
      
      let responseText = '';
      
      res.on('data', chunk => responseText += chunk);
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseText);
          const content = parsed.choices?.[0]?.message?.content || '';
          resolve({
            content: content,
            usage: parsed.usage
          });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${responseText}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  sendChat,
  sendChatStream,
  estimateTokens,
  buildMessages,
  resolveModelConfig,
  DEFAULT_MODEL_CONFIG,
  MODEL_CONFIG: DEFAULT_MODEL_CONFIG,
  // 搜索相关导出
  shouldSearch,
  buildSearchAwarePrompt,
  SEARCH_PATTERNS,
  EXCLUDE_PATTERNS
};
