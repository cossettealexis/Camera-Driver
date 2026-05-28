// server.js
const WebSocket = require('ws');
const { spawn } = require('child_process');


// Create a WebSocket server on port 3050 (choose any free port).
const wss = new WebSocket.Server({ port: 3050 }, () => {
  console.log('WebSocket server started on ws://localhost:3050');
});


wss.on('connection', (ws, req) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const urlBase64 = parsedUrl.searchParams.get('url');
  const resolution = parsedUrl.searchParams.get('quality');
  if (!urlBase64) {
    ws.send(JSON.stringify({ error: 'Missing RTSP URL' }));
    ws.close();
    return;
  }
  const rtspUrl = Buffer.from(urlBase64, 'base64').toString('utf8');
  const scaleFilter = resolution === 'hd' ? 'scale=1280:720' : 'scale=640:360';
  console.log('Client connected');


  // Start ffmpeg to read the RTSP stream and output MPEG-TS to stdout.  
  const ffmpeg = spawn('ffmpeg', [
    '-rtsp_transport', 'tcp',
    '-fflags', 'nobuffer',
    '-flags', 'low_delay',
    '-analyzeduration', '0',
    '-probesize', '32',
    '-i', rtspUrl,
    '-vf', scaleFilter,
    '-codec:v', 'mpeg1video',
    '-b:v', resolution === 'hd' ? '1500k' : '400k',
    '-r', '25',
    '-bf', '0',
    '-codec:a', 'mp2',          // <--- enable audio encoding
    '-af', 'volume=30dB',
    '-b:a', '128k',             // audio bitrate
    '-ar', '44100',             // audio sample rate
    '-ac', '1',                 // mono audio (optional)
    '-f', 'mpegts',
    '-'                    // output to stdout
  ]);


  // When ffmpeg outputs data, send it to the WebSocket client.
  ffmpeg.stdout.on('data', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });


  // Log ffmpeg errors (optional).
  ffmpeg.stderr.on('data', (data) => {
    console.error('FFmpeg error:', data.toString());
  });


  ws.on('close', () => {
    console.log('Client disconnected');
    // Terminate ffmpeg when the client disconnects.
    ffmpeg.kill('SIGTERM');
  });
});