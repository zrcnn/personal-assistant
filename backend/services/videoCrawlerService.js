/**
 * 视频爬虫服务 - 数据库 + VPS 代理混合模式
 * 
 * 架构：
 * 1. 数据库存储真实影视数据（逐玉、庆余年等）
 * 2. VPS 代理实时查询视频网站
 * 3. 快速模式：先查数据库，再后台查 VPS
 */

const mysql = require('mysql2/promise');
const http = require('http');
const url = require('url');
const { parseSearchResults } = require('./htmlParser');

const VPS_PROXY = process.env.VPS_PROXY_URL || 'http://127.0.0.1:13002';

// 配置
const CONFIG = {
  cacheTTL: 10 * 60 * 1000,        // 缓存10分钟
  requestTimeout: 8000,            // 请求超时8秒
  maxConcurrent: 2,                // 最大并发数
  retryAttempts: 1,                // 重试1次
  maxResults: 50,                  // 最大结果数
  fastMode: true,                  // 快速模式
};

// 搜索缓存
const searchCache = new Map();

// 搜索统计
const searchStats = {
  totalSearches: 0,
  cacheHits: 0,
  cacheMisses: 0,
  lastSearches: []
};

// 搜索历史（内存）
const searchHistory = [];
const MAX_HISTORY = 100;

// 热门搜索词
const HOT_SEARCHES = [
  '逐玉', '庆余年', '掌心', '难哄', '似锦',
  '狂飙', '三体', '权力的游戏', '进击的巨人', '鬼灭之刃',
  'big buck bunny', 'sintel', 'archive', 'animation', 'movie'
];

// 支持的视频网站
const VIDEO_SITES = {
  bdys: { name: '哔嘀影视', domain: 'www.bdys.com', searchPath: '/search?q=', types: ['国产剧', '电影', '综艺'] },
  ddys: { name: '低端影视', domain: 'ddys.tv', searchPath: '/?s=', types: ['美剧', '英剧', '韩剧'] },
  dmzj: { name: '动漫岛', domain: 'www.dmzj.com', searchPath: '/search?keywords=', types: ['动漫', '新番'] },
  '555dy': { name: '555电影', domain: '555dy.com', searchPath: '/vod/search.html?wd=', types: ['电影', '电视剧'] },
  archive: { name: 'Archive.org', domain: 'archive.org', searchPath: '/search.php?query=', types: ['经典电影', '纪录片'] }
};

class VideoCrawlerService {
  constructor() {
    this.db = null;
  }
  
  async init() {
    this.db = await mysql.createConnection({
      host: 'localhost',
      user: 'pa',
      password: 'pa_pass_2026',
      database: 'personal_assistant'
    });
    console.log('Video crawler service started (database + proxy mode)');
    console.log('Config:', JSON.stringify(CONFIG));
    
    // 定期清理过期缓存
    setInterval(this.cleanupCache.bind(this), 60000);
  }
  
  /**
   * HTTP 请求（带重试）
   */
  async httpRequest(proxyUrl, timeout, attempt) {
    timeout = timeout || CONFIG.requestTimeout;
    attempt = attempt || 0;
    
    return new Promise(function(resolve, reject) {
      const parsed = url.parse(proxyUrl);
      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: parsed.path,
        method: 'GET',
        timeout: timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      }, function(res) {
        let data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          resolve({ status: res.statusCode, data: data });
        });
      });
      
      req.on('error', function(e) { reject(e); });
      req.on('timeout', function() {
        req.destroy();
        reject(new Error('Timeout after ' + timeout + 'ms'));
      });
      req.end();
    }).catch(function(e) {
      if (attempt < CONFIG.retryAttempts) {
        return new Promise(function(resolve) {
          setTimeout(resolve, 1000 * (attempt + 1));
        }).then(function() {
          return this.httpRequest(proxyUrl, timeout, attempt + 1);
        }.bind(this));
      }
      throw e;
    }.bind(this));
  }
  
  /**
   * 搜索视频 - 数据库 + VPS 代理
   */
  async searchVideos(query, userId) {
    const normalizedQuery = query ? query.trim().toLowerCase() : '';
    
    searchStats.totalSearches++;
    
    // 记录搜索历史
    if (normalizedQuery) {
      searchHistory.unshift({ query: normalizedQuery, userId: userId || 1, time: Date.now() });
      if (searchHistory.length > MAX_HISTORY) searchHistory.shift();
    }
    
    // 检查缓存
    if (normalizedQuery && searchCache.has(normalizedQuery)) {
      const cached = searchCache.get(normalizedQuery);
      if (Date.now() - cached.time < CONFIG.cacheTTL) {
        searchStats.cacheHits++;
        return cached.results;
      }
      searchCache.delete(normalizedQuery);
    }
    
    searchStats.cacheMisses++;
    
    const results = [];
    
    if (!normalizedQuery) {
      return this.getPopularVideos();
    }
    
    // 快速模式：先查数据库
    if (CONFIG.fastMode) {
      const dbResults = await this.searchFromDatabase(normalizedQuery);
      if (dbResults.length > 0) {
        // 过滤掉慢速源
        const filteredResults = this.filterSlowSources(dbResults);
        const quickResults = this.deduplicateAndSort(filteredResults).slice(0, CONFIG.maxResults);
        // 后台查 VPS 补充
        this.backgroundSearch(normalizedQuery, query, quickResults);
        searchStats.cacheHits++;
        return quickResults;
      }
    }
    
    // VPS 代理查询
    const siteKeys = Object.keys(VIDEO_SITES);
    const batches = this.createBatches(siteKeys, CONFIG.maxConcurrent);
    
    var i, j;
    for (i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchPromises = batch.map(async function(siteKey) {
        try {
          return await this.searchFromSite(siteKey, query);
        } catch (e) {
          return [];
        }
      }.bind(this));
      
      const batchResults = await Promise.all(batchPromises);
      for (j = 0; j < batchResults.length; j++) {
        results.push(...batchResults[j]);
      }
    }
    
    const finalResults = this.deduplicateAndSort(results).slice(0, CONFIG.maxResults);
    
    if (finalResults.length > 0) {
      searchCache.set(normalizedQuery, { time: Date.now(), results: finalResults });
    }
    
    return finalResults;
  }
  
  /**
   * 过滤慢速源
   */
  filterSlowSources(results) {
    try {
      const { getSpeedTestService } = require('./videoSpeedTest');
      const speedService = getSpeedTestService();
      
      return results.filter(function(item) {
        if (!item.url || item.url === '#') return true;
        return !speedService.shouldFilterVideo(item.url);
      });
    } catch (e) {
      return results;
    }
  }
  
  /**
   * 从数据库搜索
   */
  async searchFromDatabase(query) {
    try {
      const [rows] = await this.db.execute(
        'SELECT vr.id, vr.title, vr.type, vr.quality, vr.year, vr.episodes, vr.rating, vr.play_url, vs.name as source_name ' +
        'FROM video_resources vr ' +
        'LEFT JOIN video_sources vs ON vr.source_id = vs.id ' +
        'WHERE vr.is_valid = 1 AND vr.title LIKE ? ORDER BY vr.rating DESC, vr.year DESC LIMIT 30',
        ['%' + query + '%']
      );
      
      return rows.map(this.formatDbVideo.bind(this));
    } catch (e) {
      console.error('Database search error:', e.message);
      return [];
    }
  }
  
  /**
   * 后台搜索（VPS 补充）
   */
  async backgroundSearch(normalizedQuery, originalQuery, existingResults) {
    try {
      const results = [...existingResults];
      const archiveResults = await this.searchFromSite('archive', originalQuery);
      results.push(...archiveResults);
      const finalResults = this.deduplicateAndSort(results).slice(0, CONFIG.maxResults);
      searchCache.set(normalizedQuery, { time: Date.now(), results: finalResults });
    } catch (e) { /* 静默 */ }
  }
  
  /**
   * 从网站搜索
   */
  async searchFromSite(siteKey, query) {
    const proxyUrl = VPS_PROXY + '/search?q=' + encodeURIComponent(query) + '&site=' + siteKey;
    try {
      const response = await this.httpRequest(proxyUrl, CONFIG.requestTimeout);
      if (response.status === 200 && response.data.length > 0) {
        return parseSearchResults(response.data, siteKey, query);
      }
    } catch (e) { /* 静默 */ }
    return [];
  }
  
  formatDbVideo(row) {
    return {
      id: String(row.id),
      name: row.title,
      source: row.source_name || '影视源',
      quality: row.quality || 'HD',
      type: row.type || 'movie',
      subGenre: row.sub_genre || '',
      year: row.year,
      rating: row.rating,
      url: row.play_url || '#',
      poster: row.poster_url || '',
      episodes: row.episodes,
      episodeList: row.episodes ? this.generateEpisodes(row.episodes) : [],
      playable: !!row.play_url,
      confidence: 0.8 + (row.rating ? row.rating / 100 : 0)
    };
  }
  
  async getPopularVideos() {
    try {
      const [rows] = await this.db.execute(
        'SELECT vr.id, vr.title, vr.type, vr.quality, vr.year, vr.episodes, vr.rating, vr.play_url, vs.name as source_name ' +
        'FROM video_resources vr ' +
        'LEFT JOIN video_sources vs ON vr.source_id = vs.id ' +
        'WHERE vr.is_valid = 1 ORDER BY vr.rating DESC, vr.year DESC LIMIT 30'
      );
      return rows.map(this.formatDbVideo.bind(this));
    } catch (e) {
      return [];
    }
  }
  
  /**
   * 分页浏览视频
   */
  async browseVideos(options) {
    const page = options.page || 1;
    const pageSize = options.pageSize || 30;
    const type = options.type || '';
    const subGenre = options.subGenre || '';
    const quality = options.quality || '';
    const year = options.year || 0;
    const sortBy = options.sortBy || 'rating';
    const offset = (page - 1) * pageSize;
    
    try {
      // 构建 WHERE 条件
      let whereClause = 'WHERE vr.is_valid = 1';
      let params = [];
      
      if (type) {
        whereClause += ' AND vr.type = ?';
        params.push(type);
      }
      if (subGenre) {
        whereClause += ' AND vr.sub_genre = ?';
        params.push(subGenre);
      }
      if (quality) {
        whereClause += ' AND vr.quality = ?';
        params.push(quality);
      }
      if (year) {
        whereClause += ' AND vr.year = ?';
        params.push(year);
      }
      
      // 排序
      let orderClause = 'ORDER BY vr.rating DESC';
      switch (sortBy) {
        case 'year': orderClause = 'ORDER BY vr.year DESC, vr.rating DESC'; break;
        case 'name': orderClause = 'ORDER BY vr.title ASC'; break;
        case 'episodes': orderClause = 'ORDER BY vr.episodes DESC'; break;
      }
      
      // 获取总数
      const [countRows] = await this.db.query(
        'SELECT COUNT(*) as total FROM video_resources vr ' + whereClause, params
      );
      const total = countRows[0].total;
      const totalPages = Math.ceil(total / pageSize);
      
      // 获取数据
      const queryParams = params.concat([pageSize, offset]);
      const [rows] = await this.db.query(
        'SELECT vr.id, vr.title, vr.type, vr.sub_genre, vr.quality, vr.year, vr.episodes, vr.rating, vr.play_url, vs.name as source_name ' +
        'FROM video_resources vr ' +
        'LEFT JOIN video_sources vs ON vr.source_id = vs.id ' +
        ' ' + whereClause + ' ' + orderClause + ' LIMIT ? OFFSET ?',
        queryParams
      );
      
      return {
        page: page,
        pageSize: pageSize,
        total: total,
        totalPages: totalPages,
        items: rows.map(this.formatDbVideo.bind(this))
      };
    } catch (e) {
      console.error('Browse videos error:', e.message);
      return { page: 1, pageSize: pageSize, total: 0, totalPages: 0, items: [] };
    }
  }
  
  generateEpisodes(count) {
    const episodes = [];
    for (var i = 1; i <= Math.min(count, 50); i++) {
      episodes.push({ name: i, url: '#', playable: true });
    }
    return episodes;
  }
  
  createBatches(items, batchSize) {
    const batches = [];
    for (var i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
  
  deduplicateAndSort(results) {
    const seen = new Set();
    return results
      .filter(function(item) {
        const key = item.name + '_' + item.source;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(function(a, b) { return b.confidence - a.confidence; });
  }
  
  cleanupCache() {
    const now = Date.now();
    var key;
    for (key in searchCache) {
      if (now - searchCache.get(key).time > CONFIG.cacheTTL) {
        searchCache.delete(key);
      }
    }
  }
  
  getSearchSuggestions(partialQuery) {
    if (!partialQuery) return HOT_SEARCHES.slice(0, 5);
    const query = partialQuery.toLowerCase();
    return HOT_SEARCHES.filter(function(s) { return s.toLowerCase().includes(query); }).slice(0, 5);
  }
  
  getStats() {
    return {
      totalSearches: searchStats.totalSearches,
      cacheHits: searchStats.cacheHits,
      cacheMisses: searchStats.cacheMisses,
      hitRate: searchStats.totalSearches > 0 ? ((searchStats.cacheHits / searchStats.totalSearches) * 100).toFixed(1) + '%' : '0%',
      cacheSize: searchCache.size,
      activeSites: Object.keys(VIDEO_SITES).length,
      historySize: searchHistory.length
    };
  }
  
  getSearchHistory(userId, limit) {
    limit = limit || 30;
    return searchHistory
      .filter(function(h) { return !userId || h.userId === userId; })
      .slice(0, limit)
      .map(function(h) { return { query: h.query, created_at: new Date(h.time) }; });
  }
  
  async getAvailableSources() {
    const sources = [];
    var key;
    for (key in VIDEO_SITES) {
      sources.push({ key: key, name: VIDEO_SITES[key].name, domain: VIDEO_SITES[key].domain, types: VIDEO_SITES[key].types.join(', ') });
    }
    return sources;
  }
  
  async testSource(siteKey) {
    try {
      const proxyUrl = VPS_PROXY + '/search?q=test&site=' + siteKey;
      const response = await this.httpRequest(proxyUrl, 8000);
      return response.status === 200;
    } catch (e) { return false; }
  }
  
  async close() {
    if (this.db) await this.db.end();
  }
}

// 单例
let instance = null;

async function getService() {
  if (!instance) {
    instance = new VideoCrawlerService();
    await instance.init();
  }
  return instance;
}

module.exports = { getService, VideoCrawlerService, VIDEO_SITES, CONFIG };
