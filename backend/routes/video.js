const express = require('express');
const router = express.Router();
const { getService, VIDEO_SITES } = require('../services/videoCrawlerService');
const { resolveVideoUrl } = require('../services/videoResolver');
const { getSpeedTestService } = require('../services/videoSpeedTest');

// Auth middleware
const authMiddleware = function(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未提供认证令牌' });
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pa_jwt_secret_2026_ne');
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: '无效令牌' });
  }
};

// ===== VIDEO SEARCH API =====
router.post('/video/search', authMiddleware, async function(req, res) {
  try {
    const query = req.body.query;
    const crawler = await getService();
    const results = await crawler.searchVideos(query || '', req.user.id);
    res.json({ results: results });
  } catch (err) {
    console.error('Video search error:', err);
    res.status(500).json({ error: '搜索失败: ' + err.message });
  }
});

// ===== AVAILABLE SOURCES =====
router.get('/video/sources', authMiddleware, async function(req, res) {
  try {
    const sources = [];
    var key;
    for (key in VIDEO_SITES) {
      sources.push({
        key: key,
        name: VIDEO_SITES[key].name,
        domain: VIDEO_SITES[key].domain,
        types: VIDEO_SITES[key].types.join(', ')
      });
    }
    res.json({ sources: sources });
  } catch (err) {
    console.error('Get sources error:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// ===== TEST SOURCE =====
router.post('/video/sources/test', authMiddleware, async function(req, res) {
  try {
    const siteKey = req.body.site;
    const crawler = await getService();
    const available = await crawler.testSource(siteKey);
    
    res.json({ site: siteKey, available: available });
  } catch (err) {
    console.error('Test source error:', err);
    res.status(500).json({ error: '测试失败' });
  }
});

// ===== POPULAR VIDEOS =====
router.get('/video/popular', authMiddleware, async function(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 30;
    const offset = (page - 1) * pageSize;
    
    const crawler = await getService();
    const results = await crawler.getPopularVideos(page, pageSize);
    
    res.json({
      page: page,
      pageSize: pageSize,
      total: results.total,
      results: results.items
    });
  } catch (err) {
    console.error('Get popular error:', err);
    res.status(500).json({ error: '获取推荐失败' });
  }
});

// ===== HISTORY API =====
router.get('/video/history', authMiddleware, async function(req, res) {
  try {
    const crawler = await getService();
    const history = crawler.getSearchHistory(req.user.id, 30);
    res.json(history);
  } catch (err) {
    console.error('Load history error:', err);
    res.status(500).json({ error: '加载历史记录失败' });
  }
});

router.post('/video/history/progress', authMiddleware, async function(req, res) {
  try {
    // 内存存储，无需持久化
    res.json({ success: true });
  } catch (err) {
    console.error('Save progress error:', err);
    res.status(500).json({ error: '保存进度失败' });
  }
});

// ===== RESOLVE VIDEO URL =====
router.post('/video/resolve', authMiddleware, async function(req, res) {
  try {
    const videoUrl = req.body.url;
    const source = req.body.source;
    
    if (!videoUrl) {
      return res.status(400).json({ error: '缺少视频URL' });
    }
    
    const urls = await resolveVideoUrl(videoUrl, source);
    res.json({ urls: urls });
  } catch (err) {
    console.error('Resolve video error:', err);
    res.status(500).json({ error: '解析失败: ' + err.message });
  }
});

// ===== SEARCH SUGGESTIONS =====
router.get('/video/suggestions', authMiddleware, async function(req, res) {
  try {
    const query = req.query.q || '';
    const crawler = await getService();
    const suggestions = crawler.getSearchSuggestions(query);
    res.json({ suggestions: suggestions });
  } catch (err) {
    console.error('Get suggestions error:', err);
    res.status(500).json({ error: '获取建议失败' });
  }
});

// ===== BROWSE VIDEOS (分页展示) =====
router.get('/video/browse', authMiddleware, async function(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 30;
    const type = req.query.type || '';
    const subGenre = req.query.subGenre || '';
    const quality = req.query.quality || '';
    const year = req.query.year ? parseInt(req.query.year) : 0;
    const sortBy = req.query.sort || 'rating';
    
    const crawler = await getService();
    const results = await crawler.browseVideos({
      page, pageSize, type, subGenre, quality, year, sortBy
    });
    
    res.json(results);
  } catch (err) {
    console.error('Browse videos error:', err);
    res.status(500).json({ error: '浏览失败' });
  }
});

// ===== HISTORY API =====
router.get('/video/history', authMiddleware, async function(req, res) {
  try {
    const crawler = await getService();
    const history = crawler.getSearchHistory(req.user.id, 30);
    res.json(history);
  } catch (err) {
    console.error('Load history error:', err);
    res.status(500).json({ error: '加载历史记录失败' });
  }
});

module.exports = router;
