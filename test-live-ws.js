const WebSocket = require('ws');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
  console.log('Skipping test: No valid API key in .env');
  process.exit(0);
}

const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

console.log('Connecting to Live API...');
const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('Connected to Live API!');
  ws.send(JSON.stringify({
    setup: {
      model: "models/gemini-2.0-flash-exp",
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log('Received message:', JSON.stringify(msg).substring(0, 100) + '...');
  if (msg.serverContent && msg.serverContent.turnComplete) {
      console.log('Setup successfully completed!');
      ws.close();
  }
  if (msg.setupComplete) {
      console.log('Setup Complete event received!');
      ws.close();
  }
});

ws.on('error', (err) => {
  console.error('WebSocket Error:', err);
});

ws.on('close', (code, reason) => {
  console.log(`WebSocket Closed: ${code} ${reason}`);
});
