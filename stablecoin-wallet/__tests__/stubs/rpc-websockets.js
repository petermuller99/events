// Test-only stand-in: @solana/web3.js imports this WebSocket client at load time,
// but the tests only use its offline helpers (keys, messages, transactions).
class CommonClient {}
class WebSocket {}
module.exports = { CommonClient, WebSocket };
