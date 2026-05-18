#!/usr/bin/env node
// migrate_model_usage_api.js
// Updates modelUsage.js to read from database instead of filesystem

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../routes/modelUsage.js');
let content = fs.readFileSync(filePath, 'utf8');

// Add db pool import after existing imports
const dbImport = `const { pool: dbPool } = require('../config/db');\n`;
content = content.replace(
  "const { authMiddleware, adminOnly } = require('../middleware/auth');",
  `const { authMiddleware, adminOnly } = require('../middleware/auth');
const { pool: dbPool } = require('../config/db');`
);

// Replace categorizeProvider to use 'kat' consistently
content = content.replace(
  /if \(provider === 'kat-coder-pro-v2' \|\| provider === 'custom-wanqing-streamlakeapi-com'\) return 'kat';\n  if \(provider === 'custom-wanqing' \|\| provider\.toLowerCase\(\)\.includes\('wanqing'\)\) return 'kat';/,
  `if (provider === 'kat-coder-pro-v2' || provider === 'custom-wanqing-streamlakeapi-com') return 'kat';
  if (provider === 'custom-wanqing' || provider.toLowerCase().includes('wanqing')) return 'kat';`
);

// Replace the entire GET /api/model-usage handler
const oldHandlerStart = '// ── GET /api/model-usage ────────────────────────────────────────────';
const oldHandlerEnd = "    res.json(stats);\n\n  } catch (err) {";

const newHandler = `// ── GET /api/model-usage ────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  console.log('[ModelUsage API] group=' + req.query.group);
  try {
    const group = req.query.group || 'day';
    
    // Determine date range based on group
    const now = new Date();
    let cutoffDate;
    if (group === 'day') {
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (group === 'week') {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    } else if (group === 'month') {
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (group === 'year') {
      cutoffDate = new Date(now.getFullYear(), 0, 1);
    }
    
    // Build SQL query
    let whereClause = 'WHERE 1=1';
    let params = [];
    if (cutoffDate) {
      whereClause += ' AND timestamp >= ?';
      params.push(cutoffDate);
    }
    
    // Get total requests (all time, not filtered by date)
    const [totalRows] = await dbPool.execute(
      'SELECT COUNT(*) as cnt, COALESCE(SUM(input_tokens),0) as totalInput, COALESCE(SUM(output_tokens),0) as totalOutput, COALESCE(SUM(cache_read_tokens),0) as totalCacheRead, COALESCE(SUM(cache_write_tokens),0) as totalCacheWrite, COALESCE(SUM(total_tokens),0) as totalTokens, COALESCE(SUM(cost),0) as totalCost FROM model_usage_records'
    );
    const totalRequestsAllTime = totalRows[0].cnt;
    
    // Get filtered stats
    const [filteredRows] = await dbPool.execute(
      \`SELECT 
        COUNT(*) as totalRequests,
        COALESCE(SUM(input_tokens),0) as totalInput,
        COALESCE(SUM(output_tokens),0) as totalOutput,
        COALESCE(SUM(cache_read_tokens),0) as totalCacheRead,
        COALESCE(SUM(cache_write_tokens),0) as totalCacheWrite,
        COALESCE(SUM(total_tokens),0) as totalTokens,
        COALESCE(SUM(cost),0) as totalCost
      FROM model_usage_records \${whereClause}\`,
      params
    );
    
    const totalRequests = filteredRows[0].totalRequests;
    
    // Get category breakdown
    const [catRows] = await dbPool.execute(
      \`SELECT category, provider, model_id, 
        COUNT(*) as requests,
        SUM(input_tokens) as inputTokens,
        SUM(output_tokens) as outputTokens,
        SUM(cache_read_tokens) as cacheReadTokens,
        SUM(cache_write_tokens) as cacheWriteTokens,
        SUM(total_tokens) as totalTokens,
        SUM(cost) as cost
      FROM model_usage_records \${whereClause}
      GROUP BY category, provider, model_id
      ORDER BY requests DESC\`,
      params
    );
    
    // Build stats from DB data
    const stats = {
      categories: {},
      models: {},
      tokenSummary: {
        totalInput: filteredRows[0].totalInput,
        totalOutput: filteredRows[0].totalOutput,
        totalCacheRead: filteredRows[0].totalCacheRead,
        totalCacheWrite: filteredRows[0].totalCacheWrite,
        totalTokens: filteredRows[0].totalTokens,
        totalCost: filteredRows[0].totalCost
      },
      callSummary: {
        totalCalls: totalRequests,
        byCategory: {}
      },
      totalRequests: totalRequestsAllTime,
      totalRequestsFiltered: totalRequests,
      totalSessions: 0,
      period: { from: null, to: null },
      recentSessions: [],
      timeSeries: [],
      group: group
    };
    
    // Get session count
    const [sessRows] = await dbPool.execute(
      \`SELECT COUNT(DISTINCT session_id) as cnt FROM model_usage_records \${whereClause}\`,
      params
    );
    stats.totalSessions = sessRows[0].cnt;
    
    // Get period
    const [periodRows] = await dbPool.execute(
      \`SELECT MIN(timestamp) as minTs, MAX(timestamp) as maxTs FROM model_usage_records \${whereClause}\`,
      params
    );
    if (periodRows[0].minTs) stats.period.from = periodRows[0].minTs.toISOString();
    if (periodRows[0].maxTs) stats.period.to = periodRows[0].maxTs.toISOString();
    
    // Process category data
    for (const row of catRows) {
      const cat = row.category;
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
      stats.categories[cat].requests += row.requests;
      stats.categories[cat].inputTokens += row.inputTokens || 0;
      stats.categories[cat].outputTokens += row.outputTokens || 0;
      stats.categories[cat].cacheReadTokens += row.cacheReadTokens || 0;
      stats.categories[cat].cacheWriteTokens += row.cacheWriteTokens || 0;
      stats.categories[cat].totalTokens += row.totalTokens || 0;
      stats.categories[cat].cost += row.cost || 0;
      
      const modelKey = row.model_id;
      stats.categories[cat].models[modelKey] = {
        provider: row.provider,
        modelId: row.model_id,
        category: cat,
        requests: row.requests,
        inputTokens: row.inputTokens || 0,
        outputTokens: row.outputTokens || 0,
        cacheReadTokens: row.cacheReadTokens || 0,
        cacheWriteTokens: row.cacheWriteTokens || 0,
        totalTokens: row.totalTokens || 0,
        cost: row.cost || 0,
        name: modelKey
      };
      
      // Accumulate model-level stats
      if (!stats.models[modelKey]) {
        stats.models[modelKey] = { requests: 0, category: cat };
      }
      stats.models[modelKey].requests += row.requests;
    }
    
    // Get time series data
    const bucketExpr = group === 'day'
      ? 'DATE(timestamp)'
      : group === 'week'
      ? \`CONCAT(YEAR(timestamp), '-W', LPAD(WEEK(timestamp, 3), 2, '0'))\`
      : group === 'month'
      ? 'DATE_FORMAT(timestamp, \'%Y-%m\')'
      : 'YEAR(timestamp)';
    
    const [tsRows] = await dbPool.execute(
      \`SELECT \${bucketExpr} as bucket, category, COUNT(*) as requests
      FROM model_usage_records \${whereClause}
      GROUP BY bucket, category
      ORDER BY bucket\`,
      params
    );
    
    stats.timeSeries = tsRows.map(row => ({
      bucket: row.bucket,
      categories: { [row.category]: row.requests }
    }));
    
    // Get recent sessions
    const [recentRows] = await dbPool.execute(
      \`SELECT session_id, COUNT(*) as requests, MAX(timestamp) as lastActivity
      FROM model_usage_records \${whereClause}
      GROUP BY session_id
      ORDER BY lastActivity DESC
      LIMIT 20\`,
      params
    );
    stats.recentSessions = recentRows.map(row => ({
      id: row.session_id,
      requests: row.requests,
      lastActivity: row.lastActivity ? row.lastActivity.toISOString() : null
    }));
    
    // Calculate percentages
    for (const [catKey, cat] of Object.entries(stats.categories)) {
      stats.callSummary.byCategory[catKey] = cat.requests;
      cat.percentage = totalRequestsAllTime > 0
        ? Math.round((cat.requests / totalRequestsAllTime) * 100)
        : 0;
    }
    
    res.json(stats);

  } catch (err) {`;

content = content.replace(
  content.substring(content.indexOf(oldHandlerStart), content.indexOf(oldHandlerEnd) + oldHandlerEnd.length),
  newHandler
);

fs.writeFileSync(filePath, content);
console.log('modelUsage.js updated to read from database.');
