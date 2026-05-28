/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
const express = require('express');
const bodyParser = require('body-parser');
const { control4Sockets } = require('./index');
const path = require('path');
const crypto = require('crypto');
require("dotenv").config();

// AES encryption settings
const AES_KEY = Buffer.from(process.env.AES_KEY); // 32 bytes = AES-256
const iv = Buffer.from(process.env.AES_IV); // 16 bytes 

const app = express();
const PORT = process.env.API_SERVER_PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// POST endpoint to send message to all Control4 drivers
app.post('/send-to-control4', (req, res) => {
  let message = req.body.message;
  if (!message) {
    return res.status(400).json({ error: 'Message is required in request body' });
  }

  if (typeof message === 'object') {
    message = JSON.stringify(message);
  }
  if (control4Sockets.size === 0) {
    return res.status(200).json({ message: 'No Control4 drivers connected' });
  }
  control4Sockets.forEach((socket, connectionId) => {
    if (socket.destroyed) {
      control4Sockets.delete(connectionId);
      return;
    }

    try {
      const encryptedBuffer = encryptPayload(message); 
      socket.write(`${encryptedBuffer}\r\n`);
      console.log(`Message sent to ${connectionId}`);
    } catch (error) {
      console.error(`Failed to write to ${connectionId}:`, error.message);
      socket.destroy();
      control4Sockets.delete(connectionId);
    }
  });

  res.status(200).json({ message: 'Message sent to all Control4 drivers' });
});

function encryptPayload(payload) {
  const cipher = crypto.createCipheriv('aes-256-cbc', AES_KEY, iv);
  let encrypted = cipher.update(payload, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

app.get('/change-global-keys', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ChangeGlobalKeys.html'));
});

app.get('/change-contract', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ChangeContract.html'));
});

app.listen(PORT, () => {
  console.log(`API server is running on http://localhost:${PORT}`);
});
