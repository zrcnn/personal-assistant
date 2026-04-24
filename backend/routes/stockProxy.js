const express = require('express');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// All stock-proxy routes require auth
router.use(authMiddleware);

// Proxy all requests to Python stock service, injecting user_id
router.all('/*', async (req, res) => {
  const path = req.params[0]; // e.g. "watchlist" or "stock/search"
  const targetUrl = `http://127.0.0.1:8091/api/${path}`;

  try {
    const http = require('http');

    const url = new URL(targetUrl);
    // Copy original query params then inject user_id
    if (req.query) {
      Object.entries(req.query).forEach(([key, value]) => {
        if (key !== 'user_id') url.searchParams.set(key, value);
      });
    }
    url.searchParams.set('user_id', req.user.id);

    // For POST/DELETE, also merge body if needed
    const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(req.method);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', (chunk) => { data += chunk; });
      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode).set(proxyRes.headers).send(data);
      });
    });

    proxyReq.on('error', (err) => {
      console.error('[StockProxy] Error:', err.message);
      res.status(502).json({ error: '股票服务不可用' });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      res.status(504).json({ error: '股票服务超时' });
    });

    if (isBodyMethod && req.body) {
      proxyReq.write(JSON.stringify(req.body));
    }
    proxyReq.end();
  } catch (err) {
    console.error('[StockProxy] Error:', err.message);
    res.status(500).json({ error: '代理请求失败' });
  }
});

module.exports = router;
