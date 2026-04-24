/**
 * HTML 解析器 - 针对各视频网站
 * 
 * 从 VPS 代理返回的 HTML 中提取视频信息
 */

/**
 * 通用 HTML 解析工具
 */
function extractByRegex(html, pattern, groupIndex) {
  const regex = new RegExp(pattern, 'gi');
  const matches = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (groupIndex !== undefined && match[groupIndex] !== undefined) {
      matches.push(match[groupIndex]);
    } else {
      matches.push(match[0]);
    }
  }
  return matches;
}

function cleanHtml(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * 哔嘀影视解析器
 */
function parseBDYS(html, query) {
  const results = [];
  
  // 提取视频标题
  const titles = extractByRegex(html, /<h[23][^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/h[23]>/i, 1);
  
  // 提取海报
  const posters = extractByRegex(html, /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi, 1);
  
  // 提取播放链接
  const links = extractByRegex(html, /<a[^>]+href="([^"]+\.html?)"[^>]*>([^<]+)<\/a>/gi, 1);
  
  // 提取画质标签
  const qualities = extractByRegex(html, /<span[^>]*class="[^"]*quality[^"]*"[^>]*>([^<]+)<\/span>/i, 1);
  
  const count = Math.max(titles.length, 1);
  for (let i = 0; i < Math.min(count, 20); i++) {
    const title = cleanHtml(titles[i] || ('搜索结果 ' + (i + 1)));
    if (title.length < 3) continue;
    
    results.push({
      id: 'bdys_' + i + '_' + Date.now(),
      name: title,
      source: '哔嘀影视',
      quality: qualities[i] || 'HD',
      type: detectType(title),
      year: extractYear(title),
      url: links[i] ? ('https://www.bdys.com' + links[i]) : '#',
      poster: posters[i] || '',
      episodes: null,
      episodeList: [],
      playable: false,
      confidence: 0.7
    });
  }
  
  return results;
}

/**
 * 低端影视解析器
 */
function parseDDYS(html, query) {
  const results = [];
  
  // 提取文章标题
  const titles = extractByRegex(html, /<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)<\/h2>/i, 1);
  
  // 提取缩略图
  const thumbs = extractByRegex(html, /<img[^>]+data-src="([^"]+)"[^>]*>/gi, 1);
  
  // 提取链接
  const links = extractByRegex(html, /<a[^>]+href="([^"]+ddys\.tv[^"]*)"[^>]*>[^<]*<\/a>/gi, 1);
  
  const count = Math.max(titles.length, 1);
  for (let i = 0; i < Math.min(count, 20); i++) {
    const title = cleanHtml(titles[i] || ('视频 ' + (i + 1)));
    if (title.length < 3) continue;
    
    results.push({
      id: 'ddys_' + i + '_' + Date.now(),
      name: title,
      source: '低端影视',
      quality: 'HD',
      type: detectType(title),
      year: extractYear(title),
      url: links[i] || '#',
      poster: thumbs[i] || '',
      episodes: null,
      episodeList: [],
      playable: false,
      confidence: 0.7
    });
  }
  
  return results;
}

/**
 * 动漫岛解析器
 */
function parseDMZJ(html, query) {
  const results = [];
  
  // 提取动漫标题
  const titles = extractByRegex(html, /<a[^>]+href="\/info\/(\d+)"[^>]*>([^<]+)<\/a>/gi, 2);
  
  // 提取封面
  const covers = extractByRegex(html, /<img[^>]+src="([^"]+)"[^>]+alt="([^"]+)"[^>]*>/gi, 1);
  
  const count = Math.max(titles.length, 1);
  for (let i = 0; i < Math.min(count, 20); i++) {
    const title = cleanHtml(titles[i] || ('动漫 ' + (i + 1)));
    if (title.length < 2) continue;
    
    results.push({
      id: 'dmzj_' + i + '_' + Date.now(),
      name: title,
      source: '动漫岛',
      quality: 'HD',
      type: 'anime',
      year: null,
      url: '#',
      poster: covers[i] || '',
      episodes: 24,
      episodeList: generateEpisodes(24),
      playable: false,
      confidence: 0.7
    });
  }
  
  return results;
}

/**
 * 555电影解析器
 */
function parse555DY(html, query) {
  const results = [];
  
  // 提取视频标题
  const titles = extractByRegex(html, /<a[^>]+href="\/voddetail\/(\d+).html"[^>]*>([^<]+)<\/a>/gi, 2);
  
  // 提取海报
  const posters = extractByRegex(html, /data-original="([^"]+)"[^>]*title="([^"]+)"/gi, 1);
  
  const count = Math.max(titles.length, 1);
  for (let i = 0; i < Math.min(count, 20); i++) {
    const title = cleanHtml(titles[i] || ('视频 ' + (i + 1)));
    if (title.length < 2) continue;
    
    results.push({
      id: '555dy_' + i + '_' + Date.now(),
      name: title,
      source: '555电影',
      quality: 'HD',
      type: detectType(title),
      year: extractYear(title),
      url: '#',
      poster: posters[i] || '',
      episodes: detectEpisodes(title),
      episodeList: [],
      playable: false,
      confidence: 0.7
    });
  }
  
  return results;
}

/**
 * Archive.org 解析器
 */
function parseArchive(html, query) {
  const results = [];
  
  // 提取视频标题
  const titles = extractByRegex(html, /<a[^>]+href="\/details\/([^"]+)"[^>]*>([^<]+)<\/a>/gi, 2);
  
  // 提取海报
  const posters = extractByRegex(html, /<img[^>]+src="([^"]+)"[^>]+itemprop="thumbnailUrl"/gi, 1);
  
  // 提取年份
  const years = extractByRegex(html, /<div[^>]*>.*?(\d{4}).*?<\/div>/gi, 1);
  
  const count = Math.max(titles.length, 1);
  for (let i = 0; i < Math.min(count, 20); i++) {
    const title = cleanHtml(titles[i] || ('视频 ' + (i + 1)));
    if (title.length < 3) continue;
    
    results.push({
      id: 'archive_' + i + '_' + Date.now(),
      name: title,
      source: 'Archive.org',
      quality: 'SD',
      type: 'movie',
      year: parseInt(years[i]) || extractYear(title),
      url: 'https://archive.org/details/' + titles[i],
      poster: posters[i] || '',
      episodes: null,
      episodeList: [],
      playable: true,
      confidence: 0.8
    });
  }
  
  return results;
}

/**
 * 辅助函数
 */
function detectType(title) {
  const lower = title.toLowerCase();
  if (lower.includes('剧') || lower.includes('season')) return 'series';
  if (lower.includes('动漫') || lower.includes('动画') || lower.includes('anime')) return 'anime';
  if (lower.includes('综艺')) return 'variety';
  if (lower.includes('纪录')) return 'documentary';
  return 'movie';
}

function detectEpisodes(title) {
  const match = title.match(/第?(\d+)[集部]/);
  return match ? parseInt(match[1]) : null;
}

function extractYear(title) {
  const match = title.match(/\((\d{4})\)/);
  return match ? parseInt(match[1]) : null;
}

function generateEpisodes(count) {
  const episodes = [];
  for (let i = 1; i <= Math.min(count, 50); i++) {
    episodes.push({ name: i, url: '#', playable: true });
  }
  return episodes;
}

/**
 * 主解析函数
 */
function parseSearchResults(html, siteKey, query) {
  const parsers = {
    'bdys': parseBDYS,
    'ddys': parseDDYS,
    'dmzj': parseDMZJ,
    '555dy': parse555DY,
    'archive': parseArchive
  };
  
  const parser = parsers[siteKey];
  if (parser) {
    try {
      return parser(html, query);
    } catch (e) {
      console.error('Parse error for ' + siteKey + ':', e.message);
      return [];
    }
  }
  
  return [];
}

module.exports = {
  parseSearchResults,
  parseBDYS,
  parseDDYS,
  parseDMZJ,
  parse555DY,
  parseArchive
};
