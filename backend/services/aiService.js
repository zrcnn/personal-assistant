/**
 * AI Service - Direct model API calls
 * Supports KAT-Coder (default) and user-configured models via OpenAI-compatible API
 * 
 * Model resolution priority:
 * 1. User-configured API Key (from user_api_keys table, active + first match)
 * 2. Default KAT-Coder model (built-in)
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
  apiKey: 'rkARKvOIxPVAAWe4TOrJ94oNLFijNtdPU3WjyPyY0ek',
  model: 'ep-qubph3-1775115536595397049',
  maxTokens: 4096,
  temperature: 0.7,
  contextWindow: 100000
};

// Backward compatibility alias
const MODEL_CONFIG = DEFAULT_MODEL_CONFIG;

/**
 * Resolve model config for a user.
 * Priority: user-configured API Key > default KAT-Coder
 * 
 * @param {number} userId - The user ID
 * @returns {Promise<Object>} Model configuration object
 */
async function resolveModelConfig(userId) {
  if (!userId) {
    return { ...DEFAULT_MODEL_CONFIG };
  }

  try {
    // Look for an active user-configured API key
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

  // Fallback to default KAT-Coder
  console.log('[AI Service] Using default KAT-Coder model');
  return { ...DEFAULT_MODEL_CONFIG, isUserConfigured: false };
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text) {
  if (!text) return 0;
  // Rough estimate: ~4 chars per token for mixed Chinese/English
  return Math.ceil(text.length / 4);
}

/**
 * Build messages array for the API
 * Includes system prompt and conversation history
 */
function buildMessages(conversationHistory, currentMessage, systemPrompt) {
  const messages = [];
  
  // Add system prompt
  messages.push({
    role: 'system',
    content: systemPrompt || '你是一个友好、专业的AI助手NE。请用简洁清晰的中文回答用户问题。你可以帮助用户进行对话、编程、写作、翻译、总结等各种任务。'
  });
  
  // Add conversation history (limit to fit context window)
  let totalTokens = 0;
  const maxContextTokens = MODEL_CONFIG.contextWindow - 1000; // Reserve space
  
  // Add messages from oldest to newest, stop when approaching limit
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    const msgTokens = estimateTokens(msg.content);
    
    if (totalTokens + msgTokens > maxContextTokens && i < conversationHistory.length - 1) {
      break; // Stop if we've hit the limit (but always include at least one message)
    }
    
    messages.unshift({
      role: msg.role,
      content: msg.content
    });
    totalTokens += msgTokens;
  }
  
  // Add current user message
  messages.push({
    role: 'user',
    content: currentMessage
  });
  
  return messages;
}

/**
 * Send a chat message and get streaming response
 * Calls callback for each chunk
 * 
 * @param {Array} conversationHistory - Previous messages
 * @param {string} userMessage - Current user message
 * @param {Function} onChunk - Callback for streaming chunks
 * @param {Object} config - Optional config overrides
 * @param {number} config.userId - User ID for model config resolution
 */
async function sendChatStream(conversationHistory, userMessage, onChunk, config = {}) {
  const modelConfig = config.userId 
    ? await resolveModelConfig(config.userId)
    : DEFAULT_MODEL_CONFIG;

  const messages = buildMessages(conversationHistory, userMessage, config.systemPrompt);
  
  const parsedUrl = new URL(modelConfig.baseUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const lib = isHttps ? https : http;
  
  const url = new URL(modelConfig.baseUrl + '/chat/completions');
  
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
 * 
 * @param {Array} conversationHistory - Previous messages
 * @param {string} userMessage - Current user message
 * @param {Object} config - Optional config overrides
 * @param {number} config.userId - User ID for model config resolution
 */
async function sendChat(conversationHistory, userMessage, config = {}) {
  const modelConfig = config.userId 
    ? await resolveModelConfig(config.userId)
    : DEFAULT_MODEL_CONFIG;

  const messages = buildMessages(conversationHistory, userMessage, config.systemPrompt);
  
  const parsedUrl = new URL(modelConfig.baseUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const lib = isHttps ? https : http;
  
  const url = new URL(modelConfig.baseUrl + '/chat/completions');
  
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
  /** @deprecated Use DEFAULT_MODEL_CONFIG instead */
  MODEL_CONFIG: DEFAULT_MODEL_CONFIG
};
