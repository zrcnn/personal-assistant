#!/usr/bin/env node
const mysql = require('mysql2/promise');

(async () => {
  const pool = await mysql.createPool({
    host: '127.0.0.1',
    user: 'pa',
    password: 'pa_pass_2026',
    database: 'personal_assistant'
  });
  
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS model_usage_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      session_id VARCHAR(100) DEFAULT NULL,
      timestamp DATETIME(3) DEFAULT NULL,
      provider VARCHAR(100) DEFAULT NULL,
      model_id VARCHAR(200) DEFAULT NULL,
      category VARCHAR(50) DEFAULT NULL,
      input_tokens INT DEFAULT 0,
      output_tokens INT DEFAULT 0,
      cache_read_tokens INT DEFAULT 0,
      cache_write_tokens INT DEFAULT 0,
      total_tokens INT DEFAULT 0,
      cost DECIMAL(10,6) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_timestamp (timestamp),
      INDEX idx_category (category),
      INDEX idx_session (session_id),
      INDEX idx_provider (provider(50))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  
  console.log('Table model_usage_records created.');
  
  const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM model_usage_records');
  console.log('Current records:', rows[0].cnt);
  
  process.exit();
})();
