#!/usr/bin/env node
/**
 * 迁移脚本：为历史数据建立待办与日程的关联
 *
 * 逻辑：
 * 1. 遍历 tool_events 中 title 以 "✅ 完成：" 开头的记录
 * 2. 从标题中提取原始待办标题（去掉 "✅ 完成：" 前缀）
 * 3. 在 todos 表中查找匹配的标题
 * 4. 如果找到且 todo_id 为空，则更新关联
 *
 * 用法：node scripts/migrate-todo-events.js
 * 需要设置 DATABASE_URL 环境变量或在同机器上运行（使用默认配置）
 */

const mysql = require('mysql2/promise');

// 从环境变量或默认配置读取数据库连接
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'personal_assistant',
};

async function migrate() {
  console.log('[Migrate] Connecting to database...', dbConfig.host);

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('[Migrate] Connected.');

    // 1. 查询所有以 "✅ 完成：" 开头且 todo_id 为空的 event
    const [events] = await connection.execute(`
      SELECT id, user_id, title
      FROM tool_events
      WHERE title LIKE '✅ 完成：%' AND todo_id IS NULL
    `);

    console.log(`[Migrate] Found ${events.length} events to migrate.`);

    let matched = 0;
    let notFound = 0;
    let conflict = 0;

    for (const event of events) {
      // 2. 提取原始待办标题
      const originalTitle = event.title.replace('✅ 完成：', '');

      // 3. 在 todos 表中查找匹配的标题和用户
      const [todos] = await connection.execute(
        'SELECT id FROM todos WHERE title = ? AND user_id = ? LIMIT 1',
        [originalTitle, event.user_id]
      );

      if (todos.length > 0) {
        const todoId = todos[0].id;

        // 4. 检查该 todo 是否已经关联了其他 event（避免一个 todo 关联多个 event）
        const [existingLinks] = await connection.execute(
          'SELECT id FROM tool_events WHERE todo_id = ? AND id != ?',
          [todoId, event.id]
        );

        if (existingLinks.length > 0) {
          // 该 todo 已经有其他关联的 event，跳过
          conflict++;
          console.log(`  [Skip] Event #${event.id} "${event.title}" — todo #${todoId} already linked to event #${existingLinks[0].id}`);
          continue;
        }

        // 5. 更新关联
        await connection.execute(
          'UPDATE tool_events SET todo_id = ? WHERE id = ?',
          [todoId, event.id]
        );
        matched++;
        console.log(`  [OK] Event #${event.id} "${event.title}" → todo #${todoId}`);
      } else {
        notFound++;
        console.log(`  [??] Event #${event.id} "${event.title}" — no matching todo found`);
      }
    }

    console.log('\n[Migrate] Done!');
    console.log(`  Matched: ${matched}`);
    console.log(`  Not found: ${notFound}`);
    console.log(`  Conflicts (todo already linked): ${conflict}`);

  } catch (err) {
    console.error('[Migrate] Error:', err);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

migrate();
