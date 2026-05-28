/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
const TuyaWebsocket = require('../dist').default;
const net = require('net');
const crypto = require('crypto');
require("dotenv").config();

// AES encryption settings
const AES_KEY = Buffer.from(process.env.AES_KEY); // 32 bytes = AES-256
const iv = Buffer.from(process.env.AES_IV); // 16 bytes 

// Map to track Control4 socket connections
const control4Sockets = new Map();

// Create TCP server for Control4 driver connections
const tcpServer = net.createServer((socket) => {
  const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`New Control4 socket connected: ${connectionId}`);
  control4Sockets.set(connectionId, socket);

  socket.on('close', () => {
    console.log(`Socket closed: ${connectionId}`);
    control4Sockets.delete(connectionId);
  });

  socket.on('error', (err) => {
    console.error(`Socket error on ${connectionId}: ${err.message}`);
    socket.destroy();
    control4Sockets.delete(connectionId);
  });
});
module.exports = {
  control4Sockets
};
tcpServer.listen(process.env.TCP_SERVER_PORT, () => {
  console.log('TCP server listening on port 8081 for Control4 drivers'+process.env.TUYA_ACCESS_KEY);
});

// Initialize Tuya WebSocket client
const client = new TuyaWebsocket({
  accessId: process.env.TUYA_ACCESS_ID,
  accessKey: process.env.TUYA_ACCESS_KEY,
  url: TuyaWebsocket.URL.US,
  env: TuyaWebsocket.env.PROD,
  maxRetryTimes: 100,
});

// Encryption function
function encryptPayload(payload) {
  const cipher = crypto.createCipheriv('aes-256-cbc', AES_KEY, iv);
  let encrypted = cipher.update(payload, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

// Handle incoming messages from Tuya
client.message((ws, message) => {
  console.log('test:');
  client.ackMessage(message.messageId);
  let properties = message.payload?.data;
  if (!properties) return;
  if (properties.status) {
    properties.properties = properties.status;
    delete properties.status;
  }
  if (properties.bizData) {
    properties = properties.bizData;
  }

  const payload = JSON.stringify(properties);
  console.log('Received message from Tuya:', payload);
  const encryptedBuffer = encryptPayload(payload);

  if (control4Sockets.size === 0) {
    console.log('No Control4 drivers connected');
    return;
  }

  control4Sockets.forEach((socket, connectionId) => {
    if (socket.destroyed) {
      control4Sockets.delete(connectionId);
      return;
    }

    try {
      socket.write(`${encryptedBuffer}\r\n`);
      console.log(`Encrypted & forwarded to ${connectionId}`);
    } catch (error) {
      console.error(`Failed to write to ${connectionId}:`, error.message);
      socket.destroy();
      control4Sockets.delete(connectionId);
    }
  });
});

// Optional handlers
client.close((ws, ...args) => {
  console.log('WebSocket closed:', ...args);
});
client.error((ws, error) => {
  console.error('WebSocket error:', error);
});

// Start Tuya WebSocket client
client.start();

