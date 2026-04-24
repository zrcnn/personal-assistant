/**
 * 播放地址解析器
 * 
 * 从视频播放页提取真实的视频流地址
 */

const http = require('http');
const https = require('https');
const url = require('url');

const VPS_PROXY = process.env.VPS_PROXY_URL || 'http://127.0.0.1:13002';

/**
 * 通过 VPS 代理获取页面内容
 */
async function fetchPage(targetUrl) {
  return new Promise(function(resolve, reject) {
    const proxyUrl = VPS_PROXY + '/fetch?url=' + encodeURIComponent(targetUrl);
    const parsed = url.parse(proxyUrl);
    
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.path,
      method: 'GET',
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
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
 * 提取视频播放地址
 */
function extractVideoUrls(html) {
  const urls = [];
  
  // MP4 直链
  const mp4Regex = /https?:\/\/[^"']+\.mp4[^"']*/gi;
  let match;
  while ((match = mp4Regex.exec(html)) !== null) {
    urls.push({ url: match[0], type: 'mp4', quality: 'HD' });
  }
  
  // M3U8 流
  const m3u8Regex = /https?:\/\/[^"']+\.m3u8[^"']*/gi;
  while ((match = m3u8Regex.exec(html)) !== null) {
    urls.push({ url: match[0], type: 'm3u8', quality: 'HLS' });
  }
  
  // WebM
  const webmRegex = /https?:\/\/[^"']+\.webm[^"']*/gi;
  while ((match = webmRegex.exec(html)) !== null) {
    urls.push({ url: match[0], type: 'webm', quality: 'HD' });
  }
  
  // <video> 标签
  const videoTagRegex = /<video[^>]+src="([^"]+)"/gi;
  while ((match = videoTagRegex.exec(html)) !== null) {
    urls.push({ url: match[1], type: 'video-tag', quality: 'HD' });
  }
  
  // <source> 标签
  const sourceTagRegex = /<source[^>]+src="([^"]+)"/gi;
  while ((match = sourceTagRegex.exec(html)) !== null) {
    urls.push({ url: match[1], type: 'source-tag', quality: 'HD' });
  }
  
  return urls;
}

/**
 * 解析 Archive.org 播放地址
 */
async function resolveArchiveVideo(videoUrl) {
  try {
    const response = await fetchPage(videoUrl);
    const urls = extractVideoUrls(response.data);
    
    // Archive.org 的特殊处理
    if (urls.length === 0) {
      // 尝试从页面提取 <video> 标签
      const videoMatch = response.data.match(/<video[^>]*controls[^>]*>[\s\S]*?<source[^>]+src="([^"]+)"/i);
      if (videoMatch) {
        urls.push({ url: videoMatch[1], type: 'archive-video', quality: 'SD' });
      }
    }
    
    return urls;
  } catch (e) {
    console.error('Resolve archive video failed:', e.message);
    return [];
  }
}

/**
 * 解析 Blender 视频播放地址
 */
async function resolveBlenderVideo(videoUrl) {
  // Blender 视频通常有直接的 MP4 链接
  const directUrls = [
    { url: videoUrl, type: 'direct', quality: 'HD' }
  ];
  return directUrls;
}

/**
 * 通用播放地址解析
 */
async function resolveVideoUrl(videoUrl, source) {
  if (!videoUrl || videoUrl === '#') {
    return [];
  }
  
  try {
    // 如果已经是直接视频链接
    if (/\.(mp4|webm|mkv|mov|avi)($|\?)/i.test(videoUrl)) {
      return [{ url: videoUrl, type: 'direct', quality: 'HD' }];
    }
    
    // Archive.org
    if (videoUrl.includes('archive.org')) {
      return await resolveArchiveVideo(videoUrl);
    }
    
    // 其他网站 - 通过 VPS 代理获取页面并提取
    const response = await fetchPage(videoUrl);
    const urls = extractVideoUrls(response.data);
    
    return urls;
  } catch (e) {
    console.error('Resolve video failed:', e.message);
    return [];
  }
}

/**
 * 测试视频链接是否可播放
 */
async function testVideoPlayable(videoUrl) {
  return new Promise(function(resolve) {
    const parsed = url.parse(videoUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    
    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname,
      method: 'HEAD',
      timeout: 10000
    }, function(res) {
      resolve(res.statusCode === 200);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

module.exports = {
  resolveVideoUrl,
  resolveArchiveVideo,
  resolveBlenderVideo,
  testVideoPlayable,
  extractVideoUrls
};
