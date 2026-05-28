/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
const TuyaWebsocket = require('../dist').default;
const net = require('net');

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

tcpServer.listen(8081, () => {
  console.log('TCP server listening on port 8081 for Control4 drivers');
});

// Initialize Tuya WebSocket client
const client = new TuyaWebsocket({
  accessId: "juaqt8pwwyk985h7qhck",
  accessKey: "9c3f300f43184af68b1bb78354c63412",
  url: TuyaWebsocket.URL.US,
  env: TuyaWebsocket.env.TEST,
  maxRetryTimes: 100,
});

// Handle incoming messages from Tuya
client.message((ws, message) => {
  client.ackMessage(message.messageId);
  const properties = message.payload?.data?.bizData;
  if (!properties) return;

  const payload = JSON.stringify(properties);

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
      socket.write(`${payload}\r\n`);
      console.log(`Forwarded to ${connectionId}: ${payload}`);
    } catch (error) {
      console.error(`Failed to write to ${connectionId}:`, error.message);
      socket.destroy();
      control4Sockets.delete(connectionId);
    }
  });
});

// Optional handlers (can be uncommented for debugging)
// client.open(() => console.log('WebSocket opened'));
// client.reconnect(() => console.log('WebSocket reconnect'));
// client.ping(() => console.log('WebSocket ping'));
// client.pong(() => console.log('WebSocket pong'));
client.close((ws, ...args) => {
  console.log('WebSocket closed:', ...args);
});
client.error((ws, error) => {
  console.error('WebSocket error:', error);
});

// Start Tuya WebSocket client
client.start();