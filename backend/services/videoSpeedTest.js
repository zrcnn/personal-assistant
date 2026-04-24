/**
 * 视频源速度检测服务
 * 定期检测各视频源的响应速度和可用性
 */

const http = require('http');
const https = require('https');
const url = require('url');

// 测试视频列表（公开的测试视频）
const TEST_VIDEOS = [
  { name: 'Big Buck Bunny', url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4', size: 1000000 },
  { name: 'Sintel', url: 'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4', size: 1000000 },
];

// 视频源速度缓存
const speedCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

// 速度评级标准
const SPEED_THRESHOLDS = {
  excellent: 500,    // <500ms 优秀
  good: 1500,        // <1.5s 良好
  fair: 3000,        // <3s 一般
  slow: 5000,        // <5s 慢
  timeout: 8000      // >8s 超时
};

class VideoSpeedTestService {
  constructor() {
    this.testResults = new Map();
    this.isRunning = false;
    
    // 启动定期检测
    this.startPeriodicTest();
  }
  
  /**
   * 测试单个 URL 的响应速度
   */
  async testUrl(videoUrl, timeout) {
    timeout = timeout || 8000;
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const parsed = url.parse(videoUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      
      const req = client.request({
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.path,
        method: 'HEAD', // 只请求头部，不下载内容
        timeout: timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }, (res) => {
        const latency = Date.now() - startTime;
        resolve({
          success: true,
          latency: latency,
          statusCode: res.statusCode,
          contentLength: parseInt(res.headers['content-length'] || '0'),
          rating: this.getSpeedRating(latency)
        });
      });
      
      req.on('error', (e) => {
        const latency = Date.now() - startTime;
        resolve({
          success: false,
          latency: latency,
          error: e.message,
          rating: 'timeout'
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        const latency = Date.now() - startTime;
        resolve({
          success: false,
          latency: latency,
          error: 'Timeout',
          rating: 'timeout'
        });
      });
      
      req.end();
    });
  }
  
  /**
   * 获取速度评级
   */
  getSpeedRating(latency) {
    if (latency < SPEED_THRESHOLDS.excellent) return 'excellent';
    if (latency < SPEED_THRESHOLDS.good) return 'good';
    if (latency < SPEED_THRESHOLDS.fair) return 'fair';
    if (latency < SPEED_THRESHOLDS.slow) return 'slow';
    return 'timeout';
  }
  
  /**
   * 测试视频源
   */
  async testVideoSource(sourceName, videoUrl) {
    const cacheKey = sourceName + '_' + videoUrl;
    
    // 检查缓存
    if (speedCache.has(cacheKey)) {
      const cached = speedCache.get(cacheKey);
      if (Date.now() - cached.time < CACHE_TTL) {
        return cached.result;
      }
    }
    
    // 执行测试
    const result = await this.testUrl(videoUrl);
    
    // 缓存结果
    speedCache.set(cacheKey, {
      time: Date.now(),
      result: result
    });
    
    // 保存到测试结果
    if (!this.testResults.has(sourceName)) {
      this.testResults.set(sourceName, []);
    }
    this.testResults.get(sourceName).push({
      time: Date.now(),
      ...result
    });
    
    // 限制历史记录
    if (this.testResults.get(sourceName).length > 100) {
      this.testResults.get(sourceName).shift();
    }
    
    return result;
  }
  
  /**
   * 定期检测
   */
  startPeriodicTest() {
    // 每5分钟检测一次
    setInterval(() => {
      this.runAllTests();
    }, 5 * 60 * 1000);
    
    // 启动时立即检测
    setTimeout(() => this.runAllTests(), 2000);
  }
  
  async runAllTests() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log('🎬 开始视频源速度检测...');
    
    const sources = [
      { name: 'test-videos.co.uk', url: TEST_VIDEOS[0].url },
      { name: 'archive.org', url: 'https://archive.org/download/night_of_the_living_dead/Night_of_the_Living_Dead_1939.webm' },
    ];
    
    for (const source of sources) {
      try {
        const result = await this.testVideoSource(source.name, source.url);
        console.log(`  ${source.name}: ${result.latency}ms [${result.rating}]`);
      } catch (e) {
        console.log(`  ${source.name}: 测试失败 - ${e.message}`);
      }
    }
    
    this.isRunning = false;
    console.log('✅ 速度检测完成');
  }
  
  /**
   * 获取视频源速度统计
   */
  getSourceStats(sourceName) {
    const results = this.testResults.get(sourceName) || [];
    if (results.length === 0) {
      return {
        averageLatency: 0,
        successRate: 0,
        rating: 'unknown',
        lastTest: null
      };
    }
    
    const recent = results.slice(-10); // 最近10次
    const avgLatency = recent.reduce((sum, r) => sum + r.latency, 0) / recent.length;
    const successCount = recent.filter(r => r.success).length;
    const successRate = (successCount / recent.length) * 100;
    
    return {
      averageLatency: Math.round(avgLatency),
      successRate: Math.round(successRate),
      rating: this.getSpeedRating(avgLatency),
      lastTest: recent[recent.length - 1]?.time || null
    };
  }
  
  /**
   * 获取所有源的速度统计
   */
  getAllSourceStats() {
    const stats = {};
    for (const [sourceName] of this.testResults) {
      stats[sourceName] = this.getSourceStats(sourceName);
    }
    return stats;
  }
  
  /**
   * 检查视频是否应该被过滤（太慢）
   */
  shouldFilterVideo(videoUrl) {
    // 提取域名
    const parsed = url.parse(videoUrl);
    const domain = parsed.hostname;
    
    if (!domain) return true; // 无法解析则过滤
    
    // 获取该域名的速度统计
    const stats = this.getSourceStats(domain);
    
    // 如果没有数据，不过滤
    if (stats.rating === 'unknown') return false;
    
    // 过滤慢速源
    return stats.rating === 'timeout' || stats.successRate < 50;
  }
  
  /**
   * 清理过期缓存
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of speedCache.entries()) {
      if (now - value.time > CACHE_TTL) {
        speedCache.delete(key);
      }
    }
  }
}

// 单例
let instance = null;

function getSpeedTestService() {
  if (!instance) {
    instance = new VideoSpeedTestService();
  }
  return instance;
}

module.exports = { getSpeedTestService, VideoSpeedTestService };
