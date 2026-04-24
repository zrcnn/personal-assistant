const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'pa_jwt_secret_2026_ne';

class MessageWS {
  constructor() {
    this._wss = null;
    this._clients = new Map(); // userId -> Set<ws>
  }

  attach(server) {
    this._wss = new WebSocket.Server({ server, path: '/ws/messages' });

    this._wss.on('connection', (ws, req) => {
      // Extract token from query
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(4001, 'Missing token');
        return;
      }

      let userId;
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.userId || decoded.id;
      } catch (err) {
        ws.close(4002, 'Invalid token');
        return;
      }

      // Store connection
      if (!this._clients.has(userId)) {
        this._clients.set(userId, new Set());
      }
      this._clients.get(userId).add(ws);

      ws.on('close', () => {
        const set = this._clients.get(userId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) this._clients.delete(userId);
        }
      });

      ws.on('pong', () => { ws.isAlive = true; });
    });

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (!this._wss) return;
      this._wss.clients.forEach(ws => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this._wss.on('close', () => clearInterval(heartbeat));

    console.log('[MessageWS] WebSocket server attached at /ws/messages');
  }

  broadcast(userId, data) {
    const set = this._clients.get(userId);
    if (!set) return;
    const payload = JSON.stringify(data);
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  broadcastToGroup(groupMembers, data) {
    // groupMembers: array of userIds
    const payload = JSON.stringify(data);
    for (const uid of groupMembers) {
      const set = this._clients.get(uid);
      if (!set) continue;
      for (const ws of set) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  }
}

const messageWs = new MessageWS();
module.exports = messageWs;
