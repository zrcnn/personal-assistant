const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'pa',
  password: process.env.DB_PASSWORD || 'your_password_here',
  database: process.env.DB_NAME || 'personal_assistant',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+00:00'
});

// Auto-create tables on startup
async function ensureTables() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      avatar VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) DEFAULT '新对话',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      role ENUM('user','assistant','system') NOT NULL DEFAULT 'user',
      content TEXT NOT NULL,
      tokens INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      INDEX idx_conversation_id (conversation_id),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INT PRIMARY KEY,
      theme VARCHAR(20) DEFAULT 'dark',
      settings_json JSON,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // User messaging tables (user-to-user chat)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user1_id INT NOT NULL,
      user2_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE INDEX idx_users (user1_id, user2_id),
      INDEX idx_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      sender_id INT NOT NULL,
      content TEXT NOT NULL,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES user_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_conversation_id (conversation_id),
      INDEX idx_sender_read (conversation_id, sender_id, read_at),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Group chat tables
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS group_chats (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      avatar VARCHAR(500),
      creator_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS group_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT NOT NULL,
      user_id INT NOT NULL,
      role ENUM('owner','admin','member') DEFAULT 'member',
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES group_chats(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE INDEX idx_group_user (group_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS group_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT NOT NULL,
      sender_id INT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES group_chats(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_group_created (group_id, created_at),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS group_message_read (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT NOT NULL,
      user_id INT NOT NULL,
      message_id INT NOT NULL,
      read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE INDEX idx_group_user_msg (group_id, user_id, message_id),
      FOREIGN KEY (group_id) REFERENCES group_chats(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES group_messages(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Ensure NE bot user exists
  await pool.execute(`
    INSERT IGNORE INTO users (id, username, password_hash, avatar)
    VALUES (999999, 'NE', 'bot_account_no_login', '/avatars/ne-bot.png')
  `);

  // ===== New tables for enhanced messaging =====

  // User notes (remarks and blocking)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_notes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      target_user_id INT NOT NULL,
      remark_name VARCHAR(100) DEFAULT NULL,
      remark_description TEXT DEFAULT NULL,
      is_blocked TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE INDEX idx_user_target (user_id, target_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Private chat message attachments
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS message_attachments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      message_id INT NOT NULL,
      message_type ENUM('user','group') NOT NULL,
      file_type VARCHAR(50) NOT NULL DEFAULT 'image',
      file_path VARCHAR(500) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      file_size INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_cleanup (created_at),
      FOREIGN KEY (message_id) REFERENCES user_messages(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Group chat message attachments
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS group_message_attachments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      message_id INT NOT NULL,
      message_type ENUM('user','group') NOT NULL,
      file_type VARCHAR(50) NOT NULL DEFAULT 'image',
      file_path VARCHAR(500) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      file_size INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_cleanup (created_at),
      FOREIGN KEY (message_id) REFERENCES group_messages(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Add message_type and attachment_id to user_messages (ignore errors if columns exist)
  try {
    await pool.execute(`
      ALTER TABLE user_messages
      ADD COLUMN message_type ENUM('text','image') DEFAULT 'text' AFTER content,
      ADD COLUMN attachment_id INT NULL AFTER message_type
    `);
  } catch (e) { /* column may already exist */ }

  // Add message_type and attachment_id to group_messages
  try {
    await pool.execute(`
      ALTER TABLE group_messages
      ADD COLUMN message_type ENUM('text','image') DEFAULT 'text' AFTER content,
      ADD COLUMN attachment_id INT NULL AFTER message_type
    `);
  } catch (e) { /* column may already exist */ }

  // ===== Test Case Generator Tables =====

  // Products table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(200) NOT NULL,
      description TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Requirements table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS requirements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      user_id INT NOT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT DEFAULT NULL,
      type ENUM('functional','non-functional','ui','performance','security','compatibility') DEFAULT 'functional',
      priority ENUM('high','medium','low') DEFAULT 'medium',
      ai_validated TINYINT(1) DEFAULT 0,
      ai_validation_result TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_product_id (product_id),
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Test cases table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS test_cases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requirement_id INT NOT NULL,
      product_id INT NOT NULL,
      user_id INT NOT NULL,
      case_id VARCHAR(100) DEFAULT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT DEFAULT NULL,
      preconditions TEXT DEFAULT NULL,
      steps TEXT DEFAULT NULL,
      expected_result TEXT DEFAULT NULL,
      priority ENUM('high','medium','low') DEFAULT 'medium',
      type ENUM('functional','regression','smoke','integration','unit','acceptance') DEFAULT 'functional',
      ai_generated TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_requirement_id (requirement_id),
      INDEX idx_product_id (product_id),
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.log('[DB] Tables ensured.');
}

module.exports = { pool, ensureTables };
