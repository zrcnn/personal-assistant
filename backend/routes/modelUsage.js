const express = require('express');
const fs = require('fs');
const path = require('path');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

const SESSIONS_DIR = path.join(process.env.HOME || '/root', '.openclaw/agents/main/sessions');

// ── Provider Category Mapping ────────────────────────────────────────
function categorizeProvider(provider, modelId) {
  if (provider === 'kat-coder-pro-v2' || provider === 'custom-wanqing-streamlakeapi-com') return 'kat-coder';
  if (provider === 'none') return 'system';
  if (provider === 'claude-code' || provider?.toLowerCase().includes('claude')) return 'claude-code';
  if (provider === 'hermes' || provider?.toLowerCase().includes('hermes')) return 'hermes';
  if (provider === 'openclaw' || provider?.toLowerCase().includes('openclaw')) return 'openclaw';
  return 'other';
}

const CATEGORY_LABELS = {
  'kat-coder': { name: 'KAT-Coder 模型', color: '#6c5ce7', icon: '🟣' },
  'claude-code': { name: 'Claude Code', color: '#d97706', icon: '🟠' },
  'hermes': { name: 'Hermes Agent', color: '#059669', icon: '🟢' },
  'openclaw': { name: 'OpenClaw', color: '#7c3aed', icon: '🟣' },
  'system': { name: '系统', color: '#636e72', icon: '⚙️' },
  'other': { name: '其他', color: '#dfe6e9', icon: '⚪' }
};

// ── Time bucket helpers ──────────────────────────────────────────────
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d) {
  // Week starts on Monday
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}

function bucketKey(dateStr, group) {
  console.log('[bucketKey] dateStr=' + dateStr + ', group=' + group);
  const d = new Date(dateStr);
  if (group === 'year') {
    return `${d.getFullYear()}`;
  }
  if (group === 'week') {
    const s = startOfWeek(d);
    return `${s.getFullYear()}-W${Math.ceil(((d - startOfYear(s)) / 86400000 + 1) / 7).toString().padStart(2, '0')}`;
  }
  if (group === 'month') {
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  }
  // day (default)
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function formatBucketLabel(key, group) {
  if (group === 'year') {
    return key; // e.g. "2026"
  }
  if (group === 'week') {
    return key; // e.g. "2026-W04"
  }
  if (group === 'month') {
    return key; // e.g. "2026-04"
  }
  // day: show MM-DD
  const parts = key.split('-');
  return `${parts[1]}-${parts[2]}`;
}

// ── Parse a single session file, return structured entries ───────────
function parseSessionFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  const entries = [];
  let lastProvider = null;
  let lastModelId = null;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'model_change') {
        lastProvider = entry.provider || 'none';
        lastModelId = entry.modelId || 'unknown';
      }
      if (entry.type === 'message' && entry.message?.role === 'assistant') {
        const provider = entry.message?.provider || lastProvider || 'none';
        const modelId = entry.message?.model || lastModelId || 'unknown';
        if (entry.message?.provider) lastProvider = entry.message.provider;
        if (entry.message?.model) lastModelId = entry.message.model;

        const usage = entry.message?.usage;
        entries.push({
          timestamp: entry.timestamp,
          provider,
          modelId,
          category: categorizeProvider(provider, modelId),
          inputTokens: usage ? (usage.input || usage.inputTokens || 0) : 0,
          outputTokens: usage ? (usage.output || usage.outputTokens || 0) : 0,
          cacheReadTokens: usage ? (usage.cacheRead || usage.cacheReadTokens || 0) : 0,
          cacheWriteTokens: usage ? (usage.cacheWrite || usage.cacheWriteTokens || 0) : 0,
          totalTokens: usage ? (usage.totalTokens || 0) : 0,
          cost: usage ? (typeof usage.cost === 'number' ? usage.cost : (usage.cost?.total || 0)) : 0
        });
      }
    } catch {}
  }

  return entries;
}

// ── Aggregate entries into time buckets ──────────────────────────────
function aggregateByTime(entries, group) {
  const buckets = {}; // key -> { categories: { catKey: {requests, inputTokens, ...} }, totalRequests }

  for (const e of entries) {
    if (!e.timestamp) continue;
    const key = bucketKey(e.timestamp, group);
    if (!buckets[key]) {
      buckets[key] = {
        key,
        label: formatBucketLabel(key, group),
        totalRequests: 0,
        categories: {}
      };
    }
    const b = buckets[key];
    b.totalRequests++;

    if (!b.categories[e.category]) {
      b.categories[e.category] = {
        requests: 0, inputTokens: 0, outputTokens: 0,
        cacheReadTokens: 0, cacheWriteTokens: 0,
        totalTokens: 0, cost: 0
      };
    }
    const c = b.categories[e.category];
    c.requests++;
    c.inputTokens += e.inputTokens;
    c.outputTokens += e.outputTokens;
    c.cacheReadTokens += e.cacheReadTokens;
    c.cacheWriteTokens += e.cacheWriteTokens;
    c.totalTokens += e.totalTokens;
    c.cost += e.cost;
  }

  // Build final array with flattened totals for frontend compatibility
  return Object.values(buckets)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(bucket => {
      // Flatten totals across all categories
      let totalRequests = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCacheReadTokens = 0;
      let totalCacheWriteTokens = 0;
      let totalCost = 0;

      for (const cat of Object.values(bucket.categories)) {
        totalRequests += cat.requests;
        totalInputTokens += cat.inputTokens;
        totalOutputTokens += cat.outputTokens;
        totalCacheReadTokens += cat.cacheReadTokens;
        totalCacheWriteTokens += cat.cacheWriteTokens;
        totalCost += cat.cost;
      }

      return {
        period: bucket.key,        // alias for frontend compatibility
        key: bucket.key,
        label: bucket.label,
        requests: totalRequests,
        totalRequests,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens: totalCacheReadTokens,
        cacheWriteTokens: totalCacheWriteTokens,
        cost: totalCost,
        categories: bucket.categories
      };
    });
}

// ── GET /api/model-usage ────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  console.log('[ModelUsage API] group=' + req.query.group);
  try {
    const group = req.query.group || 'day'; // 'day' | 'week' | 'month'
    
    // Determine date range based on group
    const now = new Date();
    let cutoffDate;
    if (group === 'day') {
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // today 00:00
    } else if (group === 'week') {
      // Start of current week (Monday)
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    } else if (group === 'month') {
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
    } else if (group === 'year') {
      cutoffDate = new Date(now.getFullYear(), 0, 1); // Jan 1 of current year
    } else {
      cutoffDate = null;
    }
    
    const stats = {
      categories: {},
      models: {},
      tokenSummary: {
        totalInput: 0,
        totalOutput: 0,
        totalCacheRead: 0,
        totalCacheWrite: 0,
        totalTokens: 0,
        totalCost: 0
      },
      callSummary: {
        totalCalls: 0,
        byCategory: {}
      },
      totalRequests: 0,
      totalSessions: 0,
      period: { from: null, to: null },
      recentSessions: [],
      timeSeries: [],  // NEW: time-bucketed data
      group: group      // echo back the grouping
    };

    if (!fs.existsSync(SESSIONS_DIR)) {
      return res.json(stats);
    }

    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));
    stats.totalSessions = files.length;

    // Collect all entries first for time-series aggregation
    const allEntries = [];

    for (const file of files) {
      const filePath = path.join(SESSIONS_DIR, file);
      const entries = parseSessionFile(filePath);
      allEntries.push(...entries);

      // Also compute per-session stats for recentSessions
      let requestCount = 0;
      let sessionTime = null;
      for (const e of entries) {
        // Filter by date range based on group
        if (cutoffDate && e.timestamp) {
          const entryDate = new Date(e.timestamp);
          if (entryDate < cutoffDate) continue; // skip entries outside the current period
        }
        
        requestCount++;
        if (e.timestamp) {
          const t = new Date(e.timestamp);
          if (!stats.period.from || t < new Date(stats.period.from)) stats.period.from = e.timestamp;
          if (!stats.period.to || t > new Date(stats.period.to)) stats.period.to = e.timestamp;
          if (!sessionTime) sessionTime = e.timestamp;
        }

        // Aggregate totals
        const cat = e.category;
        if (!stats.categories[cat]) {
          stats.categories[cat] = {
            ...CATEGORY_LABELS[cat],
            requests: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 0,
            cost: 0,
            models: {}
          };
        }
        stats.categories[cat].requests++;
        stats.categories[cat].inputTokens += e.inputTokens;
        stats.categories[cat].outputTokens += e.outputTokens;
        stats.categories[cat].cacheReadTokens += e.cacheReadTokens;
        stats.categories[cat].cacheWriteTokens += e.cacheWriteTokens;
        stats.categories[cat].totalTokens += e.totalTokens;
        stats.categories[cat].cost += e.cost;

        stats.tokenSummary.totalInput += e.inputTokens;
        stats.tokenSummary.totalOutput += e.outputTokens;
        stats.tokenSummary.totalCacheRead += e.cacheReadTokens;
        stats.tokenSummary.totalCacheWrite += e.cacheWriteTokens;
        stats.tokenSummary.totalTokens += e.totalTokens;
        stats.tokenSummary.totalCost += e.cost;

        // Per-model stats
        const modelKey = `${e.provider}/${e.modelId}`;
        if (!stats.models[modelKey]) {
          stats.models[modelKey] = {
            provider: e.provider, modelId: e.modelId, category: cat,
            requests: 0,
            inputTokens: 0, outputTokens: 0,
            cacheReadTokens: 0, cacheWriteTokens: 0,
            totalTokens: 0, cost: 0,
            name: modelKey
          };
        }
        const m = stats.models[modelKey];
        m.requests++;
        m.inputTokens += e.inputTokens;
        m.outputTokens += e.outputTokens;
        m.cacheReadTokens += e.cacheReadTokens;
        m.cacheWriteTokens += e.cacheWriteTokens;
        m.totalTokens += e.totalTokens;
        m.cost += e.cost;

        if (!stats.categories[cat].models[modelKey]) {
          stats.categories[cat].models[modelKey] = { ...m };
        }
        stats.categories[cat].models[modelKey].requests++;
      }

      if (requestCount > 0) {
        stats.recentSessions.push({
          id: file.replace('.jsonl', ''),
          requests: requestCount,
          lastActivity: sessionTime
        });
      }
    }

    stats.totalRequests = allEntries.length;

    // Time series aggregation
    stats.timeSeries = aggregateByTime(allEntries, group);

    stats.recentSessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    stats.recentSessions = stats.recentSessions.slice(0, 20);

    for (const [catKey, cat] of Object.entries(stats.categories)) {
      stats.callSummary.byCategory[catKey] = cat.requests;
      cat.percentage = stats.totalRequests > 0
        ? Math.round((cat.requests / stats.totalRequests) * 100)
        : 0;
    }
    stats.callSummary.totalCalls = stats.totalRequests;

    res.json(stats);
  } catch (err) {
    console.error('[ModelUsage] Get error:', err);
    res.status(500).json({ error: '获取模型用量失败' });
  }
});

module.exports = router;
