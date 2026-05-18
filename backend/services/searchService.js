/**
 * 搜索服务 - 直接在 Node.js 层执行联网搜索
 * 
 * 设计原则：
 * 1. 不依赖子代理，直接在 Node.js 层执行搜索
 * 2. 支持多种搜索后端（Google/Bing/Brave）
 * 3. 搜索结果直接注入 prompt，兼容任意模型
 * 
 * 优点：
 * - 轻量快速，无子代理开销
 * - 不竞争用户模型的 API 配额
 * - 可控性强，错误处理更 robust
 */

const https = require('https');
const http = require('http');

/**
 * 搜索配置
 */
const SEARCH_CONFIG = {
  google: {
    apiKey: process.env.GOOGLE_SEARCH_API_KEY || '',
    cseId: process.env.GOOGLE_CSE_ID || '',
    enabled: !!(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_CSE_ID)
  },
  bing: {
    apiKey: process.env.BING_SEARCH_API_KEY || '',
    enabled: !!process.env.BING_SEARCH_API_KEY
  },
  brave: {
    apiKey: process.env.BRAVE_SEARCH_API_KEY || '',
    enabled: !!process.env.BRAVE_SEARCH_API_KEY
  },
  maxResults: 5,
  timeout: 8000,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

/**
 * 搜索触发关键词模式
 */
const SEARCH_PATTERNS = [
  // 明确搜索意图
  /搜索(.{1,50})/,
  /查(找|一下|一查|查)(.{1,50})/,
  /帮我(找|查)(.{1,50})/,
  
  // 实时信息需求
  /最新(.{1,40})(消息|新闻|动态|信息|进展)/,
  /最近(.{1,40})(发生|更新|发布|推出|有什么|大事)/,
  /今天(.{1,40})(天气|气温|新闻|发生|怎么样)/,
  /现在(.{1,40})(多少|怎么样|如何|价格)/,
  
  // 疑问句
  /(.{5,}).*[吗嘛？]/,
  /(.{5,}).*怎么(办|样|做)/,
  /(.{5,}).*什么(意思|情况|东西)/,
  /(.{5,}).*多少钱/,
  /(.{5,}).*如何/,
  
  // 时间敏感话题
  /(.{2,}).*(股票|股价|基金|比特币|加密货币|汇率).*(多少|价格|行情)/,
  /(.{2,}).*(比分|赛况|比赛)/,
  /(.{2,}).*(地震|台风|灾害)/,
  /(.{2,}).*(最新版本|最新版|最新发布)/,
];

const EXCLUDE_PATTERNS = [
  /不要搜索/, /不用搜索/, /别搜索/,
  /基于你的知识/, /根据你的了解/,
];

/**
 * 判断是否需要搜索
 */
function shouldSearch(message) {
  if (!message || message.trim().length < 3) {
    return { needsSearch: false, reason: '消息太短' };
  }
  
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(message)) {
      return { needsSearch: false, reason: '用户明确要求不搜索' };
    }
  }
  
  for (const pattern of SEARCH_PATTERNS) {
    if (pattern.test(message)) {
      let query = message.trim();
      // 尝试提取更精确的关键词
      const extractMatch = message.match(/搜索(.{2,50})/);
      if (extractMatch) query = extractMatch[1].trim();
      
      return { needsSearch: true, query: query.substring(0, 60), reason: '匹配搜索模式' };
    }
  }
  
  return { needsSearch: false, reason: '未匹配搜索模式' };
}

/**
 * HTTP GET 请求
 */
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const req = lib.get(url, {
      headers: { 'User-Agent': SEARCH_CONFIG.userAgent, ...headers },
      timeout: SEARCH_CONFIG.timeout
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

/**
 * Google Custom Search
 */
async function googleSearch(query, num = 5) {
  const { apiKey, cseId } = SEARCH_CONFIG.google;
  if (!apiKey || !cseId) throw new Error('Google Search not configured');
  
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', cseId);
  url.searchParams.set('q', query);
  url.searchParams.set('num', Math.min(num, 10));
  
  console.log(`[Search] Google: ${query}`);
  const res = await httpGet(url.toString());
  
  if (res.status !== 200) {
    throw new Error(`Google API error: ${res.status}`);
  }
  
  return (res.data.items || []).map(item => ({
    title: item.title || '',
    url: item.link || '',
    snippet: item.snippet || '',
    source: 'google'
  }));
}

/**
 * Bing Search API
 */
async function bingSearch(query, num = 5) {
  const { apiKey } = SEARCH_CONFIG.bing;
  if (!apiKey) throw new Error('Bing Search not configured');
  
  const url = new URL('https://api.bing.microsoft.com/v7.0/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', Math.min(num, 10));
  url.searchParams.set('mkt', 'zh-CN');
  
  console.log(`[Search] Bing: ${query}`);
  const res = await httpGet(url.toString(), { 'Ocp-Apim-Subscription-Key': apiKey });
  
  if (res.status !== 200) {
    throw new Error(`Bing API error: ${res.status}`);
  }
  
  return (res.data.webPages?.value || []).map(item => ({
    title: item.name || '',
    url: item.url || '',
    snippet: item.snippet || '',
    source: 'bing'
  }));
}

/**
 * Brave Search API
 */
async function braveSearch(query, num = 5) {
  const { apiKey } = SEARCH_CONFIG.brave;
  if (!apiKey) throw new Error('Brave Search not configured');
  
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', Math.min(num, 10));
  
  console.log(`[Search] Brave: ${query}`);
  const res = await httpGet(url.toString(), {
    'Accept': 'application/json',
    'X-Subscription-Token': apiKey
  });
  
  if (res.status !== 200) {
    throw new Error(`Brave API error: ${res.status}`);
  }
  
  return (res.data.web?.results || []).map(item => ({
    title: item.title || '',
    url: item.url || '',
    snippet: item.description || '',
    source: 'brave'
  }));
}

/**
 * 执行搜索（自动选择可用后端）
 */
async function performSearch(query, numResults = 5) {
  const errors = [];
  
  // 尝试各个后端
  const backends = [
    { name: 'google', fn: () => googleSearch(query, numResults) },
    { name: 'bing', fn: () => bingSearch(query, numResults) },
    { name: 'brave', fn: () => braveSearch(query, numResults) },
  ];
  
  for (const backend of backends) {
    try {
      const results = await backend.fn();
      if (results.length > 0) {
        return {
          success: true,
          provider: backend.name,
          results,
          timestamp: new Date().toISOString()
        };
      }
    } catch (err) {
      errors.push(`${backend.name}: ${err.message}`);
    }
  }
  
  return {
    success: false,
    provider: null,
    results: [],
    error: `All backends failed: ${errors.join('; ')}`,
    timestamp: new Date().toISOString()
  };
}

/**
 * 格式化搜索结果为 prompt 文本
 */
function formatSearchResults(searchResult) {
  if (!searchResult.success || !searchResult.results.length) {
    return `搜索不可用：${searchResult.error || '无结果'}`;
  }
  
  let text = `📡 联网搜索结果（来源：${searchResult.provider}）：\n\n`;
  searchResult.results.forEach((r, i) => {
    text += `${i + 1}. **${r.title}**\n   ${r.snippet}\n   来源：${r.url}\n\n`;
  });
  return text;
}

/**
 * 构建带搜索结果的增强 prompt
 */
function buildEnhancedPrompt(originalPrompt, searchResults, query, currentTime = '') {
  let prompt = originalPrompt || '你是一个友好、专业的AI助手NE。';
  
  if (currentTime) prompt += `\n\n当前时间：${currentTime}`;
  
  prompt += `\n\n【联网搜索结果】关于"${query}"的实时信息：
${searchResults}

回答指南：
- 优先使用上述搜索结果中的信息
- 如果搜索结果不足，可以补充你的已有知识
- 自然地引用信息，不要说"根据搜索结果"
- 用简洁清晰的中文回答`;
  
  return prompt;
}

/**
 * 检查搜索服务是否可用
 */
function isSearchAvailable() {
  return SEARCH_CONFIG.google.enabled || SEARCH_CONFIG.bing.enabled || SEARCH_CONFIG.brave.enabled;
}

/**
 * 获取搜索服务状态
 */
function getSearchStatus() {
  return {
    available: isSearchAvailable(),
    providers: {
      google: SEARCH_CONFIG.google.enabled,
      bing: SEARCH_CONFIG.bing.enabled,
      brave: SEARCH_CONFIG.brave.enabled
    }
  };
}

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
  performSearch,
  formatSearchResults,
  buildEnhancedPrompt,
  chatWithWebSearch,
  chatStreamWithWebSearch,
  isSearchAvailable,
  getSearchStatus,
  SEARCH_PATTERNS,
  EXCLUDE_PATTERNS
};
