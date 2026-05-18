const express = require('express');
const { spawn } = require('child_process');
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// OpenClaw Gateway config
const OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:18789';
const OPENCLAW_AUTH_TOKEN = 'zrc837303';

// GET /api/test-case/products — 获取当前用户的所有产品列表，按 created_at DESC 排序
router.get('/products', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[TestCase] GET products error:', err);
    res.status(500).json({ error: '获取产品列表失败' });
  }
});

// POST /api/test-case/products — 创建产品
router.post('/products', authMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '产品名称不能为空' });
    }
    const [result] = await pool.execute(
      'INSERT INTO products (user_id, name, description) VALUES (?, ?, ?)',
      [req.user.id, name.trim(), description || null]
    );
    const [rows] = await pool.execute(
      'SELECT * FROM products WHERE id = ?',
      [result.insertId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[TestCase] POST product error:', err);
    res.status(500).json({ error: '创建产品失败' });
  }
});

// PUT /api/test-case/products/:id — 更新产品
router.put('/products/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    // 验证产品属于当前用户
    const [existing] = await pool.execute(
      'SELECT * FROM products WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '产品不存在' });
    }

    await pool.execute(
      'UPDATE products SET name = ?, description = ? WHERE id = ? AND user_id = ?',
      [
        name !== undefined ? name.trim() : existing[0].name,
        description !== undefined ? (description || null) : existing[0].description,
        id,
        req.user.id
      ]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[TestCase] PUT product error:', err);
    res.status(500).json({ error: '更新产品失败' });
  }
});

// DELETE /api/test-case/products/:id — 删除产品
router.delete('/products/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute(
      'DELETE FROM products WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '产品不存在' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[TestCase] DELETE product error:', err);
    res.status(500).json({ error: '删除产品失败' });
  }
});

// ==================== 需求管理路由 ====================

// GET /api/test-case/requirements — 获取需求列表，支持 ?product_id=xxx 筛选，按 created_at DESC 排序
router.get('/requirements', authMiddleware, async (req, res) => {
  try {
    const { product_id } = req.query;
    let sql = `
      SELECT * FROM requirements
      WHERE user_id = ?
    `;
    const params = [req.user.id];

    if (product_id) {
      sql += ' AND product_id = ?';
      params.push(product_id);
    }

    sql += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[TestCase] GET requirements error:', err);
    res.status(500).json({ error: '获取需求列表失败' });
  }
});

// POST /api/test-case/requirements — 创建需求
router.post('/requirements', authMiddleware, async (req, res) => {
  try {
    const { product_id, title, description, type, priority } = req.body;

    // 验证必填字段
    if (!title || !title.trim()) {
      return res.status(400).json({ error: '需求标题不能为空' });
    }
    if (!product_id) {
      return res.status(400).json({ error: '产品 ID 不能为空' });
    }

    // 验证产品属于当前用户
    const [products] = await pool.execute(
      'SELECT id FROM products WHERE id = ? AND user_id = ?',
      [product_id, req.user.id]
    );
    if (products.length === 0) {
      return res.status(403).json({ error: '产品不存在或无权访问' });
    }

    const [result] = await pool.execute(
      `INSERT INTO requirements (user_id, product_id, title, description, type, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, product_id, title.trim(), description || null, type || null, priority || null]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM requirements WHERE id = ?',
      [result.insertId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[TestCase] POST requirement error:', err);
    res.status(500).json({ error: '创建需求失败' });
  }
});

// PUT /api/test-case/requirements/:id — 更新需求
router.put('/requirements/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, type, priority } = req.body;

    // 验证需求属于当前用户
    const [existing] = await pool.execute(
      'SELECT * FROM requirements WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '需求不存在' });
    }

    await pool.execute(
      `UPDATE requirements
       SET title = ?, description = ?, type = ?, priority = ?
       WHERE id = ? AND user_id = ?`,
      [
        title !== undefined ? title.trim() : existing[0].title,
        description !== undefined ? (description || null) : existing[0].description,
        type !== undefined ? type : existing[0].type,
        priority !== undefined ? priority : existing[0].priority,
        id,
        req.user.id
      ]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM requirements WHERE id = ?',
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[TestCase] PUT requirement error:', err);
    res.status(500).json({ error: '更新需求失败' });
  }
});

// DELETE /api/test-case/requirements/:id — 删除需求
router.delete('/requirements/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute(
      'DELETE FROM requirements WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '需求不存在' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[TestCase] DELETE requirement error:', err);
    res.status(500).json({ error: '删除需求失败' });
  }
});

// ==================== 测试用例管理路由 ====================

// GET /api/test-case/test-cases — 获取测试用例列表，支持 ?product_id=xxx 和 ?requirement_id=xxx 筛选，按 created_at DESC 排序
router.get('/test-cases', authMiddleware, async (req, res) => {
  try {
    const { product_id, requirement_id } = req.query;
    let sql = `
      SELECT * FROM test_cases
      WHERE user_id = ?
    `;
    const params = [req.user.id];

    if (product_id) {
      sql += ' AND product_id = ?';
      params.push(product_id);
    }

    if (requirement_id) {
      sql += ' AND requirement_id = ?';
      params.push(requirement_id);
    }

    sql += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[TestCase] GET test-cases error:', err);
    res.status(500).json({ error: '获取测试用例列表失败' });
  }
});

// POST /api/test-case/test-cases — 创建测试用例
router.post('/test-cases', authMiddleware, async (req, res) => {
  try {
    // 支持前端字段名到数据库字段名的映射
    const { requirement_id, product_id, title, description, preconditions, precondition, steps, expected_result, expected, actual_result, actual, priority, type, passed } = req.body;

    // 验证必填字段
    if (!title || !title.trim()) {
      return res.status(400).json({ error: '测试用例标题不能为空' });
    }
    if (!requirement_id) {
      return res.status(400).json({ error: '需求 ID 不能为空' });
    }
    if (!product_id) {
      return res.status(400).json({ error: '产品 ID 不能为空' });
    }

    // 验证需求属于当前用户
    const [requirements] = await pool.execute(
      'SELECT id FROM requirements WHERE id = ? AND user_id = ?',
      [requirement_id, req.user.id]
    );
    if (requirements.length === 0) {
      return res.status(403).json({ error: '需求不存在或无权访问' });
    }

    // 验证产品属于当前用户
    const [products] = await pool.execute(
      'SELECT id FROM products WHERE id = ? AND user_id = ?',
      [product_id, req.user.id]
    );
    if (products.length === 0) {
      return res.status(403).json({ error: '产品不存在或无权访问' });
    }

    const [result] = await pool.execute(
      `INSERT INTO test_cases (user_id, requirement_id, product_id, title, description, preconditions, steps, expected_result, actual_result, passed, priority, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, requirement_id, product_id, title.trim(), description || null, preconditions || precondition || null, steps || null, expected_result || expected || null, actual_result || actual || null, passed ? 1 : 0, priority || null, type || null]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM test_cases WHERE id = ?',
      [result.insertId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[TestCase] POST test-case error:', err);
    res.status(500).json({ error: '创建测试用例失败' });
  }
});

// PUT /api/test-case/test-cases/:id — 更新测试用例
router.put('/test-cases/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    // 支持前端字段名到数据库字段名的映射
    const { title, description, preconditions, precondition, steps, expected_result, expected, actual_result, actual, priority, type, passed } = req.body;

    // 验证测试用例属于当前用户
    const [existing] = await pool.execute(
      'SELECT * FROM test_cases WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: '测试用例不存在' });
    }

    await pool.execute(
      `UPDATE test_cases
       SET title = ?, description = ?, preconditions = ?, steps = ?, expected_result = ?, actual_result = ?, passed = ?, priority = ?, type = ?
       WHERE id = ? AND user_id = ?`,
      [
        title !== undefined ? title.trim() : existing[0].title,
        description !== undefined ? (description || null) : existing[0].description,
        preconditions !== undefined ? (preconditions || precondition || null) : existing[0].preconditions,
        steps !== undefined ? (steps || null) : existing[0].steps,
        expected_result !== undefined ? (expected_result || expected || null) : existing[0].expected_result,
        actual_result !== undefined ? (actual_result || actual || null) : existing[0].actual_result,
        passed !== undefined ? (passed ? 1 : 0) : existing[0].passed,
        priority !== undefined ? priority : existing[0].priority,
        type !== undefined ? type : existing[0].type,
        id,
        req.user.id
      ]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM test_cases WHERE id = ?',
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[TestCase] PUT test-case error:', err);
    res.status(500).json({ error: '更新测试用例失败' });
  }
});

// DELETE /api/test-case/test-cases/:id — 删除测试用例
router.delete('/test-cases/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute(
      'DELETE FROM test_cases WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '测试用例不存在' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[TestCase] DELETE test-case error:', err);
    res.status(500).json({ error: '删除测试用例失败' });
  }
});

// ==================== AI 生成测试用例路由 ====================

// POST /api/test-case/generate — 根据需求 AI 生成测试用例
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { requirement_id, product_id, prompt: extraPrompt } = req.body;

    // 验证必填字段
    if (!requirement_id) {
      return res.status(400).json({ error: '需求 ID 不能为空' });
    }
    if (!product_id) {
      return res.status(400).json({ error: '产品 ID 不能为空' });
    }

    // 验证需求属于当前用户
    const [requirements] = await pool.execute(
      'SELECT * FROM requirements WHERE id = ? AND user_id = ?',
      [requirement_id, req.user.id]
    );
    if (requirements.length === 0) {
      return res.status(403).json({ error: '需求不存在或无权访问' });
    }
    const requirement = requirements[0];

    // 验证产品属于当前用户
    const [products] = await pool.execute(
      'SELECT * FROM products WHERE id = ? AND user_id = ?',
      [product_id, req.user.id]
    );
    if (products.length === 0) {
      return res.status(403).json({ error: '产品不存在或无权访问' });
    }
    const product = products[0];

    // 构建 AI 提示词
    const systemPrompt = '你是一个专业的测试工程师，根据产品需求生成详细的测试用例。请返回 JSON 数组格式，每个测试用例包含以下字段：title（标题）、description（描述）、preconditions（前置条件）、steps（测试步骤）、expected_result（期望结果）、priority（优先级：高/中/低）、type（测试类型：功能/性能/安全/兼容性/用户体验）。只返回 JSON 数组，不要加任何其他文字或 markdown 代码块。';

    const userPrompt = `请根据以下需求生成测试用例：

产品：${product.name}
需求标题：${requirement.title}
需求描述：${requirement.description || '无'}
需求类型：${requirement.type || '未指定'}
需求优先级：${requirement.priority || '未指定'}
${extraPrompt ? `\n额外要求：${extraPrompt}` : ''}

请生成覆盖正常场景、边界情况和异常场景的测试用例。`;

    // 调用 OpenClaw Gateway API
    const cmd = `curl -s --max-time 120 -X POST ${OPENCLAW_GATEWAY_URL}/v1/chat/completions \
      -H "Authorization: Bearer ${OPENCLAW_AUTH_TOKEN}" \
      -H "Content-Type: application/json" \
      -d '${JSON.stringify({
        model: "kat-coder-pro-v2/ep-qubph3-1775115536595397049",
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      }).replace(/'/g, "'\\''")}'`;

    // 使用 spawn 同步等待 AI 返回结果
    const result = await new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', cmd]);
      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`curl 命令执行失败，退出码: ${code}\n错误输出: ${errorOutput}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });

    // 解析 AI 返回的 JSON
    let testCases = [];
    try {
      const jsonStr = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      testCases = JSON.parse(jsonStr);
      if (!Array.isArray(testCases)) {
        testCases = [];
      }
    } catch (parseErr) {
      console.error('[TestCase] AI 返回内容解析失败:', parseErr, '\n原始输出:', result);
      return res.status(500).json({ error: 'AI 生成的测试用例格式无效', raw_output: result });
    }

    if (testCases.length === 0) {
      return res.status(500).json({ error: 'AI 未能生成有效的测试用例' });
    }

    // 将 AI 生成的测试用例存入数据库
    const insertedCases = [];
    for (const tc of testCases) {
      const [result] = await pool.execute(
        `INSERT INTO test_cases 
         (user_id, requirement_id, product_id, title, description, preconditions, steps, expected_result, priority, type, ai_generated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          req.user.id,
          requirement_id,
          product_id,
          tc.title || '未命名测试用例',
          tc.description || null,
          tc.preconditions || null,
          tc.steps || null,
          tc.expected_result || null,
          tc.priority || '中',
          tc.type || '功能'
        ]
      );

      // 获取插入的记录
      const [rows] = await pool.execute(
        'SELECT * FROM test_cases WHERE id = ?',
        [result.insertId]
      );
      if (rows.length > 0) {
        insertedCases.push(rows[0]);
      }
    }

    res.json({
      success: true,
      message: `成功生成 ${insertedCases.length} 个测试用例`,
      count: insertedCases.length,
      test_cases: insertedCases
    });
  } catch (err) {
    console.error('[TestCase] AI 生成测试用例错误:', err);
    res.status(500).json({ error: 'AI 生成测试用例失败: ' + (err.message || '未知错误') });
  }
});

module.exports = router;
