/**
 * 通用联网搜索中间件
 * 
 * 设计原则：
 * 1. 直接在 Node.js 层执行搜索，不依赖子代理
 * 2. 兼容任意模型（通过 prompt 注入）
 * 3. 轻量快速，错误处理 robust
 */

const {
  shouldSearch,
  performSearch,
  formatSearchResults,
  buildEnhancedPrompt,
  isSearchAvailable,
  getSearchStatus,
  SEARCH_PATTERNS,
  EXCLUDE_PATTERNS
} = require('./searchService');

/**
 * 通用搜索增强聊天（非流式）
 */
async function chatWithWebSearch(params) {
  const {
    userMessage,
    conversationHistory = [],
    systemPrompt = '',
    chatFn,
    options = {}
  } = params;
  
  const { currentTime = '', onSearchStart, onSearchComplete } = options;
  
  const decision = shouldSearch(userMessage);
  console.log(`[WebSearch] "${userMessage.substring(0, 50)}..." → ${decision.needsSearch ? '搜索: ' + decision.query : '不搜索'}`);
  
  if (!decision.needsSearch || !isSearchAvailable()) {
    return {
      content: await chatFn(conversationHistory, userMessage, systemPrompt),
      searchUsed: false
    };
  }
  
  if (onSearchStart) onSearchStart(decision.query);
  const result = await performSearch(decision.query);
  if (onSearchComplete) onSearchComplete(result);
  
  if (!result.success) {
    const fallback = systemPrompt + '\n\n搜索服务暂时不可用，请基于你的知识回答。';
    return {
      content: await chatFn(conversationHistory, userMessage, fallback),
      searchUsed: false,
      searchQuery: decision.query
    };
  }
  
  const enhancedPrompt = buildEnhancedPrompt(systemPrompt, formatSearchResults(result), decision.query, currentTime);
  
  return {
    content: await chatFn(conversationHistory, userMessage, enhancedPrompt),
    searchUsed: true,
    searchQuery: decision.query,
    searchProvider: result.provider
  };
}

/**
 * 通用搜索增强聊天（流式）
 */
async function chatStreamWithWebSearch(params) {
  const {
    userMessage,
    conversationHistory = [],
    systemPrompt = '',
    chatStreamFn,
    options = {}
  } = params;
  
  const { currentTime = '', onChunk, onSearchStart, onSearchComplete } = options;
  
  const decision = shouldSearch(userMessage);
  console.log(`[WebSearch] "${userMessage.substring(0, 50)}..." → ${decision.needsSearch ? '搜索: ' + decision.query : '不搜索'}`);
  
  if (!decision.needsSearch || !isSearchAvailable()) {
    return {
      content: await chatStreamFn(conversationHistory, userMessage, systemPrompt, onChunk),
      searchUsed: false
    };
  }
  
  if (onSearchStart) onSearchStart(decision.query);
  const result = await performSearch(decision.query);
  if (onSearchComplete) onSearchComplete(result);
  
  if (!result.success) {
    const fallback = systemPrompt + '\n\n搜索服务暂时不可用，请基于你的知识回答。';
    return {
      content: await chatStreamFn(conversationHistory, userMessage, fallback, onChunk),
      searchUsed: false,
      searchQuery: decision.query
    };
  }
  
  const enhancedPrompt = buildEnhancedPrompt(systemPrompt, formatSearchResults(result), decision.query, currentTime);
  
  return {
    content: await chatStreamFn(conversationHistory, userMessage, enhancedPrompt, onChunk),
    searchUsed: true,
    searchQuery: decision.query,
    searchProvider: result.provider
  };
}

module.exports = {
  shouldSearch,
  chatWithWebSearch,
  chatStreamWithWebSearch,
  isSearchAvailable,
  getSearchStatus,
  SEARCH_PATTERNS,
  EXCLUDE_PATTERNS
};
