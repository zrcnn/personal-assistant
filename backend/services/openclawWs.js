// OpenClaw WebSocket client - DISABLED (device pairing required)
// PA Backend now uses direct HTTP API calls to the model provider

const WS_URL = 'ws://127.0.0.1:18789';

// Stub implementation - disabled
class OpenClawWS {
  constructor() {
    console.log('[OpenClawWS] Disabled - device pairing not configured. Use HTTP API instead.');
  }
  connect() { /* no-op */ }
  close() { /* no-op */ }
  get connected() { return false; }
  getSessionKey(conversationId) { return `agent:main:pa:direct:conv_${conversationId}`; }
  removeSessionMapping() {}
  async sendChat() { throw new Error('OpenClawWS disabled - use HTTP API instead'); }
  async resetSession() {}
}

const instance = new OpenClawWS();
module.exports = instance;
