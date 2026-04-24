/**
 * 视频源发现服务 - VPS 代理版
 * 
 * 通过 VPS 代理访问视频网站，爬取真实数据
 */

const mysql = require('mysql2/promise');
const http = require('http');
const url = require('url');

const VPS_PROXY = process.env.VPS_PROXY_URL || 'http://127.0.0.1:13002';

const SEED_SITES = [
  { name: '哔嘀影视', key: 'bdys', domain: 'bdys.com', type: 'general' },
  { name: '低端影视', key: 'ddys', domain: 'ddys.tv', type: 'series' },
  { name: '动漫岛', key: 'dmzj', domain: 'dmzj.com', type: 'anime' },
  { name: '555电影', key: '555dy', domain: '555dy.com', type: 'general' },
  { name: 'Archive.org', key: 'archive', domain: 'archive.org', type: 'classic' },
];

class VideoSourceDiscovery {
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
    console.log('Video source discovery service started (VPS proxy mode)');
  }
  
  /**
   * 通过 VPS 代理请求
   */
  async proxyRequest(proxyUrl) {
    return new Promise(function(resolve, reject) {
      const parsed = url.parse(proxyUrl);
      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: parsed.path,
        method: 'GET',
        timeout: 20000
      }, function(res) {
        let data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          resolve({ status: res.statusCode, data: data });
        });
      });
      req.on('error', reject);
      req.on('timeout', function() { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
  }
  
  /**
   * 发现新的视频源
   */
  async discoverNewSources() {
    console.log('Discovering new video sources via VPS proxy...');
    const newSources = [];
    
    // 获取 VPS 代理支持的站点
    try {
      const proxyUrl = VPS_PROXY + '/sites';
      const response = await this.proxyRequest(proxyUrl);
      if (response.status === 200) {
        const sites = JSON.parse(response.data);
        console.log('VPS proxy supports ' + Object.keys(sites.sites).length + ' sites');
      }
    } catch (e) {
      console.error('Failed to get VPS proxy sites:', e.message);
    }
    
    // 测试每个种子站点的可用性
    var i;
    for (i = 0; i < SEED_SITES.length; i++) {
      const seed = SEED_SITES[i];
      const available = await this.testSourceViaProxy(seed.key, 'test');
      
      if (available) {
        newSources.push({
          name: seed.name,
          domain: seed.domain,
          type: seed.type,
          status: 'active'
        });
      }
    }
    
    const uniqueSources = this.deduplicateSources(newSources);
    await this.saveSources(uniqueSources);
    
    console.log('Discovered ' + uniqueSources.length + ' available sources');
    return uniqueSources;
  }
  
  /**
   * 通过 VPS 代理测试源可用性
   */
  async testSourceViaProxy(siteKey, query) {
    try {
      const proxyUrl = VPS_PROXY + '/search?q=' + encodeURIComponent(query || 'test') + '&site=' + siteKey;
      const response = await this.proxyRequest(proxyUrl);
      return response.status === 200 && response.data.length > 0;
    } catch (e) {
      console.error('Test source ' + siteKey + ' failed:', e.message);
      return false;
    }
  }
  
  /**
   * 通过 VPS 代理搜索视频
   */
  async searchViaProxy(siteKey, query) {
    try {
      const proxyUrl = VPS_PROXY + '/search?q=' + encodeURIComponent(query) + '&site=' + siteKey;
      const response = await this.proxyRequest(proxyUrl);
      if (response.status === 200) {
        return this.parseSearchResults(response.data, siteKey);
      }
    } catch (e) {
      console.error('Search via proxy failed:', e.message);
    }
    return [];
  }
  
  /**
   * 解析搜索结果
   */
  parseSearchResults(html, siteKey) {
    // 简化的 HTML 解析
    // 实际需要根据各网站的 HTML 结构编写解析器
    const results = [];
    
    // 示例：提取标题
    const titleRegex = /<title>([^<]+)<\/title>/i;
    const match = html.match(titleRegex);
    
    if (match && match[1].length > 10) {
      results.push({
        title: match[1].replace(/ - .*$/, ''),
        type: 'movie',
        quality: 'HD',
        url: '#',
        source: siteKey
      });
    }
    
    return results;
  }
  
  deduplicateSources(sources) {
    const seen = new Set();
    return sources.filter(function(s) {
      if (seen.has(s.domain)) return false;
      seen.add(s.domain);
      return true;
    });
  }
  
  async saveSources(sources) {
    var i;
    for (i = 0; i < sources.length; i++) {
      try {
        await this.db.execute(
          'INSERT INTO video_sources (name, domain, types, status) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status)',
          [sources[i].name, sources[i].domain, sources[i].type, sources[i].status || 'active']
        );
      } catch (e) {
        console.error('Save source failed:', e.message);
      }
    }
  }
  
  async testSourceAvailability(source) {
    try {
      const available = await this.testSourceViaProxy(source.key || 'archive', 'test');
      await this.db.execute('UPDATE video_sources SET status = ? WHERE domain = ?', 
        [available ? 'active' : 'error', source.domain]);
      return available;
    } catch (e) {
      await this.db.execute('UPDATE video_sources SET status = ? WHERE domain = ?', ['error', source.domain]);
      return false;
    }
  }
  
  async getSourceByDomain(domain) {
    const [rows] = await this.db.execute('SELECT * FROM video_sources WHERE domain = ?', [domain]);
    return rows[0] || null;
  }
  
  async getAllSources() {
    const [rows] = await this.db.execute('SELECT * FROM video_sources ORDER BY created_at DESC');
    return rows;
  }
  
  async close() {
    if (this.db) await this.db.end();
  }
}

module.exports = VideoSourceDiscovery;
