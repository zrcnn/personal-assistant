const jwt = require('jsonwebtoken');

const JWT_SECRET = 'pa_jwt_secret_2026_ne';
const JWT_EXPIRES_IN = '7d';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function authMiddleware(req, res, next) {
  // Support token via Authorization header OR query param (for EventSource/SSE)
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '令牌无效或已过期' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.username !== 'zrc') {
    return res.status(403).json({ error: '无权限访问' });
  }
  next();
}

module.exports = { generateToken, authMiddleware, adminOnly, JWT_SECRET };
