#!/usr/bin/env node
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(process.env.HOME || '/root', '.openclaw/agents/main/sessions');

function categorizeProvider(provider, modelId) {
  if (!provider || provider === 'none') return 'other';
  if (provider === 'kat-coder-pro-v2' || provider === 'custom-wanqing-streamlakeapi-com') return 'kat';
  if (provider === 'custom-wanqing' || provider.toLowerCase().includes('wanqing')) return 'kat';
  if (provider === 'claude-code' || provider.toLowerCase().includes('claude')) return 'claude-code';
  if (provider === 'hermes' || provider.toLowerCase().includes('hermes')) return 'hermes';
  if (provider === 'openclaw' || provider.toLowerCase().includes('openclaw')) return 'openclaw';
  return 'other';
}

(async () => {
  const pool = await mysql.createPool({
    host: '127.0.0.1',
    user: 'pa',
    password: 'pa_pass_2026',
    database: 'personal_assistant'
  });
  
  // Check existing records
  const [existing] = await pool.execute('SELECT MAX(timestamp) as max_ts FROM model_usage_records');
  const maxTs = existing[0].max_ts;
  console.log('Last imported timestamp:', maxTs);
  
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.log('Sessions dir not found:', SESSIONS_DIR);
    process.exit(1);
  }
  
  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));
  console.log('Found', files.length, 'session files');
  
  let totalInserted = 0;
  let totalSkipped = 0;
  
  for (const file of files) {
    const filePath = path.join(SESSIONS_DIR, file);
    const sessionId = file.replace('.jsonl', '');
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    
    const batch = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'message' || entry.message?.role !== 'assistant') continue;
        
        const ts = entry.timestamp;
        if (maxTs && ts && new Date(ts) <= new Date(maxTs)) {
          totalSkipped++;
          continue;
        }
        
        const provider = entry.message?.provider || 'custom-wanqing';
        const modelId = entry.message?.model || 'unknown';
        const category = categorizeProvider(provider, modelId);
        const usage = entry.message?.usage;
        
        batch.push([
          sessionId,
          ts ? new Date(ts).toISOString().slice(0, 19).replace('T', ' ') : null,
          provider,
          modelId,
          category,
          usage ? (usage.input || usage.inputTokens || 0) : 0,
          usage ? (usage.output || usage.outputTokens || 0) : 0,
          usage ? (usage.cacheRead || usage.cacheReadTokens || 0) : 0,
          usage ? (usage.cacheWrite || usage.cacheWriteTokens || 0) : 0,
          usage ? (usage.totalTokens || 0) : 0,
          usage ? (typeof usage.cost === 'number' ? usage.cost : (usage.cost?.total || 0)) : 0
        ]);
      } catch (e) {}
    }
    
    if (batch.length > 0) {
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values = batch.flat();
      await pool.execute(
        `INSERT INTO model_usage_records (session_id, timestamp, provider, model_id, category, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, cost) VALUES ${placeholders}`,
        values
      );
      totalInserted += batch.length;
    }
  }
  
  console.log('Inserted:', totalInserted, 'records');
  console.log('Skipped (already imported):', totalSkipped, 'records');
  
  const [count] = await pool.execute('SELECT COUNT(*) as cnt FROM model_usage_records');
  console.log('Total records in DB:', count[0].cnt);
  
  process.exit();
})();
