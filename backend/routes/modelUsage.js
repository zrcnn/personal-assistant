const express = require('express');
const fs = require('fs');
const path = require('path');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

const SESSIONS_DIR = path.join(process.env.HOME || '/root', '.openclaw/agents/main/sessions');

// Provider category mapping
function categorizeProvider(provider, modelId) {
  if (provider === 'kat-coder-pro-v2' || provider === 'custom-wanqing-streamlakeapi-com') return 'kat-coder';
  if (provider === 'none') return 'system';
  return 'other';
}

const CATEGORY_LABELS = {
  'kat-coder': { name: 'KAT-Coder 模型', color: '#6c5ce7', icon: '🟣' },
  system: { name: '系统', color: '#636e72', icon: '⚙️' },
  other: { name: '其他', color: '#dfe6e9', icon: '⚪' }
};

// GET /api/model-usage
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const stats = {
      categories: {},
      models: {},
      totalRequests: 0,
      totalSessions: 0,
      period: { from: null, to: null },
      recentSessions: []
    };

    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));
    stats.totalSessions = files.length;

    for (const file of files) {
      const filePath = path.join(SESSIONS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean);

      let sessionModelChanges = {};
      let lastProvider = null;
      let lastModelId = null;
      let requestCount = 0;
      let sessionTime = null;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const ts = entry.timestamp;

          if (ts) {
            const t = new Date(ts);
            if (!stats.period.from || t < new Date(stats.period.from)) stats.period.from = ts;
            if (!stats.period.to || t > new Date(stats.period.to)) stats.period.to = ts;
            if (!sessionTime) sessionTime = ts;
          }

          if (entry.type === 'model_change') {
            const provider = entry.provider || 'none';
            const modelId = entry.modelId || 'unknown';
            const key = `${provider}:${modelId}`;
            sessionModelChanges[key] = (sessionModelChanges[key] || 0) + 1;
            lastProvider = provider;
            lastModelId = modelId;
          }

          // Count assistant messages as requests
          if (entry.type === 'message' && entry.message?.role === 'assistant') {
            // 优先使用 message 自身的 provider/model，fallback 到最近的 model_change
            const provider = entry.message?.provider || lastProvider || 'none';
            const modelId = entry.message?.model || lastModelId || 'unknown';
            // 更新 lastProvider/lastModelId 供后续使用
            if (entry.message?.provider) lastProvider = entry.message.provider;
            if (entry.message?.model) lastModelId = entry.message.model;
            requestCount++;
            stats.totalRequests++;

            const cat = categorizeProvider(provider, modelId);
            if (!stats.categories[cat]) {
              stats.categories[cat] = { ...CATEGORY_LABELS[cat], requests: 0, models: {} };
            }
            stats.categories[cat].requests++;

            const modelKey = `${provider}/${modelId}`;
            if (!stats.models[modelKey]) {
              stats.models[modelKey] = {
                provider, modelId, category: cat,
                requests: 0, name: modelKey
              };
            }
            stats.models[modelKey].requests++;

            if (!stats.categories[cat].models[modelKey]) {
              stats.categories[cat].models[modelKey] = { ...stats.models[modelKey] };
            }
            stats.categories[cat].models[modelKey].requests++;
          }
        } catch {}
      }

      // Track recent sessions (by file mtime)
      if (requestCount > 0) {
        stats.recentSessions.push({
          id: file.replace('.jsonl', ''),
          requests: requestCount,
          lastActivity: sessionTime
        });
      }
    }

    // Sort recent sessions by time desc, keep top 20
    stats.recentSessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    stats.recentSessions = stats.recentSessions.slice(0, 20);



    // Calculate percentages
    for (const cat of Object.values(stats.categories)) {
      cat.percentage = stats.totalRequests > 0
        ? Math.round((cat.requests / stats.totalRequests) * 100)
        : 0;
    }

    res.json(stats);
  } catch (err) {
    console.error('[ModelUsage] Get error:', err);
    res.status(500).json({ error: '获取模型用量失败' });
  }
});

module.exports = router;
